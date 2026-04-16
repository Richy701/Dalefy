// Build an optimal image-search query from an event's title + location + type.
// Priority: explicit location → proper-noun phrases in title → keyword nouns → type fallback.

const STOP = new Set([
  "meet","at","for","to","the","a","an","and","of","with","in","on","from","by","our","your",
  "please","check","checkin","check-in","checkout","check-out","drop","off","pick","up","into",
  "via","am","pm","flight","hotel","dining","activity","day","arrive","arrival","depart","departure",
  "transfer","visit","tour","see","breakfast","lunch","dinner","welcome","farewell","group","free","time"
]);

const TYPE_HINT: Record<string, string> = {
  flight: "airport",
  hotel: "hotel resort",
  dining: "restaurant interior",
  activity: "landscape",
};

/** Extract runs of capitalized words (proper nouns) — usually POIs or place names. */
function properNounPhrases(text: string): string[] {
  // Keep letters, spaces, apostrophes; split on non-word boundaries
  const matches = text.match(/\b[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)*/g) || [];
  return matches
    .map(m => m.trim())
    .filter(m => m.length > 2 && !STOP.has(m.toLowerCase()));
}

/** Strip filler words, keep first few meaningful tokens. */
function keywordify(text: string, max = 3): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOP.has(w) && !/^\d+$/.test(w))
    .slice(0, max)
    .join(" ");
}

export function buildImageQuery(opts: {
  title?: string;
  location?: string;
  type?: string;
}): string {
  return buildImageQueryCandidates(opts)[0] || "travel";
}

/**
 * Ordered list of query candidates to try, most-specific → broadest.
 * Used for progressive fallback: if the first returns 0 results, try the next.
 */
export function buildImageQueryCandidates(opts: {
  title?: string;
  location?: string;
  type?: string;
}): string[] {
  const { title = "", location = "", type = "activity" } = opts;
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  // Location-based candidates
  if (location.trim()) {
    const first = location.split(",")[0].trim();
    push(first);
    // If location has multiple words, also push first two (e.g. "Stansted Airport Terminal" → "Stansted Airport")
    const parts = first.split(/\s+/);
    if (parts.length > 2) push(parts.slice(0, 2).join(" "));
    if (parts.length > 1) push(parts[0]);
  }

  // Proper-noun phrases from title (longest first)
  const nouns = properNounPhrases(title).sort((a, b) => b.length - a.length);
  for (const n of nouns) {
    push(n);
    // Also push first 2 words of longer phrases
    const parts = n.split(/\s+/);
    if (parts.length > 2) push(parts.slice(0, 2).join(" "));
  }

  // Keyword-stripped title (3 tokens, then 2, then 1)
  const kw3 = keywordify(title, 3);
  const kw2 = keywordify(title, 2);
  const kw1 = keywordify(title, 1);
  push(kw3); push(kw2); push(kw1);

  // Type-based fallback (always present, last resort)
  push(TYPE_HINT[type] || "travel");

  return out;
}
