import { useNavigate, useLocation } from "react-router-dom";
import { SquaresFour, Users, Globe, ChartPie, Images, Gear } from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
const NAV_ITEMS = [
  { icon: SquaresFour, label: "Dashboard", path: "/" },
  { icon: Users,       label: "Travelers",   path: "/travelers" },
  { icon: Globe,       label: "Destinations", path: "/destinations" },
  { icon: Images,      label: "Media",        path: "/media" },
  { icon: ChartPie,    label: "Reports",      path: "/reports" },
  { icon: Gear,        label: "Settings",     path: "/settings" },
];

export function NavMain() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const currentPath = location.pathname;
  const isActive    = (path: string) => path === "/" ? currentPath === "/" : currentPath === path;

  return (
    <SidebarGroup>
      <SidebarMenu className="gap-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
          const active = isActive(path);
          return (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton
                onClick={() => navigate(path)}
                isActive={active}
                className={`
                  relative rounded-lg h-9 gap-3
                  before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2
                  before:h-4 before:w-[3px] before:rounded-r-full before:transition-all
                  ${active
                    ? "bg-brand/10! text-brand! hover:bg-brand/15! before:bg-brand"
                    : "text-sidebar-foreground! hover:text-brand! hover:bg-brand/5! before:bg-transparent"
                  }
                `}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" weight={active ? "fill" : "regular"} />
                <span className={`text-[13px] tracking-normal ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
