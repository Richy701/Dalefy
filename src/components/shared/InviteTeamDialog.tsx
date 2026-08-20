import { useState, useEffect, useCallback } from "react";
import {
  UserPlus, Envelope, Check, X, SpinnerGap, Link, PaperPlaneTilt,
  WarningCircle, CheckCircle, Clock, Crown, Key, UserGear, Eye, GearSix,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
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

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", agent: "Agent", viewer: "Viewer" };
const ROLE_HINT: Record<string, string> = {
  viewer: "Can view trips and itineraries, nothing else",
  agent: "Can build and edit trips and manage travelers",
  admin: "Everything an agent can, plus team and branding",
};
const ROLE_ICON: Record<string, typeof Crown> = { owner: Crown, admin: Key, agent: UserGear, viewer: Eye };
const ROLE_BADGE: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  admin: "bg-brand/10 text-brand border-brand/20",
  agent: "bg-slate-900/6 dark:bg-white/8 text-slate-700 dark:text-foreground/80 border-slate-900/10 dark:border-white/10",
  viewer: "bg-transparent text-slate-500 dark:text-muted-foreground border-slate-300 dark:border-border",
};

function RoleBadge({ role }: { role: string }) {
  const Icon = ROLE_ICON[role] ?? Eye;
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${ROLE_BADGE[role] ?? ROLE_BADGE.viewer}`}>
      <Icon className="h-3 w-3" weight="bold" />
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

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
  const navigate = useNavigate();

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
  const sectionLabel = "text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent
        className="dialog-mobile-full flex flex-col border-0 bg-slate-100 dark:bg-background p-0 gap-0 overflow-hidden sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-slate-200 sm:dark:border-border"
      >
        {/* Header */}
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 text-left space-y-1 border-b border-slate-200/80 dark:border-[#161616] shrink-0">
          <DialogTitle className="text-[22px] leading-none font-black tracking-tight text-slate-900 dark:text-white">
            Invite to {orgName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-muted-foreground">
            They get a one-click sign-in email from Dalefy. Invites expire after 7 days.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* ── Invite form ── */}
          <section className="px-5 sm:px-6 pt-5 pb-5 space-y-3 bg-white dark:bg-background border-b border-slate-200/80 dark:border-[#161616]">
            <Label htmlFor="invite-email" className={sectionLabel}>Email address</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Envelope className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  autoComplete="off"
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="h-10 pl-10 bg-slate-50 dark:bg-card border border-slate-200 dark:border-border focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 rounded-xl font-semibold text-slate-900 dark:text-white text-sm"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={sending || !isValidEmail(normalizedEmail) || alreadyMember}
                className="h-10 rounded-xl bg-brand hover:opacity-90 px-4 sm:px-5 shadow-lg shadow-brand/20 text-xs font-bold uppercase tracking-wider gap-2 disabled:opacity-40 disabled:shadow-none"
                style={{ color: accentFg }}
              >
                {sending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" weight="bold" />}
                <span className="hidden sm:inline">Send invite</span>
              </Button>
            </div>
            {alreadyMember && (
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">That person is already on your team.</p>
            )}

            {/* Role: segmented control */}
            <div className="space-y-2 pt-1">
              <div
                role="radiogroup"
                aria-label="Role"
                className="grid grid-cols-3 p-1 rounded-xl bg-slate-100 dark:bg-card border border-slate-200 dark:border-border"
              >
                {(["viewer", "agent", "admin"] as const).map(r => {
                  const Icon = ROLE_ICON[r];
                  const active = role === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setRole(r)}
                      className={`flex items-center justify-center gap-1.5 h-9 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                        active
                          ? "bg-white dark:bg-[#1c1c1c] text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 dark:text-muted-foreground hover:text-slate-800 dark:hover:text-foreground/80"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${active ? "text-brand" : ""}`} weight={active ? "fill" : "regular"} />
                      {ROLE_LABEL[r]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-muted-foreground px-1">{ROLE_HINT[role]}</p>
            </div>

            {/* Result card */}
            {lastInvite && (
              <div className={`rounded-xl overflow-hidden border ${lastInvite.emailSent ? "border-brand/30 bg-brand/6" : "border-amber-500/30 bg-amber-500/6"}`}>
                <div className="px-4 py-3.5 flex items-start gap-3">
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
                    <p className="text-xs text-slate-600 dark:text-muted-foreground mt-0.5 leading-relaxed">
                      {lastInvite.emailSent
                        ? <>Tell them to look for <strong className="font-semibold text-slate-800 dark:text-[#ddd]">"Sign in to Dalefy"</strong> (check spam). They'll join as {ROLE_LABEL[lastInvite.role] ?? lastInvite.role}. You can also share the link below.</>
                        : <>We couldn't send the email{lastInvite.emailError ? ` (${lastInvite.emailError})` : ""}. Share this link with them instead.</>}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 flex items-center gap-2 border-t border-black/6 dark:border-white/6 hover:bg-black/3 dark:hover:bg-white/3 transition-colors text-left"
                  onClick={() => handleCopy("last", lastInvite.link)}
                >
                  <Link className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-muted-foreground" />
                  <span className="text-[10px] font-mono text-slate-500 dark:text-muted-foreground truncate flex-1">{lastInvite.link}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-[0.15em] shrink-0 ${copiedId === "last" ? "text-brand" : "text-slate-500 dark:text-muted-foreground"}`}>
                    {copiedId === "last" ? "Copied" : "Copy link"}
                  </span>
                </button>
              </div>
            )}
          </section>

          {/* ── Pending ── */}
          <section className="px-5 sm:px-6 py-5 space-y-2.5 border-b border-slate-200/80 dark:border-[#161616]">
            <div className="flex items-center justify-between">
              <span className={sectionLabel}>Pending invites</span>
              {pendingInvites.length > 0 && (
                <span className="text-[10px] font-bold tabular-nums text-slate-500 dark:text-muted-foreground">{pendingInvites.length}</span>
              )}
            </div>
            {pendingLoading && pendingInvites.length === 0 && (
              <div className="space-y-2">
                {[0, 1].map(i => <div key={i} className="h-[54px] rounded-xl bg-white dark:bg-background animate-pulse" />)}
              </div>
            )}
            {pendingError && <p className="text-xs text-red-500">{pendingError}</p>}
            {!pendingLoading && !pendingError && pendingInvites.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-muted-foreground">Nobody's waiting to join. Invites you send will show up here.</p>
            )}
            {pendingInvites.map(invite => {
              const isCopied = copiedId === invite.id;
              const link = inviteUrl(invite.token);
              const exp = expiryLabel(invite.expiresAt);
              const isBusy = busyId === invite.id;
              const confirming = confirmRevokeId === invite.id;
              return (
                <div key={invite.id} className="flex items-center gap-3 bg-white dark:bg-background border border-slate-200 dark:border-border rounded-xl pl-3 pr-2 py-2.5">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${exp.expired ? "bg-amber-500/10 text-amber-500" : "bg-brand/10 text-brand"}`}>
                    {exp.expired ? <Clock className="h-4 w-4" weight="bold" /> : <Envelope className="h-4 w-4" weight="bold" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate leading-tight">{invite.email}</p>
                    <div className="flex items-center gap-1.5 mt-1 min-w-0">
                      <RoleBadge role={invite.role} />
                      <span className={`text-[10px] truncate ${exp.expired ? "text-amber-500 font-semibold" : "text-slate-500 dark:text-muted-foreground"}`}>
                        {exp.text}{invite.inviterName ? ` · by ${invite.inviterName}` : ""}
                      </span>
                    </div>
                  </div>
                  {confirming ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRevoke(invite)}
                        disabled={isBusy}
                        className="h-8 px-3 rounded-lg bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider"
                      >
                        {isBusy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(null)}
                        className="h-8 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-secondary"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton onClick={() => handleResend(invite)} disabled={isBusy} label={exp.expired ? "Expired, revoke and re-invite" : "Resend email"}>
                        {isBusy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : <PaperPlaneTilt className="h-3.5 w-3.5" />}
                      </IconButton>
                      <IconButton onClick={() => handleCopy(invite.id, link)} label="Copy invite link">
                        {isCopied ? <Check className="h-3.5 w-3.5 text-brand" weight="bold" /> : <Link className="h-3.5 w-3.5" />}
                      </IconButton>
                      <IconButton onClick={() => handleRevoke(invite)} label="Revoke invite" danger>
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* ── Team ── */}
          <section className="px-5 sm:px-6 py-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className={sectionLabel}>Team</span>
              <span className="text-[10px] font-bold tabular-nums text-slate-500 dark:text-muted-foreground">{orgMembers.length}</span>
            </div>
            {orgMembers.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-muted-foreground">Just you so far.</p>
            )}
            <div className="rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-border divide-y divide-slate-100 dark:divide-[#161616]">
              {orgMembers.map(m => {
                const isYou = m.userId === user?.id;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="h-9 w-9 rounded-lg bg-brand flex items-center justify-center font-black text-[11px] shrink-0" style={{ color: accentFg }}>
                      {m.profile?.initials || m.userId.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate leading-tight">
                        {m.profile?.name || "Team member"}
                        {isYou && <span className="ml-1.5 text-[10px] font-semibold text-slate-500 dark:text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-muted-foreground truncate mt-0.5">{m.profile?.email || "\u00a0"}</p>
                    </div>
                    <RoleBadge role={m.role} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-200/80 dark:border-[#161616] bg-slate-100 dark:bg-background flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { handleClose(); navigate("/settings"); }}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <GearSix className="h-3.5 w-3.5" /> Manage roles in Settings
          </button>
          <Button variant="ghost" onClick={handleClose} className="rounded-xl h-9 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IconButton({ children, onClick, label, disabled, danger }: {
  children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 ${
        danger
          ? "text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          : "text-slate-500 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-secondary hover:text-slate-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
