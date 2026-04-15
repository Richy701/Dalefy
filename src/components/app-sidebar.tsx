"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom";
import { Globe, ArrowUpRight } from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { useTrips } from "@/context/TripsContext";
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
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"

function RecentTrip() {
  const { trips } = useTrips();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const recentTrip = trips.length > 0 ? trips[trips.length - 1] : null;

  if (!recentTrip || state === "collapsed") return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/40 px-2">
        Recent
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => navigate(`/trip/${recentTrip.id}`)}
              className="h-auto py-2 rounded-xl gap-3"
            >
              <div className="h-7 w-9 rounded-lg overflow-hidden shrink-0">
                <img src={recentTrip.image} alt={recentTrip.name} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold truncate">{recentTrip.name}</p>
                <p className="text-[9px] text-sidebar-foreground/40 mt-0.5 truncate">{recentTrip.destination || recentTrip.status}</p>
              </div>
              <ArrowUpRight className="h-3 w-3 text-sidebar-foreground/30 shrink-0" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ── Logo ── */}
      <SidebarHeader className="border-b border-sidebar-border p-0">
        <button
          onClick={() => navigate("/")}
          aria-label="Go to dashboard"
          className={`flex items-center w-full h-16 overflow-hidden ${collapsed ? "justify-center px-0" : "gap-3 px-4"}`}
        >
          {collapsed ? (
            <Globe className="h-4 w-4 text-sidebar-foreground shrink-0" />
          ) : (
            <>
              <div className="h-8 w-8 bg-[#0bd2b5] rounded-xl flex items-center justify-center shrink-0 logo-shimmer">
                <Globe className="text-black h-4 w-4" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-sidebar-foreground whitespace-nowrap">
                DAF Adventures
              </span>
            </>
          )}
        </button>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent className="gap-0 pt-2">
        <NavMain />
        <SidebarSeparator className="my-2" />
        <RecentTrip />
      </SidebarContent>

      {/* ── User footer ── */}
      <SidebarFooter className="border-t border-sidebar-border pb-3">
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
