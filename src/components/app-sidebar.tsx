"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/shared/Logo";
import { useTrips } from "@/context/TripsContext";
import { useBrand } from "@/context/BrandContext";
import { useOrg } from "@/context/OrgContext";
import { parseTripDate } from "@/lib/dates";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar"

function SidebarExtras() {
  const { trips } = useTrips();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const upcomingTrip = React.useMemo(() => {
    const now = new Date();
    return [...trips]
      .filter((t) => parseTripDate(t.start) > now)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  }, [trips]);

  const daysUntil = React.useMemo(() => {
    if (!upcomingTrip) return 0;
    const diff = parseTripDate(upcomingTrip.start).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [upcomingTrip]);

  const recentTrips = React.useMemo(() => {
    const now = new Date();
    return [...trips]
      .filter((t) => t.id !== upcomingTrip?.id)
      .sort((a, b) => {
        const aActive = parseTripDate(a.start) <= now && parseTripDate(a.end) >= now;
        const bActive = parseTripDate(b.start) <= now && parseTripDate(b.end) >= now;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(b.start).getTime() - new Date(a.start).getTime();
      })
      .slice(0, 5);
  }, [trips, upcomingTrip]);

  if (collapsed) return null;

  return (
    <>
      {/* ── Next Trip ── */}
      {upcomingTrip && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/50 px-2">
            Next Trip
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2">
              <button
                onClick={() => navigate(`/trip/${upcomingTrip.id}`)}
                className="w-full rounded-xl overflow-hidden hover:ring-1 hover:ring-brand/30 transition-all group"
              >
                <div className="relative h-20 overflow-hidden rounded-xl">
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
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[8px] font-black uppercase tracking-[0.2em] text-white">
                    {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                  </div>
                </div>
              </button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {/* ── Recent Trips ── */}
      {recentTrips.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/50 px-2">
            Recent
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-0.5 px-1">
              {recentTrips.map((trip) => {
                const now = new Date();
                const start = parseTripDate(trip.start);
                const end = parseTripDate(trip.end);
                const isActive = start <= now && end >= now;

                return (
                  <button
                    key={trip.id}
                    onClick={() => navigate(`/trip/${trip.id}`)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors group text-left"
                  >
                    <div className="h-7 w-7 rounded-lg overflow-hidden shrink-0 relative">
                      <img src={trip.image} alt={trip.name} className="h-full w-full object-cover" />
                      {isActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand border-[1.5px] border-sidebar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-sidebar-foreground/65 truncate group-hover:text-brand transition-colors leading-none">{trip.name}</p>
                      <p className="text-[8px] text-sidebar-foreground/35 truncate mt-0.5 leading-none">{trip.destination || trip.status}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { brand } = useBrand();
  const { currentOrg } = useOrg();

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ── Logo ── */}
      <SidebarHeader className="border-b border-sidebar-border p-0">
        <button
          onClick={() => navigate("/dashboard")}
          aria-label="Go to dashboard"
          className={`flex items-center w-full h-16 overflow-hidden ${collapsed ? "justify-center px-0" : "gap-3 px-4"}`}
        >
          {collapsed ? (
            brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="h-6 w-6 rounded-lg object-contain shrink-0" />
            ) : (
              <Logo className="h-5 w-5 text-sidebar-foreground shrink-0" />
            )
          ) : (
            <>
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-xl object-contain shrink-0" />
              ) : (
                <div className="h-8 w-8 bg-brand rounded-xl flex items-center justify-center shrink-0 logo-shimmer">
                  <Logo className="text-black h-[18px] w-[18px]" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-sidebar-foreground whitespace-nowrap block">
                  {brand.name}
                </span>
                {currentOrg && currentOrg.name.toLowerCase() !== brand.name.toLowerCase() && (
                  <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/40 whitespace-nowrap block">
                    {currentOrg.name}
                  </span>
                )}
              </div>
            </>
          )}
        </button>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent className="gap-0 pt-2">
        <NavMain />
        <SidebarSeparator className="my-2" />
        <SidebarExtras />
      </SidebarContent>

      {/* ── User footer ── */}
      <SidebarFooter className="border-t border-sidebar-border pb-3 gap-1">
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
