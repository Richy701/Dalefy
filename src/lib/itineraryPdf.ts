/**
 * Vector itinerary PDF. Text stays selectable, pages break between rows, and
 * the layout mirrors the shared itinerary page: masthead, cover, overview,
 * flights, stays, day by day, good to know, documents.
 *
 * Keep this browser-optional: only `loadImage` touches the DOM, so the layout
 * can be exercised under Node for tests.
 */
import type { jsPDF as JsPdfType } from "jspdf";
import type { Trip, TravelEvent } from "@/types";

export interface PdfBrand {
  name: string;
  platformName: string;
  accentColor?: string | null;
}

export interface ItineraryPdfOptions {
  trip: Trip;
  brand: PdfBrand;
  /** Optional static map, 800x300 aspect, as a JPEG data URL from `loadImage`. */
  mapDataUrl?: string | null;
  /** Optional cover photo (already fetched and cropped as a JPEG data URL). */
  coverDataUrl?: string | null;
  /** Booking references are for the organiser's copy only. Private notes never appear. */
  includeReferences?: boolean;
}

/* ---------- palette (light document) ---------- */
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];
const PANEL: [number, number, number] = [247, 247, 249];
const CATEGORY = { flight: [47, 128, 237] as [number, number, number] };
const CATEGORY_LABEL: Record<TravelEvent["type"], string> = {
  flight: "Flight", hotel: "Stay", dining: "Meal", activity: "Activity", transfer: "Transfer",
};

/* ---------- page geometry (mm) ---------- */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 22;
const BOTTOM = PAGE_H - 20;
const DAY_MS = 86400000;

/* ---------- helpers ---------- */
function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date(NaN);
}
function fmt(value: string, opts: Intl.DateTimeFormatOptions): string {
  const d = parseDate(value);
  return isNaN(d.getTime()) ? value ?? "" : d.toLocaleDateString("en-GB", opts);
}
const fmtShort = (v: string) => fmt(v, { weekday: "short", day: "numeric", month: "short" });
const fmtLong = (v: string) => fmt(v, { weekday: "long", day: "numeric", month: "long" });
function dateRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} - ${end}`;
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const first = sameMonth ? fmt(start, { day: "numeric" }) : fmt(start, { day: "numeric", month: "long" });
  return `${first} - ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
}
function nights(start: string, end: string): number {
  const s = parseDate(start).getTime();
  const e = parseDate(end).getTime();
  return isNaN(s) || isNaN(e) ? 0 : Math.max(0, Math.round((e - s) / DAY_MS));
}
const isPlaceholderTime = (t?: string) => !t || /^tb[acd]$/i.test(t);
function routeOf(ev: TravelEvent): { from: string; to: string } {
  const parts = ev.location?.split(/\s+to\s+|→/i).map(s => s.trim());
  return { from: ev.depAirport || parts?.[0] || "", to: ev.arrAirport || parts?.[1] || "" };
}
const isCode = (s: string) => /^[A-Z]{3,4}$/.test(s);
/** "Chiang Mai International Airport (CNX)" -> { code: "CNX", name: "Chiang Mai International Airport" }. */
function endpoint(raw: string): { code: string | null; name: string } {
  const t = (raw ?? "").trim();
  if (isCode(t)) return { code: t, name: "" };
  const m = /^(.*?)\s*\(([A-Z]{3,4})\)\s*$/.exec(t);
  if (m) return { code: m[2], name: m[1].trim() };
  return { code: null, name: t };
}
function hexToRgb(hex?: string | null): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Core PDF fonts only cover WinAnsi; swap the few glyphs we use that fall outside it. */
function safe(text: string): string {
  return (text ?? "")
    .replace(/→/g, "to")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\xFF]/g, c => (c === "\n" ? c : ""));
}

type Weight = "normal" | "bold";

class Doc {
  y = TOP;
  page = 1;
  private pdf: JsPdfType;
  private trip: Trip;
  private brand: PdfBrand;
  constructor(pdf: JsPdfType, trip: Trip, brand: PdfBrand) {
    this.pdf = pdf;
    this.trip = trip;
    this.brand = brand;
  }

  /* text primitives */
  font(size: number, weight: Weight = "normal", color: [number, number, number] = INK) {
    this.pdf.setFont("helvetica", weight);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
  }
  text(str: string, x: number, y: number, opts: { size: number; weight?: Weight; color?: [number, number, number]; align?: "left" | "right" | "center" } ) {
    this.font(opts.size, opts.weight, opts.color);
    this.pdf.text(safe(str), x, y, { align: opts.align ?? "left", baseline: "alphabetic" });
  }
  wrap(str: string, size: number, width: number): string[] {
    this.font(size);
    return this.pdf.splitTextToSize(safe(str), width) as string[];
  }
  /** Draw wrapped lines; returns height used. */
  paragraph(str: string, x: number, y: number, width: number, opts: { size: number; weight?: Weight; color?: [number, number, number]; leading?: number }): number {
    const lines = this.wrap(str, opts.size, width);
    const leading = opts.leading ?? opts.size * 0.42;
    this.font(opts.size, opts.weight, opts.color);
    lines.forEach((line, i) => this.pdf.text(line, x, y + i * leading));
    return lines.length * leading;
  }
  paragraphHeight(str: string, size: number, width: number, leading = size * 0.42): number {
    return this.wrap(str, size, width).length * leading;
  }
  rule(y: number, x1 = MARGIN, x2 = PAGE_W - MARGIN, color: [number, number, number] = LINE) {
    this.pdf.setDrawColor(...color);
    this.pdf.setLineWidth(0.25);
    this.pdf.line(x1, y, x2, y);
  }
  vline(x: number, y1: number, y2: number) {
    this.pdf.setDrawColor(209, 213, 219);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(x, y1, x, y2);
  }
  panel(x: number, y: number, w: number, h: number) {
    this.pdf.setFillColor(...PANEL);
    this.pdf.setDrawColor(...LINE);
    this.pdf.setLineWidth(0.25);
    this.pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  }
  /** Small top-down plane silhouette pointing right, centred on (x, y). Vector, so no font tricks. */
  plane(x: number, y: number, scale = 1) {
    const pts: Array<[number, number]> = [
      [-2.8, -0.9], [-2.2, -0.9], [-1.6, -0.3], [-0.4, -0.3], [0.2, -2.2], [0.9, -2.2], [0.5, -0.3], [1.9, -0.3],
      [2.8, 0], [1.9, 0.3], [0.5, 0.3], [0.9, 2.2], [0.2, 2.2], [-0.4, 0.3], [-1.6, 0.3], [-2.2, 0.9], [-2.8, 0.9], [-2.4, 0],
    ];
    const segs: Array<[number, number]> = [];
    for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    this.pdf.setFillColor(...CATEGORY.flight);
    this.pdf.lines(segs, x + pts[0][0] * scale, y + pts[0][1] * scale, [scale, scale], "F", true);
  }
  /** Timeline marker: one quiet ring for every row, so the column reads as a timeline rather than a legend. */
  marker(x: number, y: number) {
    this.pdf.setFillColor(255, 255, 255);
    this.pdf.setDrawColor(156, 163, 175);
    this.pdf.setLineWidth(0.4);
    this.pdf.circle(x, y, 1.4, "FD");
  }
  /* page flow */
  ensure(height: number) {
    if (this.y + height > BOTTOM) this.newPage();
  }
  newPage() {
    this.pdf.addPage();
    this.page += 1;
    this.y = TOP;
    this.runningHeader();
  }
  runningHeader() {
    this.text(this.trip.name, MARGIN, 13, { size: 8, color: MUTED });
    this.text(this.brand.name, PAGE_W - MARGIN, 13, { size: 8, color: MUTED, align: "right" });
    this.rule(16);
  }
  footers() {
    const total = this.pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.pdf.setPage(p);
      this.rule(PAGE_H - 14);
      this.text(`Prepared by ${this.brand.name}`, MARGIN, PAGE_H - 9, { size: 7.5, color: MUTED });
      this.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 9, { size: 7.5, color: MUTED, align: "right" });
    }
  }
  sectionTitle(title: string) {
    this.ensure(22);
    this.y += 4;
    this.text(title, MARGIN, this.y + 4.5, { size: 13, weight: "bold" });
    this.y += 10;
  }
}

/* ---------- sections ---------- */

function cover(d: Doc, pdf: JsPdfType, trip: Trip, brand: PdfBrand, coverDataUrl?: string | null, mapDataUrl?: string | null) {
  // Masthead
  d.text(brand.name, MARGIN, 18, { size: 10.5, weight: "bold" });
  d.text("Travel itinerary", PAGE_W - MARGIN, 18, { size: 8.5, color: MUTED, align: "right" });
  const accent = hexToRgb(brand.accentColor);
  d.rule(22, MARGIN, PAGE_W - MARGIN, accent ?? LINE);
  d.y = 30;

  // Cover photo, 16:7
  if (coverDataUrl) {
    const h = CONTENT_W * 7 / 16;
    try {
      pdf.addImage(coverDataUrl, "JPEG", MARGIN, d.y, CONTENT_W, h);
      d.y += h + 10;
    } catch { /* skip photo */ }
  }

  // Title
  const titleLines = d.wrap(trip.name, 26, CONTENT_W);
  titleLines.forEach((line, i) => d.text(line, MARGIN, d.y + 8 + i * 11, { size: 26, weight: "bold" }));
  d.y += 8 + titleLines.length * 11;
  d.text([dateRange(trip.start, trip.end), trip.destination].filter(Boolean).join("  ·  "), MARGIN, d.y + 2, { size: 11, color: MUTED });
  d.y += 9;

  // Overview strip
  const n = nights(trip.start, trip.end);
  const cells: Array<[string, string]> = [
    ["Departure", fmtShort(trip.start)],
    ["Return", fmtShort(trip.end)],
    ["Duration", `${n} night${n === 1 ? "" : "s"}`],
    ["Travellers", trip.paxCount || (trip.travelers?.length ? String(trip.travelers.length) : trip.attendees || "")],
  ].filter(([, v]) => v) as Array<[string, string]>;
  const cellW = CONTENT_W / cells.length;
  d.rule(d.y);
  cells.forEach(([label, value], i) => {
    const x = MARGIN + i * cellW;
    d.text(label, x, d.y + 6, { size: 8, color: MUTED });
    d.text(value, x, d.y + 11.5, { size: 10.5, weight: "bold" });
  });
  d.y += 16;
  d.rule(d.y);
  d.y += 8;

  // Organiser
  const org = trip.organizer;
  if (org?.name?.trim()) {
    const lines = [
      [org.role, org.company].filter(Boolean).join(", "),
      [org.phone, org.email].filter(Boolean).join("   "),
    ].filter(Boolean);
    const h = 12 + lines.length * 4.5;
    d.panel(MARGIN, d.y, CONTENT_W, h);
    d.text("Your travel organiser", MARGIN + 5, d.y + 5.5, { size: 8, color: MUTED });
    d.text(org.name, MARGIN + 5, d.y + 10.5, { size: 10.5, weight: "bold" });
    lines.forEach((line, i) => d.text(line, MARGIN + 5, d.y + 15 + i * 4.5, { size: 8.5, color: MUTED }));
    d.y += h + 8;
  }

  // Route map, if there is room; otherwise it goes on the next page
  if (mapDataUrl) {
    const h = CONTENT_W * 300 / 800;
    if (d.y + h + 8 > BOTTOM) d.newPage();
    try {
      pdf.addImage(mapDataUrl, "JPEG", MARGIN, d.y, CONTENT_W, h);
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.25);
      pdf.rect(MARGIN, d.y, CONTENT_W, h);
      d.y += h + 6;
    } catch { /* skip map */ }
  }
}

function flights(d: Doc, evs: TravelEvent[], includeRefs: boolean) {
  if (evs.length === 0) return;
  d.sectionTitle("Flights");
  const x = MARGIN + 5;
  const right = PAGE_W - MARGIN - 5;
  const mid = PAGE_W / 2;
  const colW = mid - 26 - x;

  for (const ev of evs) {
    const { from, to } = routeOf(ev);
    const dep = endpoint(from);
    const arr = endpoint(to);
    const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title;
    const extras = [
      ev.gate ? `Gate ${ev.gate}` : "",
      ev.aircraft ?? "",
      includeRefs && ev.confNumber ? `Ref ${ev.confNumber}` : "",
      ev.status ?? "",
    ].filter(Boolean).join("   ·   ");

    // Each endpoint: a big code (or the wrapped name when there is no code), time, small name, terminal.
    const side = (e: { code: string | null; name: string }, time: string, terminal?: string) => {
      const nameLines = e.code ? (e.name ? d.wrap(e.name, 7.5, colW).slice(0, 1) : []) : e.name ? d.wrap(e.name, 11, colW).slice(0, 2) : [];
      const headH = e.code ? 6.5 : 4.5 + Math.max(0, nameLines.length - 1) * 4.6;
      const h = headH + 5.5 + (e.code && nameLines.length ? 4 : 0) + (terminal ? 4 : 0);
      return { nameLines, headH, h, time, terminal };
    };
    const depTime = isPlaceholderTime(ev.time) ? "" : ev.time;
    const arrTime = isPlaceholderTime(ev.endTime) ? "" : `${ev.endTime}${ev.endDate && ev.endDate !== ev.date ? " (+1)" : ""}`;
    const L = side(dep, depTime, ev.terminal);
    const R = side(arr, arrTime, ev.arrTerminal);
    const bodyH = Math.max(L.h, R.h);
    const h = 11 + bodyH + 4 + (extras ? 5 : 0);
    d.ensure(h + 4);

    d.panel(MARGIN, d.y, CONTENT_W, h);
    d.text(carrier, x, d.y + 6.5, { size: 9.5, weight: "bold" });
    d.text(fmtShort(ev.date), right, d.y + 6.5, { size: 8.5, color: MUTED, align: "right" });

    const y0 = d.y + 11;
    const drawSide = (S: ReturnType<typeof side>, e: { code: string | null; name: string }, sx: number, align: "left" | "right") => {
      let yy: number;
      if (e.code) {
        d.text(e.code, sx, y0 + 6.5, { size: 18, weight: "bold", align });
        yy = y0 + 6.5;
      } else {
        S.nameLines.forEach((line, i) => d.text(line, sx, y0 + 4.5 + i * 4.6, { size: 11, weight: "bold", align }));
        yy = y0 + 4.5 + Math.max(0, S.nameLines.length - 1) * 4.6;
      }
      if (S.time) d.text(S.time, sx, yy + 5.5, { size: 9, align });
      let next = yy + 5.5;
      if (e.code && S.nameLines.length) { d.text(S.nameLines[0], sx, next + 4, { size: 7.5, color: MUTED, align }); next += 4; }
      if (S.terminal) d.text(`Terminal ${S.terminal.replace(/^T/i, "")}`, sx, next + 4, { size: 7.5, color: MUTED, align });
    };
    drawSide(L, dep, x, "left");
    drawSide(R, arr, right, "right");

    // Route line with a plane in the middle and the duration underneath
    const lineY = y0 + 4.5;
    d.rule(lineY, mid - 24, mid - 5);
    d.rule(lineY, mid + 5, mid + 24);
    d.plane(mid, lineY, 0.9);
    if (ev.duration) d.text(ev.duration, mid, lineY + 6.5, { size: 7.5, color: MUTED, align: "center" });

    let bottom = y0 + bodyH + 2;
    if (extras) {
      d.rule(bottom, x, right);
      d.text(extras, x, bottom + 4, { size: 7.5, color: MUTED });
      bottom += 5;
    }
    d.y += h + 4;
  }
}

function stays(d: Doc, evs: TravelEvent[], tripEnd: string, includeRefs: boolean) {
  if (evs.length === 0) return;
  d.sectionTitle("Where you're staying");
  evs.forEach((ev, i) => {
    const checkout = ev.endDate || evs[i + 1]?.date || tripEnd;
    const n = nights(ev.date, checkout);
    const checkin = ev.checkin || (isPlaceholderTime(ev.time) ? "" : ev.time);
    const meta = [
      n > 0 ? `${n} night${n === 1 ? "" : "s"}` : "",
      includeRefs && ev.confNumber ? `Ref ${ev.confNumber}` : "",
      ev.status ?? "",
    ].filter(Boolean).join("   ·   ");
    const h = 30 + (meta ? 5 : 0);
    d.ensure(h + 4);

    d.panel(MARGIN, d.y, CONTENT_W, h);
    const x = MARGIN + 5;
    const right = PAGE_W - MARGIN - 5;
    d.text(ev.title, x, d.y + 7, { size: 10.5, weight: "bold" });
    if (ev.location) d.text(ev.location, x, d.y + 11.5, { size: 8.5, color: MUTED });
    if (ev.roomType) d.text(ev.roomType, x, d.y + 16.5, { size: 8.5 });

    const rowY = d.y + 21;
    d.rule(rowY - 1.5, x, right);
    d.text("Check in", x, rowY + 3, { size: 7.5, color: MUTED });
    d.text(`${fmtShort(ev.date)}${checkin ? `  ·  ${checkin}` : ""}`, x, rowY + 7, { size: 9 });
    const half = MARGIN + CONTENT_W / 2;
    d.text("Check out", half, rowY + 3, { size: 7.5, color: MUTED });
    d.text(`${fmtShort(checkout)}${ev.checkout ? `  ·  ${ev.checkout}` : ""}`, half, rowY + 7, { size: 9 });
    if (meta) d.text(meta, x, rowY + 12, { size: 7.5, color: MUTED });
    d.y += h + 4;
  });
}

function eventMeta(ev: TravelEvent): string {
  if (ev.type === "flight") {
    const { from, to } = routeOf(ev);
    const dep = endpoint(from);
    const arr = endpoint(to);
    const route = from && to ? `${dep.code ?? dep.name} to ${arr.code ?? arr.name}` : ev.location;
    const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ");
    const titled = ev.flightNum && ev.title.includes(ev.flightNum);
    return [titled ? "" : carrier, route, ev.duration].filter(Boolean).join("  ·  ");
  }
  if (ev.type === "hotel") return [ev.location, ev.roomType].filter(Boolean).join("  ·  ");
  const until = ev.endTime && !isPlaceholderTime(ev.endTime) ? `until ${ev.endTime}` : "";
  return [ev.location, ev.duration, until].filter(Boolean).join("  ·  ");
}

function dayByDay(d: Doc, sorted: TravelEvent[], tripStart: string) {
  if (sorted.length === 0) return;
  const days = new Map<string, TravelEvent[]>();
  for (const ev of sorted) {
    if (!days.has(ev.date)) days.set(ev.date, []);
    days.get(ev.date)!.push(ev);
  }
  d.sectionTitle("Day by day");

  const timeX = MARGIN;
  const dotX = MARGIN + 23;
  const textX = MARGIN + 28;
  const textW = CONTENT_W - 28;

  for (const [date, evs] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dayNo = Math.round((parseDate(date).getTime() - parseDate(tripStart).getTime()) / DAY_MS) + 1;
    // Keep the day header with at least its first row
    d.ensure(36);
    d.y += 2;
    if (dayNo >= 1) d.text(`Day ${dayNo}`, MARGIN, d.y + 4, { size: 8.5, color: MUTED });
    d.text(fmtLong(date), MARGIN + (dayNo >= 1 ? 16 : 0), d.y + 4, { size: 10.5, weight: "bold" });
    d.y += 7;
    d.rule(d.y);
    d.y += 6;

    evs.forEach((ev, i) => {
      const meta = eventMeta(ev);
      const description = ev.description ?? "";
      const titleH = d.paragraphHeight(ev.title, 9.5, textW - 22, 4.2);
      const metaH = meta ? d.paragraphHeight(meta, 8.5, textW, 3.9) : 0;
      const descH = description ? d.paragraphHeight(description, 8.5, textW, 3.9) + 1 : 0;
      const h = titleH + metaH + descH + 3;
      d.ensure(h + 2);

      if (!isPlaceholderTime(ev.time)) d.text(ev.time, timeX, d.y + 3.2, { size: 9, weight: "bold" });
      d.marker(dotX, d.y + 2);

      let y = d.y + 3.2;
      const label = ev.type === "hotel" ? "Check in" : ev.type === "activity" ? "" : CATEGORY_LABEL[ev.type];
      const used = d.paragraph(ev.title, textX, y, textW - 22, { size: 9.5, weight: "bold", leading: 4.2 });
      if (label) d.text(label, PAGE_W - MARGIN, y, { size: 7.5, color: MUTED, align: "right" });
      y += used;
      if (meta) y += d.paragraph(meta, textX, y, textW, { size: 8.5, color: MUTED, leading: 3.9 });
      if (description) y += 1 + d.paragraph(description, textX, y, textW, { size: 8.5, leading: 3.9 });

      // connector to the next row
      if (i < evs.length - 1) d.vline(dotX, d.y + 4.5, d.y + h + 1.5);
      d.y += h + 2;
    });
    d.y += 4;
  }
}

function goodToKnow(d: Doc, trip: Trip) {
  const items = (trip.info ?? []).filter(i => !i.leaderOnly);
  if (items.length === 0) return;
  d.sectionTitle("Good to know");
  for (const item of items) {
    const bodyH = item.body ? d.paragraphHeight(item.body, 8.5, CONTENT_W, 3.9) : 0;
    const extra = [
      item.deadline ? `Due ${fmtShort(item.deadline)}` : "",
      item.actionUrl ? `${item.actionLabel || "Link"}: ${item.actionUrl}` : "",
      ...(item.documents ?? []).map(doc => doc.name),
    ].filter(Boolean);
    const h = 5 + bodyH + extra.length * 3.9 + 4;
    d.ensure(h);
    d.text(item.title, MARGIN, d.y + 3.5, { size: 9.5, weight: "bold" });
    let y = d.y + 8.5;
    if (item.body) y += d.paragraph(item.body, MARGIN, y, CONTENT_W, { size: 8.5, color: MUTED, leading: 3.9 });
    extra.forEach(line => { d.text(line, MARGIN, y, { size: 8, color: MUTED }); y += 3.9; });
    d.y += h;
    d.rule(d.y - 2);
  }
}

function documents(d: Doc, trip: Trip) {
  const docs = trip.documents ?? [];
  if (docs.length === 0) return;
  d.sectionTitle("Documents");
  docs.forEach(doc => {
    d.ensure(7);
    d.text(doc.name, MARGIN, d.y + 3.5, { size: 9 });
    d.text(doc.size < 1024 * 1024 ? `${Math.max(1, Math.round(doc.size / 1024))} KB` : `${(doc.size / (1024 * 1024)).toFixed(1)} MB`, PAGE_W - MARGIN, d.y + 3.5, { size: 8, color: MUTED, align: "right" });
    d.y += 6;
    d.rule(d.y - 1);
  });
  d.y += 2;
  d.text("Attachments are available from the online itinerary.", MARGIN, d.y + 3, { size: 7.5, color: MUTED });
  d.y += 6;
}

/* ---------- public API ---------- */

function sortEvents(events: TravelEvent[]): TravelEvent[] {
  const key = (e: TravelEvent) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(e.time ?? "");
    if (!m) return 24 * 60;
    let h = Number(m[1]);
    const ap = m[3]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + Number(m[2]);
  };
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || key(a) - key(b));
}

/** Build the PDF document. The caller decides whether to save, open, or inspect it. */
export async function buildItineraryPdf(opts: ItineraryPdfOptions): Promise<JsPdfType> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: `${opts.trip.name} - Itinerary`, author: opts.brand.name, creator: opts.brand.platformName });
  const d = new Doc(pdf, opts.trip, opts.brand);
  const includeRefs = opts.includeReferences ?? true;
  const sorted = sortEvents(opts.trip.events);

  cover(d, pdf, opts.trip, opts.brand, opts.coverDataUrl, opts.mapDataUrl);
  flights(d, sorted.filter(e => e.type === "flight"), includeRefs);
  stays(d, sorted.filter(e => e.type === "hotel"), opts.trip.end, includeRefs);
  dayByDay(d, sorted, opts.trip.start);
  goodToKnow(d, opts.trip);
  documents(d, opts.trip);
  d.footers();
  return pdf;
}

/** Fetch a remote image (via the proxy when CORS blocks it) and crop it to a JPEG data URL. Browser only. */
export async function loadImage(src: string, ratio?: number, maxWidth = 1600): Promise<string | null> {
  if (!src) return null;
  try {
    let resp = await fetch(src, { mode: "cors" }).catch(() => null);
    if (!resp?.ok) resp = await fetch(`/api/image-proxy?url=${encodeURIComponent(src)}`).catch(() => null);
    if (!resp?.ok) return null;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      const targetRatio = ratio ?? img.width / img.height;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (sw / sh > targetRatio) { sw = sh * targetRatio; sx = (img.width - sw) / 2; }
      else { sh = sw / targetRatio; sy = (img.height - sh) / 2; }
      const w = Math.min(maxWidth, sw);
      const h = w / targetRatio;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.86);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
