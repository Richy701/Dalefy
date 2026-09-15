"use client"

import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/shared/Logo";
import { useTrips } from "@/context/TripsContext";
import { useBrand } from "@/context/BrandContext";
import { useOrg } from "@/context/OrgContext";
import { useNotifications } from "@/context/NotificationContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CaretUpDown, Check, MapPin, ArrowRight } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { differenceInCalendarDays, startOfDay, endOfDay } from "date-fns";
import { parseTripDate } from "@/lib/dates";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupAction,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar"

function SidebarExtras() {
  const { trips } = useTrips();
  const { pathname } = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  const upcomingTrip = React.useMemo(() => {
    const now = new Date();
    return [...trips]
      .filter((t) => startOfDay(parseTripDate(t.start)) > startOfDay(now))
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
  }, [trips]);

  const daysUntil = React.useMemo(() => {
    if (!upcomingTrip) return 0;
    return Math.max(0, differenceInCalendarDays(parseTripDate(upcomingTrip.start), new Date()));
  }, [upcomingTrip]);

  /** Next trip first, then active, then most recent. One list, one mental model. */
  const listedTrips = React.useMemo(() => {
    const now = new Date();
    const rest = [...trips]
      .filter((t) => t.id !== upcomingTrip?.id)
      .sort((a, b) => {
        const aActive = startOfDay(parseTripDate(a.start)) <= now && endOfDay(parseTripDate(a.end)) >= now;
        const bActive = startOfDay(parseTripDate(b.start)) <= now && endOfDay(parseTripDate(b.end)) >= now;
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
      <SidebarSeparator className="mb-4" />
      <SidebarGroupLabel className="text-[11px] font-medium text-sidebar-muted-foreground">
        Your trips
      </SidebarGroupLabel>
      <SidebarGroupAction
        render={<Link to="/trips" />}
        onClick={() => setOpenMobile(false)}
        aria-label="View all trips"
        title="View all trips"
        className="top-8"
      >
        <ArrowRight />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {listedTrips.map((trip) => {
            const now = new Date();
            const isActive = startOfDay(parseTripDate(trip.start)) <= now && endOfDay(parseTripDate(trip.end)) >= now;
            const isNext = trip.id === upcomingTrip?.id;
            const selected = pathname === `/trip/${trip.id}` || pathname.startsWith(`/trip/${trip.id}/`);

            return (
              <SidebarMenuItem key={trip.id}>
                <SidebarMenuButton
                  render={<Link to={`/trip/${trip.id}`} />}
                  onClick={() => setOpenMobile(false)}
                  isActive={selected}
                  aria-current={selected ? "page" : undefined}
                  className="h-auto min-h-16 gap-3 rounded-xl p-2 transition-colors data-active:bg-brand/10"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent text-sidebar-muted-foreground">
                    {trip.image ? (
                      <img src={trip.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : <MapPin className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-5 text-sidebar-foreground">{trip.name}</p>
                    <p className="truncate text-[11px] leading-4 text-sidebar-muted-foreground">{dateRange(trip)}</p>
                    {(isActive || isNext) && (
                      <Badge variant="secondary" className="mt-1 h-4 rounded px-1 text-[10px] font-medium text-sidebar-foreground">
                        {isActive ? "In progress" : `In ${daysUntil} ${daysUntil === 1 ? "day" : "days"}`}
                      </Badge>
                    )}
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
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
    else { showToast("Switched organization"); navigate("/dashboard"); setOpenMobile(false); }
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
            <DropdownMenuContent align="start" side="right" className="min-w-[220px] bg-card border border-border rounded-xl p-1">
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
                  <div className="h-8 w-8 bg-brand rounded-xl flex items-center justify-center shrink-0">
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
            <DropdownMenuContent align="start" className="min-w-[220px] bg-card border border-border rounded-xl p-1">
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
          onClick={() => { navigate("/dashboard"); setOpenMobile(false); }}
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
                <div className="h-8 w-8 bg-brand rounded-xl flex items-center justify-center shrink-0">
                  <Logo className="text-black h-[18px] w-[18px]" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[13px] font-semibold text-sidebar-foreground whitespace-nowrap block truncate">
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
        <SidebarExtras />
      </SidebarContent>

      {/* ── User footer ── */}
      <SidebarFooter className="border-t border-sidebar-border pb-3 gap-1">
        <NavUser />
        {!collapsed && (
          <nav aria-label="Legal" className="px-3 pt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <a href="/support.html" className="hover:text-foreground">Support</a>
            <a href="/changelog.html" className="hover:text-foreground">What's new</a>
            <a href="/privacy.html" className="hover:text-foreground">Privacy</a>
            <a href="/terms.html" className="hover:text-foreground">Terms</a>
          </nav>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
