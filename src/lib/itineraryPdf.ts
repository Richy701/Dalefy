/**
 * Vector itinerary PDF. Text stays selectable and pages break between rows:
 * a cover page, then route, flights, stays, day by day, good to know, documents.
 *
 * Keep this browser-optional: only `loadImage` touches the DOM, so the layout
 * can be exercised under Node for tests.
 */
import type { jsPDF as JsPdfType } from "jspdf";
import type { Trip, TravelEvent } from "@/types";
import { sortEvents } from "@/lib/sortEvents";
import { parseTimeInput } from "@/lib/timeInput";
import { tzAbbr, eventTz } from "@/lib/timezone";

export interface PdfBrand {
  name: string;
  platformName: string;
  accentColor?: string | null;
  /** Organiser logo as a PNG data URL plus its width/height ratio, from `loadLogo`. */
  logo?: { dataUrl: string; ratio: number } | null;
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
  /** Geist as base64 TrueType, from `loadPdfFonts`. Without it the document falls back to Helvetica. */
  fonts?: PdfFonts | null;
  /** Airline logos as PNG data URLs keyed by IATA code, from `loadAirlineLogos`. */
  airlineLogos?: Record<string, string>;
}

export interface PdfFonts {
  regular: string;
  semibold: string;
}

/** The cover photo runs edge to edge across the first page. */
export const COVER_RATIO = 1.3;

/** Phosphor AirplaneTilt (fill weight), rotated to point right, rasterised for jsPDF. */
const PLANE_PNG =
  "data:image/png;base64,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";

/* ---------- palette (light document) ---------- */
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [180, 83, 9];
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
/** Core PDF fonts only cover WinAnsi; swap the few glyphs we use that fall outside it. Embedded Geist also has Latin Extended-A, so names like Şişli survive. */
function safe(text: string, extended = false): string {
  return (text ?? "")
    .replace(/→/g, "to")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(extended ? /[^\x20-\xFF\u0100-\u017F]/g : /[^\x20-\xFF]/g, c => (c === "\n" ? c : ""));
}

type Weight = "normal" | "bold";

const airlineCode = (flightNum?: string) => flightNum?.trim().toUpperCase().match(/^([A-Z0-9]{2})/)?.[1] ?? "";
const flightTime = (t?: string) => (isPlaceholderTime(t) ? "TBC" : parseTimeInput(t) || t || "");
/** Only statuses a traveller needs to act on; "Expected" or "Scheduled" just mean nothing has changed. */
function flightNotice(status?: string): { text: string; color: [number, number, number] } | null {
  const group = (status ?? "").toLowerCase().replace(/\s+/g, "");
  if (group.startsWith("cancel")) return { text: "Cancelled", color: RED };
  if (group === "diverted") return { text: "Diverted", color: RED };
  if (group.startsWith("delay")) return { text: "Delayed", color: AMBER };
  return null;
}

class Doc {
  y = TOP;
  family = "helvetica";
  airlineLogos: Record<string, string> = {};
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
    this.pdf.setFont(this.family, weight);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
  }
  text(str: string, x: number, y: number, opts: { size: number; weight?: Weight; color?: [number, number, number]; align?: "left" | "right" | "center" } ) {
    this.font(opts.size, opts.weight, opts.color);
    this.pdf.text(safe(str, this.family === "Geist"), x, y, { align: opts.align ?? "left", baseline: "alphabetic" });
  }
  wrap(str: string, size: number, width: number, weight: Weight = "normal"): string[] {
    this.font(size, weight);
    return this.pdf.splitTextToSize(safe(str, this.family === "Geist"), width) as string[];
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
    this.pdf.setFillColor(255, 255, 255);
    this.pdf.setDrawColor(...LINE);
    this.pdf.setLineWidth(0.25);
    this.pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  }
  /** Plane icon centred on (x, y), from the same icon set the app uses. */
  plane(x: number, y: number, size = 5) {
    this.pdf.addImage(PLANE_PNG, "PNG", x - size / 2, y - size / 2, size, size);
  }
  /** The airline's logo in a circle, or the plane when we have no logo for it. */
  airline(flightNum: string | undefined, cx: number, cy: number, r: number) {
    const code = airlineCode(flightNum);
    const logo = code ? this.airlineLogos[code] : undefined;
    this.pdf.setFillColor(255, 255, 255);
    this.pdf.setDrawColor(...LINE);
    this.pdf.setLineWidth(0.25);
    this.pdf.circle(cx, cy, r, "FD");
    if (!logo) {
      this.plane(cx, cy, r * 1.3);
      return;
    }
    try {
      this.pdf.saveGraphicsState();
      this.pdf.circle(cx, cy, r, null);
      this.pdf.clip();
      this.pdf.discardPath();
      this.pdf.addImage(logo, "PNG", cx - r, cy - r, r * 2, r * 2, `airline-${code}`);
      this.pdf.restoreGraphicsState();
      this.pdf.setDrawColor(...LINE);
      this.pdf.setLineWidth(0.25);
      this.pdf.circle(cx, cy, r, "S");
    } catch {
      this.pdf.restoreGraphicsState();
      this.plane(cx, cy, r * 1.3);
    }
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
  /** Draw the logo with its top-left at (x, y) and the given height; returns the width used, 0 if there is no logo. */
  logo(x: number, y: number, height: number): number {
    const logo = this.brand.logo;
    if (!logo) return 0;
    const w = Math.min(height * logo.ratio, 60);
    try {
      this.pdf.addImage(logo.dataUrl, "PNG", x, y, w, w / logo.ratio);
      return w;
    } catch {
      return 0;
    }
  }
  runningHeader() {
    const used = this.logo(MARGIN, 8.5, 5);
    this.text(this.trip.name, MARGIN + (used ? used + 3 : 0), 12.5, { size: 8, color: MUTED });
    this.text(this.brand.name, PAGE_W - MARGIN, 12.5, { size: 8, color: MUTED, align: "right" });
    this.rule(16);
  }
  footers() {
    const total = this.pdf.getNumberOfPages();
    // The cover stands alone
    for (let p = 2; p <= total; p++) {
      this.pdf.setPage(p);
      this.rule(PAGE_H - 14);
      this.text(`Prepared by ${this.brand.name}`, MARGIN, PAGE_H - 9, { size: 7.5, color: MUTED });
      this.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 9, { size: 7.5, color: MUTED, align: "right" });
    }
  }
  /** `keep` is the height of what follows, so a title never sits alone at the foot of a page. */
  sectionTitle(title: string, keep = 0) {
    this.ensure(20 + keep);
    this.y += 4;
    this.text(title, MARGIN, this.y + 5.5, { size: 15, weight: "bold" });
    this.y += 12;
  }
}

/* ---------- sections ---------- */

function cover(d: Doc, pdf: JsPdfType, trip: Trip, brand: PdfBrand, coverDataUrl?: string | null) {
  // Masthead: the logo when there is one, otherwise the organiser's name
  const logoW = d.logo(MARGIN, 7, 9);
  // A square mark gets the name beside it; a wordmark already carries the name.
  if (!logoW || (brand.logo && brand.logo.ratio < 2)) d.text(brand.name, MARGIN + (logoW ? logoW + 3 : 0), 13.5, { size: 11, weight: "bold" });
  d.text("Travel itinerary", PAGE_W - MARGIN, 13.5, { size: 9, color: MUTED, align: "right" });

  const photoY = 20;
  const photoH = PAGE_W / COVER_RATIO;
  let hasPhoto = false;
  if (coverDataUrl) {
    try {
      pdf.addImage(coverDataUrl, "JPEG", 0, photoY, PAGE_W, photoH);
      hasPhoto = true;
    } catch { /* skip photo */ }
  }
  // The organiser's colour as a band under the photo; a near-white accent would vanish on the page
  const accent = hexToRgb(brand.accentColor);
  const visible = accent && accent[0] * 0.2126 + accent[1] * 0.7152 + accent[2] * 0.0722 < 235;
  if (hasPhoto) {
    if (visible) {
      pdf.setFillColor(...accent);
      pdf.rect(0, photoY + photoH, PAGE_W, 1.2, "F");
    }
    d.y = photoY + photoH + 10;
  } else {
    d.rule(photoY, MARGIN, PAGE_W - MARGIN, visible ? accent : LINE);
    d.y = 70;
  }

  // Title
  const titleLines = d.wrap(trip.name, 30, CONTENT_W, "bold").slice(0, 3);
  titleLines.forEach((line, i) => d.text(line, MARGIN, d.y + 9 + i * 12.5, { size: 30, weight: "bold" }));
  d.y += 9 + (titleLines.length - 1) * 12.5 + 7.5;
  d.text(dateRange(trip.start, trip.end), MARGIN, d.y, { size: 12 });
  if (trip.destination) {
    d.y += 2;
    d.y += d.paragraph(trip.destination, MARGIN, d.y + 3.5, CONTENT_W, { size: 11, color: MUTED, leading: 4.8 });
  }
  d.y += 6;

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
    d.text(value, x, d.y + 11.5, { size: 11, weight: "bold" });
  });
  d.y += 16;
  d.rule(d.y);
  d.y += 7;

  // Organiser: who they are on the left, how to reach them on the right
  const org = trip.organizer;
  if (org?.name?.trim()) {
    const right = PAGE_W - MARGIN;
    d.text("Your travel organiser", MARGIN, d.y, { size: 8, color: MUTED });
    d.text(org.name, MARGIN, d.y + 5.5, { size: 11, weight: "bold" });
    const line = [org.role, org.company].filter(Boolean).join(", ");
    if (line) d.text(line, MARGIN, d.y + 10, { size: 9, color: MUTED });
    if (org.phone) d.text(org.phone, right, d.y + 5.5, { size: 9, align: "right" });
    if (org.email) d.text(org.email, right, d.y + (org.phone ? 10 : 5.5), { size: 9, align: "right" });
  }
}

function routeMap(d: Doc, pdf: JsPdfType, mapDataUrl?: string | null) {
  if (!mapDataUrl) return;
  const h = CONTENT_W * 300 / 800;
  d.sectionTitle("Your route", h);
  try {
    pdf.addImage(mapDataUrl, "JPEG", MARGIN, d.y, CONTENT_W, h);
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.25);
    pdf.rect(MARGIN, d.y, CONTENT_W, h);
    d.y += h + 8;
  } catch { /* skip map */ }
}

function flights(d: Doc, evs: TravelEvent[], includeRefs: boolean) {
  if (evs.length === 0) return;
  d.sectionTitle("Your flights", 40);
  const x = MARGIN + 5;
  const right = PAGE_W - MARGIN - 5;
  const mid = PAGE_W / 2;
  const colW = mid - 26 - x;

  for (const ev of evs) {
    const { from, to } = routeOf(ev);
    const dep = endpoint(from);
    const arr = endpoint(to);
    const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title;
    const notice = flightNotice(ev.status);
    const departs = [ev.terminal && `Terminal ${ev.terminal.replace(/^T/i, "")}`, ev.gate && `Gate ${ev.gate}`].filter(Boolean).join(", ");
    const arrives = [ev.arrTerminal && `Terminal ${ev.arrTerminal.replace(/^T/i, "")}`, ev.arrGate && `Gate ${ev.arrGate}`, ev.baggageBelt && `Belt ${ev.baggageBelt}`].filter(Boolean).join(", ");
    const details = [
      departs && `Departs ${departs}`,
      arrives && `Arrives ${arrives}`,
      ev.aircraft,
      includeRefs && ev.seatDetails && `Seat ${ev.seatDetails}`,
      includeRefs && ev.confNumber && `Booking ref ${ev.confNumber}`,
    ].filter(Boolean).join(", ");
    const detailLines = details ? d.wrap(details, 8, right - x - (notice ? 24 : 0)) : [];
    const footLines = Math.max(detailLines.length, notice ? 1 : 0);

    const days = ev.endDate ? Math.round((parseDate(ev.endDate).getTime() - parseDate(ev.date).getTime()) / DAY_MS) : 0;
    const dayOffset = days ? ` ${days > 0 ? "+" : ""}${days}` : "";
    const known = (t?: string) => !isPlaceholderTime(t);
    const depTz = tzAbbr(eventTz(ev, undefined, "dep"), ev.date);
    const arrTz = tzAbbr(eventTz(ev, undefined, "arr"), ev.endDate || ev.date);

    // Each end: a big code (or the wrapped name when there is no code), the time, then the place and zone in small.
    const side = (e: { code: string | null; name: string }, time: string, muted: boolean, tz: string) => {
      const nameLines = e.code ? [] : e.name ? d.wrap(e.name, 11, colW, "bold").slice(0, 2) : [];
      const small = [e.code ? e.name : "", muted ? "" : tz].filter(Boolean).join(", ");
      const smallLines = small ? d.wrap(small, 8, colW).slice(0, 1) : [];
      const headH = e.code ? 7.5 : 4.5 + Math.max(0, nameLines.length - 1) * 4.8;
      return { nameLines, smallLines, headH, h: headH + 6.5 + (smallLines.length ? 4 : 0), time, muted };
    };
    const L = side(dep, flightTime(ev.time), !known(ev.time), depTz);
    const R = side(arr, known(ev.endTime) ? `${flightTime(ev.endTime)}${dayOffset}` : "TBC", !known(ev.endTime), arrTz);
    const bodyH = Math.max(L.h, R.h);
    const footH = footLines ? 3 + footLines * 3.6 + 1.5 : 0;
    const h = 12 + bodyH + 3 + footH;
    d.ensure(h);

    d.panel(MARGIN, d.y, CONTENT_W, h);
    d.airline(ev.flightNum, x + 3, d.y + 6, 3);
    d.text(carrier, x + 8, d.y + 7.1, { size: 10, weight: "bold" });
    d.text(fmtShort(ev.date), right, d.y + 7.1, { size: 9, color: MUTED, align: "right" });

    const y0 = d.y + 12;
    const drawSide = (S: ReturnType<typeof side>, e: { code: string | null; name: string }, sx: number, align: "left" | "right") => {
      let yy: number;
      if (e.code) {
        d.text(e.code, sx, y0 + 6.5, { size: 20, weight: "bold", align });
        yy = y0 + 6.5;
      } else {
        const lines = S.nameLines.length ? S.nameLines : ["-"];
        lines.forEach((line, i) => d.text(line, sx, y0 + 4.5 + i * 4.8, { size: 11, weight: "bold", align }));
        yy = y0 + 4.5 + Math.max(0, lines.length - 1) * 4.8;
      }
      d.text(S.time, sx, yy + 6, { size: 11, weight: S.muted ? "normal" : "bold", color: S.muted ? MUTED : INK, align });
      if (S.smallLines.length) d.text(S.smallLines[0], sx, yy + 10, { size: 8, color: MUTED, align });
    };
    drawSide(L, dep, x, "left");
    drawSide(R, arr, right, "right");

    // Route line with a plane in the middle and the duration underneath
    const lineY = y0 + 4;
    d.rule(lineY, mid - 24, mid - 5);
    d.rule(lineY, mid + 5, mid + 24);
    d.plane(mid, lineY, 5.5);
    if (ev.duration) d.text(ev.duration, mid, lineY + 6.5, { size: 8, color: MUTED, align: "center" });

    if (footLines) {
      const footY = y0 + bodyH + 2;
      d.rule(footY, x, right);
      detailLines.forEach((line, i) => d.text(line, x, footY + 4.4 + i * 3.6, { size: 8, color: MUTED }));
      if (notice) d.text(notice.text, detailLines.length ? right : x, footY + 4.4, { size: 8, weight: "bold", color: notice.color, align: detailLines.length ? "right" : "left" });
    }
    d.y += h + 3;
  }
  d.y += 4;
}

function stays(d: Doc, evs: TravelEvent[], tripEnd: string, includeRefs: boolean) {
  if (evs.length === 0) return;
  d.sectionTitle("Where you're staying", 40);
  evs.forEach((ev, i) => {
    const checkout = ev.endDate || evs[i + 1]?.date || tripEnd;
    const n = nights(ev.date, checkout);
    const checkin = ev.checkin || (isPlaceholderTime(ev.time) ? "" : ev.time);
    const meta = [
      n > 0 ? `${n} night${n === 1 ? "" : "s"}` : "",
      includeRefs && ev.confNumber ? `Booking ref ${ev.confNumber}` : "",
    ].filter(Boolean).join(", ");
    const h = 31 + (meta ? 6.5 : 0);
    d.ensure(h);

    d.panel(MARGIN, d.y, CONTENT_W, h);
    const x = MARGIN + 5;
    const right = PAGE_W - MARGIN - 5;
    d.text(ev.title, x, d.y + 7.5, { size: 11, weight: "bold" });
    if (ev.location) d.text(ev.location, x, d.y + 12, { size: 9, color: MUTED });
    if (ev.roomType) d.text(ev.roomType, x, d.y + 17, { size: 9 });

    const rowY = d.y + 22;
    d.rule(rowY - 1.5, x, right);
    d.text("Check in", x, rowY + 3, { size: 8, color: MUTED });
    d.text(`${fmtShort(ev.date)}${checkin ? `, ${checkin}` : ""}`, x, rowY + 7, { size: 9.5, weight: "bold" });
    const half = MARGIN + CONTENT_W / 2;
    d.text("Check out", half, rowY + 3, { size: 8, color: MUTED });
    d.text(`${fmtShort(checkout)}${ev.checkout ? `, ${ev.checkout}` : ""}`, half, rowY + 7, { size: 9.5, weight: "bold" });
    if (meta) d.text(meta, x, rowY + 12, { size: 8, color: MUTED });
    d.y += h + 4;
  });
  d.y += 4;
}

function eventMeta(ev: TravelEvent): string {
  if (ev.type === "flight") {
    const { from, to } = routeOf(ev);
    const dep = endpoint(from);
    const arr = endpoint(to);
    const route = from && to ? `${dep.code ?? dep.name} to ${arr.code ?? arr.name}` : ev.location;
    const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ");
    const titled = ev.flightNum && ev.title.includes(ev.flightNum);
    return [titled ? "" : carrier, route, ev.duration].filter(Boolean).join(", ");
  }
  if (ev.type === "hotel") return [ev.location, ev.roomType].filter(Boolean).join(", ");
  const until = ev.endTime && !isPlaceholderTime(ev.endTime) ? `until ${ev.endTime}` : "";
  // A transfer's meeting point has its own line; don't say the same place twice.
  const repeated = ev.type === "transfer" && ev.location?.trim().toLowerCase() === ev.meetingPoint?.trim().toLowerCase();
  return [repeated ? "" : ev.location, ev.duration, until].filter(Boolean).join(", ");
}

/** Where to meet a transfer and who to call. */
function transferContact(ev: TravelEvent): string {
  if (ev.type !== "transfer") return "";
  const who = [ev.contactName, ev.contactPhone].filter(Boolean).join(" ");
  return [ev.meetingPoint && `Meet at ${ev.meetingPoint}`, who].filter(Boolean).join(", ");
}

function dayByDay(d: Doc, sorted: TravelEvent[], tripStart: string) {
  if (sorted.length === 0) return;
  const days = new Map<string, TravelEvent[]>();
  for (const ev of sorted) {
    if (!days.has(ev.date)) days.set(ev.date, []);
    days.get(ev.date)!.push(ev);
  }
  // The schedule starts its own page
  if (d.y > TOP) d.newPage();
  d.sectionTitle("Day by day");

  const timeX = MARGIN;
  const dotX = MARGIN + 23;
  const textX = MARGIN + 28;
  const textW = CONTENT_W - 28;
  const rowH = (ev: TravelEvent) => {
    const meta = eventMeta(ev);
    const contact = transferContact(ev);
    return d.paragraphHeight(ev.title, 10, textW - 22, 4.4)
      + (meta ? d.paragraphHeight(meta, 9, textW, 4.1) : 0)
      + (contact ? d.paragraphHeight(contact, 9, textW, 4.1) : 0)
      + (ev.description ? d.paragraphHeight(ev.description, 9, textW, 4.1) + 1 : 0)
      + 4;
  };

  for (const [date, evs] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dayNo = Math.round((parseDate(date).getTime() - parseDate(tripStart).getTime()) / DAY_MS) + 1;
    // Keep a whole day together when it fits on one page, otherwise its header with at least the first row
    const dayH = 17 + evs.reduce((sum, ev) => sum + rowH(ev) + 2, 0);
    d.ensure(dayH <= BOTTOM - TOP ? dayH : 36);
    d.y += 2;
    if (dayNo >= 1) d.text(`Day ${dayNo}`, MARGIN, d.y + 4, { size: 9, color: MUTED });
    d.text(fmtLong(date), textX, d.y + 4, { size: 11, weight: "bold" });
    d.y += 7;
    d.rule(d.y);
    d.y += 6;

    evs.forEach((ev, i) => {
      const meta = eventMeta(ev);
      const contact = transferContact(ev);
      const isFlight = ev.type === "flight";
      const h = rowH(ev);
      d.ensure(h + 2);

      // connector to the next row, drawn first so the marker sits on top of it
      if (i < evs.length - 1) d.vline(dotX, d.y + 4.5, d.y + h + 1.5);
      const time = isFlight ? flightTime(ev.time) : isPlaceholderTime(ev.time) ? "" : ev.time;
      if (time) d.text(time, timeX, d.y + 3.4, { size: 9.5, weight: "bold" });
      if (isFlight) d.airline(ev.flightNum, dotX, d.y + 2.2, 2.4);
      else d.marker(dotX, d.y + 2.2);

      let y = d.y + 3.4;
      const label = ev.type === "hotel" ? "Check in" : ev.type === "activity" ? "" : CATEGORY_LABEL[ev.type];
      const used = d.paragraph(ev.title, textX, y, textW - 22, { size: 10, weight: "bold", leading: 4.4 });
      if (label) d.text(label, PAGE_W - MARGIN, y, { size: 8, color: MUTED, align: "right" });
      y += used;
      if (meta) y += d.paragraph(meta, textX, y, textW, { size: 9, color: MUTED, leading: 4.1 });
      if (contact) y += d.paragraph(contact, textX, y, textW, { size: 9, leading: 4.1 });
      if (ev.description) y += 1 + d.paragraph(ev.description, textX, y, textW, { size: 9, leading: 4.1 });
      d.y += h + 2;
    });
    d.y += 5;
  }
}

function goodToKnow(d: Doc, trip: Trip) {
  const items = (trip.info ?? []).filter(i => !i.leaderOnly);
  if (items.length === 0) return;
  d.sectionTitle("Good to know", 16);
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
  d.sectionTitle("Documents", 10);
  docs.forEach(doc => {
    d.ensure(7);
    d.text(doc.name, MARGIN, d.y + 3.5, { size: 9 });
    if (doc.size > 0) d.text(doc.size < 1024 * 1024 ? `${Math.max(1, Math.round(doc.size / 1024))} KB` : `${(doc.size / (1024 * 1024)).toFixed(1)} MB`, PAGE_W - MARGIN, d.y + 3.5, { size: 8, color: MUTED, align: "right" });
    d.y += 6;
    d.rule(d.y - 1);
  });
  d.y += 2;
  d.text("Attachments are available from the online itinerary.", MARGIN, d.y + 3, { size: 7.5, color: MUTED });
  d.y += 6;
}

/* ---------- public API ---------- */

/** Build the PDF document. The caller decides whether to save, open, or inspect it. */
export async function buildItineraryPdf(opts: ItineraryPdfOptions): Promise<JsPdfType> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: `${opts.trip.name} - Itinerary`, author: opts.brand.name, creator: opts.brand.platformName });
  const d = new Doc(pdf, opts.trip, opts.brand);
  d.airlineLogos = opts.airlineLogos ?? {};
  if (opts.fonts) {
    try {
      pdf.addFileToVFS("Geist-Regular.ttf", opts.fonts.regular);
      pdf.addFont("Geist-Regular.ttf", "Geist", "normal");
      pdf.addFileToVFS("Geist-SemiBold.ttf", opts.fonts.semibold);
      pdf.addFont("Geist-SemiBold.ttf", "Geist", "bold");
      d.family = "Geist";
    } catch { /* stay on Helvetica */ }
  }
  const includeRefs = opts.includeReferences ?? true;
  const sorted = sortEvents(opts.trip.events);

  cover(d, pdf, opts.trip, opts.brand, opts.coverDataUrl);
  d.newPage();
  routeMap(d, pdf, opts.mapDataUrl);
  flights(d, sorted.filter(e => e.type === "flight"), includeRefs);
  stays(d, sorted.filter(e => e.type === "hotel"), opts.trip.end, includeRefs);
  dayByDay(d, sorted, opts.trip.start);
  goodToKnow(d, opts.trip);
  documents(d, opts.trip);
  d.footers();
  return pdf;
}

/** Fetch the bundled Geist files as base64 for embedding. Browser only; null keeps the Helvetica fallback. */
export async function loadPdfFonts(): Promise<PdfFonts | null> {
  const fetchBase64 = async (path: string) => {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  try {
    const [regular, semibold] = await Promise.all([fetchBase64("/fonts/Geist-Regular.ttf"), fetchBase64("/fonts/Geist-SemiBold.ttf")]);
    return { regular, semibold };
  } catch {
    return null;
  }
}

/** Logos for the airlines on this trip, keyed by IATA code. Airlines without a bundled logo are left out. Browser only. */
export async function loadAirlineLogos(events: TravelEvent[]): Promise<Record<string, string>> {
  const codes = [...new Set(events.filter(e => e.type === "flight").map(e => airlineCode(e.flightNum)).filter(Boolean))];
  const loaded = await Promise.all(codes.map(async code => [code, (await loadLogo(`/airlines/${code}.png`))?.dataUrl] as const));
  return Object.fromEntries(loaded.filter((entry): entry is [string, string] => Boolean(entry[1])));
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

/** Fetch the organiser logo as a PNG data URL (transparency kept) with its aspect ratio. Browser only. */
export async function loadLogo(src: string): Promise<{ dataUrl: string; ratio: number } | null> {
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
      const scale = Math.min(1, 800 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL("image/png"), ratio: canvas.width / canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
