import type { User } from "@/types";
import { initialsFrom } from "@/lib/names";

export interface MatchResult {
  travelerIds: string[];
  travelers: Array<{ id: string; name: string; initials: string }>;
  newTravelers: User[];
  attendees: string;
}

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function firstLast(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return normalize(name);
  return `${parts[0]} ${parts[parts.length - 1]}`.toLowerCase();
}

export function matchOrCreateTravelers(
  parsedNames: string[],
  existingTravelers: User[],
): MatchResult {
  const travelerIds: string[] = [];
  const travelers: MatchResult["travelers"] = [];
  const newTravelers: User[] = [];
  const used = new Set<string>();

  for (const raw of parsedNames) {
    const norm = normalize(raw);
    if (!norm) continue;

    // 1. Exact match (case-insensitive)
    let match = existingTravelers.find(
      (u) => !used.has(u.id) && normalize(u.name) === norm,
    );

    // 2. First+Last match (strips middle names/initials)
    if (!match) {
      const fl = firstLast(raw);
      match = existingTravelers.find(
        (u) => !used.has(u.id) && firstLast(u.name) === fl,
      );
    }

    // 3. First-name only (if exactly one candidate)
    if (!match) {
      const first = norm.split(" ")[0];
      const candidates = existingTravelers.filter(
        (u) => !used.has(u.id) && normalize(u.name).split(" ")[0] === first,
      );
      if (candidates.length === 1) match = candidates[0];
    }

    if (match) {
      used.add(match.id);
      travelerIds.push(match.id);
      travelers.push({ id: match.id, name: match.name, initials: match.initials });
    } else {
      const id = `custom-${Date.now()}-${newTravelers.length}`;
      const name = raw.trim().split(/\s+/).map(
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
      ).join(" ");
      const user: User = {
        id,
        name,
        email: "",
        role: "Traveler",
        avatar: "",
        initials: initialsFrom(name),
        status: "Active",
      };
      newTravelers.push(user);
      travelerIds.push(id);
      travelers.push({ id, name, initials: user.initials });
    }
  }

  return {
    travelerIds,
    travelers,
    newTravelers,
    attendees: deriveAttendeesString(travelers),
  };
}

export function deriveAttendeesString(
  travelers: Array<{ name: string }>,
  max = 4,
): string {
  if (travelers.length === 0) return "";
  const shown = travelers.slice(0, max).map((t) => t.name);
  const rest = travelers.length - max;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

/** Strings that look like group/team labels rather than person names. */
const GROUP_LABEL = /\b(team|agents?|managers?|performers|staff|crew|group|department)\b/i;

export function extractNamesFromAttendeesString(attendees: string): string[] {
  if (!attendees || attendees === "Imported Group") return [];
  const cleaned = attendees.replace(/\s*\+\d+\s*more\s*$/i, "");
  return cleaned
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 2 && !GROUP_LABEL.test(n));
}
