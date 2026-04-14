import { useState, useMemo, useCallback } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Plane, Hotel, Calendar as LucideCalendar, MapPin, Users, ShieldCheck, Clock, BarChart3, FileCheck, AlertTriangle, Sun, Moon, CircleAlert, CheckCircle2, Clock4, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Label } from "recharts";
import { Badge } from "@/components/ui/badge";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripStats } from "@/hooks/useTripStats";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { MOCK_USERS } from "@/data/mock-users";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";
import type { ComplianceDoc } from "@/types";

type Tab = "operations" | "compliance";

const STATUS_COLORS: Record<string, string> = { Draft: "#64748b", Published: "#0bd2b5", "In Progress": "#f59e0b" };

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  return (
    <div style={{ background: "var(--tooltip-bg, #111)", border: "1px solid var(--tooltip-border, #2a2a2a)", borderRadius: 12, padding: "10px 14px", minWidth: 130 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 900, fontStyle: "italic", color: "#0bd2b5", fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
        {count} <span style={{ fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: "0.1em" }}>{count === 1 ? "TRIP" : "TRIPS"}</span>
      </p>
    </div>
  );
}

function StatCard({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] overflow-hidden shadow-xl hover:border-[#0bd2b5]/30 transition-[border-color,transform] group hover:-translate-y-0.5 duration-300">
      <div className="p-5 lg:p-7 flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500 dark:text-[#888]">{label}</span>
          <div className={`h-8 w-8 rounded-lg border border-slate-100 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] ${accent || "text-[#0bd2b5]"} flex items-center justify-center`}>
            {icon}
          </div>
        </div>
        <p className="text-5xl font-black italic tracking-tighter leading-none text-slate-900 dark:text-white">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#888] mt-5">{sub}</p>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { trips } = useTrips();
  const { theme, toggleTheme } = useTheme();
  const stats = useTripStats(trips);
  const [tab, setTab] = useState<Tab>("operations");
  const [complianceOverrides] = useLocalStorage<Record<string, ComplianceDoc[]>>("daf-compliance", {});

  const handleExportCsv = useCallback(() => {
    const rows = trips.map(t => ({
      "Trip Name": t.name,
      "Destination": t.destination || "",
      "Start Date": t.start,
      "End Date": t.end,
      "Event Count": t.events.length,
      "Traveler Count": t.paxCount || t.attendees || "",
      "Status": t.status,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daf-trips-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  }, [trips]);

  const isDark = theme === "dark";
  const chartColors = {
    text: isDark ? "#888888" : "#64748b",
    grid: isDark ? "#1f1f1f" : "#e2e8f0",
    bg: isDark ? "#111111" : "#ffffff",
  };

  // Compliance data (merged with localStorage, same as TravelersPage)
  const complianceData = useMemo(() => {
    const travelers = MOCK_USERS.map(u => ({
      ...u,
      compliance: complianceOverrides[u.id] || u.compliance || [],
    }));

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

    // Per doc type breakdown
    const docTypes = ["Passport", "Travel Insurance", "Behavioural Agreement", "Code of Conduct Review", "Risk Assessment"];
    const byDocType = docTypes.map(name => {
      let s = 0, p = 0, e = 0;
      travelers.forEach(t => {
        const doc = t.compliance.find(d => d.name === name);
        if (!doc || doc.status === "Not Required") return;
        if (doc.status === "Signed") s++;
        else if (doc.status === "Pending") p++;
        else if (doc.status === "Expired") e++;
      });
      return { name: name.length > 18 ? name.slice(0, 16) + "…" : name, fullName: name, signed: s, pending: p, expired: e };
    });

    // Recent activity (signed docs sorted by date)
    const recentActivity: { name: string; doc: string; date: string }[] = [];
    travelers.forEach(t => {
      t.compliance.forEach(d => {
        if (d.status === "Signed" && d.date) {
          recentActivity.push({ name: t.name, doc: d.name, date: d.date });
        }
      });
    });
    recentActivity.sort((a, b) => b.date.localeCompare(a.date));

    return { travelers, signed, pending, expired, total, rate, byDocType, recentActivity: recentActivity.slice(0, 6) };
  }, [complianceOverrides]);

  // Pipeline chart data
  const pipelineData = [
    { name: "Draft", value: stats.pipeline.draft, color: "#64748b" },
    { name: "Published", value: stats.pipeline.published, color: "#0bd2b5" },
    { name: "In Progress", value: stats.pipeline.inProgress, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <header className="h-20 shrink-0 border-b border-slate-200 dark:border-[#1f1f1f] px-4 lg:px-10 flex items-center justify-between sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
        <div className="flex-1 flex items-center gap-4 lg:gap-8">
          <MobileSidebar />
          <h2 className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Reports</h2>
        </div>
        <div className="flex items-center gap-3 lg:gap-6">
          <button aria-label="Toggle theme" onClick={toggleTheme} className="h-11 w-11 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationPanel />
          <div className="h-8 w-px bg-slate-200 dark:bg-[#1f1f1f] hidden lg:block" />
          <button
            onClick={handleExportCsv}
            className="hidden sm:flex items-center gap-2 h-11 px-5 rounded-full bg-[#0bd2b5] hover:opacity-90 text-black text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shadow-[#0bd2b5]/20"
            aria-label="Export trips as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 lg:px-10 py-10 space-y-8">
          {/* Title + tabs */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-8 border-b border-slate-200 dark:border-[#1a1a1a]">
            <div>
              <p className="text-[10px] font-black italic uppercase tracking-[0.4em] text-[#0bd2b5] mb-2">DAF Adventures</p>
              <h2 className="text-4xl lg:text-6xl font-black italic uppercase tracking-tight leading-none text-slate-900 dark:text-white">Reports</h2>
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-[#0c0c0c] p-1 rounded-2xl border border-slate-200 dark:border-[#1a1a1a] shrink-0">
              {(["operations", "compliance"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`relative px-7 py-3 rounded-xl text-[11px] font-black italic uppercase tracking-[0.2em] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/40 ${tab === t ? "bg-white dark:bg-[#1a1a1a] text-[#0bd2b5] shadow-md shadow-black/10 dark:shadow-black/40" : "text-slate-400 dark:text-[#555] hover:text-slate-700 dark:hover:text-slate-200"}`}>
                  {t === "operations" ? "Overview" : "Documents"}
                  {tab === t && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#0bd2b5]" />}
                </button>
              ))}
            </div>
          </div>

          {/* ───────── TRIP OPERATIONS ───────── */}
          {tab === "operations" && (
            <div className="space-y-8 animate-fade-in">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                <div className="animate-fade-up stagger-1"><StatCard label="Active Trips" value={stats.activeTrips.toString()} sub="Currently in progress" icon={<Plane className="h-5 w-5" />} /></div>
                <div className="animate-fade-up stagger-2"><StatCard label="Upcoming" value={stats.upcomingTrips.length.toString()} sub="Next 30 days" icon={<LucideCalendar className="h-5 w-5" />} /></div>
                <div className="animate-fade-up stagger-3"><StatCard label="Travel Days" value={stats.totalDays.toString()} sub="Total scheduled" icon={<Clock className="h-5 w-5" />} /></div>
                <div className="animate-fade-up stagger-4"><StatCard label="Destinations" value={stats.destinationCount.toString()} sub="Unique locations" icon={<MapPin className="h-5 w-5" />} /></div>
              </div>

              {/* Trip Pipeline — full-width card with chart + breakdown side by side */}
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Trip Pipeline</h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] mt-1">Status breakdown across all trips</p>
                </div>
                <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
                  {/* Donut chart */}
                  <div className="h-56 w-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
                      <PieChart>
                        <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value" stroke="none" cornerRadius={6}>
                          {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          <Label
                            content={() => (
                              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
                                <tspan x="50%" dy="-6" className="fill-slate-900 dark:fill-white" style={{ fontSize: 28, fontWeight: 900, fontStyle: "italic", letterSpacing: "-0.05em" }}>{stats.pipeline.total}</tspan>
                                <tspan x="50%" dy="20" className="fill-slate-400 dark:fill-[#555]" style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>TRIPS</tspan>
                              </text>
                            )}
                          />
                        </Pie>
                        <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ background: chartColors.bg, border: `1px solid ${chartColors.grid}`, borderRadius: 12, fontSize: 11, fontWeight: 700 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Status breakdown bars */}
                  <div className="flex-1 w-full space-y-5">
                    {[
                      { name: "Draft", value: stats.pipeline.draft, color: "#64748b", desc: "Not yet published" },
                      { name: "Published", value: stats.pipeline.published, color: "#0bd2b5", desc: "Ready to go" },
                      { name: "In Progress", value: stats.pipeline.inProgress, color: "#f59e0b", desc: "Currently active" },
                    ].map(s => {
                      const pct = stats.pipeline.total > 0 ? Math.round((s.value / stats.pipeline.total) * 100) : 0;
                      return (
                        <div key={s.name} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                              <span className="text-xs font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{s.name}</span>
                              <span className="text-[11px] font-bold text-slate-400 dark:text-[#888] uppercase tracking-wider hidden sm:inline">{s.desc}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-black italic tracking-tighter text-slate-900 dark:text-white">{s.value}</span>
                              <span className="text-[11px] font-bold text-slate-400 dark:text-[#888] uppercase tracking-wider">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-3 bg-slate-100 dark:bg-[#0a0a0a] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color, boxShadow: `0 0 8px ${s.color}40` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Upcoming Departures */}
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Upcoming Departures</h3>
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] mt-1">Sorted by departure date</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {stats.tripTimeline.map(t => (
                    <div key={t.id} className="flex items-center gap-4 py-3 px-4 rounded-xl bg-slate-50 dark:bg-[#050505] border border-slate-200/50 dark:border-[#1f1f1f]/50">
                      <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-[#1f1f1f]">
                        <img src={t.image} alt={t.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-extrabold uppercase tracking-tight text-slate-900 dark:text-white truncate">{t.name}</div>
                        <div className="text-[11px] text-slate-400 dark:text-[#888] mt-0.5">
                          {new Date(t.start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} — {t.duration} days
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {t.daysUntil <= 0 ? (
                          <span className="text-xs font-bold text-[#0bd2b5] uppercase tracking-wider">Now</span>
                        ) : (
                          <span className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white">{t.daysUntil}<span className="text-xs font-bold text-slate-400 dark:text-[#888] ml-1 not-italic tracking-widest">DAYS</span></span>
                        )}
                      </div>
                      <Badge className={`text-xs font-bold px-2.5 py-0.5 rounded-full border-none uppercase tracking-wider shrink-0`} style={{ background: `${STATUS_COLORS[t.status]}18`, color: STATUS_COLORS[t.status] }}>
                        {t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trips by Month — full width */}
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Trips by Month</h3>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] mt-1">Departure schedule</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
                    <BarChart data={stats.tripsByMonth} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="2 6" stroke={chartColors.grid} vertical={false} strokeOpacity={0.4} />
                      <XAxis dataKey="month" tick={{ fill: chartColors.text, fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: chartColors.text, fontSize: 10, fontWeight: 700 }} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: "transparent" }} content={<BarTooltip />} />
                      <Bar dataKey="count" fill="#0bd2b5" radius={[6, 6, 0, 0]} background={{ fill: 'transparent' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Airlines & Hotels — side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Airlines */}
                <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-8 rounded-lg bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center">
                      <Plane className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Top Airlines</h3>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Most booked carriers</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {stats.topAirlines.map((a, i) => {
                      const maxCount = stats.topAirlines[0]?.count || 1;
                      return (
                        <div key={a.name} className="flex items-center gap-4">
                          <span className="text-2xl font-black italic text-slate-200 dark:text-[#222] w-7 text-right tabular-nums leading-none">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{a.name}</span>
                              <span className="text-xs font-black italic tracking-tighter text-[#0bd2b5] shrink-0 ml-2">{a.count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-[#050505] rounded-full overflow-hidden">
                              <div className="h-full bg-[#0bd2b5] rounded-full transition-all duration-700" style={{ width: `${(a.count / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {stats.topAirlines.length === 0 && <p className="text-xs text-slate-400 dark:text-[#888]">No airline data</p>}
                  </div>
                </div>
                {/* Hotels */}
                <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-8 rounded-lg bg-[#f59e0b]/10 text-[#f59e0b] flex items-center justify-center">
                      <Hotel className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Top Hotels</h3>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Most booked properties</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {stats.topHotels.map((h, i) => {
                      const maxCount = stats.topHotels[0]?.count || 1;
                      return (
                        <div key={h.name} className="flex items-center gap-4">
                          <span className="text-2xl font-black italic text-slate-200 dark:text-[#222] w-7 text-right tabular-nums leading-none">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{h.name}</span>
                              <span className="text-xs font-black italic tracking-tighter text-[#f59e0b] shrink-0 ml-2">{h.count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-[#050505] rounded-full overflow-hidden">
                              <div className="h-full bg-[#f59e0b] rounded-full transition-all duration-700" style={{ width: `${(h.count / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {stats.topHotels.length === 0 && <p className="text-xs text-slate-400 dark:text-[#888]">No hotel data</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────── TEAM & COMPLIANCE ───────── */}
          {tab === "compliance" && (
            <div className="space-y-8 animate-fade-in">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                <div className="animate-fade-up stagger-1"><StatCard label="Up to Date" value={`${complianceData.rate}%`} sub={`${complianceData.signed} of ${complianceData.total} signed`} icon={<ShieldCheck className="h-5 w-5" />} /></div>
                <div className="animate-fade-up stagger-2"><StatCard label="Documents Signed" value={complianceData.signed.toString()} sub="All done" icon={<FileCheck className="h-5 w-5" />} accent="text-emerald-400" /></div>
                <div className="animate-fade-up stagger-3"><StatCard label="Needs Attention" value={(complianceData.pending + complianceData.expired).toString()} sub={`${complianceData.pending} waiting · ${complianceData.expired} expired`} icon={<AlertTriangle className="h-5 w-5" />} accent="text-amber-500" /></div>
                <div className="animate-fade-up stagger-4"><StatCard label="Team Members" value={MOCK_USERS.length.toString()} sub="On the team" icon={<Users className="h-5 w-5" />} /></div>
              </div>

              {/* Overall Compliance — full-width hero with donut + breakdown bars */}
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Document Status</h3>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] mt-1">Across all team members</p>
                </div>
                <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
                  {/* Donut chart */}
                  <div className="h-56 w-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Signed", value: complianceData.signed, color: "#34d399" },
                            { name: "Pending", value: complianceData.pending, color: "#fbbf24" },
                            { name: "Expired", value: complianceData.expired, color: "#f87171" },
                          ].filter(d => d.value > 0)}
                          cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value" stroke="none" cornerRadius={6}
                        >
                          {[
                            { name: "Signed", value: complianceData.signed, color: "#34d399" },
                            { name: "Pending", value: complianceData.pending, color: "#fbbf24" },
                            { name: "Expired", value: complianceData.expired, color: "#f87171" },
                          ].filter(d => d.value > 0).map((d, i) => <Cell key={i} fill={d.color} />)}
                          <Label
                            content={() => (
                              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
                                <tspan x="50%" dy="-6" className="fill-slate-900 dark:fill-white" style={{ fontSize: 28, fontWeight: 900, fontStyle: "italic", letterSpacing: "-0.05em" }}>{complianceData.rate}%</tspan>
                                <tspan x="50%" dy="20" className="fill-slate-400 dark:fill-[#555]" style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>UP TO DATE</tspan>
                              </text>
                            )}
                          />
                        </Pie>
                        <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ background: chartColors.bg, border: `1px solid ${chartColors.grid}`, borderRadius: 12, fontSize: 11, fontWeight: 700 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Status breakdown bars */}
                  <div className="flex-1 w-full space-y-5">
                    {[
                      { name: "Signed", value: complianceData.signed, color: "#34d399", icon: <CheckCircle2 className="h-4 w-4" />, desc: "Signed & done" },
                      { name: "Pending", value: complianceData.pending, color: "#fbbf24", icon: <Clock4 className="h-4 w-4" />, desc: "Needs signing" },
                      { name: "Expired", value: complianceData.expired, color: "#f87171", icon: <CircleAlert className="h-4 w-4" />, desc: "Needs renewal" },
                    ].map(s => {
                      const pct = complianceData.total > 0 ? Math.round((s.value / complianceData.total) * 100) : 0;
                      return (
                        <div key={s.name} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
                              <div>
                                <span className="text-xs font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{s.name}</span>
                                <p className="text-[11px] font-bold text-slate-400 dark:text-[#888] uppercase tracking-wider hidden sm:block">{s.desc}</p>
                              </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-black italic tracking-tighter text-slate-900 dark:text-white">{s.value}</span>
                              <span className="text-[11px] font-bold text-slate-400 dark:text-[#888] uppercase tracking-wider">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-3 bg-slate-100 dark:bg-[#0a0a0a] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color, boxShadow: `0 0 8px ${s.color}40` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* By Document Type — full width */}
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">By Document Type</h3>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] mt-1">Signed / Pending / Expired per type</p>
                </div>
                <div className="space-y-4">
                  {complianceData.byDocType.map(doc => {
                    const docTotal = doc.signed + doc.pending + doc.expired;
                    return (
                      <div key={doc.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                        <span className="text-xs font-bold text-slate-900 dark:text-white w-44 shrink-0 truncate">{doc.fullName}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-3 bg-slate-100 dark:bg-[#050505] rounded-full overflow-hidden flex">
                            {docTotal > 0 && (
                              <>
                                <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${(doc.signed / docTotal) * 100}%` }} />
                                <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${(doc.pending / docTotal) * 100}%` }} />
                                <div className="h-full bg-red-400 transition-all duration-700" style={{ width: `${(doc.expired / docTotal) * 100}%` }} />
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 w-32 justify-end">
                            <span className="text-xs font-black italic tracking-tighter text-emerald-400">{doc.signed}</span>
                            <span className="text-xs font-black italic tracking-tighter text-amber-400">{doc.pending}</span>
                            <span className="text-xs font-black italic tracking-tighter text-red-400">{doc.expired}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-5 mt-6 pt-4 border-t border-slate-200 dark:border-[#1f1f1f]">
                  {[{ l: "Signed", c: "#34d399" }, { l: "Pending", c: "#fbbf24" }, { l: "Expired", c: "#f87171" }].map(i => (
                    <div key={i.l} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: i.c }} />
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">{i.l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity + Members Needing Action — side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity */}
                <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <FileCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Recent Activity</h3>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Latest signed documents</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {complianceData.recentActivity.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{a.name}</div>
                          <div className="text-[11px] text-slate-400 dark:text-[#888] mt-0.5">{a.doc}</div>
                        </div>
                        <span className="text-xs font-bold text-slate-400 dark:text-[#888] uppercase tracking-wider shrink-0">
                          {new Date(a.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    ))}
                    {complianceData.recentActivity.length === 0 && <p className="text-xs text-slate-400 dark:text-[#888] py-4 text-center">No signed documents yet</p>}
                  </div>
                </div>

                {/* Members Needing Action */}
                <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Needs Attention</h3>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Members with pending or expired docs</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {complianceData.travelers
                      .map(t => {
                        const pend = t.compliance.filter(d => d.status === "Pending").length;
                        const exp = t.compliance.filter(d => d.status === "Expired").length;
                        return { ...t, pend, exp, issues: pend + exp };
                      })
                      .filter(t => t.issues > 0)
                      .sort((a, b) => b.issues - a.issues)
                      .slice(0, 6)
                      .map(t => (
                        <div key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors">
                          <div className="h-8 w-8 rounded-lg bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-[11px] shrink-0">{t.initials}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{t.name}</div>
                            <div className="text-[11px] text-slate-400 dark:text-[#888] mt-0.5">{t.role}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {t.pend > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                                <Clock4 className="h-3 w-3" />{t.pend}
                              </span>
                            )}
                            {t.exp > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                                <CircleAlert className="h-3 w-3" />{t.exp}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    {complianceData.travelers.every(t => t.compliance.every(d => d.status !== "Pending" && d.status !== "Expired")) && (
                      <p className="text-xs text-slate-400 dark:text-[#888] py-4 text-center">All members are fully compliant</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Team Compliance Grid / Heatmap */}
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-6 lg:p-8 shadow-2xl">
                <div className="mb-6">
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">Team Compliance Grid</h3>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] mt-1">Overview by traveler and document</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left py-3 pr-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888] w-48">Member</th>
                        {["Passport", "Insurance", "Behaviour", "Conduct", "Risk"].map(h => (
                          <th key={h} className="text-center py-3 px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">{h}</th>
                        ))}
                        <th className="text-center py-3 px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complianceData.travelers.map(t => {
                        const docNames = ["Passport", "Travel Insurance", "Behavioural Agreement", "Code of Conduct Review", "Risk Assessment"];
                        const statusIcons: Record<string, React.ReactNode> = {
                          Signed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
                          Pending: <Clock4 className="h-4 w-4 text-amber-400" />,
                          Expired: <CircleAlert className="h-4 w-4 text-red-400" />,
                          "Not Required": <div className="h-4 w-4 rounded-full bg-slate-200 dark:bg-[#1f1f1f]" />,
                        };
                        const allSigned = docNames.every(dn => {
                          const doc = t.compliance.find(d => d.name === dn);
                          return doc?.status === "Signed" || doc?.status === "Not Required";
                        });
                        const hasExpired = docNames.some(dn => t.compliance.find(d => d.name === dn)?.status === "Expired");
                        return (
                          <tr key={t.id} className="border-t border-slate-200/50 dark:border-[#1f1f1f]/50 hover:bg-slate-50/50 dark:hover:bg-[#050505]/50 transition-colors">
                            <td className="py-4 pr-4">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-[11px] shrink-0">{t.initials}</div>
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">{t.name}</span>
                                  <span className="text-[11px] text-slate-400 dark:text-[#888]">{t.role}</span>
                                </div>
                              </div>
                            </td>
                            {docNames.map(dn => {
                              const doc = t.compliance.find(d => d.name === dn);
                              const status = doc?.status || "Not Required";
                              return (
                                <td key={dn} className="text-center py-4 px-3">
                                  <div className="flex items-center justify-center" title={`${dn}: ${status}`}>
                                    {statusIcons[status]}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="text-center py-4 px-3">
                              <Badge className={`text-xs font-bold px-2.5 py-1 rounded-full border-none uppercase tracking-wider ${allSigned ? "bg-emerald-500/10 text-emerald-400" : hasExpired ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                                {allSigned ? "Complete" : hasExpired ? "Action Req." : "Pending"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-200 dark:border-[#1f1f1f]">
                  {[
                    { l: "Signed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
                    { l: "Pending", icon: <Clock4 className="h-3.5 w-3.5 text-amber-400" /> },
                    { l: "Expired", icon: <CircleAlert className="h-3.5 w-3.5 text-red-400" /> },
                    { l: "N/A", icon: <div className="h-3.5 w-3.5 rounded-full bg-slate-200 dark:bg-[#1f1f1f]" /> },
                  ].map(i => (
                    <div key={i.l} className="flex items-center gap-1.5">
                      {i.icon}
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-[#888]">{i.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
