import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Globe, PieChart, Images, Settings } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users,           label: "Travelers",   path: "/travelers" },
  { icon: Globe,           label: "Destinations", path: "/destinations" },
  { icon: Images,          label: "Media",        path: "/media" },
  { icon: PieChart,        label: "Reports",      path: "/reports" },
  { icon: Settings,        label: "Settings",     path: "/settings" },
];

export function NavMain() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const currentPath = location.pathname;
  const isActive    = (path: string) => path === "/" ? currentPath === "/" : currentPath === path;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[9px] font-black uppercase tracking-[0.45em] text-sidebar-foreground/40 px-2 group-data-[collapsible=icon]:hidden">
        Menu
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
          const active = isActive(path);
          return (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton
                onClick={() => navigate(path)}
                isActive={active}
                className={`
                  relative rounded-xl h-10 gap-3
                  ${active
                    ? "!bg-black/8 dark:!bg-white/8 !text-sidebar-foreground hover:!bg-black/10 dark:hover:!bg-white/10"
                    : "!text-sidebar-foreground/55 hover:!text-sidebar-foreground hover:!bg-black/5 dark:hover:!bg-white/5"
                  }
                `}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={`text-[11px] uppercase tracking-[0.1em] ${active ? "font-black" : "font-semibold"}`}>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
