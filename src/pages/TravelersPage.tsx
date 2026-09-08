import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import { Drawer } from "vaul";
import { MagnifyingGlass, UserPlus, FileText, FileMinus, FileDashed, FileX, PaperPlaneTilt, Eye, SealWarning, SealCheck, Clock, ChartBar, CaretUp, CaretDown, CaretUpDown, CaretLeft as PgLeft, CaretRight as PgRight, X, User, Envelope, Briefcase, DeviceMobile, MapPin, CalendarDots, Upload, Check, Trash, Fingerprint, Pencil, DotsThree, FunnelSimple, ArrowsDownUp, SignOut, Bell, DownloadSimple, CheckSquare, Square, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE } from "@/config/storageKeys";
import { MOCK_USERS } from "@/data/mock-users";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComplianceDocSheet } from "@/components/shared/ComplianceDocSheet";
import { fetchTripMembers, deleteAllTripMembers, deleteAppUser, removeUserFromTrip, renameAppUser, updateTripMemberRole, type TripMember, type TripMemberRole } from "@/services/firebaseTrips";
import { isFirebaseConfigured } from "@/services/firebase";
import { apiFetch, ApiError, getIdToken } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useDemo } from "@/hooks/useDemo";
import { usePermissions } from "@/hooks/usePermissions";
import { DemoUpgradeDialog } from "@/components/shared/DemoUpgradeDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { ComplianceDoc, User as UserType } from "@/types";

type Tab = "travelers" | "hr" | "app-users";


function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return <>{text.slice(0, idx)}<mark className="bg-brand/25 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
}

// One palette per status, shared meaning with ComplianceDocSheet: done / waiting / problem
const DOC_STATUS_CONFIG: Record<ComplianceDoc["status"], { color: string; bg: string; icon: typeof FileText; bar: string }> = {
  Signed: { color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: FileText, bar: "bg-emerald-500" },
  Pending: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-500/10", icon: FileDashed, bar: "bg-amber-500" },
  Expired: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: FileX, bar: "bg-red-500" },
  "Not Required": { color: "text-muted-foreground", bg: "bg-secondary", icon: FileMinus, bar: "bg-slate-300 dark:bg-[#333]" },
};

// Same green/amber language as document statuses and the drawer preview dots
const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  Active: { dot: "bg-emerald-400", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/25", label: "Active" },
  Away: { dot: "bg-amber-400", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/25", label: "Away" },
  Offline: { dot: "bg-slate-400", badge: "bg-secondary dark:bg-[#222] text-muted-foreground ring-1 ring-slate-300 dark:ring-[#333]", label: "Offline" },
};

/** Page numbers with truncation: 1 … n-1 n n+1 … last (0-indexed input, 0-indexed output). */
function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set<number>([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter(pn => pn >= 0 && pn < total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

function PageNumbers({ current, total, onSelect }: { current: number; total: number; onSelect: (i: number) => void }) {
  return (
    <>
      {pageWindow(current, total).map((pn, idx) =>
        pn === "gap" ? (
          <span key={`gap-${idx}`} className="w-4 text-center text-[10px] font-black text-muted-foreground">…</span>
        ) : (
          <button
            key={pn}
            onClick={() => onSelect(pn)}
            aria-label={`Page ${pn + 1}`}
            aria-current={current === pn ? "page" : undefined}
            className={`h-8 w-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
              current === pn
                ? "bg-brand text-black shadow-sm"
                : "text-muted-foreground hover:text-brand hover:bg-brand/5"
            }`}
          >
            {pn + 1}
          </button>
        ),
      )}
    </>
  );
}

export function TravelersPage() {
  const { trips } = useTrips();
  const { showToast } = useNotifications();
  const { user } = useAuth();
  const isDemoUser = !user || user.id === "demo" || (user.id?.length ?? 0) <= 20;
  const { demoGate, upgradeOpen, setUpgradeOpen } = useDemo();
  const { isViewer } = usePermissions();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("travelers");

  const [complianceOverrides, setComplianceOverrides] = useLocalStorage<Record<string, ComplianceDoc[]>>(STORAGE.COMPLIANCE, {});
  const [customTravelers, setCustomTravelers] = useLocalStorage<UserType[]>(STORAGE.CUSTOM_TRAVELERS, []);

  // Add Traveler drawer form
  const [drawerForm, setDrawerForm] = useState({ name: "", email: "", role: "", status: "Active" as UserType["status"] });

  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  const [hrPage, setHrPage] = useState(0);
  const HR_PER_PAGE = 6;
  const [appUsers, setAppUsers] = useState<TripMember[]>([]);
  const [appUsersLoading, setAppUsersLoading] = useState(false);
  const [appUsersError, setAppUsersError] = useState<string | null>(null);
  const [appUsersReload, setAppUsersReload] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [appUserSort, setAppUserSort] = useState<"name" | "recent" | "trips">("recent");
  const [appUserTripFilter, setAppUserTripFilter] = useState<string>("all");
  const [detailPanelUser, setDetailPanelUser] = useState<string | null>(null);
  const [renamingUser, setRenamingUser] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sendingPush, setSendingPush] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [appUserPage, setAppUserPage] = useState(0);
  const APP_USERS_PER_PAGE = 10;
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [removingFromTrip, setRemovingFromTrip] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ action: () => Promise<void>; title: string; description: string } | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    setAppUsersLoading(true);
    setAppUsersError(null);
    fetchTripMembers()
      .then(list => { if (!cancelled) setAppUsers(list); })
      .catch(() => { if (!cancelled) setAppUsersError("Couldn't load app users. Check your connection and try again."); })
      .finally(() => { if (!cancelled) setAppUsersLoading(false); });
    return () => { cancelled = true; };
  }, [appUsersReload]);

  const handleClearAppUsers = useCallback(() => {
    setPendingConfirm({
      title: "Delete All App Users",
      description: "This removes everyone from the trip_members collection in Firebase. This cannot be undone.",
      action: async () => {
        setClearing(true);
        try {
          const count = await deleteAllTripMembers();
          setAppUsers([]);
          setDetailPanelUser(null);
          showToast(`Cleared ${count} app user${count === 1 ? "" : "s"}`);
        } catch (err) {
          console.error("Clear app users failed:", err);
          showToast("Failed to clear app users - check console for details");
        } finally {
          setClearing(false);
        }
      },
    });
  }, [showToast]);

  const handleDeleteAppUser = useCallback((deviceId: string, name: string) => {
    setPendingConfirm({
      title: "Remove User",
      description: `Remove ${name || "this user"}? This deletes all their trip membership records.`,
      action: async () => {
        setDeletingUser(deviceId);
        try {
          const count = await deleteAppUser(deviceId);
          setAppUsers(prev => prev.filter(m => m.device_id !== deviceId));
          setDetailPanelUser(null);
          showToast(`Removed ${name || "user"} (${count} record${count === 1 ? "" : "s"})`);
        } catch (err) {
          console.error("Delete app user failed:", err);
          showToast("Failed to remove user - check console");
        } finally {
          setDeletingUser(null);
        }
      },
    });
  }, [showToast]);

  const handleToggleRole = useCallback(async (deviceId: string, tripId: string, currentRole: TripMemberRole) => {
    const newRole: TripMemberRole = currentRole === "leader" ? "traveler" : "leader";
    try {
      await updateTripMemberRole(deviceId, tripId, newRole);
      setAppUsers(prev => prev.map(m =>
        m.device_id === deviceId && m.trip_id === tripId ? { ...m, role: newRole } : m
      ));
      showToast(`Role updated to ${newRole === "leader" ? "Trip Leader" : "Traveler"}`);
    } catch (err) {
      console.error("Role update failed:", err);
      showToast("Failed to update role");
    }
  }, [showToast]);

  const handleRenameUser = useCallback(async (deviceId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const count = await renameAppUser(deviceId, newName.trim());
      setAppUsers(prev => prev.map(m =>
        m.device_id === deviceId ? { ...m, name: newName.trim() } : m
      ));
      setRenamingUser(null);
      showToast(`Renamed to "${newName.trim()}" (${count} record${count === 1 ? "" : "s"})`);
    } catch (err) {
      console.error("Rename failed:", err);
      showToast("Failed to rename user");
    }
  }, [showToast]);

  const handleRemoveFromTrip = useCallback((deviceId: string, tripId: string, tripName: string) => {
    setPendingConfirm({
      title: "Remove from Trip",
      description: `Remove this user from ${tripName}?`,
      action: async () => {
        setRemovingFromTrip(`${deviceId}_${tripId}`);
        try {
          await removeUserFromTrip(deviceId, tripId);
          setAppUsers(prev => prev.filter(m => !(m.device_id === deviceId && m.trip_id === tripId)));
          showToast(`Removed from ${tripName}`);
        } catch (err) {
          console.error("Remove from trip failed:", err);
          showToast("Failed to remove from trip");
        } finally {
          setRemovingFromTrip(null);
        }
      },
    });
  }, [showToast]);

  const toggleSelectUser = useCallback((deviceId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId); else next.add(deviceId);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedUsers.size === 0) return;
    setPendingConfirm({
      title: "Remove Users",
      description: `Remove ${selectedUsers.size} user${selectedUsers.size === 1 ? "" : "s"}? This deletes all their trip membership records.`,
      action: async () => {
        let removed = 0;
        for (const deviceId of selectedUsers) {
          try { await deleteAppUser(deviceId); removed++; } catch { /* skip */ }
        }
        setAppUsers(prev => prev.filter(m => !selectedUsers.has(m.device_id)));
        setSelectedUsers(new Set());
        setBulkAction(false);
        setDetailPanelUser(null);
        showToast(`Removed ${removed} user${removed === 1 ? "" : "s"}`);
      },
    });
  }, [selectedUsers, showToast]);

  // Group app users by device_id (unique person)
  const groupedAppUsers = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null; email: string | null; trips: { id: string; name: string; joinedAt: string; role: TripMemberRole }[] }>();
    for (const m of appUsers) {
      const existing = map.get(m.device_id);
      const tripEntry = { id: m.trip_id, name: m.trip_name, joinedAt: m.joined_at, role: (m.role || "traveler") as TripMemberRole };
      if (existing) {
        existing.trips.push(tripEntry);
        if (new Date(m.joined_at) > new Date(existing.trips[0]?.joinedAt ?? 0)) {
          existing.name = m.name;
          existing.avatar = m.avatar;
        }
        if (!existing.email && m.email) existing.email = m.email;
      } else {
        map.set(m.device_id, {
          name: m.name,
          avatar: m.avatar,
          email: m.email || null,
          trips: [tripEntry],
        });
      }
    }
    return Array.from(map.entries()).map(([deviceId, data]) => ({ deviceId, ...data }));
  }, [appUsers]);

  const uniqueAppTrips = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of appUsers) map.set(m.trip_id, m.trip_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [appUsers]);

  const filteredAppUsers = useMemo(() => {
    let result = groupedAppUsers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        u.trips.some(t => t.name.toLowerCase().includes(q))
      );
    }
    if (appUserTripFilter !== "all") {
      result = result.filter(u => u.trips.some(t => t.id === appUserTripFilter));
    }
    result = [...result].sort((a, b) => {
      if (appUserSort === "name") return a.name.localeCompare(b.name);
      if (appUserSort === "trips") return b.trips.length - a.trips.length;
      const latestA = Math.max(...a.trips.map(t => new Date(t.joinedAt).getTime()));
      const latestB = Math.max(...b.trips.map(t => new Date(t.joinedAt).getTime()));
      return latestB - latestA;
    });
    return result;
  }, [groupedAppUsers, search, appUserSort, appUserTripFilter]);

  const appUserTotalPages = Math.max(1, Math.ceil(filteredAppUsers.length / APP_USERS_PER_PAGE));
  const safeAppUserPage = Math.min(appUserPage, appUserTotalPages - 1);
  const paginatedAppUsers = filteredAppUsers.slice(safeAppUserPage * APP_USERS_PER_PAGE, (safeAppUserPage + 1) * APP_USERS_PER_PAGE);

  useEffect(() => { setAppUserPage(0); }, [search, appUserSort, appUserTripFilter]);

  const exportAppUsersCSV = useCallback(() => {
    if (filteredAppUsers.length === 0) return;
    const rows = [["Name", "Email", "Device ID", "Trips", "Last Active"]];
    for (const u of filteredAppUsers) {
      const latest = u.trips.reduce((a, b) => new Date(a.joinedAt) > new Date(b.joinedAt) ? a : b);
      rows.push([
        u.name || "Unknown",
        u.email || "",
        u.deviceId,
        u.trips.map(t => t.name).join("; "),
        new Date(latest.joinedAt).toLocaleDateString("en-GB"),
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `app-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredAppUsers.length} users`);
  }, [filteredAppUsers, showToast]);

  const sendPushToUser = useCallback(async (deviceId: string, name: string) => {
    if (!pushMessage.trim()) return;
    setSendingPush(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");
      const data = await apiFetch<{ sent?: boolean; reason?: string }>("/api/send-push", {
        method: "POST",
        auth: idToken,
        body: { deviceId, title: "Dalefy", body: pushMessage.trim() },
      });
      if (data.sent) showToast(`Notification sent to ${name || "user"}`);
      else showToast(data.reason || "No push token found for this user");
    } catch (err) {
      showToast(err instanceof ApiError && err.status !== 0 ? err.message : "Failed to send notification");
    }
    setSendingPush(false);
    setPushMessage("");
  }, [pushMessage, showToast]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDoc, setSheetDoc] = useState<ComplianceDoc | null>(null);
  const [sheetTraveler, setSheetTraveler] = useState("");
  const [sheetUserId, setSheetUserId] = useState("");
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  // Upload document state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadAssignees, setUploadAssignees] = useState<string[]>([]);

  const linkedTravelerIds = useMemo(() => {
    const linked = new Set<string>();
    for (const m of appUsers) {
      if (m.linked_traveler_id) linked.add(m.linked_traveler_id);
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

    const travelerMap = new Map<string, UserType>();
    for (const t of trips) {
      if (!t.travelers) continue;
      for (const tv of t.travelers) {
        if (travelerMap.has(tv.id)) continue;
        travelerMap.set(tv.id, {
          id: tv.id,
          name: tv.name,
          email: tv.email || "",
          role: "Traveler",
          avatar: "",
          initials: tv.initials,
          status: linkedTravelerIds.has(tv.id) ? "Active" : "Offline",
        });
      }
    }
    for (const cu of customTravelers) {
      const nameKey = cu.name.trim().toLowerCase();
      const existing = [...travelerMap.values()].find(
        v => v.name.trim().toLowerCase() === nameKey,
      );
      if (existing) {
        if (cu.email && !existing.email) existing.email = cu.email;
        if (cu.role && cu.role !== "Traveler") existing.role = cu.role;
        if (cu.compliance?.length) existing.compliance = cu.compliance;
      } else {
        travelerMap.set(cu.id, cu);
      }
    }

    return [...travelerMap.values()].map(user => {
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
  }, [trips, complianceOverrides, customTravelers, isDemoUser, linkedTravelerIds]);

  const filtered = useMemo(() => {
    if (!search) return travelers;
    const q = search.toLowerCase();
    return travelers.filter(t => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.role.toLowerCase().includes(q));
  }, [travelers, search]);

  const hrStats = useMemo(() => {
    let signed = 0, pending = 0, expired = 0, total = 0;
    travelers.forEach(t => {
      t.compliance.forEach(d => {
        if (d.status === "Not Required") return;
        total++;
        if (d.status === "Signed") signed++;
        else if (d.status === "Pending") pending++;
        else if (d.status === "Expired") expired++;
      });
    });
    const rate = total > 0 ? Math.round((signed / total) * 100) : 0;
    return { signed, pending, expired, total, rate };
  }, [travelers]);

  const allDocs = useMemo(() => {
    const docs: { userId: string; userName: string; initials: string; doc: ComplianceDoc }[] = [];
    const seen = new Set<string>();
    travelers.forEach(t => {
      t.compliance.forEach(d => {
        if (d.status === "Not Required") return;
        const key = `${t.id}:${d.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        docs.push({ userId: t.id, userName: t.name, initials: t.initials, doc: d });
      });
    });
    const priority: Record<string, number> = { Expired: 0, Pending: 1, Signed: 2 };
    docs.sort((a, b) => (priority[a.doc.status] ?? 3) - (priority[b.doc.status] ?? 3));
    return docs;
  }, [travelers]);

  // Group docs by person for the HR view
  const groupedDocs = useMemo(() => {
    const map = new Map<string, { userId: string; userName: string; initials: string; docs: ComplianceDoc[] }>();
    for (const entry of allDocs) {
      const existing = map.get(entry.userId);
      if (existing) {
        existing.docs.push(entry.doc);
      } else {
        map.set(entry.userId, { userId: entry.userId, userName: entry.userName, initials: entry.initials, docs: [entry.doc] });
      }
    }
    return Array.from(map.values());
  }, [allDocs]);

  type TravelerRow = typeof travelers[number];

  const columns = useMemo<ColumnDef<TravelerRow>[]>(() => [
    {
      id: "name",
      accessorFn: row => row.name,
      header: "Member",
      enableSorting: true,
    },
    {
      id: "role",
      accessorFn: row => row.role,
      header: "Role",
      enableSorting: true,
    },
    {
      id: "trips",
      accessorFn: row => row.assignedTrips.length,
      header: "Trips",
      enableSorting: true,
      sortDescFirst: true,
    },
    {
      id: "compliance",
      accessorFn: row => {
        const docs = row.compliance.filter(d => d.status !== "Not Required");
        return docs.length > 0 ? Math.round((docs.filter(d => d.status === "Signed").length / docs.length) * 100) : 100;
      },
      header: "Documents",
      enableSorting: true,
    },
    {
      id: "status",
      accessorFn: row => row.status,
      header: "Status",
      enableSorting: true,
    },
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const q = filterValue.toLowerCase();
      const r = row.original;
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.role.toLowerCase().includes(q);
    },
  });

  const filteredGroupedDocs = useMemo(() => {
    if (!search) return groupedDocs;
    const q = search.toLowerCase();
    return groupedDocs
      .map(g => ({
        ...g,
        docs: g.docs.filter(d => g.userName.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)),
      }))
      .filter(g => g.docs.length > 0);
  }, [groupedDocs, search]);


  const handleAddTraveler = useCallback((e: React.FormEvent) => {
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
    setCustomTravelers(prev => [...prev, newUser]);
    setDrawerForm({ name: "", email: "", role: "", status: "Active" });
    setInviteOpen(false);
    showToast(`${newUser.name} added to team`);
  }, [drawerForm, setCustomTravelers, showToast]);

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
    const key = `${userId}-${docName}`;
    setSendingReminder(key);
    const subject = `Reminder: ${docName}`;
    const body = `Hi ${userName.split(" ")[0]},\n\nA quick reminder that "${docName}" is still outstanding. Could you complete it when you get a moment?\n\nThanks`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setTimeout(() => setSendingReminder(null), 800);
    showToast(`Opening an email to ${userName}`);
  }, [travelers, showToast]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <PageHeader
        left={travelers.length > 0 ? (
          <div className="max-w-[140px] sm:max-w-md w-full relative group">
            <MagnifyingGlass className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-muted-foreground group-focus-within:text-brand transition-colors pointer-events-none" />
            <label htmlFor="search-travelers" className="sr-only">Search travelers</label>
            <input id="search-travelers" value={search} onChange={e => { setSearch(e.target.value); setHrPage(0); }} placeholder="Search people, emails, documents" className="pl-9 sm:pl-12 h-10 bg-card border-none rounded-lg text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 w-full text-sm shadow-inner" />
          </div>
        ) : undefined}
        cta={!isViewer ? (
          <Button onClick={() => { if (!demoGate()) setInviteOpen(true); }} className="rounded-lg bg-brand hover:opacity-90 text-primary-foreground font-semibold h-9 px-4 gap-1.5 text-sm shrink-0">
            <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">Add traveller</span>
          </Button>
        ) : undefined}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 sm:px-4 lg:px-8 py-5 sm:py-7 space-y-4 sm:space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-4 sm:pb-6 border-b border-border">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground leading-none">Travellers</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                {travelers.length} {travelers.length === 1 ? "member" : "members"}
                {!isDemoUser && travelers.filter(t => t.status === "Active").length > 0 ? ` · ${travelers.filter(t => t.status === "Active").length} on the app` : ""}
              </p>
            </div>
            <div className="shrink-0 overflow-x-auto scrollbar-hide">
              <div className="inline-flex bg-secondary p-0.5 rounded-lg gap-0">
                {(["travelers", "hr", "app-users"] as const).map(t => {
                  const active = tab === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`relative flex-none h-8 px-4 rounded-md text-sm font-medium transition-colors ${
                        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "travelers" ? "Team" : t === "hr" ? "Documents" : (
                        <span className="flex items-center gap-1.5">
                          <DeviceMobile className="h-3 w-3" />
                          App users
                          {groupedAppUsers.length > 0 && (
                            <span className="ml-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground tabular-nums">{groupedAppUsers.length}</span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ───────── TRAVELERS TAB (TANSTACK TABLE) ───────── */}
          {tab === "travelers" && travelers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 ">
              <div className="text-center space-y-1.5">
                <p className="text-lg font-semibold tracking-tight text-foreground">No team members</p>
                <p className="text-sm text-muted-foreground">Add your first traveler to get started</p>
              </div>
              {!isViewer && (
                <button
                  onClick={() => { if (!demoGate()) setInviteOpen(true); }}
                  className="h-9 px-4 rounded-lg bg-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Add a traveller
                </button>
              )}
            </div>
          )}
          {tab === "travelers" && travelers.length > 0 && (
            <div className="">
              {/* ── Mobile card layout (< sm) ── */}
              <div className="sm:hidden space-y-2.5">
                {table.getRowModel().rows.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <p className="text-sm font-medium text-muted-foreground">No team members yet</p>
                  </div>
                )}
                {table.getRowModel().rows.map(row => {
                  const user = row.original;
                  const docs = user.compliance.filter(d => d.status !== "Not Required");
                  const signedCount = docs.filter(d => d.status === "Signed").length;
                  const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG["Offline"];
                  return (
                    <div key={row.id} className="bg-card rounded-xl border border-border p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-xs shrink-0 self-center">{user.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{user.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email || <span className="text-muted-foreground italic">No email</span>}</div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0 ${statusCfg.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{user.role}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{user.assignedTrips.length} {user.assignedTrips.length === 1 ? "trip" : "trips"}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground tabular-nums">{signedCount}/{docs.length} docs</span>
                      </div>
                      {user.compliance.length > 0 && (
                        <div className="flex gap-1 mt-2.5 flex-wrap">
                          {user.compliance.map(d => {
                            const abbr = d.name.includes(" ")
                              ? d.name.split(" ").map((w: string) => w[0]).join("").toUpperCase()
                              : d.name.slice(0, 3).toUpperCase();
                            const cfg = DOC_STATUS_CONFIG[d.status];
                            return (
                              <button
                                key={d.name}
                                onClick={() => openDocSheet(user.id, user.name, d)}
                                title={`${d.name}: ${d.status}`}
                                aria-label={`${d.name}: ${d.status}`}
                                className={`h-[22px] px-1.5 rounded text-[10px] font-semibold transition-opacity hover:opacity-80 ${cfg.bg} ${cfg.color}`}
                              >
                                {abbr}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Desktop table layout (sm+) ── */}
              <div className="hidden sm:block bg-card rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} className="bg-secondary/50 border-b border-border">
                      {headerGroup.headers.map(header => {
                        const isSorted = header.column.getIsSorted();
                        const canSort = header.column.getCanSort();
                        return (
                          <th
                            key={header.id}
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                            className={`px-6 py-3.5 text-xs font-medium text-muted-foreground ${header.id === "status" ? "text-right" : ""} ${canSort ? "cursor-pointer select-none hover:text-brand transition-colors" : ""}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {canSort && (
                                <span className={isSorted ? "text-brand" : "opacity-40"}>
                                  {isSorted === "asc" ? (
                                    <CaretUp className="h-3.5 w-3.5" />
                                  ) : isSorted === "desc" ? (
                                    <CaretDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <CaretUpDown className="h-3.5 w-3.5" />
                                  )}
                                </span>
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-border">
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm font-medium text-muted-foreground">No team members yet</p>
                          <p className="text-xs text-muted-foreground">Add your first traveler using the button above</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {table.getRowModel().rows.map(row => {
                    const user = row.original;
                    const docs = user.compliance.filter(d => d.status !== "Not Required");
                    const signedCount = docs.filter(d => d.status === "Signed").length;
                    const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG["Offline"];
                    return (
                      <tr key={row.id} className="hover:bg-secondary/60 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3.5">
                            <div className="h-9 w-9 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-xs shrink-0 self-center">{user.initials}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate group-hover:text-brand transition-colors">{user.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email || <span className="text-muted-foreground italic">No email</span>}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-semibold text-muted-foreground">{user.role}</span>
                        </td>
                        <td className="px-6 py-5">
                          {user.assignedTrips.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-semibold text-foreground tabular-nums">{user.assignedTrips.length}</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={user.assignedTrips.join(", ")}>{user.assignedTrips.join(", ")}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground tabular-nums">0</span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex gap-1">
                              {user.compliance.map(d => {
                                const abbr = d.name.includes(" ")
                                  ? d.name.split(" ").map((w: string) => w[0]).join("").toUpperCase()
                                  : d.name.slice(0, 3).toUpperCase();
                                const cfg = DOC_STATUS_CONFIG[d.status];
                                return (
                                  <button
                                    key={d.name}
                                    onClick={() => openDocSheet(user.id, user.name, d)}
                                    title={`${d.name}: ${d.status}`}
                                    aria-label={`${d.name}: ${d.status}`}
                                    className={`h-[22px] px-1.5 rounded text-[10px] font-semibold transition-opacity hover:opacity-80 ${cfg.bg} ${cfg.color}`}
                                  >
                                    {abbr}
                                  </button>
                                );
                              })}
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums">{signedCount}<span className="text-muted-foreground">/{docs.length}</span></span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md ${statusCfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Pagination - only shown when data > 10 */}
              {table.getPageCount() > 1 && (
                <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {filtered.length} members
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      aria-label="Previous page"
                    >
                      <PgLeft className="h-4 w-4" />
                    </button>
                    <PageNumbers current={table.getState().pagination.pageIndex} total={table.getPageCount()} onSelect={i => table.setPageIndex(i)} />
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      aria-label="Next page"
                    >
                      <PgRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              </div>

              {/* Mobile pagination */}
              {table.getPageCount() > 1 && (
                <div className="sm:hidden flex items-center justify-between mt-3 px-1">
                  <span className="text-xs text-muted-foreground">
                    {table.getState().pagination.pageIndex + 1}/{table.getPageCount()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-brand bg-card border border-border disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Previous page"
                    >
                      <PgLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-brand bg-card border border-border disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Next page"
                    >
                      <PgRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────── HR MANAGEMENT TAB ───────── */}
          {tab === "hr" && (
            <div className="space-y-8 ">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {[
                  { label: "Signed", value: hrStats.signed.toString(), sub: hrStats.pending + hrStats.expired === 0 ? "All done" : `Of ${hrStats.total} required`, icon: <SealCheck className="h-4 w-4" />, accent: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Needs signing", value: hrStats.pending.toString(), sub: "Waiting on someone", icon: <Clock className="h-4 w-4" />, accent: "text-amber-600 dark:text-amber-400" },
                  { label: "Expired", value: hrStats.expired.toString(), sub: "Needs renewal", icon: <SealWarning className="h-4 w-4" />, accent: "text-red-600 dark:text-red-400" },
                  { label: "Up to date", value: `${hrStats.rate}%`, sub: "Across all members", icon: <ChartBar className="h-4 w-4" />, accent: "text-brand" },
                ].map(card => (
                  <div key={card.label} className="rounded-xl border border-border bg-card shadow-sm px-5 py-4">
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className={`text-3xl font-semibold tracking-tight leading-none mt-2 tabular-nums ${card.accent === "text-brand" ? "text-foreground" : card.accent}`}>{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-2">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Upload button */}
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold tracking-tight text-foreground">Documents by person</p>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <Upload className="h-4 w-4" /> Assign a document
                </button>
              </div>

              {filteredGroupedDocs.length === 0 ? (
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <p className="text-sm font-medium text-muted-foreground">No documents yet</p>
                    <p className="text-xs text-muted-foreground">Add team members to track compliance</p>
                  </div>
                </div>
              ) : (() => {
                const hrTotalPages = Math.ceil(filteredGroupedDocs.length / HR_PER_PAGE);
                const safePage = Math.min(hrPage, hrTotalPages - 1);
                const paged = filteredGroupedDocs.slice(safePage * HR_PER_PAGE, (safePage + 1) * HR_PER_PAGE);
                return (<>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {paged.map(({ userId, userName, initials, docs: personDocs }) => {
                    const signed = personDocs.filter(d => d.status === "Signed").length;
                    const total = personDocs.length;
                    const allGood = signed === total;
                    const isExpanded = expandedPersons.has(userId);
                    const MAX_VISIBLE = 3;
                    const hasOverflow = personDocs.length > MAX_VISIBLE;
                    // Sort: expired first, then pending, then signed
                    const sortedDocs = [...personDocs].sort((a, b) => {
                      const p: Record<string, number> = { Expired: 0, Pending: 1, Signed: 2 };
                      return (p[a.status] ?? 3) - (p[b.status] ?? 3);
                    });
                    const visibleDocs = isExpanded ? sortedDocs : sortedDocs.slice(0, MAX_VISIBLE);
                    const hiddenCount = sortedDocs.length - MAX_VISIBLE;
                    return (
                      <div key={userId} className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                        {/* Person header */}
                        <div className="px-5 pt-5 pb-4 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-xs shrink-0 self-center">{initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {allGood ? "All signed" : `${signed} of ${total} signed`}
                            </p>
                          </div>
                        </div>

                        {/* Document rows */}
                        <div className="border-t border-border">
                          {visibleDocs.map(doc => {
                            const cfg = DOC_STATUS_CONFIG[doc.status];
                            const Icon = cfg.icon;
                            const reminderKey = `${userId}-${doc.name}`;
                            const isSending = sendingReminder === reminderKey;
                            return (
                              <div
                                key={`${userId}-${doc.name}`}
                                className="flex items-center px-5 py-3 gap-3 border-b border-slate-50 dark:border-[#151515] last:border-b-0 group hover:bg-slate-50/50 dark:hover:bg-background transition-colors"
                              >
                                <div className={`h-7 w-7 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center shrink-0`}>
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold tracking-tight text-foreground truncate">{doc.name}</p>
                                  <p className="text-[10px] font-medium text-muted-foreground">
                                    {doc.date ? new Date(doc.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "Not signed yet"}
                                  </p>
                                </div>
                                <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none uppercase tracking-wider shrink-0 ${cfg.bg} ${cfg.color}`}>{doc.status}</Badge>
                                {doc.status === "Signed" ? (
                                  <button onClick={() => openDocSheet(userId, userName, doc)} title={`View ${doc.name}`} aria-label={`View ${doc.name}`} className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-brand hover:border-brand/40 transition-all">
                                    <Eye className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => openDocSheet(userId, userName, doc)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-[10px] font-black uppercase tracking-widest text-black hover:opacity-90 transition-opacity">
                                      Sign
                                    </button>
                                    <button onClick={() => handleSendReminder(userId, userName, doc.name)} disabled={isSending} title={`Send reminder for ${doc.name}`} aria-label={`Send reminder for ${doc.name}`} className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-brand hover:border-brand/40 transition-all disabled:opacity-50">
                                      <PaperPlaneTilt className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Show more / less toggle */}
                        {hasOverflow && (
                          <button
                            type="button"
                            onClick={() => setExpandedPersons(prev => {
                              const next = new Set(prev);
                              if (next.has(userId)) next.delete(userId); else next.add(userId);
                              return next;
                            })}
                            className="w-full py-2.5 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-brand transition-colors border-t border-border cursor-pointer"
                          >
                            <CaretDown className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                            {isExpanded ? "Show less" : `${hiddenCount} more`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* HR Pagination */}
                {hrTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-muted-foreground">
                      Page {safePage + 1} of {hrTotalPages} · {filteredGroupedDocs.length} people
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHrPage(p => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Previous page"
                      >
                        <PgLeft className="h-4 w-4" />
                      </button>
                      <PageNumbers current={safePage} total={hrTotalPages} onSelect={setHrPage} />
                      <button
                        onClick={() => setHrPage(p => Math.min(hrTotalPages - 1, p + 1))}
                        disabled={safePage >= hrTotalPages - 1}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Next page"
                      >
                        <PgRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
                </>);
              })()}
            </div>
          )}

          {/* ───────── APP USERS TAB ───────── */}
          {tab === "app-users" && (
            <div className="space-y-6 ">
              {/* Stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {[
                  { label: "App users", value: groupedAppUsers.length.toString(), icon: <DeviceMobile className="h-4 w-4" />, accent: "text-brand" },
                  { label: "Trip joins", value: appUsers.length.toString(), icon: <MapPin className="h-4 w-4" />, accent: "text-brand" },
                  { label: "Trips joined", value: new Set(appUsers.map(m => m.trip_id)).size.toString(), icon: <CalendarDots className="h-4 w-4" />, accent: "text-brand" },
                ].map(card => (
                  <div key={card.label} className="rounded-xl border border-border bg-card shadow-sm px-5 py-4">
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className="text-3xl font-semibold tracking-tight leading-none mt-2 tabular-nums text-foreground">{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Toolbar: sort, filter, actions */}
              {groupedAppUsers.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-muted-foreground mr-auto">
                    {filteredAppUsers.length} User{filteredAppUsers.length === 1 ? "" : "s"}
                  </p>

                  {/* Sort dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-card border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-brand hover:border-brand/30 transition-colors">
                      <ArrowsDownUp className="h-3.5 w-3.5" />
                      {appUserSort === "name" ? "Name" : appUserSort === "trips" ? "Trips" : "Recent"}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuRadioGroup value={appUserSort} onValueChange={v => setAppUserSort(v as typeof appUserSort)}>
                        <DropdownMenuRadioItem value="recent">Most Recent</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="name">Name A-Z</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="trips">Most Trips</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Filter by trip dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className={`flex items-center gap-1.5 h-9 px-3.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
                      appUserTripFilter !== "all"
                        ? "bg-brand/10 border-brand/30 text-brand"
                        : "bg-card border-border text-muted-foreground hover:text-brand hover:border-brand/30"
                    }`}>
                      <FunnelSimple className="h-3.5 w-3.5" />
                      {appUserTripFilter !== "all" ? "Filtered" : "Trip"}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 max-h-64">
                      <DropdownMenuRadioGroup value={appUserTripFilter} onValueChange={setAppUserTripFilter}>
                        <DropdownMenuRadioItem value="all">All Trips</DropdownMenuRadioItem>
                        {uniqueAppTrips.map(t => (
                          <DropdownMenuRadioItem key={t.id} value={t.id}>{t.name}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="More actions"
                      className="flex items-center justify-center h-9 w-9 rounded-xl bg-card border border-border text-muted-foreground hover:text-brand hover:border-brand/30 transition-colors"
                    >
                      <DotsThree className="h-4 w-4" weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={exportAppUsersCSV}>
                        <DownloadSimple className="h-3.5 w-3.5" /> Export CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setBulkAction(!bulkAction); setSelectedUsers(new Set()); }}>
                        <CheckSquare className="h-3.5 w-3.5" /> {bulkAction ? "Exit Select Mode" : "Select Mode"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" disabled={clearing} onClick={handleClearAppUsers}>
                        <Trash className="h-3.5 w-3.5" />
                        {clearing ? "Clearing..." : "Clear All Users"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/* Bulk action bar */}
              {bulkAction && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand/5 border border-brand/20">
                  <button
                    onClick={() => {
                      if (selectedUsers.size === paginatedAppUsers.length) setSelectedUsers(new Set());
                      else setSelectedUsers(new Set(paginatedAppUsers.map(u => u.deviceId)));
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-brand"
                  >
                    {selectedUsers.size === paginatedAppUsers.length && paginatedAppUsers.length > 0
                      ? <CheckSquare className="h-3.5 w-3.5" weight="fill" />
                      : <Square className="h-3.5 w-3.5" />}
                    {selectedUsers.size > 0 ? `${selectedUsers.size} Selected` : "Select All"}
                  </button>
                  <div className="flex-1" />
                  {selectedUsers.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash className="h-3 w-3" /> Remove {selectedUsers.size}
                    </button>
                  )}
                  <button
                    onClick={() => { setBulkAction(false); setSelectedUsers(new Set()); }}
                    className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Users list */}
              <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                {/* Header - hidden on mobile */}
                <div className="hidden sm:flex px-6 py-4 border-b border-border bg-secondary/50 items-center">
                  {bulkAction && <div className="w-10" />}
                  <div className="w-14" />
                  <div className="flex-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Name</div>
                  <div className="w-48 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Trips Joined</div>
                  <div className="w-40 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Last Active</div>
                </div>

                {appUsersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : appUsersError ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                    <p className="text-sm font-semibold text-foreground/80">{appUsersError}</p>
                    <button
                      type="button"
                      onClick={() => setAppUsersReload(k => k + 1)}
                      className="h-9 px-4 rounded-xl bg-brand text-black text-[10px] font-bold uppercase tracking-wider"
                    >
                      Try again
                    </button>
                  </div>
                ) : paginatedAppUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      {search || appUserTripFilter !== "all" ? "No matching users" : "No app users yet"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {search || appUserTripFilter !== "all" ? "Try a different search or filter" : "Users will appear here when they join a trip via the mobile app"}
                    </p>
                    {appUserTripFilter !== "all" && (
                      <button onClick={() => setAppUserTripFilter("all")} className="text-[10px] font-black uppercase tracking-widest text-brand hover:underline mt-1">
                        Clear Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-border">
                    {paginatedAppUsers.map((appUser) => {
                      const initials = appUser.name
                        ? appUser.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
                        : "?";
                      const latestJoin = appUser.trips.reduce((a, b) =>
                        new Date(a.joinedAt) > new Date(b.joinedAt) ? a : b
                      );
                      return (
                        <div key={appUser.deviceId}>
                          {/* ── Mobile card layout ── */}
                          <div className="sm:hidden">
                            <button
                              onClick={() => bulkAction ? toggleSelectUser(appUser.deviceId) : setDetailPanelUser(appUser.deviceId)}
                              className="w-full text-left p-4 hover:bg-slate-50/80 dark:hover:bg-background/80 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {bulkAction && (
                                  <div className="shrink-0">
                                    {selectedUsers.has(appUser.deviceId)
                                      ? <CheckSquare className="h-5 w-5 text-brand" weight="fill" />
                                      : <Square className="h-5 w-5 text-muted-foreground" />}
                                  </div>
                                )}
                                <div className="shrink-0">
                                  {appUser.avatar ? (
                                    <img src={appUser.avatar} alt={appUser.name} className="h-10 w-10 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                                  ) : null}
                                  <div className={`h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs ${appUser.avatar ? "hidden" : ""}`}>{initials}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-foreground truncate"><HighlightText text={appUser.name || "Unknown"} query={search} /></div>
                                  {appUser.email && <div className="text-[10px] text-muted-foreground truncate">{appUser.email}</div>}
                                  <div className="text-[11px] text-muted-foreground mt-0.5">{appUser.trips.length} trip{appUser.trips.length === 1 ? "" : "s"} · {new Date(latestJoin.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                                </div>
                                {!bulkAction && <PgRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                              </div>
                            </button>
                          </div>

                          {/* ── Desktop row ── */}
                          <button
                            onClick={() => bulkAction ? toggleSelectUser(appUser.deviceId) : setDetailPanelUser(detailPanelUser === appUser.deviceId ? null : appUser.deviceId)}
                            className="hidden sm:flex w-full items-center px-6 py-4 hover:bg-slate-50/80 dark:hover:bg-background/80 transition-colors group text-left"
                          >
                            {bulkAction && (
                              <div className="w-10 shrink-0">
                                {selectedUsers.has(appUser.deviceId)
                                  ? <CheckSquare className="h-5 w-5 text-brand" weight="fill" />
                                  : <Square className="h-5 w-5 text-muted-foreground group-hover:text-slate-400 dark:group-hover:text-muted-foreground transition-colors" />}
                              </div>
                            )}
                            <div className="w-14 shrink-0">
                              {appUser.avatar ? (
                                <img src={appUser.avatar} alt={appUser.name} className="h-10 w-10 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                              ) : null}
                              <div className={`h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs ${appUser.avatar ? "hidden" : ""}`}>{initials}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate group-hover:text-brand transition-colors"><HighlightText text={appUser.name || "Unknown"} query={search} /></div>
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                {appUser.email ? (
                                  <><Envelope className="h-3 w-3" /> {appUser.email}</>
                                ) : (
                                  <><DeviceMobile className="h-3 w-3" /> Mobile app user</>
                                )}
                              </div>
                            </div>
                            <div className="w-48">
                              <div className="flex flex-wrap gap-1.5">
                                {appUser.trips.slice(0, 3).map(t => (
                                  <span key={t.id} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-brand/10 text-brand">
                                    <MapPin className="h-2.5 w-2.5" />
                                    <HighlightText text={t.name.length > 14 ? t.name.slice(0, 14).trimEnd() + "..." : t.name} query={search} />
                                  </span>
                                ))}
                                {appUser.trips.length > 3 && (
                                  <span className="text-[10px] font-bold text-muted-foreground px-1.5 py-1">+{appUser.trips.length - 3}</span>
                                )}
                              </div>
                            </div>
                            <div className="w-40 flex items-center justify-end gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {new Date(latestJoin.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                              </span>
                              {!bulkAction && <PgRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${detailPanelUser === appUser.deviceId ? "text-brand" : ""}`} />}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {appUserTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {safeAppUserPage * APP_USERS_PER_PAGE + 1}-{Math.min((safeAppUserPage + 1) * APP_USERS_PER_PAGE, filteredAppUsers.length)} of {filteredAppUsers.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAppUserPage(p => Math.max(0, p - 1))}
                      disabled={safeAppUserPage <= 0}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <PgLeft className="h-4 w-4" />
                    </button>
                    <PageNumbers current={safeAppUserPage} total={appUserTotalPages} onSelect={setAppUserPage} />
                    <button
                      onClick={() => setAppUserPage(p => Math.min(appUserTotalPages - 1, p + 1))}
                      disabled={safeAppUserPage >= appUserTotalPages - 1}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <PgRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────── APP USER DETAIL SLIDE-OUT PANEL ───────── */}
          {detailPanelUser && (() => {
            const panelUser = groupedAppUsers.find(u => u.deviceId === detailPanelUser);
            if (!panelUser) return null;
            const initials = panelUser.name
              ? panelUser.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
              : "?";
            const isRenaming = renamingUser === panelUser.deviceId;
            return (
              <Sheet open onOpenChange={open => { if (!open) { setDetailPanelUser(null); setRenamingUser(null); } }}>
                <SheetContent
                  side="right"
                  showCloseButton={false}
                  aria-label={`${panelUser.name || "App user"} details`}
                  className="w-full sm:w-[420px] sm:max-w-[420px] gap-0 overflow-y-auto bg-card"
                >
                  {/* Panel header */}
                  <div className="sticky top-0 z-10 bg-white/80 dark:bg-background/80 backdrop-blur-xl border-b border-border">
                    <div className="flex items-center justify-between p-5">
                      <SheetTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">User Details</SheetTitle>
                      <button
                        onClick={() => { setDetailPanelUser(null); setRenamingUser(null); }}
                        className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-6">
                    {/* Profile section */}
                    <div className="flex items-start gap-4">
                      <div className="shrink-0">
                        {panelUser.avatar ? (
                          <img src={panelUser.avatar} alt={panelUser.name} className="h-16 w-16 rounded-xl object-cover ring-2 ring-brand/20" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                        ) : null}
                        <div className={`h-16 w-16 rounded-xl bg-brand text-black flex items-center justify-center font-black text-lg ${panelUser.avatar ? "hidden" : ""}`}>{initials}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <div className="flex gap-2">
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleRenameUser(panelUser.deviceId, renameValue); if (e.key === "Escape") setRenamingUser(null); }}
                              className="flex-1 font-bold"
                            />
                            <button
                              onClick={() => handleRenameUser(panelUser.deviceId, renameValue)}
                              className="h-9 w-9 rounded-lg bg-brand flex items-center justify-center shrink-0"
                            >
                              <Check className="h-3.5 w-3.5 text-black" weight="bold" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className="text-lg font-bold tracking-tight text-foreground truncate">{panelUser.name || "Unknown"}</p>
                            <button
                              onClick={() => { setRenamingUser(panelUser.deviceId); setRenameValue(panelUser.name); }}
                              className="h-6 w-6 rounded-md bg-secondary flex items-center justify-center text-muted-foreground hover:text-brand transition-colors shrink-0"
                              title="Rename user"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {panelUser.email && (
                          <p className="text-[11px] font-bold text-muted-foreground mt-1.5 flex items-center gap-1.5 truncate">
                            <Envelope className="h-3 w-3 shrink-0" />
                            {panelUser.email}
                          </p>
                        )}
                        <p className="text-[10px] font-bold text-muted-foreground mt-1 flex items-center gap-1 font-mono">
                          <Fingerprint className="h-3 w-3" />
                          {panelUser.deviceId}
                        </p>
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-secondary border border-border">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Trips</p>
                        <p className="text-2xl font-black tracking-tighter text-foreground mt-1">{panelUser.trips.length}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-secondary border border-border">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Role</p>
                        <p className="text-2xl font-black tracking-tighter text-foreground mt-1 capitalize">
                          {panelUser.trips.some(t => t.role === "leader") ? "Leader" : "Traveler"}
                        </p>
                      </div>
                    </div>

                    {/* Trip memberships */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Trip Memberships</p>
                      <div className="space-y-2.5">
                        {[...panelUser.trips].sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()).map(t => (
                          <div key={t.id} className="rounded-xl bg-secondary border border-border overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="h-9 w-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                                <MapPin className="h-4 w-4 text-brand" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">{t.name}</p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                                  Joined {new Date(t.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleToggleRole(panelUser.deviceId, t.id, t.role)}
                                  className={`h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-1.5 ${
                                    t.role === "leader"
                                      ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30 hover:bg-amber-500/25"
                                      : "bg-card text-muted-foreground ring-1 ring-slate-200 dark:ring-[#333] hover:ring-brand/40 hover:text-brand"
                                  }`}
                                >
                                  <SealCheck className="h-3 w-3" />
                                  {t.role === "leader" ? "Leader" : "Traveler"}
                                </button>
                                <button
                                  onClick={() => handleRemoveFromTrip(panelUser.deviceId, t.id, t.name)}
                                  disabled={removingFromTrip === `${panelUser.deviceId}_${t.id}`}
                                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={`Remove from ${t.name}`}
                                >
                                  {removingFromTrip === `${panelUser.deviceId}_${t.id}` ? (
                                    <SpinnerGap className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <SignOut className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Activity timeline */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Activity Timeline</p>
                      <div className="relative pl-5">
                        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-secondary" />
                        {[...panelUser.trips]
                          .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
                          .map((t, i) => (
                          <div key={t.id} className="relative pb-4 last:pb-0">
                            <div className="absolute -left-5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0a0a0a] bg-brand flex items-center justify-center">
                              {i === 0 && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="ml-1">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                {new Date(t.joinedAt).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "2-digit" })}
                              </p>
                              <p className="text-xs font-bold text-foreground mt-0.5">
                                Joined <span className="text-brand">{t.name}</span>
                                {t.role === "leader" && <span className="text-amber-500 ml-1">as Leader</span>}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Push notification */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Push Notification</p>
                      <div className="space-y-2">
                        <Input
                          value={pushMessage}
                          onChange={e => setPushMessage(e.target.value)}
                          placeholder="Type a message to send..."
                          onKeyDown={e => {
                            if (e.key === "Enter" && pushMessage.trim()) {
                              e.preventDefault();
                              sendPushToUser(panelUser.deviceId, panelUser.name);
                            }
                          }}
                          className="w-full font-bold"
                        />
                        <button
                          onClick={() => sendPushToUser(panelUser.deviceId, panelUser.name)}
                          disabled={sendingPush || !pushMessage.trim()}
                          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest ring-1 ring-brand/20 hover:bg-brand/20 transition-colors disabled:opacity-50"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          {sendingPush ? "Sending..." : "Send Notification"}
                        </button>
                      </div>
                    </div>

                    {/* Danger zone */}
                    <div className="pt-4 border-t border-border">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Danger Zone</p>
                      <button
                        onClick={() => handleDeleteAppUser(panelUser.deviceId, panelUser.name)}
                        disabled={deletingUser === panelUser.deviceId}
                        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingUser === panelUser.deviceId ? (
                          <><SpinnerGap className="h-3.5 w-3.5 animate-spin" /> Removing...</>
                        ) : (
                          <><Trash className="h-3.5 w-3.5" /> Remove User Completely</>
                        )}
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            );
          })()}
        </div>
      </div>

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
                  <Drawer.Title className="text-2xl font-bold tracking-tight text-foreground">Add Traveler</Drawer.Title>
                  <p className="text-[11px] font-medium text-muted-foreground mt-1">New team member</p>
                </div>
                <button onClick={() => setInviteOpen(false)} className="h-10 w-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddTraveler} className="space-y-6 max-w-lg mx-auto">
                {/* Name */}
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                  <Label className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                  <Label className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                    className="flex-1 h-10 rounded-xl bg-background border border-border text-muted-foreground text-xs font-black uppercase tracking-wider hover:text-foreground hover:border-slate-300 dark:hover:border-border transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-2 h-10 rounded-xl bg-brand text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" /> Add to Team
                  </button>
                </div>
              </form>

              {/* Existing team preview */}
              <div className="mt-10 pt-8 border-t border-border">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">Current Team · {travelers.length} members</p>
                <div className="flex flex-wrap gap-2">
                  {travelers.slice(0, 8).map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border border-border">
                      <div className="h-5 w-5 rounded-md bg-brand text-black flex items-center justify-center font-black text-[9px]">{u.initials}</div>
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
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Document Name</Label>
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
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Assign To</Label>
                  <button
                    onClick={() => setUploadAssignees(prev => prev.length === travelers.length ? [] : travelers.map(t => t.id))}
                    className="text-[10px] font-bold text-brand uppercase tracking-wider hover:opacity-70 transition-opacity"
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
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                          selected
                            ? "bg-brand/10 border-brand/30 text-brand"
                            : "bg-background border-border text-muted-foreground hover:border-brand/20"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-md flex items-center justify-center font-black text-[9px] ${selected ? "bg-brand text-black" : "bg-secondary text-muted-foreground"}`}>
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
                <button onClick={() => { setUploadOpen(false); setUploadDocName(""); setUploadAssignees([]); }} className="flex-1 h-10 rounded-xl border border-border text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleUploadDocument}
                  disabled={!uploadDocName.trim() || uploadAssignees.length === 0}
                  className="flex-2 h-10 rounded-xl bg-brand text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
        confirmLabel="Remove"
        onConfirm={() => { pendingConfirm?.action(); setPendingConfirm(null); }}
        destructive
      />
    </div>
  );
}
