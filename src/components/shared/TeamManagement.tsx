import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Shield, UserGear, Eye, CaretDown, UserMinus, ArrowsLeftRight, SpinnerGap, UserPlus, SignOut, Envelope } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { getOrgMembersWithProfiles, updateMemberRole, removeMember, transferOwnership } from "@/services/orgMembers";
import { fetchPendingInvites } from "@/services/invites";
import type { OrgRole } from "@/types";

const ROLE_CONFIG: Record<OrgRole, { icon: typeof Crown; label: string; color: string; blurb: string }> = {
  owner: { icon: Crown, label: "Owner", color: "text-amber-500", blurb: "Full control, including ownership transfer" },
  admin: { icon: Shield, label: "Admin", color: "text-brand", blurb: "Manages trips, travelers, branding and the team" },
  agent: { icon: UserGear, label: "Agent", color: "text-slate-600 dark:text-[#aaa]", blurb: "Builds and edits trips and manages travelers" },
  viewer: { icon: Eye, label: "Viewer", color: "text-slate-500 dark:text-[#888]", blurb: "Views trips and itineraries only" },
};

interface Member {
  userId: string;
  role: OrgRole;
  joinedAt: string;
  name: string;
  email: string;
  initials: string;
}

type PendingAction =
  | { kind: "role"; userId: string; role: OrgRole }
  | { kind: "remove"; userId: string }
  | { kind: "transfer"; userId: string }
  | { kind: "leave"; userId: string };

interface TeamManagementProps {
  onInvite: () => void;
}

function joinedLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Joined ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function TeamManagement({ onInvite }: TeamManagementProps) {
  const { currentOrg, orgRole, orgMembers, refreshOrg } = useOrg();
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState<number | null>(null);

  const isOwner = orgRole === "owner";
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  const load = useCallback(async (orgId: string, admin: boolean) => {
    const [list, invites] = await Promise.all([
      getOrgMembersWithProfiles(orgId),
      admin ? fetchPendingInvites(orgId).catch(() => null) : Promise.resolve(null),
    ]);
    return { list, inviteCount: invites ? invites.filter(i => new Date(i.expiresAt) > new Date()).length : null };
  }, []);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    const orgId = currentOrg.id;
    const t = setTimeout(() => {
      setLoading(true);
      load(orgId, isAdmin)
        .then(({ list, inviteCount }) => { if (!cancelled) { setMembers(list); setPendingInviteCount(inviteCount); } })
        .catch(() => { if (!cancelled) showToast("Failed to load team"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
    // orgMembers.length: refetch when the shared roster changes (e.g. an invite was accepted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, isAdmin, orgMembers.length, load]);

  const run = async (userId: string, fn: () => Promise<void>, okMsg: string, failMsg: string) => {
    setActionLoading(userId);
    try {
      await fn();
      showToast(okMsg);
    } catch {
      showToast(failMsg);
    } finally {
      setActionLoading(null);
      setPending(null);
    }
  };

  const confirmAction = async () => {
    if (!pending || !currentOrg || !user) return;
    const member = members.find(m => m.userId === pending.userId);
    if (!member) { setPending(null); return; }

    if (pending.kind === "role") {
      const role = pending.role;
      await run(member.userId, async () => {
        await updateMemberRole(member.userId, currentOrg.id, role);
        setMembers(prev => prev.map(m => m.userId === member.userId ? { ...m, role } : m));
      }, `${member.name} is now ${ROLE_CONFIG[role].label.toLowerCase()}`, "Failed to update role");
    } else if (pending.kind === "remove") {
      await run(member.userId, async () => {
        await removeMember(member.userId, currentOrg.id);
        setMembers(prev => prev.filter(m => m.userId !== member.userId));
      }, `${member.name} removed from team`, "Failed to remove member");
    } else if (pending.kind === "transfer") {
      await run(member.userId, async () => {
        await transferOwnership(user.id, member.userId, currentOrg.id);
        setMembers(prev => prev.map(m => {
          if (m.userId === member.userId) return { ...m, role: "owner" as OrgRole };
          if (m.userId === user.id) return { ...m, role: "admin" as OrgRole };
          return m;
        }));
        refreshOrg();
      }, `Ownership transferred to ${member.name}`, "Failed to transfer ownership");
    } else if (pending.kind === "leave") {
      await run(member.userId, async () => {
        await removeMember(user.id, currentOrg.id);
        refreshOrg();
        navigate("/dashboard");
      }, `You left ${currentOrg.name}`, "Couldn't leave the team");
    }
  };

  if (loading && currentOrg && members.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <SpinnerGap className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Pending invites summary (admins) */}
      {isAdmin && pendingInviteCount !== null && pendingInviteCount > 0 && (
        <button
          type="button"
          onClick={onInvite}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-brand/[0.06] border border-brand/20 hover:bg-brand/10 transition-colors text-left"
        >
          <div className="h-8 w-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
            <Envelope className="h-4 w-4" weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {pendingInviteCount} pending {pendingInviteCount === 1 ? "invite" : "invites"}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-[#888]">Waiting to be accepted. Tap to resend or revoke.</p>
          </div>
          <CaretDown className="h-3.5 w-3.5 -rotate-90 text-slate-500 dark:text-[#888]" />
        </button>
      )}

      {members.map(member => {
        const config = ROLE_CONFIG[member.role];
        const RoleIcon = config.icon;
        const isSelf = member.userId === user?.id;
        const isTargetOwner = member.role === "owner";
        const rowPending = pending?.userId === member.userId ? pending : null;
        const busy = actionLoading === member.userId;
        const canManageRow = isAdmin && !isSelf && !isTargetOwner;
        const canLeave = isSelf && !isTargetOwner;

        return (
          <div
            key={member.userId}
            className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-black text-xs shrink-0">
                {member.initials}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {member.name}
                  {isSelf && <span className="ml-1.5 font-semibold text-slate-500 dark:text-[#888]">(you)</span>}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-[#888] truncate">
                  {member.email}{member.joinedAt ? ` · ${joinedLabel(member.joinedAt)}` : ""}
                </p>
              </div>

              {canManageRow || canLeave ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!!actionLoading}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${config.color} bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] hover:border-brand/30 transition-colors cursor-pointer disabled:opacity-50`}
                  >
                    {busy ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <RoleIcon className="h-3 w-3" />}
                    {config.label}
                    <CaretDown className="h-3 w-3 opacity-40" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px] bg-white dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl p-1">
                    {canManageRow && (["admin", "agent", "viewer"] as OrgRole[])
                      .filter(r => r !== member.role)
                      .map(r => {
                        const rc = ROLE_CONFIG[r];
                        const Icon = rc.icon;
                        return (
                          <DropdownMenuItem
                            key={r}
                            onClick={() => setPending({ kind: "role", userId: member.userId, role: r })}
                            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                          >
                            <Icon className={`h-3.5 w-3.5 ${rc.color}`} />
                            Make {rc.label}
                          </DropdownMenuItem>
                        );
                      })}
                    {canManageRow && <DropdownMenuSeparator className="bg-slate-100 dark:bg-[#1f1f1f]" />}
                    {canManageRow && isOwner && (
                      <DropdownMenuItem
                        onClick={() => setPending({ kind: "transfer", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer text-amber-500"
                      >
                        <ArrowsLeftRight className="h-3.5 w-3.5" /> Transfer ownership
                      </DropdownMenuItem>
                    )}
                    {canManageRow && (
                      <DropdownMenuItem
                        onClick={() => setPending({ kind: "remove", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer text-red-500 focus:text-red-500"
                      >
                        <UserMinus className="h-3.5 w-3.5" /> Remove from team
                      </DropdownMenuItem>
                    )}
                    {canLeave && (
                      <DropdownMenuItem
                        onClick={() => setPending({ kind: "leave", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer text-red-500 focus:text-red-500"
                      >
                        <SignOut className="h-3.5 w-3.5" /> Leave team
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${config.color}`}
                  title={isSelf && isTargetOwner ? "Transfer ownership to someone else before leaving" : config.blurb}
                >
                  <RoleIcon className="h-3 w-3" />
                  {config.label}
                </span>
              )}
            </div>

            {/* Inline confirmation, right under the row it belongs to */}
            {rowPending && (
              <ConfirmStrip
                action={rowPending}
                member={member}
                orgName={currentOrg?.name ?? "this team"}
                busy={busy}
                onConfirm={confirmAction}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        );
      })}

      {members.length === 0 && !loading && (
        <p className="text-xs text-slate-500 dark:text-[#888] px-1">No team members found.</p>
      )}

      {/* Invite button */}
      {isAdmin && (
        <button
          onClick={onInvite}
          className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-xl text-slate-500 dark:text-[#888] hover:border-brand hover:text-brand transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Invite member</span>
        </button>
      )}
    </div>
  );
}

function ConfirmStrip({ action, member, orgName, busy, onConfirm, onCancel }: {
  action: PendingAction;
  member: Member;
  orgName: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  let tone: "neutral" | "warn" | "danger" = "neutral";
  let text = "";
  let label = "Confirm";
  if (action.kind === "role") {
    const rc = ROLE_CONFIG[action.role];
    text = `Change ${member.name} to ${rc.label}? ${rc.blurb}.`;
    label = `Make ${rc.label}`;
  } else if (action.kind === "remove") {
    tone = "danger";
    text = `Remove ${member.name} from ${orgName}? They lose access to all team trips immediately.`;
    label = "Remove";
  } else if (action.kind === "transfer") {
    tone = "warn";
    text = `Transfer ownership to ${member.name}? You become an admin. Only they can transfer it back.`;
    label = "Transfer";
  } else {
    tone = "danger";
    text = `Leave ${orgName}? You'll lose access to its trips until someone invites you again.`;
    label = "Leave team";
  }
  const tones = {
    neutral: { wrap: "bg-slate-50 dark:bg-[#111] border-slate-200 dark:border-[#1f1f1f]", text: "text-slate-700 dark:text-[#ccc]", btn: "bg-brand text-black hover:opacity-90" },
    warn: { wrap: "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30", text: "text-amber-700 dark:text-amber-400", btn: "bg-amber-500 hover:bg-amber-600 text-white" },
    danger: { wrap: "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30", text: "text-red-600 dark:text-red-400", btn: "bg-red-500 hover:bg-red-600 text-white" },
  }[tone];
  return (
    <div className={`px-3 py-3 border-t flex flex-col sm:flex-row sm:items-center gap-2 ${tones.wrap}`}>
      <p className={`text-xs font-semibold flex-1 ${tones.text}`}>{text}</p>
      <div className="flex gap-2 shrink-0">
        <Button onClick={onConfirm} disabled={busy} className={`h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider px-4 ${tones.btn}`}>
          {busy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : label}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy} className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider">
          Cancel
        </Button>
      </div>
    </div>
  );
}
