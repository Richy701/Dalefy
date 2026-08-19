import { useState, useEffect, useCallback } from "react";
import {
  UserPlus, Envelope, Check, X, SpinnerGap, Link, PaperPlaneTilt,
  WarningCircle, CheckCircle, Clock,
} from "@phosphor-icons/react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotifications } from "@/context/NotificationContext";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import {
  sendInvite, resendInvite, fetchPendingInvites, revokeInvite,
  type OrgInvite, type SendInviteResult,
} from "@/services/invites";

interface InviteTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function inviteUrl(token: string) {
  const base = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
  return `${base}/#/invite/${token}`;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", agent: "Agent", viewer: "Viewer" };
const ROLE_HINT: Record<string, string> = {
  viewer: "Can view trips and itineraries",
  agent: "Can build and edit trips and travelers",
  admin: "Can also manage the team and branding",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function expiryLabel(iso: string): { text: string; expired: boolean } {
  const d = daysUntil(iso);
  if (d <= 0) return { text: "Expired", expired: true };
  if (d === 1) return { text: "Expires tomorrow", expired: false };
  return { text: `Expires in ${d} days`, expired: false };
}

type LastInvite = { email: string; role: string; link: string; emailSent: boolean; emailError?: string; resent: boolean };

export function InviteTeamDialog({ open, onOpenChange }: InviteTeamDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent" | "viewer">("agent");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<LastInvite | null>(null);
  const [pendingInvites, setPendingInvites] = useState<OrgInvite[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const { showToast } = useNotifications();
  const { currentOrg, orgMembers } = useOrg();
  const { user } = useAuth();
  const { accentFg } = usePreferences();

  const loadPending = useCallback(async (orgId: string) => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const list = await fetchPendingInvites(orgId);
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setPendingInvites(list);
    } catch {
      setPendingError("Couldn't load pending invites");
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !currentOrg) return;
    const orgId = currentOrg.id;
    const t = setTimeout(() => { void loadPending(orgId); }, 0);
    return () => clearTimeout(t);
  }, [open, currentOrg, loadPending]);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const normalizedEmail = email.trim().toLowerCase();

  const alreadyMember = orgMembers.some(m => m.profile?.email?.toLowerCase() === normalizedEmail);

  const applyResult = (result: SendInviteResult, fallbackEmail: string, fallbackRole: string) => {
    setLastInvite({
      email: result.email || fallbackEmail,
      role: result.role || fallbackRole,
      link: result.acceptUrl || (result.inviteToken ? inviteUrl(result.inviteToken) : ""),
      emailSent: !!result.emailSent,
      emailError: result.emailError,
      resent: !!result.resent,
    });
  };

  const handleInvite = async () => {
    if (!currentOrg) { showToast("No organization selected"); return; }
    if (!isValidEmail(normalizedEmail)) { showToast("Please enter a valid email address"); return; }
    if (alreadyMember) { showToast("That person is already on your team"); return; }

    setSending(true);
    setLastInvite(null);
    try {
      const result = await sendInvite({ email: normalizedEmail, role, orgId: currentOrg.id, inviterName: user?.name || "" });
      if (!result.ok) { showToast(result.error || "Failed to send invite"); return; }
      applyResult(result, normalizedEmail, role);
      setEmail("");
      void loadPending(currentOrg.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (invite: OrgInvite) => {
    if (!currentOrg) return;
    setBusyId(invite.id);
    try {
      const result = await resendInvite({ inviteToken: invite.token, orgId: currentOrg.id, inviterName: user?.name || "" });
      if (!result.ok) { showToast(result.error || "Couldn't resend invite"); return; }
      applyResult(result, invite.email, invite.role);
      showToast(result.emailSent ? `Invite re-sent to ${invite.email}` : "Email couldn't be sent, share the link instead");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't resend invite");
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      showToast("Invite link copied");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast("Couldn't copy, select the link and copy it manually");
    }
  };

  const handleRevoke = async (invite: OrgInvite) => {
    if (confirmRevokeId !== invite.id) { setConfirmRevokeId(invite.id); return; }
    setBusyId(invite.id);
    try {
      await revokeInvite(invite.id);
      setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
      if (lastInvite?.email === invite.email) setLastInvite(null);
      showToast("Invite revoked");
    } catch {
      showToast("Couldn't revoke invite");
    } finally {
      setBusyId(null);
      setConfirmRevokeId(null);
    }
  };

  const handleClose = () => {
    setEmail("");
    setLastInvite(null);
    setCopiedId(null);
    setConfirmRevokeId(null);
    onOpenChange(false);
  };

  const orgName = currentOrg?.name || "your team";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent
        className="dialog-mobile-full content-start border-0 bg-slate-100 dark:bg-[#050505] p-0 gap-0 overflow-y-auto sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:h-auto sm:max-h-[85vh] sm:rounded-3xl sm:border sm:border-slate-200 sm:dark:border-[#1f1f1f]"
      >
        <DialogHeader className="px-5 pt-5 pb-0 text-left space-y-1">
          <DialogTitle className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">
            Invite to {orgName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-[#888]">
            They'll get a sign-in email from Dalefy, one click and they're in. Invites expire after 7 days.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-5">
          {/* Email + role input */}
          <div className="space-y-3">
            <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888]">Email Address</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-[#888]" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  autoComplete="off"
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="h-11 pl-10 bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-[#1f1f1f] rounded-xl font-semibold text-slate-900 dark:text-white text-sm"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={sending || !isValidEmail(normalizedEmail) || alreadyMember}
                className="h-11 rounded-xl bg-brand hover:opacity-90 px-4 shadow-lg shadow-brand/20 text-xs font-bold uppercase tracking-wider gap-2"
                style={{ color: accentFg }}
              >
                {sending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" weight="bold" />}
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
            {alreadyMember && (
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">That person is already on your team.</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {(["viewer", "agent", "admin"] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    role === r
                      ? "bg-brand"
                      : "bg-white dark:bg-[#0f0f0f] text-slate-500 dark:text-[#888] border border-slate-200 dark:border-[#1f1f1f]"
                  }`}
                  style={role === r ? { color: accentFg } : undefined}
                >
                  {r}
                </button>
              ))}
              <span className="text-[11px] text-slate-500 dark:text-[#777] ml-1">{ROLE_HINT[role]}</span>
            </div>
          </div>

          {/* Result card, shown after sending */}
          {lastInvite && (
            <div className="bg-white dark:bg-[#0f0f0f] rounded-2xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f]">
              <div className="px-4 py-4 flex items-start gap-3">
                {lastInvite.emailSent ? (
                  <CheckCircle className="h-5 w-5 text-brand shrink-0 mt-0.5" weight="fill" />
                ) : (
                  <WarningCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" weight="fill" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {lastInvite.emailSent
                      ? `${lastInvite.resent ? "Sign-in email re-sent" : "Sign-in email sent"} to ${lastInvite.email}`
                      : `Invite created for ${lastInvite.email}`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#888] mt-0.5">
                    {lastInvite.emailSent
                      ? `Tell them to look for "Sign in to Dalefy" from noreply@dalefy-d87c9.firebaseapp.com (check spam). They'll join as ${ROLE_LABEL[lastInvite.role] ?? lastInvite.role}. You can also share the link below.`
                      : `We couldn't send the email${lastInvite.emailError ? ` (${lastInvite.emailError})` : ""}. Share this link with them instead.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center gap-2 border-t border-slate-100 dark:border-[#1a1a1a] hover:bg-slate-50 dark:hover:bg-[#141414] transition-colors text-left"
                onClick={() => handleCopy("last", lastInvite.link)}
              >
                <Link className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-[#666]" />
                <span className="text-[10px] font-mono text-slate-500 dark:text-[#777] truncate flex-1">{lastInvite.link}</span>
                <span className={`text-[9px] font-bold uppercase tracking-[0.15em] shrink-0 ${copiedId === "last" ? "text-brand" : "text-slate-500 dark:text-[#888]"}`}>
                  {copiedId === "last" ? "Copied" : "Copy link"}
                </span>
              </button>
            </div>
          )}

          {/* Pending invites */}
          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">
              Pending{pendingInvites.length > 0 ? ` (${pendingInvites.length})` : ""}
            </Label>
            {pendingLoading && pendingInvites.length === 0 && (
              <div className="space-y-2">
                {[0, 1].map(i => <div key={i} className="h-[52px] rounded-xl bg-white/60 dark:bg-[#0f0f0f] animate-pulse" />)}
              </div>
            )}
            {pendingError && (
              <p className="text-xs text-red-500">{pendingError}</p>
            )}
            {!pendingLoading && !pendingError && pendingInvites.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-[#666] px-1">No pending invites.</p>
            )}
            {pendingInvites.map(invite => {
              const isCopied = copiedId === invite.id;
              const link = inviteUrl(invite.token);
              const exp = expiryLabel(invite.expiresAt);
              const isBusy = busyId === invite.id;
              const confirming = confirmRevokeId === invite.id;
              return (
                <div key={invite.id} className="flex items-center gap-2 bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-3 py-2.5">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${exp.expired ? "bg-amber-500/10 text-amber-500" : "bg-brand/10 text-brand"}`}>
                    {exp.expired ? <Clock className="h-3.5 w-3.5" /> : <Envelope className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{invite.email}</p>
                    <p className="text-[9px] text-slate-400 dark:text-[#666] uppercase tracking-wider truncate">
                      {ROLE_LABEL[invite.role] ?? invite.role}
                      {invite.inviterName ? ` · by ${invite.inviterName}` : ""}
                      {" · "}
                      <span className={exp.expired ? "text-amber-500" : undefined}>{exp.text}</span>
                    </p>
                  </div>
                  {confirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRevoke(invite)}
                        disabled={isBusy}
                        className="h-8 px-3 rounded-lg bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider shrink-0"
                      >
                        {isBusy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(null)}
                        className="h-8 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] shrink-0"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleResend(invite)}
                        disabled={isBusy}
                        className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 hover:bg-slate-200 dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
                        title={exp.expired ? "Expired, revoke and re-invite" : "Resend email"}
                        aria-label="Resend invite email"
                      >
                        {isBusy
                          ? <SpinnerGap className="h-3.5 w-3.5 animate-spin text-slate-500" />
                          : <PaperPlaneTilt className="h-3.5 w-3.5 text-slate-500 dark:text-[#888]" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(invite.id, link)}
                        className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 hover:bg-slate-200 dark:hover:bg-[#2a2a2a] transition-colors"
                        title="Copy invite link"
                        aria-label="Copy invite link"
                      >
                        {isCopied
                          ? <Check className="h-3.5 w-3.5 text-brand" weight="bold" />
                          : <Link className="h-3.5 w-3.5 text-slate-500 dark:text-[#888]" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(invite)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                        title="Revoke invite"
                        aria-label="Revoke invite"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Current members */}
          {orgMembers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">
                Team ({orgMembers.length})
              </Label>
              {orgMembers.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-white dark:hover:bg-[#0f0f0f] transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center font-black text-[10px] shrink-0" style={{ color: accentFg }}>
                    {m.profile?.initials || m.userId.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{m.profile?.name || "Team Member"}</p>
                    <p className="text-[9px] text-slate-400 dark:text-[#666] truncate">
                      <span className="uppercase tracking-wider">{ROLE_LABEL[m.role] ?? m.role}</span>
                      {m.profile?.email ? ` · ${m.profile.email}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-1 pb-1">
            <Button variant="ghost" onClick={handleClose} className="rounded-xl h-10 px-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
