import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  User as UserIcon, Palette, Bell, Database, Keyboard,
  Sun, Moon, Download, Trash2, Lock, Building2, Upload,
} from "lucide-react";
import { isFirebaseConfigured, firebaseDb } from "@/services/firebase";
import { doc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { changePassword } from "@/services/firebaseAuth";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";
import { updateBranding, uploadLogo } from "@/services/firebaseBranding";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { PageHeader } from "@/components/shared/PageHeader";
import { BRAND } from "@/config/brand";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
import { useOrg } from "@/context/OrgContext";
import { useBrand } from "@/context/BrandContext";
import { usePreferences, ACCENT_PRESETS } from "@/context/PreferencesContext";
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
    accentColor, setAccentColor,
  } = usePreferences();
  const { currentOrg, orgRole, tablesReady, isLoading: orgLoading, createOrg } = useOrg();
  const { brand, orgBranding, refreshBranding } = useBrand();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const realAuth = isFirebaseConfigured() && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;
  const canManageOrg = realAuth && currentOrg && (orgRole === "owner" || orgRole === "admin");
  // Show branding section: org owners/admins, or demo mode (localStorage branding)
  const showBrandingSection = canManageOrg || (realAuth && orgLoading) || !isFirebaseConfigured();

  // Org branding form state
  const [brandName, setBrandName] = useState(orgBranding?.companyName ?? "");
  const [brandColor, setBrandColor] = useState(orgBranding?.accentColor ?? BRAND.accentColor);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandLogo, setBrandLogo] = useState(orgBranding?.logoUrl ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [agencyCodeEdit, setAgencyCodeEdit] = useState(currentOrg?.agencyCode ?? "");
  const [savingAgencyCode, setSavingAgencyCode] = useState(false);
  const canSetupOrg = realAuth && !currentOrg && tablesReady;

  // Sync form state when orgBranding loads asynchronously
  useEffect(() => {
    if (orgBranding) {
      if (orgBranding.companyName) setBrandName(orgBranding.companyName);
      if (orgBranding.logoUrl) setBrandLogo(orgBranding.logoUrl);
      if (orgBranding.accentColor) setBrandColor(orgBranding.accentColor);
    }
  }, [orgBranding]);

  useEffect(() => {
    if (currentOrg?.agencyCode) setAgencyCodeEdit(currentOrg.agencyCode);
  }, [currentOrg?.agencyCode]);

  const handleSaveBranding = async () => {
    const orgId = currentOrg?.id ?? "local";
    setSavingBrand(true);
    const { error } = await updateBranding(orgId, {
      companyName: brandName || null,
      logoUrl: brandLogo || null,
      accentColor: accentColor !== BRAND.accentColor ? accentColor : null,
    });
    setSavingBrand(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Branding saved");
      refreshBranding();
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setUploadingLogo(true);
    try {
      const { url, error } = await uploadLogo(currentOrg?.id ?? "local", file);
      if (error) {
        logger.error("SettingsPage", "logo upload error:", error);
        toast.error(error);
      } else if (url) {
        setBrandLogo(url);
        toast.success("Logo uploaded — hit Save to apply");
      }
    } catch (err) {
      logger.error("SettingsPage", "logo upload exception:", err);
      toast.error("Upload failed");
    }
    setUploadingLogo(false);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    const { error } = await createOrg(newOrgName.trim());
    setCreatingOrg(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Agency created! Branding options are now available.");
      setNewOrgName("");
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setChangingPassword(true);
    const { error } = await changePassword(newPassword);
    setChangingPassword(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Password updated");
      setNewPassword("");
    }
  };

  const initials = user?.initials ?? (
    (user?.name ?? "").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?"
  );

  const exportTrips = () => {
    // Build CSV with one row per event across all trips
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["Trip", "Destination", "Status", "Start", "End", "Pax", "Budget", "Event Type", "Event Title", "Date", "Time", "Location", "Duration", "Airline", "Flight #", "Conf #", "Room Type", "Check-in", "Check-out", "Notes"];
    const rows = [headers.join(",")];
    for (const trip of trips) {
      const base = [trip.name, trip.destination ?? "", trip.status, trip.start, trip.end, trip.paxCount ?? "", trip.budget ? `${trip.currency ?? "USD"} ${trip.budget}` : ""];
      if (trip.events.length === 0) {
        rows.push([...base, "", "", "", "", "", "", "", "", "", "", "", ""].map(v => esc(String(v))).join(","));
      } else {
        for (const ev of trip.events) {
          rows.push([...base, ev.type ?? "", ev.title ?? "", ev.date ?? "", ev.time ?? "", ev.location ?? "", ev.duration ?? "", ev.airline ?? "", ev.flightNum ?? "", ev.confNumber ?? "", ev.roomType ?? "", ev.checkin ?? "", ev.checkout ?? "", ev.notes ?? ""].map(v => esc(String(v))).join(","));
        }
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${BRAND.storagePrefix}-trips-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${trips.length} trips as CSV`);
  };

  const resetData = () => {
    [STORAGE.TRIPS, STORAGE.COMPLIANCE, STORAGE.CUSTOM_TRAVELERS, STORAGE.TOASTS, STORAGE.SOUND, STORAGE.COMPACT, STORAGE.ACCENT]
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
                  {user?.name ?? ""}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#888888] truncate">
                  {user?.email || "No email"}
                </p>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand mt-1">
                  {user?.role ?? ""}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 rounded-full px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {user?.status ?? "Active"}
              </div>
            </div>
          </Section>

          {/* ── Security (only for real Firebase auth users) ── */}
          {realAuth && (
            <Section
              icon={Lock}
              title="Security"
              description="Manage your account security and password."
            >
              <Row
                label="Change Password"
                value="Update your sign-in password"
                action={
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="h-9 w-40 rounded-xl bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] px-3 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    />
                    <Button
                      onClick={handleChangePassword}
                      disabled={changingPassword || newPassword.length < 6}
                      className="h-9 rounded-xl bg-brand hover:opacity-90 text-black font-black uppercase tracking-wider text-[10px] px-3 disabled:opacity-40"
                    >
                      {changingPassword ? "..." : "Update"}
                    </Button>
                  </div>
                }
              />
            </Section>
          )}

          {/* ── Set up Agency (real auth, no org yet) ── */}
          {canSetupOrg && (
            <Section
              icon={Building2}
              title="Agency Setup"
              description="Create your agency to unlock white-label branding on shared trips and PDFs."
            >
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Sunset Travel Co."
                  className="h-9 flex-1 rounded-xl bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] px-3 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
                <Button
                  onClick={handleCreateOrg}
                  disabled={creatingOrg || !newOrgName.trim()}
                  className="h-9 rounded-xl bg-brand hover:opacity-90 text-black font-black uppercase tracking-wider text-[10px] px-4 disabled:opacity-40"
                >
                  {creatingOrg ? "Creating..." : "Create Agency"}
                </Button>
              </div>
            </Section>
          )}

          {/* ── Organization Branding (owner/admin only) ── */}
          {showBrandingSection && (
            <Section
              icon={Building2}
              title="White-Label"
              description="How clients see your agency on shared trips and PDFs."
            >
              {orgLoading && !currentOrg ? (
                <Row label="Loading" value="Fetching your organization branding..." />
              ) : !currentOrg ? (
                <Row label="No Organization" value="Create an agency above to configure white-label branding" />
              ) : <>
              {/* Logo */}
              <Row
                label="Logo"
                value={brandLogo ? "Uploaded" : "No logo — first letter will be used"}
                action={
                  <div className="flex items-center gap-3">
                    {brandLogo ? (
                      <img src={brandLogo} alt="" className="h-9 w-9 rounded-lg object-contain border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] p-0.5" />
                    ) : (
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-black text-white" style={{ background: brandColor }}>
                        {(brandName || BRAND.name).charAt(0)}
                      </div>
                    )}
                    <label className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-brand hover:opacity-80 transition-opacity">
                      {uploadingLogo ? "Uploading..." : "Upload"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    {brandLogo && (
                      <button
                        onClick={() => setBrandLogo("")}
                        className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#555] hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                }
              />
              {/* Agency Code */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-[#141414]">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white mb-0.5">
                      Agency Code
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-[#666]">
                      Share this code with your travelers. They enter it when they first open the mobile app to connect to your agency.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={agencyCodeEdit}
                        onChange={e => setAgencyCodeEdit(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder={brandName ? brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) : "your-agency-code"}
                        maxLength={40}
                        className="h-10 w-52 rounded-xl bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] px-3 text-sm text-slate-900 dark:text-white font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      />
                      {agencyCodeEdit && agencyCodeEdit === currentOrg?.agencyCode ? (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(agencyCodeEdit);
                            toast.success("Copied! Share this with your travelers.");
                          }}
                          className="h-10 px-4 rounded-xl bg-brand/10 text-[10px] font-black uppercase tracking-wider text-brand hover:bg-brand/20 transition-colors"
                        >
                          Copy
                        </button>
                      ) : (
                        <button
                          disabled={savingAgencyCode || !agencyCodeEdit.trim()}
                          onClick={async () => {
                            if (!currentOrg || !agencyCodeEdit.trim()) return;
                            setSavingAgencyCode(true);
                            try {
                              const db = firebaseDb();
                              const existing = await getDocs(
                                query(collection(db, "org_branding"), where("agency_code", "==", agencyCodeEdit.trim())),
                              );
                              if (!existing.empty && existing.docs[0].id !== currentOrg.id) {
                                toast.error("That code is already taken");
                                setSavingAgencyCode(false);
                                return;
                              }
                              // Save to org_branding (org doc has stricter rules)
                              const { setDoc } = await import("firebase/firestore");
                              await setDoc(doc(db, "org_branding", currentOrg.id), {
                                agency_code: agencyCodeEdit.trim(),
                              }, { merge: true });
                              toast.success("Agency code saved! Share it with your travelers.");
                            } catch (err) {
                              console.error("Agency code save error:", err);
                              toast.error("Failed to save agency code");
                            } finally {
                              setSavingAgencyCode(false);
                            }
                          }}
                          className="h-10 px-4 rounded-xl bg-brand text-[10px] font-black uppercase tracking-wider text-black hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingAgencyCode ? "Saving..." : "Save"}
                        </button>
                      )}
                    </div>
                    {!currentOrg?.agencyCode && (
                      <p className="text-[10px] text-amber-500 dark:text-amber-400 font-semibold">
                        Set a code so travelers can connect to your agency
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Company Name */}
              <Row
                label="Company Name"
                value="Replaces platform name on shared pages"
                action={
                  <input
                    type="text"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                    placeholder={BRAND.name}
                    className="h-9 w-48 rounded-xl bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] px-3 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  />
                }
              />
              {/* Preview + Save */}
              <div className="pt-3 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-[#555]">Preview</p>
                <div className="flex items-center gap-2.5">
                  {brandLogo ? (
                    <img src={brandLogo} alt="" className="h-6 w-6 rounded object-contain" />
                  ) : (
                    <div className="h-6 w-6 rounded flex items-center justify-center text-[9px] font-black text-white" style={{ background: accentColor }}>
                      {(brandName || BRAND.name).charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white">{brandName || BRAND.name}</span>
                  <span className="text-[9px] text-slate-300 dark:text-[#333]">·</span>
                  <span className="text-[9px] font-bold text-slate-300 dark:text-[#444]">Powered by {BRAND.name}</span>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveBranding}
                    disabled={savingBrand}
                    className="h-8 rounded-lg bg-brand hover:opacity-90 text-black font-black uppercase tracking-wider text-[10px] px-5 disabled:opacity-40"
                  >
                    {savingBrand ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
              </>}
            </Section>
          )}

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
              label="Accent Color"
              value="Applied to active states, CTAs, and branding"
              action={
                <ColorPicker value={accentColor} onChange={setAccentColor} presets={[...ACCENT_PRESETS]} />
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
              value={`${trips.length} trip${trips.length === 1 ? "" : "s"} — download as CSV`}
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
            <span>{brand.name}</span>
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
