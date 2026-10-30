import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignOut } from "@phosphor-icons/react";
import { BRAND } from "@/config/brand";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { useStaffPhoto } from "@/hooks/useStaffPhoto";

export function NavUser() {
  const { user, logout } = useAuth();
  const { orgRole } = useOrg();
  const staffPhoto = useStaffPhoto();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const [signOutOpen, setSignOutOpen] = useState(false);

  const displayName = user?.name ?? "";
  const displayRole = user?.role ?? "";
  const initials = user?.initials ?? (
    displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?"
  );

  // No account photo yet: the one on the Travellers page, like Settings > Team
  const photo = user?.avatar || (user ? staffPhoto(user.email, user.name) : "");

  const handleSignOut = () => { logout(); navigate("/login"); };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "flex-col justify-center gap-1.5 px-0" : ""}`}>
            <button
              onClick={() => { navigate("/settings"); setOpenMobile(false); }}
              className={`flex items-center gap-3 flex-1 min-w-0 rounded-lg hover:bg-sidebar-accent/60 transition-colors py-1 px-1 -ml-1 ${collapsed ? "justify-center ml-0" : ""}`}
              aria-label={`${displayName}, open settings`}
              title={collapsed ? `${displayName} · Settings` : undefined}
            >
              <div className="h-8 w-8 rounded-full overflow-hidden bg-sidebar-accent text-sidebar-foreground flex items-center justify-center text-[10px] font-semibold shrink-0">
                {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-semibold text-sidebar-foreground truncate leading-tight">{displayName}</p>
                  <p className="mt-0.5 text-[11px] text-sidebar-muted-foreground leading-tight truncate">
                    {[displayRole, orgRole ? orgRole.charAt(0).toUpperCase() + orgRole.slice(1) : ""].filter(Boolean).join(", ")}
                  </p>
                </div>
              )}
            </button>
            {(
              <Tooltip>
                <TooltipTrigger
                  aria-label="Sign out"
                  onClick={() => setSignOutOpen(true)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <SignOut className="h-3 w-3" />
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
        description={`Are you sure you want to sign out of ${BRAND.name}?`}
        confirmLabel="Sign Out"
        onConfirm={handleSignOut}
        destructive
      />
    </>
  );
}
