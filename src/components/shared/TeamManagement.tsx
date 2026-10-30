import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { Crown, Key, UserGear, Eye, CaretDown, UserMinus, ArrowsLeftRight, SpinnerGap, UserPlus, SignOut, Envelope, UserSwitch, EnvelopeSimple, LockKey, Suitcase } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { getOrgMembersWithProfiles, updateMemberRole, removeMember, transferOwnership } from "@/services/orgMembers";
import { fetchPendingInvites } from "@/services/invites";
import { fetchTripHolders, handOverTrips, emailTeammate, logTeamActivity, type TripHolder } from "@/services/teamAdmin";
import { useStaffPhoto } from "@/hooks/useStaffPhoto";
import type { OrgRole } from "@/types";

const ROLE_CONFIG: Record<OrgRole, { icon: typeof Crown; label: string; color: string; blurb: string }> = {
  owner: { icon: Crown, label: "Owner", color: "text-amber-500", blurb: "Full control, including ownership transfer" },
  admin: { icon: Key, label: "Admin", color: "text-brand", blurb: "Manages trips, travellers, branding and the team" },
  agent: { icon: UserGear, label: "Agent", color: "text-muted-foreground", blurb: "Builds and edits trips and manages travellers" },
  viewer: { icon: Eye, label: "Viewer", color: "text-muted-foreground", blurb: "Views trips and itineraries only" },
};

// "Sign in as" reaches only people whose role is below yours
const ROLE_RANK: Record<OrgRole, number> = { viewer: 0, agent: 1, admin: 2, owner: 3 };

interface Member {
  userId: string;
  role: OrgRole;
  joinedAt: string;
  name: string;
  email: string;
  initials: string;
  avatar?: string;
}

type PendingAction =
  | { kind: "role"; userId: string; role: OrgRole }
  | { kind: "remove"; userId: string }
  | { kind: "transfer"; userId: string }
  | { kind: "leave"; userId: string }
  | { kind: "signInAs"; userId: string }
  | { kind: "email"; userId: string; email: "sign-in" | "reset" }
  | { kind: "handover"; userId: string };

interface TeamManagementProps {
  onInvite: () => void;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const tripCount = (h: TripHolder) => `${h.trips} ${h.trips === 1 ? "trip" : "trips"}${h.privateTrips ? ` (${h.privateTrips} private)` : ""}`;

function joinedLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Joined ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function TeamManagement({ onInvite }: TeamManagementProps) {
  const { currentOrg, orgRole, orgMembers, refreshOrg } = useOrg();
  const { user, impersonation, signInAs } = useAuth();
  const { showToast } = useNotifications();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState<number | null>(null);
  // Who holds the team's trips (counted on the server, private ones too), and where a handover sends them
  const [holders, setHolders] = useState<TripHolder[]>([]);
  const [handTo, setHandTo] = useState("");

  // Staff travel too: someone without an account photo shows the headshot on their directory entry
  const staffPhoto = useStaffPhoto();
  const photoOf = (m: Member) => m.avatar || staffPhoto(m.email, m.name);

  const isOwner = orgRole === "owner";
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  const load = useCallback(async (orgId: string, admin: boolean) => {
    const [list, invites, tripHolders] = await Promise.all([
      getOrgMembersWithProfiles(orgId),
      admin ? fetchPendingInvites(orgId).catch(() => null) : Promise.resolve(null),
      // A "Sign in as" session can't move trips, so it doesn't ask
      admin && !impersonation ? fetchTripHolders(orgId).catch(() => []) : Promise.resolve([]),
    ]);
    return { list, tripHolders, inviteCount: invites ? invites.filter(i => new Date(i.expiresAt) > new Date()).length : null };
  }, [impersonation]);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    const orgId = currentOrg.id;
    const t = setTimeout(() => {
      setLoading(true);
      load(orgId, isAdmin)
        .then(({ list, tripHolders, inviteCount }) => { if (!cancelled) { setMembers(list); setHolders(tripHolders); setPendingInviteCount(inviteCount); } })
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

  const holding = (uid: string) => holders.find(h => h.uid === uid && h.trips > 0);
  // People who can be handed trips: owners, admins and agents other than the one giving them up
  const receivers = (fromUid: string) => members.filter(m => m.userId !== fromUid && m.role !== "viewer");
  // Someone who left still holds trips; they get a row of their own below the team
  const departed = holders.filter(h => !h.member && h.trips > 0);
  const actor = user ? { uid: user.id, name: impersonation ? `${impersonation.byName} as ${user.name}` : user.name } : null;

  const ask = (action: PendingAction) => {
    const fromUid = action.kind === "remove" || action.kind === "handover" ? action.userId : "";
    const choices = fromUid ? receivers(fromUid) : [];
    // Default to yourself when you can hold trips, so nothing is left stranded unless you choose it
    setHandTo(choices.find(m => m.userId === user?.id)?.userId ?? choices[0]?.userId ?? "");
    setPending(action);
  };

  const confirmAction = async () => {
    if (!pending || !currentOrg || !user || !actor) return;
    const gone = departed.find(h => h.uid === pending.userId);
    const member = members.find(m => m.userId === pending.userId)
      ?? (gone && { userId: gone.uid, role: "viewer" as OrgRole, joinedAt: "", name: gone.name, email: gone.email, initials: gone.name.slice(0, 2).toUpperCase() });
    if (!member) { setPending(null); return; }
    const receiver = members.find(m => m.userId === handTo);
    const held = holding(member.userId);
    const handOver = async () => {
      if (!held || !receiver || impersonation) return;
      await handOverTrips(currentOrg.id, member.userId, receiver.userId);
      setHolders(prev => prev.filter(h => h.uid !== member.userId).map(h => h.uid === receiver.userId
        ? { ...h, trips: h.trips + held.trips, privateTrips: h.privateTrips + held.privateTrips } : h)
        .concat(prev.some(h => h.uid === receiver.userId) ? [] : [{ uid: receiver.userId, name: receiver.name, email: receiver.email, member: true, trips: held.trips, privateTrips: held.privateTrips }]));
    };

    if (pending.kind === "role") {
      const role = pending.role;
      await run(member.userId, async () => {
        await updateMemberRole(member.userId, currentOrg.id, role);
        setMembers(prev => prev.map(m => m.userId === member.userId ? { ...m, role } : m));
        logTeamActivity(currentOrg.id, actor, "team", `Made ${member.name} ${ROLE_CONFIG[role].label.toLowerCase()}`);
      }, `${member.name} is now ${ROLE_CONFIG[role].label.toLowerCase()}`, "Failed to update role");
    } else if (pending.kind === "remove") {
      await run(member.userId, async () => {
        // Their trips move first, while they're still on the team to move them from
        await handOver();
        await removeMember(member.userId, currentOrg.id);
        setMembers(prev => prev.filter(m => m.userId !== member.userId));
        logTeamActivity(currentOrg.id, actor, "team", `Removed ${member.name} from the team`);
      }, held && receiver && !impersonation ? `${member.name} removed. Their trips went to ${receiver.name}` : `${member.name} removed from team`, "Failed to remove member");
    } else if (pending.kind === "handover") {
      await run(member.userId, handOver, receiver ? `${member.name}'s trips went to ${receiver.name}` : "Nothing to hand over", "Couldn't hand over the trips");
    } else if (pending.kind === "email") {
      const kind = pending.email;
      await run(member.userId, async () => {
        await emailTeammate(kind, member.email);
        logTeamActivity(currentOrg.id, actor, "email", kind === "sign-in" ? `Emailed ${member.name} a sign-in link` : `Emailed ${member.name} a password reset`);
      }, kind === "sign-in" ? `Sign-in link sent to ${member.email}` : `Password reset sent to ${member.email}`, "Couldn't send the email");
    } else if (pending.kind === "transfer") {
      await run(member.userId, async () => {
        await transferOwnership(user.id, member.userId, currentOrg.id);
        logTeamActivity(currentOrg.id, actor, "team", `Handed ownership of the team to ${member.name}`);
        setMembers(prev => prev.map(m => {
          if (m.userId === member.userId) return { ...m, role: "owner" as OrgRole };
          if (m.userId === user.id) return { ...m, role: "admin" as OrgRole };
          return m;
        }));
        refreshOrg();
      }, `Ownership transferred to ${member.name}`, "Failed to transfer ownership");
    } else if (pending.kind === "signInAs") {
      setActionLoading(member.userId);
      // On success the app starts over as them, so only a failure comes back here
      const error = await signInAs(currentOrg.id, member.userId);
      if (error) {
        showToast(error);
        setActionLoading(null);
        setPending(null);
      }
    } else if (pending.kind === "leave") {
      await run(member.userId, async () => {
        logTeamActivity(currentOrg.id, actor, "team", "Left the team");
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
    <div className="space-y-3 p-4 sm:p-5">
      {/* Pending invites summary (admins) */}
      {isAdmin && pendingInviteCount !== null && pendingInviteCount > 0 && (
        <button
          type="button"
          onClick={onInvite}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-brand/6 border border-brand/20 hover:bg-brand/10 transition-colors text-left"
        >
          <div className="h-8 w-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
            <Envelope className="h-4 w-4" weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground">
              {pendingInviteCount} pending {pendingInviteCount === 1 ? "invite" : "invites"}
            </p>
            <p className="text-[10px] text-muted-foreground">Waiting to be accepted. Tap to resend or revoke.</p>
          </div>
          <CaretDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
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
        const canLeave = isSelf && !isTargetOwner && !impersonation;
        const outranked = !!orgRole && ROLE_RANK[member.role] < ROLE_RANK[orgRole];
        const canSignInAs = canManageRow && !impersonation && outranked;
        const held = holding(member.userId);
        const canHandOver = canManageRow && !impersonation && outranked && !!held && receivers(member.userId).length > 0;

        return (
          <div
            key={member.userId}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10 shrink-0">
                {photoOf(member) && <AvatarImage src={photoOf(member)} alt="" />}
                <AvatarFallback className="text-xs font-semibold">{member.initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">
                  {member.name}
                  {isSelf && <span className="ml-1.5 font-semibold text-muted-foreground">(you)</span>}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {member.email}{member.joinedAt ? ` · ${joinedLabel(member.joinedAt)}` : ""}
                </p>
              </div>

              {canManageRow || canLeave ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!!actionLoading}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-mediumwider ${config.color} bg-secondary border border-border hover:border-brand/30 transition-colors cursor-pointer disabled:opacity-50`}
                  >
                    {busy ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <RoleIcon className="h-3 w-3" />}
                    {config.label}
                    <CaretDown className="h-3 w-3 opacity-40" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[230px] bg-card border border-border rounded-xl p-1">
                    {canManageRow && (["admin", "agent", "viewer"] as OrgRole[])
                      .filter(r => r !== member.role)
                      .map(r => {
                        const rc = ROLE_CONFIG[r];
                        const Icon = rc.icon;
                        return (
                          <DropdownMenuItem
                            key={r}
                            onClick={() => setPending({ kind: "role", userId: member.userId, role: r })}
                            className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer"
                          >
                            <Icon className={`h-3.5 w-3.5 ${rc.color}`} />
                            Make {rc.label}
                          </DropdownMenuItem>
                        );
                      })}
                    {canManageRow && <DropdownMenuSeparator className="bg-secondary" />}
                    {canSignInAs && (
                      <DropdownMenuItem
                        onClick={() => setPending({ kind: "signInAs", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer"
                      >
                        <UserSwitch className="h-3.5 w-3.5" /> Sign in as {firstName(member.name)}
                      </DropdownMenuItem>
                    )}
                    {canManageRow && member.email && (
                      <>
                        <DropdownMenuItem
                          onClick={() => setPending({ kind: "email", userId: member.userId, email: "sign-in" })}
                          className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer"
                        >
                          <EnvelopeSimple className="h-3.5 w-3.5" /> Email a sign-in link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setPending({ kind: "email", userId: member.userId, email: "reset" })}
                          className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer"
                        >
                          <LockKey className="h-3.5 w-3.5" /> Email a password reset
                        </DropdownMenuItem>
                      </>
                    )}
                    {canHandOver && held && (
                      <DropdownMenuItem
                        onClick={() => ask({ kind: "handover", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer"
                      >
                        <Suitcase className="h-3.5 w-3.5" /> Hand over {held.trips === 1 ? "their trip" : `their ${held.trips} trips`}
                      </DropdownMenuItem>
                    )}
                    {canManageRow && isOwner && (
                      <DropdownMenuItem
                        onClick={() => setPending({ kind: "transfer", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer text-amber-500"
                      >
                        <ArrowsLeftRight className="h-3.5 w-3.5" /> Transfer ownership
                      </DropdownMenuItem>
                    )}
                    {canManageRow && (
                      <DropdownMenuItem
                        onClick={() => ask({ kind: "remove", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer text-red-500 focus:text-red-500"
                      >
                        <UserMinus className="h-3.5 w-3.5" /> Remove from team
                      </DropdownMenuItem>
                    )}
                    {canLeave && (
                      <DropdownMenuItem
                        onClick={() => setPending({ kind: "leave", userId: member.userId })}
                        className="flex items-center gap-2 text-xs font-bold  rounded-lg cursor-pointer text-red-500 focus:text-red-500"
                      >
                        <SignOut className="h-3.5 w-3.5" /> Leave team
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-mediumwider ${config.color}`}
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
                held={impersonation ? undefined : held}
                picker={held && !impersonation && (rowPending.kind === "remove" || rowPending.kind === "handover")
                  ? <HandToPicker value={handTo} onChange={setHandTo} people={receivers(member.userId)} allowNone={rowPending.kind === "remove"} you={user?.id} />
                  : null}
                receiverName={members.find(m => m.userId === handTo)?.name}
                onConfirm={confirmAction}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        );
      })}

      {/* People who left still holding trips: without a handover their private trips are out of everyone's reach */}
      {isAdmin && departed.map(h => {
        const rowPending = pending?.userId === h.uid ? pending : null;
        const busy = actionLoading === h.uid;
        const person: Member = { userId: h.uid, role: "viewer", joinedAt: "", name: h.name, email: h.email, initials: h.name.slice(0, 2).toUpperCase() };
        return (
          <div key={h.uid} className="bg-card border border-dashed border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="text-xs font-semibold">{person.initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{h.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">Left the team. Still holds {tripCount(h)}</p>
              </div>
              {!rowPending && receivers(h.uid).length > 0 && (
                <Button variant="outline" disabled={!!actionLoading} onClick={() => ask({ kind: "handover", userId: h.uid })} className="h-8 rounded-lg text-[13px] gap-1.5 shrink-0">
                  <Suitcase className="h-3.5 w-3.5" /> Hand over
                </Button>
              )}
            </div>
            {rowPending && (
              <ConfirmStrip
                action={rowPending}
                member={person}
                orgName={currentOrg?.name ?? "this team"}
                busy={busy}
                held={h}
                picker={<HandToPicker value={handTo} onChange={setHandTo} people={receivers(h.uid)} allowNone={false} you={user?.id} />}
                receiverName={members.find(m => m.userId === handTo)?.name}
                onConfirm={confirmAction}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        );
      })}

      {members.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground px-1">No team members found.</p>
      )}

      {/* Invite button */}
      {isAdmin && (
        <button
          onClick={onInvite}
          className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-brand hover:text-brand transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          <span className="text-[13px] font-medium">Invite member</span>
        </button>
      )}
    </div>
  );
}

/** Who gets someone's trips. "Keep with them" strands their private trips, so it's offered only when removing */
const KEEP = "keep";

function HandToPicker({ value, onChange, people, allowNone, you }: {
  value: string;
  onChange: (uid: string) => void;
  people: Member[];
  allowNone: boolean;
  you?: string;
}) {
  const label = (uid: string) => {
    const m = people.find(p => p.userId === uid);
    return m ? `${m.name}${m.userId === you ? " (you)" : ""}` : "Keep with them";
  };
  return (
    <Select value={value || KEEP} onValueChange={v => onChange(typeof v === "string" && v !== KEEP ? v : "")}>
      <SelectTrigger className="h-8 w-full sm:w-56 text-xs" aria-label="Who gets their trips">
        <SelectValue>{(v: string) => label(v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {people.map(p => <SelectItem key={p.userId} value={p.userId} className="text-xs">{label(p.userId)}</SelectItem>)}
        {allowNone && <SelectItem value={KEEP} className="text-xs">Keep with them</SelectItem>}
      </SelectContent>
    </Select>
  );
}

function ConfirmStrip({ action, member, orgName, busy, held, picker, receiverName, onConfirm, onCancel }: {
  action: PendingAction;
  member: Member;
  orgName: string;
  busy: boolean;
  /** Their trips, when the action can move them */
  held?: TripHolder;
  picker?: React.ReactNode;
  receiverName?: string;
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
    if (held) text += receiverName
      ? ` Their ${tripCount(held)} go to:`
      : ` Their ${tripCount(held)} stay theirs${held.privateTrips ? ", and nobody else can open the private ones" : ""}. Send them to:`;
    label = "Remove";
  } else if (action.kind === "handover") {
    text = held
      ? `Give ${member.name}'s ${tripCount(held)} to someone else? They'll own them from now on${held.privateTrips ? ", and the private ones stay private to them" : ""}. Send them to:`
      : `${member.name} has no trips to hand over.`;
    label = "Hand over";
  } else if (action.kind === "email") {
    text = action.email === "sign-in"
      ? `Email ${member.name} a link that signs them straight in? It goes to ${member.email} and works once.`
      : `Email ${member.name} a link to set a new password? It goes to ${member.email}. Their current password keeps working until they change it.`;
    label = "Send";
  } else if (action.kind === "signInAs") {
    text = `Sign in as ${member.name} for up to an hour? You'll see ${orgName} exactly as they do. Trip history notes it was you, and their private trips stay hidden.`;
    label = `Sign in as ${firstName(member.name)}`;
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
    neutral: { wrap: "bg-secondary border-border", text: "text-foreground/80", btn: "bg-primary text-primary-foreground hover:opacity-90" },
    warn: { wrap: "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30", text: "text-amber-700 dark:text-amber-400", btn: "bg-amber-500 hover:bg-amber-600 text-white" },
    danger: { wrap: "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30", text: "text-red-600 dark:text-red-400", btn: "bg-red-500 hover:bg-red-600 text-white" },
  }[tone];
  return (
    <div className={`px-3 py-3 border-t flex flex-col sm:flex-row sm:items-center gap-2 ${tones.wrap}`}>
      <div className="flex-1 min-w-0 space-y-2">
        <p className={`text-xs font-semibold ${tones.text}`}>{text}</p>
        {picker}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button onClick={onConfirm} disabled={busy} className={`h-8 rounded-lg text-[13px] font-mediumwider px-4 ${tones.btn}`}>
          {busy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : label}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy} className="h-8 rounded-lg text-[13px] font-mediumwider">
          Cancel
        </Button>
      </div>
    </div>
  );
}
