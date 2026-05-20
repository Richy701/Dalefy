import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
import { MagnifyingGlass, UserPlus, FileText, FileMinus, FileDashed, FileX, PaperPlaneTilt, Eye, ShieldWarning, ShieldCheck, Clock, ChartBar, CaretUp, CaretDown, CaretUpDown, CaretLeft as PgLeft, CaretRight as PgRight, X, User, Envelope, Briefcase, DeviceMobile, MapPin, CalendarDots, Upload, Check, Trash, Fingerprint, Pencil, DotsThree, FunnelSimple, ArrowsDownUp, SignOut, Bell, DownloadSimple, CheckSquare, Square, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE } from "@/config/storageKeys";
import { MOCK_USERS } from "@/data/mock-users";
import { PageHeader } from "@/components/shared/PageHeader";
import { BrandIllustration } from "@/components/shared/BrandIllustration";
import { usePreferences } from "@/context/PreferencesContext";
import { ComplianceDocSheet } from "@/components/shared/ComplianceDocSheet";
import { fetchTripMembers, deleteAllTripMembers, deleteAppUser, removeUserFromTrip, renameAppUser, updateTripMemberRole, type TripMember, type TripMemberRole } from "@/services/firebaseTrips";
import { isFirebaseConfigured, firebaseAuth } from "@/services/firebase";
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

const DOC_STATUS_CONFIG: Record<ComplianceDoc["status"], { color: string; bg: string; icon: typeof FileCheck; bar: string }> = {
  Signed: { color: "text-brand", bg: "bg-brand/10", icon: FileText, bar: "bg-brand" },
  Pending: { color: "text-brand", bg: "bg-brand/10", icon: FileDashed, bar: "bg-brand" },
  Expired: { color: "text-brand", bg: "bg-brand/10", icon: FileX, bar: "bg-brand" },
  "Not Required": { color: "text-slate-500 dark:text-[#888]", bg: "bg-slate-100 dark:bg-[#1a1a1a]", icon: FileMinus, bar: "bg-slate-300 dark:bg-[#333]" },
};

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  Active: { dot: "bg-brand", badge: "bg-brand/15 text-brand ring-1 ring-brand/30", label: "Active" },
  Away: { dot: "bg-brand/50", badge: "bg-brand/10 text-brand/70 ring-1 ring-brand/20", label: "Away" },
  Offline: { dot: "bg-slate-400", badge: "bg-slate-200 dark:bg-[#222] text-slate-600 dark:text-[#888] ring-1 ring-slate-300 dark:ring-[#333]", label: "Offline" },
};

export function TravelersPage() {
  const { trips } = useTrips();
  const { showToast } = useNotifications();
  const { resolvedAccent } = usePreferences();
  const { user } = useAuth();
  const isDemoUser = !user || user.id === "demo" || (user.id?.length ?? 0) <= 20;
  const { demoGate, upgradeOpen, setUpgradeOpen } = useDemo();
  const { isViewer } = usePermissions();
  const brandHex = resolvedAccent;
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
  const [clearing, setClearing] = useState(false);
  const [appUserSort, setAppUserSort] = useState<"name" | "recent" | "trips">("recent");
  const [appUserTripFilter, setAppUserTripFilter] = useState<string>("all");
  const [detailPanelUser, setDetailPanelUser] = useState<string | null>(null);
  const [renamingUser, setRenamingUser] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
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
    if (!showSortMenu && !showFilterMenu && !showActionsMenu) return;
    const close = () => { setShowSortMenu(false); setShowFilterMenu(false); setShowActionsMenu(false); };
    const timer = setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", close); };
  }, [showSortMenu, showFilterMenu, showActionsMenu]);

  useEffect(() => {
    if (!detailPanelUser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDetailPanelUser(null); setRenamingUser(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailPanelUser]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    setAppUsersLoading(true);
    fetchTripMembers()
      .then(setAppUsers)
      .finally(() => setAppUsersLoading(false));
  }, []);

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
          showToast("Failed to clear app users — check console for details");
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
          showToast("Failed to remove user — check console");
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDoc, setSheetDoc] = useState<ComplianceDoc | null>(null);
  const [sheetTraveler, setSheetTraveler] = useState("");
  const [sheetUserId, setSheetUserId] = useState("");
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  // Upload document state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAssignees, setUploadAssignees] = useState<string[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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

  const filteredAllDocs = useMemo(() => allDocs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.userName.toLowerCase().includes(q) || d.doc.name.toLowerCase().includes(q);
  }), [allDocs, search]);

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
    showToast("Document signed successfully");
  }, [sheetUserId, travelers, setComplianceOverrides, showToast]);

  const handleUploadDocument = useCallback(() => {
    if (!uploadDocName.trim() || !uploadFile || uploadAssignees.length === 0) return;
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
    setUploadFile(null);
    setUploadAssignees([]);
  }, [uploadDocName, uploadFile, uploadAssignees, travelers, setComplianceOverrides, showToast]);

  const handleSendReminder = useCallback(async (userId: string, userName: string, docName: string) => {
    const key = `${userId}-${docName}`;
    setSendingReminder(key);
    await new Promise(r => setTimeout(r, 800));
    setSendingReminder(null);
    showToast(`Reminder sent to ${userName}`);
  }, [showToast]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <PageHeader
        left={travelers.length > 0 ? (
          <div className="max-w-[140px] sm:max-w-md w-full relative group">
            <MagnifyingGlass className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-brand transition-colors pointer-events-none" />
            <label htmlFor="search-travelers" className="sr-only">Search travelers</label>
            <input id="search-travelers" value={search} onChange={e => { setSearch(e.target.value); setHrPage(0); }} placeholder="Search..." className="pl-9 sm:pl-12 h-10 sm:h-11 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 w-full text-xs font-bold tracking-widest uppercase shadow-inner" />
          </div>
        ) : undefined}
        cta={!isViewer ? (
          <Button onClick={() => { if (!demoGate()) setInviteOpen(true); }} className="rounded-full bg-brand hover:opacity-90 text-black font-bold h-11 px-4 lg:px-6 gap-2 text-xs uppercase tracking-wider shadow-sm shrink-0">
            <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">ADD TRAVELER</span>
          </Button>
        ) : undefined}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 sm:px-4 lg:px-8 py-5 sm:py-7 space-y-4 sm:space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-4 sm:pb-6 border-b border-slate-200 dark:border-[#1a1a1a]">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl lg:text-4xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none text-balance">Team Directory</h2>
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 dark:text-[#888888]">People & Documents</span>
                <span className="text-slate-200 dark:text-[#333]">·</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-brand">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  {travelers.length} {travelers.length === 1 ? "Member" : "Members"}
                </span>
                {!isDemoUser && travelers.filter(t => t.status === "Active").length > 0 && (
                  <><span className="text-slate-200 dark:text-[#333]">·</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">
                    {travelers.filter(t => t.status === "Active").length} on app
                  </span></>
                )}
              </div>
            </div>
            <div className="shrink-0 overflow-x-auto scrollbar-hide">
              <div className="inline-flex bg-slate-100 dark:bg-[#0c0c0c] p-1 rounded-2xl border border-slate-200 dark:border-[#1a1a1a] gap-0">
                {(["travelers", "hr", "app-users"] as const).map(t => {
                  const active = tab === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`relative flex-none h-auto px-4 sm:px-7 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all duration-300 ${
                        active
                          ? "bg-brand text-black shadow-md shadow-brand/20"
                          : "text-slate-400 dark:text-[#666] hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {t === "travelers" ? "Team Overview" : t === "hr" ? "Documents" : (
                        <span className="flex items-center gap-1.5">
                          <DeviceMobile className="h-3 w-3" />
                          App Users
                          {groupedAppUsers.length > 0 && (
                            <span className={`ml-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              active ? "bg-black/15 text-black" : "bg-brand/15 text-brand"
                            }`}>{groupedAppUsers.length}</span>
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
            <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fade-in">
              <BrandIllustration src="/illustrations/illus-discussion.svg" className="w-72 h-72 object-contain mb-[-24px]" draggable={false} />
              <div className="text-center space-y-1.5">
                <p className="text-base font-black uppercase tracking-widest text-slate-800 dark:text-white">No team members</p>
                <p className="text-xs font-medium text-slate-400 dark:text-[#666]">Add your first traveler to get started</p>
              </div>
              {!isViewer && (
                <button
                  onClick={() => { if (!demoGate()) setInviteOpen(true); }}
                  className="h-10 px-6 rounded-full bg-brand text-[#050505] text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                >
                  Add Traveler
                </button>
              )}
            </div>
          )}
          {tab === "travelers" && travelers.length > 0 && (
            <div className="animate-fade-in">
              {/* ── Mobile card layout (< sm) ── */}
              <div className="sm:hidden space-y-2.5">
                {table.getRowModel().rows.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-brand opacity-60" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">No team members yet</p>
                  </div>
                )}
                {table.getRowModel().rows.map(row => {
                  const user = row.original;
                  const docs = user.compliance.filter(d => d.status !== "Not Required");
                  const signedCount = docs.filter(d => d.status === "Signed").length;
                  const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG["Offline"];
                  return (
                    <div key={row.id} className="bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] p-4 shadow-sm dark:shadow-none">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs shrink-0">{user.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">{user.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-[#888888] truncate mt-0.5">{user.email || <span className="text-slate-300 dark:text-[#333] italic">No email</span>}</div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${statusCfg.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-[#1a1a1a]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">{user.role}</span>
                        <span className="text-slate-200 dark:text-[#333]">·</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">{user.assignedTrips.length} {user.assignedTrips.length === 1 ? "trip" : "trips"}</span>
                        <span className="text-slate-200 dark:text-[#333]">·</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] tabular-nums">{signedCount}/{docs.length} docs</span>
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
                                className={`h-[22px] px-1.5 rounded text-[9px] font-black uppercase tracking-wide transition-all hover:scale-110 hover:brightness-110 ${cfg.bg} ${cfg.color}`}
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
              <div className="hidden sm:block bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} className="bg-slate-50/50 dark:bg-[#0a0a0a] border-b border-slate-200 dark:border-[#1f1f1f]">
                      {headerGroup.headers.map(header => {
                        const isSorted = header.column.getIsSorted();
                        const canSort = header.column.getCanSort();
                        return (
                          <th
                            key={header.id}
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                            className={`px-6 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888] ${header.id === "status" ? "text-right" : ""} ${canSort ? "cursor-pointer select-none hover:text-brand transition-colors" : ""}`}
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
                <tbody className="divide-y divide-slate-100 dark:divide-[#1a1a1a]">
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-brand opacity-60" />
                          </div>
                          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">No team members yet</p>
                          <p className="text-[11px] font-bold text-slate-400 dark:text-[#444] uppercase tracking-wider">Add your first traveler using the button above</p>
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
                      <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-[#0a0a0a]/80 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3.5">
                            <div className="h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs shrink-0">{user.initials}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white truncate group-hover:text-brand transition-colors">{user.name}</div>
                              <div className="text-[11px] text-slate-500 dark:text-[#888888] truncate mt-0.5">{user.email || <span className="text-slate-300 dark:text-[#333] italic">No email</span>}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-semibold text-slate-600 dark:text-[#aaa]">{user.role}</span>
                        </td>
                        <td className="px-6 py-5">
                          {user.assignedTrips.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-black tracking-tighter text-slate-900 dark:text-white tabular-nums">{user.assignedTrips.length}</span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-[#666] truncate max-w-[180px]" title={user.assignedTrips.join(", ")}>{user.assignedTrips.join(", ")}</span>
                            </div>
                          ) : (
                            <span className="text-sm font-black tracking-tighter text-slate-400 dark:text-[#555] tabular-nums">0</span>
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
                                    className={`h-[22px] px-1.5 rounded text-[9px] font-black uppercase tracking-wide transition-all hover:scale-110 hover:brightness-110 ${cfg.bg} ${cfg.color}`}
                                  >
                                    {abbr}
                                  </button>
                                );
                              })}
                            </div>
                            <span className="text-xs font-black tracking-tighter text-slate-500 dark:text-[#888888] tabular-nums">{signedCount}<span className="text-slate-300 dark:text-[#444]">/{docs.length}</span></span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${statusCfg.badge}`}>
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

              {/* Pagination — only shown when data > 10 */}
              {table.getPageCount() > 1 && (
                <div className="px-6 py-4 border-t border-slate-100 dark:border-[#1a1a1a] flex items-center justify-between bg-slate-50/30 dark:bg-[#0a0a0a]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {filtered.length} members
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      aria-label="Previous page"
                    >
                      <PgLeft className="h-4 w-4" />
                    </button>
                    {Array.from({ length: table.getPageCount() }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => table.setPageIndex(i)}
                        className={`h-8 w-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          table.getState().pagination.pageIndex === i
                            ? "bg-brand text-black shadow-sm"
                            : "text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-brand/5"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">
                    {table.getState().pagination.pageIndex + 1}/{table.getPageCount()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-brand bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Previous page"
                    >
                      <PgLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-brand bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] disabled:opacity-30 disabled:cursor-not-allowed"
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
            <div className="space-y-8 animate-fade-in">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {[
                  { label: "Signed", value: hrStats.signed.toString(), sub: "All done", icon: <ShieldCheck className="h-4 w-4" />, accent: "text-brand", bar: brandHex },
                  { label: "Needs Signing", value: hrStats.pending.toString(), sub: "Waiting on someone", icon: <Clock className="h-4 w-4" />, accent: "text-brand", bar: brandHex },
                  { label: "Expired", value: hrStats.expired.toString(), sub: "Needs renewal", icon: <ShieldWarning className="h-4 w-4" />, accent: "text-brand", bar: brandHex },
                  { label: "Up to Date", value: `${hrStats.rate}%`, sub: "Across all members", icon: <ChartBar className="h-4 w-4" />, accent: "text-brand", bar: brandHex },
                ].map(card => (
                  <div key={card.label} className="rounded-2xl border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] overflow-hidden shadow-xl hover:-translate-y-0.5 transition-transform duration-300">
                    <div className="p-5 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500 dark:text-[#888]">{card.label}</span>
                        <div className={`h-8 w-8 rounded-lg border border-slate-100 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] ${card.accent} flex items-center justify-center`}>
                          {card.icon}
                        </div>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">{card.value}</p>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888] mt-4">{card.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload button */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#888]">All Documents</p>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity shadow-lg shadow-brand/20"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Document
                </button>
              </div>

              {filteredGroupedDocs.length === 0 ? (
                <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-brand opacity-60" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">No documents yet</p>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-[#444] uppercase tracking-wider">Add team members to track compliance</p>
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
                      <div key={userId} className="bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-xl">
                        {/* Person header */}
                        <div className="px-5 pt-5 pb-4 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-[11px] shrink-0">{initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">{userName}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666]">
                              {allGood ? "All signed" : `${signed} of ${total} signed`}
                            </p>
                          </div>
                        </div>

                        {/* Document rows */}
                        <div className="border-t border-slate-100 dark:border-[#1a1a1a]">
                          {visibleDocs.map(doc => {
                            const cfg = DOC_STATUS_CONFIG[doc.status];
                            const Icon = cfg.icon;
                            const reminderKey = `${userId}-${doc.name}`;
                            const isSending = sendingReminder === reminderKey;
                            return (
                              <div
                                key={`${userId}-${doc.name}`}
                                className="flex items-center px-5 py-3 gap-3 border-b border-slate-50 dark:border-[#151515] last:border-b-0 group hover:bg-slate-50/50 dark:hover:bg-[#0a0a0a] transition-colors"
                              >
                                <div className={`h-7 w-7 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center shrink-0`}>
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-[#aaa] truncate">{doc.name}</p>
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-[#555]">
                                    {doc.date ? new Date(doc.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "Not signed yet"}
                                  </p>
                                </div>
                                <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none uppercase tracking-wider shrink-0 ${cfg.bg} ${cfg.color}`}>{doc.status}</Badge>
                                {doc.status === "Signed" ? (
                                  <button onClick={() => openDocSheet(userId, userName, doc)} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-[#777] hover:text-brand hover:border-brand/40 transition-all">
                                    <Eye className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => openDocSheet(userId, userName, doc)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-[10px] font-black uppercase tracking-widest text-black hover:opacity-90 transition-opacity">
                                      Sign
                                    </button>
                                    <button onClick={() => handleSendReminder(userId, userName, doc.name)} disabled={isSending} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-[#777] hover:text-brand hover:border-brand/40 transition-all disabled:opacity-50">
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
                            className="w-full py-2.5 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-[#555] hover:text-brand transition-colors border-t border-slate-100 dark:border-[#1a1a1a] cursor-pointer"
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
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">
                      Page {safePage + 1} of {hrTotalPages} · {filteredGroupedDocs.length} people
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHrPage(p => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Previous page"
                      >
                        <PgLeft className="h-4 w-4" />
                      </button>
                      {Array.from({ length: hrTotalPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setHrPage(i)}
                          className={`h-8 w-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                            safePage === i
                              ? "bg-brand text-black shadow-sm"
                              : "text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-brand/5"
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setHrPage(p => Math.min(hrTotalPages - 1, p + 1))}
                        disabled={safePage >= hrTotalPages - 1}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
            <div className="space-y-6 animate-fade-in">
              {/* Stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {[
                  { label: "App Users", value: groupedAppUsers.length.toString(), icon: <DeviceMobile className="h-4 w-4" />, accent: "text-brand" },
                  { label: "Total Joins", value: appUsers.length.toString(), icon: <MapPin className="h-4 w-4" />, accent: "text-brand" },
                  { label: "Unique Trips", value: new Set(appUsers.map(m => m.trip_id)).size.toString(), icon: <CalendarDots className="h-4 w-4" />, accent: "text-brand" },
                ].map(card => (
                  <div key={card.label} className="rounded-2xl border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] overflow-hidden shadow-xl">
                    <div className="p-5 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500 dark:text-[#888]">{card.label}</span>
                        <div className={`h-8 w-8 rounded-lg border border-slate-100 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] ${card.accent} flex items-center justify-center`}>
                          {card.icon}
                        </div>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Toolbar: sort, filter, actions */}
              {groupedAppUsers.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] mr-auto">
                    {filteredAppUsers.length} User{filteredAppUsers.length === 1 ? "" : "s"}
                    {appUserTripFilter !== "all" && <span className="text-brand ml-1">· Filtered</span>}
                  </p>

                  {/* Sort dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowSortMenu(!showSortMenu); setShowFilterMenu(false); setShowActionsMenu(false); }}
                      className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-[#888] hover:text-brand hover:border-brand/30 transition-colors"
                    >
                      <ArrowsDownUp className="h-3.5 w-3.5" />
                      {appUserSort === "name" ? "Name" : appUserSort === "trips" ? "Trips" : "Recent"}
                    </button>
                    {showSortMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-44 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-xl z-20 overflow-hidden">
                        {([["recent", "Most Recent"], ["name", "Name A-Z"], ["trips", "Most Trips"]] as const).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => { setAppUserSort(key); setShowSortMenu(false); }}
                            className={`w-full text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                              appUserSort === key
                                ? "text-brand bg-brand/5"
                                : "text-slate-600 dark:text-[#999] hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"
                            }`}
                          >
                            {label}
                            {appUserSort === key && <Check className="h-3 w-3 inline ml-2" weight="bold" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Filter by trip dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowFilterMenu(!showFilterMenu); setShowSortMenu(false); setShowActionsMenu(false); }}
                      className={`flex items-center gap-1.5 h-9 px-3.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
                        appUserTripFilter !== "all"
                          ? "bg-brand/10 border-brand/30 text-brand"
                          : "bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:text-brand hover:border-brand/30"
                      }`}
                    >
                      <FunnelSimple className="h-3.5 w-3.5" />
                      {appUserTripFilter !== "all" ? "Filtered" : "Trip"}
                    </button>
                    {showFilterMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto">
                        <button
                          onClick={() => { setAppUserTripFilter("all"); setShowFilterMenu(false); }}
                          className={`w-full text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            appUserTripFilter === "all"
                              ? "text-brand bg-brand/5"
                              : "text-slate-600 dark:text-[#999] hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"
                          }`}
                        >
                          All Trips
                        </button>
                        {uniqueAppTrips.map(t => (
                          <button
                            key={t.id}
                            onClick={() => { setAppUserTripFilter(t.id); setShowFilterMenu(false); }}
                            className={`w-full text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider truncate transition-colors ${
                              appUserTripFilter === t.id
                                ? "text-brand bg-brand/5"
                                : "text-slate-600 dark:text-[#999] hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"
                            }`}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions menu */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowActionsMenu(!showActionsMenu); setShowSortMenu(false); setShowFilterMenu(false); }}
                      className="flex items-center justify-center h-9 w-9 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:text-brand hover:border-brand/30 transition-colors"
                    >
                      <DotsThree className="h-4 w-4" weight="bold" />
                    </button>
                    {showActionsMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-xl z-20 overflow-hidden">
                        <button
                          onClick={() => { setShowActionsMenu(false); exportAppUsersCSV(); }}
                          className="w-full text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#999] hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors flex items-center gap-2"
                        >
                          <DownloadSimple className="h-3.5 w-3.5" /> Export CSV
                        </button>
                        <button
                          onClick={() => { setShowActionsMenu(false); setBulkAction(!bulkAction); setSelectedUsers(new Set()); }}
                          className="w-full text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#999] hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors flex items-center gap-2"
                        >
                          <CheckSquare className="h-3.5 w-3.5" /> {bulkAction ? "Exit Select Mode" : "Select Mode"}
                        </button>
                        <div className="border-t border-slate-100 dark:border-[#1a1a1a]" />
                        <button
                          onClick={() => { setShowActionsMenu(false); handleClearAppUsers(); }}
                          disabled={clearing}
                          className="w-full text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/5 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          <Trash className="h-3.5 w-3.5" />
                          {clearing ? "Clearing..." : "Clear All Users"}
                        </button>
                      </div>
                    )}
                  </div>
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
                    className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Users list */}
              <div className="bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
                {/* Header — hidden on mobile */}
                <div className="hidden sm:flex px-6 py-4 border-b border-slate-200 dark:border-[#1f1f1f] bg-slate-50/50 dark:bg-[#0a0a0a] items-center">
                  {bulkAction && <div className="w-10" />}
                  <div className="w-14" />
                  <div className="flex-1 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Name</div>
                  <div className="w-48 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Trips Joined</div>
                  <div className="w-40 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888] text-right">Last Active</div>
                </div>

                {appUsersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : paginatedAppUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center">
                      <DeviceMobile className="h-6 w-6 text-brand opacity-60" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">
                      {search || appUserTripFilter !== "all" ? "No matching users" : "No app users yet"}
                    </p>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-[#444] uppercase tracking-wider">
                      {search || appUserTripFilter !== "all" ? "Try a different search or filter" : "Users will appear here when they join a trip via the mobile app"}
                    </p>
                    {appUserTripFilter !== "all" && (
                      <button onClick={() => setAppUserTripFilter("all")} className="text-[10px] font-black uppercase tracking-widest text-brand hover:underline mt-1">
                        Clear Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-[#1a1a1a]">
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
                              className="w-full text-left p-4 hover:bg-slate-50/80 dark:hover:bg-[#0a0a0a]/80 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {bulkAction && (
                                  <div className="shrink-0">
                                    {selectedUsers.has(appUser.deviceId)
                                      ? <CheckSquare className="h-5 w-5 text-brand" weight="fill" />
                                      : <Square className="h-5 w-5 text-slate-400 dark:text-[#555]" />}
                                  </div>
                                )}
                                <div className="shrink-0">
                                  {appUser.avatar ? (
                                    <img src={appUser.avatar} alt={appUser.name} className="h-10 w-10 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                                  ) : null}
                                  <div className={`h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs ${appUser.avatar ? "hidden" : ""}`}>{initials}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white truncate"><HighlightText text={appUser.name || "Unknown"} query={search} /></div>
                                  {appUser.email && <div className="text-[10px] text-slate-400 dark:text-[#666] truncate">{appUser.email}</div>}
                                  <div className="text-[11px] text-slate-500 dark:text-[#888888] mt-0.5">{appUser.trips.length} trip{appUser.trips.length === 1 ? "" : "s"} · {new Date(latestJoin.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                                </div>
                                {!bulkAction && <PgRight className="h-4 w-4 text-slate-400 dark:text-[#555] shrink-0" />}
                              </div>
                            </button>
                          </div>

                          {/* ── Desktop row ── */}
                          <button
                            onClick={() => bulkAction ? toggleSelectUser(appUser.deviceId) : setDetailPanelUser(detailPanelUser === appUser.deviceId ? null : appUser.deviceId)}
                            className="hidden sm:flex w-full items-center px-6 py-4 hover:bg-slate-50/80 dark:hover:bg-[#0a0a0a]/80 transition-colors group text-left"
                          >
                            {bulkAction && (
                              <div className="w-10 shrink-0">
                                {selectedUsers.has(appUser.deviceId)
                                  ? <CheckSquare className="h-5 w-5 text-brand" weight="fill" />
                                  : <Square className="h-5 w-5 text-slate-300 dark:text-[#444] group-hover:text-slate-400 dark:group-hover:text-[#666] transition-colors" />}
                              </div>
                            )}
                            <div className="w-14 shrink-0">
                              {appUser.avatar ? (
                                <img src={appUser.avatar} alt={appUser.name} className="h-10 w-10 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                              ) : null}
                              <div className={`h-10 w-10 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs ${appUser.avatar ? "hidden" : ""}`}>{initials}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white truncate group-hover:text-brand transition-colors"><HighlightText text={appUser.name || "Unknown"} query={search} /></div>
                              <div className="text-[11px] text-slate-500 dark:text-[#888888] truncate mt-0.5 flex items-center gap-1">
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
                                  <span className="text-[10px] font-bold text-slate-400 dark:text-[#555] px-1.5 py-1">+{appUser.trips.length - 3}</span>
                                )}
                              </div>
                            </div>
                            <div className="w-40 flex items-center justify-end gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
                                {new Date(latestJoin.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                              </span>
                              {!bulkAction && <PgRight className={`h-4 w-4 text-slate-400 dark:text-[#555] transition-transform duration-200 ${detailPanelUser === appUser.deviceId ? "text-brand" : ""}`} />}
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#555]">
                    {safeAppUserPage * APP_USERS_PER_PAGE + 1}-{Math.min((safeAppUserPage + 1) * APP_USERS_PER_PAGE, filteredAppUsers.length)} of {filteredAppUsers.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAppUserPage(p => Math.max(0, p - 1))}
                      disabled={safeAppUserPage <= 0}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <PgLeft className="h-4 w-4" />
                    </button>
                    {Array.from({ length: appUserTotalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setAppUserPage(i)}
                        className={`h-8 w-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          safeAppUserPage === i
                            ? "bg-brand text-black shadow-sm"
                            : "text-slate-500 dark:text-[#888] hover:text-brand hover:bg-brand/5"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setAppUserPage(p => Math.min(appUserTotalPages - 1, p + 1))}
                      disabled={safeAppUserPage >= appUserTotalPages - 1}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
            return createPortal(
              <div className="fixed inset-0 z-50 flex justify-end" onClick={() => { setDetailPanelUser(null); setRenamingUser(null); }}>
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
                <div
                  className="relative w-full sm:w-[420px] h-full bg-white dark:bg-[#0a0a0a] sm:border-l border-slate-200 dark:border-[#1f1f1f] shadow-2xl overflow-y-auto animate-slide-in-right"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Panel header */}
                  <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-slate-200 dark:border-[#1f1f1f]">
                    <div className="flex items-center justify-between p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">User Details</p>
                      <button
                        onClick={() => { setDetailPanelUser(null); setRenamingUser(null); }}
                        className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-slate-900 dark:hover:text-white transition-colors"
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
                          <img src={panelUser.avatar} alt={panelUser.name} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-brand/20" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                        ) : null}
                        <div className={`h-16 w-16 rounded-2xl bg-brand text-black flex items-center justify-center font-black text-lg ${panelUser.avatar ? "hidden" : ""}`}>{initials}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleRenameUser(panelUser.deviceId, renameValue); if (e.key === "Escape") setRenamingUser(null); }}
                              className="flex-1 h-9 px-3 bg-slate-50 dark:bg-[#111111] border border-brand/40 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand/30"
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
                            <p className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">{panelUser.name || "Unknown"}</p>
                            <button
                              onClick={() => { setRenamingUser(panelUser.deviceId); setRenameValue(panelUser.name); }}
                              className="h-6 w-6 rounded-md bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-brand transition-colors shrink-0"
                              title="Rename user"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {panelUser.email && (
                          <p className="text-[11px] font-bold text-slate-500 dark:text-[#888] mt-1.5 flex items-center gap-1.5 truncate">
                            <Envelope className="h-3 w-3 shrink-0" />
                            {panelUser.email}
                          </p>
                        )}
                        <p className="text-[10px] font-bold text-slate-500 dark:text-[#666] mt-1 flex items-center gap-1 font-mono">
                          <Fingerprint className="h-3 w-3" />
                          {panelUser.deviceId}
                        </p>
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-100 dark:border-[#1a1a1a]">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">Trips</p>
                        <p className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white mt-1">{panelUser.trips.length}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-100 dark:border-[#1a1a1a]">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">Role</p>
                        <p className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white mt-1 capitalize">
                          {panelUser.trips.some(t => t.role === "leader") ? "Leader" : "Traveler"}
                        </p>
                      </div>
                    </div>

                    {/* Trip memberships */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555] mb-3">Trip Memberships</p>
                      <div className="space-y-2.5">
                        {[...panelUser.trips].sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()).map(t => (
                          <div key={t.id} className="rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-100 dark:border-[#1a1a1a] overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="h-9 w-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                                <MapPin className="h-4 w-4 text-brand" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{t.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-[#555] uppercase tracking-wider mt-0.5">
                                  Joined {new Date(t.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleToggleRole(panelUser.deviceId, t.id, t.role)}
                                  className={`h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] transition-all flex items-center gap-1.5 ${
                                    t.role === "leader"
                                      ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30 hover:bg-amber-500/25"
                                      : "bg-white dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888] ring-1 ring-slate-200 dark:ring-[#333] hover:ring-brand/40 hover:text-brand"
                                  }`}
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  {t.role === "leader" ? "Leader" : "Traveler"}
                                </button>
                                <button
                                  onClick={() => handleRemoveFromTrip(panelUser.deviceId, t.id, t.name)}
                                  disabled={removingFromTrip === `${panelUser.deviceId}_${t.id}`}
                                  className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555] mb-3">Activity Timeline</p>
                      <div className="relative pl-5">
                        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-slate-200 dark:bg-[#1f1f1f]" />
                        {[...panelUser.trips]
                          .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
                          .map((t, i) => (
                          <div key={t.id} className="relative pb-4 last:pb-0">
                            <div className="absolute -left-5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0a0a0a] bg-brand flex items-center justify-center">
                              {i === 0 && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="ml-1">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-[#555] uppercase tracking-wider">
                                {new Date(t.joinedAt).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "2-digit" })}
                              </p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
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
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555] mb-3">Push Notification</p>
                      <div className="space-y-2">
                        <input
                          value={pushMessage}
                          onChange={e => setPushMessage(e.target.value)}
                          placeholder="Type a message to send..."
                          onKeyDown={async e => {
                            if (e.key === "Enter" && pushMessage.trim()) {
                              e.preventDefault();
                              setSendingPush(true);
                              try {
                                const idToken = await firebaseAuth().currentUser?.getIdToken();
                                if (!idToken) throw new Error("Not authenticated");
                                const resp = await fetch("/api/send-push", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                                  body: JSON.stringify({ deviceId: panelUser.deviceId, title: "Dalefy", body: pushMessage.trim() }),
                                });
                                const data = await resp.json();
                                if (data.sent) showToast(`Notification sent to ${panelUser.name || "user"}`);
                                else showToast(data.reason || "No push token found for this user");
                              } catch {
                                showToast("Failed to send notification");
                              }
                              setSendingPush(false);
                              setPushMessage("");
                            }
                          }}
                          className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/20 transition-all"
                        />
                        <button
                          onClick={async () => {
                            if (!pushMessage.trim()) return;
                            setSendingPush(true);
                            try {
                              const idToken = await firebaseAuth().currentUser?.getIdToken();
                              if (!idToken) throw new Error("Not authenticated");
                              const resp = await fetch("/api/send-push", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                                body: JSON.stringify({ deviceId: panelUser.deviceId, title: "Dalefy", body: pushMessage.trim() }),
                              });
                              const data = await resp.json();
                              if (data.sent) showToast(`Notification sent to ${panelUser.name || "user"}`);
                              else showToast(data.reason || "No push token found for this user");
                            } catch {
                              showToast("Failed to send notification");
                            }
                            setSendingPush(false);
                            setPushMessage("");
                          }}
                          disabled={sendingPush || !pushMessage.trim()}
                          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest ring-1 ring-brand/20 hover:bg-brand/20 transition-colors disabled:opacity-50"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          {sendingPush ? "Sending..." : "Send Notification"}
                        </button>
                      </div>
                    </div>

                    {/* Danger zone */}
                    <div className="pt-4 border-t border-slate-100 dark:border-[#1a1a1a]">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555] mb-3">Danger Zone</p>
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
                </div>
              </div>,
              document.body,
            );
          })()}
        </div>
      </div>

      {/* Add Traveler — Vaul Drawer */}
      <Drawer.Root open={inviteOpen} onOpenChange={setInviteOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[2rem] bg-white dark:bg-[#111111] border-t border-slate-200 dark:border-[#1f1f1f] max-h-[90vh] focus:outline-none">
            {/* Drag handle */}
            <div className="mx-auto w-12 h-1 rounded-full bg-slate-200 dark:bg-[#2a2a2a] mt-4 shrink-0" />

            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10">
              <div className="pt-6 pb-8 flex items-start justify-between">
                <div>
                  <Drawer.Title className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Add Traveler</Drawer.Title>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] mt-1">New team member</p>
                </div>
                <button onClick={() => setInviteOpen(false)} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddTraveler} className="space-y-6 max-w-lg mx-auto">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2">
                    <User className="h-3 w-3" /> Full Name
                  </label>
                  <input
                    required
                    value={drawerForm.name}
                    onChange={e => setDrawerForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Alex Johnson"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2">
                    <Envelope className="h-3 w-3" /> Email Address
                  </label>
                  <input
                    required
                    type="email"
                    value={drawerForm.email}
                    onChange={e => setDrawerForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="name@dalefy.com"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all"
                  />
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2">
                    <Briefcase className="h-3 w-3" /> Role
                  </label>
                  <input
                    value={drawerForm.role}
                    onChange={e => setDrawerForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Travel Specialist"
                    list="role-suggestions"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all"
                  />
                  <datalist id="role-suggestions">
                    {["Lead Designer", "Senior Agent", "Travel Specialist", "Product Manager", "EU Sales Lead", "Content Creator", "Executive Advisor", "Operations Manager"].map(r => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="flex-1 h-12 rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#666] text-xs font-black uppercase tracking-wider hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#2a2a2a] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-12 rounded-2xl bg-brand text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" /> Add to Team
                  </button>
                </div>
              </form>

              {/* Existing team preview */}
              <div className="mt-10 pt-8 border-t border-slate-100 dark:border-[#1a1a1a]">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400 dark:text-[#444] mb-4">Current Team · {travelers.length} members</p>
                <div className="flex flex-wrap gap-2">
                  {travelers.slice(0, 8).map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1a1a1a]">
                      <div className="h-5 w-5 rounded-md bg-brand text-black flex items-center justify-center font-black text-[9px]">{u.initials}</div>
                      <span className="text-xs font-bold text-slate-500 dark:text-[#888] truncate max-w-[100px]">{u.name}</span>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${u.status === "Active" ? "bg-emerald-400" : u.status === "Away" ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-500"}`} />
                    </div>
                  ))}
                  {travelers.length > 8 && (
                    <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1a1a1a] text-[11px] font-bold text-slate-400 dark:text-[#555]">
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

      {/* Upload Document Drawer */}
      <Drawer.Root open={uploadOpen} onOpenChange={setUploadOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#111111] rounded-t-[2rem] border-t border-slate-200 dark:border-[#1f1f1f] max-h-[85vh] overflow-y-auto">
            <div className="mx-auto w-12 h-1.5 bg-slate-200 dark:bg-[#333] rounded-full mt-3 mb-2" />
            <div className="px-6 sm:px-8 pb-8">
              <p className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">Upload Document</p>
              <p className="text-xs font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider mb-6">Upload a file and assign it to team members for signing</p>

              {/* Document name */}
              <div className="space-y-2 mb-5">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">Document Name</label>
                <input
                  value={uploadDocName}
                  onChange={e => setUploadDocName(e.target.value)}
                  placeholder="e.g., NDA, Waiver, Health Declaration"
                  className="w-full h-11 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors"
                />
              </div>

              {/* File upload */}
              <div className="space-y-2 mb-5">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">File</label>
                <input ref={uploadInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf" className="hidden" onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
                {uploadFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-brand/5 border border-brand/20">
                    <div className="h-9 w-9 rounded-lg bg-brand/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{uploadFile.name}</p>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider">{(uploadFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => { setUploadFile(null); if (uploadInputRef.current) uploadInputRef.current.value = ""; }} className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1a1a1a] flex items-center justify-center transition-colors">
                      <X className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => uploadInputRef.current?.click()} className="w-full h-14 rounded-xl border-2 border-dashed border-slate-200 dark:border-[#252525] flex items-center justify-center gap-2 text-slate-500 dark:text-[#888] hover:border-brand/50 hover:text-brand transition-colors">
                    <Upload className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Choose file (PDF, DOC, TXT)</span>
                  </button>
                )}
              </div>

              {/* Assign to travelers */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">Assign To</label>
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
                            : "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:border-brand/20"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-md flex items-center justify-center font-black text-[9px] ${selected ? "bg-brand text-black" : "bg-slate-200 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#666]"}`}>
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
                <button onClick={() => { setUploadOpen(false); setUploadDocName(""); setUploadFile(null); setUploadAssignees([]); }} className="flex-1 h-12 rounded-2xl border border-slate-200 dark:border-[#1f1f1f] text-xs font-black uppercase tracking-wider text-slate-500 dark:text-[#888] hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleUploadDocument}
                  disabled={!uploadDocName.trim() || !uploadFile || uploadAssignees.length === 0}
                  className="flex-[2] h-12 rounded-2xl bg-brand text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
