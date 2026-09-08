import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { SpinnerGap, Upload, X, Palette } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { ColorPicker } from "@/components/ui/color-picker";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { canCreateOrganization } from "@/services/orgAccess";
import { useBrand } from "@/context/BrandContext";
import { BRAND } from "@/config/brand";
import { uploadLogo, updateBranding } from "@/services/firebaseBranding";

type Step = 1 | 2;

const inputClass =
  "h-11 rounded-xl bg-card border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand transition-colors";

const primaryBtn =
  "h-11 rounded-xl bg-brand hover:opacity-90 text-black text-sm font-medium gap-2 disabled:opacity-40";

const labelClass = "text-xs font-medium text-muted-foreground";

// ── Main ─────────────────────────────────────────────────────────────────

export function CreateOrgPage() {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [agencyCode, setAgencyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [brandLogo, setBrandLogo] = useState("");
  const [brandColor, setBrandColor] = useState<string>(BRAND.accentColor);
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);

  const { createOrg, tablesReady, refreshOrg } = useOrg();
  const { refreshBranding } = useBrand();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [canCreate, setCanCreate] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    canCreateOrganization(user.id).then(ok => { if (!cancelled) setCanCreate(ok); });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!tablesReady) return <Navigate to="/dashboard" replace />;

  if (canCreate === false) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <Logo className="h-7 w-7 mx-auto text-foreground" />
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">You're not on a team yet</h1>
            <p className="text-sm text-muted-foreground">
              {BRAND.name} is invitation only. Ask your agency admin to invite
              {user?.email ? <> <strong className="text-foreground">{user.email}</strong></> : " you"}, then open the link in that email.
            </p>
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => { refreshOrg(); navigate("/dashboard"); }}
              className={`w-full ${primaryBtn}`}
            >
              I've been invited, check again
            </Button>
            <Button
              variant="ghost"
              onClick={() => { logout(); navigate("/login"); }}
              className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground"
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = name.trim().length >= 2;

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const { org, error: err } = await createOrg(name.trim(), agencyCode.trim() || undefined);
      if (err || !org) {
        setError(err || "Failed to create organization");
      } else {
        setCreatedOrgId(org.id);
        setBrandCompanyName(name.trim());
        setStep(2);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleFinishBranding = async () => {
    if (!createdOrgId) { navigate("/dashboard"); return; }
    setSavingBrand(true);
    try {
      const { error: err } = await updateBranding(createdOrgId, {
        companyName: brandCompanyName || null,
        logoUrl: brandLogo || null,
        accentColor: brandColor !== BRAND.accentColor ? brandColor : null,
      });
      if (err) { toast.error(err); return; }
      refreshBranding();
      navigate("/dashboard");
    } catch {
      toast.error("Failed to save branding");
    } finally {
      setSavingBrand(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="px-6 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo className="h-5 w-5 text-foreground" />
          <span className="text-sm font-semibold tracking-tight text-foreground">{BRAND.name}</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[400px]">
          <p className="text-xs font-medium text-muted-foreground mb-3">Step {step} of 2</p>

          {/* ── STEP 1: Agency Name ────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">
                  Create your agency
                </h1>
                <p className="text-sm text-muted-foreground">
                  Give your workspace a name. Your trips and travellers will belong to it.
                </p>
              </div>

              {error && (
                <p role="alert" className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <form onSubmit={handleCreateOrg} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="org-name" className={labelClass}>
                    Agency name
                  </Label>
                  <Input
                    id="org-name"
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Luxury Escapes Travel"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-code" className={labelClass}>
                    Agency code
                  </Label>
                  <Input
                    id="org-code"
                    type="text"
                    value={agencyCode}
                    onChange={e => setAgencyCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder={name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "your-code" : "e.g. luxuryescapes"}
                    maxLength={40}
                    className={inputClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    Travellers enter this code in the app to connect to your agency.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={!canSubmit || loading}
                  className={`w-full mt-1 ${primaryBtn}`}
                >
                  {loading ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Continue"}
                </Button>
              </form>
            </>
          )}

          {/* ── STEP 2: Branding ───────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">
                  Brand your agency
                </h1>
                <p className="text-sm text-muted-foreground">
                  This is what travellers see on shared trips. You can change it later in Settings.
                </p>
              </div>

              <div className="space-y-5">
                {/* Logo upload */}
                <div className="space-y-2">
                  <Label className={labelClass}>Agency logo</Label>
                  <div className="flex items-center gap-5">
                    <div className="relative group">
                      {brandLogo ? (
                        <img src={brandLogo} alt="" className="h-20 w-20 rounded-xl object-contain border border-border bg-card p-2" />
                      ) : (
                        <div
                          className="h-20 w-20 rounded-xl flex items-center justify-center text-2xl font-semibold text-white/90"
                          style={{ backgroundColor: brandColor }}
                        >
                          {(brandCompanyName || "A").charAt(0)}
                        </div>
                      )}
                      {brandLogo && (
                        <button
                          type="button"
                          onClick={() => setBrandLogo("")}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-slate-800 dark:bg-[#333] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" weight="bold" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className={`flex items-center justify-center gap-2.5 h-11 rounded-xl bg-card border border-dashed border-border hover:border-foreground/30 transition-colors ${uploadingLogo ? "opacity-60 cursor-wait" : "cursor-pointer"}`}>
                        <Upload className="h-4 w-4 text-muted-foreground" weight="regular" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {uploadingLogo ? "Processing..." : brandLogo ? "Change" : "Upload logo"}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          disabled={uploadingLogo}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !createdOrgId) {
                              if (!createdOrgId) toast.error("Organization not ready - try again");
                              return;
                            }
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error("Logo must be under 2 MB");
                              return;
                            }
                            setUploadingLogo(true);
                            const { url, error: err } = await uploadLogo(createdOrgId, file);
                            setUploadingLogo(false);
                            e.target.value = "";
                            if (err) { toast.error(err); return; }
                            if (url) setBrandLogo(url);
                          }}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-muted-foreground text-center">PNG, JPG or SVG, up to 2 MB</p>
                    </div>
                  </div>
                </div>

                {/* Display name */}
                <div className="space-y-2">
                  <Label htmlFor="org-display" className={labelClass}>Display name</Label>
                  <Input
                    id="org-display"
                    type="text"
                    value={brandCompanyName}
                    onChange={e => setBrandCompanyName(e.target.value)}
                    placeholder={BRAND.name}
                    className={inputClass}
                  />
                </div>

                {/* Brand color */}
                <div className="space-y-2">
                  <Label className={labelClass}>Brand colour</Label>
                  <div className="flex items-center gap-3">
                    <ColorPicker value={brandColor} onChange={setBrandColor} className="flex-1" />
                    {brandColor !== BRAND.accentColor && (
                      <button
                        type="button"
                        onClick={() => setBrandColor(BRAND.accentColor)}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Live preview */}
                <div className="relative bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 pt-3 pb-2.5 flex items-center gap-2 border-b border-border">
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Traveller preview
                    </span>
                  </div>
                  <div className="px-5 py-5 flex items-center gap-4">
                    {brandLogo ? (
                      <img src={brandLogo} alt="" className="h-11 w-11 rounded-xl object-contain" />
                    ) : (
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center text-sm font-semibold text-white/90"
                        style={{ backgroundColor: brandColor }}
                      >
                        {(brandCompanyName || BRAND.name).charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold tracking-tight text-foreground truncate">
                        {brandCompanyName || BRAND.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Powered by {BRAND.name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => navigate("/dashboard")}
                    variant="outline"
                    className="h-11 rounded-xl border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground text-sm font-medium px-5"
                  >
                    Skip
                  </Button>
                  <Button
                    type="button"
                    disabled={savingBrand}
                    onClick={handleFinishBranding}
                    className={`flex-1 ${primaryBtn}`}
                  >
                    {savingBrand ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Finish setup"}
                  </Button>
                </div>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
