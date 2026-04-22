import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Loader2, ArrowRight, ArrowLeft, Eye, EyeOff, Upload, X, Check,
  Briefcase, Users, Compass, Shield, Palette, Paintbrush,
  Globe, MapPin, Calendar, Plane,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { ColorPicker } from "@/components/ui/color-picker";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { useBrand } from "@/context/BrandContext";
import { BRAND } from "@/config/brand";
import { isFirebaseConfigured } from "@/services/firebase";
import { uploadLogo, updateBranding } from "@/services/firebaseBranding";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";

const ROLES = [
  { label: "Trip Manager", icon: Briefcase, desc: "Plan & manage trips" },
  { label: "Agent", icon: Users, desc: "Sell & book travel" },
  { label: "Traveller", icon: Compass, desc: "View my itineraries" },
  { label: "Admin", icon: Shield, desc: "Full organization access" },
] as const;

type Mode = "sign-in" | "sign-up";

// ── Shared sub-components ───────────────────────────────────────────────

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ["Account", "Details", "Brand"];
  return (
    <div className="flex items-center gap-2 mb-10">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
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
                {labels[i]}
              </span>
            </div>
            {n < total && (
              <div className={`h-px flex-1 min-w-4 transition-colors duration-300 ${done ? "bg-brand/40" : "bg-slate-200 dark:bg-[#1f1f1f]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 p-4 rounded-2xl bg-red-500/[0.06] dark:bg-red-500/[0.08] border border-red-500/15 dark:border-red-500/10">
      <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
        <X className="h-4 w-4 text-red-500" strokeWidth={2.5} />
      </div>
      <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex-1">{message}</p>
    </div>
  );
}

function InputField({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">
        {label}
        {optional && <span className="ml-1.5 text-slate-300 dark:text-[#555] font-medium normal-case tracking-normal">(optional)</span>}
      </Label>
      {children}
    </div>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-4 my-7">
      <div className="flex-1 h-px bg-slate-200 dark:bg-[#1f1f1f]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300 dark:text-[#444]">or</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-[#1f1f1f]" />
    </div>
  );
}

const inputClass =
  "h-14 bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] rounded-xl text-base text-slate-900 dark:text-white font-medium placeholder:text-slate-300 dark:placeholder:text-[#444] focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand transition-colors";

// ── Animated hero background ────────────────────────────────────────────

function HeroBackground() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["sorted", "covered", "handled", "done"],
    []
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber(titleNumber === titles.length - 1 ? 0 : titleNumber + 1);
    }, 2500);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  const features = [
    { icon: Globe, label: "Team workspaces" },
    { icon: MapPin, label: "Route maps" },
    { icon: Calendar, label: "Day-by-day builder" },
    { icon: Plane, label: "Share via PIN" },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none select-none">

      {/* Hero content — pinned left, stops before form card */}
      <div className="absolute inset-y-0 left-0 right-[520px] xl:right-[580px] flex flex-col justify-center px-12 xl:px-20">
        {/* Logo */}
        <motion.div
          className="flex items-center gap-3.5 mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="h-12 w-12 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/25">
            <Logo className="text-black h-7 w-7" />
          </div>
          <span className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
            {BRAND.nameUpper}
          </span>
        </motion.div>

        {/* Big animated heading */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black uppercase tracking-tighter text-slate-900 dark:text-white leading-[0.95]">
            Travel
            <br />
            management,
            <span className="relative flex overflow-hidden h-[1.1em]">
              &nbsp;
              {titles.map((title, index) => (
                <motion.span
                  key={index}
                  className="absolute font-black uppercase text-brand drop-shadow-[0_0_40px_rgba(11,210,181,0.3)]"
                  initial={{ opacity: 0, y: "-100%" }}
                  transition={{ type: "spring", stiffness: 50, damping: 15 }}
                  animate={
                    titleNumber === index
                      ? { y: 0, opacity: 1 }
                      : { y: titleNumber > index ? "-120%" : "120%", opacity: 0 }
                  }
                >
                  {title}.
                </motion.span>
              ))}
            </span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          className="text-base lg:text-lg text-slate-600 dark:text-[#aaa] leading-relaxed max-w-lg mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          Build itineraries, map routes, and share them with
          your travelers. One platform, no back and forth.
        </motion.p>

        {/* Feature pills */}
        <motion.div
          className="flex flex-wrap gap-3 mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          {features.map(({ icon: Icon, label }, i) => (
            <motion.div
              key={label}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white/60 dark:bg-white/[0.04] border border-slate-200/50 dark:border-[#1f1f1f] backdrop-blur-sm"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.8 + i * 0.1 }}
            >
              <Icon className="h-3.5 w-3.5 text-brand" strokeWidth={2.5} />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-[#999]">{label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function LoginPage() {
  const realAuth = isFirebaseConfigured();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Fields — account
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>("Trip Manager");
  const [agencyName, setAgencyName] = useState("");

  // Fields — branding (step 3)
  const [brandLogo, setBrandLogo] = useState("");
  const [brandColor, setBrandColor] = useState(BRAND.accentColor);
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAgency, setPendingAgency] = useState<string | null>(null);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { completeOnboarding, signIn, signInWithGoogle, demoLogin, user } = useAuth();
  const { createOrg, currentOrg } = useOrg();
  const { refreshBranding } = useBrand();
  const navigate = useNavigate();

  const totalSteps = realAuth ? 3 : 2;
  const effectiveOrgId = createdOrgId || currentOrg?.id;

  // ── Create org after sign-up once user is in context ─────────────────
  const orgCreated = useRef(false);
  useEffect(() => {
    if (!pendingAgency || !user || orgCreated.current) return;
    orgCreated.current = true;
    const agency = pendingAgency;
    createOrg(agency)
      .then(({ org, error: orgErr }) => {
        if (orgErr || !org) {
          logger.warn("LoginPage", "org creation failed:", orgErr);
          sessionStorage.removeItem(STORAGE.PENDING_BRANDING);
          setPendingAgency(null);
          navigate("/dashboard");
        } else {
          setCreatedOrgId(org.id);
          setBrandCompanyName(agency);
          setPendingAgency(null);
          setStep(3);
        }
      })
      .catch(() => {
        sessionStorage.removeItem(STORAGE.PENDING_BRANDING);
        setPendingAgency(null);
        navigate("/dashboard");
      });
  }, [pendingAgency, user, createOrg, navigate]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const err = await signIn(email, password);
      if (err) setError(err);
      else navigate("/dashboard");
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const canAdvance = name.trim().length >= 2;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (canAdvance) setStep(2);
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (realAuth && !password) { setError("Password is required"); return; }
    if (realAuth && password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (realAuth && !email) { setError("Email is required"); return; }

    setLoading(true);
    const wantsOrg = realAuth && !!agencyName.trim();
    sessionStorage.removeItem(STORAGE.PENDING_BRANDING);

    try {
      if (wantsOrg) {
        sessionStorage.setItem(STORAGE.PENDING_BRANDING, "1");
        setPendingAgency(agencyName.trim());
      }
      const err = await completeOnboarding({ name, email, password, role });
      if (err) {
        sessionStorage.removeItem(STORAGE.PENDING_BRANDING);
        setPendingAgency(null);
        setError(err);
        return;
      }
      if (!wantsOrg) navigate("/dashboard");
    } catch (ex) {
      sessionStorage.removeItem(STORAGE.PENDING_BRANDING);
      setPendingAgency(null);
      setError(ex instanceof Error ? ex.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    try {
      await demoLogin();
      navigate("/dashboard");
    } catch {
      setError("Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: err } = await signInWithGoogle();
      if (err) setError(err);
      else navigate("/dashboard");
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setStep(1);
    setError(null);
    setPassword("");
    sessionStorage.removeItem(STORAGE.PENDING_BRANDING);
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-[#050505] relative overflow-hidden">
      {/* Full-canvas animated hero background */}
      <div className="hidden lg:block">
        <HeroBackground />
      </div>

      {/* Mobile hero — compact version */}
      <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none">
      </div>

      {/* Form card — glass overlay on right */}
      <div className="relative z-20 min-h-dvh flex items-center justify-center lg:justify-end p-6 sm:p-10 lg:pr-16 xl:pr-24">
        <motion.div
          className="w-full max-w-[480px] lg:bg-white/70 lg:dark:bg-[#0a0a0a]/80 lg:backdrop-blur-2xl lg:border lg:border-slate-200/50 lg:dark:border-[#1f1f1f] lg:rounded-3xl lg:shadow-2xl lg:shadow-black/5 lg:dark:shadow-black/40 lg:p-10 xl:lg:p-12"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        >
          {/* Mobile-only logo */}
          <div className="text-center mb-10 lg:hidden">
            <div
              aria-hidden="true"
              className="h-14 w-14 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand/20"
            >
              <Logo className="text-black h-8 w-8" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1.5">
              {BRAND.nameUpper}
            </h1>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">
              {BRAND.tagline}
            </p>
          </div>

          {/* ── SIGN IN ─────────────────────────────────────────── */}
          {realAuth && mode === "sign-in" && (
            <>
              <div className="mb-10">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                  Welcome back
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#bbb]">
                  Sign in to your account
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              {/* Google first — primary social CTA */}
              <Button
                type="button"
                onClick={handleGoogle}
                disabled={loading || googleLoading}
                variant="outline"
                className="w-full h-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] hover:bg-slate-50 dark:hover:bg-[#111] text-slate-800 dark:text-[#ddd] text-sm font-bold gap-3 transition-colors"
              >
                {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
              </Button>

              <OrDivider />

              <form onSubmit={handleSignIn} className="space-y-5">
                <InputField label="Email">
                  <Input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </InputField>

                <InputField label="Password">
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={`${inputClass} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </InputField>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2.5 transition-all duration-150"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Sign In <ArrowRight className="h-4.5 w-4.5" /></>}
                </Button>
              </form>

              <p className="text-center text-sm font-semibold text-slate-400 dark:text-[#999] mt-8">
                New here?{" "}
                <button onClick={() => switchMode("sign-up")} className="text-brand hover:underline underline-offset-2 cursor-pointer font-bold">
                  Create an account
                </button>
              </p>
            </>
          )}

          {/* ── SIGN UP — STEP 1 (Name) ────────────────────────── */}
          {(!realAuth || mode === "sign-up") && step === 1 && (
            <>
              <StepIndicator current={1} total={totalSteps} />

              <div className="flex justify-center mb-4">
                <img src="/illustrations/illus-wavy.svg" alt="" className="h-28 sm:h-32 object-contain" />
              </div>

              <div className="mb-10 text-center">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                  {realAuth ? "Let's get started" : "Welcome"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#bbb]">
                  What should we call you?
                </p>
              </div>

              <form onSubmit={handleNext} className="space-y-6">
                <InputField label="Your Name">
                  <Input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className={inputClass}
                  />
                </InputField>

                <Button
                  type="submit"
                  disabled={!canAdvance}
                  className="w-full h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed gap-2.5 transition-all duration-150"
                >
                  Continue <ArrowRight className="h-4.5 w-4.5" />
                </Button>
              </form>

              {realAuth && (
                <>
                  <OrDivider />

                  <Button
                    type="button"
                    onClick={handleGoogle}
                    disabled={loading || googleLoading}
                    variant="outline"
                    className="w-full h-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] hover:bg-slate-50 dark:hover:bg-[#111] text-slate-800 dark:text-[#ddd] text-sm font-bold gap-3 transition-colors"
                  >
                    {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
                  </Button>

                  <p className="text-center text-sm font-semibold text-slate-400 dark:text-[#999] mt-8">
                    Already have an account?{" "}
                    <button onClick={() => switchMode("sign-in")} className="text-brand hover:underline underline-offset-2 cursor-pointer font-bold">
                      Sign In
                    </button>
                  </p>
                </>
              )}
            </>
          )}

          {/* ── SIGN UP — STEP 2 (Email, Password, Role, Agency) ─ */}
          {(!realAuth || mode === "sign-up") && step === 2 && (
            <>
              <StepIndicator current={2} total={totalSteps} />

              <div className="flex justify-center mb-4">
                <img src="/illustrations/illus-discussion.svg" alt="" className="h-28 sm:h-32 object-contain" />
              </div>

              <div className="mb-8 text-center">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                  Hey, {name.trim().split(/\s+/)[0]}
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#bbb]">
                  {realAuth ? "Set up your account" : "A few more details"}
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleFinish} className="space-y-5">
                <InputField label="Email" optional={!realAuth}>
                  <Input
                    type="email"
                    required={realAuth}
                    value={email}
                    autoFocus
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </InputField>

                {realAuth && (
                  <InputField label="Password">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className={`${inputClass} pr-14`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </InputField>
                )}

                {/* Role selector */}
                <div className="space-y-2.5">
                  <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">
                    Your Role
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {ROLES.map(r => {
                      const selected = role === r.label;
                      const Icon = r.icon;
                      return (
                        <button
                          key={r.label}
                          type="button"
                          onClick={() => setRole(r.label)}
                          className={`relative flex flex-col items-center gap-2 py-4 px-3 rounded-xl border transition-all duration-150 cursor-pointer ${
                            selected
                              ? "bg-brand/10 dark:bg-brand/[0.08] border-brand/40 ring-1 ring-brand/20"
                              : "bg-white dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] hover:border-slate-300 dark:hover:border-[#333]"
                          }`}
                        >
                          <Icon className={`h-5 w-5 transition-colors ${selected ? "text-brand" : "text-slate-400 dark:text-[#666]"}`} strokeWidth={2} />
                          <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                            selected ? "text-brand" : "text-slate-600 dark:text-[#999]"
                          }`}>
                            {r.label}
                          </span>
                          <span className={`text-[10px] leading-tight transition-colors ${
                            selected ? "text-brand/70" : "text-slate-400 dark:text-[#555]"
                          }`}>
                            {r.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {realAuth && (
                  <InputField label="Agency / Company Name" optional>
                    <Input
                      type="text"
                      value={agencyName}
                      onChange={e => setAgencyName(e.target.value)}
                      placeholder="e.g. Sunset Travel Co."
                      className={inputClass}
                    />
                  </InputField>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="h-14 w-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] text-slate-500 dark:text-[#888] hover:bg-slate-50 dark:hover:bg-[#111] hover:text-slate-900 dark:hover:text-white p-0 shrink-0 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2.5 transition-all duration-150"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Get Started <ArrowRight className="h-4.5 w-4.5" /></>}
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* ── SIGN UP — STEP 3 (Branding) ────────────────────── */}
          {realAuth && mode === "sign-up" && step === 3 && (
            <>
              <StepIndicator current={3} total={3} />

              <div className="flex justify-center mb-4">
                <img src="/illustrations/illus-together.svg" alt="" className="h-28 sm:h-32 object-contain" />
              </div>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                  Brand Your Agency
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#bbb]">
                  This is what travelers see on shared trips
                </p>
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
                            if (!file || !effectiveOrgId) {
                              if (!effectiveOrgId) toast.error("Organization not ready — try again in a moment");
                              return;
                            }
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error("Logo must be under 2 MB");
                              return;
                            }
                            setUploadingLogo(true);
                            const { url, error: err } = await uploadLogo(effectiveOrgId, file);
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

                {/* Company name */}
                <InputField label="Display Name">
                  <Input
                    type="text"
                    value={brandCompanyName}
                    onChange={e => setBrandCompanyName(e.target.value)}
                    placeholder={BRAND.name}
                    className={inputClass}
                  />
                </InputField>

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
                    onClick={() => { sessionStorage.removeItem(STORAGE.PENDING_BRANDING); navigate("/dashboard"); }}
                    variant="outline"
                    className="h-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] text-slate-500 dark:text-[#888] hover:bg-slate-50 dark:hover:bg-[#111] hover:text-slate-900 dark:hover:text-white font-bold uppercase tracking-wider text-xs px-6 transition-colors"
                  >
                    Skip
                  </Button>
                  <Button
                    type="button"
                    disabled={savingBrand}
                    onClick={async () => {
                      if (!effectiveOrgId) { sessionStorage.removeItem(STORAGE.PENDING_BRANDING); navigate("/dashboard"); return; }
                      setSavingBrand(true);
                      const { error: err } = await updateBranding(effectiveOrgId, {
                        companyName: brandCompanyName || null,
                        logoUrl: brandLogo || null,
                        accentColor: brandColor !== BRAND.accentColor ? brandColor : null,
                      });
                      setSavingBrand(false);
                      if (err) { toast.error(err); return; }
                      refreshBranding();
                      sessionStorage.removeItem(STORAGE.PENDING_BRANDING);
                      navigate("/dashboard");
                    }}
                    className="flex-1 h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2.5 transition-all duration-150"
                  >
                    {savingBrand ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Finish Setup <ArrowRight className="h-4.5 w-4.5" /></>}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── Demo Login ──────────────────────────────────────── */}
          {step !== 3 && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-[#1a1a1a]">
              <button
                onClick={handleDemo}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-[#888] hover:text-slate-600 dark:hover:text-[#bbb] hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Compass className="h-4 w-4" strokeWidth={2} />
                    Explore Demo
                  </>
                )}
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs font-medium text-slate-400 dark:text-[#777] mt-8">
            {step === 3
              ? "You can change these anytime in Settings"
              : realAuth
                ? ""
                : "Your profile is stored on this device only"}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
