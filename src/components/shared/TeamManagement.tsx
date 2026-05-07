import { useState, useEffect } from "react";
import { Crown, Shield, UserGear, Eye, CaretDown, UserMinus, ArrowsLeftRight, SpinnerGap, UserPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { getOrgMembersWithProfiles, updateMemberRole, removeMember, transferOwnership } from "@/services/orgMembers";
import type { OrgRole } from "@/types";

const ROLE_CONFIG: Record<OrgRole, { icon: typeof Crown; label: string; color: string }> = {
  owner: { icon: Crown, label: "Owner", color: "text-amber-500" },
  admin: { icon: Shield, label: "Admin", color: "text-brand" },
  agent: { icon: UserGear, label: "Agent", color: "text-slate-600 dark:text-[#aaa]" },
  viewer: { icon: Eye, label: "Viewer", color: "text-slate-400 dark:text-[#666]" },
};

interface Member {
  userId: string;
  role: OrgRole;
  joinedAt: string;
  name: string;
  email: string;
  initials: string;
}

interface TeamManagementProps {
  onInvite: () => void;
}

export function TeamManagement({ onInvite }: TeamManagementProps) {
  const { currentOrg, orgRole } = useOrg();
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState<string | null>(null);

  const isOwner = orgRole === "owner";
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    getOrgMembersWithProfiles(currentOrg.id)
      .then(setMembers)
      .catch(() => showToast("Failed to load team"))
      .finally(() => setLoading(false));
  }, [currentOrg]);

  const handleRoleChange = async (member: Member, newRole: OrgRole) => {
    if (!currentOrg) return;
    setActionLoading(member.userId);
    try {
      await updateMemberRole(member.userId, currentOrg.id, newRole);
      setMembers(prev => prev.map(m =>
        m.userId === member.userId ? { ...m, role: newRole } : m
      ));
      showToast(`${member.name} is now ${ROLE_CONFIG[newRole].label.toLowerCase()}`);
    } catch {
      showToast("Failed to update role");
    }
    setActionLoading(null);
  };

  const handleRemove = async (member: Member) => {
    if (!currentOrg) return;
    setActionLoading(member.userId);
    try {
      await removeMember(member.userId, currentOrg.id);
      setMembers(prev => prev.filter(m => m.userId !== member.userId));
      showToast(`${member.name} removed from team`);
    } catch {
      showToast("Failed to remove member");
    }
    setActionLoading(null);
    setConfirmRemove(null);
  };

  const handleTransfer = async (member: Member) => {
    if (!currentOrg || !user) return;
    setActionLoading(member.userId);
    try {
      await transferOwnership(user.id, member.userId, currentOrg.id);
      setMembers(prev => prev.map(m => {
        if (m.userId === member.userId) return { ...m, role: "owner" as OrgRole };
        if (m.userId === user.id) return { ...m, role: "admin" as OrgRole };
        return m;
      }));
      showToast(`Ownership transferred to ${member.name}`);
    } catch {
      showToast("Failed to transfer ownership");
    }
    setActionLoading(null);
    setConfirmTransfer(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <SpinnerGap className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map(member => {
        const config = ROLE_CONFIG[member.role];
        const RoleIcon = config.icon;
        const isSelf = member.userId === user?.id;
        const isTargetOwner = member.role === "owner";

        return (
          <div
            key={member.userId}
            className="flex items-center gap-3 p-3 bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-xl"
          >
            <div className="h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-black text-xs shrink-0">
              {member.initials}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {member.name}{isSelf ? " (you)" : ""}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-[#666] truncate">{member.email}</p>
            </div>

            {/* Role badge + dropdown */}
            {isAdmin && !isSelf && !isTargetOwner ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={!!actionLoading}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${config.color} bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] hover:border-brand/30 transition-colors`}
                  >
                    {actionLoading === member.userId ? (
                      <SpinnerGap className="h-3 w-3 animate-spin" />
                    ) : (
                      <RoleIcon className="h-3 w-3" />
                    )}
                    {config.label}
                    <CaretDown className="h-3 w-3 opacity-40" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px] bg-white dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl p-1">
                  {(["admin", "agent", "viewer"] as OrgRole[])
                    .filter(r => r !== member.role)
                    .map(r => {
                      const rc = ROLE_CONFIG[r];
                      const Icon = rc.icon;
                      return (
                        <DropdownMenuItem
                          key={r}
                          onClick={() => handleRoleChange(member, r)}
                          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                        >
                          <Icon className={`h-3.5 w-3.5 ${rc.color}`} />
                          {rc.label}
                        </DropdownMenuItem>
                      );
                    })}
                  <DropdownMenuSeparator className="bg-slate-100 dark:bg-[#1f1f1f]" />
                  {isOwner && (
                    <DropdownMenuItem
                      onClick={() => setConfirmTransfer(member.userId)}
                      className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer text-amber-500"
                    >
                      <ArrowsLeftRight className="h-3.5 w-3.5" /> Transfer Ownership
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setConfirmRemove(member.userId)}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer text-red-500 focus:text-red-500"
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                <RoleIcon className="h-3 w-3" />
                {config.label}
              </span>
            )}
          </div>
        );
      })}

      {/* Confirm remove dialog */}
      {confirmRemove && (() => {
        const member = members.find(m => m.userId === confirmRemove);
        if (!member) return null;
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl space-y-3">
            <p className="text-xs font-bold text-red-600 dark:text-red-400">
              Remove {member.name} from {currentOrg?.name}? They will lose access to all org trips.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => handleRemove(member)} className="h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-4">
                {actionLoading === member.userId ? "Removing..." : "Remove"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRemove(null)} className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                Cancel
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Confirm transfer dialog */}
      {confirmTransfer && (() => {
        const member = members.find(m => m.userId === confirmTransfer);
        if (!member) return null;
        return (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl space-y-3">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
              Transfer ownership to {member.name}? You will become an admin. This cannot be undone without their approval.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => handleTransfer(member)} className="h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider px-4">
                {actionLoading === member.userId ? "Transferring..." : "Transfer"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmTransfer(null)} className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                Cancel
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Invite button */}
      {isAdmin && (
        <button
          onClick={onInvite}
          className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-xl text-slate-400 dark:text-[#555] hover:border-brand hover:text-brand transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Invite Member</span>
        </button>
      )}
    </div>
  );
}
