import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SpinnerGap, CheckCircle, XCircle, EnvelopeSimple, UsersThree, Eye, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { acceptInvite, getInvitePreview } from "@/services/invites";
import { apiFetch, ApiError } from "@/lib/api";
import { setPendingInvite, clearPendingInvite } from "@/lib/pendingInvite";
import { Logo } from "@/components/shared/Logo";
import { sendSignInLink, needsPassword, changePassword } from "@/services/firebaseAuth";

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
  const [linkSent, setLinkSent] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Joined through an emailed link: they must pick a password before joining
  const [mustSetPassword, setMustSetPassword] = useState(needsPassword);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      apiFetch<Preview & { status?: string }>(`/api/invite-preview?token=${encodeURIComponent(token)}`)
        .then(data => {
          if (cancelled) return;
          if (data.status !== "pending") {
            fail(data.status === "expired" ? "This invitation has expired. Ask your team to send a new one." : "This invite has already been used or was revoked.");
            return;
          }
          setPreview(data);
          setPendingInvite(token, data.email);
          setStatus("preview");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status !== 0) {
            fail(/^Request failed \(\d+\)$/.test(err.message) ? "Invite not found" : err.message);
          } else {
            fail("Couldn't load this invite. Check your connection and try again.");
          }
        });
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
    if (mustSetPassword && password.length < 8) {
      setNote("Choose a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setNote(null);
    setStatus("accepting");
    try {
      if (mustSetPassword) {
        const { error, emailed } = await changePassword(password);
        if (error || emailed) {
          setNote(error ?? `We've emailed ${user?.email ?? "you"} a link to set your password. Set it, then come back and accept.`);
          setStatus("confirm");
          return;
        }
        setMustSetPassword(false);
        setPassword("");
      }
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

  const handleSwitchAccount = async () => {
    if (busy) return;
    setBusy(true);
    if (token && preview?.email) setPendingInvite(token, preview.email);
    else if (token) setPendingInvite(token);
    try {
      await logout();
      navigate("/login");
    } catch {
      setMessage("Couldn’t sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendLink = async () => {
    if (!token || !preview?.email || busy) return;
    setBusy(true);
    setLinkError(null);
    setPendingInvite(token, preview.email);
    const { error } = await sendSignInLink(preview.email, token);
    setBusy(false);
    if (error) setLinkError(error);
    else setLinkSent(true);
  };

  const handleSignIn = () => {
    if (token) setPendingInvite(token, preview?.email);
    navigate("/login");
  };

  const inviter = preview?.inviterName || "A team member";
  const roleLabel = preview ? (ROLE_LABEL[preview.role] ?? preview.role) : "";

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <Logo className="h-7 w-7 mx-auto text-foreground" />

        {status === "loading" && (
          <div className="space-y-4">
            <SpinnerGap className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Loading invite...</p>
          </div>
        )}

        {(status === "preview" || status === "confirm" || status === "accepting") && preview && (
          <div className="space-y-5">
            <InviteCard preview={preview} inviter={inviter} roleLabel={roleLabel} />
            {status === "preview" && linkSent ? (
              <div className="space-y-3">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mx-auto">
                  <EnvelopeSimple className="h-5 w-5 text-foreground" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Check your inbox</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a sign-in link to <strong className="text-foreground">{preview.maskedEmail || preview.email}</strong>. Open it in this browser and you'll join {preview.orgName || "the team"} straight away.
                </p>
                <p className="text-xs text-muted-foreground">It works once and expires in an hour. Not there? Check spam.</p>
                {linkError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{linkError}</p>}
                <Button
                  onClick={handleSendLink}
                  disabled={busy}
                  variant="outline"
                  className="w-full h-11 rounded-xl text-sm font-medium"
                >
                  {busy ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Send it again"}
                </Button>
              </div>
            ) : status === "preview" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  No password needed. We'll email a sign-in link to <strong className="text-foreground">{preview.maskedEmail || preview.email}</strong>.
                </p>
                {linkError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{linkError}</p>}
                <Button
                  onClick={handleSendLink}
                  disabled={busy}
                  className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium gap-2"
                >
                  {busy ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <><EnvelopeSimple className="h-4 w-4" /> Email me a sign-in link</>}
                </Button>
                <Button
                  onClick={handleSignIn}
                  disabled={busy}
                  variant="ghost"
                  className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground"
                >
                  Sign in with Google or a password
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Accepting as <strong className="text-foreground">{user?.email}</strong>
                </p>
                {mustSetPassword && (
                  <div className="space-y-2 text-left">
                    <Label htmlFor="invite-password" className="text-xs font-medium text-muted-foreground">Set a password</Label>
                    <div className="relative">
                      <Input
                        id="invite-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoFocus
                        value={password}
                        onChange={e => { setPassword(e.target.value); setNote(null); }}
                        onKeyDown={e => { if (e.key === "Enter") void handleAccept(); }}
                        placeholder="At least 8 characters"
                        className="h-11 rounded-xl bg-card border-border text-sm pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        {showPassword ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You'll use this with {user?.email ?? "this email"} to sign in on other devices. Share it with anyone who uses this account.
                    </p>
                  </div>
                )}
                {note && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{note}</p>}
                <Button
                  onClick={handleAccept}
                  disabled={busy || status === "accepting" || (mustSetPassword && password.length < 8)}
                  className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium disabled:opacity-40"
                >
                  {status === "accepting" ? <SpinnerGap className="h-5 w-5 animate-spin" /> : mustSetPassword ? "Set password and join" : "Accept invitation"}
                </Button>
                <div className="flex items-center justify-center gap-6 text-xs font-medium">
                  <button onClick={() => { clearPendingInvite(); navigate("/dashboard"); }} className="text-muted-foreground hover:text-foreground">
                    Not now
                  </button>
                  <button onClick={handleSwitchAccount} className="text-muted-foreground hover:text-foreground">
                    Not you? Switch account
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "unverified" && (
          <div className="space-y-4">
            <EnvelopeSimple className="h-10 w-10 text-foreground mx-auto" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Verify your email</h1>
            <p className="text-sm text-muted-foreground">
              To keep your team secure we need to confirm <strong className="text-foreground">{user?.email}</strong> is yours. Open the verification email we sent you, then continue.
            </p>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
            <Button
              onClick={handleAccept}
              disabled={busy}
              className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium"
            >
              I've verified, continue
            </Button>
            <Button
              onClick={handleResendVerification}
              disabled={busy}
              variant="ghost"
              className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground"
            >
              Resend verification email
            </Button>
          </div>
        )}

        {status === "wrong-account" && (
          <div className="space-y-4">
            <XCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Different account</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button
              onClick={handleSwitchAccount}
              disabled={busy}
              className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium"
            >
              Sign out and switch account
            </Button>
            <Button
              onClick={() => { clearPendingInvite(); navigate("/dashboard"); }}
              variant="ghost"
              className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground"
            >
              Stay signed in
            </Button>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" weight="fill" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome aboard</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button
              onClick={() => navigate("/dashboard")}
              className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium"
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-10 w-10 text-red-400 mx-auto" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">This invite can't be used</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button
              onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}
              variant="outline"
              className="w-full h-11 rounded-xl text-sm font-medium"
            >
              {isAuthenticated ? "Go to Dashboard" : "Go to sign in"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteCard({ preview, inviter, roleLabel }: { preview: Preview; inviter: string; roleLabel: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-left">
      <p className="text-xs font-medium text-muted-foreground mb-3">Team invitation</p>
      <div className="flex items-center gap-3 mb-4">
        {preview.logoUrl ? (
          <img src={preview.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain bg-white" />
        ) : (
          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
            <UsersThree className="h-5 w-5 text-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">{preview.orgName || "Your team"}</h1>
          <p className="text-xs text-muted-foreground">on Dalefy</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Invited by</dt>
        <dd className="text-foreground font-medium truncate">{inviter}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="text-foreground font-medium">{roleLabel}</dd>
        <dt className="text-muted-foreground">Sent to</dt>
        <dd className="text-foreground font-medium truncate">{preview.maskedEmail || preview.email}</dd>
      </dl>
    </div>
  );
}
