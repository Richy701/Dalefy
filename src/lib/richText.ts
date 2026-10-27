/**
 * Finds the things in organiser text a traveller wants to act on: phone numbers, emails and web links.
 * Pure. Kept in step with mobile/shared/richText.ts, which also has the contact-list parser.
 */
export type TokenKind = "text" | "phone" | "email" | "url";
export interface Token {
  kind: TokenKind;
  /** The text as written */
  value: string;
  /** What to open for it; empty for plain text */
  href: string;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
// Candidates: an optional +country, then digits with the usual spacing, brackets, dots and dashes
const PHONE_RE = /\+?\(?\d[\d\s().-]{5,}\d/g;
// "Tel: 191", "Dial 999", "call 112": short emergency numbers only when the text says they are numbers
const SHORT_PHONE_RE = /\b(?:tel|phone|dial|call|emergency)\s*:?\s*(\d{3,6})\b/gi;

/** The number to dial: "+44 (0) 7814 486 890" -> "+447814486890" */
export function dialable(raw: string): string {
  const noTrunk = raw.replace(/\(0\)/g, "");
  const digits = noTrunk.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? "+" + digits.slice(1).replace(/\+/g, "") : digits;
}

function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  // Dates and date ranges: 2026-11-06, 06-11-2026, 8-10 Nov handled by the digit count, 1.2.2026
  if (/^\d{4}[-.]\d{1,2}[-.]\d{1,2}$/.test(candidate) || /^\d{1,2}[-.]\d{1,2}[-.]\d{2,4}$/.test(candidate)) return false;
  // Booking references and policy numbers tend to be long unbroken digit runs with no country code
  if (!candidate.startsWith("+") && !/[\s().-]/.test(candidate) && digits.length > 11) return false;
  return true;
}

function trimUrl(u: string): string {
  return u.replace(/[.,;:!?'")\]]+$/, "");
}

export function tokenize(text: string): Token[] {
  type Span = { start: number; end: number; kind: TokenKind; value: string; href: string };
  const spans: Span[] = [];
  const taken = (s: number, e: number) => spans.some(x => s < x.end && e > x.start);

  for (const m of text.matchAll(URL_RE)) {
    const value = trimUrl(m[0]);
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    spans.push({ start: m.index!, end: m.index! + value.length, kind: "url", value, href });
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    if (taken(m.index!, m.index! + m[0].length)) continue;
    spans.push({ start: m.index!, end: m.index! + m[0].length, kind: "email", value: m[0], href: `mailto:${m[0]}` });
  }
  for (const m of text.matchAll(PHONE_RE)) {
    // The greedy match runs into a following bracket ("+66 76 681 090 (08:00"): give the bracket back
    const value = m[0].replace(/\s*\([^)]*$/, "").replace(/[\s.-]+$/, "");
    const start = m.index!, end = start + value.length;
    if (taken(start, end) || !looksLikePhone(value)) continue;
    // Part of a time ("08:35-18:20") or a time range: skip when a colon sits right against it
    if (text[start - 1] === ":" || text[end] === ":") continue;
    spans.push({ start, end, kind: "phone", value, href: `tel:${dialable(value)}` });
  }
  for (const m of text.matchAll(SHORT_PHONE_RE)) {
    const num = m[1];
    const start = m.index! + m[0].lastIndexOf(num), end = start + num.length;
    if (taken(start, end)) continue;
    spans.push({ start, end, kind: "phone", value: num, href: `tel:${num}` });
  }

  spans.sort((a, b) => a.start - b.start);
  const out: Token[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) out.push({ kind: "text", value: text.slice(cursor, s.start), href: "" });
    out.push({ kind: s.kind, value: s.value, href: s.href });
    cursor = s.end;
  }
  if (cursor < text.length) out.push({ kind: "text", value: text.slice(cursor), href: "" });
  return out;
}
