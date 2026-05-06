import { useState, useEffect } from "react";
import { UserPlus, Mail, Copy, Check, X, Loader2 } from "lucide-react";
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

export function InviteTeamDialog({ open, onOpenChange }: InviteTeamDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent" | "viewer">("agent");
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    showToast("Invite created - copy the link below to share");

    setEmail("");
    fetchPendingInvites(currentOrg.id).then(setPendingInvites).catch(() => {});
  };

  const handleCopy = () => {
    if (!lastLink) return;
    navigator.clipboard.writeText(lastLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (invite: OrgInvite) => {
    await revokeInvite(invite.id);
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
    showToast("Invite revoked");
  };

  const handleClose = () => {
    setEmail("");
    setLastLink(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-lg bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-10 shadow-2xl">
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

          {/* Copy-paste link fallback */}
          {lastLink && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand">Share This Link</Label>
              <div className="flex gap-2 items-center p-3 bg-brand/5 rounded-xl border border-brand/10">
                <code className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{lastLink}</code>
                <Button variant="ghost" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Pending Invites</Label>
              {pendingInvites.map(invite => (
                <div key={invite.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-[#050505] rounded-xl border border-slate-200 dark:border-[#1f1f1f]">
                  <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                    <Mail className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{invite.email}</p>
                    <p className="text-[10px] text-slate-400 dark:text-[#666] uppercase">{invite.role}</p>
                  </div>
                  <button onClick={() => handleRevoke(invite)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
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
