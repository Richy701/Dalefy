"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/shared/Logo";
import { useTrips } from "@/context/TripsContext";
import { useBrand } from "@/context/BrandContext";
import { useOrg } from "@/context/OrgContext";
import { useNotifications } from "@/context/NotificationContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CaretUpDown, Check } from "@phosphor-icons/react";
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

  /** Next trip first, then active, then most recent. One list, one mental model. */
  const listedTrips = React.useMemo(() => {
    const now = new Date();
    const rest = [...trips]
      .filter((t) => t.id !== upcomingTrip?.id)
      .sort((a, b) => {
        const aActive = parseTripDate(a.start) <= now && parseTripDate(a.end) >= now;
        const bActive = parseTripDate(b.start) <= now && parseTripDate(b.end) >= now;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(b.start).getTime() - new Date(a.start).getTime();
      })
      .slice(0, 4);
    return upcomingTrip ? [upcomingTrip, ...rest] : rest;
  }, [trips, upcomingTrip]);

  if (collapsed || listedTrips.length === 0) return null;

  const dateRange = (t: (typeof trips)[number]) => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(parseTripDate(t.start))} \u2013 ${fmt(parseTripDate(t.end))}`;
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted-foreground px-2">
        Trips
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="space-y-0.5 px-2">
          {listedTrips.map((trip) => {
            const now = new Date();
            const start = parseTripDate(trip.start);
            const end = parseTripDate(trip.end);
            const isActive = start <= now && end >= now;
            const isNext = trip.id === upcomingTrip?.id;

            return (
              <button
                key={trip.id}
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-brand/5 transition-colors group text-left"
              >
                <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 relative bg-sidebar-accent">
                  {trip.image && (
                    <img src={trip.image} alt="" className="h-full w-full object-cover" />
                  )}
                  {isActive && (
                    <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-sidebar" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-sidebar-foreground truncate group-hover:text-brand transition-colors leading-tight">
                    {trip.name}
                  </p>
                  <p className="text-[11px] text-sidebar-muted-foreground truncate leading-tight mt-0.5">
                    {isNext ? dateRange(trip) : (trip.destination || trip.status)}
                  </p>
                </div>
                {isNext && daysUntil > 0 && (
                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-brand bg-brand/10 rounded-md px-1.5 py-0.5">
                    {daysUntil === 1 ? "1d" : `${daysUntil}d`}
                  </span>
                )}
                {isNext && daysUntil === 0 && (
                  <span className="shrink-0 text-[10px] font-semibold text-brand bg-brand/10 rounded-md px-1.5 py-0.5">
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { brand } = useBrand();
  const { currentOrg, orgs, switchOrg } = useOrg();
  const { showToast } = useNotifications();
  const canSwitch = orgs.length > 1;

  const [switching, setSwitching] = React.useState(false);
  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrg?.id || switching) return;
    setSwitching(true);
    const { error } = await switchOrg(orgId);
    setSwitching(false);
    if (error) showToast(error);
    else { showToast("Switched organization"); navigate("/dashboard"); }
  };

  return (
    <Sidebar id="app-sidebar" collapsible="icon" {...props}>
      {/* ── Logo ── */}
      <SidebarHeader className="border-b border-sidebar-border p-0">
        {canSwitch && collapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Switch organization (current: ${currentOrg?.name ?? brand.name})`}
              title="Switch organization"
              className="flex items-center justify-center w-full h-16 hover:bg-sidebar-accent/40 transition-colors cursor-pointer"
            >
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt="" className="h-6 w-6 rounded-lg object-contain shrink-0" />
              ) : (
                <Logo className="h-5 w-5 text-sidebar-foreground shrink-0" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="min-w-[220px] bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-1">
              {orgs.map(o => (
                <DropdownMenuItem
                  key={o.id}
                  onClick={() => handleSwitch(o.id)}
                  className="flex items-center gap-2 text-[13px] font-medium rounded-lg cursor-pointer"
                >
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-brand" weight="bold" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : canSwitch && !collapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Switch organization"
              className="flex items-center w-full h-16 overflow-hidden gap-3 px-4 text-left hover:bg-sidebar-accent/40 transition-colors cursor-pointer"
            >
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-xl object-contain shrink-0" />
                ) : (
                  <div className="h-8 w-8 bg-brand rounded-xl flex items-center justify-center shrink-0 logo-shimmer">
                    <Logo className="text-black h-[18px] w-[18px]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-semibold text-sidebar-foreground whitespace-nowrap block truncate">
                    {currentOrg?.name ?? brand.name}
                  </span>
                  <span className="text-[11px] text-sidebar-muted-foreground whitespace-nowrap block truncate">
                    {orgs.length} organizations
                  </span>
                </div>
                <CaretUpDown className="h-3.5 w-3.5 text-sidebar-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px] bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-1">
              {orgs.map(o => (
                <DropdownMenuItem
                  key={o.id}
                  onClick={() => handleSwitch(o.id)}
                  className="flex items-center gap-2 text-[13px] font-medium rounded-lg cursor-pointer"
                >
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-brand" weight="bold" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
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
                <span className="text-[13px] font-semibold text-sidebar-foreground whitespace-nowrap block">
                  {brand.name}
                </span>
                {currentOrg && currentOrg.name.toLowerCase() !== brand.name.toLowerCase() && (
                  <span className="text-[11px] text-sidebar-muted-foreground whitespace-nowrap block truncate">
                    {currentOrg.name}
                  </span>
                )}
              </div>
            </>
          )}
        </button>
        )}
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
