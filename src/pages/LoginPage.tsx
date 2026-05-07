import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  SpinnerGap, ArrowRight, Eye, EyeSlash, X,
  Globe, MapPin, Calendar, AirplaneTilt, Compass,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/brand";
import { isFirebaseConfigured } from "@/services/firebase";
import { resetPassword } from "@/services/firebaseAuth";

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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 p-4 rounded-2xl bg-red-500/[0.06] dark:bg-red-500/[0.08] border border-red-500/15 dark:border-red-500/10">
      <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
        <X className="h-4 w-4 text-red-500" weight="bold" />
      </div>
      <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex-1">{message}</p>
    </div>
  );
}

function InputField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">
        {label}
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
    { icon: AirplaneTilt, label: "Share via PIN" },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      <div className="absolute inset-y-0 left-0 right-[520px] xl:right-[580px] flex flex-col justify-center px-12 xl:px-20">
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

        <motion.p
          className="text-base lg:text-lg text-slate-600 dark:text-[#aaa] leading-relaxed max-w-lg mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          Build itineraries, map routes, and share them with
          your travelers. One platform, no back and forth.
        </motion.p>

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
              <Icon className="h-3.5 w-3.5 text-brand" weight="bold" />
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

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const { signIn, signUp, signInWithGoogle, demoLogin } = useAuth();
  const navigate = useNavigate();

  const goPostLogin = () => {
    const pending = sessionStorage.getItem("daf-pending-invite");
    if (pending) {
      sessionStorage.removeItem("daf-pending-invite");
      navigate(`/invite/${pending}`);
    } else {
      navigate("/dashboard");
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const err = await signIn(email, password);
      if (err) setError(err);
      else goPostLogin();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    setForgotError(null);
    const { error: err } = await resetPassword(forgotEmail.trim());
    setForgotSending(false);
    if (err) {
      setForgotError(err);
    } else {
      setForgotSent(true);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || name.trim().length < 2) { setError("Name must be at least 2 characters"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (!password || password.length < 6) { setError("Password must be at least 6 characters"); return; }

    setLoading(true);
    try {
      const err = await signUp({ name: name.trim(), email: email.trim(), password });
      if (err) setError(err);
      else goPostLogin();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    try {
      await demoLogin();
      goPostLogin();
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
      else goPostLogin();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setPassword("");
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-[#050505] relative overflow-hidden">
      <div className="hidden lg:block">
        <HeroBackground />
      </div>

      <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none" />

      <div className="relative z-20 min-h-dvh flex items-center justify-center lg:justify-end p-6 sm:p-10 lg:pr-16 xl:pr-24">
        <motion.div
          className="relative w-full max-w-[480px] lg:bg-white/70 lg:dark:bg-[#0a0a0a]/80 lg:backdrop-blur-2xl lg:border lg:border-slate-200/50 lg:dark:border-[#1f1f1f] lg:rounded-3xl lg:shadow-2xl lg:shadow-black/5 lg:dark:shadow-black/40 lg:p-10 xl:lg:p-12"
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

              <Button
                type="button"
                onClick={handleGoogle}
                disabled={loading || googleLoading}
                variant="outline"
                className="w-full h-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] hover:bg-slate-50 dark:hover:bg-[#111] text-slate-800 dark:text-[#ddd] text-sm font-bold gap-3 transition-colors"
              >
                {googleLoading ? <SpinnerGap className="h-5 w-5 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
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
                      {showPassword ? <EyeSlash className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false); setForgotError(null); }}
                      className="text-xs font-bold text-brand hover:underline underline-offset-2 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                </InputField>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2.5 transition-all duration-150"
                >
                  {loading ? <SpinnerGap className="h-5 w-5 animate-spin" /> : <>Sign In <ArrowRight className="h-4.5 w-4.5" /></>}
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

          {/* ── SIGN UP ─────────────────────────────────────────── */}
          {realAuth && mode === "sign-up" && (
            <>
              <div className="mb-10">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                  Create account
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#bbb]">
                  Set up your account to get started
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              <Button
                type="button"
                onClick={handleGoogle}
                disabled={loading || googleLoading}
                variant="outline"
                className="w-full h-14 rounded-xl border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#0a0a0a] hover:bg-slate-50 dark:hover:bg-[#111] text-slate-800 dark:text-[#ddd] text-sm font-bold gap-3 transition-colors"
              >
                {googleLoading ? <SpinnerGap className="h-5 w-5 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
              </Button>

              <OrDivider />

              <form onSubmit={handleSignUp} className="space-y-5">
                <InputField label="Full Name">
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

                <InputField label="Email">
                  <Input
                    type="email"
                    required
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
                      placeholder="Min. 6 characters"
                      className={`${inputClass} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
                    >
                      {showPassword ? <EyeSlash className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </InputField>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2.5 transition-all duration-150"
                >
                  {loading ? <SpinnerGap className="h-5 w-5 animate-spin" /> : <>Create Account <ArrowRight className="h-4.5 w-4.5" /></>}
                </Button>
              </form>

              <p className="text-center text-sm font-semibold text-slate-400 dark:text-[#999] mt-8">
                Already have an account?{" "}
                <button onClick={() => switchMode("sign-in")} className="text-brand hover:underline underline-offset-2 cursor-pointer font-bold">
                  Sign In
                </button>
              </p>
            </>
          )}

          {/* ── Non-Firebase fallback (demo-only) ──────────────── */}
          {!realAuth && (
            <>
              <div className="mb-10 text-center">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                  Welcome
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#bbb]">
                  Enter your name to get started
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!name.trim() || name.trim().length < 2) return;
                  setLoading(true);
                  await demoLogin();
                  setLoading(false);
                  goPostLogin();
                }}
                className="space-y-5"
              >
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
                  disabled={loading || name.trim().length < 2}
                  className="w-full h-14 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 disabled:opacity-40 gap-2.5 transition-all duration-150"
                >
                  {loading ? <SpinnerGap className="h-5 w-5 animate-spin" /> : <>Get Started <ArrowRight className="h-4.5 w-4.5" /></>}
                </Button>
              </form>
            </>
          )}

          {/* ── Demo Login ──────────────────────────────────────── */}
          {realAuth && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-[#1a1a1a]">
              <button
                onClick={handleDemo}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-xs font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-[#888] hover:text-slate-600 dark:hover:text-[#bbb] hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors cursor-pointer"
              >
                {loading ? (
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Compass className="h-4 w-4" weight="regular" />
                    Explore Demo
                  </>
                )}
              </button>
            </div>
          )}

          <p className="text-center text-xs font-medium text-slate-400 dark:text-[#777] mt-8">
            {realAuth ? "" : "Your profile is stored on this device only"}
          </p>

          {/* ── Forgot Password Overlay ──────────────────────── */}
          {showForgot && (
            <div className="absolute inset-0 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-sm rounded-3xl flex items-center justify-center p-8 z-30">
              <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2">
                    Reset Password
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-[#bbb]">
                    {forgotSent
                      ? "Check your inbox for a reset link"
                      : "Enter your email and we'll send a reset link"}
                  </p>
                </div>

                {forgotSent ? (
                  <div className="space-y-4 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto">
                      <ArrowRight className="h-6 w-6 text-brand" />
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-[#aaa]">
                      Reset link sent to <strong className="text-slate-900 dark:text-white">{forgotEmail}</strong>
                    </p>
                    <Button
                      onClick={() => { setShowForgot(false); setForgotSent(false); }}
                      className="w-full h-12 rounded-xl bg-brand hover:brightness-110 text-black text-sm font-bold uppercase tracking-wider"
                    >
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    {forgotError && <ErrorBanner message={forgotError} />}
                    <InputField label="Email">
                      <Input
                        type="email"
                        required
                        autoFocus
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className={inputClass}
                      />
                    </InputField>
                    <Button
                      type="submit"
                      disabled={forgotSending || !forgotEmail.trim()}
                      className="w-full h-12 rounded-xl bg-brand hover:brightness-110 text-black text-sm font-bold uppercase tracking-wider shadow-lg shadow-brand/25 gap-2 disabled:opacity-40"
                    >
                      {forgotSending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="w-full text-center text-sm font-bold text-slate-400 dark:text-[#888] hover:text-brand cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
