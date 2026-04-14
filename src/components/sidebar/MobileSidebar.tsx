import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Globe, PieChart, Images, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Travelers", path: "/travelers" },
  { icon: Globe, label: "Destinations", path: "/destinations" },
  { icon: Images, label: "Media", path: "/media" },
  { icon: PieChart, label: "Reports", path: "/reports" },
];

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="xl:hidden h-10 w-10 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] shadow-sm">
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0 border-r border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111]">
          <div className="p-6 pb-8 border-b border-slate-200 dark:border-[#1f1f1f]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-[#0bd2b5] rounded-lg flex items-center justify-center shadow-md">
                <Globe className="text-black h-5 w-5" />
              </div>
              <span className="text-sm font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-none whitespace-nowrap">DAF ADVENTURES</span>
            </div>
          </div>
          <nav className="p-4 space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = item.path === "/" ? location.pathname === "/" : location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => handleNav(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${active ? 'bg-[#0bd2b5] text-black shadow-md' : 'text-slate-500 dark:text-[#888888] hover:bg-slate-50 dark:hover:bg-[#050505]'}`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-4 mt-auto absolute bottom-0 left-0 right-0 border-t border-slate-200 dark:border-[#1f1f1f]">
            <div className="flex items-center gap-3 p-3">
              <div className="h-9 w-9 rounded-xl bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-xs">{user?.initials || "AM"}</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{user?.name || "Ash Murray"}</p>
                <p className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-wider">{user?.role || "Lead Designer"}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => { setOpen(false); setSignOutOpen(true); }} className="w-full h-10 justify-start gap-2 text-slate-500 dark:text-[#888888] hover:text-destructive hover:bg-destructive/5 rounded-xl px-3 mt-2">
              <LogOut className="h-3.5 w-3.5" /> <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Sign Out</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} title="Sign Out" description="Are you sure you want to sign out?" confirmLabel="Sign Out" onConfirm={handleSignOut} destructive />
    </>
  );
}
