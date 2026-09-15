import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { DEVICES, FINISHES, type Device } from "./phoneFrameConfig";
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle, PopoverDescription } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { Users, CaretRight, CaretLeft, Sun, Moon, DeviceMobileCamera, X, AppleLogo, AndroidLogo, SlidersHorizontal, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useBrand } from "@/context/BrandContext";
import type { Trip, TravelEvent } from "@/types";

interface PreviewPrefs {
  device: Device;
  finish: Record<Device, string>;
  textScale: number;
  /** ISO date to treat as "today", or null for the real date. */
  today: string | null;
  role: "traveler" | "leader";
  followEditor: boolean;
  reducedMotion: boolean;
  viewportWidth: number;
}
const PREFS_KEY = "daf-preview-prefs";
const DEFAULT_PREFS: PreviewPrefs = { device: "iphone", finish: { iphone: "deep-blue", android: "obsidian" }, textScale: 1, today: null, role: "traveler", followEditor: true, reducedMotion: false, viewportWidth: 390 };
function loadPrefs(): PreviewPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...p, finish: { ...DEFAULT_PREFS.finish, ...(p.finish ?? {}) } };
  } catch { return DEFAULT_PREFS; }
}
const TEXT_SCALES = [
  { value: 1, label: "Default" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Larger" },
];

interface MobilePreviewProps {
  trip: Trip;
  onClose: () => void;
  /** Events to show (e.g. already filtered by "View As"); defaults to all trip events. */
  events?: TravelEvent[];
  /** Event currently open in the edit panel; the preview scrolls to and highlights it. */
  activeEventId?: string | null;
  /** Name of the traveler the workspace is viewing as, if any. */
  viewAsName?: string | null;
}

export function MobilePreview({ trip, onClose, events, activeEventId, viewAsName }: MobilePreviewProps) {
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light">("dark");
  const isDark = previewTheme === "dark";
  const [prefs, setPrefs] = useState<PreviewPrefs>(loadPrefs);
  const updatePrefs = (patch: Partial<PreviewPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };
  const tripDays = useMemo(() => {
    const out: string[] = [];
    try {
      const d = new Date(trip.start + "T00:00:00");
      const end = new Date(trip.end + "T00:00:00");
      for (let i = 0; d <= end && i < 60; i++) { out.push(format(d, "yyyy-MM-dd")); d.setDate(d.getDate() + 1); }
    } catch { /* bad dates */ }
    return out;
  }, [trip.start, trip.end]);
  const dayBefore = tripDays[0] ? shiftDay(tripDays[0], -1) : null;
  const dayAfter = tripDays.length ? shiftDay(tripDays[tripDays.length - 1], 1) : null;
  const simDays = useMemo(() => {
    const arr: string[] = [];
    if (dayBefore) arr.push(dayBefore);
    arr.push(...tripDays);
    if (dayAfter) arr.push(dayAfter);
    return arr;
  }, [tripDays, dayBefore, dayAfter]);
  const simIndex = prefs.today ? simDays.indexOf(prefs.today) : -1;
  const simLabel = (() => {
    if (!prefs.today) return "Real date";
    if (prefs.today === dayBefore) return "Before the trip";
    if (prefs.today === dayAfter) return "After the trip";
    const di = tripDays.indexOf(prefs.today);
    let lbl = prefs.today;
    try { lbl = format(parseISO(prefs.today), "EEE, MMM d"); } catch { /* keep iso */ }
    return di >= 0 ? `Day ${di + 1} · ${lbl}` : lbl;
  })();
  const stepSim = (dir: 1 | -1) => {
    if (!simDays.length) return;
    if (simIndex === -1) {
      const start = dir === 1 ? simDays.indexOf(tripDays[0] ?? simDays[0]) : (dayBefore ? 0 : -1);
      if (start >= 0) updatePrefs({ today: simDays[start] });
      return;
    }
    const n = simIndex + dir;
    if (n >= 0 && n < simDays.length) updatePrefs({ today: simDays[n] });
  };
  const simPrevDisabled = simIndex === 0 || (simIndex === -1 && !dayBefore);
  const simNextDisabled = simIndex === simDays.length - 1 || !simDays.length;
  const { brand } = useBrand();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  const [frameColors, setFrameColors] = useState({ bg: "transparent", ink: "currentColor" });
  const payload = useMemo(() => ({
    trip: { ...trip, events: events ?? trip.events, info: (trip.info ?? []).filter(item => prefs.role === "leader" && !viewAsName || !item.leaderOnly) },
    brand, theme: previewTheme, textScale: prefs.textScale, today: prefs.today, role: viewAsName ? "traveler" : prefs.role, reducedMotion: prefs.reducedMotion,
    activeEventId: prefs.followEditor && (events ?? trip.events).some(event => event.id === activeEventId) ? activeEventId : null,
  }), [trip, events, brand, previewTheme, prefs, activeEventId, viewAsName]);
  const latestPayload = useRef(payload);
  const [bootStatus, setBootStatus] = useState<"loading" | "ready" | "error">("loading");
  const sendPreview = useCallback(() => iframeRef.current?.contentWindow?.postMessage({ type: "dalefy:mobile-preview", payload: latestPayload.current }, window.location.origin), []);
  useEffect(() => { latestPayload.current = payload; sendPreview(); }, [payload, sendPreview]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === "dalefy:mobile-preview-ready") { setBootStatus("ready"); sendPreview(); }
      if (event.data?.type === "dalefy:mobile-preview-colors") setFrameColors(event.data.colors);
    };
    window.addEventListener("message", receive);
    const timer = window.setTimeout(() => setBootStatus(status => status === "loading" ? "error" : status), 10000);
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => { window.removeEventListener("message", receive); observer.disconnect(); window.clearTimeout(timer); };
  }, [sendPreview]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <DeviceMobileCamera className="h-4 w-4 text-brand" />
          <span className="text-xs font-medium text-foreground">Mobile Preview</span>
          {viewAsName && (
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-md bg-brand/10 text-brand text-[11px] font-medium truncate max-w-[120px]" title={`Showing what ${viewAsName} sees`}>
              <Users size={10} /> {viewAsName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg bg-secondary border border-border p-0.5">
            {DEVICES.map(d => (
              <button
                key={d.key}
                type="button"
                title={d.label}
                aria-pressed={prefs.device === d.key}
                onClick={() => updatePrefs({ device: d.key })}
                className={`h-6 w-7 rounded-md flex items-center justify-center transition-colors ${prefs.device === d.key ? "bg-card text-brand shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {d.key === "iphone" ? <AppleLogo size={13} weight="fill" /> : <AndroidLogo size={13} weight="fill" />}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger
              title="Preview settings"
              className="h-7 w-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors data-popup-open:text-brand"
            >
              <SlidersHorizontal size={12} weight="bold" />
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-80 max-w-[calc(100vw-24px)] gap-0 overflow-hidden p-0">
              <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                <div>
                  <PopoverTitle className="text-xs font-semibold">Preview settings</PopoverTitle>
                  <PopoverDescription className="mt-1 text-[11px] text-muted-foreground">Changes only this preview.</PopoverDescription>
                </div>
                <Button variant="ghost" size="icon-xs" aria-label="Reset preview settings" title="Reset preview settings" className="text-muted-foreground" onClick={() => { updatePrefs(DEFAULT_PREFS); setPreviewTheme("dark"); }}><ArrowCounterClockwise /></Button>
              </div>
              <div className="max-h-[min(70vh,580px)] overflow-y-auto divide-y divide-border">
                <section className="px-4 py-3 space-y-3" aria-label="Appearance">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Appearance</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Theme</span>
                    <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-secondary p-0.5">
                      {(["light", "dark"] as const).map(theme => <Button key={theme} size="xs" variant="ghost" aria-pressed={previewTheme === theme} onClick={() => setPreviewTheme(theme)} className={`h-7 px-3 text-[11px] ${previewTheme === theme ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{theme === "light" ? <Sun /> : <Moon />}{theme === "light" ? "Light" : "Dark"}</Button>)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Screen width</span>
                    <Select value={String(prefs.viewportWidth)} onValueChange={value => { if (value) updatePrefs({ viewportWidth: Number(value) }); }} items={[{value:"360",label:"Compact · 360"},{value:"390",label:"Standard · 390"},{value:"430",label:"Large · 430"}]}>
                      <SelectTrigger size="sm" aria-label="Screen width" className="w-36 bg-secondary border-0 shadow-none text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{[{value:"360",label:"Compact · 360"},{value:"390",label:"Standard · 390"},{value:"430",label:"Large · 430"}].map(item => <SelectItem key={item.value} value={item.value} className="text-xs">{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Text size</span>
                    <Select value={String(prefs.textScale)} onValueChange={value => { if (value) updatePrefs({ textScale: Number(value) }); }} items={TEXT_SCALES.map(item => ({value:String(item.value),label:item.label}))}>
                      <SelectTrigger size="sm" aria-label="Text size" className="w-36 bg-secondary border-0 shadow-none text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{TEXT_SCALES.map(item => <SelectItem key={item.value} value={String(item.value)} className="text-xs">{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Finish</span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] text-muted-foreground">{FINISHES[prefs.device].find(finish => finish.key === prefs.finish[prefs.device])?.label}</span>
                      {FINISHES[prefs.device].map(finish => <Button key={finish.key} size="icon-xs" variant="ghost" aria-label={finish.label} title={finish.label} aria-pressed={prefs.finish[prefs.device] === finish.key} onClick={() => updatePrefs({ finish: { ...prefs.finish, [prefs.device]: finish.key } })} className={`size-5 rounded-full p-0 border border-foreground/10 ${prefs.finish[prefs.device] === finish.key ? "ring-2 ring-brand ring-offset-2 ring-offset-popover" : ""}`} style={{ background: `linear-gradient(135deg, ${finish.a}, ${finish.b})` }} />)}
                    </div>
                  </div>
                </section>
                <section className="px-4 py-3 space-y-3" aria-label="Behaviour">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Behaviour</p>
                  <label className="flex items-center justify-between gap-4">
                    <span><span className="block text-xs">Follow event editor</span><span className="mt-1 block text-[11px] text-muted-foreground">Open the event you’re editing.</span></span>
                    <Switch size="sm" checked={prefs.followEditor} onCheckedChange={followEditor => updatePrefs({ followEditor })} />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <span><span className="block text-xs">Reduce motion</span><span className="mt-1 block text-[11px] text-muted-foreground">Preview with fewer animations.</span></span>
                    <Switch size="sm" checked={prefs.reducedMotion} onCheckedChange={reducedMotion => updatePrefs({ reducedMotion })} />
                  </label>
                </section>
                <section className="px-4 py-3 space-y-3" aria-label="Traveller experience">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Traveller experience</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">View as</span>
                    <Select value={viewAsName ? "traveler" : prefs.role} disabled={!!viewAsName} onValueChange={role => { if (role === "traveler" || role === "leader") updatePrefs({ role }); }} items={[{value:"traveler",label:"Traveller"},{value:"leader",label:"Trip leader"}]}>
                      <SelectTrigger size="sm" aria-label="Viewing permissions" className="w-36 bg-secondary border-0 shadow-none text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="traveler" className="text-xs">Traveller</SelectItem><SelectItem value="leader" className="text-xs">Trip leader</SelectItem></SelectContent>
                    </Select>
                  </div>
                  {viewAsName && <p className="text-[11px] text-muted-foreground">Following {viewAsName}’s access.</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Simulate today</span>
                    {prefs.today && <Button size="xs" variant="ghost" className="h-auto p-0 text-[11px] text-muted-foreground" onClick={() => updatePrefs({ today: null })}>Use real date</Button>}
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-0.5">
                    <Button size="icon-xs" variant="ghost" aria-label="Previous day" disabled={simPrevDisabled} onClick={() => stepSim(-1)}><CaretLeft /></Button>
                    <span className="text-[11px] font-medium">{simLabel}</span>
                    <Button size="icon-xs" variant="ghost" aria-label="Next day" disabled={simNextDisabled} onClick={() => stepSim(1)}><CaretRight /></Button>
                  </div>
                </section>
              </div>
            </PopoverContent>
          </Popover>
          <button
            aria-label="Toggle preview theme"
            onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")}
            className="h-7 w-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors"
          >
            {previewTheme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <button
            aria-label="Close mobile preview"
            onClick={onClose}
            className="h-7 w-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Phone frame container */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <PhoneFrame isDark={isDark} device={prefs.device} finish={prefs.finish[prefs.device]} screenBg={frameColors.bg} statusInk={frameColors.ink}>
          <div ref={viewportRef} style={{ position: "relative", height: "100%", overflow: "hidden" }}>
            {bootStatus !== "ready" && <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card px-4 text-center text-xs text-muted-foreground">
              {bootStatus === "loading" ? "Loading mobile preview…" : <>The mobile preview couldn’t load.<button className="text-brand underline" onClick={() => { setBootStatus("loading"); iframeRef.current?.contentWindow?.location.reload(); }}>Reload preview</button></>}
            </div>}
            <iframe ref={iframeRef} src="/mobile-preview.html" title="Live mobile app preview" onLoad={sendPreview}
              style={{ border: 0, width: prefs.viewportWidth, height: `${prefs.viewportWidth / width * 100}%`, transform: `scale(${width / prefs.viewportWidth})`, transformOrigin: "top left", display: "block" }} />
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return format(d, "yyyy-MM-dd");
}
