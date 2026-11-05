/**
 * The flight number on an event. Imported flights often carry it only in the title: "QR847 — Phuket to Doha".
 * Two letters come first because a title can also name an aircraft ("A380 QR10"); codes with a digit (6E, U2) after.
 */
export function flightNumberOf(event: { type?: string; title?: string; flightNum?: string }): string {
  if (event.flightNum?.trim()) return event.flightNum.trim();
  if (event.type !== "flight") return "";
  const title = event.title ?? "";
  return title.match(/\b[A-Z]{2}[\s-]?\d{1,4}\b/)?.[0] ?? title.match(/\b(?:[A-Z][0-9]|[0-9][A-Z])[\s-]?\d{1,4}\b/)?.[0] ?? "";
}
