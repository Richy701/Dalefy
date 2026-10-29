/**
 * Account report as a vector PDF (jsPDF primitives, no DOM screenshots): what the Reports filters select,
 * with a summary, money per currency and every trip. Same look as the itinerary PDF.
 */
import type { jsPDF as JsPdfType } from "jspdf";
import type { Trip } from "@/types";
import type { PdfBrand } from "@/lib/itineraryPdf";
import { formatMoney } from "@/lib/tripCosts";
import { moneyByCurrency } from "@/lib/reportMoney";
import { travellerCount } from "@/lib/travelerSync";
import { parseTripDate } from "@/lib/dates";

const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];
const PANEL: [number, number, number] = [247, 247, 249];
const RED: [number, number, number] = [185, 28, 28];
const GREEN: [number, number, number] = [4, 120, 87];
const PAGE_W = 210, PAGE_H = 297, MARGIN = 18, CONTENT_W = PAGE_W - MARGIN * 2, TOP = 22, BOTTOM = PAGE_H - 20;

/** Core PDF fonts only cover WinAnsi: spell out what they can't draw */
function safe(text: string): string {
  return (text ?? "")
    .replace(/€/g, "EUR ")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/→/g, "to")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\xFF]/g, "");
}

const day = (v: string, year = true) => {
  const d = parseTripDate(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", year ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
};
const dates = (t: Trip) => (t.end && t.end !== t.start ? `${day(t.start, false)} to ${day(t.end)}` : day(t.start));

type Col = { label: string; width: number; align?: "left" | "right" };
type Cell = { text: string; color?: [number, number, number]; bold?: boolean };

class Report {
  y = TOP;
  private pdf: JsPdfType;
  private brand: PdfBrand;
  private heading: string;
  constructor(pdf: JsPdfType, brand: PdfBrand, heading: string) {
    this.pdf = pdf;
    this.brand = brand;
    this.heading = heading;
  }

  text(str: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: "left" | "right" } = {}) {
    this.pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...(opts.color ?? INK));
    this.pdf.text(safe(str), x, y, { align: opts.align ?? "left", baseline: "alphabetic" });
  }
  fit(str: string, size: number, width: number, bold = false): string {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    let s = safe(str);
    if (this.pdf.getTextWidth(s) <= width) return s;
    while (s.length > 1 && this.pdf.getTextWidth(s + "...") > width) s = s.slice(0, -1);
    return s + "...";
  }
  rule(y: number) {
    this.pdf.setDrawColor(...LINE);
    this.pdf.setLineWidth(0.25);
    this.pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  }
  logo(x: number, y: number, height: number): number {
    const logo = this.brand.logo;
    if (!logo) return 0;
    const w = Math.min(height * logo.ratio, 60);
    try { this.pdf.addImage(logo.dataUrl, "PNG", x, y, w, w / logo.ratio); return w; } catch { return 0; }
  }
  ensure(h: number) { if (this.y + h > BOTTOM) this.newPage(); }
  newPage() {
    this.pdf.addPage();
    this.y = TOP;
    const used = this.logo(MARGIN, 8.5, 5);
    this.text(this.heading, MARGIN + (used ? used + 3 : 0), 12.5, 8, { color: MUTED });
    this.text(this.brand.name, PAGE_W - MARGIN, 12.5, 8, { color: MUTED, align: "right" });
    this.rule(16);
  }
  section(title: string, sub?: string) {
    this.ensure(26);
    this.y += 6;
    this.text(title, MARGIN, this.y + 4.5, 13, { bold: true });
    this.y += 8;
    if (sub) { this.text(sub, MARGIN, this.y + 2.5, 8.5, { color: MUTED }); this.y += 6; }
  }
  /** A row of figure panels, like the tiles on the Reports page */
  figures(items: Array<{ label: string; value: string; sub?: string }>) {
    const gap = 4, w = (CONTENT_W - gap * (items.length - 1)) / items.length, h = 22;
    this.ensure(h + 4);
    items.forEach((f, i) => {
      const x = MARGIN + i * (w + gap);
      this.pdf.setFillColor(...PANEL);
      this.pdf.setDrawColor(...LINE);
      this.pdf.setLineWidth(0.25);
      this.pdf.roundedRect(x, this.y, w, h, 2, 2, "FD");
      this.text(f.label, x + 4, this.y + 6, 7.5, { color: MUTED });
      this.text(this.fit(f.value, 14, w - 8, true), x + 4, this.y + 13.5, 14, { bold: true });
      if (f.sub) this.text(this.fit(f.sub, 7, w - 8), x + 4, this.y + 18.5, 7, { color: MUTED });
    });
    this.y += h + 4;
  }
  table(cols: Col[], rows: Cell[][]) {
    const rowH = 7;
    const scale = CONTENT_W / cols.reduce((s, c) => s + c.width, 0);
    const xs: number[] = [];
    cols.reduce((x, c) => { xs.push(x); return x + c.width * scale; }, MARGIN);
    const header = () => {
      cols.forEach((c, i) => {
        const w = c.width * scale;
        this.text(c.label, c.align === "right" ? xs[i] + w - 1 : xs[i] + 1, this.y + 4.5, 7.5, { color: MUTED, align: c.align, bold: true });
      });
      this.y += rowH;
      this.rule(this.y - 1.5);
    };
    this.ensure(rowH * 3);
    header();
    for (const row of rows) {
      if (this.y + rowH > BOTTOM) { this.newPage(); header(); }
      row.forEach((cell, i) => {
        const c = cols[i], w = c.width * scale;
        const str = this.fit(cell.text, 8.5, w - 2, cell.bold);
        this.text(str, c.align === "right" ? xs[i] + w - 1 : xs[i] + 1, this.y + 4.5, 8.5, { color: cell.color, bold: cell.bold, align: c.align });
      });
      this.y += rowH;
      this.rule(this.y - 1.5);
    }
  }
  footers(generated: string) {
    const total = this.pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.pdf.setPage(p);
      this.rule(PAGE_H - 14);
      this.text(`Prepared by ${this.brand.name}, ${generated}`, MARGIN, PAGE_H - 9, 7.5, { color: MUTED });
      this.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 9, 7.5, { color: MUTED, align: "right" });
    }
  }
}

export interface ReportPdfOptions {
  trips: Trip[];
  /** What the filters select, e.g. "This year, Published" */
  scope: string;
  brand: PdfBrand;
  now?: Date;
}

export async function buildReportPdf(opts: ReportPdfOptions): Promise<JsPdfType> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const generated = (opts.now ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  pdf.setProperties({ title: `${opts.brand.name} - Account report`, author: opts.brand.name, creator: opts.brand.platformName });
  const r = new Report(pdf, opts.brand, "Account report");
  const trips = [...opts.trips].sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  // Cover block
  const used = r.logo(MARGIN, TOP - 6, 10);
  if (!used) r.text(opts.brand.name, MARGIN, TOP + 1, 11, { bold: true, color: MUTED });
  r.y = TOP + 12;
  r.text("Account report", MARGIN, r.y + 6, 22, { bold: true });
  r.y += 13;
  r.text(`${opts.scope}. Generated ${generated}.`, MARGIN, r.y, 9.5, { color: MUTED });
  r.y += 8;

  // Summary
  const travellers = trips.reduce((s, t) => s + travellerCount(t), 0);
  const events = trips.reduce((s, t) => s + t.events.length, 0);
  const published = trips.filter(t => t.status !== "Draft").length;
  const invited = trips.reduce((s, t) => s + (t.travelers ?? []).filter(p => p.invitedAt).length, 0);
  const listed = trips.reduce((s, t) => s + (t.travelers ?? []).length, 0);
  r.section("Summary");
  r.figures([
    { label: "Trips", value: `${trips.length}`, sub: `${published} published` },
    { label: "Travellers", value: `${travellers}`, sub: listed ? `${invited} of ${listed} invited` : undefined },
    { label: "Bookings", value: `${events}`, sub: trips.length ? `${Math.round(events / trips.length)} per trip` : undefined },
    { label: "Travel days", value: `${trips.reduce((s, t) => {
      const a = parseTripDate(t.start), b = parseTripDate(t.end || t.start);
      return s + (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? 0 : Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
    }, 0)}` },
  ]);

  // Money, one block per currency
  const { rows, currencies } = moneyByCurrency(trips);
  const priced = currencies.filter(c => c.spend > 0 || c.budget > 0);
  if (priced.length) {
    r.section("Money", priced.length > 1 ? "Trips are priced in more than one currency, so each is totalled on its own." : "Spend is added up from the prices on each booking.");
    for (const c of priced) {
      const m = (n: number) => formatMoney(n, c.currency);
      if (priced.length > 1) { r.ensure(40); r.text(c.currency, MARGIN, r.y + 3, 10, { bold: true }); r.y += 6; }
      r.figures([
        { label: "Spend", value: m(c.spend), sub: `${c.trips} ${c.trips === 1 ? "trip" : "trips"}` },
        { label: "Budget", value: c.budget ? m(c.budget) : "None set", sub: c.budget ? `${Math.round((c.spendOnBudgeted / c.budget) * 100)}% used` : undefined },
        { label: "Per head", value: m(Math.round(c.perHead)), sub: `${c.travellers} ${c.travellers === 1 ? "traveller" : "travellers"}` },
        { label: "Over budget", value: `${c.overBudget}`, sub: c.unpriced ? `${c.unpriced} ${c.unpriced === 1 ? "price" : "prices"} unreadable` : undefined },
      ]);
      r.table(
        [{ label: "Trip", width: 60 }, { label: "Dates", width: 38 }, { label: "Budget", width: 26, align: "right" }, { label: "Spend", width: 26, align: "right" }, { label: "Left", width: 28, align: "right" }],
        rows.filter(row => row.currency === c.currency).sort((a, b) => (a.trip.start || "").localeCompare(b.trip.start || "")).map(row => [
          { text: row.trip.name, bold: true },
          { text: dates(row.trip), color: MUTED },
          { text: row.budget !== null ? m(row.budget) : "None", color: MUTED },
          { text: m(row.spend) },
          row.left === null ? { text: "" } : row.left < 0 ? { text: `${m(-row.left)} over`, color: RED, bold: true } : { text: m(row.left), color: GREEN },
        ]),
      );
      r.y += 2;
    }
  }

  // Every trip
  r.section("Trips", trips.length ? undefined : "No trips match this report.");
  if (trips.length) {
    r.table(
      [{ label: "Trip", width: 58 }, { label: "Dates", width: 38 }, { label: "Status", width: 24 }, { label: "Travellers", width: 22, align: "right" }, { label: "Invited", width: 18, align: "right" }, { label: "Bookings", width: 18, align: "right" }],
      trips.map(t => [
        { text: t.name, bold: true },
        { text: dates(t), color: MUTED },
        { text: t.status === "In Progress" ? "In progress" : t.status },
        { text: `${travellerCount(t)}` },
        { text: `${(t.travelers ?? []).filter(p => p.invitedAt).length}`, color: MUTED },
        { text: `${t.events.length}` },
      ]),
    );
  }

  r.footers(generated);
  return pdf;
}
