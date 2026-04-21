import { useState } from "react";
import { UserPlus, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOCK_USERS } from "@/data/mock-users";
import { useNotifications } from "@/context/NotificationContext";

interface InviteTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteTeamDialog({ open, onOpenChange }: InviteTeamDialogProps) {
  const [email, setEmail] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const { showToast } = useNotifications();

  const handleInvite = () => {
    if (!email.trim()) return;
    setInvited(prev => [...prev, email.trim()]);
    setEmail("");
    showToast(`Invitation sent to ${email.trim()}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEmail(""); setInvited([]); } onOpenChange(o); }}>
      <DialogContent className="max-w-lg bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-10 shadow-2xl">
        <DialogHeader className="space-y-2 mb-6 text-left">
          <DialogTitle className="text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">INVITE PEOPLE</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-[#888888] font-medium uppercase text-xs tracking-[0.2em]">Invite people to join your team.</DialogDescription>
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
                  placeholder="team@dalefy.com"
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white"
                />
              </div>
              <Button onClick={handleInvite} className="h-12 px-6 rounded-2xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-lg shadow-brand/20">
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {invited.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand">Invited</Label>
              {invited.map((e, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-brand/5 rounded-xl border border-brand/10">
                  <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center"><Mail className="h-3.5 w-3.5" /></div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{e}</span>
                  <span className="text-[11px] font-bold text-brand uppercase tracking-wider ml-auto">Pending</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Your Team</Label>
            <div className="space-y-1">
              {MOCK_USERS.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors">
                  <div className="h-9 w-9 rounded-xl bg-brand text-black flex items-center justify-center font-black text-xs">{u.initials}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{u.name}</p>
                    <p className="text-xs text-slate-500 dark:text-[#888]">{u.role}</p>
                  </div>
                  <div className={`h-2 w-2 rounded-full ${u.status === "Active" ? "bg-emerald-400" : u.status === "Away" ? "bg-amber-400" : "bg-slate-400"}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-2xl h-12 px-8 font-bold text-slate-500 dark:text-[#888888]">CLOSE</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
