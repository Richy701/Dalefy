import { useState, useEffect } from "react";
import { EnvelopeSimple, SpinnerGap, CheckCircle, ArrowClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

export function EmailVerificationBanner() {
  const { user, emailVerified, resendVerification, refreshEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: "info" | "error" } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || emailVerified || user.id === "demo" || (user.id?.length ?? 0) < 20) return null;

  const handleResend = async () => {
    setSending(true);
    setNotice(null);
    const err = await resendVerification();
    setSending(false);
    if (err) {
      setNotice({ text: err, kind: "error" });
    } else {
      setNotice({ text: "Verification email sent. Check your inbox and spam.", kind: "info" });
      setCooldown(30);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setNotice(null);
    const verified = await refreshEmailVerified();
    setChecking(false);
    if (!verified) {
      setNotice({ text: "Not verified yet. Open the link in the email first, then try again.", kind: "error" });
    }
  };

  return (
    <div role="status" aria-live="polite" className="bg-amber-50 dark:bg-amber-500/[0.06] border-b border-amber-200/60 dark:border-amber-500/15 px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <EnvelopeSimple className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" weight="bold" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
          Please verify your email address ({user.email}).
        </p>
        {notice && (
          <p className={`text-[11px] font-semibold mt-0.5 ${notice.kind === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
            {notice.text}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/15 transition-colors disabled:opacity-50"
        >
          {checking ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <ArrowClockwise className="h-3 w-3" />}
          I verified
        </button>
        <button
          onClick={handleResend}
          disabled={sending || cooldown > 0}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white bg-amber-700 dark:bg-amber-600 hover:bg-amber-800 dark:hover:bg-amber-500 transition-colors disabled:opacity-60"
        >
          {sending ? (
            <SpinnerGap className="h-3 w-3 animate-spin" />
          ) : cooldown > 0 ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <EnvelopeSimple className="h-3 w-3" />
          )}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
        </button>
      </div>
    </div>
  );
}
