import { useState } from "react";
import { toast } from "sonner";
import {
  User as UserIcon, Palette, Bell, Database, Keyboard,
  Sun, Moon, Download, Trash2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
import { usePreferences, ACCENT_PALETTE } from "@/context/PreferencesContext";
import { playChime } from "@/lib/sound";

interface SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  id?: string;
}

function Section({ icon: Icon, title, description, children, id }: SectionProps) {
  return (
    <section
      id={id}
      className="border-t border-slate-200 dark:border-[#1f1f1f] py-8 grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr] gap-6 lg:gap-12 scroll-mt-20"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-[#888888]" />
          </div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white">
            {title}
          </h2>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-[#666666] leading-relaxed max-w-[280px]">
          {description}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label, value, action,
}: { label: string; value?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white">
          {label}
        </p>
        {value && (
          <p className="text-[11px] text-slate-500 dark:text-[#888888] mt-1 truncate">
            {value}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      role="switch"
      className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-brand" : "bg-slate-300 dark:bg-[#2a2a2a]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["⌘", "/"], label: "Open command palette (alt)" },
  { keys: ["G", "D"], label: "Go to dashboard" },
  { keys: ["G", "T"], label: "Go to travelers" },
  { keys: ["G", "M"], label: "Go to destinations" },
  { keys: ["G", "R"], label: "Go to reports" },
  { keys: ["G", "S"], label: "Go to settings" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
];

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { trips } = useTrips();
  const {
    compactMode, setCompactMode,
    toastsEnabled, setToastsEnabled,
    soundEnabled, setSoundEnabled,
    accent, setAccent,
  } = usePreferences();
  const activeAccent = ACCENT_PALETTE.find((p) => p.id === accent) ?? ACCENT_PALETTE[0];
  const [resetOpen, setResetOpen] = useState(false);

  const initials = (user?.name ?? "AM")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const exportTrips = () => {
    const data = JSON.stringify(trips, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daf-trips-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${trips.length} trips`);
  };

  const resetData = () => {
    ["daf-adventures-v4", "daf-compliance", "daf-custom-travelers", "daf-toasts", "daf-sound", "daf-compact", "daf-accent"]
      .forEach((k) => localStorage.removeItem(k));
    toast.success("Trip data cleared");
    setTimeout(() => window.location.reload(), 600);
  };

  const storageSizeKb = (() => {
    try {
      let total = 0;
      for (const key in localStorage) {
        if (key.startsWith("daf-")) {
          total += (localStorage.getItem(key)?.length ?? 0) + key.length;
        }
      }
      return (total / 1024).toFixed(1);
    } catch {
      return "0";
    }
  })();

  const handleSoundToggle = (v: boolean) => {
    setSoundEnabled(v);
    if (v) playChime("success");
  };

  return (
    <>
      <PageHeader
        left={
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
              Settings
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-[#555555] hidden md:inline">
              Preferences & Data
            </span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 lg:px-8 py-6 pb-24">
          {/* ── Profile ── */}
          <Section
            icon={UserIcon}
            title="Profile"
            description="Your account details. Shown on the sidebar and in shared trip links."
          >
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl p-5 flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-brand/15 text-brand flex items-center justify-center text-lg font-black border border-brand/20 shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
                  {user?.name ?? "Ash Murray"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#888888] truncate">
                  {user?.email ?? "ash.murray@dafadventures.com"}
                </p>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand mt-1">
                  {user?.role ?? "Trip Manager"}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 rounded-full px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {user?.status ?? "Active"}
              </div>
            </div>
          </Section>

          {/* ── Appearance ── */}
          <Section
            icon={Palette}
            title="Appearance"
            description="Tune how the workspace looks. Changes apply instantly across every page."
          >
            <Row
              label="Theme"
              value={theme === "dark" ? "Dark — default operator view" : "Light — high-contrast daytime"}
              action={
                <button
                  onClick={toggleTheme}
                  className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-[#1f1f1f] hover:bg-slate-200 dark:hover:bg-[#2a2a2a] border border-slate-200 dark:border-[#2a2a2a] text-slate-600 dark:text-[#888888] hover:text-brand flex items-center justify-center transition-colors"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              }
            />
            <Row
              label="Compact Mode"
              value="Tighter spacing on dashboard and lists"
              action={<ToggleSwitch checked={compactMode} onChange={setCompactMode} />}
            />
            <Row
              label="Accent"
              value={`${activeAccent.label} — applied to active states and CTAs`}
              action={
                <div className="flex flex-wrap items-center justify-end gap-2 max-w-[168px] sm:max-w-none">
                  {ACCENT_PALETTE.map((p) => {
                    const selected = p.id === accent;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setAccent(p.id)}
                        aria-label={p.label}
                        aria-pressed={selected}
                        title={p.label}
                        className="h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                        style={{
                          background: p.hex,
                          boxShadow: selected
                            ? `0 0 0 2px rgb(${p.rgb} / 0.35), 0 0 0 4px hsl(var(--card))`
                            : "none",
                        }}
                      >
                        {selected && <Check className="h-3.5 w-3.5 text-black" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              }
            />
          </Section>

          {/* ── Notifications ── */}
          <Section
            icon={Bell}
            title="Notifications"
            description="Control how the app interrupts you. Notifications appear as toasts and in the bell panel."
          >
            <Row
              label="Toast Notifications"
              value="Show toast messages for actions like trip created, imported, or deleted"
              action={<ToggleSwitch checked={toastsEnabled} onChange={setToastsEnabled} />}
            />
            <Row
              label="Sound Alerts"
              value="Play a subtle chime on successful actions"
              action={<ToggleSwitch checked={soundEnabled} onChange={handleSoundToggle} />}
            />
          </Section>

          {/* ── Data ── */}
          <Section
            icon={Database}
            title="Data"
            description="Export your work or reset local data. Cloud-synced trips are not affected by reset."
          >
            <Row
              label="Export Trips"
              value={`${trips.length} trip${trips.length === 1 ? "" : "s"} — download as JSON`}
              action={
                <Button
                  onClick={exportTrips}
                  className="h-9 rounded-xl bg-brand hover:opacity-90 text-black font-black uppercase tracking-wider text-[10px] px-3 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              }
            />
            <Row
              label="Local Storage"
              value={`${storageSizeKb} KB used across preferences, trips, and compliance overrides`}
            />
            <Row
              label="Reset Trip Data"
              value="Clears trips, compliance overrides, and custom travelers. Keeps your account."
              action={
                <Button
                  onClick={() => setResetOpen(true)}
                  variant="ghost"
                  className="h-9 rounded-xl text-red-500 hover:text-red-400 hover:bg-red-500/10 font-black uppercase tracking-wider text-[10px] px-3 gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Reset
                </Button>
              }
            />
          </Section>

          {/* ── Shortcuts ── */}
          <Section
            id="keyboard-shortcuts"
            icon={Keyboard}
            title="Shortcuts"
            description="Keyboard shortcuts work anywhere in the app. Press ⌘K to open the command palette."
          >
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl overflow-hidden">
              {SHORTCUTS.map((s, i) => (
                <div
                  key={s.label}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i !== SHORTCUTS.length - 1 ? "border-b border-slate-100 dark:border-[#1a1a1a]" : ""
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-[#bbbbbb]">
                    {s.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="min-w-[24px] h-6 px-1.5 rounded-md bg-slate-100 dark:bg-[#1f1f1f] border border-slate-200 dark:border-[#2a2a2a] text-[10px] font-black text-slate-600 dark:text-[#888888] flex items-center justify-center"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Footer ── */}
          <div className="border-t border-slate-200 dark:border-[#1f1f1f] pt-6 mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#555555]">
            <span>DAF Adventures</span>
            <span>v0.4.0 · Build {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset Trip Data"
        description="This will permanently clear all trips, compliance overrides, and custom travelers from this device. Your account and theme preference will be kept. This cannot be undone."
        confirmLabel="Reset"
        onConfirm={resetData}
        destructive
      />
    </>
  );
}
