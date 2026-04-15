import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";

export function NavUser() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isMobile } = useSidebar();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const initials = (user?.name ?? "Ash Murray")
    .split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleSignOut = () => { logout(); navigate("/login"); };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton size="lg" className="rounded-xl !hover:bg-black/5 dark:!hover:bg-white/5" />}
            >
              <div className="h-8 w-8 rounded-xl bg-[#0bd2b5]/15 text-[#0bd2b5] flex items-center justify-center text-[10px] font-black shrink-0 border border-[#0bd2b5]/20">
                {initials}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                <span className="truncate text-[11px] font-bold text-sidebar-foreground">{user?.name ?? "Ash Murray"}</span>
                <span className="truncate text-[9px] text-sidebar-foreground/40 uppercase tracking-wider">{user?.role ?? "Lead Designer"}</span>
              </div>
              <ChevronsUpDown className="ml-auto h-4 w-4 text-sidebar-foreground/40 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-xl border-[#2a2a2a] bg-[#111111]"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-3 py-2.5 text-left">
                  <div className="h-8 w-8 rounded-xl bg-[#0bd2b5]/15 text-[#0bd2b5] flex items-center justify-center text-[10px] font-black shrink-0 border border-[#0bd2b5]/20">
                    {initials}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                    <span className="truncate text-[11px] font-bold text-white">{user?.name ?? "Ash Murray"}</span>
                    <span className="truncate text-[9px] text-[#555] uppercase tracking-wider">{user?.role ?? "Lead Designer"}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#2a2a2a]" />
              <DropdownMenuItem
                onClick={() => setSignOutOpen(true)}
                className="text-red-400 hover:text-red-300 focus:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 rounded-lg mx-1 my-0.5 gap-2 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.15em]">Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
