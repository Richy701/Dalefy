import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Globe, ChartPie, Images,
  LogOut, ArrowUpRight, Plus, Upload, FileDown,
  Plane, Clock, CalendarDays, Map,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
import { BRAND } from "@/config/brand";
import { useBrand } from "@/context/BrandContext";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users,           label: "Travelers",   path: "/travelers" },
  { icon: Globe,           label: "Destinations", path: "/destinations" },
  { icon: Images,          label: "Media",        path: "/media" },
  { icon: ChartPie,        label: "Reports",      path: "/reports" },
];

function UserFooter({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";

  const displayName = user?.name ?? "";
  const initials = user?.initials ?? (
    displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?"
  );

  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
      <button
        onClick={() => navigate("/settings")}
        className={`flex items-center gap-3 flex-1 min-w-0 rounded-xl hover:bg-white/5 transition-colors py-1 px-1 -ml-1 ${collapsed ? "justify-center" : ""}`}
        aria-label="Settings"
      >
        <Avatar className="h-8 w-8 rounded-xl shrink-0">
          <AvatarFallback className="rounded-xl bg-brand/15 text-brand text-[10px] font-black border border-brand/20">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[11px] font-bold text-white truncate leading-none">{displayName}</p>
            <p className="text-[9px] text-[#555] leading-none mt-0.5 truncate">{user?.role ?? ""}</p>
          </div>
        )}
      </button>
      {!collapsed && (
        <Tooltip>
          <TooltipTrigger
            aria-label="Sign out"
            onClick={onSignOut}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[#444] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <LogOut className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="top">Sign out</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function AppSidebar() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const { trips }   = useTrips();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { logout }  = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { brand } = useBrand();

  const currentPath = location.pathname;
  const isActive    = (path: string) => path === "/" ? currentPath === "/" : currentPath === path;

  // Upcoming trip (nearest future trip)
  const upcomingTrip = useMemo(() => {
    const now = new Date();
    return [...trips]
      .filter((t) => new Date(t.start) > now)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  }, [trips]);

  // Days until upcoming trip
  const daysUntil = useMemo(() => {
    if (!upcomingTrip) return 0;
    const diff = new Date(upcomingTrip.start).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [upcomingTrip]);

  // Quick stats
  const stats = useMemo(() => {
    const now = new Date();
    const active = trips.filter((t) => new Date(t.start) <= now && new Date(t.end) >= now).length;
    const upcoming = trips.filter((t) => new Date(t.start) > now).length;
    let totalDays = 0;
    trips.forEach((t) => {
      totalDays += Math.max(0, Math.ceil((new Date(t.end).getTime() - new Date(t.start).getTime()) / (1000 * 60 * 60 * 24)));
    });
    return { total: trips.length, active, upcoming, totalDays };
  }, [trips]);

  // Recent trips (last 3, excluding upcoming)
  const recentTrips = useMemo(() =>
    [...trips]
      .filter((t) => t.id !== upcomingTrip?.id)
      .slice(-3)
      .reverse(),
    [trips, upcomingTrip]
  );

  const handleSignOut = () => { logout(); navigate("/login"); };

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-[#1a1a1a]">

        {/* ── Logo ── */}
        <SidebarHeader className="h-16 border-b border-[#1a1a1a] px-3 flex-row items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            aria-label="Go to dashboard"
            className="flex items-center gap-3 min-w-0"
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-xl object-contain shrink-0" />
            ) : (
              <div className="h-8 w-8 bg-brand rounded-xl flex items-center justify-center shrink-0 logo-shimmer">
                <Globe className="text-black h-4 w-4" />
              </div>
            )}
            {!collapsed && (
              <span className="text-[11px] font-black uppercase tracking-widest text-white whitespace-nowrap">
                {brand.name}
              </span>
            )}
          </button>
        </SidebarHeader>

        {/* ── Nav ── */}
        <SidebarContent className="pt-2">
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/30 h-auto mb-1 px-2">
                Menu
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
                  const active = isActive(path);
                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton
                        onClick={() => navigate(path)}
                        tooltip={label}
                        data-active={active ? "true" : undefined}
                        className={`
                          relative rounded-2xl h-auto py-2.5 px-3 gap-3
                          ${active
                            ? "!bg-brand/10 !text-brand hover:!bg-brand/10 hover:!text-brand"
                            : "!text-[#555] hover:!text-white hover:!bg-white/[0.04]"
                          }
                        `}
                      >
                        {/* Active bar */}
                        {active && (
                          <span className="absolute left-0 inset-y-[7px] w-[3px] rounded-r-full bg-brand" />
                        )}
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-brand" : ""}`} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em]">
                          {label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* ── Quick Stats ── */}
          {!collapsed && trips.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/30 h-auto mb-1 px-2">
                Overview
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="grid grid-cols-2 gap-1.5 px-2">
                  {[
                    { label: "Trips", value: stats.total, icon: Map },
                    { label: "Active", value: stats.active, icon: Plane },
                    { label: "Upcoming", value: stats.upcoming, icon: Clock },
                    { label: "Days", value: stats.totalDays, icon: CalendarDays },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-sidebar-accent border border-sidebar-border"
                    >
                      <s.icon className="h-3 w-3 text-sidebar-foreground/40 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-black leading-none text-sidebar-foreground">{s.value}</p>
                        <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-sidebar-foreground/40 mt-0.5">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── Upcoming Trip ── */}
          {upcomingTrip && !collapsed && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/30 h-auto mb-1 px-2">
                Next Trip
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <button
                  onClick={() => navigate(`/trip/${upcomingTrip.id}`)}
                  className="w-full rounded-2xl overflow-hidden hover:ring-1 hover:ring-brand/30 transition-all group mx-2"
                  style={{ width: "calc(100% - 1rem)" }}
                >
                  <div className="relative h-20 overflow-hidden rounded-2xl">
                    <img
                      src={upcomingTrip.image}
                      alt={upcomingTrip.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
                      <p className="text-[10px] font-black uppercase tracking-tight text-white truncate leading-none">
                        {upcomingTrip.name}
                      </p>
                      <p className="text-[9px] font-bold text-white/50 truncate mt-0.5">
                        {upcomingTrip.destination}
                      </p>
                    </div>
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-brand/90 text-[8px] font-black uppercase tracking-[0.2em] text-black">
                      {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                    </div>
                  </div>
                </button>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── Quick Actions ── */}
          {!collapsed && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/30 h-auto mb-1 px-2">
                Quick Actions
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="flex items-center gap-1.5 px-2">
                  {[
                    { label: "New Trip", icon: Plus, action: () => navigate("/dashboard") },
                    { label: "Upload", icon: Upload, action: () => navigate("/media") },
                    { label: "Export", icon: FileDown, action: () => navigate("/reports") },
                  ].map((a) => (
                    <Tooltip key={a.label}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={a.action}
                          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-sidebar-accent border border-sidebar-border hover:bg-brand/10 hover:border-brand/20 hover:text-brand text-sidebar-foreground/50 transition-all"
                        >
                          <a.icon className="h-3.5 w-3.5" />
                          <span className="text-[8px] font-black uppercase tracking-[0.15em]">{a.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{a.label}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── Recent Trips ── */}
          {recentTrips.length > 0 && !collapsed && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/30 h-auto mb-1 px-2">
                Recent
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="space-y-0.5">
                  {recentTrips.map((trip) => (
                    <button
                      key={trip.id}
                      onClick={() => navigate(`/trip/${trip.id}`)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-sidebar-accent transition-colors group text-left"
                    >
                      <div className="h-7 w-9 rounded-lg overflow-hidden shrink-0">
                        <img src={trip.image} alt={trip.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-sidebar-foreground/70 truncate group-hover:text-brand transition-colors">{trip.name}</p>
                        <p className="text-[9px] text-sidebar-foreground/40 mt-0.5 truncate">{trip.destination || trip.status}</p>
                      </div>
                      <ArrowUpRight className="h-3 w-3 text-sidebar-foreground/30 group-hover:text-brand transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* ── User footer ── */}
        <SidebarFooter className="border-t border-[#1a1a1a] p-2">
          <UserFooter onSignOut={() => setSignOutOpen(true)} />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign Out"
        description={`Are you sure you want to sign out of ${brand.name}?`}
        confirmLabel="Sign Out"
        onConfirm={handleSignOut}
        destructive
      />
    </>
  );
}
