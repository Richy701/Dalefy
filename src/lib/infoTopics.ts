import {
  IdentificationCard, ShieldCheck, FirstAid, Airplane, TShirt, Users, Info, Money, Suitcase, Handshake, ListChecks, Bed, Wallet, Globe, WarningCircle,
  type Icon,
} from "@phosphor-icons/react";

// Same rules as the phone's Trip info page (mobile/app/trip/info.tsx), so a topic carries the same icon on both

/** The icon at the head of a topic's card, from what its title is about */
export function topicIcon(title: string): { Icon: Icon; warn: boolean } {
  const t = title.toLowerCase();
  if (/important|please note|warning|notice/.test(t)) return { Icon: WarningCircle, warn: true };
  // Insurance names a 24-hour assistance line but is about cover, not a list of people to call
  if (/insurance|medical|health|vaccin/.test(t)) return { Icon: FirstAid, warn: false };
  // The phone's order: what the topic's layout is (costs, contacts, stays, to-dos), then its subject
  if (/cost|price|budget|payment|invoice|deposit|balance/.test(t)) return { Icon: Wallet, warn: false };
  if (/contact|emergency|24\/7|24-hour|24 hour|helpline|hotline|assistance|\bteam\b/.test(t)) return { Icon: Users, warn: false };
  const rooming = /rooming/.test(t);
  if (!rooming && /hotel|accommodation|room|resort|stay|lodg|camp/.test(t)) return { Icon: Bed, warn: false };
  if (!rooming && /outstanding|to do|todo|pending|action|checklist|remaining|to sort|tbc|tba/.test(t)) return { Icon: ListChecks, warn: false };
  if (/passport|visa|document|\bid\b/.test(t)) return { Icon: IdentificationCard, warn: false };
  if (/insurance|medical|health|vaccin/.test(t)) return { Icon: FirstAid, warn: false };
  if (/fcdo|advice|safety|security/.test(t)) return { Icon: ShieldCheck, warn: false };
  if (/flight|airport|airline/.test(t)) return { Icon: Airplane, warn: false };
  if (/dress|clothing|attire/.test(t)) return { Icon: TShirt, warn: false };
  if (/rooming|group|guest/.test(t)) return { Icon: Users, warn: false };
  if (/behaviour|behavior|etiquette|guideline|conduct|custom/.test(t)) return { Icon: Handshake, warn: false };
  if (/money|currency|cash|tipping/.test(t)) return { Icon: Money, warn: false };
  if (/packing|luggage|baggage/.test(t)) return { Icon: Suitcase, warn: false };
  if (/country|local|destination|culture/.test(t)) return { Icon: Globe, warn: false };
  return { Icon: Info, warn: false };
}

/** "UK passport holders: … Visa: …" written as one paragraph: two or more inline labels split it into labelled parts */
function splitInlineLabels(text: string): { label: string; body: string }[] | null {
  const re = /(?:^|(?<=[.!?])\s+)([A-Z][^.!?:\n]{1,40}?):(?!\/\/)(?!\d{2}\b)\s+/g;
  const hits = [...text.matchAll(re)];
  if (hits.length < 2) return null;
  const out: { label: string; body: string }[] = [];
  const lead = text.slice(0, hits[0].index).trim();
  if (lead) out.push({ label: "", body: lead });
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const body = text.slice((h.index ?? 0) + h[0].length, end).trim();
    if (body) out.push({ label: h[1].trim(), body });
  });
  return out.length >= 2 ? out : null;
}

/**
 * One fact per row, in the organiser's own words: the lines they wrote, else sentences.
 * A labelled note keeps its label on its first sentence.
 */
export function factRows(body: string): { label: string; text: string }[] {
  const lines = body.split(/\n+/).map(l => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines.map(text => ({ label: "", text }));
  const text = lines[0] ?? "";
  // "Hotel A (7 Nov); Hotel B (8–10 Nov); Hotel C" is a list written on one line; a single semicolon is prose
  if ((text.match(/;/g) ?? []).length >= 2) return text.split(/;\s*/).map(l => l.replace(/[.\s]+$/, "").trim()).filter(Boolean).map(t => ({ label: "", text: t }));
  return (splitInlineLabels(text) ?? [{ label: "", body: text }]).flatMap(part =>
    sentences(part.body).map((sentence, i) => ({ label: i === 0 ? part.label : "", text: sentence })));
}

const ABBREVIATION = /\b(?:Dr|Mr|Mrs|Ms|Mx|St|Mt|No|Nos|Tel|approx|incl|excl|vs|etc|e\.g|i\.e|a\.m|p\.m)\.$/i;

/** Sentences as written; "Dr. Smith" and "e.g. a hat" stay whole */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
    const last = out[out.length - 1];
    if (last && ABBREVIATION.test(last)) out[out.length - 1] = `${last} ${piece}`;
    else out.push(piece);
  }
  return out.map(s => s.trim()).filter(Boolean);
}

/**
 * Two columns that end at about the same height: each card goes to the shorter column so far, by a rough
 * height from its rows and text. Cards keep their order within each column.
 */
export function balanceColumns<T extends { title?: string; body?: string }>(items: T[]): [T[], T[]] {
  const cols: [T[], T[]] = [[], []];
  const height = [0, 0];
  for (const item of items) {
    const rows = item.body ? factRows(item.body) : [];
    const size = 2 + rows.reduce((n, r) => n + 1 + Math.ceil(r.text.length / 70) + (r.label ? 1 : 0), 0);
    const i = height[0] <= height[1] ? 0 : 1;
    cols[i].push(item);
    height[i] += size;
  }
  return cols;
}
