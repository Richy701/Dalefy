import { Link, useLocation } from "react-router-dom";
import { SquaresFour, Users, Globe, ChartPie, Images, Gear } from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
const NAV_ITEMS = [
  { icon: SquaresFour, label: "Dashboard", path: "/dashboard" },
  { icon: Users,       label: "Travelers",   path: "/travelers" },
  { icon: Globe,       label: "Destinations", path: "/destinations" },
  { icon: Images,      label: "Media",        path: "/media" },
  { icon: ChartPie,    label: "Reports",      path: "/reports" },
  { icon: Gear,        label: "Settings",     path: "/settings" },
];

export function NavMain() {
  const { setOpenMobile } = useSidebar();
  const location    = useLocation();
  const currentPath = location.pathname;
  const isActive    = (path: string) => path === "/dashboard" ? ["/", "/dashboard", "/trips"].includes(currentPath) : currentPath === path || currentPath.startsWith(`${path}/`);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] font-medium text-sidebar-muted-foreground">Workspace</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
          const active = isActive(path);
          return (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton
                render={<Link to={path} />}
                onClick={() => setOpenMobile(false)}
                tooltip={label}
                aria-current={active ? "page" : undefined}
                isActive={active}
                className={`
                  relative rounded-lg h-10 gap-3 transition-colors motion-reduce:transition-none
                  before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2
                  before:h-4 before:w-[3px] before:rounded-r-full before:transition-all
                  ${active
                    ? "bg-brand/10! text-brand! hover:bg-brand/15! before:bg-brand"
                    : "text-sidebar-muted-foreground! hover:text-sidebar-foreground! hover:bg-sidebar-accent! before:bg-transparent"
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
