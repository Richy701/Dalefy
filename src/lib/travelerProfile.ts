import type { TravelerProfile } from "@/types";
import { parseTripDate } from "@/lib/dates";

export function ageOn(dateOfBirth: string | undefined, on = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = parseTripDate(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = on.getFullYear() - dob.getFullYear();
  const beforeBirthday = on.getMonth() < dob.getMonth() || (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Drop blank fields so an untouched form saves nothing */
export function cleanProfile(profile: TravelerProfile): TravelerProfile | undefined {
  const out: TravelerProfile = {};
  for (const [k, v] of Object.entries(profile) as Array<[keyof TravelerProfile, string | undefined]>) {
    const t = v?.trim();
    if (t) out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
}
