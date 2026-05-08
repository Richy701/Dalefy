import { useState, useEffect } from "react";
import { UserPlus, Envelope, Copy, Check, X, SpinnerGap, Link, Users } from "@phosphor-icons/react";
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
import { useBrand } from "@/context/BrandContext";
import { sendInvite, fetchPendingInvites, revokeInvite, type OrgInvite } from "@/services/invites";

interface InviteTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function inviteUrl(token: string) {
  const base = import.meta.env.VITE_APP_URL || "https://dalefy.vercel.app";
  return `${base}/#/invite/${token}`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "an Admin",
  agent: "an Agent",
  viewer: "a Viewer",
};

export function InviteTeamDialog({ open, onOpenChange }: InviteTeamDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent" | "viewer">("agent");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{ email: string; role: string; link: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<OrgInvite[]>([]);
  const { showToast } = useNotifications();
  const { currentOrg, orgMembers } = useOrg();
  const { user } = useAuth();
  const { resolvedAccent: accentColor, accentFg } = usePreferences();
  const { brand } = useBrand();

  useEffect(() => {
    if (open && currentOrg) {
      fetchPendingInvites(currentOrg.id).then(setPendingInvites).catch(() => {});
    }
  }, [open, currentOrg]);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleInvite = async () => {
    if (!email.trim() || !currentOrg) return;
    if (!isValidEmail(email.trim())) {
      showToast("Please enter a valid email address");
      return;
    }
    setSending(true);
    setLastInvite(null);

    const result = await sendInvite({
      email: email.trim(),
      role,
      orgId: currentOrg.id,
      orgName: currentOrg.name,
      inviterName: user?.name || "",
    });

    setSending(false);

    if (!result.ok) {
      showToast(result.error || "Failed to send invite");
      return;
    }

    setLastInvite({ email: email.trim(), role, link: result.acceptUrl || "" });
    setEmail("");
    fetchPendingInvites(currentOrg.id).then(setPendingInvites).catch(() => {});
  };

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(key);
    showToast("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (invite: OrgInvite) => {
    await revokeInvite(invite.id);
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
    showToast("Invite revoked");
  };

  const handleClose = () => {
    setEmail("");
    setLastInvite(null);
    setCopiedId(null);
    onOpenChange(false);
  };

  const orgName = currentOrg?.name || "your organization";
  const inviterName = user?.name || "A team member";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent
        className="dialog-mobile-full border-0 bg-slate-100 dark:bg-[#050505] p-0 gap-0 overflow-y-auto sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:h-auto sm:max-h-[85vh] sm:rounded-3xl sm:border sm:border-slate-200 sm:dark:border-[#1f1f1f]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Invite people to {orgName}</DialogTitle>
          <DialogDescription>Send team invitations</DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4">
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
                  placeholder="team@company.com"
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="h-11 pl-10 bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-[#1f1f1f] rounded-xl font-semibold text-slate-900 dark:text-white text-sm"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={sending || !isValidEmail(email.trim())}
                className="h-11 w-11 rounded-xl bg-brand hover:opacity-90 p-0 shadow-lg shadow-brand/20"
                style={{ color: accentFg }}
              >
                {sending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex gap-1.5">
              {(["viewer", "agent", "admin"] as const).map(r => (
                <button
                  key={r}
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
            </div>
          </div>

          {/* Email preview card — shown after creating an invite */}
          {lastInvite && (
            <div className="relative bg-white dark:bg-[#0f0f0f] rounded-2xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f] shadow-lg">
              {/* Accent bar */}
              <div
                className="px-4 py-2.5 flex items-center justify-center gap-2 border-b"
                style={{ backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` }}
              >
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt="" className="h-4 w-4 rounded-full object-contain shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor }}>
                    <Users className="h-2.5 w-2.5" style={{ color: accentFg }} weight="bold" />
                  </div>
                )}
                <span className="text-[9px] font-black uppercase tracking-[0.2em] truncate" style={{ color: accentColor }}>
                  {brand.name} · Team Invite
                </span>
              </div>

              {/* Email body preview */}
              <div className="px-5 py-5">
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white leading-tight">
                  You're Invited
                </h3>
                <p className="mt-2 text-xs text-slate-500 dark:text-[#888] leading-relaxed">
                  {inviterName} has invited <strong className="text-slate-900 dark:text-white">{lastInvite.email}</strong> to join <strong className="text-slate-900 dark:text-white">{orgName}</strong> as {ROLE_LABEL[lastInvite.role] || lastInvite.role}.
                </p>
                <div
                  className="mt-4 inline-block px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: accentColor, color: accentFg }}
                >
                  Accept Invitation
                </div>
                <p className="mt-4 text-[10px] text-slate-400 dark:text-[#555]">
                  This invitation expires in 7 days.
                </p>
              </div>

              {/* Perforation */}
              <div className="relative h-5">
                <div className="absolute left-4 right-4 top-1/2 border-t-[1.5px] border-dashed border-slate-200 dark:border-[#2a2a2a]" />
                <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 dark:bg-[#050505]" />
                <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 dark:bg-[#050505]" />
              </div>

              {/* Copy link row */}
              <div
                className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#111] transition-colors"
                onClick={() => handleCopy("last", lastInvite.link)}
              >
                <Link className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-[#666]" />
                <p className="text-[10px] font-mono text-slate-400 dark:text-[#666] truncate flex-1">
                  {lastInvite.link}
                </p>
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] shrink-0" style={{ color: copiedId === "last" ? accentColor : undefined }}>
                  {copiedId === "last" ? "Copied" : "Copy"}
                </span>
              </div>
            </div>
          )}

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">
                Pending ({pendingInvites.length})
              </Label>
              {pendingInvites.map(invite => {
                const isCopied = copiedId === invite.id;
                const link = inviteUrl(invite.token);
                return (
                  <div key={invite.id} className="flex items-center gap-2 bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-3 py-2.5">
                    <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                      <Envelope className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{invite.email}</p>
                      <p className="text-[9px] text-slate-400 dark:text-[#666] uppercase tracking-wider">{invite.role}</p>
                    </div>
                    <button
                      onClick={() => handleCopy(invite.id, link)}
                      className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 hover:bg-slate-200 dark:hover:bg-[#2a2a2a] transition-colors"
                      title="Copy invite link"
                    >
                      {isCopied
                        ? <Check className="h-3.5 w-3.5 text-brand" weight="bold" />
                        : <Link className="h-3.5 w-3.5 text-slate-500 dark:text-[#888]" />}
                    </button>
                    <button
                      onClick={() => handleRevoke(invite)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                      title="Revoke invite"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

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
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white">{m.profile?.name || "Team Member"}</p>
                    <p className="text-[9px] text-slate-400 dark:text-[#666] uppercase tracking-wider">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 pb-1">
            <Button variant="ghost" onClick={handleClose} className="rounded-xl h-10 px-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
