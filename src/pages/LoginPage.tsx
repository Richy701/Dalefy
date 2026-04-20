import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/brand";
import { isSupabaseConfigured } from "@/services/supabase";

const ROLES = ["Trip Manager", "Agent", "Traveller", "Admin"] as const;

type Mode = "sign-in" | "sign-up";

export function LoginPage() {
  const realAuth = isSupabaseConfigured();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState<1 | 2>(1);

  // Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>("Trip Manager");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { completeOnboarding, signIn, demoLogin } = useAuth();
  const navigate = useNavigate();

  // ── Sign In ─────────────────────────────────────────────────────────────

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate("/");
    }
  };

  // ── Sign Up — Step 1 → 2 ───────────────────────────────────────────────

  const canAdvance = name.trim().length >= 2;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (canAdvance) setStep(2);
  };

  // ── Sign Up — Step 2 → Finish ───────────────────────────────────────────

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (realAuth && !password) {
      setError("Password is required");
      return;
    }
    if (realAuth && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (realAuth && !email) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    const err = await completeOnboarding({ name, email, password, role });
    setLoading(false);

    if (err) {
      setError(err);
    } else {
      navigate("/");
    }
  };

  // ── Demo login ──────────────────────────────────────────────────────────

  const handleDemo = async () => {
    setLoading(true);
    await demoLogin();
    setLoading(false);
    navigate("/");
  };

  // ── Switch between sign-in and sign-up ──────────────────────────────────

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setStep(1);
    setError(null);
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-up">
        {/* Logo + Brand */}
        <div className="text-center mb-10">
          <div aria-hidden="true" className="h-16 w-16 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-scale-in logo-shimmer">
            <Logo className="text-black h-9 w-9" />
          </div>
          <h1 className="text-4xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white mb-2">{BRAND.nameUpper}</h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">{BRAND.tagline}</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent rounded-[2rem] p-8 shadow-2xl dark:shadow-2xl animate-fade-up stagger-2">

          {/* ── SIGN IN MODE ─────────────────────────────────────────── */}
          {realAuth && mode === "sign-in" && (
            <>
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white mb-1">Welcome Back</h2>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] mb-8">Sign in to your account</p>

              {error && (
                <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Email</Label>
                  <Input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] rounded-xl text-slate-900 dark:text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] rounded-xl text-slate-900 dark:text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-brand/20 gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign In <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>

              <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mt-6">
                Don't have an account?{" "}
                <button onClick={() => switchMode("sign-up")} className="text-brand hover:underline">
                  Sign Up
                </button>
              </p>
            </>
          )}

          {/* ── SIGN UP MODE — STEP 1 (Name) ────────────────────────── */}
          {(!realAuth || mode === "sign-up") && step === 1 && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-brand" : "bg-slate-200 dark:bg-[#1f1f1f]"}`} />
                <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-brand" : "bg-slate-200 dark:bg-[#1f1f1f]"}`} />
              </div>

              <h2 className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white mb-1">
                {realAuth ? "Create Account" : "Welcome"}
              </h2>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] mb-8">What should we call you?</p>

              <form onSubmit={handleNext} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Your Name</Label>
                  <Input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-12 bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] rounded-xl text-slate-900 dark:text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!canAdvance}
                  className="w-full h-12 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-brand/20 disabled:opacity-40 disabled:cursor-not-allowed gap-2"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              {realAuth && (
                <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mt-6">
                  Already have an account?{" "}
                  <button onClick={() => switchMode("sign-in")} className="text-brand hover:underline">
                    Sign In
                  </button>
                </p>
              )}
            </>
          )}

          {/* ── SIGN UP MODE — STEP 2 (Email, Password, Role) ────────── */}
          {(!realAuth || mode === "sign-up") && step === 2 && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                <div className="h-1 flex-1 rounded-full bg-brand" />
                <div className="h-1 flex-1 rounded-full bg-brand" />
              </div>

              <h2 className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white mb-1">Nice to meet you, {name.trim().split(/\s+/)[0]}</h2>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] mb-8">
                {realAuth ? "Set up your account" : "A few more details"}
              </p>

              {error && (
                <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleFinish} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">
                    Email {!realAuth && <span className="text-slate-300 dark:text-[#444]">(optional)</span>}
                  </Label>
                  <Input
                    type="email"
                    required={realAuth}
                    value={email}
                    autoFocus
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] rounded-xl text-slate-900 dark:text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand"
                  />
                </div>

                {realAuth && (
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="h-12 bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] rounded-xl text-slate-900 dark:text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Your Role</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`h-11 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border ${
                          role === r
                            ? "bg-brand text-black border-brand"
                            : "bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#333]"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="h-12 rounded-xl border-black/[0.08] dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#050505] text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1f1f1f] px-4"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-12 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-brand/20 gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Get Started <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* ── Demo Login (always available) ──────────────────────── */}
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-[#1f1f1f]">
            <button
              onClick={handleDemo}
              disabled={loading}
              className="w-full h-10 rounded-xl text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#555] hover:text-slate-600 dark:hover:text-[#888] transition-colors"
            >
              {loading ? "Loading..." : "Try Demo Mode"}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#444] mt-8">
          {realAuth ? "Secured with end-to-end encryption" : "Your profile is stored on this device only"}
        </p>
      </div>
    </div>
  );
}
