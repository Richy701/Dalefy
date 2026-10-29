import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { toast } from "sonner";
import { parseTripDate } from "@/lib/dates";
import { Users, SealCheck, Clock, FileText, Warning, WarningCircle, CheckCircle, Download, FilePdf, SpinnerGap } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { useTrips } from "@/context/TripsContext";
import { travellerCount } from "@/lib/travelerSync";
import { useDirectoryTravelers, useComplianceRecords } from "@/context/directory";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/brand";
import { liveTrips } from "@/lib/tripLifecycle";
import { MOCK_USERS } from "@/data/mock-users";
import { PageHeader } from "@/components/shared/PageHeader";
import { TravellersReport } from "@/components/reports/TravellersReport";
import { TripsReport } from "@/components/reports/TripsReport";
import { MoneyReport } from "@/components/reports/MoneyReport";
import { OverviewReport } from "@/components/reports/OverviewReport";
import { ReportFiltersBar } from "@/components/reports/ReportFiltersBar";
import { DEFAULT_REPORT_FILTERS, filterReportTrips, describeFilters, type ReportFilters } from "@/lib/reportFilters";
import { moneyByCurrency } from "@/lib/reportMoney";
import { useBrand } from "@/context/BrandContext";
import { EmptyNote } from "@/components/reports/ReportParts";
import type { User } from "@/types";

type Tab = "operations" | "money" | "travellers" | "trips" | "compliance";
const TAB_LABELS: Record<Tab, string> = { operations: "Overview", money: "Money", travellers: "Travellers", trips: "Trips", compliance: "Documents" };

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
  const { trips: allTrips, ready: tripsReady } = useTrips();
  // Archived trips are over and put away: they stay out of every count and chart here
  const live = useMemo(() => liveTrips(allTrips), [allTrips]);
  // Period, trip and status narrow every tab at once
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const trips = useMemo(() => filterReportTrips(live, filters), [live, filters]);
  const filteredOut = live.length > 0 && trips.length === 0;
  const scope = describeFilters(filters, filters.tripId !== "all" ? live.find(t => t.id === filters.tripId)?.name : undefined);
  const { brand } = useBrand();
  const [exportingPdf, setExportingPdf] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("operations");
  const [complianceOverrides] = useComplianceRecords();
  const [customTravelers] = useDirectoryTravelers();
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
        "Traveller Count": travellerCount(t),
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

  const downloadCsv = (rows: object[], name: string) => {
    const blob = new Blob([Papa.unparse(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${BRAND.storagePrefix}-${name}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMoneyCsv = useCallback(() => {
    const { rows } = moneyByCurrency(trips);
    downloadCsv(rows.map(r => ({
      "Trip Name": r.trip.name,
      "Start Date": r.trip.start,
      "End Date": r.trip.end,
      "Currency": r.currency,
      "Budget": r.budget ?? "",
      "Spend": Math.round(r.spend * 100) / 100,
      "Left": r.left === null ? "" : Math.round(r.left * 100) / 100,
      "Travellers": r.travellers,
      "Per Head": r.priced ? Math.round(r.perHead * 100) / 100 : "",
      "Priced Bookings": r.priced,
      "Bookings Without A Price": r.missing + r.unpriced.length,
    })), "money");
    toast.success(`Exported money for ${trips.length} ${trips.length === 1 ? "trip" : "trips"} to CSV`);
  }, [trips]);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const [{ buildReportPdf }, { loadLogo }] = await Promise.all([import("@/lib/reportPdf"), import("@/lib/itineraryPdf")]);
      const logo = brand.logoUrl ? await loadLogo(brand.logoUrl) : null;
      const pdf = await buildReportPdf({ trips, scope, brand: { name: brand.name, platformName: brand.platformName, accentColor: brand.accentColor, logo } });
      pdf.save(`${BRAND.storagePrefix}-account-report-${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("Report exported");
    } catch (err) {
      console.error("Report PDF failed:", err);
      toast.error("Couldn't export the report. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  };

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

  const csvTabs: Tab[] = ["operations", "money", "compliance"];
  const exportDisabled = tab === "compliance" ? complianceData.travelers.length === 0 : trips.length === 0;
  const handleExportTabCsv = tab === "operations" ? handleExportCsv : tab === "money" ? handleExportMoneyCsv : handleExportComplianceCsv;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <PageHeader
        cta={
          <div className="flex items-center gap-2">
            {csvTabs.includes(tab) && (
              <button
                onClick={handleExportTabCsv}
                disabled={exportDisabled}
                className="flex items-center gap-2 h-11 px-4 sm:px-5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground text-xs font-medium transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={`Export ${TAB_LABELS[tab].toLowerCase()} as CSV`}
                title={exportDisabled ? "Nothing to export yet" : undefined}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            )}
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf || trips.length === 0}
              className="flex items-center gap-2 h-11 px-4 sm:px-5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-medium transition-opacity shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Export account report as PDF"
              title={trips.length === 0 ? "Nothing to export yet" : undefined}
            >
              {exportingPdf ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : <FilePdf className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 sm:px-4 lg:px-8 py-5 sm:py-7 flex flex-col min-h-full">
          {/* Title + tabs + filters */}
          <div className="pb-6 border-b border-border">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 min-w-0">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight leading-none text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1.5">{BRAND.name}</p>
            </div>
            <div role="tablist" className="flex items-center bg-secondary p-0.5 rounded-lg shrink-0 max-w-full overflow-x-auto">
              {(["operations", "money", "travellers", "trips", "compliance"] as const).map(t => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-4 h-8 rounded-md text-sm font-medium transition-colors shrink-0 ${
                    tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {tripsReady && live.length > 0 && <ReportFiltersBar trips={live} filters={filters} onChange={setFilters} />}
          </div>

          {tripsReady && filteredOut && tab !== "compliance" && (
            <div className="mt-8"><EmptyNote>No trips match these filters. Try a wider period or clear the filters.</EmptyNote></div>
          )}

          {/* ───────── TRIP OPERATIONS ───────── */}
          {!tripsReady && (
            <div className="flex items-center justify-center py-24">
              <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {tripsReady && !filteredOut && tab === "money" && <MoneyReport trips={trips} />}
          {tripsReady && !filteredOut && tab === "travellers" && <TravellersReport trips={trips} />}
          {tripsReady && !filteredOut && tab === "trips" && <TripsReport trips={trips} />}
          {tripsReady && !filteredOut && tab === "operations" && (trips.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 mt-8">
              <div className="text-center space-y-1.5">
                <p className="text-lg font-semibold tracking-tight text-foreground">Nothing to report yet</p>
                <p className="text-sm text-muted-foreground">Reports fill in as trips are created.</p>
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Create a trip
              </button>
            </div>
          ) : (
            <OverviewReport trips={trips} onOpenTab={setTab} />
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
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
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
                            <span className="text-xs font-semibold tracking-tighter text-emerald-400">{doc.signed}</span>
                            <span className="text-xs font-semibold tracking-tighter text-amber-400">{doc.pending}</span>
                            <span className="text-xs font-semibold tracking-tighter text-red-400">{doc.expired}</span>
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
                    <p className="text-xs text-muted-foreground mt-1">Overview by traveller and document</p>
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
