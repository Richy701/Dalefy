import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";

export function NavUser() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [signOutOpen, setSignOutOpen] = useState(false);

  const displayName = user?.name ?? "";
  const displayRole = user?.role ?? "";
  const initials = user?.initials ?? (
    displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?"
  );

  const handleSignOut = () => { logout(); navigate("/login"); };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
            <button
              onClick={() => navigate("/settings")}
              className={`flex items-center gap-3 flex-1 min-w-0 rounded-xl hover:bg-sidebar-accent/50 transition-colors py-1 px-1 -ml-1 ${collapsed ? "justify-center" : ""}`}
              aria-label="Settings"
            >
              <div className="h-8 w-8 rounded-xl bg-brand/15 text-brand flex items-center justify-center text-[10px] font-black shrink-0 border border-brand/20">
                {initials}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[11px] font-bold text-sidebar-foreground truncate leading-none">{displayName}</p>
                  <p className="text-[9px] text-sidebar-foreground/40 leading-none mt-0.5 truncate uppercase tracking-wider">{displayRole}</p>
                </div>
              )}
            </button>
            {!collapsed && (
              <Tooltip>
                <TooltipTrigger
                  aria-label="Sign out"
                  onClick={() => setSignOutOpen(true)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-sidebar-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <LogOut className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent side="top">Sign out</TooltipContent>
              </Tooltip>
            )}
          </div>
        </SidebarMenuItem>
      </SidebarMenu>

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
