import { Link, useLocation } from "react-router-dom";
import { SquaresFour, Users, Globe, ChartBar, Images, Gear } from "@phosphor-icons/react";
import { motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
// Each icon's own small move when its page opens: the gear turns, the globe spins, the bars rise
const spring = { type: "spring", stiffness: 420, damping: 16 } as const;
const NAV_ITEMS: Array<{ icon: typeof SquaresFour; label: string; path: string; pop: { from: TargetAndTransition; to: TargetAndTransition } }> = [
  { icon: SquaresFour, label: "Dashboard",    path: "/dashboard",    pop: { from: { scale: 0.6 }, to: { scale: 1 } } },
  { icon: Users,       label: "Travellers",   path: "/travelers",    pop: { from: { y: 4, scale: 0.85 }, to: { y: 0, scale: 1 } } },
  { icon: Globe,       label: "Destinations", path: "/destinations", pop: { from: { rotate: -90, scale: 0.85 }, to: { rotate: 0, scale: 1 } } },
  { icon: Images,      label: "Media",        path: "/media",        pop: { from: { rotate: -14, scale: 0.85 }, to: { rotate: 0, scale: 1 } } },
  { icon: ChartBar,    label: "Reports",      path: "/reports",      pop: { from: { scaleY: 0.3, originY: 1 }, to: { scaleY: 1, originY: 1 } } },
  { icon: Gear,        label: "Settings",     path: "/settings",     pop: { from: { rotate: -120 }, to: { rotate: 0 } } },
];

export function NavMain() {
  const { setOpenMobile } = useSidebar();
  const reduceMotion = useReducedMotion();
  const location    = useLocation();
  const currentPath = location.pathname;
  const isActive    = (path: string) => path === "/dashboard" ? ["/", "/dashboard", "/trips"].includes(currentPath) : currentPath === path || currentPath.startsWith(`${path}/`);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] font-medium text-sidebar-muted-foreground">Workspace</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {NAV_ITEMS.map(({ icon: Icon, label, path, pop }) => {
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
                  rounded-lg h-9 gap-3 transition-[color,background-color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100
                  ${active
                    ? "bg-sidebar-accent! text-sidebar-foreground!"
                    : "text-sidebar-muted-foreground! hover:text-sidebar-foreground! hover:bg-sidebar-accent/60!"
                  }
                `}
              >
                {/* Keyed on active, so the move plays each time the page becomes the current one */}
                <motion.span
                  key={active ? "on" : "off"}
                  className="inline-flex shrink-0"
                  initial={active && !reduceMotion ? pop.from : false}
                  animate={pop.to}
                  transition={spring}
                >
                  <Icon className="h-[18px] w-[18px]" weight={active ? "fill" : "regular"} />
                </motion.span>
                <span className={`text-[13px] tracking-normal ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
