import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Globe, PieChart, Images,
  LogOut, ArrowUpRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
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
  { icon: PieChart,        label: "Reports",      path: "/reports" },
];

function UserFooter({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const displayName = user?.name ?? "";
  const initials = user?.initials ?? (
    displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?"
  );

  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
      <Avatar className="h-8 w-8 rounded-xl shrink-0">
        <AvatarFallback className="rounded-xl bg-brand/15 text-brand text-[10px] font-black border border-brand/20">
          {initials}
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-white truncate leading-none">{displayName}</p>
          <p className="text-[9px] text-[#555] leading-none mt-0.5 truncate">{user?.role ?? ""}</p>
        </div>
      )}
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

  const recentTrip  = trips.length > 0 ? trips[trips.length - 1] : null;
  const currentPath = location.pathname;
  const isActive    = (path: string) => path === "/" ? currentPath === "/" : currentPath === path;

  const handleSignOut = () => { logout(); navigate("/login"); };

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-[#1a1a1a]">

        {/* ── Logo ── */}
        <SidebarHeader className="h-16 border-b border-[#1a1a1a] px-3 flex-row items-center gap-3">
          <button
            onClick={() => navigate("/")}
            aria-label="Go to dashboard"
            className="flex items-center gap-3 min-w-0"
          >
            <div className="h-8 w-8 bg-brand rounded-xl flex items-center justify-center shrink-0 logo-shimmer">
              <Globe className="text-black h-4 w-4" />
            </div>
            {!collapsed && (
              <span className="text-[11px] font-black uppercase tracking-widest text-white whitespace-nowrap">
                DAF Adventures
              </span>
            )}
          </button>
        </SidebarHeader>

        {/* ── Nav ── */}
        <SidebarContent className="pt-2">
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-[#3a3a3a] h-auto mb-1 px-2">
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

          {/* ── Recent trip ── */}
          {recentTrip && !collapsed && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-[#3a3a3a] h-auto mb-1 px-2">
                Recent
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <button
                  onClick={() => navigate(`/trip/${recentTrip.id}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-white/[0.04] transition-colors group text-left"
                >
                  <div className="h-7 w-9 rounded-lg overflow-hidden shrink-0">
                    <img src={recentTrip.image} alt={recentTrip.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-[#aaa] truncate group-hover:text-brand transition-colors">{recentTrip.name}</p>
                    <p className="text-[9px] text-[#444] mt-0.5 truncate">{recentTrip.destination || recentTrip.status}</p>
                  </div>
                  <ArrowUpRight className="h-3 w-3 text-[#444] group-hover:text-brand transition-colors shrink-0" />
                </button>
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
        description="Are you sure you want to sign out of DAF Adventures?"
        confirmLabel="Sign Out"
        onConfirm={handleSignOut}
        destructive
      />
    </>
  );
}
