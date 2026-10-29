import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  User as UserIcon, Palette, Bell, Database, Keyboard,
  Sun, Moon, Download, Trash, Lock, Buildings, Users, SpinnerGap,
  DeviceMobile, EnvelopeSimple, Globe, SignOut, Copy, ArrowSquareOut, Camera,
} from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { isFirebaseConfigured, firebaseDb, firebaseStorage } from "@/services/firebase";
import { doc, collection, query, where, getDocs, getDoc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { CURRENCIES } from "@/config/currencies";
import { changePassword } from "@/services/firebaseAuth";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";
import { updateBranding, uploadLogo } from "@/services/firebaseBranding";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useDemo } from "@/hooks/useDemo";
import { DemoUpgradeDialog } from "@/components/shared/DemoUpgradeDialog";
import { TeamManagement } from "@/components/shared/TeamManagement";
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { playChime } from "@/lib/sound";

interface SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  id?: string;
  /** Span both columns; for sections with long content like Team or White-Label. */
  wide?: boolean;
}

function Section({ icon: Icon, title, description, children, id }: SectionProps) {
  return (
    <section
      id={id}
      className="scroll-mt-6 mb-5 bg-card border border-border rounded-xl shadow-sm overflow-hidden"
    >
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground leading-none">
            {title}
          </h2>
          <p className="text-[13px] text-muted-foreground leading-snug mt-1.5">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border border-t border-border">
        {children}
      </div>
    </section>
  );
}

function Row({
  label, value, action,
}: { label: string; value?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">
          {label}
        </p>
        {value && (
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
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
        checked ? "bg-brand" : "bg-slate-300 dark:bg-secondary"
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

/** Where travellers get the app. Unlisted, so this link is the only way in; it opens once Apple releases the app. */
const APP_STORE_URL = "https://apps.apple.com/app/id6765462755";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["⌘", "/"], label: "Open command palette (alt)" },
  { keys: ["G", "D"], label: "Go to dashboard" },
  { keys: ["G", "T"], label: "Go to travellers" },
  { keys: ["G", "M"], label: "Go to destinations" },
  { keys: ["G", "R"], label: "Go to reports" },
  { keys: ["G", "S"], label: "Go to settings" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
];

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { user, updateProfile, logout } = useAuth();
  const { trips } = useTrips();
  const {
    compactMode, setCompactMode,
    toastsEnabled, setToastsEnabled,
    soundEnabled, setSoundEnabled,
    accentColor, setAccentColor, resolvedAccent,
  } = usePreferences();
  const { currentOrg, orgRole, tablesReady, isLoading: orgLoading, createOrg } = useOrg();
  const { brand, orgBranding, refreshBranding } = useBrand();
  const { demoGate, upgradeOpen, setUpgradeOpen } = useDemo();
  const [resetOpen, setResetOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useLocalStorage<string>(STORAGE.CURRENCY, "USD");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Emails sent to you, kept on your profile so the server can check them; on unless switched off
  const [photoReportEmails, setPhotoReportEmails] = useState(true);
  useEffect(() => {
    if (!realAuth || !user) return;
    getDoc(doc(firebaseDb(), "profiles", user.id))
      .then(snap => { if (snap.data()?.email_prefs?.photo_reports === false) setPhotoReportEmails(false); })
      .catch(() => {});
  }, [realAuth, user]);

  const handlePhotoReportEmails = async (on: boolean) => {
    if (!user) return;
    setPhotoReportEmails(on);
    try {
      await updateDoc(doc(firebaseDb(), "profiles", user.id), { "email_prefs.photo_reports": on });
    } catch {
      setPhotoReportEmails(!on);
      toast.error("Couldn't save that. Try again.");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error("Use a JPG, PNG or WebP photo"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Photo must be under 2MB"); return; }
    setUploadingAvatar(true);
    try {
      const fileRef = storageRef(firebaseStorage(), `avatars/${user.id}/profile-${Date.now()}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      updateProfile({ avatar: await getDownloadURL(fileRef) });
      toast.success("Photo updated");
    } catch (err) {
      logger.error("SettingsPage", "avatar upload error:", err);
      toast.error("Couldn't upload that photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const copyAppLink = async () => {
    try { await navigator.clipboard.writeText(APP_STORE_URL); toast.success("App link copied"); }
    catch { toast.error("Couldn't copy the link"); }
  };

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
    if (demoGate()) return;
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
        toast.success("Logo uploaded - hit Save to apply");
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
    if (demoGate()) return;
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
    if (demoGate()) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setChangingPassword(true);
    const { error, emailed } = await changePassword(newPassword);
    setChangingPassword(false);
    if (error) {
      toast.error(error);
    } else if (emailed) {
      toast.success(`For security we've emailed ${user?.email ?? "you"} a link to set your password`);
      setNewPassword("");
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
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
              Settings
            </h1>
            <span className="text-xs font-medium text-muted-foreground hidden md:inline">
              Preferences & Data
            </span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 lg:px-8 py-6 pb-12">
          <div className="min-w-0">
          {/* ── Profile ── */}
          <Section
            id="profile"
            icon={UserIcon}
            title="Profile"
            description="Your account details. Shown on the sidebar and in shared trip links."
          >
            <div className="px-5 py-4 flex items-center gap-4">
              <label className={cn("group relative h-16 w-16 rounded-full shrink-0 overflow-hidden border border-border bg-secondary flex items-center justify-center text-lg font-semibold text-foreground", realAuth && "cursor-pointer")}>
                {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials}
                {realAuth && (
                  <>
                    <span className="absolute inset-0 bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingAvatar ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleAvatarUpload} disabled={uploadingAvatar} aria-label="Change your profile photo" />
                  </>
                )}
              </label>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold tracking-tight text-foreground truncate">
                  {user?.name ?? ""}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email || "No email"}
                </p>
                {realAuth && <p className="text-[11px] text-muted-foreground mt-1">Click your photo to change it</p>}
              </div>
            </div>
          </Section>

          {/* ── Security (only for real Firebase auth users) ── */}
          {realAuth && (
            <Section
            id="security"
              icon={Lock}
              title="Security"
              description="Manage your account security and password."
            >
              <Row
                label="Password"
                value={newPassword.length > 0 && newPassword.length < 8 ? "At least 8 characters" : "Set or update your sign-in password"}
                action={
                  <div className="flex items-center gap-2">
                    <Input
                      id="settings-new-password"
                      type="password"
                      aria-label="New password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password"
                      title="At least 8 characters"
                      className="w-40"
                    />
                    <Button
                      onClick={handleChangePassword}
                      disabled={changingPassword || newPassword.length < 8}
                      className="h-9 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-semibold text-[13px] px-3 disabled:opacity-40"
                    >
                      {changingPassword ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : "Update"}
                    </Button>
                  </div>
                }
              />
            </Section>
          )}

          {/* ── Set up Agency (real auth, no org yet) ── */}
          {canSetupOrg && (
            <Section
            id="agency"
              icon={Buildings}
              title="Agency Setup"
              description="Create your agency to unlock white-label branding on shared trips and PDFs."
            >
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  aria-label="Agency name"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="Agency name"
                  className="flex-1"
                />
                <Button
                  onClick={handleCreateOrg}
                  disabled={creatingOrg || !newOrgName.trim()}
                  className="h-9 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-semibold text-[13px] px-4 disabled:opacity-40"
                >
                  {creatingOrg ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : "Create Agency"}
                </Button>
              </div>
            </Section>
          )}

          {/* ── Organization Branding (owner/admin only) ── */}
          {showBrandingSection && (
            <Section
            id="branding"
              icon={Buildings}
              wide
              title="Branding"
              description="How clients see your agency on shared trips, PDFs and in the app."
            >
              {orgLoading && !currentOrg ? (
                <Row label="Loading" value="Fetching your organization branding..." />
              ) : !currentOrg ? (
                <Row label="No organisation" value="Create an agency above to set up your branding" />
              ) : <>
              {/* Logo */}
              <Row
                label="Logo"
                value={brandLogo ? "Shown on shared trips, PDFs and in the app" : "No logo yet. The first letter of your company name is used"}
                action={
                  <div className="flex items-center gap-2">
                    {brandLogo ? (
                      <img src={brandLogo} alt="" className="h-12 w-12 rounded-lg object-contain border border-border bg-card p-1" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ background: brandColor }}>
                        {(brandName || BRAND.name).charAt(0)}
                      </div>
                    )}
                    <label className="ml-1 cursor-pointer h-8 px-3 inline-flex items-center rounded-lg border border-border bg-card text-[13px] font-medium text-foreground hover:bg-secondary transition-colors">
                      {uploadingLogo ? "Uploading…" : brandLogo ? "Replace" : "Upload"}
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
                        className="h-8 px-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 text-[13px] font-medium text-muted-foreground hover:text-red-500 hover:bg-secondary transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                }
              />
              {/* Agency Code */}
              <div className="px-5 py-3.5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
                  <div className="min-w-0">
                    <label htmlFor="settings-agency-code" className="block text-[13px] font-medium text-foreground mb-0.5">
                      Agency code
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Share this code with your travellers. They enter it when they first open the mobile app to connect to your agency.
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Input
                        id="settings-agency-code"
                        type="text"
                        value={agencyCodeEdit}
                        onChange={e => setAgencyCodeEdit(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder={brandName ? brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) : "your-agency-code"}
                        maxLength={40}
                        className="w-full sm:w-52"
                      />
                      {agencyCodeEdit && agencyCodeEdit === currentOrg?.agencyCode ? (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(agencyCodeEdit);
                            toast.success("Copied! Share this with your travellers.");
                          }}
                          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1 h-10 px-4 rounded-xl bg-brand/10 text-[13px] font-medium text-brand hover:bg-brand/20 transition-colors"
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
                                query(collection(db, "org_branding"), where("agency_code", "==", agencyCodeEdit.trim().toLowerCase())),
                              );
                              if (!existing.empty && existing.docs[0].id !== currentOrg.id) {
                                toast.error("That code is already taken");
                                setSavingAgencyCode(false);
                                return;
                              }
                              // Save to org_branding (org doc has stricter rules)
                              const { setDoc } = await import("firebase/firestore");
                              await setDoc(doc(db, "org_branding", currentOrg.id), {
                                agency_code: agencyCodeEdit.trim().toLowerCase(),
                              }, { merge: true });
                              toast.success("Agency code saved! Share it with your travellers.");
                            } catch (err) {
                              console.error("Agency code save error:", err);
                              toast.error("Failed to save agency code");
                            } finally {
                              setSavingAgencyCode(false);
                            }
                          }}
                          className="h-10 px-4 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingAgencyCode ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                        </button>
                      )}
                    </div>
                    {!currentOrg?.agencyCode && (
                      <p className="text-[12px] text-amber-500 dark:text-amber-400 font-medium">
                        Set a code so travellers can connect to your agency
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Company Name */}
              <Row
                label="Company name"
                value="Shown instead of Dalefy on shared trips and in the app"
                action={
                  <Input
                    type="text"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                    placeholder={BRAND.name}
                    className="w-48"
                  />
                }
              />
              {/* Preview + Save */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-[13px] font-medium text-muted-foreground">Preview</p>
                {/* What clients see: a trip's photo header with the agency's logo and name on it */}
                {(() => {
                  // The next trip coming up with a photo; otherwise one of the app's own holiday photos
                  const today = new Date().toISOString().slice(0, 10);
                  const sample = [...trips].filter(t => t.image && t.end >= today).sort((x, y) => x.start.localeCompare(y.start))[0]
                    ?? { name: "Your next trip", image: "/pages/changelog.jpg" };
                  return (
                    <div className="relative h-40 overflow-hidden rounded-xl border border-border bg-secondary">
                      <img src={sample.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-black/10" />
                      <div className="absolute left-4 top-4 flex items-center gap-2.5">
                        {brandLogo ? (
                          <img src={brandLogo} alt="" className="h-9 w-9 rounded-lg object-contain bg-white/90 p-1" />
                        ) : (
                          <div className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: resolvedAccent }}>
                            {(brandName || BRAND.name).charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-white leading-tight">{brandName || BRAND.name}</p>
                          <p className="text-[11px] text-white/75">Powered by {BRAND.name}</p>
                        </div>
                      </div>
                      <div className="absolute left-4 bottom-4 right-4">
                        <p className="text-lg font-semibold text-white truncate">{sample.name}</p>
                        <p className="text-xs text-white/80">Hosted by {brandName || BRAND.name}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveBranding}
                    disabled={savingBrand}
                    className="h-9 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-semibold text-[13px] px-5 disabled:opacity-40"
                  >
                    {savingBrand ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : "Save changes"}
                  </Button>
                </div>
              </div>
              </>}
            </Section>
          )}

          {/* ── Team ── */}
          {realAuth && currentOrg && (
            <Section
            id="team"
              icon={Users}
              wide
              title="Team"
              description={canManageOrg
                ? "Manage members, roles, and access to your organization."
                : `Who's on ${currentOrg.name}. Ask an admin to change roles or invite people.`}
            >
              <TeamManagement onInvite={() => setInviteOpen(true)} />
            </Section>
          )}

          {/* ── Traveller app ── */}
          <Section
            id="traveller-app"
            icon={DeviceMobile}
            title="Traveller app"
            description="Send travellers this link with their invite. They join with the trip PIN from the email."
          >
            <div className="px-5 py-4 flex flex-col sm:flex-row gap-5">
              <div className="rounded-xl border border-border bg-white p-3 self-start shrink-0">
                <QRCodeSVG value={APP_STORE_URL} size={112} level="M" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Dalefy for iPhone</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 break-all">{APP_STORE_URL}</p>
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1.5">Waiting for Apple's approval. The link opens once the app is released.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={copyAppLink} className="h-9 rounded-xl text-[13px] gap-1.5"><Copy className="h-3.5 w-3.5" /> Copy link</Button>
                  <Button variant="outline" onClick={() => window.open(APP_STORE_URL, "_blank", "noopener")} className="h-9 rounded-xl text-[13px] gap-1.5"><ArrowSquareOut className="h-3.5 w-3.5" /> Open</Button>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-foreground">What travellers do</p>
              <ol className="mt-2 space-y-1.5 text-[12px] text-muted-foreground list-decimal pl-4">
                <li>Install Dalefy from the link or the QR code.</li>
                <li>Type the 6-character PIN from their invite email on the Home screen.</li>
                <li>See the published itinerary, live flights and trip info. Changes reach them when you publish.</li>
              </ol>
            </div>
          </Section>

          {/* ── Email notifications ── */}
          {realAuth && (
            <Section
            id="email"
              icon={EnvelopeSimple}
              title="Email notifications"
              description={`Emails Dalefy sends you at ${user?.email || "your address"}.`}
            >
              <Row
                label="Photo reports"
                value="When a traveller reports a photo in a trip gallery, so you can review it"
                action={<ToggleSwitch checked={photoReportEmails} onChange={handlePhotoReportEmails} />}
              />
            </Section>
          )}

          {/* ── Appearance ── */}
          <Section
            id="appearance"
            icon={Palette}
            title="Appearance"
            description="Tune how the workspace looks. Changes apply instantly across every page."
          >
            <Row
              label="Theme"
              value={theme === "dark" ? "Dark - default operator view" : "Light - high-contrast daytime"}
              action={
                <button
                  onClick={toggleTheme}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1 h-9 w-9 rounded-xl bg-secondary hover:bg-slate-200 dark:hover:bg-secondary border border-border text-muted-foreground hover:text-brand flex items-center justify-center transition-colors"
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
            id="notifications"
            icon={Bell}
            title="Notifications"
            description="Control how the app interrupts you. Notifications appear as toasts and in the bell panel."
          >
            <Row
              label="Pop-up messages"
              value="Show toast messages for actions like trip created, imported, or deleted"
              action={<ToggleSwitch checked={toastsEnabled} onChange={setToastsEnabled} />}
            />
            <Row
              label="Sounds"
              value="Play a subtle chime on successful actions"
              action={<ToggleSwitch checked={soundEnabled} onChange={handleSoundToggle} />}
            />
          </Section>

          {/* ── Regional ── */}
          <Section
            id="regional"
            icon={Globe}
            title="Regional"
            description="Defaults for new trips, and how times are written."
          >
            <Row
              label="Default currency"
              value="Starts the budget on every new trip"
              action={
                <Select value={defaultCurrency} onValueChange={v => v && setDefaultCurrency(v)}>
                  <SelectTrigger className="w-24 h-9" aria-label="Default currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              }
            />
            <Row
              label="Times"
              value="24-hour everywhere, like 14:30, matching the traveller app. Imported itineraries are converted too."
            />
          </Section>

          {/* ── Data ── */}
          <Section
            id="data"
            icon={Database}
            title="Data"
            description="Export your work or reset local data. Cloud-synced trips are not affected by reset."
          >
            <Row
              label="Export trips"
              value={`Download ${trips.length} trip${trips.length === 1 ? "" : "s"} as a spreadsheet`}
              action={
                <Button
                  onClick={exportTrips}
                  variant="outline"
                  className="h-9 rounded-xl text-[13px] gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              }
            />
            {/* Storage and reset are rarely needed, so they stay folded away */}
            <Row
              label="Advanced"
              value="Storage on this device and resetting local data"
              action={
                <Button variant="outline" onClick={() => setAdvancedOpen(o => !o)} aria-expanded={advancedOpen} className="h-9 rounded-xl text-[13px]">
                  {advancedOpen ? "Hide" : "Show"}
                </Button>
              }
            />
            {advancedOpen && <Row
              label="Local storage"
              value={`${storageSizeKb} KB used across preferences, trips, and compliance overrides`}
            />}
            {advancedOpen && <Row
              label="Reset trip data"
              value="Clears trips, compliance overrides, and custom travellers. Keeps your account."
              action={
                <Button
                  onClick={() => { if (!demoGate()) setResetOpen(true); }}
                  variant="outline"
                  className="h-9 rounded-xl text-[13px] gap-1.5 text-red-600 dark:text-red-400 hover:text-red-600 hover:bg-red-500/10"
                >
                  <Trash className="h-3.5 w-3.5" />
                  Reset
                </Button>
              }
            />}
          </Section>

          {/* ── Shortcuts ── */}
          <Section
            id="keyboard-shortcuts"
            icon={Keyboard}
            title="Shortcuts"
            description="Keyboard shortcuts work anywhere in the app. Press ⌘K to open the command palette."
          >
            <div className="px-5 py-3 grid sm:grid-cols-2 gap-x-6">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-[13px] font-medium text-foreground/80">
                    {s.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="min-w-[24px] h-6 px-1.5 rounded-md bg-secondary border border-border text-[10px] font-bold text-muted-foreground flex items-center justify-center"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Account ── */}
          <Section
            id="account"
            icon={UserIcon}
            title="Account"
            description="Help, the legal pages, and signing out."
          >
            <Row
              label="Help and support"
              value="Guides and how to reach us"
              action={<Button variant="outline" onClick={() => window.open("/support.html", "_blank", "noopener")} className="h-9 rounded-xl text-[13px] gap-1.5"><ArrowSquareOut className="h-3.5 w-3.5" /> Open</Button>}
            />
            <Row
              label="Privacy and terms"
              value={<><a href="/privacy.html" target="_blank" rel="noopener" className="text-link hover:underline">Privacy policy</a>{", "}<a href="/terms.html" target="_blank" rel="noopener" className="text-link hover:underline">Terms of use</a></>}
            />
            {realAuth && (
              <Row
                label="Delete your account"
                value="How to remove your account and what happens to your trips"
                action={<Button variant="outline" onClick={() => window.open("/delete-account.html", "_blank", "noopener")} className="h-9 rounded-xl text-[13px] gap-1.5 text-red-600 dark:text-red-400 hover:text-red-600 hover:bg-red-500/10"><ArrowSquareOut className="h-3.5 w-3.5" /> Learn how</Button>}
              />
            )}
            <Row
              label="Sign out"
              value={user?.email || undefined}
              action={<Button variant="outline" onClick={() => { logout(); }} className="h-9 rounded-xl text-[13px] gap-1.5"><SignOut className="h-3.5 w-3.5" /> Sign out</Button>}
            />
          </Section>

          {/* ── Footer ── */}
          <div className="border-t border-border pt-6 mt-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{brand.name}</span>
          </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset Trip Data"
        description="This will permanently clear all trips, compliance overrides, and custom travellers from this device. Your account and theme preference will be kept. This cannot be undone."
        confirmLabel="Reset"
        onConfirm={resetData}
        destructive
      />
      <DemoUpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      <InviteTeamDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
