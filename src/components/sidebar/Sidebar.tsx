import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Globe, PieChart, Images, ChevronRight, LogOut, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Travelers", path: "/travelers" },
  { icon: Globe, label: "Destinations", path: "/destinations" },
  { icon: Images, label: "Media", path: "/media" },
  { icon: PieChart, label: "Reports", path: "/reports" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { trips } = useTrips();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const recentTrip = trips.length > 0 ? trips[trips.length - 1] : null;

  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath === path;
  };

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <aside className="w-64 bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-[#1f1f1f] flex flex-col hidden xl:flex shadow-sm relative z-50">
        <div className="p-6">
          <button aria-label="Go to dashboard" className="flex items-center gap-3 group cursor-pointer bg-transparent border-none p-0" onClick={() => navigate("/")}>
            <div className="h-10 w-10 bg-[#0bd2b5] rounded-lg flex items-center justify-center logo-shimmer">
              <Globe className="text-black h-5 w-5" />
            </div>
            <span className="text-sm font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-none whitespace-nowrap">DAF ADVENTURES</span>
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <p className="px-4 text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em] mb-4">MENU</p>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-[background-color,color,box-shadow] duration-200 group focus-visible:ring-2 focus-visible:ring-[#0bd2b5] focus-visible:ring-offset-2 ${active ? 'bg-[#0bd2b5] text-slate-900 dark:text-black shadow-lg shadow-[#0bd2b5]/20' : 'text-slate-500 dark:text-[#888888] hover:bg-slate-50 dark:hover:bg-[#050505] hover:text-slate-900 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={active ? 'text-slate-900 dark:text-black' : 'group-hover:text-[#0bd2b5]'}><item.icon className="h-5 w-5" /></span>
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
                {active && <ChevronRight className="h-4 w-4" />}
              </button>
            );
          })}
        </nav>
        {recentTrip && (
          <div className="px-4 pb-4">
            <p className="px-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555] mb-2">Recent</p>
            <button
              onClick={() => navigate(`/trip/${recentTrip.id}`)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#050505] transition-[background-color] group text-left"
            >
              <div className="h-8 w-10 rounded-lg overflow-hidden shrink-0">
                <img src={recentTrip.image} alt={recentTrip.name} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-700 dark:text-[#aaa] truncate leading-none group-hover:text-[#0bd2b5] transition-colors">{recentTrip.name}</p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-[#555] mt-0.5 truncate">{recentTrip.destination || recentTrip.status}</p>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 dark:text-[#444] group-hover:text-[#0bd2b5] transition-colors shrink-0" />
            </button>
          </div>
        )}
<div className="px-4 py-5 mt-auto border-t border-slate-200 dark:border-[#1f1f1f] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-none">{user?.name || "Ash Murray"}</p>
            <p className="text-[10px] font-medium text-slate-400 dark:text-[#666] leading-none mt-0.5 truncate">{user?.role || "Lead Designer"}</p>
          </div>
          <button aria-label="Sign out" onClick={() => setSignOutOpen(true)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-red-500 hover:bg-red-500/10 transition-[background-color,color] shrink-0">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
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
