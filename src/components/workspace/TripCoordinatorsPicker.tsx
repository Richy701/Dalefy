import { useEffect, useMemo, useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { getOrgMembersWithProfiles } from "@/services/orgMembers";
import type { TripCoordinator } from "@/types";

export type TeamMember = { userId: string; name: string; email: string; avatar?: string; isCoordinator?: boolean };

/** The team, loaded when the dialog opens; null until it arrives. */
export function useTeamMembers(orgId: string | undefined, open: boolean) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets each time it opens; reviewed, not a render loop
    setMembers(null);
    setFailed(false);
    getOrgMembersWithProfiles(orgId)
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [open, orgId]);
  return { members, failed };
}

/** Who oversees this trip from home, picked per trip from the team. Never shown to travellers. */
export function TripCoordinatorsPicker({ members, failed, value, onChange }: {
  members: TeamMember[] | null;
  failed: boolean;
  value: TripCoordinator[];
  onChange: (value: TripCoordinator[]) => void;
}) {
  // Badged people first; anyone who has left stays listed while ticked, so they can be unticked
  const rows = useMemo(() => {
    const team = [...(members ?? [])].sort((a, b) => Number(!!b.isCoordinator) - Number(!!a.isCoordinator) || a.name.localeCompare(b.name));
    const left = value.filter(c => !team.some(m => m.userId === c.userId));
    return [...team.map(m => ({ userId: m.userId, name: m.name, detail: m.email })), ...left.map(c => ({ userId: c.userId, name: c.name, detail: "No longer on your team" }))];
  }, [members, value]);

  if (failed) return <p className="text-xs text-muted-foreground">Couldn't load your team, so coordinators stay as they are. Close this and try again to change them.</p>;
  if (!members) return <div className="flex justify-center py-5"><SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <ul className="max-h-44 md:max-h-[26rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
      {rows.map(row => {
        const id = `coordinator-${row.userId}`;
        const on = value.some(c => c.userId === row.userId);
        return (
          <li key={row.userId} className="flex items-center gap-3 px-3 py-2">
            <Checkbox
              id={id}
              checked={on}
              onCheckedChange={next => onChange(next === true ? [...value, { userId: row.userId, name: row.name }] : value.filter(c => c.userId !== row.userId))}
            />
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
              <span className="block truncate text-sm font-medium text-foreground">{row.name}</span>
              {row.detail && <span className="block truncate text-xs text-muted-foreground">{row.detail}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
