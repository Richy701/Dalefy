import { useCallback, useMemo } from "react";
import { useDirectoryTravelers } from "@/context/directory";
import { useTrips } from "@/context/TripsContext";
import { useOrg } from "@/context/OrgContext";
import { directoryPhoto } from "@/lib/staffPhoto";

/** A teammate's photo from the people they travel as: their directory entry, or the copy of them on a trip, as the Travellers page shows it */
export function useStaffPhoto() {
  const [directory] = useDirectoryTravelers();
  const { trips } = useTrips();
  const people = useMemo(() => [...directory, ...trips.flatMap(t => t.travelers ?? [])], [directory, trips]);
  return useCallback((email: string, name: string) => directoryPhoto(people, email, name), [people]);
}

/**
 * The photo of whoever made a change, for logs that keep only a name (trip history) or a uid: their account
 * picture, else their Travellers photo. "Richy as Maya Chen" shows the person who was really there.
 */
export function useTeamPhoto() {
  const { orgMembers } = useOrg();
  const staffPhoto = useStaffPhoto();
  return useMemo(() => {
    const byUid = new Map<string, string>();
    const byName = new Map<string, string>();
    const byFirst = new Map<string, string | null>();
    for (const m of orgMembers) {
      const p = m.profile;
      if (!p) continue;
      const photo = (p.avatar && /^https?:\/\//.test(p.avatar) ? p.avatar : "") || staffPhoto(p.email ?? "", p.name ?? "");
      if (!photo) continue;
      byUid.set(m.userId, photo);
      if (p.name) {
        byName.set(p.name.trim().toLowerCase(), photo);
        // A first name counts only when one teammate has it
        const first = p.name.trim().split(/\s+/)[0].toLowerCase();
        byFirst.set(first, byFirst.has(first) ? null : photo);
      }
    }
    return (name: string, uid?: string) => {
      const who = name.split(" as ")[0].trim().toLowerCase();
      return (uid && byUid.get(uid)) || byName.get(who) || (!who.includes(" ") && byFirst.get(who)) || "";
    };
  }, [orgMembers, staffPhoto]);
}
