import { useState, useEffect } from "react";
import { UserPlus, Mail, Copy, Check, X, Loader2, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotifications } from "@/context/NotificationContext";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { sendInvite, fetchPendingInvites, revokeInvite, type OrgInvite } from "@/services/invites";

interface InviteTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function inviteUrl(token: string) {
  const base = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}`
    : "https://dalefy.vercel.app/";
  return `${base}#/invite/${token}`;
}

export function InviteTeamDialog({ open, onOpenChange }: InviteTeamDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent" | "viewer">("agent");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [lastLinkCopied, setLastLinkCopied] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<OrgInvite[]>([]);
  const { showToast } = useNotifications();
  const { currentOrg, orgMembers } = useOrg();
  const { user } = useAuth();

  useEffect(() => {
    if (open && currentOrg) {
      fetchPendingInvites(currentOrg.id).then(setPendingInvites).catch(() => {});
    }
  }, [open, currentOrg]);

  const handleInvite = async () => {
    if (!email.trim() || !currentOrg) return;
    setSending(true);
    setLastLink(null);
    setLastLinkCopied(false);

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

    setLastLink(result.acceptUrl || null);
    showToast("Invite created - copy the link to share");
    setEmail("");
    fetchPendingInvites(currentOrg.id).then(setPendingInvites).catch(() => {});
  };

  const handleCopyLink = (invite: OrgInvite) => {
    const url = inviteUrl(invite.token);
    navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    showToast("Invite link copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (invite: OrgInvite) => {
    await revokeInvite(invite.id);
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
    showToast("Invite revoked");
  };

  const handleCopyLastLink = () => {
    if (!lastLink) return;
    navigator.clipboard.writeText(lastLink);
    setLastLinkCopied(true);
    showToast("Invite link copied");
    setTimeout(() => setLastLinkCopied(false), 2000);
  };

  const handleClose = () => {
    setEmail("");
    setLastLink(null);
    setLastLinkCopied(false);
    setCopiedId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-lg bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-10 shadow-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-2 mb-6 text-left">
          <DialogTitle className="text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">INVITE PEOPLE</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-[#888888] font-medium uppercase text-xs tracking-[0.2em]">
            Invite team members to {currentOrg?.name || "your organization"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Email Address</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="team@company.com"
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={sending || !email.trim()}
                className="h-12 px-6 rounded-2xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-lg shadow-brand/20"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Role picker */}
          <div className="space-y-3">
            <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Role</Label>
            <div className="flex gap-2">
              {(["viewer", "agent", "admin"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
                    role === r
                      ? "bg-brand text-black"
                      : "bg-slate-100 dark:bg-[#050505] text-slate-600 dark:text-[#888] border border-slate-200 dark:border-[#1f1f1f]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-[#666]">
              {role === "admin" ? "Can manage team, trips, and settings" : role === "agent" ? "Can create and edit trips" : "Read-only access to trips"}
            </p>
          </div>

          {/* Just-created invite link */}
          {lastLink && (
            <div
              className="flex items-center gap-2 bg-white dark:bg-[#0a0a0a] border border-brand/20 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-brand/5 transition-colors"
              onClick={handleCopyLastLink}
            >
              <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                <Link2 className="h-3.5 w-3.5 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand">Invite Link</p>
                <p className="text-[10px] font-mono text-slate-500 dark:text-[#888] truncate">{lastLink}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                {lastLinkCopied
                  ? <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.5} />
                  : <Copy className="h-3.5 w-3.5 text-brand" />}
              </div>
            </div>
          )}

          {/* Pending invites with copy link */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">
                Pending Invites ({pendingInvites.length})
              </Label>
              <div className="space-y-2">
                {pendingInvites.map(invite => {
                  const isCopied = copiedId === invite.id;
                  return (
                    <div key={invite.id} className="bg-white dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-[#1f1f1f] overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{invite.email}</p>
                          <p className="text-[10px] text-slate-400 dark:text-[#666] uppercase tracking-wider">{invite.role}</p>
                        </div>
                        <button
                          onClick={() => handleCopyLink(invite)}
                          className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0 hover:bg-slate-200 dark:hover:bg-[#2a2a2a] transition-colors"
                          title="Copy invite link"
                        >
                          {isCopied
                            ? <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.5} />
                            : <Link2 className="h-3.5 w-3.5 text-slate-500 dark:text-[#888]" />}
                        </button>
                        <button
                          onClick={() => handleRevoke(invite)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title="Revoke invite"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Invite link row */}
                      <div
                        className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 dark:border-[#1a1a1a] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#111] transition-colors"
                        onClick={() => handleCopyLink(invite)}
                      >
                        <p className="text-[10px] font-mono text-slate-400 dark:text-[#555] truncate flex-1">
                          {inviteUrl(invite.token)}
                        </p>
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#555] shrink-0">
                          {isCopied ? "Copied" : "Copy"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current members */}
          {orgMembers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Team ({orgMembers.length})</Label>
              <div className="space-y-1">
                {orgMembers.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors">
                    <div className="h-9 w-9 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs">
                      {m.profile?.initials || m.userId.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{m.profile?.name || "Team Member"}</p>
                      <p className="text-[10px] text-slate-400 dark:text-[#666] uppercase tracking-wider">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button variant="ghost" onClick={handleClose} className="rounded-2xl h-12 px-8 font-bold text-slate-500 dark:text-[#888888]">CLOSE</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
