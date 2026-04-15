import { useState, useMemo, useCallback, useRef } from "react";
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
import { useVirtualizer } from "@tanstack/react-virtual";
import { Drawer } from "vaul";
import { Search, UserPlus, FileCheck, FileWarning, FileClock, FileX, Send, Eye, ShieldAlert, ShieldCheck, Clock, BarChart3, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft as PgLeft, ChevronRight as PgRight, X, User, Mail, Briefcase} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { MOCK_USERS } from "@/data/mock-users";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComplianceDocSheet } from "@/components/shared/ComplianceDocSheet";
import type { ComplianceDoc, User as UserType } from "@/types";

type Tab = "travelers" | "hr";


const DOC_STATUS_CONFIG: Record<ComplianceDoc["status"], { color: string; bg: string; icon: typeof FileCheck; bar: string }> = {
  Signed: { color: "text-emerald-400", bg: "bg-emerald-500/10", icon: FileCheck, bar: "bg-emerald-500" },
  Pending: { color: "text-amber-500", bg: "bg-amber-500/10", icon: FileClock, bar: "bg-amber-400" },
  Expired: { color: "text-red-400", bg: "bg-red-500/10", icon: FileX, bar: "bg-red-500" },
  "Not Required": { color: "text-slate-400 dark:text-[#888]", bg: "bg-slate-100 dark:bg-[#1a1a1a]", icon: FileWarning, bar: "bg-slate-300 dark:bg-[#333]" },
};

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  Active: { dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30", label: "Active" },
  Away: { dot: "bg-amber-500", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30", label: "Away" },
  Offline: { dot: "bg-slate-400", badge: "bg-slate-200 dark:bg-[#222] text-slate-600 dark:text-[#888] ring-1 ring-slate-300 dark:ring-[#333]", label: "Offline" },
};

export function TravelersPage() {
  const { trips } = useTrips();
  const { showToast, addNotification } = useNotifications();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("travelers");

  const [complianceOverrides, setComplianceOverrides] = useLocalStorage<Record<string, ComplianceDoc[]>>("daf-compliance", {});
  const [customTravelers, setCustomTravelers] = useLocalStorage<UserType[]>("daf-custom-travelers", []);

  // Add Traveler drawer form
  const [drawerForm, setDrawerForm] = useState({ name: "", email: "", role: "", status: "Active" as UserType["status"] });

  const [sorting, setSorting] = useState<SortingState>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDoc, setSheetDoc] = useState<ComplianceDoc | null>(null);
  const [sheetTraveler, setSheetTraveler] = useState("");
  const [sheetUserId, setSheetUserId] = useState("");
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  const travelers = useMemo(() => {
    const attendeeMap = new Map<string, string[]>();
    trips.forEach(t => {
      const name = t.attendees;
      if (!attendeeMap.has(name)) attendeeMap.set(name, []);
      attendeeMap.get(name)!.push(t.name);
    });

    const allUsers = [...MOCK_USERS, ...customTravelers];
    return allUsers.map(user => {
      const assignedTrips = attendeeMap.get(user.name) || [];
      trips.forEach(t => {
        if (t.attendees.includes(user.name) && !assignedTrips.includes(t.name)) {
          assignedTrips.push(t.name);
        }
      });
      const compliance = complianceOverrides[user.id] || user.compliance || [];
      return { ...user, assignedTrips, compliance };
    });
  }, [trips, complianceOverrides, customTravelers]);

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
    travelers.forEach(t => {
      t.compliance.forEach(d => {
        if (d.status !== "Not Required") {
          docs.push({ userId: t.id, userName: t.name, initials: t.initials, doc: d });
        }
      });
    });
    const priority: Record<string, number> = { Expired: 0, Pending: 1, Signed: 2 };
    docs.sort((a, b) => (priority[a.doc.status] ?? 3) - (priority[b.doc.status] ?? 3));
    return docs;
  }, [travelers]);

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

  // Virtual scrolling for HR docs
  const hrParentRef = useRef<HTMLDivElement>(null);
  const filteredAllDocs = useMemo(() => allDocs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.userName.toLowerCase().includes(q) || d.doc.name.toLowerCase().includes(q);
  }), [allDocs, search]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAllDocs.length,
    getScrollElement: () => hrParentRef.current,
    estimateSize: () => 68,
    overscan: 5,
  });

  const handleAddTraveler = useCallback((e: React.FormEvent) => {
    e.preventDefault();
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
    addNotification({ message: "Traveler added", detail: newUser.name, time: "Just now", type: "success" });
  }, [drawerForm, setCustomTravelers, showToast, addNotification]);

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
    addNotification({ message: "Document signed", detail: `${docName} — ${user.name}`, time: "Just now", type: "success" });
  }, [sheetUserId, travelers, setComplianceOverrides, showToast, addNotification]);

  const handleSendReminder = useCallback(async (userId: string, userName: string, docName: string) => {
    const key = `${userId}-${docName}`;
    setSendingReminder(key);
    await new Promise(r => setTimeout(r, 800));
    setSendingReminder(null);
    showToast(`Reminder sent to ${userName}`);
    addNotification({ message: "Reminder sent", detail: `${docName} — ${userName}`, time: "Just now", type: "info" });
  }, [showToast, addNotification]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <PageHeader
        left={
          <div className="max-w-md w-full relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-[#0bd2b5] transition-colors pointer-events-none" />
            <label htmlFor="search-travelers" className="sr-only">Search travelers</label>
            <input id="search-travelers" value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH TRAVELERS..." className="pl-12 h-11 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-500/40 dark:placeholder:text-[#888888]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 w-full text-xs font-bold tracking-widest uppercase shadow-inner" />
          </div>
        }
        cta={
          <Button onClick={() => setInviteOpen(true)} className="rounded-full bg-[#0bd2b5] hover:opacity-90 text-black font-bold h-11 px-4 lg:px-6 gap-2 text-xs uppercase tracking-wider shadow-sm shrink-0">
            <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">ADD TRAVELER</span>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 lg:px-8 py-7 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-[#1a1a1a]">
            {/* Page identity */}
            <div>
              <div>
                <h2 className="text-2xl lg:text-4xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white leading-none text-balance">Team Directory</h2>
                <div className="flex items-center gap-2.5 mt-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-[#666]">People & Documents</span>
                  <span className="text-slate-200 dark:text-[#333]">·</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0bd2b5]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0bd2b5]" />
                    {travelers.length} Active Members
                  </span>
                </div>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 bg-slate-100 dark:bg-[#0c0c0c] p-1 rounded-2xl border border-slate-200 dark:border-[#1a1a1a] shrink-0">
              {(["travelers", "hr"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative px-7 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/40 focus-visible:ring-offset-2 ${
                    tab === t
                      ? "bg-white dark:bg-[#1a1a1a] text-[#0bd2b5] shadow-md shadow-black/10 dark:shadow-black/40"
                      : "text-slate-400 dark:text-[#555] hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {t === "travelers" ? "Team Overview" : "Documents"}
                  {tab === t && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#0bd2b5]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ───────── TRAVELERS TAB (TANSTACK TABLE) ───────── */}
          {tab === "travelers" && (
            <div className="bg-white dark:bg-[#111111] rounded-2xl animate-fade-in border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
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
                            className={`px-6 py-5 text-[10px] font-black italic uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] ${header.id === "status" ? "text-right" : ""} ${canSort ? "cursor-pointer select-none hover:text-[#0bd2b5] transition-colors" : ""}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {canSort && (
                                <span className="opacity-60">
                                  {isSorted === "asc" ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : isSorted === "desc" ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronsUpDown className="h-3 w-3" />
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
                  {table.getRowModel().rows.map(row => {
                    const user = row.original;
                    const docs = user.compliance.filter(d => d.status !== "Not Required");
                    const signedCount = docs.filter(d => d.status === "Signed").length;
                    const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG["Offline"];
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-[#0a0a0a]/80 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3.5">
                            <div className="h-10 w-10 rounded-xl bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-xs shrink-0">{user.initials}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate group-hover:text-[#0bd2b5] transition-colors">{user.name}</div>
                              <div className="text-[11px] text-slate-400 dark:text-[#666] truncate mt-0.5">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-semibold text-slate-600 dark:text-[#aaa]">{user.role}</span>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white tabular-nums">{user.assignedTrips.length}</span>
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
                            <span className="text-xs font-black italic tracking-tighter text-slate-400 dark:text-[#666] tabular-nums">{signedCount}<span className="text-slate-300 dark:text-[#444]">/{docs.length}</span></span>
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

              {/* Pagination — only shown when data > 10 */}
              {table.getPageCount() > 1 && (
                <div className="px-6 py-4 border-t border-slate-100 dark:border-[#1a1a1a] flex items-center justify-between bg-slate-50/30 dark:bg-[#0a0a0a]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#555]">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {filtered.length} members
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-[#0bd2b5] hover:bg-[#0bd2b5]/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                            ? "bg-[#0bd2b5] text-black shadow-sm"
                            : "text-slate-400 dark:text-[#555] hover:text-[#0bd2b5] hover:bg-[#0bd2b5]/5"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-[#0bd2b5] hover:bg-[#0bd2b5]/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                  { label: "Signed", value: hrStats.signed.toString(), sub: "All done", icon: <ShieldCheck className="h-4 w-4" />, accent: "text-emerald-400", bar: "#34d399" },
                  { label: "Needs Signing", value: hrStats.pending.toString(), sub: "Waiting on someone", icon: <Clock className="h-4 w-4" />, accent: "text-amber-500", bar: "#fbbf24" },
                  { label: "Expired", value: hrStats.expired.toString(), sub: "Needs renewal", icon: <ShieldAlert className="h-4 w-4" />, accent: "text-red-400", bar: "#f87171" },
                  { label: "Up to Date", value: `${hrStats.rate}%`, sub: "Across all members", icon: <BarChart3 className="h-4 w-4" />, accent: "text-[#0bd2b5]", bar: "#0bd2b5" },
                ].map(card => (
                  <div key={card.label} className="rounded-2xl border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] overflow-hidden shadow-xl hover:-translate-y-0.5 transition-transform duration-300">
                    <div className="p-5 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400 dark:text-[#888]">{card.label}</span>
                        <div className={`h-8 w-8 rounded-lg border border-slate-100 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] ${card.accent} flex items-center justify-center`}>
                          {card.icon}
                        </div>
                      </div>
                      <p className="text-4xl font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{card.value}</p>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#888] mt-4">{card.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
                <div className="pl-8 pr-6 py-3 border-b border-slate-200 dark:border-[#1f1f1f] bg-slate-50/50 dark:bg-[#0a0a0a] flex items-center gap-4 lg:gap-6">
                  <div className="h-9 w-9 shrink-0" />
                  <div className="min-w-[140px] text-[10px] font-black italic uppercase tracking-[0.25em] text-slate-400 dark:text-[#555]">Traveler</div>
                  <div className="flex-1 text-[10px] font-black italic uppercase tracking-[0.25em] text-slate-400 dark:text-[#555]">Document Type</div>
                  <div className="w-24 text-[10px] font-black italic uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] text-center">Status</div>
                  <div className="w-28 text-[10px] font-black italic uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] text-right hidden md:block">Date Signed</div>
                  <div className="w-48 text-[10px] font-black italic uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] text-right">Actions</div>
                </div>

                {/* Virtual scrolling list */}
                <div
                  ref={hrParentRef}
                  className="overflow-y-auto"
                  style={{ height: Math.min(filteredAllDocs.length * 68, 500) || 68 }}
                >
                  <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                    {rowVirtualizer.getVirtualItems().map(virtualRow => {
                      const { userId, userName, initials, doc } = filteredAllDocs[virtualRow.index];
                      const cfg = DOC_STATUS_CONFIG[doc.status];
                      const Icon = cfg.icon;
                      const reminderKey = `${userId}-${doc.name}`;
                      const isSending = sendingReminder === reminderKey;
                      return (
                        <div
                          key={`${userId}-${doc.name}`}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className="flex items-center px-6 gap-4 lg:gap-6 hover:bg-slate-50/50 dark:hover:bg-[#0a0a0a] transition-all group border-b border-slate-100 dark:border-[#1a1a1a]"
                        >
                          <div className="h-9 w-9 rounded-lg bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-xs shrink-0">{initials}</div>
                          <div className="min-w-[140px]">
                            <div className="text-xs font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate">{userName}</div>
                          </div>
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div className={`h-7 w-7 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center shrink-0`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#aaa] truncate">{doc.name}</span>
                          </div>
                          <div className="w-24 flex justify-center">
                            <Badge className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border-none uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>{doc.status}</Badge>
                          </div>
                          <div className="w-28 text-right hidden md:block">
                            <span className={`text-xs font-bold uppercase tracking-wider ${doc.date ? "text-slate-500" : "text-slate-300 italic"}`}>
                              {doc.date ? new Date(doc.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "Pending"}
                            </span>
                          </div>
                          <div className="w-48 flex justify-end shrink-0">
                            {doc.status === "Signed" ? (
                              <button onClick={() => openDocSheet(userId, userName, doc)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#1f1f1f] text-xs font-black uppercase tracking-widest text-slate-500 hover:text-[#0bd2b5] hover:border-[#0bd2b5]/40 transition-all">
                                <Eye className="h-3 w-3" /> REVIEW
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button onClick={() => openDocSheet(userId, userName, doc)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0bd2b5] text-xs font-black uppercase tracking-widest text-black hover:opacity-90">
                                  <FileCheck className="h-3 w-3" /> SIGN
                                </button>
                                <button onClick={() => handleSendReminder(userId, userName, doc.name)} disabled={isSending} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#1f1f1f] text-xs font-black uppercase tracking-widest text-slate-500 hover:text-amber-500 hover:border-amber-500/40 transition-all disabled:opacity-50">
                                  <Send className="h-3 w-3" /> {isSending ? "..." : "REMIND"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Traveler — Vaul Drawer */}
      <Drawer.Root open={inviteOpen} onOpenChange={setInviteOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[2rem] bg-[#111111] border-t border-[#1f1f1f] max-h-[90vh] focus:outline-none">
            {/* Drag handle */}
            <div className="mx-auto w-12 h-1 rounded-full bg-[#2a2a2a] mt-4 shrink-0" />

            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10">
              <div className="pt-6 pb-8 flex items-start justify-between">
                <div>
                  <Drawer.Title className="text-3xl font-black italic uppercase tracking-tight text-white">Add Traveler</Drawer.Title>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#555] mt-1">New team member</p>
                </div>
                <button onClick={() => setInviteOpen(false)} className="h-10 w-10 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-[#555] hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddTraveler} className="space-y-6 max-w-lg mx-auto">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.35em] text-[#666] flex items-center gap-2">
                    <User className="h-3 w-3" /> Full Name
                  </label>
                  <input
                    required
                    value={drawerForm.name}
                    onChange={e => setDrawerForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Alex Johnson"
                    className="w-full h-12 px-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 focus:ring-1 focus:ring-[#0bd2b5]/20 placeholder:text-[#444] transition-all"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.35em] text-[#666] flex items-center gap-2">
                    <Mail className="h-3 w-3" /> Email Address
                  </label>
                  <input
                    required
                    type="email"
                    value={drawerForm.email}
                    onChange={e => setDrawerForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="name@dafadventures.com"
                    className="w-full h-12 px-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 focus:ring-1 focus:ring-[#0bd2b5]/20 placeholder:text-[#444] transition-all"
                  />
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.35em] text-[#666] flex items-center gap-2">
                    <Briefcase className="h-3 w-3" /> Role
                  </label>
                  <input
                    value={drawerForm.role}
                    onChange={e => setDrawerForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Travel Specialist"
                    list="role-suggestions"
                    className="w-full h-12 px-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 focus:ring-1 focus:ring-[#0bd2b5]/20 placeholder:text-[#444] transition-all"
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
                    className="flex-1 h-12 rounded-2xl bg-[#0a0a0a] border border-[#1f1f1f] text-[#666] text-xs font-black uppercase tracking-wider hover:text-white hover:border-[#2a2a2a] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-12 rounded-2xl bg-[#0bd2b5] text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-[#0bd2b5]/20 flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" /> Add to Team
                  </button>
                </div>
              </form>

              {/* Existing team preview */}
              <div className="mt-10 pt-8 border-t border-[#1a1a1a]">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#444] mb-4">Current Team · {travelers.length} members</p>
                <div className="flex flex-wrap gap-2">
                  {travelers.slice(0, 8).map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a]">
                      <div className="h-5 w-5 rounded-md bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-[9px]">{u.initials}</div>
                      <span className="text-xs font-bold text-[#888] truncate max-w-[100px]">{u.name}</span>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${u.status === "Active" ? "bg-emerald-400" : u.status === "Away" ? "bg-amber-400" : "bg-slate-500"}`} />
                    </div>
                  ))}
                  {travelers.length > 8 && (
                    <div className="px-3 py-1.5 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] text-[11px] font-bold text-[#555]">
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
    </div>
  );
}
