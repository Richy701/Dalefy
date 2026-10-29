import { useSavePerson } from "@/hooks/useSavePerson";
import { MergePeopleDialog } from "@/components/shared/MergePeopleDialog";
import { combinePeople, removePeopleById } from "@/lib/peopleDirectory";
import { useBulkPeopleImport } from "@/hooks/useBulkPeopleImport";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Drawer } from "vaul";
import { MagnifyingGlass, UserPlus, FileText, FileMinus, FileDashed, FileX, PaperPlaneTilt, Eye, X, User, Envelope, Briefcase, Upload, Check, Trash, DotsThree, DownloadSimple, ChatCircleText, DeviceMobile, Crown, SignOut, PencilSimple, SpinnerGap, LinkBreak, UsersThree, Images, Camera } from "@phosphor-icons/react";
import { BulkAddPeopleDialog } from "@/components/shared/BulkAddPeopleDialog";
import { AddPhotosDialog } from "@/components/shared/AddPhotosDialog";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { TravelerDetails } from "@/components/shared/TravelerDetails";
import { cleanProfile } from "@/lib/travelerProfile";
import { uploadTravelerPhoto } from "@/lib/travelerPhotos";
import { tripTravelerOf } from "@/lib/travelerSync";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTrips } from "@/context/TripsContext";
import { useDirectoryTravelers, useComplianceRecords } from "@/context/directory";
import { useNotifications } from "@/context/NotificationContext";
import { MOCK_USERS } from "@/data/mock-users";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComplianceDocSheet } from "@/components/shared/ComplianceDocSheet";
import { MessageDialog } from "@/components/shared/MessageDialog";
import { fetchTripMembers, APP_MEMBERS_ERROR, deleteAppUsers, removeUserFromTrip, updateTripMemberRole, renameAppUser, unlinkTraveler, fetchPushLog, type TripMember, type TripMemberRole, type PushLogEntry } from "@/services/firebaseTrips";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import { withoutTravelers } from "@/lib/removeTravelers";
import { isFirebaseConfigured } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useDemo } from "@/hooks/useDemo";
import { usePermissions } from "@/hooks/usePermissions";
import { DemoUpgradeDialog } from "@/components/shared/DemoUpgradeDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { ComplianceDoc, Trip, TravelerProfile, User as UserType } from "@/types";

type QuickFilter = "all" | "app" | "not-app" | "docs";

// One palette per status, shared meaning with ComplianceDocSheet: done / waiting / problem
const DOC_STATUS_CONFIG: Record<ComplianceDoc["status"], { color: string; bg: string; icon: typeof FileText }> = {
  Signed: { color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: FileText },
  Pending: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-500/10", icon: FileDashed },
  Expired: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: FileX },
  "Not Required": { color: "text-muted-foreground", bg: "bg-secondary", icon: FileMinus },
};

/** One app user is one person: their account if they signed in, otherwise their device */
const personKey = (m: TripMember) => m.uid || m.device_id;
const initialsOf = (name: string) => name.trim().split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "?";

/** Everything known about one person, whichever way they reached us: a trip's list, the directory, or the app */
interface Person {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  /** Trips whose traveller list has them */
  trips: { id: string; name: string; start: string; invitedAt?: string }[];
  compliance: ComplianceDoc[];
  /** Their app accounts: the account if they signed in, else the device */
  appKeys: string[];
  /** Trips they've joined in the app, and their role there */
  appTrips: { id: string; name: string; role: TripMemberRole }[];
  lastSeen: string | null;
  platform: string | null;
  avatar: string | null;
  /** Joined in the app without picking their name from a trip's list */
  appOnly: boolean;
  profile?: TravelerProfile;
}

function appFacts(members: TripMember[]) {
  const appTrips: Person["appTrips"] = [];
  let lastSeen: string | null = null, platform: string | null = null, avatar: string | null = null;
  for (const m of members) {
    if (!appTrips.some(t => t.id === m.trip_id)) appTrips.push({ id: m.trip_id, name: m.trip_name, role: (m.role || "traveler") as TripMemberRole });
    if (m.last_seen_at && (!lastSeen || m.last_seen_at > lastSeen)) { lastSeen = m.last_seen_at; platform = m.platform ?? null; }
    if (!avatar && m.avatar) avatar = m.avatar;
  }
  return { appKeys: [...new Set(members.map(personKey))], appTrips, lastSeen, platform, avatar };
}

/** On the app (and when they last opened it), invited by email, or neither */
function appStatus(p: Person): { label: string; tone: "on" | "invited" | "off" } {
  if (p.appKeys.length) {
    const device = p.platform === "ios" ? " on iPhone" : p.platform === "android" ? " on Android" : "";
    return { label: p.lastSeen ? `Active ${timeAgo(p.lastSeen)}${device}` : "Joined", tone: "on" };
  }
  const invited = p.trips.map(t => t.invitedAt).filter((v): v is string => !!v).sort().pop();
  if (invited) return { label: `Invited ${timeAgo(invited)}`, tone: "invited" };
  return { label: "Not on the app", tone: "off" };
}

function docSummary(docs: ComplianceDoc[]): { label: string; tone: "ok" | "pending" | "expired" | "none" } {
  const needed = docs.filter(d => d.status !== "Not Required");
  if (!needed.length) return { label: "None", tone: "none" };
  const expired = needed.filter(d => d.status === "Expired").length;
  const pending = needed.filter(d => d.status === "Pending").length;
  if (expired) return { label: `${expired} expired`, tone: "expired" };
  if (pending) return { label: `${pending} to sign`, tone: "pending" };
  return { label: "All signed", tone: "ok" };
}

const TONE_TEXT = {
  on: "text-emerald-700 dark:text-emerald-400",
  invited: "text-amber-700 dark:text-amber-400",
  off: "text-muted-foreground",
  ok: "text-emerald-700 dark:text-emerald-400",
  pending: "text-amber-700 dark:text-amber-400",
  expired: "text-red-600 dark:text-red-400",
  none: "text-muted-foreground",
} as const;

function Avatar({ person, size = "h-9 w-9" }: { person: Pick<Person, "initials" | "avatar" | "name">; size?: string }) {
  return <PersonAvatar avatar={person.avatar} initials={person.initials} name={person.name} className={size} />;
}

export function TravelersPage() {
  const saveBulkPeople = useBulkPeopleImport();
  const savePerson = useSavePerson();
  const [personSaving, setPersonSaving] = useState(false);
  const [personError, setPersonError] = useState("");
  const [mergePeople, setMergePeople] = useState<UserType[] | null>(null);
  const { trips, updateTrip, updateEvent } = useTrips();
  // App users are read per trip (the rules only show staff the people on their own trips)
  const tripIds = useMemo(() => trips.map(t => t.id), [trips]);
  const { showToast } = useNotifications();
  const { user } = useAuth();
  const isDemoUser = !user || user.id === "demo" || (user.id?.length ?? 0) <= 20;
  const { demoGate, upgradeOpen, setUpgradeOpen } = useDemo();
  const { isViewer } = usePermissions();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tripFilter, setTripFilter] = useState("all");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tripIds: string[]; tripId?: string; people: string[] } | null>(null);

  const [complianceOverrides, setComplianceOverrides] = useComplianceRecords();
  const [customTravelers, setCustomTravelers] = useDirectoryTravelers();

  // Add Traveler drawer form
  const [drawerForm, setDrawerForm] = useState({ name: "", email: "", role: "", status: "Active" as UserType["status"] });

  const [appUsers, setAppUsers] = useState<TripMember[]>([]);
  const [appUsersLoading, setAppUsersLoading] = useState(false);
  const [appUsersError, setAppUsersError] = useState<string | null>(null);
  const [appUsersReload, setAppUsersReload] = useState(0);
  const [pushLogFor, setPushLogFor] = useState<{ personId: string; entries: PushLogEntry[] } | null>(null);
  const [pushLogReload, setPushLogReload] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState<{ action: () => Promise<void>; title: string; description: string; confirmLabel?: string; destructive?: boolean } | null>(null);
  // Someone who joined in the app under the wrong name (the app once adopted a listed traveller's name)
  const [renameTarget, setRenameTarget] = useState<Person | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // Name and email being edited in the person panel
  const [editingPerson, setEditingPerson] = useState<{ name: string; email: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    setAppUsersLoading(true);
    setAppUsersError(null);
    fetchTripMembers(tripIds)
      .then(list => { if (!cancelled) setAppUsers(list); })
      .catch(() => { if (!cancelled) setAppUsersError(`${APP_MEMBERS_ERROR} Check your connection and try again.`); })
      .finally(() => { if (!cancelled) setAppUsersLoading(false); });
    return () => { cancelled = true; };
  }, [appUsersReload, tripIds]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDoc, setSheetDoc] = useState<ComplianceDoc | null>(null);
  const [sheetTraveler, setSheetTraveler] = useState("");
  const [sheetUserId, setSheetUserId] = useState("");

  // Upload document state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadAssignees, setUploadAssignees] = useState<string[]>([]);

  // Which trips each traveller has picked their name on in the app
  const appTripsByTraveler = useMemo(() => {
    const linked = new Map<string, Set<string>>();
    for (const m of appUsers) {
      if (!m.linked_traveler_id) continue;
      if (!linked.has(m.linked_traveler_id)) linked.set(m.linked_traveler_id, new Set());
      linked.get(m.linked_traveler_id)!.add(m.trip_id);
    }
    return linked;
  }, [appUsers]);

  const travelers = useMemo(() => {
    if (isDemoUser) {
      const seen = new Set<string>();
      const allUsers = [...MOCK_USERS, ...customTravelers].filter(u => {
        const key = u.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return allUsers.map(user => {
        const assignedTrips: string[] = [];
        trips.forEach(t => {
          const byId = t.travelerIds?.includes(user.id);
          const byName = t.attendees?.toLowerCase().includes(user.name.toLowerCase());
          if ((byId || byName) && !assignedTrips.includes(t.name)) {
            assignedTrips.push(t.name);
          }
        });
        const compliance = complianceOverrides[user.id] || user.compliance || [];
        return { ...user, assignedTrips, compliance };
      });
    }

    const copies: UserType[] = [];
    for (const t of trips) {
      if (!t.travelers) continue;
      for (const tv of t.travelers) {
        copies.push({
          id: tv.id,
          name: tv.name,
          email: tv.email || "",
          role: "Traveler",
          avatar: tv.avatar ?? "",
          initials: tv.initials,
          // Worked out below from the trips they're actually on
          status: "Offline",
        });
      }
    }
    return combinePeople([...copies, ...customTravelers]).map(user => {
      const assignedTrips: string[] = [];
      trips.forEach(t => {
        const byId = t.travelerIds?.includes(user.id);
        const byName = t.attendees?.toLowerCase().includes(user.name.toLowerCase());
        if ((byId || byName) && !assignedTrips.includes(t.name)) {
          assignedTrips.push(t.name);
        }
      });
      const compliance = complianceOverrides[user.id] || user.compliance || [];
      // In the app on a trip only if they picked their name on that trip, not on any trip at all
      const onTrips = trips.filter(t => t.travelerIds?.includes(user.id) || t.travelers?.some(tv => tv.id === user.id));
      const appTrips = onTrips.filter(t => appTripsByTraveler.get(user.id)?.has(t.id)).length;
      const status: UserType["status"] = appTrips > 0 ? "Active" : user.status === "Away" ? "Away" : "Offline";
      return { ...user, assignedTrips, compliance, status, appTrips, tripCount: onTrips.length };
    });
  }, [trips, complianceOverrides, customTravelers, isDemoUser, appTripsByTraveler]);

  // One row per person: their entry on trips and in the directory, joined up with their app account
  const people = useMemo<Person[]>(() => {
    const linkedBy = new Map<string, TripMember[]>();
    for (const m of appUsers) {
      if (m.linked_traveler_id) linkedBy.set(m.linked_traveler_id, [...(linkedBy.get(m.linked_traveler_id) ?? []), m]);
    }
    const rows: Person[] = travelers.map(t => {
      const onTrips = trips.filter(tr => tr.travelers?.some(tv => tv.id === t.id) || tr.travelerIds?.includes(t.id));
      const facts = appFacts(linkedBy.get(t.id) ?? []);
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        initials: t.initials || initialsOf(t.name),
        role: t.role,
        trips: onTrips.map(tr => ({ id: tr.id, name: tr.name, start: tr.start, invitedAt: tr.travelers?.find(tv => tv.id === t.id)?.invitedAt })),
        compliance: t.compliance ?? [],
        ...facts,
        avatar: t.avatar || facts.avatar,
        appOnly: false,
        profile: t.profile,
      };
    });
    // App accounts that never picked a name are still people on the trip
    const byKey = new Map<string, TripMember[]>();
    for (const m of appUsers) {
      if (m.linked_traveler_id && travelers.some(t => t.id === m.linked_traveler_id)) continue;
      byKey.set(personKey(m), [...(byKey.get(personKey(m)) ?? []), m]);
    }
    for (const [key, members] of byKey) {
      const owner = rows.find(r => r.appKeys.includes(key));
      if (owner) {
        const extra = appFacts(members);
        for (const t of extra.appTrips) if (!owner.appTrips.some(a => a.id === t.id)) owner.appTrips.push(t);
        continue;
      }
      const name = members.find(m => m.name)?.name || "Unnamed traveller";
      rows.push({
        id: `app:${key}`,
        name,
        email: members.find(m => m.email)?.email ?? "",
        initials: initialsOf(name),
        role: "Traveller",
        trips: [],
        compliance: [],
        ...appFacts(members),
        appOnly: true,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [travelers, appUsers, trips]);

  const onTrip = useCallback((p: Person, tripId: string) => p.trips.some(t => t.id === tripId) || p.appTrips.some(t => t.id === tripId), []);

  // The search and trip apply first, so the quick filter counts match what's on screen
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p => {
      if (tripFilter !== "all" && !onTrip(p, tripFilter)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        || p.trips.some(t => t.name.toLowerCase().includes(q)) || p.appTrips.some(t => t.name.toLowerCase().includes(q))
        || p.compliance.some(d => d.name.toLowerCase().includes(q));
    });
  }, [people, search, tripFilter, onTrip]);

  const quickCounts = useMemo(() => ({
    all: scoped.length,
    app: scoped.filter(p => p.appKeys.length).length,
    "not-app": scoped.filter(p => !p.appKeys.length).length,
    docs: scoped.filter(p => ["pending", "expired"].includes(docSummary(p.compliance).tone)).length,
  }), [scoped]);

  const visible = useMemo(() => scoped.filter(p =>
    quick === "all" ? true
      : quick === "app" ? p.appKeys.length > 0
      : quick === "not-app" ? p.appKeys.length === 0
      : ["pending", "expired"].includes(docSummary(p.compliance).tone),
  ), [scoped, quick]);

  const openPerson = people.find(p => p.id === openPersonId) ?? null;
  const selectedPeople = visible.filter(p => selected.has(p.id));

  // What this person has been sent, loaded when their panel opens
  useEffect(() => {
    const person = people.find(p => p.id === openPersonId);
    if (!openPersonId || !person?.appKeys.length) return;
    const mine = appUsers.filter(m => person.appKeys.includes(personKey(m)));
    const keys = [...person.appKeys, ...mine.flatMap(m => [m.device_id, m.uid ?? ""])];
    let cancelled = false;
    fetchPushLog(keys, mine.map(m => m.trip_id))
      .then(entries => { if (!cancelled) setPushLogFor({ personId: openPersonId, entries }); })
      .catch(() => { if (!cancelled) setPushLogFor({ personId: openPersonId, entries: [] }); });
    return () => { cancelled = true; };
  }, [openPersonId, people, appUsers, pushLogReload]);
  const pushLog = pushLogFor?.personId === openPersonId ? pushLogFor.entries : null;

  /** Message whoever's chosen, about a trip they're on in the app */
  const messagePeople = useCallback((ps: Person[]) => {
    const keys = [...new Set(ps.flatMap(p => p.appKeys))];
    const shared = trips.filter(t => ps.some(p => p.appTrips.some(a => a.id === t.id)));
    if (!keys.length || !shared.length) { showToast(ps.length === 1 ? `${ps[0].name} isn't on the app yet` : "None of them are on the app yet"); return; }
    const preferred = tripFilter !== "all" && shared.some(t => t.id === tripFilter) ? tripFilter : shared[0].id;
    setMessage({ tripIds: shared.map(t => t.id), tripId: preferred, people: keys });
  }, [trips, tripFilter, showToast]);

  /** A new name or email for a directory person reaches the directory, every trip's list, and the published copies */
  const editPerson = async (p: Person, rawName: string, rawEmail: string) => {
    if (personSaving) return;
    const original = travelers.find(t => t.id === p.id); if (!original) return;
    setPersonSaving(true); setPersonError('');
    try {
      await savePerson(original, { name: rawName.trim().replace(/\s+/g, ' '), email: rawEmail.trim().toLowerCase() });
      setEditingPerson(null); showToast(`${rawName.trim()} updated`);
    } catch (error) { setPersonError(error instanceof Error ? error.message : 'Could not save. Your changes are still here.'); }
    finally { setPersonSaving(false); }
  };
  const applyPhotos = async (photos: Array<{ personId: string; url: string | null }>) => {
    for (const photo of photos) {
      const original = travelers.find(t => t.id === photo.personId);
      if (!original) throw new Error('This person is no longer available. Refresh and try again.');
      await savePerson(original, { avatar: photo.url || '' });
    }
  };
  const saveProfile = async (p: Person, profile: TravelerProfile | undefined) => {
    const original = travelers.find(t => t.id === p.id); if (!original) throw new Error('Person no longer available');
    await savePerson(original, { profile: profile ? cleanProfile(profile) || {} : {} });
    showToast(`${p.name}'s details saved`);
  };

  const changePhoto = useCallback(async (p: Person, file: File | null) => {
    if (!user?.id) return;
    setPhotoBusy(true);
    try {
      const url = file ? await uploadTravelerPhoto(user.id, p.id, file) : null;
      await applyPhotos([{ personId: p.id, url }]);
      showToast(url ? `Photo added for ${p.name}` : `Photo removed for ${p.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't upload that photo");
    } finally {
      setPhotoBusy(false);
    }
  }, [user, applyPhotos, showToast]);

  /** Onto a trip's traveller list from the panel, without leaving the directory */
  const addToTrip = useCallback((p: Person, trip: Trip) => {
    if (trip.travelers?.some(t => t.id === p.id)) return;
    updateTrip(trip.id, {
      travelerIds: [...(trip.travelerIds ?? []), p.id],
      travelers: [...(trip.travelers ?? []), tripTravelerOf(p)],
    });
    showToast(`${p.name} added to ${trip.name}`);
  }, [updateTrip, showToast]);

  /**
   * A directory entry and the app account that picked it part ways. The account keeps every trip and shows
   * under the name on its phone; the entry stays in the directory on its own. For when the wrong person
   * picked a name, or someone listed themselves under another name to test the app.
   */
  const unlinkApp = useCallback((p: Person) => {
    setPendingConfirm({
      title: "Unlink app account",
      description: `${p.name} in your directory and the app account linked to it become separate people. The app account keeps all its trips and appears under the name on its phone.`,
      confirmLabel: "Unlink",
      destructive: false,
      action: async () => {
        try {
          for (const t of p.appTrips) await unlinkTraveler(t.id, p.id);
          setAppUsers(prev => prev.map(m => (m.linked_traveler_id === p.id ? { ...m, linked_traveler_id: undefined } : m)));
          setOpenPersonId(null);
          showToast(`App account unlinked from ${p.name}`);
        } catch {
          showToast("Couldn't unlink the app account");
        }
      },
    });
  }, [showToast]);

  /** Off one trip: its traveller list, its events, and their app membership there */
  const removeFromTrip = useCallback((p: Person, tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    setPendingConfirm({
      title: "Remove from trip",
      description: `Take ${p.name} off ${trip?.name ?? "this trip"}? They come off its traveller list and events, and the trip leaves their app.`,
      action: async () => {
        if (trip && !p.appOnly) {
          const { updates, events } = withoutTravelers(trip, new Set([p.id]));
          updateTrip(tripId, updates);
          for (const ev of events) updateEvent(tripId, ev);
        }
        try {
          for (const key of p.appKeys) await removeUserFromTrip(key, tripId);
          setAppUsers(prev => prev.filter(m => !(p.appKeys.includes(personKey(m)) && m.trip_id === tripId)));
          showToast(`${p.name} removed from ${trip?.name ?? "the trip"}`);
        } catch {
          showToast("Removed from the list, but couldn't remove their app access");
        }
      },
    });
  }, [trips, updateTrip, updateEvent, showToast]);

  /** Gone everywhere: the directory, every trip's list and events, their documents and their app accounts */
  const deletePeople = useCallback((ps: Person[]) => {
    if (!ps.length) return;
    setPendingConfirm({
      title: ps.length === 1 ? `Delete ${ps[0].name}` : `Delete ${ps.length} people`,
      description: `They come off every trip's traveller list and events, out of your directory, and their app access ends. This can't be undone.`,
      action: async () => {
        const ids = new Set(ps.filter(p => !p.appOnly).map(p => p.id));
        for (const trip of trips) {
          const onIt = (trip.travelers ?? []).some(t => ids.has(t.id)) || (trip.travelerIds ?? []).some(id => ids.has(id))
            || (trip.publishedSnapshot?.travelers ?? []).some(t => ids.has(t.id));
          if (!onIt) continue;
          const { updates, events } = withoutTravelers(trip, ids);
          updateTrip(trip.id, updates);
          for (const ev of events) updateEvent(trip.id, ev);
        }
        setCustomTravelers(prev => removePeopleById(prev, ids));
        setComplianceOverrides(prev => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
        const keys = ps.flatMap(p => p.appKeys);
        let appFailed = false;
        if (keys.length) {
          try {
            await deleteAppUsers(keys, tripIds);
            setAppUsers(prev => prev.filter(m => !keys.includes(personKey(m))));
          } catch { appFailed = true; }
        }
        setSelected(new Set());
        setOpenPersonId(null);
        showToast(appFailed ? "Deleted, but couldn't end their app access. Try again." : ps.length === 1 ? `${ps[0].name} deleted` : `${ps.length} people deleted`);
      },
    });
  }, [trips, tripIds, updateTrip, updateEvent, setCustomTravelers, setComplianceOverrides, showToast]);

  const handleToggleRole = useCallback(async (keys: string[], tripId: string, currentRole: TripMemberRole) => {
    const newRole: TripMemberRole = currentRole === "leader" ? "traveler" : "leader";
    try {
      for (const key of keys) await updateTripMemberRole(key, tripId, newRole);
      setAppUsers(prev => prev.map(m => keys.includes(personKey(m)) && m.trip_id === tripId ? { ...m, role: newRole } : m));
      showToast(newRole === "leader" ? "Made trip leader" : "Now a traveller");
    } catch (err) {
      console.error("Role update failed:", err);
      showToast("Couldn't change their role");
    }
  }, [showToast]);

  const exportCSV = useCallback(() => {
    if (!visible.length) return;
    const rows = [["Name", "Email", "Phone", "Date of birth", "Nationality", "Dietary", "Emergency contact", "Trips", "App", "Documents"]];
    for (const p of visible) {
      const pr = p.profile ?? {};
      rows.push([p.name, p.email, pr.phone ?? "", pr.dateOfBirth ?? "", pr.nationality ?? "", pr.dietary ?? "", [pr.emergencyName, pr.emergencyPhone].filter(Boolean).join(" "), [...new Set([...p.trips, ...p.appTrips].map(t => t.name))].join("; "), appStatus(p).label, docSummary(p.compliance).label]);
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `travellers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${visible.length} ${visible.length === 1 ? "person" : "people"}`);
  }, [visible, showToast]);

  const handleAddTraveler = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoGate()) return;
    if (!drawerForm.name.trim() || !drawerForm.email.trim()) return;
    const newUser: UserType = {
      id: `custom-${Date.now()}`,
      name: drawerForm.name.trim(),
      email: drawerForm.email.trim(),
      role: drawerForm.role.trim() || "Team Member",
      avatar: "",
      initials: drawerForm.name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2),
      status: drawerForm.status,
      compliance: [],
    };
    if (personSaving) return;
    setPersonSaving(true); setPersonError('');
    try { await savePerson(newUser, {}); }
    catch (error) { setPersonError(error instanceof Error ? error.message : 'Could not save this person.'); return; }
    finally { setPersonSaving(false); }
    setDrawerForm({ name: "", email: "", role: "", status: "Active" });
    setInviteOpen(false);
    showToast(`${newUser.name} added to team`);
  }, [drawerForm, savePerson, showToast, demoGate, personSaving]);

  const openDocSheet = useCallback((userId: string, userName: string, doc: ComplianceDoc) => {
    setSheetUserId(userId);
    setSheetTraveler(userName);
    setSheetDoc(doc);
    setSheetOpen(true);
  }, []);

  const handleSign = useCallback((docName: string) => {
    const userId = sheetUserId;
    const user = travelers.find(t => t.id === userId);
    if (!user) return;

    const updatedDocs = user.compliance.map(d =>
      d.name === docName ? { ...d, status: "Signed" as const, date: new Date().toISOString().split("T")[0] } : d
    );

    setComplianceOverrides(prev => ({ ...prev, [userId]: updatedDocs }));
    showToast(`${docName} marked as signed for ${user.name}`);
  }, [sheetUserId, travelers, setComplianceOverrides, showToast]);

  const handleUploadDocument = useCallback(() => {
    if (!uploadDocName.trim() || uploadAssignees.length === 0) return;
    const docName = uploadDocName.trim();
    const newDoc: ComplianceDoc = { name: docName, status: "Pending", date: new Date().toISOString().split("T")[0] };
    setComplianceOverrides(prev => {
      const next = { ...prev };
      for (const userId of uploadAssignees) {
        const existing = next[userId] || travelers.find(t => t.id === userId)?.compliance || [];
        if (!existing.some(d => d.name === docName)) {
          next[userId] = [...existing, newDoc];
        }
      }
      return next;
    });
    showToast(`"${docName}" assigned to ${uploadAssignees.length} ${uploadAssignees.length === 1 ? "person" : "people"}`);
    setUploadOpen(false);
    setUploadDocName("");
    setUploadAssignees([]);
  }, [uploadDocName, uploadAssignees, travelers, setComplianceOverrides, showToast]);

  const handleSendReminder = useCallback((userId: string, userName: string, docName: string) => {
    const email = travelers.find(t => t.id === userId)?.email;
    if (!email) { showToast(`No email on file for ${userName}`); return; }
    const subject = `Reminder: ${docName}`;
    const body = `Hi ${userName.split(" ")[0]},\n\nA quick reminder that "${docName}" is still outstanding. Could you complete it when you get a moment?\n\nThanks`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showToast(`Opening an email to ${userName}`);
  }, [travelers, showToast]);

  const tripItems = [{ value: "all", label: "All trips" }, ...[...trips].sort((a, b) => (b.start || "").localeCompare(a.start || "")).map(t => ({ value: t.id, label: t.name }))];
  const onAppCount = people.filter(p => p.appKeys.length).length;
  const allVisibleSelected = visible.length > 0 && visible.every(p => selected.has(p.id));

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <PageHeader
        left={people.length > 0 ? (
          <div className="max-w-[160px] sm:max-w-md w-full relative group">
            <MagnifyingGlass className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-brand transition-colors pointer-events-none" />
            <label htmlFor="search-travelers" className="sr-only">Search travellers</label>
            <input id="search-travelers" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people, trips, documents" className="pl-9 sm:pl-11 h-10 bg-card border-none rounded-lg text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 w-full text-sm shadow-inner" />
          </div>
        ) : undefined}
        cta={!isViewer ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { if (!demoGate()) setPhotosOpen(true); }} className="rounded-lg font-semibold h-9 px-4 gap-1.5 text-sm shrink-0">
              <Images className="h-4 w-4" /> <span className="hidden sm:inline">Add photos</span>
            </Button>
            <Button variant="outline" onClick={() => { if (!demoGate()) setBulkOpen(true); }} className="rounded-lg font-semibold h-9 px-4 gap-1.5 text-sm shrink-0">
              <UsersThree className="h-4 w-4" /> <span className="hidden sm:inline">Add many</span>
            </Button>
            <Button onClick={() => { if (!demoGate()) setInviteOpen(true); }} className="rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-semibold h-9 px-4 gap-1.5 text-sm shrink-0">
              <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">Add traveller</span>
            </Button>
          </div>
        ) : undefined}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 sm:px-4 lg:px-8 py-5 sm:py-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Travellers</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {people.length} {people.length === 1 ? "person" : "people"}
                {!isDemoUser && !appUsersLoading && !appUsersError && `, ${onAppCount} on the app`}
                {appUsersLoading && ", checking the app..."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={tripFilter} onValueChange={v => setTripFilter(v ?? "all")} items={tripItems}>
                <SelectTrigger className="w-56 bg-card" aria-label="Trip"><SelectValue /></SelectTrigger>
                <SelectContent align="start" className="w-[min(28rem,var(--available-width))]">{tripItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
              </Select>
              {!isViewer && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="More">
                    <DotsThree className="h-4 w-4" weight="bold" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Assign a document</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportCSV} disabled={!visible.length}><DownloadSimple className="h-4 w-4" /> Export as CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Quick filters, counted within the search and trip */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter travellers">
            {([
              ["all", "Everyone"],
              ["app", "On the app"],
              ["not-app", "Not on the app"],
              ["docs", "Documents outstanding"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={quick === key}
                onClick={() => setQuick(key)}
                className={cn(
                  "h-8 px-3 rounded-lg text-sm transition-colors flex items-center gap-1.5",
                  quick === key ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground hover:bg-card/60",
                )}
              >
                {label}
                <span className="text-xs tabular-nums text-muted-foreground">{quickCounts[key]}</span>
              </button>
            ))}
          </div>

          {appUsersError && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5">
              <p className="text-sm text-amber-700 dark:text-amber-400">{appUsersError}</p>
              <Button variant="outline" size="sm" onClick={() => setAppUsersReload(n => n + 1)}>Try again</Button>
            </div>
          )}

          {/* Selected: act on them together */}
          {selectedPeople.length > 0 && !isViewer && (
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl bg-card shadow-sm ring-1 ring-border px-4 py-2.5">
              <p className="text-sm text-foreground">{selectedPeople.length} selected</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => messagePeople(selectedPeople)}><ChatCircleText className="h-4 w-4" /> Message</Button>
                {selectedPeople.length === 2 && selectedPeople.every(p => !p.appOnly) && <Button size="sm" variant="outline" onClick={() => setMergePeople(selectedPeople.map(p => travelers.find(t => t.id === p.id)!).filter(Boolean))}>Merge duplicates</Button>}
                <Button size="sm" variant="outline" className="gap-1.5 text-red-600 dark:text-red-400" onClick={() => deletePeople(selectedPeople)}><Trash className="h-4 w-4" /> Delete</Button>
                <button onClick={() => setSelected(new Set())} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Clear selection"><X className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          {people.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
              <User className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-base font-semibold text-foreground mt-3">No travellers yet</p>
              <p className="text-sm text-muted-foreground mt-1">Import an itinerary or add someone, and they'll show up here with their trips and app status.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No one matches. Try another filter or trip.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="hidden md:grid grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_2.5rem] items-center gap-3 px-4 py-2.5 border-b border-border text-xs text-muted-foreground">
                <Checkbox
                  aria-label="Select everyone shown"
                  checked={allVisibleSelected}
                  onCheckedChange={c => setSelected(c ? new Set(visible.map(p => p.id)) : new Set())}
                />
                <span>Person</span>
                <span>Trips</span>
                <span>App</span>
                <span>Documents</span>
                <span />
              </div>
              <ul className="divide-y divide-border">
                {visible.map(p => {
                  const status = appStatus(p);
                  const docs = docSummary(p.compliance);
                  const tripNames = [...new Map([...p.trips, ...p.appTrips].map(t => [t.id, t.name])).values()];
                  return (
                    <li
                      key={p.id}
                      onClick={() => setOpenPersonId(p.id)}
                      className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_2.5rem] items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/60 transition-colors"
                    >
                      <div onClick={e => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${p.name}`}
                          checked={selected.has(p.id)}
                          onCheckedChange={c => setSelected(prev => { const next = new Set(prev); if (c) next.add(p.id); else next.delete(p.id); return next; })}
                        />
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar person={p} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.email || "No email"}
                            <span className="md:hidden">, <span className={TONE_TEXT[status.tone]}>{status.label}</span></span>
                          </p>
                        </div>
                      </div>
                      <div className="hidden md:block min-w-0">
                        {tripNames.length === 0 ? <span className="text-xs text-muted-foreground">No trips</span> : (
                          <p className="text-sm text-foreground truncate">
                            {tripNames.slice(0, 2).join(", ")}
                            {tripNames.length > 2 && <span className="text-muted-foreground"> and {tripNames.length - 2} more</span>}
                          </p>
                        )}
                      </div>
                      <p className={cn("hidden md:block text-sm truncate", TONE_TEXT[status.tone])}>{status.label}</p>
                      <p className={cn("hidden md:block text-sm truncate", TONE_TEXT[docs.tone])}>{docs.label}</p>
                      <div onClick={e => e.stopPropagation()} className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label={`Actions for ${p.name}`}>
                            <DotsThree className="h-4 w-4" weight="bold" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setOpenPersonId(p.id)}><Eye className="h-4 w-4" /> View details</DropdownMenuItem>
                            {!isViewer && <DropdownMenuItem onClick={() => messagePeople([p])} disabled={!p.appKeys.length}><ChatCircleText className="h-4 w-4" /> Message</DropdownMenuItem>}
                            {!isViewer && p.appOnly && p.appKeys.length > 0 && (
                              <DropdownMenuItem onClick={() => { setRenameValue(p.name); setRenameTarget(p); }}><PencilSimple className="h-4 w-4" /> Rename on the app</DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => deletePeople([p])} className="text-red-600 dark:text-red-400"><Trash className="h-4 w-4" /> Delete</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* One person: trips, app, documents, messages */}
      <Sheet open={!!openPerson} onOpenChange={o => { if (!o) setOpenPersonId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l border-border p-0 overflow-y-auto">
          {openPerson && (() => {
            const p = openPerson;
            const status = appStatus(p);
            const allTrips = [...new Map([...p.trips.map(t => [t.id, t.name] as const), ...p.appTrips.map(t => [t.id, t.name] as const)]).entries()];
            const neededDocs = p.compliance.filter(d => d.status !== "Not Required");
            return (
              <div className="flex flex-col min-h-full">
                <div className="px-5 pt-5 pb-4 border-b border-border">
                  <SheetTitle className="sr-only">{p.name}</SheetTitle>
                  <div className="flex items-center gap-3 pr-8">
                    {!isViewer && !p.appOnly ? (
                      <div className="relative shrink-0">
                        <label
                          title={p.avatar ? "Change photo" : "Add a photo"}
                          className={cn("group/photo relative block cursor-pointer rounded-full", photoBusy && "pointer-events-none opacity-60")}
                        >
                          <Avatar person={p} size="h-12 w-12" />
                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 group-focus-within/photo:opacity-100">
                            {photoBusy ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            aria-label={p.avatar ? `Change ${p.name}'s photo` : `Add a photo for ${p.name}`}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void changePhoto(p, f); e.target.value = ""; }}
                          />
                        </label>
                      </div>
                    ) : (
                      <Avatar person={p} size="h-12 w-12" />
                    )}
                    {editingPerson ? (
                      <form
                        className="min-w-0 flex-1 space-y-2"
                        onSubmit={(e) => { e.preventDefault(); editPerson(p, editingPerson.name, editingPerson.email); }}
                      >
                        {personError && <p role="alert" className="text-sm text-red-600">{personError}</p>}
                        <Input disabled={personSaving} value={editingPerson.name} onChange={e => setEditingPerson(v => v && { ...v, name: e.target.value })} placeholder="Name" aria-label="Name" autoFocus className="h-9" />
                        <Input disabled={personSaving} value={editingPerson.email} onChange={e => setEditingPerson(v => v && { ...v, email: e.target.value })} placeholder="Email" aria-label="Email" type="email" className="h-9" />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={personSaving || !editingPerson.name.trim()} className="bg-primary text-primary-foreground">{personSaving ? "Saving…" : "Save"}</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingPerson(null)}>Cancel</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-lg font-semibold tracking-tight text-foreground truncate">{p.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{p.email || "No email on file"}</p>
                        </div>
                        {!isViewer && !p.appOnly && (
                          <button
                            type="button"
                            aria-label={`Edit ${p.name}`}
                            title="Edit name and email"
                            onClick={() => setEditingPerson({ name: p.name, email: p.email })}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                          >
                            <PencilSimple className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className={cn("text-sm mt-3 flex items-center gap-1.5", TONE_TEXT[status.tone])}>
                    <DeviceMobile className="h-4 w-4" /> {status.label}
                  </p>
                  {!isViewer && !p.appOnly && p.avatar && (
                    <button type="button" onClick={() => void changePhoto(p, null)} disabled={photoBusy} className="mt-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                      Remove photo
                    </button>
                  )}
                  {!isViewer && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" disabled={!p.appKeys.length} onClick={() => messagePeople([p])}>
                        <ChatCircleText className="h-4 w-4" /> Message
                      </Button>
                      {p.email && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { window.location.href = `mailto:${encodeURIComponent(p.email)}`; }}>
                          <Envelope className="h-4 w-4" /> Email
                        </Button>
                      )}
                      {p.appOnly && p.appKeys.length > 0 && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setRenameValue(p.name); setRenameTarget(p); }}>
                          <PencilSimple className="h-4 w-4" /> Rename
                        </Button>
                      )}
                      {!p.appOnly && p.appKeys.length > 0 && (
                        <Button size="sm" variant="outline" className="gap-1.5 max-w-full h-auto min-h-8 whitespace-normal text-left py-1.5" onClick={() => unlinkApp(p)}>
                          <LinkBreak className="h-4 w-4" /> Unlink app account
                        </Button>
                      )}
                    </div>
                  )}
                  {!p.appKeys.length && <p className="text-xs text-muted-foreground mt-2">Messages reach people once they join a trip in the app.</p>}
                </div>

                <div className="px-5 py-4 space-y-6 flex-1">
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground">Trips</p>
                      {!isViewer && !p.appOnly && trips.some(t => !p.trips.some(x => x.id === t.id)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-7 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-1">
                            <UserPlus className="h-3.5 w-3.5" /> Add to a trip
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64 max-h-72 overflow-y-auto">
                            {trips.filter(t => !p.trips.some(x => x.id === t.id)).map(t => (
                              <DropdownMenuItem key={t.id} onClick={() => addToTrip(p, t)}>{t.name}</DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {allTrips.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Not on any trip.</p>
                    ) : (
                      <div className="rounded-xl border border-border divide-y divide-border">
                        {allTrips.map(([tripId, tripName]) => {
                          const app = p.appTrips.find(t => t.id === tripId);
                          return (
                            <div key={tripId} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-foreground truncate">{tripName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {app ? (app.role === "leader" ? "Trip leader, on the app" : "On the app") : "Not joined in the app"}
                                </p>
                              </div>
                              {!isViewer && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label={`Options for ${tripName}`}>
                                    <DotsThree className="h-4 w-4" weight="bold" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    {app && (
                                      <DropdownMenuItem onClick={() => handleToggleRole(p.appKeys, tripId, app.role)}>
                                        <Crown className="h-4 w-4" /> {app.role === "leader" ? "Make a traveller" : "Make trip leader"}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => removeFromTrip(p, tripId)} className="text-red-600 dark:text-red-400">
                                      <SignOut className="h-4 w-4" /> Remove from trip
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {!p.appOnly && (
                    <section>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Travel details</p>
                      <TravelerDetails profile={p.profile} canEdit={!isViewer} onSave={profile => saveProfile(p, profile)} />
                    </section>
                  )}

                  {!p.appOnly && (
                    <section>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Documents</p>
                      {neededDocs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing assigned.</p>
                      ) : (
                        <div className="rounded-xl border border-border divide-y divide-border">
                          {neededDocs.map(doc => {
                            const cfg = DOC_STATUS_CONFIG[doc.status];
                            const Icon = cfg.icon;
                            return (
                              <div key={doc.name} className="flex items-center gap-3 px-3 py-2.5">
                                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", cfg.bg, cfg.color)}><Icon className="h-3.5 w-3.5" /></div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-foreground truncate">{doc.name}</p>
                                  <p className={cn("text-xs", cfg.color)}>{doc.status}{doc.date && doc.status === "Signed" ? `, ${new Date(doc.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</p>
                                </div>
                                {doc.status === "Signed" ? (
                                  <Button size="sm" variant="outline" onClick={() => openDocSheet(p.id, p.name, doc)} aria-label={`View ${doc.name}`}><Eye className="h-3.5 w-3.5" /></Button>
                                ) : !isViewer && (
                                  <div className="flex gap-1.5">
                                    <Button size="sm" onClick={() => openDocSheet(p.id, p.name, doc)}>Sign</Button>
                                    <Button size="sm" variant="outline" onClick={() => handleSendReminder(p.id, p.name, doc.name)} aria-label={`Remind about ${doc.name}`}><PaperPlaneTilt className="h-3.5 w-3.5" /></Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}

                  {p.appKeys.length > 0 && (
                    <section>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Messages</p>
                      {pushLog === null ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                      ) : pushLog.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing sent to them yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {pushLog.map(e => {
                            // Older entries only have totals, so a send that reached no one counts as missed
                            const missed = e.missed ? e.missed.some(k => p.appKeys.includes(k)) : e.sent === 0;
                            return (
                              <div key={e.id} className="rounded-xl border border-border bg-secondary px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                                  <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(e.sent_at)}</span>
                                </div>
                                <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{e.body}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  {e.category === "flight" ? "Flight alert" : e.category === "trip_update" ? "Itinerary change" : "Message"}, {e.trip_name}
                                  {missed ? <span className="text-amber-700 dark:text-amber-400">, in their app inbox only</span> : <span className="text-emerald-700 dark:text-emerald-400">, <Check className="inline h-3 w-3" /> notified</span>}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </div>

                {!isViewer && (
                  <div className="px-5 py-4 border-t border-border">
                    <Button variant="outline" className="w-full gap-2 text-red-600 dark:text-red-400" onClick={() => deletePeople([p])}>
                      <Trash className="h-4 w-4" /> Delete {p.name.split(" ")[0] || "traveller"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">Removes them from every trip, your directory and the app.</p>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {message && (
        <MessageDialog
          open
          onOpenChange={o => { if (!o) setMessage(null); }}
          trips={trips.filter(t => message.tripIds.includes(t.id))}
          initialTripId={message.tripId}
          initialPeople={message.people}
          onSent={() => setPushLogReload(n => n + 1)}
        />
      )}

      {/* Add Traveler - Vaul Drawer */}
      <Drawer.Root open={inviteOpen} onOpenChange={setInviteOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-xl bg-card border-t border-border max-h-[90vh] focus:outline-none">
            {/* Drag handle */}
            <div className="mx-auto w-12 h-1 rounded-full bg-secondary dark:bg-[#2a2a2a] mt-4 shrink-0" />

            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10">
              <div className="pt-6 pb-8 flex items-start justify-between">
                <div>
                  <Drawer.Title className="text-2xl font-bold tracking-tight text-foreground">Add traveller</Drawer.Title>
                  <p className="text-[11px] font-medium text-muted-foreground mt-1">New team member</p>
                </div>
                <button onClick={() => setInviteOpen(false)} className="h-10 w-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddTraveler} className="space-y-6 max-w-lg mx-auto">
                {personError && <p role="alert" className="text-sm text-red-600">{personError}</p>}
                {/* Name */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    <User className="h-3 w-3" /> Full Name
                  </Label>
                  <Input
                    required
                    value={drawerForm.name}
                    onChange={e => setDrawerForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Alex Johnson"
                    className="w-full font-bold"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    <Envelope className="h-3 w-3" /> Email Address
                  </Label>
                  <Input
                    required
                    type="email"
                    value={drawerForm.email}
                    onChange={e => setDrawerForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="name@dalefy.com"
                    className="w-full font-bold"
                  />
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    <Briefcase className="h-3 w-3" /> Role
                  </Label>
                  <Input
                    value={drawerForm.role}
                    onChange={e => setDrawerForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Travel Specialist"
                    list="role-suggestions"
                    className="w-full font-bold"
                  />
                  <datalist id="role-suggestions">
                    {["Trip Manager", "Travel Specialist", "Senior Agent", "Group Leader", "Operations Manager", "Coordinator", "Chaperone", "Admin"].map(r => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="flex-1 h-10 rounded-xl bg-background border border-border text-muted-foreground text-xs font-medium hover:text-foreground hover:border-slate-300 dark:hover:border-border transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-2 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" /> {personSaving ? "Saving…" : "Add to Team"}
                  </button>
                </div>
              </form>

              {/* Existing team preview */}
              <div className="mt-10 pt-8 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-4">Current Team · {travelers.length} members</p>
                <div className="flex flex-wrap gap-2">
                  {travelers.slice(0, 8).map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border border-border">
                      <div className="h-5 w-5 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-black text-[9px]">{u.initials}</div>
                      <span className="text-xs font-bold text-muted-foreground truncate max-w-[100px]">{u.name}</span>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${u.status === "Active" ? "bg-emerald-400" : u.status === "Away" ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-500"}`} />
                    </div>
                  ))}
                  {travelers.length > 8 && (
                    <div className="px-3 py-1.5 rounded-xl bg-background border border-border text-[11px] font-bold text-muted-foreground">
                      +{travelers.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <ComplianceDocSheet open={sheetOpen} onOpenChange={setSheetOpen} doc={sheetDoc} travelerName={sheetTraveler} onSign={handleSign} />

      {/* Assign Document Drawer */}
      <Drawer.Root open={uploadOpen} onOpenChange={setUploadOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-xl border-t border-border max-h-[85vh] overflow-y-auto">
            <div className="mx-auto w-12 h-1 rounded-full bg-secondary dark:bg-[#2a2a2a] mt-4 shrink-0" />
            <div className="px-6 sm:px-8 pb-8 pt-6">
              <p className="text-2xl font-bold tracking-tight text-foreground mb-1">Assign Document</p>
              <p className="text-[11px] font-medium text-muted-foreground mb-6">Add a document team members need to sign. It starts as Pending for each person.</p>

              {/* Document name */}
              <div className="space-y-2 mb-5">
                <Label className="text-xs font-medium text-muted-foreground">Document Name</Label>
                <Input
                  value={uploadDocName}
                  onChange={e => setUploadDocName(e.target.value)}
                  placeholder="e.g., NDA, Waiver, Health Declaration"
                  className="w-full font-bold"
                />
              </div>

              {/* Assign to travelers */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Assign To</Label>
                  <button
                    onClick={() => setUploadAssignees(prev => prev.length === travelers.length ? [] : travelers.map(t => t.id))}
                    className="text-[11px] font-medium text-brand hover:opacity-70 transition-opacity"
                  >
                    {uploadAssignees.length === travelers.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {travelers.map(t => {
                    const selected = uploadAssignees.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setUploadAssignees(prev => selected ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          selected
                            ? "bg-brand/10 border-brand/30 text-brand"
                            : "bg-background border-border text-muted-foreground hover:border-brand/20"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-md flex items-center justify-center font-black text-[9px] ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          {selected ? <Check className="h-3 w-3" /> : t.initials}
                        </div>
                        {t.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => { setUploadOpen(false); setUploadDocName(""); setUploadAssignees([]); }} className="flex-1 h-10 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleUploadDocument}
                  disabled={!uploadDocName.trim() || uploadAssignees.length === 0}
                  className="flex-2 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload className="h-4 w-4" /> Assign Document
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      <DemoUpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      <ConfirmDialog
        open={!!pendingConfirm}
        onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Remove"}
        onConfirm={() => { pendingConfirm?.action(); setPendingConfirm(null); }}
        destructive={pendingConfirm?.destructive ?? true}
      />
      <AddPhotosDialog
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        people={travelers}
        uid={user?.id ?? ""}
        onUploaded={async photos => { await applyPhotos(photos); showToast(`${photos.length} photo${photos.length === 1 ? "" : "s"} added`); }}
      />
      {mergePeople && <MergePeopleDialog people={mergePeople} onClose={() => setMergePeople(null)} onMerge={async (keep, other, patch) => { await savePerson(keep, patch, other); setSelected(new Set()); setAppUsersReload(n => n + 1); setOpenPersonId(keep.id); showToast('People merged — trips and app links preserved'); }} />}
      <BulkAddPeopleDialog
        key={tripFilter}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        existing={travelers}
        trips={trips}
        initialTripId={tripFilter === "all" ? undefined : tripFilter}
        onAdd={async selection => {
          await saveBulkPeople(selection);
          showToast(`Saved ${selection.matched.length + selection.created.length} people${selection.tripId ? " to the trip" : " to the directory"}`);
        }}
      />
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open && !renaming) setRenameTarget(null); }}>
        <DialogContent className="max-w-md bg-card rounded-xl border border-border p-6 shadow-2xl">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">Rename on the app</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Changes the name on every trip {renameTarget?.name ?? "they"} joined in the app. The name on their phone is theirs to change under Edit profile.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const p = renameTarget;
              const name = renameValue.trim();
              if (!p || !name || renaming) return;
              setRenaming(true);
              try {
                const tripIds = p.appTrips.map(t => t.id);
                for (const key of p.appKeys) await renameAppUser(key, name, tripIds);
                setAppUsers(prev => prev.map(m => (p.appKeys.includes(personKey(m)) ? { ...m, name } : m)));
                showToast(`${p.name} is now ${name} on the app`);
                setRenameTarget(null);
              } catch {
                showToast("Couldn't rename them on the app");
              } finally {
                setRenaming(false);
              }
            }}
          >
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Name" autoFocus aria-label="Name on the app" />
            <DialogFooter className="flex gap-3">
              <Button type="button" variant="ghost" disabled={renaming} onClick={() => setRenameTarget(null)} className="rounded-xl h-10 px-6 font-bold text-muted-foreground hover:bg-secondary">
                Cancel
              </Button>
              <Button type="submit" disabled={renaming || !renameValue.trim()} className="rounded-xl h-10 px-8 font-bold bg-primary text-primary-foreground hover:opacity-90">
                {renaming ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Rename"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
