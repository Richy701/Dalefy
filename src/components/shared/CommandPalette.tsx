import { useState, useCallback, useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate, useLocation } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/hooks/useGlobalShortcuts";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { useDirectoryTravelers } from "@/context/directory";
import {
  SquaresFour, Users, Globe, ChartBar, Sun, Moon,
  AirplaneTilt, MapPin, MagnifyingGlass, ArrowRight, Command as CmdIcon, Gear,
  UserPlus, UsersThree, Images, PaperPlaneTilt, ShareNetwork, EnvelopeSimple,
} from "@phosphor-icons/react";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrg } from "@/context/OrgContext";

interface CommandPaletteProps {
  onNewTrip?: () => void;
  onInvite?: () => void;
}

export function CommandPalette({ onNewTrip, onInvite }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  // On a trip, the palette can publish, share or email it; the workspace listens for these
  const onTrip = /^\/trip\/[^/]+/.test(useLocation().pathname);
  const tripAction = (action: "publish" | "share" | "email") =>
    window.dispatchEvent(new CustomEvent("dalefy:trip-action", { detail: { action } }));
  const { theme, toggleTheme } = useTheme();
  const { trips } = useTrips();
  const [people] = useDirectoryTravelers();
  const { canInviteMembers, isOrgMember } = usePermissions();
  const { currentOrg: _currentOrg } = useOrg();

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
  // Empty: the four latest trips. Typing: every trip and every traveller, matched by name, place or traveller
  const typing = query.trim().length > 0;
  const recentTrips = [...trips].sort((a, b) => (b.start ?? "").localeCompare(a.start ?? "")).slice(0, typing ? undefined : 4);
  const travellers = typing ? people.filter(p => p.name?.trim()) : [];

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <Command
        className="relative w-full max-w-xl rounded-xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50 border border-border bg-card animate-scale-in"
        loop
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 border-b border-border">
          <MagnifyingGlass className="h-4 w-4 text-muted-foreground shrink-0" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search trips, travellers or commands"
            className="flex-1 bg-transparent py-5 text-sm font-bold tracking-wide text-foreground outline-none placeholder:text-slate-400 dark:placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground bg-secondary border border-border rounded-md px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[360px] overflow-y-auto p-2 scrollbar-hide">
          <Command.Empty className="py-10 text-center text-xs font-medium text-muted-foreground">
            Nothing matches. Try a page, an action or a trip name.
          </Command.Empty>

          {/* Navigate */}
          <Command.Group
            heading="Navigate"
            className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-black **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.35em] **:[[cmdk-group-heading]]:text-slate-500 dark:**:[[cmdk-group-heading]]:text-[#666]"
          >
            {[
              { label: "Dashboard", icon: SquaresFour, path: "/dashboard" },
              { label: "Travellers", icon: Users, path: "/travelers" },
              { label: "Destinations", icon: Globe, path: "/destinations" },
              { label: "Media", icon: Images, path: "/media" },
              { label: "Reports", icon: ChartBar, path: "/reports" },
              { label: "Settings", icon: Gear, path: "/settings" },
            ].map(({ label, icon: Icon, path }) => (
              <Command.Item
                key={path}
                value={label}
                onSelect={() => run(() => navigate(path))}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary"
              >
                <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {label}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </Command.Item>
            ))}
          </Command.Group>

          {/* This trip */}
          {onTrip && (
            <Command.Group heading="This trip" className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-black **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.35em] **:[[cmdk-group-heading]]:text-slate-500 dark:**:[[cmdk-group-heading]]:text-[#666]">
              {([
                { action: "publish", label: "Publish trip", value: "publish trip travellers", Icon: PaperPlaneTilt },
                { action: "share", label: "Share trip", value: "share trip link pin qr", Icon: ShareNetwork },
                { action: "email", label: "Email itinerary", value: "email itinerary send travellers invite", Icon: EnvelopeSimple },
              ] as const).map(({ action, label, value, Icon }) => (
                <Command.Item key={action} value={value} onSelect={() => run(() => tripAction(action))} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary">
                  <div className="h-8 w-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Actions */}
          <Command.Group
            heading="Actions"
            className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-black **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.35em] **:[[cmdk-group-heading]]:text-slate-500 dark:**:[[cmdk-group-heading]]:text-[#666]"
          >
            {onNewTrip && (
              <Command.Item
                value="new trip create"
                onSelect={() => run(() => { navigate("/dashboard"); onNewTrip(); })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary"
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary"
            >
              <div className="h-8 w-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </div>
              Toggle {theme === "dark" ? "Light" : "Dark"} Mode
            </Command.Item>
            {canInviteMembers && onInvite && (
              <Command.Item
                value="invite team member"
                onSelect={() => run(onInvite)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary"
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary"
              >
                <div className="h-8 w-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <UsersThree className="h-3.5 w-3.5" />
                </div>
                Manage Team
              </Command.Item>
            )}
          </Command.Group>

          {/* Recent Trips */}
          {recentTrips.length > 0 && (
            <Command.Group
              heading={typing ? "Trips" : "Recent trips"}
              className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-black **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.35em] **:[[cmdk-group-heading]]:text-slate-500 dark:**:[[cmdk-group-heading]]:text-[#666]"
            >
              {recentTrips.map((trip) => (
                <Command.Item
                  key={trip.id}
                  value={`trip ${trip.name} ${trip.destination ?? ""} ${trip.attendees ?? ""} ${trip.id}`}
                  onSelect={() => run(() => navigate(`/trip/${trip.id}`))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground font-bold text-sm tracking-wide transition-colors data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-[#1a1a1a] hover:bg-secondary"
                >
                  <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0">
                    <img src={trip.image} alt={trip.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{trip.name}</p>
                    {trip.destination && (
                      <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="h-2.5 w-2.5" />{trip.destination}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {travellers.length > 0 && (
            <Command.Group
              heading="Travellers"
              className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground"
            >
              {travellers.map(person => (
                <Command.Item
                  key={person.id}
                  value={`person ${person.name} ${person.email ?? ""} ${person.id}`}
                  onSelect={() => run(() => navigate(`/travelers?person=${encodeURIComponent(person.id)}`))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-foreground text-sm transition-colors data-[selected=true]:bg-secondary hover:bg-secondary"
                >
                  <span className="h-8 w-8 rounded-full overflow-hidden shrink-0 bg-secondary flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                    {person.avatar ? <img src={person.avatar} alt="" className="h-full w-full object-cover" /> : (person.initials || person.name.charAt(0))}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{person.name}</span>
                    {person.email && <span className="block truncate text-[11px] text-muted-foreground">{person.email}</span>}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CmdIcon className="h-3 w-3" />
            <span className="text-xs font-medium">K</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1"><kbd className="bg-secondary border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-secondary border border-border rounded px-1 py-0.5 font-mono">↵</kbd> select</span>
          </div>
        </div>
      </Command>
    </div>
  );
}
