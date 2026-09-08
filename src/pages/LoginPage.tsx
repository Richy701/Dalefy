import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { SpinnerGap, Eye, EyeSlash, EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";
import { BRAND } from "@/config/brand";
import { isFirebaseConfigured } from "@/services/firebase";
import { resetPassword } from "@/services/firebaseAuth";
import { getPendingInvite, getPendingInviteEmail } from "@/lib/pendingInvite";

// ── Shared sub-components ───────────────────────────────────────────────

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function Field({ label, htmlFor, children, trailing }: { label: string; htmlFor: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</Label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

const inputClass =
  "h-11 rounded-xl bg-card border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand transition-colors";

const primaryBtn =
  "w-full h-11 rounded-xl bg-brand hover:opacity-90 text-black text-sm font-medium gap-2 disabled:opacity-40";

const outlineBtn =
  "w-full h-11 rounded-xl border-border bg-card hover:bg-secondary text-foreground text-sm font-medium gap-2.5";

// ── Main Component ──────────────────────────────────────────────────────

type View = "signin" | "forgot" | "forgot-sent";

export function LoginPage() {
  const realAuth = isFirebaseConfigured();

  const [view, setView] = useState<View>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => getPendingInviteEmail() ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const notice = localStorage.getItem("daf-login-notice");
    if (notice) localStorage.removeItem("daf-login-notice");
    return notice;
  });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const { signIn, signInWithGoogle, demoLogin } = useAuth();
  const navigate = useNavigate();

  const pendingInviteEmail = getPendingInvite() ? getPendingInviteEmail() : null;

  const goPostLogin = () => {
    const pending = getPendingInvite();
    navigate(pending ? `/invite/${pending}` : "/dashboard");
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
    if (err) setForgotError(err);
    else setView("forgot-sent");
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

  const openForgot = () => {
    setForgotEmail(email);
    setForgotError(null);
    setView("forgot");
  };

  const backToSignIn = () => {
    setForgotError(null);
    setView("signin");
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="px-6 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo className="h-5 w-5 text-foreground" />
          <span className="text-sm font-semibold tracking-tight text-foreground">{BRAND.name}</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <motion.div
          className="w-full max-w-[360px]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {/* ── Sign in ───────────────────────────────────────── */}
          {realAuth && view === "signin" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">Sign in</h1>
                <p className="text-sm text-muted-foreground">
                  Use the account you were invited with.
                </p>
              </div>

              {pendingInviteEmail && (
                <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">Team invitation</p>
                  <p className="text-sm text-foreground">
                    Sign in with <span className="font-medium">{pendingInviteEmail}</span> to join your team.
                  </p>
                </div>
              )}

              {error && <div className="mb-6"><ErrorNote message={error} /></div>}

              <Button
                type="button"
                onClick={handleGoogle}
                disabled={loading || googleLoading}
                variant="outline"
                className={outlineBtn}
              >
                {googleLoading ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
              </Button>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                <Field label="Email" htmlFor="login-email">
                  <Input
                    id="login-email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Password"
                  htmlFor="login-password"
                  trailing={
                    <button
                      type="button"
                      onClick={openForgot}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  }
                >
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Your password"
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      {showPassword ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <Button type="submit" disabled={loading} className={`${primaryBtn} mt-2`}>
                  {loading ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground mt-8">
                Access is by invitation. Ask your team admin if you need one.
              </p>
            </>
          )}

          {/* ── Forgot password ───────────────────────────────── */}
          {realAuth && view === "forgot" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">Reset your password</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              {forgotError && <div className="mb-6"><ErrorNote message={forgotError} /></div>}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <Field label="Email" htmlFor="forgot-email">
                  <Input
                    id="forgot-email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </Field>
                <Button type="submit" disabled={forgotSending || !forgotEmail.trim()} className={`${primaryBtn} mt-2`}>
                  {forgotSending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Send reset link"}
                </Button>
                <button
                  type="button"
                  onClick={backToSignIn}
                  className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-2"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {realAuth && view === "forgot-sent" && (
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-5">
                <EnvelopeSimple className="h-5 w-5 text-foreground" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">Check your inbox</h1>
              <p className="text-sm text-muted-foreground mb-8">
                We sent a reset link to <span className="font-medium text-foreground">{forgotEmail}</span>.
              </p>
              <Button type="button" onClick={backToSignIn} variant="outline" className={outlineBtn}>
                Back to sign in
              </Button>
            </div>
          )}

          {/* ── Non-Firebase fallback (demo-only) ──────────────── */}
          {!realAuth && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">Welcome</h1>
                <p className="text-sm text-muted-foreground">Enter your name to get started.</p>
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
                className="space-y-4"
              >
                <Field label="Your name" htmlFor="demo-name">
                  <Input
                    id="demo-name"
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your full name"
                    className={inputClass}
                  />
                </Field>

                <Button type="submit" disabled={loading || name.trim().length < 2} className={`${primaryBtn} mt-2`}>
                  {loading ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Get started"}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground mt-8">
                Your profile is stored on this device only.
              </p>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
