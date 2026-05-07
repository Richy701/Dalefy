import { useState } from "react";
import { EnvelopeSimple, SpinnerGap, CheckCircle, ArrowClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

export function EmailVerificationBanner() {
  const { user, emailVerified, resendVerification, refreshEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || emailVerified || user.id === "demo" || (user.id?.length ?? 0) < 20) return null;

  const handleResend = async () => {
    setSending(true);
    setError(null);
    const err = await resendVerification();
    setSending(false);
    if (err) {
      setError(err);
    } else {
      setSent(true);
      setTimeout(() => setSent(false), 10000);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    await refreshEmailVerified();
    setChecking(false);
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-500/[0.06] border-b border-amber-200/60 dark:border-amber-500/15 px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <EnvelopeSimple className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" weight="bold" />
      <p className="text-xs font-bold text-amber-700 dark:text-amber-300 flex-1 min-w-0">
        Please verify your email address ({user.email}).
        {error && <span className="ml-1 text-red-500">{error}</span>}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/15 transition-colors disabled:opacity-50"
        >
          {checking ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <ArrowClockwise className="h-3 w-3" />}
          I verified
        </button>
        <button
          onClick={handleResend}
          disabled={sending || sent}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white bg-amber-600 dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {sending ? (
            <SpinnerGap className="h-3 w-3 animate-spin" />
          ) : sent ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <EnvelopeSimple className="h-3 w-3" />
          )}
          {sent ? "Sent" : "Resend"}
        </button>
      </div>
    </div>
  );
}
