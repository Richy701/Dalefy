import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, ChevronRight, X, Plane, Hotel, Compass, Utensils } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import type { Trip, TravelEvent } from "@/types";

interface ImportItineraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Text extraction ───────────────────────────────────────────────────────────

async function extractFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(" "));
  }
  return pages.join("\n");
}

async function extractFromDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function extractFromPptx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const texts: string[] = [];
  const slideFiles = Object.keys(zip.files)
    .filter(name => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("text");
    const stripped = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    texts.push(stripped);
  }
  return texts.join("\n");
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return extractFromPdf(file);
  if (ext === "docx") return extractFromDocx(file);
  if (ext === "pptx") return extractFromPptx(file);
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target?.result as string ?? "");
    reader.onerror = rej;
    reader.readAsText(file);
  });
}

// ─── Heuristic parser ──────────────────────────────────────────────────────────

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_PATTERNS = [
  new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s+(\\d{4})`, "gi"),
  new RegExp(`${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "gi"),
  /(\d{4})-(\d{2})-(\d{2})/g,
  /(\d{2})\/(\d{2})\/(\d{4})/g,
];

function parseDate(str: string): string | null {
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m1 = str.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w{3})\w*\s+(\d{4})/i);
  if (m1) {
    const mon = months[m1[2].toLowerCase().slice(0, 3)];
    if (mon) return `${m1[3]}-${mon}-${m1[1].padStart(2, "0")}`;
  }
  const m2 = str.match(/(\w{3})\w*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (m2) {
    const mon = months[m2[1].toLowerCase().slice(0, 3)];
    if (mon) return `${m2[3]}-${mon}-${m2[2].padStart(2, "0")}`;
  }
  return null;
}

function parseTime(str: string): string {
  const t = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!t) return "12:00 PM";
  let h = parseInt(t[1]);
  const m = t[2];
  const ampm = t[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

type EventType = "flight" | "hotel" | "activity" | "dining";

function guessEventType(line: string): EventType {
  const l = line.toLowerCase();
  if (/\b(flight|fly|depart|arrive|airport|airline|airways|air\s|boarding|check-in flight|gate)\b/.test(l)) return "flight";
  if (/\b(hotel|resort|lodge|inn|accommodation|check.?in|check.?out|room|suite|villa|stay)\b/.test(l)) return "hotel";
  if (/\b(dinner|lunch|breakfast|brunch|restaurant|bistro|café|cafe|dining|meal|eat)\b/.test(l)) return "dining";
  return "activity";
}

const EVENT_TYPE_ICONS: Record<EventType, typeof Plane> = {
  flight: Plane, hotel: Hotel, activity: Compass, dining: Utensils,
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  flight: "text-slate-500 dark:text-slate-400",
  hotel: "text-amber-400",
  activity: "text-[#0bd2b5]",
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

interface ParsedTrip {
  name: string;
  attendees: string;
  start: string;
  end: string;
  destination: string;
  events: ParsedEvent[];
}

function parseItinerary(text: string): ParsedTrip {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  // Trip name: first meaningful line (not a date, not too short)
  const nameLine = lines.find(l => l.length > 5 && l.length < 120 && !/^\d/.test(l)) ?? "Imported Trip";

  // Attendees: look for keywords
  const attendeeLine = lines.find(l => /\b(pax|guest|travell?er|client|passenger|group|team|person)\b/i.test(l));
  const attendees = attendeeLine ? attendeeLine.replace(/^.*?:\s*/, "").slice(0, 60) : "Imported Group";

  // Collect all dates in the document
  const allDates: string[] = [];
  for (const line of lines) {
    for (const pat of DATE_PATTERNS) {
      pat.lastIndex = 0;
      const matches = line.match(pat) ?? [];
      for (const m of matches) {
        const d = parseDate(m);
        if (d) allDates.push(d);
      }
    }
  }
  const uniqueDates = [...new Set(allDates)].sort();
  const start = uniqueDates[0] ?? new Date().toISOString().split("T")[0];
  const end = uniqueDates[uniqueDates.length - 1] ?? start;

  // Destination: look for "to/in/at [City/Country]" near name or start
  let destination = "";
  const destMatch = text.match(/\b(?:to|in|at|visiting|destination:?\s*)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (destMatch) destination = destMatch[1];

  // Build events: scan for lines with dates or time patterns
  const events: ParsedEvent[] = [];
  let currentDate = start;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Update running date
    for (const pat of DATE_PATTERNS) {
      pat.lastIndex = 0;
      const m = line.match(pat)?.[0];
      if (m) {
        const d = parseDate(m);
        if (d) currentDate = d;
      }
    }

    const hasTime = /\d{1,2}:\d{2}/.test(line);
    const hasEventKeyword = /\b(flight|fly|depart|arrive|airport|hotel|resort|check.?in|check.?out|dinner|lunch|breakfast|restaurant|tour|visit|transfer|activity|excursion|safari|cruise|museum|drive|hike|boat|spa)\b/i.test(line);

    if ((hasTime || hasEventKeyword) && line.length > 8 && line.length < 200) {
      const type = guessEventType(line);
      const timeMatch = line.match(/\d{1,2}:\d{2}\s*(?:am|pm)?/i);
      const time = timeMatch ? parseTime(timeMatch[0]) : "12:00 PM";
      const title = line
        .replace(/\d{1,2}:\d{2}\s*(?:am|pm)?/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Event";

      // Try to extract location from next line or parenthetical
      const locMatch = line.match(/(?:at|@|,)\s+([A-Z][^,\n]{3,40})/);
      const location = locMatch ? locMatch[1].trim() : (lines[i + 1]?.length < 60 ? lines[i + 1] : "");

      events.push({
        id: `imp-${Date.now()}-${events.length}`,
        type, date: currentDate, time, title, location,
      });
    }
  }

  return { name: nameLine.slice(0, 80), attendees, start, end, destination, events };
}

// ─── Component ─────────────────────────────────────────────────────────────────

type Step = "upload" | "extracting" | "review";

export function ImportItineraryDialog({ open, onOpenChange }: ImportItineraryDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedTrip | null>(null);
  const [rawText, setRawText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addTrip } = useTrips();
  const { showToast, addNotification } = useNotifications();

  const ACCEPTED = ".pdf,.docx,.pptx,.txt,.doc";

  const reset = () => {
    setStep("upload");
    setError("");
    setParsed(null);
    setRawText("");
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processText = (text: string) => {
    setRawText(text);
    const result = parseItinerary(text);
    setParsed(result);
    setStep("review");
  };

  const handleFile = async (file: File) => {
    setError("");
    setStep("extracting");
    try {
      const text = await extractText(file);
      if (!text.trim()) throw new Error("No readable text found in this file.");
      processText(text);
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

  const handleImport = () => {
    if (!parsed) return;
    const trip: Trip = {
      id: Date.now().toString(),
      name: parsed.name,
      attendees: parsed.attendees,
      start: parsed.start,
      end: parsed.end,
      status: "Draft",
      destination: parsed.destination,
      image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1000&auto=format&fit=crop",
      events: parsed.events.map(e => ({ ...e } as TravelEvent)),
    };
    addTrip(trip);
    showToast(`Imported "${trip.name}" — ${trip.events.length} events`);
    addNotification({ message: "Itinerary imported", detail: trip.name, time: "Just now", type: "success" });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-10 shadow-2xl">
        <DialogHeader className="space-y-2 mb-6 text-left">
          <DialogTitle className="text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
            Import Itinerary
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-[#888] font-medium uppercase text-xs tracking-[0.2em]">
            {step === "upload" && "PDF · Word · PowerPoint · Text"}
            {step === "extracting" && "Reading document..."}
            {step === "review" && `${parsed?.events.length ?? 0} events found — review before importing`}
          </DialogDescription>
        </DialogHeader>

        {/* ── STEP 1: UPLOAD ── */}
        {step === "upload" && (
          <div className="space-y-6">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-4 p-10 bg-slate-50 dark:bg-[#0a0a0a] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl cursor-pointer hover:border-[#0bd2b5] hover:bg-[#0bd2b5]/5 transition-all group"
            >
              <div className="h-14 w-14 rounded-2xl bg-[#0bd2b5]/10 flex items-center justify-center group-hover:bg-[#0bd2b5]/20 transition-colors">
                <Upload className="h-6 w-6 text-[#0bd2b5]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Drop a file or click to browse</p>
                <p className="text-xs text-slate-500 dark:text-[#888888] mt-1 uppercase tracking-widest">PDF · DOCX · PPTX · TXT</p>
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

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
                className="w-full min-h-[140px] p-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#444] focus:outline-none focus:border-[#0bd2b5] resize-none transition-colors"
                onChange={e => setRawText(e.target.value)}
                value={rawText}
              />
              <Button
                onClick={() => { if (rawText.trim()) processText(rawText); }}
                disabled={!rawText.trim()}
                className="w-full h-12 rounded-2xl font-bold bg-[#0bd2b5] hover:opacity-90 text-black shadow-lg shadow-[#0bd2b5]/20 uppercase tracking-wider"
              >
                Parse Text <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: EXTRACTING ── */}
        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 text-[#0bd2b5] animate-spin" />
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">Extracting content...</p>
          </div>
        )}

        {/* ── STEP 3: REVIEW ── */}
        {step === "review" && parsed && (
          <div className="space-y-5">
            {/* Trip summary */}
            <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-2xl p-5 border border-slate-200 dark:border-[#1f1f1f] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Trip Name</p>
                <button onClick={() => { setStep("upload"); setRawText(rawText); }} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-[#0bd2b5] transition-colors">
                  ← Back
                </button>
              </div>
              <p className="text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{parsed.name}</p>
              <div className="flex items-center gap-6 pt-1">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">Start</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{parsed.start}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">End</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{parsed.end}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888]">Travelers</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[140px]">{parsed.attendees}</p>
                </div>
              </div>
            </div>

            {/* Events list */}
            {parsed.events.length > 0 ? (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {parsed.events.map(ev => {
                  const Icon = EVENT_TYPE_ICONS[ev.type];
                  return (
                    <div key={ev.id} className="flex items-start gap-3 p-3 bg-white dark:bg-[#0d0d0d] border border-slate-100 dark:border-[#1f1f1f] rounded-xl">
                      <div className={`h-8 w-8 rounded-lg bg-slate-50 dark:bg-[#111] border border-slate-100 dark:border-[#1f1f1f] flex items-center justify-center shrink-0 ${EVENT_TYPE_COLORS[ev.type]}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{ev.title}</p>
                        <p className="text-[10px] text-slate-500 dark:text-[#888888] mt-0.5">{ev.date} · {ev.time}{ev.location ? ` · ${ev.location}` : ""}</p>
                      </div>
                      <button onClick={() => setParsed(p => p ? { ...p, events: p.events.filter(e => e.id !== ev.id) } : null)} className="text-slate-300 dark:text-[#444] hover:text-red-400 transition-colors shrink-0 mt-0.5">
                        <X className="h-3.5 w-3.5" />
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

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => handleClose(false)} className="flex-1 rounded-2xl h-12 font-bold text-slate-500 dark:text-[#888]">Cancel</Button>
              <Button
                onClick={handleImport}
                className="flex-1 rounded-2xl h-12 font-bold bg-[#0bd2b5] hover:opacity-90 text-black shadow-lg shadow-[#0bd2b5]/20 uppercase tracking-wider gap-2"
              >
                <CheckCircle2 className="h-4 w-4" /> Import {parsed.events.length} Events
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
