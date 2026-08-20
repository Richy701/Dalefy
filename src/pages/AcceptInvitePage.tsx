import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SpinnerGap, CheckCircle, XCircle, EnvelopeSimple, UsersThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { acceptInvite, getInvitePreview } from "@/services/invites";
import { setPendingInvite, clearPendingInvite } from "@/lib/pendingInvite";
import { Logo } from "@/components/shared/Logo";

type Status =
  | "loading"
  | "preview"       // signed out: show who invited you, ask to sign in
  | "confirm"       // signed in with matching email: explicit Accept
  | "accepting"
  | "unverified"    // signed in but email not verified
  | "wrong-account" // signed in with a different email
  | "success"
  | "error";

interface Preview {
  orgName: string;
  logoUrl?: string | null;
  inviterName: string;
  role: string;
  email: string;
  maskedEmail?: string;
  expiresAt?: string;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", agent: "Agent", viewer: "Viewer" };

function errorCode(err: unknown): string {
  return typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
}

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user, logout, resendVerification } = useAuth();
  const { refreshOrg } = useOrg();

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fail = useCallback((msg: string) => {
    clearPendingInvite();
    setStatus("error");
    setMessage(msg);
  }, []);

  // ── Load the invite (public preview when signed out, Firestore when signed in) ──
  useEffect(() => {
    if (authLoading) return;
    if (!token) { queueMicrotask(() => fail("Invalid invite link")); return; }
    let cancelled = false;

    if (!isAuthenticated) {
      fetch(`/api/invite-preview?token=${encodeURIComponent(token)}`)
        .then(async r => {
          const data = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (!r.ok) { fail(data.error || "Invite not found"); return; }
          if (data.status !== "pending") {
            fail(data.status === "expired" ? "This invitation has expired. Ask your team to send a new one." : "This invite has already been used or was revoked.");
            return;
          }
          setPreview(data);
          setPendingInvite(token, data.email);
          setStatus("preview");
        })
        .catch(() => { if (!cancelled) fail("Couldn't load this invite. Check your connection and try again."); });
      return () => { cancelled = true; };
    }

    getInvitePreview(token)
      .then(result => {
        if (cancelled) return;
        if ("error" in result) {
          fail(result.code === "expired" ? "This invitation has expired. Ask your team to send a new one." : result.error);
          return;
        }
        setPreview(result);
        setStatus("confirm");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (errorCode(err) === "permission-denied") {
          // Rules only let the invited address read the invite
          setStatus("wrong-account");
          setMessage(`This invite was sent to a different email address. You're signed in as ${user?.email ?? "another account"}.`);
        } else {
          fail(err instanceof Error ? err.message : "Couldn't load this invite");
        }
      });
    return () => { cancelled = true; };
  }, [token, isAuthenticated, authLoading, user?.email, fail]);

  // ── Accept ──
  const handleAccept = async () => {
    if (!token) return;
    setBusy(true);
    setNote(null);
    setStatus("accepting");
    try {
      const result = await acceptInvite(token);
      if ("error" in result) {
        if (result.code === "unverified") { setStatus("unverified"); return; }
        if (result.code === "wrong-email") { setStatus("wrong-account"); setMessage(result.error); return; }
        fail(result.error);
        return;
      }
      clearPendingInvite();
      refreshOrg();
      setStatus("success");
      setMessage(result.alreadyMember ? `You're already a member of ${result.orgName}` : `You've joined ${result.orgName}`);
    } catch (err: unknown) {
      const code = errorCode(err);
      fail(
        code === "permission-denied"
          ? "We couldn't add you to this team. Make sure you're signed in with the email address the invite was sent to and that your email is verified."
          : err instanceof Error ? err.message : "Something went wrong accepting this invite",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setBusy(true);
    const err = await resendVerification();
    setBusy(false);
    setNote(err ? err : `Verification email sent to ${user?.email ?? "your address"}. Check your inbox, then come back here.`);
  };

  const handleSwitchAccount = () => {
    if (token && preview?.email) setPendingInvite(token, preview.email);
    else if (token) setPendingInvite(token);
    logout();
    navigate("/login");
  };

  const handleSignIn = () => {
    if (token) setPendingInvite(token, preview?.email);
    navigate("/login");
  };

  const inviter = preview?.inviterName || "A team member";
  const roleLabel = preview ? (ROLE_LABEL[preview.role] ?? preview.role) : "";

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <Logo className="h-8 mx-auto text-brand" />

        {status === "loading" && (
          <div className="space-y-4">
            <SpinnerGap className="h-10 w-10 animate-spin text-brand mx-auto" />
            <p className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">Loading invite...</p>
          </div>
        )}

        {(status === "preview" || status === "confirm" || status === "accepting") && preview && (
          <div className="space-y-5">
            <InviteCard preview={preview} inviter={inviter} roleLabel={roleLabel} />
            {status === "preview" ? (
              <>
                <p className="text-sm text-slate-600 dark:text-[#aaa]">
                  Sign in or create an account with <strong className="text-slate-900 dark:text-white">{preview.email}</strong> to accept.
                </p>
                <Button
                  onClick={handleSignIn}
                  className="w-full h-10 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
                >
                  Sign in to accept
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600 dark:text-[#aaa]">
                  Accepting as <strong className="text-slate-900 dark:text-white">{user?.email}</strong>
                </p>
                <Button
                  onClick={handleAccept}
                  disabled={busy || status === "accepting"}
                  className="w-full h-10 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
                >
                  {status === "accepting" ? <SpinnerGap className="h-5 w-5 animate-spin" /> : "Accept invitation"}
                </Button>
                <div className="flex items-center justify-center gap-4 text-xs font-bold uppercase tracking-wider">
                  <button onClick={() => { clearPendingInvite(); navigate("/dashboard"); }} className="text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white">
                    Not now
                  </button>
                  <span className="text-slate-400 dark:text-[#666]">·</span>
                  <button onClick={handleSwitchAccount} className="text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white">
                    Not you? Switch account
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "unverified" && (
          <div className="space-y-4">
            <EnvelopeSimple className="h-12 w-12 text-brand mx-auto" weight="duotone" />
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Verify your email</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">
              To keep your team secure we need to confirm <strong className="text-slate-900 dark:text-white">{user?.email}</strong> is yours. Open the verification email we sent you, then continue.
            </p>
            {note && <p className="text-xs text-brand font-semibold">{note}</p>}
            <Button
              onClick={handleAccept}
              disabled={busy}
              className="w-full h-10 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
            >
              I've verified, continue
            </Button>
            <Button
              onClick={handleResendVerification}
              disabled={busy}
              variant="ghost"
              className="w-full h-10 rounded-xl font-bold uppercase tracking-wider"
            >
              Resend verification email
            </Button>
          </div>
        )}

        {status === "wrong-account" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-amber-500 mx-auto" />
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Different account</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">{message}</p>
            <Button
              onClick={handleSwitchAccount}
              className="w-full h-10 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
            >
              Sign out and switch account
            </Button>
            <Button
              onClick={() => { clearPendingInvite(); navigate("/dashboard"); }}
              variant="ghost"
              className="w-full h-10 rounded-xl font-bold uppercase tracking-wider"
            >
              Stay signed in
            </Button>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle className="h-12 w-12 text-brand mx-auto" weight="fill" />
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Welcome aboard</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">{message}</p>
            <Button
              onClick={() => navigate("/dashboard")}
              className="w-full h-10 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Oops</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">{message}</p>
            <Button
              onClick={() => navigate("/")}
              variant="ghost"
              className="w-full h-10 rounded-xl font-bold uppercase tracking-wider"
            >
              Go Home
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteCard({ preview, inviter, roleLabel }: { preview: Preview; inviter: string; roleLabel: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#111111] p-6 text-left">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand mb-3">Team invitation</p>
      <div className="flex items-center gap-3 mb-4">
        {preview.logoUrl ? (
          <img src={preview.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain bg-white" />
        ) : (
          <div className="h-10 w-10 rounded-xl bg-brand/15 flex items-center justify-center">
            <UsersThree className="h-5 w-5 text-brand" weight="bold" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate">{preview.orgName || "Your team"}</h1>
          <p className="text-xs text-slate-500 dark:text-[#888]">on Dalefy</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-slate-500 dark:text-[#888]">Invited by</dt>
        <dd className="text-slate-900 dark:text-white font-semibold truncate">{inviter}</dd>
        <dt className="text-slate-500 dark:text-[#888]">Role</dt>
        <dd className="text-slate-900 dark:text-white font-semibold">{roleLabel}</dd>
        <dt className="text-slate-500 dark:text-[#888]">Sent to</dt>
        <dd className="text-slate-900 dark:text-white font-semibold truncate">{preview.maskedEmail || preview.email}</dd>
      </dl>
    </div>
  );
}
