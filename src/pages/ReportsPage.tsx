import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { toast } from "sonner";
import { parseTripDate } from "@/lib/dates";
import { AirplaneTilt, Calendar as LucideCalendar, Briefcase, Users, SealCheck, Clock, FileText, Warning, WarningCircle, CheckCircle, Download } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { useTrips } from "@/context/TripsContext";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/brand";
import { usePreferences } from "@/context/PreferencesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripStats } from "@/hooks/useTripStats";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE } from "@/config/storageKeys";
import { MOCK_USERS } from "@/data/mock-users";
import { AIRLINE_COLORS, airlineLogoUrl } from "@/data/airlines";
import { PageHeader } from "@/components/shared/PageHeader";
import type { ComplianceDoc, User } from "@/types";

type Tab = "operations" | "compliance";

// Single source of truth for document-status colors (icons use the matching
// emerald-400 / amber-400 / red-400 utility classes)
const STATUS_COLORS = { signed: "#34d399", pending: "#fbbf24", expired: "#f87171" };


function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; icon?: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-3xl font-semibold tracking-tight leading-none mt-2 tabular-nums ${accent || "text-foreground"}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}

export function ReportsPage() {
  const { trips, ready: tripsReady } = useTrips();
  const { user } = useAuth();
  const { resolvedAccent } = usePreferences();
  const { theme } = useTheme();
  const brandHex = resolvedAccent;
  // Chart tick colour that passes contrast on both grounds (slate-500 on white, #aaa on #111)
  const tickFill = theme === "dark" ? "#aaaaaa" : "#64748b";
  const navigate = useNavigate();
  const stats = useTripStats(trips);
  const [tab, setTab] = useState<Tab>("operations");
  const [complianceOverrides] = useLocalStorage<Record<string, ComplianceDoc[]>>(STORAGE.COMPLIANCE, {});
  const [customTravelers] = useLocalStorage<User[]>(STORAGE.CUSTOM_TRAVELERS, []);
  const isDemoUser = !user || user.id === "demo" || (user.id?.length ?? 0) <= 20;

  const handleExportCsv = useCallback(() => {
    const rows = trips.map(t => {
      const start = new Date(t.start);
      const end = new Date(t.end);
      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const flights = t.events.filter(e => e.type === "flight").length;
      const hotels = t.events.filter(e => e.type === "hotel").length;
      const activities = t.events.filter(e => e.type === "activity").length;
      const dining = t.events.filter(e => e.type === "dining").length;
      const transfers = t.events.filter(e => e.type === "transfer").length;
      return {
        "Trip Name": t.name,
        "Destination": t.destination || "",
        "Start Date": t.start,
        "End Date": t.end,
        "Duration (Days)": days,
        "Status": t.status,
        "Total Events": t.events.length,
        "Flights": flights,
        "Hotels": hotels,
        "Activities": activities,
        "Dining": dining,
        "Transfers": transfers,
        "Traveler Count": t.paxCount || t.attendees || "",
      };
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${BRAND.storagePrefix}-trips-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${trips.length} ${trips.length === 1 ? "trip" : "trips"} to CSV`);
  }, [trips]);

  // Compliance data (merged with localStorage, same as TravelersPage)
  // Same people TravelersPage shows: demo users (demo only) + travelers on real trips + custom travelers,
  // with localStorage compliance overrides applied. Keeps the two pages in agreement.
  const complianceData = useMemo(() => {
    const byId = new Map<string, User>();
    if (isDemoUser) for (const u of MOCK_USERS) byId.set(u.id, u);
    for (const t of trips) {
      for (const tv of t.travelers ?? []) {
        if (!byId.has(tv.id)) {
          byId.set(tv.id, { id: tv.id, name: tv.name, email: tv.email || "", role: "Traveler", avatar: "", initials: tv.initials, status: "Offline", compliance: [] });
        }
      }
    }
    for (const cu of customTravelers) {
      const existing = [...byId.values()].find(v => v.name.trim().toLowerCase() === cu.name.trim().toLowerCase());
      if (existing) { if (cu.compliance?.length) existing.compliance = cu.compliance; }
      else byId.set(cu.id, cu);
    }
    const travelers = [...byId.values()].map(u => ({
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
      return { name, signed: s, pending: p, expired: e };
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
  }, [complianceOverrides, customTravelers, isDemoUser, trips]);

  const handleExportComplianceCsv = useCallback(() => {
    const docNames = ["Passport", "Travel Insurance", "Behavioural Agreement", "Code of Conduct Review", "Risk Assessment"];
    const rows = complianceData.travelers.map(t => {
      const row: Record<string, string> = { "Name": t.name, "Role": t.role || "" };
      docNames.forEach(dn => { row[dn] = t.compliance.find(d => d.name === dn)?.status || "Not Required"; });
      return row;
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${BRAND.storagePrefix}-compliance-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? "member" : "members"} to CSV`);
  }, [complianceData]);

  const exportDisabled = tab === "operations" ? trips.length === 0 : complianceData.travelers.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <PageHeader
        cta={
          <button
            onClick={tab === "operations" ? handleExportCsv : handleExportComplianceCsv}
            disabled={exportDisabled}
            className="flex items-center gap-2 h-11 px-4 sm:px-5 rounded-lg bg-brand hover:opacity-90 text-black text-[10px] font-black uppercase tracking-widest transition-opacity shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={tab === "operations" ? "Export trips as CSV" : "Export compliance as CSV"}
            title={exportDisabled ? "Nothing to export yet" : undefined}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 sm:px-4 lg:px-8 py-5 sm:py-7 flex flex-col min-h-full">
          {/* Title + tabs */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-8 border-b border-border">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight leading-none text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1.5">{BRAND.name}</p>
            </div>
            <div role="tablist" className="flex items-center bg-secondary p-0.5 rounded-lg shrink-0">
              {(["operations", "compliance"] as const).map(t => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-4 h-8 rounded-md text-sm font-medium transition-colors ${
                    tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "operations" ? "Overview" : "Documents"}
                </button>
              ))}
            </div>
          </div>

          {/* ───────── TRIP OPERATIONS ───────── */}
          {!tripsReady && (
            <div className="flex items-center justify-center py-24">
              <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {tripsReady && tab === "operations" && (trips.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 mt-8">
              <div className="text-center space-y-1.5">
                <p className="text-lg font-semibold tracking-tight text-foreground">Nothing to report yet</p>
                <p className="text-sm text-muted-foreground">Reports fill in as trips are created.</p>
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                className="h-9 px-4 rounded-lg bg-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Create a trip
              </button>
            </div>
          ) : (
            <div className="space-y-8 mt-8">
              {/* ── Hero Stats Strip ── */}
              <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row items-center lg:items-end gap-6 lg:gap-12">
                  <div className="text-center lg:text-left shrink-0">
                    <p className="text-xs text-muted-foreground mb-1">Travel days</p>
                    <p className="text-4xl sm:text-5xl font-semibold tracking-tight leading-none text-foreground tabular-nums">{stats.totalDays}</p>
                    <p className="text-xs text-muted-foreground mt-2">Across {trips.length} {trips.length === 1 ? "trip" : "trips"}</p>
                  </div>
                  <div className="hidden lg:block w-px h-20 bg-secondary" />
                  <div className="flex-1 grid grid-cols-3 sm:flex sm:items-stretch gap-3 sm:gap-4 lg:gap-8 w-full">
                    {[
                      { label: "Active", value: stats.activeTrips.toString(), sub: "In progress", icon: <AirplaneTilt className="h-4 w-4" /> },
                      { label: "Upcoming", value: stats.upcomingTrips.length.toString(), sub: "Next 30 days", icon: <LucideCalendar className="h-4 w-4" /> },
                      { label: "Events", value: stats.totalEvents.toString(), sub: `${stats.avgEventsPerTrip} per trip`, icon: <Briefcase className="h-4 w-4" /> },
                    ].map((kpi, i, arr) => (
                      <div key={kpi.label} className="flex items-stretch gap-4 lg:gap-8 flex-1">
                        <div className="text-center lg:text-left flex-1">
                          <p className="text-xs text-muted-foreground mb-2">{kpi.label}</p>
                          <p className="text-2xl lg:text-3xl font-semibold tracking-tight leading-none text-foreground tabular-nums">{kpi.value}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">{kpi.sub}</p>
                        </div>
                        {i < arr.length - 1 && (
                          <div className="hidden lg:block w-px self-stretch bg-secondary" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trip Pipeline - full-width card with chart + breakdown side by side */}
              <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                <div className="mb-5">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Trip Pipeline</h3>
                    <p className="text-xs text-muted-foreground mt-1">{stats.pipeline.total} {stats.pipeline.total === 1 ? "trip" : "trips"} by status</p>
                  </div>
                </div>
                {stats.pipeline.total === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 w-full rounded-xl border-2 border-dashed border-border">
                    <p className="text-sm font-medium text-muted-foreground">No trips in pipeline</p>
                    <p className="text-xs text-muted-foreground mt-1">Create your first trip to see stats</p>
                  </div>
                ) : (
                <div className="space-y-5">
                  {[
                    { name: "Draft", value: stats.pipeline.draft, color: "#64748b", desc: "Not yet published" },
                    { name: "Published", value: stats.pipeline.published, color: brandHex, desc: "Ready to go" },
                    { name: "In Progress", value: stats.pipeline.inProgress, color: STATUS_COLORS.pending, desc: "Currently active" },
                  ].filter(s => s.value > 0).map(s => {
                    const pct = stats.pipeline.total > 0 ? Math.round((s.value / stats.pipeline.total) * 100) : 0;
                    return (
                      <div key={s.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                            <span className="text-sm font-medium text-foreground">{s.name}</span>
                            <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">{s.desc}</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-semibold tabular-nums text-foreground">{s.value}</span>
                            <span className="text-[11px] font-medium text-muted-foreground">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>

              {/* ── Team Overview + Trips by Month - 2 col ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Team Overview */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                  <div className="mb-4">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Team</h3>
                      <p className="text-xs text-muted-foreground mt-1">{(() => { const all = [...(isDemoUser ? MOCK_USERS : []), ...customTravelers]; return `${all.length} ${all.length === 1 ? "member" : "members"}`; })()}</p>
                    </div>
                  </div>
                  {(() => {
                    const allTravelers = [...(isDemoUser ? MOCK_USERS : []), ...customTravelers];
                    if (allTravelers.length === 0) return (
                      <div className="h-52 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
                        <p className="text-sm font-medium text-muted-foreground">No team members</p>
                      </div>
                    );
                    return (
                      <div className="space-y-1">
                        {allTravelers.slice(0, 7).map(t => {
                          const docs = complianceOverrides[t.id] || t.compliance || [];
                          const reqDocs = docs.filter(d => d.status !== "Not Required");
                          const signedDocs = reqDocs.filter(d => d.status === "Signed").length;
                          const hasIssue = reqDocs.some(d => d.status === "Pending" || d.status === "Expired");
                          return (
                            <div key={t.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-secondary transition-colors">
                              <div className="h-8 w-8 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-[11px] shrink-0">{t.initials}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{t.role || "Other"}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {hasIssue ? (
                                  <Warning className="h-3.5 w-3.5 text-amber-400" />
                                ) : reqDocs.length > 0 ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                                ) : null}
                                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">{signedDocs}/{reqDocs.length}</span>
                              </div>
                            </div>
                          );
                        })}
                        {allTravelers.length > 7 && (
                          <button onClick={() => navigate("/travelers")} className="w-full text-center py-2 text-xs font-medium text-brand hover:underline">
                            +{allTravelers.length - 7} more
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Trips by Month */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6 flex flex-col">
                  <div className="mb-5">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Trips by Month</h3>
                      <p className="text-xs text-muted-foreground mt-1">Departure schedule</p>
                    </div>
                  </div>
                  {stats.tripsByMonth.length === 0 ? (
                    <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
                      <p className="text-sm font-medium text-muted-foreground">No data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Trips will appear here by month</p>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[200px]">
                      <ChartContainer config={{ count: { label: "Trips", color: brandHex } } satisfies ChartConfig} className="h-full w-full">
                        <BarChart data={stats.tripsByMonth} barCategoryGap="20%">
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: tickFill }} />
                          <YAxis width={32} axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: tickFill }} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" fill={brandHex} radius={[6, 6, 0, 0]} animationDuration={700} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Top Airlines + Travelers per Trip - 2 col ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Airlines */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                  <div className="mb-5">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Top Airlines</h3>
                      <p className="text-xs text-muted-foreground mt-1">Most booked</p>
                    </div>
                  </div>
                  {stats.topAirlines.length > 0 ? (
                    <div className="space-y-3">
                      {stats.topAirlines.map((a, i) => {
                        const maxCount = stats.topAirlines[0]?.count || 1;
                        const logoUrl = airlineLogoUrl(a.iata);
                        return (
                          <div key={a.name} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-background">
                            <span className="text-sm font-medium text-muted-foreground w-5 text-right tabular-nums leading-none shrink-0">{i + 1}</span>
                            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-white border border-border">
                              {logoUrl ? (
                                <img src={logoUrl} alt={a.name} className="h-full w-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; e.currentTarget.parentElement!.querySelector(".fallback")?.classList.remove("hidden"); }} />
                              ) : null}
                              <span className={`fallback text-xs font-black uppercase ${logoUrl ? "hidden" : ""}`} style={{ color: AIRLINE_COLORS[a.iata] || "#888" }}>{a.iata || a.name.slice(0, 2)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(a.count / maxCount) * 100}%`, background: AIRLINE_COLORS[a.iata] || brandHex }} />
                                </div>
                                <span className="text-xs font-medium tabular-nums text-foreground shrink-0">{a.count}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <p className="text-sm text-muted-foreground">No airline data</p>
                    </div>
                  )}
                </div>

                {/* Travelers per Trip */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                  <div className="mb-5">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Travelers per Trip</h3>
                      <p className="text-xs text-muted-foreground mt-1">Group sizes</p>
                    </div>
                  </div>
                  {trips.length > 0 ? (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 -mr-1">
                      {trips.map((t) => {
                        const pax = parseInt(t.paxCount || "0") || (t.travelers?.length ?? 0);
                        const maxPax = Math.max(...trips.map(tr => parseInt(tr.paxCount || "0") || (tr.travelers?.length ?? 0)), 1);
                        return (
                          <button
                            key={t.id}
                            onClick={() => navigate(`/trip/${t.id}`)}
                            className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl bg-background hover:bg-brand/5 dark:hover:bg-brand/5 transition-colors text-left group"
                          >
                            <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0">
                              <img src={t.image} alt={t.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate group-hover:text-brand transition-colors">{t.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                                  <div className="h-full bg-brand rounded-full transition-all duration-700" style={{ width: `${maxPax > 0 ? (pax / maxPax) * 100 : 0}%` }} />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-semibold tabular-nums text-foreground">{pax || "-"}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <p className="text-sm text-muted-foreground">No trips yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* ───────── TEAM & COMPLIANCE ───────── */}
          {tripsReady && tab === "compliance" && (complianceData.travelers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 mt-8">
              <div className="text-center space-y-1.5">
                <p className="text-lg font-semibold tracking-tight text-foreground">No team members yet</p>
                <p className="text-sm text-muted-foreground">Add travellers to track their documents here.</p>
              </div>
              <button
                onClick={() => navigate("/travelers")}
                className="h-9 px-4 rounded-lg bg-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Add travellers
              </button>
            </div>
          ) : (
            <div className="space-y-8 mt-8">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                <StatCard label="Up to Date" value={`${complianceData.rate}%`} sub={`${complianceData.signed} of ${complianceData.total} signed`} icon={<SealCheck className="h-5 w-5" />} />
                <StatCard label="Documents Signed" value={complianceData.signed.toString()} sub={complianceData.pending + complianceData.expired === 0 ? "All done" : `Of ${complianceData.total} required`} icon={<FileText className="h-5 w-5" />} accent="text-emerald-600 dark:text-emerald-400" />
                <StatCard label="Needs Attention" value={(complianceData.pending + complianceData.expired).toString()} sub={`${complianceData.pending} waiting · ${complianceData.expired} expired`} icon={<Warning className="h-5 w-5" />} accent="text-amber-600 dark:text-amber-400" />
                <StatCard label="Team Members" value={complianceData.travelers.length.toString()} sub="On the team" icon={<Users className="h-5 w-5" />} />
              </div>

              {/* Overall Compliance - full-width hero with donut + breakdown bars */}
              <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                <div className="mb-5">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Document Status</h3>
                    <p className="text-xs text-muted-foreground mt-1">{complianceData.rate}% up to date across all team members</p>
                  </div>
                </div>
                <div className="space-y-5">
                  {[
                    { name: "Signed", value: complianceData.signed, color: STATUS_COLORS.signed, icon: <CheckCircle className="h-4 w-4" />, desc: "Signed & done" },
                    { name: "Pending", value: complianceData.pending, color: STATUS_COLORS.pending, icon: <Clock className="h-4 w-4" />, desc: "Needs signing" },
                    { name: "Expired", value: complianceData.expired, color: STATUS_COLORS.expired, icon: <WarningCircle className="h-4 w-4" />, desc: "Needs renewal" },
                  ].map(s => {
                    const pct = complianceData.total > 0 ? Math.round((s.value / complianceData.total) * 100) : 0;
                    return (
                      <div key={s.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
                            <div>
                              <span className="text-sm font-medium text-foreground">{s.name}</span>
                              <p className="text-[11px] font-medium text-muted-foreground hidden sm:block">{s.desc}</p>
                            </div>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-semibold tabular-nums text-foreground">{s.value}</span>
                            <span className="text-[11px] font-medium text-muted-foreground">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Document Type - full width */}
              <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                <div className="mb-5">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">By Document Type</h3>
                    <p className="text-xs text-muted-foreground mt-1">Signed, pending and expired per type</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {complianceData.byDocType.map(doc => {
                    const docTotal = doc.signed + doc.pending + doc.expired;
                    return (
                      <div key={doc.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                        <span className="text-xs font-bold text-foreground w-44 shrink-0 truncate">{doc.name}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden flex">
                            {docTotal > 0 && (
                              <>
                                <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${(doc.signed / docTotal) * 100}%` }} />
                                <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${(doc.pending / docTotal) * 100}%` }} />
                                <div className="h-full bg-red-400 transition-all duration-700" style={{ width: `${(doc.expired / docTotal) * 100}%` }} />
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 w-32 justify-end">
                            <span className="text-xs font-black tracking-tighter text-emerald-400">{doc.signed}</span>
                            <span className="text-xs font-black tracking-tighter text-amber-400">{doc.pending}</span>
                            <span className="text-xs font-black tracking-tighter text-red-400">{doc.expired}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-5 mt-6 pt-4 border-t border-black/6 dark:border-white/6">
                  {[{ l: "Signed", c: STATUS_COLORS.signed }, { l: "Pending", c: STATUS_COLORS.pending }, { l: "Expired", c: STATUS_COLORS.expired }].map(i => (
                    <div key={i.l} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: i.c }} />
                      <span className="text-xs text-muted-foreground">{i.l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity + Members Needing Action - side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                  <div className="mb-5">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Recent Activity</h3>
                      <p className="text-xs text-muted-foreground mt-1">Latest signed documents</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {complianceData.recentActivity.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-secondary transition-colors">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground truncate">{a.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{a.doc}</div>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {parseTripDate(a.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    ))}
                    {complianceData.recentActivity.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No signed documents yet</p>}
                  </div>
                </div>

                {/* Members Needing Action */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                  <div className="mb-5">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Needs Attention</h3>
                      <p className="text-xs text-muted-foreground mt-1">Members with pending or expired docs</p>
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
                        <div key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-secondary transition-colors">
                          <div className="h-8 w-8 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-[11px] shrink-0">{t.initials}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-foreground truncate">{t.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{t.role}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {t.pend > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400">
                                <Clock className="h-3 w-3" />{t.pend}
                              </span>
                            )}
                            {t.exp > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400">
                                <WarningCircle className="h-3 w-3" />{t.exp}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    {complianceData.travelers.every(t => t.compliance.every(d => d.status !== "Pending" && d.status !== "Expired")) && (
                      <p className="text-xs text-muted-foreground py-4 text-center">All members are fully compliant</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Team Compliance Grid / Heatmap */}
              <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
                <div className="mb-5">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">Team Compliance Grid</h3>
                    <p className="text-xs text-muted-foreground mt-1">Overview by traveler and document</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left py-3 pr-4 text-xs font-medium text-muted-foreground w-48">Member</th>
                        {["Passport", "Insurance", "Behaviour", "Conduct", "Risk"].map(h => (
                          <th key={h} className="text-center py-3 px-3 text-xs font-medium text-muted-foreground">{h}</th>
                        ))}
                        <th className="text-center py-3 px-3 text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complianceData.travelers.map(t => {
                        const docNames = ["Passport", "Travel Insurance", "Behavioural Agreement", "Code of Conduct Review", "Risk Assessment"];
                        const statusIcons: Record<string, React.ReactNode> = {
                          Signed: <CheckCircle className="h-4 w-4 text-emerald-400" />,
                          Pending: <Clock className="h-4 w-4 text-amber-400" />,
                          Expired: <WarningCircle className="h-4 w-4 text-red-400" />,
                          "Not Required": <div className="h-4 w-4 rounded-full bg-secondary" />,
                        };
                        const allSigned = docNames.every(dn => {
                          const doc = t.compliance.find(d => d.name === dn);
                          return doc?.status === "Signed" || doc?.status === "Not Required";
                        });
                        const hasExpired = docNames.some(dn => t.compliance.find(d => d.name === dn)?.status === "Expired");
                        return (
                          <tr key={t.id} className="border-t border-black/4 border-border hover:bg-slate-50/50 dark:hover:bg-background/50 transition-colors">
                            <td className="py-4 pr-4">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-[11px] shrink-0">{t.initials}</div>
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-foreground truncate block">{t.name}</span>
                                  <span className="text-[11px] text-muted-foreground">{t.role}</span>
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
                              <Badge className={`text-xs font-medium px-2 py-0.5 rounded-md border-none ${allSigned ? "bg-emerald-500/10 text-emerald-400" : hasExpired ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                                {allSigned ? "Complete" : hasExpired ? "Action needed" : "Pending"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-black/6 dark:border-white/6">
                  {[
                    { l: "Signed", icon: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> },
                    { l: "Pending", icon: <Clock className="h-3.5 w-3.5 text-amber-400" /> },
                    { l: "Expired", icon: <WarningCircle className="h-3.5 w-3.5 text-red-400" /> },
                    { l: "N/A", icon: <div className="h-3.5 w-3.5 rounded-full bg-secondary" /> },
                  ].map(i => (
                    <div key={i.l} className="flex items-center gap-1.5">
                      {i.icon}
                      <span className="text-xs text-muted-foreground">{i.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
