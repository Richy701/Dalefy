import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Loader2, ArrowRight, Building2, Upload, X, Palette, Paintbrush, Check,
  Globe, MapPin, Calendar, Plane,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { ColorPicker } from "@/components/ui/color-picker";
import { useOrg } from "@/context/OrgContext";
import { useBrand } from "@/context/BrandContext";
import { BRAND } from "@/config/brand";
import { uploadLogo, updateBranding } from "@/services/firebaseBranding";

type Step = 1 | 2;

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1 as const, label: "Agency" },
    { n: 2 as const, label: "Brand" },
  ];
  return (
    <div className="flex items-center gap-2 mb-10">
      {steps.map(({ n, label }, i) => {
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2.5 flex-1">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all duration-300 ${
                  done
                    ? "bg-brand text-black"
                    : active
                      ? "bg-brand/15 text-brand ring-2 ring-brand/30"
                      : "bg-slate-100 dark:bg-[#1a1a1a] text-slate-400 dark:text-[#555]"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
              </div>
              <span className={`text-[11px] font-bold uppercase tracking-[0.12em] hidden sm:inline transition-colors ${
                active ? "text-brand" : done ? "text-slate-500 dark:text-[#888]" : "text-slate-300 dark:text-[#444]"
              }`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 min-w-4 transition-colors duration-300 ${done ? "bg-brand/40" : "bg-slate-200 dark:bg-[#1f1f1f]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const inputClass =
  "h-14 bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] rounded-xl text-base text-slate-900 dark:text-white font-medium placeholder:text-slate-300 dark:placeholder:text-[#444] focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand transition-colors";

// ── Brand Panel ─────────────────────────────────────────────────────────

function BrandPanel() {
  const features = [
    { icon: Globe, label: "Multi-tenant workspaces" },
    { icon: MapPin, label: "Interactive trip mapping" },
    { icon: Calendar, label: "Smart itinerary builder" },
    { icon: Plane, label: "Traveler sync & sharing" },
  ];

  return (
    <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-col justify-between bg-gradient-to-br from-brand/[0.08] via-brand/[0.03] to-transparent dark:from-brand/[0.06] dark:via-brand/[0.02] dark:to-transparent border-r border-slate-200/60 dark:border-[#1a1a1a] p-12 xl:p-16 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-[400px] h-[400px] bg-brand/[0.08] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] bg-purple-500/[0.04] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-3.5 mb-16">
          <div className="h-11 w-11 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20">
            <Logo className="text-black h-6 w-6" />
          </div>
          <span className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
            {BRAND.nameUpper}
          </span>
        </div>

        <h2 className="text-3xl xl:text-4xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-[1.1] mb-4">
          Almost there.<br />
          <span className="text-brand">Set up your agency.</span>
        </h2>
        <p className="text-base text-slate-500 dark:text-[#999] leading-relaxed max-w-sm">
          Create your workspace and customize how your clients see you.
        </p>
      </div>

      <div className="relative z-10 space-y-4">
        {features.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white/60 dark:bg-white/[0.06] border border-slate-200/50 dark:border-[#1f1f1f] flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-brand" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-slate-600 dark:text-[#bbb]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export function CreateOrgPage() {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [agencyCode, setAgencyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [brandLogo, setBrandLogo] = useState("");
  const [brandColor, setBrandColor] = useState(BRAND.accentColor);
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);

  const { createOrg, tablesReady } = useOrg();
  const { refreshBranding } = useBrand();
  const navigate = useNavigate();

  if (!tablesReady) return <Navigate to="/dashboard" replace />;

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
    <div className="min-h-dvh bg-slate-50 dark:bg-[#050505] flex">
      <BrandPanel />

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none lg:hidden">
          <div className="absolute top-1/4 -left-40 w-[500px] h-[500px] bg-brand/[0.07] rounded-full blur-[100px]" />
          <div className="absolute bottom-1/3 -right-40 w-[400px] h-[400px] bg-brand/[0.05] rounded-full blur-[100px]" />
        </div>

        <div className="w-full max-w-[480px] relative z-10">
          {/* Mobile-only logo */}
          <div className="text-center mb-10 lg:hidden">
            <div className="h-14 w-14 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand/20">
              <Logo className="text-black h-8 w-8" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1.5">
              {BRAND.nameUpper}
            </h1>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">
              {step === 1 ? "One last step" : "Make it yours"}
            </p>
          </div>

          <StepIndicator current={step} />

          {/* ── STEP 1: Agency Name ────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-brand" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                    Create Your Agency
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-[#999]">
                    Set up your travel agency workspace
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-6 flex items-center gap-3 p-4 rounded-2xl bg-red-500/[0.06] dark:bg-red-500/[0.08] border border-red-500/15 dark:border-red-500/10">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex-1">{error}</p>
                </div>
              )}

              <form onSubmit={handleCreateOrg} className="space-y-6">
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">
                    Agency / Company Name
                  </Label>
                  <Input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Luxury Escapes Travel"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">
                    Agency Code
                  </Label>
                  <Input
                    type="text"
                    value={agencyCode}
                    onChange={e => setAgencyCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder={name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "your-code" : "e.g. luxuryescapes"}
                    maxLength={40}
                    className={inputClass}
                  />
                  <p className="text-xs text-slate-400 dark:text-[#666]">
                    Travelers enter this code to connect their app to your agency.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={!canSubmit || loading}
                  className="w-full h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed gap-2.5 transition-all duration-150"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4.5 w-4.5" /></>}
                </Button>
              </form>
            </>
          )}

          {/* ── STEP 2: Branding ───────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                  <Paintbrush className="h-6 w-6 text-brand" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                    Brand Your Agency
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-[#999]">
                    How clients see you on shared trips
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Logo upload */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">Agency Logo</Label>
                  <div className="flex items-center gap-5">
                    <div className="relative group">
                      {brandLogo ? (
                        <img src={brandLogo} alt="" className="h-20 w-20 rounded-2xl object-contain border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] p-2" />
                      ) : (
                        <div
                          className="h-20 w-20 rounded-2xl flex items-center justify-center text-2xl font-black text-white/90"
                          style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}
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
                          <X className="h-3 w-3" strokeWidth={3} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="flex items-center justify-center gap-2.5 cursor-pointer h-12 rounded-xl bg-white dark:bg-[#0a0a0a] border border-dashed border-slate-300 dark:border-[#2a2a2a] hover:border-brand/50 dark:hover:border-brand/30 transition-colors">
                        <Upload className="h-4 w-4 text-slate-400 dark:text-[#666]" strokeWidth={2} />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
                          {uploadingLogo ? "Processing..." : brandLogo ? "Change" : "Upload Logo"}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !createdOrgId) {
                              if (!createdOrgId) toast.error("Organization not ready — try again");
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
                      <p className="text-[11px] text-slate-400 dark:text-[#555] text-center">PNG, JPG, SVG — max 2 MB</p>
                    </div>
                  </div>
                </div>

                {/* Display name */}
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">Display Name</Label>
                  <Input
                    type="text"
                    value={brandCompanyName}
                    onChange={e => setBrandCompanyName(e.target.value)}
                    placeholder={BRAND.name}
                    className={inputClass}
                  />
                </div>

                {/* Brand color */}
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">Brand Color</Label>
                  <div className="flex items-center gap-3">
                    <ColorPicker value={brandColor} onChange={setBrandColor} className="flex-1" />
                    {brandColor !== BRAND.accentColor && (
                      <button
                        type="button"
                        onClick={() => setBrandColor(BRAND.accentColor)}
                        className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-brand transition-colors cursor-pointer shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Live preview */}
                <div className="relative bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden">
                  <div className="px-5 pt-3.5 pb-3 flex items-center gap-2" style={{ backgroundColor: `${brandColor}10`, borderBottom: `1px solid ${brandColor}20` }}>
                    <Palette className="h-3.5 w-3.5" style={{ color: brandColor }} strokeWidth={2.5} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: brandColor }}>
                      Client Preview
                    </span>
                  </div>
                  <div className="px-5 py-5 flex items-center gap-4">
                    {brandLogo ? (
                      <img src={brandLogo} alt="" className="h-11 w-11 rounded-xl object-contain" />
                    ) : (
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center text-sm font-black text-white/90"
                        style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}
                      >
                        {(brandCompanyName || BRAND.name).charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
                        {brandCompanyName || BRAND.name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-[#666]">
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
                    className="h-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] text-slate-500 dark:text-[#888] hover:bg-slate-50 dark:hover:bg-[#111] hover:text-slate-900 dark:hover:text-white font-bold uppercase tracking-wider text-xs px-6 transition-colors"
                  >
                    Skip
                  </Button>
                  <Button
                    type="button"
                    disabled={savingBrand}
                    onClick={handleFinishBranding}
                    className="flex-1 h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2.5 transition-all duration-150"
                  >
                    {savingBrand ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Finish Setup <ArrowRight className="h-4.5 w-4.5" /></>}
                  </Button>
                </div>
              </div>
            </>
          )}

          <p className="text-center text-xs font-medium text-slate-400 dark:text-[#555] mt-8">
            {step === 1
              ? "Your trips and data will belong to this agency"
              : "You can change these anytime in Settings"}
          </p>
        </div>
      </div>
    </div>
  );
}
