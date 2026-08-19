import { useState, useCallback, useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/hooks/useGlobalShortcuts";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import {
  SquaresFour, Users, Globe, ChartBar, Sun, Moon,
  AirplaneTilt, MapPin, MagnifyingGlass, ArrowRight, Command as CmdIcon, Gear,
  UserPlus, Shield, Images,
} from "@phosphor-icons/react";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrg } from "@/context/OrgContext";

interface CommandPaletteProps {
  onNewTrip?: () => void;
  onInvite?: () => void;
}

export function CommandPalette({ onNewTrip, onInvite }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { trips } = useTrips();
  const { canInviteMembers, isOrgMember } = usePermissions();
  const { currentOrg } = useOrg();

  useHotkeys(
    "meta+k,ctrl+k",
    (e) => {
      e.preventDefault();
      setOpen((prev) => !prev);
    },
    { enableOnFormTags: true, enableOnContentEditable: true }
  );

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handler);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handler);
  }, []);

  const run = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  if (!open) return null;

  // Most recently departing/upcoming first, so "recent" means something
  const recentTrips = [...trips].sort((a, b) => (b.start ?? "").localeCompare(a.start ?? "")).slice(0, 4);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <Command
        className="relative w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50 border border-slate-200 dark:border-[#2a2a2a] bg-white dark:bg-[#111111] animate-scale-in"
        loop
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 border-b border-slate-100 dark:border-[#1f1f1f]">
          <MagnifyingGlass className="h-4 w-4 text-slate-500 dark:text-[#888] shrink-0" />
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent py-5 text-sm font-bold tracking-wide text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-[#666]"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-bold text-slate-500 dark:text-[#888] bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] rounded-md px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[360px] overflow-y-auto p-2 scrollbar-hide">
          <Command.Empty className="py-10 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">
            Nothing matches. Try a page, an action or a trip name.
          </Command.Empty>

          {/* Navigate */}
          <Command.Group
            heading="Navigate"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.35em] [&_[cmdk-group-heading]]:text-slate-500 dark:[&_[cmdk-group-heading]]:text-[#666]"
          >
            {[
              { label: "Dashboard", icon: SquaresFour, path: "/dashboard" },
              { label: "Travelers", icon: Users, path: "/travelers" },
              { label: "Destinations", icon: Globe, path: "/destinations" },
              { label: "Media", icon: Images, path: "/media" },
              { label: "Reports", icon: ChartBar, path: "/reports" },
              { label: "Settings", icon: Gear, path: "/settings" },
            ].map(({ label, icon: Icon, path }) => (
              <Command.Item
                key={path}
                value={label}
                onSelect={() => run(() => navigate(path))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-slate-900 dark:text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
              >
                <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {label}
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#888] ml-auto" />
              </Command.Item>
            ))}
          </Command.Group>

          {/* Actions */}
          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.35em] [&_[cmdk-group-heading]]:text-slate-500 dark:[&_[cmdk-group-heading]]:text-[#666]"
          >
            {onNewTrip && (
              <Command.Item
                value="new trip create"
                onSelect={() => run(() => { navigate("/dashboard"); onNewTrip(); })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-slate-900 dark:text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
              >
                <div className="h-8 w-8 rounded-lg bg-brand/20 text-brand flex items-center justify-center shrink-0">
                  <AirplaneTilt className="h-3.5 w-3.5" />
                </div>
                New Trip
              </Command.Item>
            )}
            <Command.Item
              value="toggle theme dark light mode"
              onSelect={() => run(toggleTheme)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-slate-900 dark:text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
            >
              <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888] flex items-center justify-center shrink-0">
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </div>
              Toggle {theme === "dark" ? "Light" : "Dark"} Mode
            </Command.Item>
            {canInviteMembers && onInvite && (
              <Command.Item
                value="invite team member"
                onSelect={() => run(onInvite)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-slate-900 dark:text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
              >
                <div className="h-8 w-8 rounded-lg bg-brand/20 text-brand flex items-center justify-center shrink-0">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
                Invite Team Member
              </Command.Item>
            )}
            {isOrgMember && (
              <Command.Item
                value="manage team members roles"
                onSelect={() => run(() => navigate("/settings"))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-slate-900 dark:text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888] flex items-center justify-center shrink-0">
                  <Shield className="h-3.5 w-3.5" />
                </div>
                Manage Team
              </Command.Item>
            )}
          </Command.Group>

          {/* Recent Trips */}
          {recentTrips.length > 0 && (
            <Command.Group
              heading="Recent Trips"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.35em] [&_[cmdk-group-heading]]:text-slate-500 dark:[&_[cmdk-group-heading]]:text-[#666]"
            >
              {recentTrips.map((trip) => (
                <Command.Item
                  key={trip.id}
                  value={`trip ${trip.name} ${trip.destination ?? ""}`}
                  onSelect={() => run(() => navigate(`/trip/${trip.id}`))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-slate-900 dark:text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
                >
                  <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0">
                    <img src={trip.image} alt={trip.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{trip.name}</p>
                    {trip.destination && (
                      <p className="text-[11px] font-bold text-slate-500 dark:text-[#777] flex items-center gap-1 truncate">
                        <MapPin className="h-2.5 w-2.5" />{trip.destination}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#888] shrink-0" />
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-[#888]">
            <CmdIcon className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">K</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888]">
            <span className="flex items-center gap-1"><kbd className="bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] rounded px-1 py-0.5 font-mono">↵</kbd> select</span>
          </div>
        </div>
      </Command>
    </div>
  );
}
