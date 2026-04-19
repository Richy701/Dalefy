import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, ChevronRight, X, Plane, Hotel, Compass, Utensils } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import type { Trip, TravelEvent, User } from "@/types";
import { searchImagesProgressive } from "@/services/imageSearch";
import { buildImageQueryCandidates } from "@/services/imageQuery";
import { matchOrCreateTravelers } from "@/lib/travelerSync";
import { notifyLocalStorage } from "@/hooks/useLocalStorage";

interface ImportItineraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFile?: File | null;
  /** When set, re-import updates this trip instead of creating a new one. Keeps existing media/images. */
  existingTripId?: string;
}

// ─── Text + media extraction ──────────────────────────────────────────────────

interface ExtractedMedia {
  name: string;
  type: "image" | "video";
  dataUrl: string;
  size: number;
}

interface ExtractionResult {
  text: string;
  media: ExtractedMedia[];
}

/** Convert a raw binary + MIME type to a data-URL */
function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff",
};

/** Minimum byte size for an image to be worth keeping (skip tiny logos/icons) */
const MIN_IMAGE_BYTES = 5_000;
/** Maximum images to extract per document */
const MAX_IMAGES = 20;

async function extractFromPdf(file: File): Promise<ExtractionResult> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  // ── Extract page text ──
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    const chunks: string[] = [];
    for (const item of content.items as any[]) {
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
        chunks.push("\n");
      }
      chunks.push(item.str);
      if (item.hasEOL) chunks.push("\n");
      if (y !== undefined) lastY = y;
    }
    pages.push(chunks.join(""));
  }

  // ── Extract embedded file attachments (booking confirmations, vouchers) ──
  let attachmentText = "";
  try {
    const attachments: Record<string, { filename: string; content: Uint8Array }> | null =
      await (doc as any).getAttachments();
    if (attachments) {
      for (const [, att] of Object.entries(attachments)) {
        const name = (att.filename ?? "").toLowerCase();
        // Only extract text-bearing attachments
        if (name.endsWith(".pdf")) {
          try {
            const subDoc = await pdfjsLib.getDocument({ data: att.content }).promise;
            for (let i = 1; i <= subDoc.numPages; i++) {
              const pg = await subDoc.getPage(i);
              const ct = await pg.getTextContent();
              attachmentText += "\n" + ct.items.map((it: any) => it.str + (it.hasEOL ? "\n" : "")).join("");
            }
          } catch { /* skip corrupt/unreadable attached PDFs */ }
        } else if (name.endsWith(".txt") || name.endsWith(".csv")) {
          try {
            attachmentText += "\n" + new TextDecoder().decode(att.content);
          } catch { /* skip */ }
        }
      }
    }
  } catch { /* getAttachments not supported or failed */ }

  // ── Extract embedded images from pages ──
  const media: ExtractedMedia[] = [];
  try {
    for (let i = 1; i <= doc.numPages && media.length < MAX_IMAGES; i++) {
      const page = await doc.getPage(i);
      const ops = await page.getOperatorList();
      for (let j = 0; j < ops.fnArray.length && media.length < MAX_IMAGES; j++) {
        // OPS.paintImageXObject = 85, OPS.paintJpegXObject = 82
        if (ops.fnArray[j] === 85 || ops.fnArray[j] === 82) {
          try {
            const imgName = ops.argsArray[j][0];
            const img = await (page as any).objs.get(imgName);
            if (!img?.data || !img.width || !img.height) continue;
            // Skip tiny images (logos, bullets, decorations)
            const rawSize = img.data.length;
            if (rawSize < MIN_IMAGE_BYTES) continue;
            if (img.width < 50 || img.height < 50) continue;

            // Render to canvas → data URL
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            const imageData = ctx.createImageData(img.width, img.height);
            // pdfjs image data may be RGB (3 channels) or RGBA (4 channels)
            const src = img.data as Uint8ClampedArray;
            const channels = src.length / (img.width * img.height);
            if (channels === 4) {
              imageData.data.set(src);
            } else if (channels === 3) {
              for (let p = 0, d = 0; p < src.length; p += 3, d += 4) {
                imageData.data[d] = src[p];
                imageData.data[d + 1] = src[p + 1];
                imageData.data[d + 2] = src[p + 2];
                imageData.data[d + 3] = 255;
              }
            } else continue;
            ctx.putImageData(imageData, 0, 0);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            media.push({
              name: `page-${i}-img-${j}.jpg`,
              type: "image",
              dataUrl,
              size: rawSize,
            });
          } catch { /* skip unreadable image */ }
        }
      }
    }
  } catch { /* image extraction not critical */ }

  const text = pages.join("\n") + (attachmentText ? "\n" + attachmentText : "");
  return { text, media };
}

async function extractFromDocx(file: File): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const JSZip = (await import("jszip")).default;
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });

  // ── Extract images from word/media/ ──
  const media: ExtractedMedia[] = [];
  try {
    const zip = await JSZip.loadAsync(buffer);
    const mediaFiles = Object.keys(zip.files)
      .filter(name => /^word\/media\/.+/i.test(name) && !zip.files[name].dir)
      .sort();
    for (const name of mediaFiles.slice(0, MAX_IMAGES)) {
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const mime = IMAGE_MIME[ext];
      if (!mime) continue;
      const bytes = await zip.files[name].async("uint8array");
      if (bytes.length < MIN_IMAGE_BYTES) continue;
      media.push({
        name: name.split("/").pop() ?? name,
        type: "image",
        dataUrl: toDataUrl(bytes, mime),
        size: bytes.length,
      });
    }
  } catch { /* image extraction not critical */ }

  // ── Extract text from embedded documents in word/embeddings/ ──
  let embeddedText = "";
  try {
    const zip = await JSZip.loadAsync(buffer);
    const embedFiles = Object.keys(zip.files)
      .filter(name => /^word\/embeddings\/.+/i.test(name) && !zip.files[name].dir);
    for (const name of embedFiles) {
      if (name.toLowerCase().endsWith(".txt") || name.toLowerCase().endsWith(".csv")) {
        embeddedText += "\n" + await zip.files[name].async("text");
      }
    }
  } catch { /* not critical */ }

  return { text: result.value + embeddedText, media };
}

async function extractFromPptx(file: File): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // ── Extract slide text ──
  const texts: string[] = [];
  const slideFiles = Object.keys(zip.files)
    .filter(name => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("text");
    const stripped = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    texts.push(stripped);
  }

  // ── Extract images from ppt/media/ ──
  const media: ExtractedMedia[] = [];
  const mediaFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/media\/.+/i.test(name) && !zip.files[name].dir)
    .sort();
  for (const name of mediaFiles.slice(0, MAX_IMAGES)) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const mime = IMAGE_MIME[ext];
    if (!mime) continue;
    const bytes = await zip.files[name].async("uint8array");
    if (bytes.length < MIN_IMAGE_BYTES) continue;
    media.push({
      name: name.split("/").pop() ?? name,
      type: "image",
      dataUrl: toDataUrl(bytes, mime),
      size: bytes.length,
    });
  }

  return { text: texts.join("\n"), media };
}

async function extractContent(file: File): Promise<ExtractionResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return extractFromPdf(file);
  if (ext === "docx") return extractFromDocx(file);
  if (ext === "pptx") return extractFromPptx(file);
  const text = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target?.result as string ?? "");
    reader.onerror = rej;
    reader.readAsText(file);
  });
  return { text, media: [] };
}

// ─── Heuristic parser ──────────────────────────────────────────────────────────

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_PATTERNS = [
  // "4th Nov" or "4 th Nov" (PDF extraction often inserts whitespace before the ordinal suffix)
  new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+(\\d{4}))?`, "gi"),
  new RegExp(`${MONTH}\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, "gi"),
  /(\d{4})-(\d{2})-(\d{2})/g,
  /(\d{2})\/(\d{2})\/(\d{4})/g,
];

const MONTH_CODE: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

// GDS / airline flight-string: "QF 002J 02NOV LHRSYD 2010 0635+2", "EK 16 20NOV LGWDXB 1335 0040",
// "LH903 24NOV LHR-FRA 09:30 -12:05", "QF 922 Y 06NOV 4 SYDCNS 0945 1150"
const GDS_FLIGHT_RE = /\b([A-Z]{2})\s*(\d{2,4})\s*([A-Z])?\s+(\d{1,2})([A-Z]{3})(?:\s+\d)?\s+([A-Z]{3})[\s-]*([A-Z]{3})\s+(\d{4}|\d{1,2}[.:]\d{2})\s*[-–—]?\s*(\d{4}|\d{1,2}[.:]\d{2})/g;

function parseDate(str: string, fallbackYear?: number): string | null {
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m1 = str.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+(\w{3})\w*(?:\s+(\d{4}))?/i);
  if (m1) {
    const mon = months[m1[2].toLowerCase().slice(0, 3)];
    const year = m1[3] ?? fallbackYear?.toString();
    if (mon && year) return `${year}-${mon}-${m1[1].padStart(2, "0")}`;
  }
  const m2 = str.match(/(\w{3})\w*\s+(\d{1,2})\s*(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (m2) {
    const mon = months[m2[1].toLowerCase().slice(0, 3)];
    const year = m2[3] ?? fallbackYear?.toString();
    if (mon && year) return `${year}-${mon}-${m2[2].padStart(2, "0")}`;
  }
  return null;
}

// Supports: "9:50am", "9.50am", "17:30", "10.00:", "1pm", "2am",
// plus 4-digit military like "0930", "1015hrs", "1545pm", "ETD 1045hrs",
// plus Spanish "md" (noon-ish, used as an AM/PM-style suffix in LATAM itineraries).
function parseTime(str: string): string {
  const s = str.trim();

  // Bare Spanish "md" token
  if (/^md$/i.test(s)) return "12:00 PM";

  // "1pm", "9am"
  const simple = s.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (simple) {
    let h = parseInt(simple[1]);
    const ampm = simple[2].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
  }

  // 4-digit military time — "0930", "1015hrs", "1545pm", "ETD 1045hrs", "0930 departure"
  // Use (?!\d) instead of \b so "1015hrs" (digit→letter has no word boundary) still matches.
  if (!s.includes(":") && !s.includes(".")) {
    const mil = s.match(/(?<![A-Za-z0-9])(\d{4})(?!\d)/);
    if (mil) {
      const raw = mil[1];
      const h = parseInt(raw.slice(0, 2));
      const m = raw.slice(2);
      // Suffix can be attached ("1545PM") or separated ("1045 pm") — look anywhere in string.
      const suf = s.match(/(am|pm)\b/i)?.[1]?.toLowerCase();
      let hh = h;
      if (suf === "pm" && hh < 12) hh += 12;
      if (suf === "am" && hh === 12) hh = 0;
      if (hh >= 0 && hh < 24 && /^\d{2}$/.test(m) && parseInt(m) < 60) {
        return `${hh % 12 || 12}:${m} ${hh < 12 ? "AM" : "PM"}`;
      }
    }
  }

  // "9:50am", "9.50am", "17:30", "11:30 md"
  const t = s.match(/(\d{1,2})[.:](\d{2})\s*(am|pm|md)?/i);
  if (!t) return "12:00 PM";
  let h = parseInt(t[1]);
  const m = t[2];
  const suf = t[3]?.toLowerCase();
  if (suf === "pm" && h < 12) h += 12;
  if (suf === "am" && h === 12) h = 0;
  // "md" just marks the line as around noon — no hour shift.
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

// Default times for standalone meal lines with no time
const MEAL_DEFAULTS: Record<string, string> = {
  breakfast: "8:00 AM",
  lunch: "1:00 PM",
  dinner: "7:00 PM",
  brunch: "10:30 AM",
};

/** Convert "9:50 AM" / "12:00 PM" to minutes since midnight for numeric sorting */
function timeToMinutes(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720; // noon fallback
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

type EventType = "flight" | "hotel" | "activity" | "dining";

function guessEventType(line: string): EventType {
  const l = line.toLowerCase();
  if (/\b(flight|fly|depart|arrive|airport|airline|airways|boarding|gate|xq|ba\d|lh\d|ek\d|kq\d|safarilink)\b/.test(l)) return "flight";
  if (/\b(hotel|resort|lodge|inn|accommodation|check.?in|check.?out|room|suite|villa|stay|regnum|crown|maxx|camp|overnight|fullboard|half.?board|all.?inclusive|panafric|marjani|norfolk)\b/.test(l)) return "hotel";
  if (/\b(dinner|lunch|breakfast|brunch|restaurant|bistro|caf[eé]|dining|meal|eat|drinks|cocktail|bbq|fish\s*market|seafood)\b/.test(l)) return "dining";
  return "activity";
}

const EVENT_TYPE_ICONS: Record<EventType, typeof Plane> = {
  flight: Plane, hotel: Hotel, activity: Compass, dining: Utensils,
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  flight: "text-slate-500 dark:text-slate-400",
  hotel: "text-amber-400",
  activity: "text-brand",
  dining: "text-pink-400",
};

interface ParsedEvent {
  id: string;
  type: EventType;
  date: string;
  time: string;
  title: string;
  location: string;
}

interface ParsedOrganizer {
  name: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
}

interface ParsedInfo {
  title: string;
  body: string;
}

interface ParsedTrip {
  name: string;
  attendees: string;
  paxCount: number;
  parsedTravelerNames: string[];
  start: string;
  end: string;
  destination: string;
  events: ParsedEvent[];
  extractedMedia: ExtractedMedia[];
  organizer?: ParsedOrganizer;
  info: ParsedInfo[];
}

function parseItinerary(text: string, extractedMedia: ExtractedMedia[] = []): ParsedTrip {
  const rawLines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  // ── Merge continuation lines ──────────────────────────────────────────────
  // PDF extraction preserves soft line-wraps within paragraphs. Re-join lines
  // that continue the previous sentence (lowercase start, or uppercase but
  // previous line didn't end with sentence-terminating punctuation).
  const DATE_START = new RegExp(`^\\d{1,2}\\s*(?:st|nd|rd|th)?\\s+${MONTH}`, "i");
  const SECTION_HEADER = /^(?:rooming\s+list|emergency|single\s+[A-Z]|twin\s+[A-Z]|double\s+[A-Z]|accommodation|attendees?|notes?|additional)/i;
  const lines: string[] = [];
  for (const raw of rawLines) {
    const isNewBlock =
      /^\d{1,2}\s+[A-Z]{3}\b/.test(raw) ||   // "07 NOV", "10 NOV"
      DATE_START.test(raw) ||                   // "4th November", "November 4"
      /^\d{4}\s*[-–]/.test(raw) ||             // ISO date start
      SECTION_HEADER.test(raw) ||
      /^\d{1,2}[.:]\d{2}\s*(?:am|pm)?/i.test(raw) || // starts with time
      /^\d{4}(?:hrs?\b|am\b|pm\b)/i.test(raw);        // starts with military time
    // Merge if clearly a continuation: starts with lowercase, OR previous line
    // ended mid-sentence (no terminating punctuation) and this isn't a new block.
    // Never merge into date-only headers like "07 NOV" or very short lines.
    const prevLine = lines[lines.length - 1] ?? "";
    const prevIsDateOnly = /^\d{1,2}\s+[A-Z]{3}\s*$/.test(prevLine.trim());
    const prevEndsMidSentence = prevLine.length > 10 && !prevIsDateOnly && !/[.!?:)\]]$/.test(prevLine.trimEnd());
    // Don't merge short lines that look like person names (2-4 capitalized words, under 40 chars)
    const looksLikeName = (s: string) => s.length < 40 && /^[A-Z][a-z]/.test(s) && s.split(/\s+/).length <= 4 && s.split(/\s+/).every(w => /^[A-Z(]/.test(w));
    const prevIsName = looksLikeName(prevLine.trim());
    const currIsName = looksLikeName(raw);
    if (!isNewBlock && lines.length > 0 && !prevIsName && !currIsName && (/^[a-z]/.test(raw) || prevEndsMidSentence)) {
      lines[lines.length - 1] += " " + raw;
    } else {
      lines.push(raw);
    }
  }

  // Trip name: first meaningful line that looks like a title (short, not starting
  // with a common event sentence opener). If nothing fits, build from destinations.
  const SENTENCE_OPENER = /^(meet |arrive |depart|breakfast|lunch|dinner|overnight|following|wake |after |single |twin |double |emergency|rooming|accommodation|notes?|james |pollmans|leopard|kenya|tanzania|\d+\s+passengers?)/i;
  let nameLine = lines.find(l =>
    l.length > 5 && l.length < 80 && !/^\d/.test(l) && !SENTENCE_OPENER.test(l)
  ) ?? "";
  if (!nameLine) {
    // Build from destination keywords found in the text
    const places: string[] = [];
    const placeRe = /(?:to|in|at)\s+((?:Masai\s+)?Mara|Zanzibar|Nairobi|Kenya|Tanzania|Serengeti|Kilimanjaro|Amboseli|Mombasa|Dar\s+es\s+Salaam|Arusha|Ngorongoro|Diani)/gi;
    let pm; while ((pm = placeRe.exec(text)) !== null) {
      const p = pm[1]; if (!places.some(x => x.toLowerCase() === p.toLowerCase())) places.push(p);
    }
    nameLine = places.length > 0 ? `Trip to ${places.slice(0, 3).join(" & ")}` : "Imported Trip";
  }

  // Attendees: parse "Attendees:" section — collect names listed one per line below it
  let attendees = "Imported Group";
  let paxCount = 0;
  const parsedTravelerNames: string[] = [];
  const attendeesIdx = lines.findIndex(l => /^attendees?:?\s*$/i.test(l));
  // Rooming list format: "Single David Whittaker", "Twin Jamie Foskin & Adam Fransham"
  const roomingIdx = lines.findIndex(l => /^rooming\s+list\s*$/i.test(l));
  if (attendeesIdx >= 0) {
    const SECTION_BREAK = /^(accommodation|rooms?|single|twin|double|triple|flights?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|additional|notes?|important)/i;
    for (let i = attendeesIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (SECTION_BREAK.test(l) || /:\s*$/.test(l)) break;
      const name = l.replace(/\(.*?\)/g, "").trim();
      if (name.length > 2 && name.length < 60 && /^[A-Z]/.test(name)) parsedTravelerNames.push(name);
    }
    if (parsedTravelerNames.length > 0) {
      paxCount = parsedTravelerNames.length;
      attendees = parsedTravelerNames.slice(0, 6).join(", ") + (parsedTravelerNames.length > 6 ? ` +${parsedTravelerNames.length - 6} more` : "");
    }
  } else if (roomingIdx >= 0) {
    const ROOM_LINE = /^(single|twin|double|triple|quad)\s+(.+)/i;
    for (let i = roomingIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || /^(emergency|contact|notes?|important)/i.test(l)) break;
      const rm = l.match(ROOM_LINE);
      if (rm) {
        // "Twin Jamie Foskin & Adam Fransham" → ["Jamie Foskin", "Adam Fransham"]
        const people = rm[2].split(/\s*[&,]\s*/);
        people.forEach(p => { const n = p.trim(); if (n.length > 2) parsedTravelerNames.push(n); });
      }
    }
    if (parsedTravelerNames.length > 0) {
      paxCount = parsedTravelerNames.length;
      attendees = parsedTravelerNames.slice(0, 6).join(", ") + (parsedTravelerNames.length > 6 ? ` +${parsedTravelerNames.length - 6} more` : "");
    }
  } else {
    // Fallback: look for pax/traveller/client keywords
    const attendeeLine = lines.find(l => /\b(pax|guest|travell?er|client|passenger|group|team)\b/i.test(l));
    if (attendeeLine) attendees = attendeeLine.replace(/^.*?:\s*/, "").slice(0, 60);
    const paxMatch = text.match(/\b(\d+)\s*(?:pax|guests?|travell?ers?|passengers?|people|persons?)\b/i);
    if (paxMatch) paxCount = parseInt(paxMatch[1]);
  }

  // First pass: find any fully-qualified year in the doc to use as fallback
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const fallbackYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  // GDS flight strings (e.g. "QF 002J 02NOV LHRSYD 2010 0635+2") — extract structured
  // flights up-front so they aren't mis-parsed as generic lines.
  const gdsEvents: ParsedEvent[] = [];
  GDS_FLIGHT_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = GDS_FLIGHT_RE.exec(text)) !== null) {
      const [, carrier, num, , day, monCode, orig, dest, depRaw] = m;
      const mon = MONTH_CODE[monCode.toUpperCase()];
      if (!mon) continue;
      const date = `${fallbackYear}-${mon}-${day.padStart(2, "0")}`;
      const time = parseTime(depRaw);
      gdsEvents.push({
        id: `imp-gds-${Date.now()}-${gdsEvents.length}`,
        type: "flight",
        date,
        time,
        title: `${carrier}${num} — ${orig} to ${dest}`,
        location: `${orig} → ${dest}`,
      });
    }
  }

  // Collect all dates (with fallback year for year-less matches)
  const allDates: string[] = [];
  for (const line of lines) {
    for (const pat of DATE_PATTERNS) {
      pat.lastIndex = 0;
      const matches = line.match(pat) ?? [];
      for (const m of matches) {
        const d = parseDate(m, fallbackYear);
        if (d) allDates.push(d);
      }
    }
  }
  for (const ev of gdsEvents) allDates.push(ev.date);
  const uniqueDates = [...new Set(allDates)].sort();
  const start = uniqueDates[0] ?? new Date().toISOString().split("T")[0];
  const end = uniqueDates[uniqueDates.length - 1] ?? start;

  // Destination: prefer "flight to X" and "arrive in X" over "transfer to [hotel]"
  // Run regex against the merged lines (no stray newlines) rather than raw text.
  const mergedText = lines.join("\n");
  let destination = "";
  const MONTH_NAMES = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
  const HOTEL_NAMES = /^(Sarova|Norfolk|Governors|Panafric|Marjani|Regnum|Crown|Wilson)/i;
  // Common first names that appear in attendee lists / rooming — reject as destinations
  const PERSON_NAMES = /^(Adam|Alex|Alice|Andrew|Anna|Ben|Brian|Caroline|Catherine|Charles|Chris|Claire|Colin|Daniel|David|Diana|Edward|Elizabeth|Emily|Emma|Frances|Frank|Gary|George|Grace|Hannah|Harry|Helen|Henry|Hugh|Ian|Jack|James|Jamie|Jane|Jean|Jennifer|Jessica|Jim|Joan|John|Jonathan|Joseph|Julia|Karen|Kate|Keith|Kevin|Kim|Laura|Lauren|Lee|Linda|Lisa|Louise|Lucy|Luke|Margaret|Maria|Mark|Martin|Mary|Matthew|Michael|Michelle|Mike|Nancy|Nicholas|Oliver|Owen|Patricia|Patrick|Paul|Peter|Philip|Rachel|Rebecca|Richard|Robert|Roger|Rose|Ruth|Ryan|Sam|Sandra|Sarah|Scott|Sharon|Simon|Sophie|Stephen|Steven|Stuart|Susan|Thomas|Tim|Tom|Victoria|William|Zoe)\b/i;
  // Validate: not a month, not a hotel, not a person name
  const isValidDest = (s: string) =>
    !MONTH_NAMES.test(s) && !HOTEL_NAMES.test(s) && !PERSON_NAMES.test(s.split(/\s+/)[0]);
  // Try "flight to" / "arrive in" first (higher confidence destination)
  const flightTo = mergedText.match(/\b(?:flight\s+to|arrive[sd]?\s+in|arriving\s+in|arrival\s+in)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+){0,2})/);
  if (flightTo && isValidDest(flightTo[1])) destination = flightTo[1];
  // Fall back to "transfer to" (may be a hotel, filter those out)
  if (!destination) {
    const transferTo = mergedText.match(/\b(?:transfer\s+to)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+){0,2})/);
    if (transferTo && isValidDest(transferTo[1])) destination = transferTo[1];
  }
  if (!destination) {
    const destMatch = mergedText.match(/\b(?:in|at|visiting|destination:?\s*)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)/);
    if (destMatch && isValidDest(destMatch[1])) destination = destMatch[1];
  }
  // Use the trip name as a fallback source for destination
  if (!destination) {
    const nameDestMatch = nameLine.match(/(?:to|in|–|—|-)\s*([A-Z][a-z]{2,}(?:\s+[A-Z&][a-z]+){0,3})/);
    if (nameDestMatch && isValidDest(nameDestMatch[1])) destination = nameDestMatch[1];
  }
  // Clean up: strip any embedded whitespace/newlines
  destination = destination.replace(/\s+/g, " ").trim();

  // Build events
  const events: ParsedEvent[] = [];
  let currentDate = start;
  const DAY_SECTION = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d/i;
  const SKIP_SECTION = /^(?:accommodation|single rooms?|twin rooms?|double rooms?|attendees?|additional activities|notes?|rooming\s+list|emergency\s+contact|single\s+[A-Z]|twin\s+[A-Z]|double\s+[A-Z])/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Update running date from day headers like "Tuesday 21st April:"
    for (const pat of DATE_PATTERNS) {
      pat.lastIndex = 0;
      const m = line.match(pat)?.[0];
      if (m) { const d = parseDate(m, fallbackYear); if (d) currentDate = d; }
    }

    if (DAY_SECTION.test(line) || SKIP_SECTION.test(line)) continue;

    // Skip lines already captured as GDS flight strings.
    GDS_FLIGHT_RE.lastIndex = 0;
    if (GDS_FLIGHT_RE.test(line)) continue;

    // Detect time: HH:MM / HH.MM (optional am/pm/md), bare "1pm"/"9am",
    // 4-digit military ("0930", "1015hrs", "1545pm"),
    // context-prefixed 4-digit ("ETD 1045", "at 0930"),
    // or 4-digit followed by flight context ("0930 departure", "1045 flight").
    const TIME_RE = /\b\d{1,2}[.:]\d{2}\s*(?:am|pm|md)?\b|\b\d{1,2}\s*(?:am|pm)\b|\b\d{4}\s*(?:hrs?|am|pm)\b|\b(?:etd|eta|at|pickup|depart(?:ing|ure|s)?|arriv(?:ing|al|e)?)\s+\d{4}\b|\b\d{4}\s+(?:depart(?:ing|ure|s)?|arriv(?:ing|al|e)?|flight)\b/i;
    const hasTime = TIME_RE.test(line);

    const hasEventKeyword = /\b(flight|fly|depart|arrive|airport|hotel|resort|check.?in|check.?out|dinner|lunch|breakfast|brunch|restaurant|bistro|caf[eé]|tour|visit|transfer|excursion|safari|cruise|museum|drive|hike|boat|spa|golf|meeting|welcome|drinks|cocktail|experience|beach club|aquapark|camp|lodge|overnight|balloon|snorkell?ing|diving|spice|game\s*drive|bush|sunrise|sunset|inspection|lounge)\b/i.test(line);

    // Standalone meal lines (e.g. just "Breakfast" on its own line)
    const mealOnly = line.match(/^(breakfast|lunch|dinner|brunch)$/i);

    if (mealOnly) {
      const meal = mealOnly[1].toLowerCase();
      events.push({
        id: `imp-${Date.now()}-${events.length}`,
        type: "dining",
        date: currentDate,
        time: MEAL_DEFAULTS[meal] ?? "12:00 PM",
        title: mealOnly[1].charAt(0).toUpperCase() + mealOnly[1].slice(1).toLowerCase(),
        location: "",
      });
      continue;
    }

    if ((hasTime || hasEventKeyword) && line.length > 4 && line.length < 250) {
      const type = guessEventType(line);

      // Extract time — same alternation as detection so we grab whichever form appeared.
      const timeMatch = line.match(TIME_RE);
      let time = "12:00 PM";
      if (timeMatch) time = parseTime(timeMatch[0]);

      // Strip leading "17:30 –" / "10.00:" / "0930 -" / "ETD 1045hrs –" prefixes,
      // then remove any remaining time mentions from the body.
      const title = line
        .replace(/^(?:\d{1,2}[.:]\d{2}\s*(?:am|pm|md)?|\d{4}\s*(?:hrs?|am|pm)?|(?:etd|eta)\s+\d{4}(?:\s*hrs?)?)\s*[-–—:.]\s*/i, "")
        .replace(/\b\d{1,2}[.:]\d{2}\s*(?:am|pm|md)?\b/gi, "")
        .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, "")
        .replace(/\b\d{4}\s*(?:hrs?|am|pm)\b/gi, "")
        .replace(/\b(?:etd|eta|pickup)\s+\d{4}\b/gi, "")
        .replace(/^[\s\-–—:·.,]+/, "")
        .replace(/[\s\-–—:]+$/, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100) || "Event";

      const locMatch = line.match(/(?:\bat\b|@|,)\s+([A-Z][^,\n]{3,40})/);
      const location = locMatch ? locMatch[1].trim() : "";

      if (title.length > 2) {
        events.push({
          id: `imp-${Date.now()}-${events.length}`,
          type, date: currentDate, time, title, location,
        });
      }
    }
  }

  const allEvents = [...gdsEvents, ...events].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  // ── Extract Information & Documents ──────────────────────────────────────────
  // Pull out named sections like Accommodation, Additional Activities, Notes,
  // Emergency Contact, Important Information etc. as info cards.
  const info: ParsedInfo[] = [];
  const INFO_SECTION_RE = /^(accommodation|additional\s+activit|important\s+info|emergency\s+contact|notes?\b|special\s+requirements?|what\s+to\s+(?:bring|pack)|inclusions?|exclusions?|travel\s+(?:insurance|tips)|visa\s+(?:info|requirements?)|health\s+(?:info|requirements?)|luggage|baggage|dress\s+code|weather|currency|tips?\s+&?\s*gratuities?)/i;
  const DAY_HEADER_RE = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = line.match(INFO_SECTION_RE);
    if (!sectionMatch) continue;

    // Collect all lines until next section header or day header
    const titleRaw = line.replace(/:\s*$/, "").trim();
    const bodyLines: string[] = [];
    // If the title line has content after a colon, include that too
    const afterColon = line.replace(/^[^:]+:\s*/, "");
    if (afterColon !== line && afterColon.trim()) bodyLines.push(afterColon.trim());

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      // Stop at day headers, new info sections, or date-like lines
      if (DAY_HEADER_RE.test(next) || INFO_SECTION_RE.test(next) || /^attendees?\s*:?\s*$/i.test(next) || /^rooming\s+list/i.test(next)) break;
      // Stop at date patterns that start a new day
      let isDateHeader = false;
      for (const pat of DATE_PATTERNS) {
        pat.lastIndex = 0;
        if (pat.test(next) && next.length < 40) { isDateHeader = true; break; }
      }
      if (isDateHeader) break;
      bodyLines.push(next);
    }

    if (bodyLines.length > 0) {
      info.push({ title: titleRaw, body: bodyLines.join("\n") });
    }
  }

  // ── Extract Organizer ────────────────────────────────────────────────────────
  // Look for "organized by", "your consultant", "contact", agent/rep details
  let organizer: ParsedOrganizer | undefined;
  const ORG_RE = /^(?:organiz(?:er|ed\s+by)|your\s+(?:consultant|agent|representative|contact)|trip\s+(?:manager|coordinator|leader)|contact\s+(?:person|details?))\s*:?\s*/i;
  const orgIdx = lines.findIndex(l => ORG_RE.test(l));
  if (orgIdx >= 0) {
    const orgLine = lines[orgIdx].replace(ORG_RE, "").trim();
    const orgName = orgLine || (orgIdx + 1 < lines.length ? lines[orgIdx + 1].trim() : "");
    if (orgName && orgName.length < 60) {
      organizer = { name: orgName };
      // Scan next few lines for email/phone/role/company
      for (let j = orgIdx + 1; j < Math.min(orgIdx + 6, lines.length); j++) {
        const l = lines[j];
        if (DAY_HEADER_RE.test(l) || INFO_SECTION_RE.test(l)) break;
        const emailMatch = l.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (emailMatch && !organizer.email) organizer.email = emailMatch[0];
        const phoneMatch = l.match(/(?:\+?\d[\d\s()-]{7,})/);
        if (phoneMatch && !organizer.phone) organizer.phone = phoneMatch[0].trim();
      }
    }
  }

  return { name: nameLine.slice(0, 80), attendees, paxCount, parsedTravelerNames, start, end, destination, events: allEvents, extractedMedia, organizer, info };
}

// ─── Component ─────────────────────────────────────────────────────────────────

type Step = "upload" | "extracting" | "review" | "importing";

export function ImportItineraryDialog({ open, onOpenChange, initialFile, existingTripId }: ImportItineraryDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedTrip | null>(null);
  const [rawText, setRawText] = useState("");
  const [editInfo, setEditInfo] = useState<ParsedInfo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { trips, addTrip, updateTrip } = useTrips();
  const { showToast, addNotification } = useNotifications();
  const isReimport = !!existingTripId;

  // Auto-process a file dropped from the dashboard
  useEffect(() => {
    if (open && initialFile) {
      handleFile(initialFile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const ACCEPTED = ".pdf,.docx,.pptx,.txt,.doc";

  const reset = () => {
    setStep("upload");
    setError("");
    setParsed(null);
    setRawText("");
    setEditInfo([]);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processText = (text: string, media: ExtractedMedia[] = []) => {
    setRawText(text);
    const result = parseItinerary(text, media);
    console.log("[Import] parsed info:", result.info.length, result.info.map(i => i.title), "organizer:", result.organizer);
    setParsed(result);
    setEditInfo(result.info.map(i => ({ ...i })));
    setStep("review");
  };

  const handleFile = async (file: File) => {
    setError("");
    setStep("extracting");
    try {
      const { text, media } = await extractContent(file);
      if (!text.trim()) throw new Error("No readable text found in this file.");
      processText(text, media);
    } catch (e: any) {
      setError(e.message ?? "Could not read this file.");
      setStep("upload");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setStep("importing");
    setImportProgress({ done: 0, total: parsed.events.length });
    const DEFAULT_COVER = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1600&auto=format&fit=crop";
    let coverImage = DEFAULT_COVER;
    if (parsed.destination) {
      const candidates = buildImageQueryCandidates({ title: parsed.destination, location: parsed.destination });
      candidates.push(parsed.destination + " travel");
      const { urls } = await searchImagesProgressive(candidates, 1);
      if (urls[0]) coverImage = urls[0];
    }

    // Resolve a per-event image. Throttle to 3 concurrent to stay under rate limits.
    const CACHE_KEY = "daf-event-image-cache-v1";
    let cache: Record<string, string> = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { /* ignore */ }
    const resolveEventImage = async (ev: TravelEvent): Promise<string | undefined> => {
      if (ev.image) return ev.image;
      const candidates = buildImageQueryCandidates({ title: ev.title, location: ev.location, type: ev.type });
      const cacheKey = candidates.join("|");
      if (cache[cacheKey]) return cache[cacheKey];
      const { urls } = await searchImagesProgressive(candidates, 1);
      const url = urls[0];
      if (url) { cache[cacheKey] = url; }
      return url;
    };
    const events: TravelEvent[] = [...parsed.events] as TravelEvent[];
    const CONCURRENCY = 3;
    for (let i = 0; i < events.length; i += CONCURRENCY) {
      const slice = events.slice(i, i + CONCURRENCY);
      const imgs = await Promise.all(slice.map(resolveEventImage));
      imgs.forEach((url, j) => { if (url) events[i + j] = { ...events[i + j], image: url }; });
      setImportProgress({ done: Math.min(i + CONCURRENCY, events.length), total: events.length });
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }

    // Convert extracted images into TripMedia entries
    const tripMedia: Trip["media"] = (parsed.extractedMedia ?? []).map((m, idx) => ({
      id: `ext-${Date.now()}-${idx}`,
      type: m.type,
      name: m.name,
      url: m.dataUrl,
      size: m.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: "Import",
    }));

    // Use the first extracted image as the cover if no Unsplash image was found
    if (coverImage === DEFAULT_COVER && tripMedia.length > 0) {
      coverImage = tripMedia[0].url;
    }

    // Match/create travelers from parsed names
    let travelerIds: string[] | undefined;
    let tripTravelers: Trip["travelers"] | undefined;
    let finalAttendees = parsed.attendees;
    let finalPaxCount = parsed.paxCount > 0 ? String(parsed.paxCount) : undefined;

    if (parsed.parsedTravelerNames.length > 0) {
      const stored = JSON.parse(localStorage.getItem("daf-custom-travelers") || "[]") as User[];
      const result = matchOrCreateTravelers(parsed.parsedTravelerNames, stored);
      travelerIds = result.travelerIds;
      tripTravelers = result.travelers;
      finalAttendees = result.attendees;
      finalPaxCount = String(result.travelerIds.length);
      if (result.newTravelers.length > 0) {
        localStorage.setItem("daf-custom-travelers", JSON.stringify([...stored, ...result.newTravelers]));
        notifyLocalStorage("daf-custom-travelers");
      }
    }

    const cleanedInfo = editInfo.filter(i => i.title.trim() || i.body.trim());
    console.log("[Import] editInfo:", editInfo.length, "cleanedInfo:", cleanedInfo.length, "organizer:", parsed.organizer);

    if (isReimport && existingTripId) {
      // Re-import: update text/events/travelers but keep existing media, image, status
      const existing = trips.find(t => t.id === existingTripId);
      const updates: Partial<Trip> = {
        name: parsed.name,
        attendees: finalAttendees,
        paxCount: finalPaxCount,
        start: parsed.start,
        end: parsed.end,
        destination: parsed.destination,
        events,
        travelerIds: travelerIds ?? [],
        travelers: tripTravelers ?? [],
      };
      if (parsed.organizer) {
        updates.organizer = parsed.organizer;
      }
      // Always overwrite info on re-import — replace old entries with parsed + edited ones
      updates.info = cleanedInfo.length > 0
        ? cleanedInfo.map((item, idx) => ({ id: `info-${Date.now()}-${idx}`, ...item }))
        : undefined;
      // Merge media: dedupe by URL — new entries overwrite matching existing ones
      if (tripMedia.length > 0) {
        const existingMedia = existing?.media || [];
        const newUrls = new Set(tripMedia.map(m => m.url));
        updates.media = [...existingMedia.filter(m => !newUrls.has(m.url)), ...tripMedia];
      }
      updateTrip(existingTripId, updates);
      showToast(`Updated "${parsed.name}" — ${events.length} events`);
      addNotification({ message: "Itinerary re-imported", detail: parsed.name, time: "Just now", type: "success" });
    } else {
      const trip: Trip = {
        id: Date.now().toString(),
        name: parsed.name,
        attendees: finalAttendees,
        paxCount: finalPaxCount,
        start: parsed.start,
        end: parsed.end,
        status: "Draft",
        destination: parsed.destination,
        image: coverImage,
        events,
        media: tripMedia.length > 0 ? tripMedia : undefined,
        travelerIds,
        travelers: tripTravelers,
        organizer: parsed.organizer,
        info: cleanedInfo.length > 0 ? cleanedInfo.map((item, idx) => ({ id: `info-${Date.now()}-${idx}`, ...item })) : undefined,
      };
      addTrip(trip);
      const mediaSuffix = tripMedia.length > 0 ? ` + ${tripMedia.length} media` : "";
      showToast(`Imported "${trip.name}" — ${trip.events.length} events${mediaSuffix}`);
      addNotification({ message: "Itinerary imported", detail: trip.name, time: "Just now", type: "success" });
    }
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto bg-white dark:bg-[#111111] rounded-2xl sm:rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-5 sm:p-8 md:p-10 shadow-2xl">
        <DialogHeader className="space-y-2 mb-5 sm:mb-6 text-left">
          <DialogTitle className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
            {isReimport ? "Re-import Itinerary" : "Import Itinerary"}
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-[#888] font-medium uppercase text-xs tracking-[0.2em]">
            {step === "upload" && "PDF · Word · PowerPoint · Text"}
            {step === "extracting" && "Reading document..."}
            {step === "review" && `${parsed?.events.length ?? 0} events${(parsed?.extractedMedia.length ?? 0) > 0 ? ` + ${parsed!.extractedMedia.length} media` : ""} found — review before importing`}
            {step === "importing" && "Matching images to events..."}
          </DialogDescription>
        </DialogHeader>

        {/* ── STEP 1: UPLOAD ── */}
        {step === "upload" && (
          <div className="space-y-6">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="flex flex-col items-center justify-center gap-4 p-6 sm:p-10 bg-slate-50 dark:bg-[#0a0a0a] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl hover:border-brand/60 transition-colors group"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center cursor-pointer hover:bg-brand/25 hover:scale-105 transition-all shadow-sm"
                aria-label="Choose a file to upload"
              >
                <Upload className="h-6 w-6 text-brand" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Click the icon or drop a file</p>
                <p className="text-xs text-slate-500 dark:text-[#888888] mt-1 uppercase tracking-widest">PDF · DOCX · PPTX · TXT</p>
              </div>
            </div>
            {createPortal(
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0 }}
              />,
              document.body
            )}

            {error && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs font-bold text-red-400">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">OR PASTE TEXT</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
            </div>

            <div className="space-y-3">
              <textarea
                placeholder="Paste itinerary text here — the parser will extract dates, flights, hotels, and activities automatically..."
                className="w-full min-h-[140px] p-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-base sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#444] focus:outline-none focus:border-brand resize-none transition-colors"
                onChange={e => setRawText(e.target.value)}
                value={rawText}
              />
              <Button
                onClick={() => { if (rawText.trim()) processText(rawText); }}
                disabled={!rawText.trim()}
                className="w-full h-12 rounded-2xl font-bold bg-brand hover:opacity-90 text-black shadow-lg shadow-brand/20 uppercase tracking-wider"
              >
                Parse Text <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: EXTRACTING ── */}
        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 text-brand animate-spin" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">Extracting text, images &amp; attachments...</p>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 text-brand animate-spin" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">
              Matching images {importProgress.done}/{importProgress.total}
            </p>
            <div className="w-64 h-1.5 rounded-full bg-slate-200 dark:bg-[#1f1f1f] overflow-hidden">
              <div className="h-full bg-brand transition-all duration-300" style={{ width: `${importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        {/* ── STEP 3: REVIEW ── */}
        {step === "review" && parsed && (
          <div className="space-y-5">
            {/* Trip summary */}
            <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-[#1f1f1f] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Trip Name</p>
                <button onClick={() => { setStep("upload"); setRawText(rawText); }} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-brand transition-colors">
                  ← Back
                </button>
              </div>
              <p className="text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{parsed.name}</p>
              <div className="flex items-center gap-4 sm:gap-6 pt-1 flex-wrap">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">Start</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{parsed.start}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">End</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{parsed.end}</p>
                </div>
                {parsed.destination && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">Destination</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{parsed.destination}</p>
                  </div>
                )}
                {parsed.paxCount > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">Pax</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{parsed.paxCount}</p>
                  </div>
                )}
              </div>
              {/* Attendees list */}
              {parsed.parsedTravelerNames.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-[#1f1f1f]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] mb-2">
                    Travelers ({parsed.parsedTravelerNames.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.parsedTravelerNames.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-[11px] font-bold text-slate-700 dark:text-[#ccc]"
                      >
                        <span className="h-5 w-5 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center text-brand text-[8px] font-black uppercase shrink-0">
                          {name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Information & Documents preview (editable) */}
              {editInfo.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-[#1f1f1f]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] mb-2">
                    Information ({editInfo.length})
                  </p>
                  <div className="space-y-2">
                    {editInfo.map((item, i) => (
                      <div key={i} className="relative group/info rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] p-3 hover:border-brand/30 transition-colors">
                        <button
                          type="button"
                          aria-label="Remove info"
                          onClick={() => setEditInfo(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-2 right-2 h-6 w-6 rounded-lg flex items-center justify-center text-slate-300 dark:text-[#444] hover:text-red-400 opacity-0 group-hover/info:opacity-100 transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="flex items-start gap-2.5">
                          <div className="h-5 w-5 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-1">
                            <FileText className="h-3 w-3 text-brand" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => setEditInfo(prev => prev.map((it, j) => j === i ? { ...it, title: e.target.value } : it))}
                              className="w-full text-[11px] font-bold text-slate-700 dark:text-[#ccc] bg-transparent border-none outline-none p-0 placeholder:text-slate-400 dark:placeholder:text-[#555]"
                              placeholder="Title"
                            />
                            <textarea
                              value={item.body}
                              onChange={(e) => setEditInfo(prev => prev.map((it, j) => j === i ? { ...it, body: e.target.value } : it))}
                              rows={Math.min(item.body.split("\n").length + 1, 5)}
                              className="w-full text-[10px] text-slate-500 dark:text-[#888] bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1a1a1a] rounded-lg p-2 leading-relaxed resize-none outline-none focus:border-brand/30 transition-colors placeholder:text-slate-400 dark:placeholder:text-[#555]"
                              placeholder="Details..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Events list */}
            {parsed.events.length > 0 ? (
              <div className="space-y-2 max-h-[260px] sm:max-h-[280px] overflow-y-auto pr-1 -mx-1 px-1">
                {parsed.events.map(ev => {
                  const Icon = EVENT_TYPE_ICONS[ev.type];
                  return (
                    <div key={ev.id} className="flex items-start gap-3 p-3 bg-white dark:bg-[#0d0d0d] border border-slate-100 dark:border-[#1f1f1f] rounded-xl">
                      <div className={`h-9 w-9 rounded-lg bg-slate-50 dark:bg-[#111] border border-slate-100 dark:border-[#1f1f1f] flex items-center justify-center shrink-0 ${EVENT_TYPE_COLORS[ev.type]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] sm:text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">{ev.title}</p>
                        <p className="text-[11px] sm:text-[10px] text-slate-500 dark:text-[#888888] mt-1 break-words">{ev.date} · {ev.time}{ev.location ? ` · ${ev.location}` : ""}</p>
                      </div>
                      <button
                        aria-label="Remove event"
                        onClick={() => setParsed(p => p ? { ...p, events: p.events.filter(e => e.id !== ev.id) } : null)}
                        className="-m-1 p-1 h-9 w-9 flex items-center justify-center text-slate-300 dark:text-[#444] hover:text-red-400 transition-colors shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 bg-slate-50 dark:bg-[#0a0a0a] rounded-2xl border border-dashed border-slate-200 dark:border-[#1f1f1f]">
                <AlertCircle className="h-5 w-5 text-amber-400" />
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888888]">No events detected</p>
                <p className="text-[10px] text-slate-500 dark:text-[#888888] text-center max-w-[240px]">The parser couldn't find recognisable events. The trip will be created as a blank draft.</p>
              </div>
            )}

            {/* Extracted media preview */}
            {parsed.extractedMedia.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">
                  Extracted Media ({parsed.extractedMedia.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {parsed.extractedMedia.map((m, i) => (
                    <div key={i} className="relative shrink-0 group">
                      <img
                        src={m.dataUrl}
                        alt={m.name}
                        className="h-16 w-24 object-cover rounded-lg border border-slate-200 dark:border-[#1f1f1f]"
                      />
                      <button
                        aria-label={`Remove ${m.name}`}
                        onClick={() => setParsed(p => p ? { ...p, extractedMedia: p.extractedMedia.filter((_, j) => j !== i) } : null)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4 sticky bottom-0 bg-white dark:bg-[#111111] pb-1 -mx-1 px-1 border-t border-slate-100 dark:border-[#1f1f1f] mt-2">
              <Button variant="ghost" onClick={() => handleClose(false)} className="flex-1 rounded-2xl h-12 font-bold text-slate-500 dark:text-[#888]">Cancel</Button>
              <Button
                onClick={handleImport}
                className="flex-1 rounded-2xl h-12 font-bold bg-brand hover:opacity-90 text-black shadow-lg shadow-brand/20 uppercase tracking-wider gap-2"
              >
                <CheckCircle2 className="h-4 w-4" /> {isReimport ? "Update" : "Import"} {parsed.events.length} Events{parsed.extractedMedia.length > 0 ? ` + ${parsed.extractedMedia.length} Media` : ""}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
