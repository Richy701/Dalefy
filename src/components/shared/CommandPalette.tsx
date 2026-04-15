import { useState, useCallback } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import {
  LayoutDashboard, Users, Globe, BarChart2, Sun, Moon,
  Plane, MapPin, Search, ArrowRight, Command as CmdIcon,
} from "lucide-react";

interface CommandPaletteProps {
  onNewTrip?: () => void;
}

export function CommandPalette({ onNewTrip }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { trips } = useTrips();

  useHotkeys(
    "meta+k,ctrl+k",
    (e) => {
      e.preventDefault();
      setOpen((prev) => !prev);
    },
    { enableOnFormTags: true, enableOnContentEditable: true }
  );

  const run = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  if (!open) return null;

  const recentTrips = trips.slice(0, 4);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <Command
        className="relative w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-[#2a2a2a] bg-[#111111]"
        loop
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 border-b border-[#1f1f1f]">
          <Search className="h-4 w-4 text-[#555] shrink-0" />
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent py-5 text-sm font-bold tracking-wide text-white outline-none placeholder:text-[#666]"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-bold text-[#444] bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[360px] overflow-y-auto p-2 scrollbar-hide">
          <Command.Empty className="py-10 text-center text-xs font-bold uppercase tracking-[0.25em] text-[#555]">
            No results found
          </Command.Empty>

          {/* Navigate */}
          <Command.Group
            heading="Navigate"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.35em] [&_[cmdk-group-heading]]:text-[#444]"
          >
            {[
              { label: "Dashboard", icon: LayoutDashboard, path: "/" },
              { label: "Travelers", icon: Users, path: "/travelers" },
              { label: "Destinations", icon: Globe, path: "/destinations" },
              { label: "Reports", icon: BarChart2, path: "/reports" },
            ].map(({ label, icon: Icon, path }) => (
              <Command.Item
                key={path}
                value={label}
                onSelect={() => run(() => navigate(path))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-[#1a1a1a] hover:bg-[#1a1a1a]"
              >
                <div className="h-8 w-8 rounded-lg bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {label}
                <ArrowRight className="h-3.5 w-3.5 text-[#444] ml-auto" />
              </Command.Item>
            ))}
          </Command.Group>

          {/* Actions */}
          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.35em] [&_[cmdk-group-heading]]:text-[#444]"
          >
            {onNewTrip && (
              <Command.Item
                value="new trip create"
                onSelect={() => run(() => { navigate("/"); onNewTrip(); })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-[#1a1a1a] hover:bg-[#1a1a1a]"
              >
                <div className="h-8 w-8 rounded-lg bg-[#0bd2b5]/20 text-[#0bd2b5] flex items-center justify-center shrink-0">
                  <Plane className="h-3.5 w-3.5" />
                </div>
                New Trip
                <span className="ml-auto text-[10px] font-bold text-[#555] bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-0.5 rounded-md uppercase tracking-wider">⌘N</span>
              </Command.Item>
            )}
            <Command.Item
              value="toggle theme dark light mode"
              onSelect={() => run(toggleTheme)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-[#1a1a1a] hover:bg-[#1a1a1a]"
            >
              <div className="h-8 w-8 rounded-lg bg-[#1a1a1a] text-[#888] flex items-center justify-center shrink-0">
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </div>
              Toggle {theme === "dark" ? "Light" : "Dark"} Mode
            </Command.Item>
          </Command.Group>

          {/* Recent Trips */}
          {recentTrips.length > 0 && (
            <Command.Group
              heading="Recent Trips"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.35em] [&_[cmdk-group-heading]]:text-[#444]"
            >
              {recentTrips.map((trip) => (
                <Command.Item
                  key={trip.id}
                  value={`trip ${trip.name} ${trip.destination ?? ""}`}
                  onSelect={() => run(() => navigate(`/trip/${trip.id}`))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-white font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-[#1a1a1a] hover:bg-[#1a1a1a]"
                >
                  <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0">
                    <img src={trip.image} alt={trip.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{trip.name}</p>
                    {trip.destination && (
                      <p className="text-[11px] font-bold text-[#555] flex items-center gap-1 truncate">
                        <MapPin className="h-2.5 w-2.5" />{trip.destination}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-[#444] shrink-0" />
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#444]">
            <CmdIcon className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">K</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#444]">
            <span className="flex items-center gap-1"><kbd className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5 font-mono">↵</kbd> select</span>
          </div>
        </div>
      </Command>
    </div>
  );
}
