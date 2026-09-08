import { useState, useMemo, useRef, useEffect } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { DEVICES, FINISHES, type Device } from "./phoneFrameConfig";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import {
  AirplaneTilt, Bed, ForkKnife, Van, MapPin, Users,
  CaretRight, CaretLeft, CaretDown, FileText, Phone, Envelope, Sun, Moon,
  DeviceMobileCamera, X, Train, Bus, Boat, Anchor, Paperclip,
  AppleLogo, AndroidLogo, SlidersHorizontal, TextAa, CalendarDot,
  AirplaneTakeoff, AirplaneLanding, NavigationArrow,
} from "@phosphor-icons/react";
import { tripFactLine, shortDay, daysUntil, destinationFlag } from "@/lib/tripSummary";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import type { Trip, TravelEvent, TripOrganizer, TripInfo } from "@/types";

const HERO = 320;

const dark = {
  bg: "#09090b", card: "#141418", elevated: "#1c1c22",
  border: "rgba(255,255,255,0.10)",
  textPrimary: "#EDEDEF", textSecondary: "#9a9a9a", textTertiary: "#8e8e96", textDim: "#4a4a4a",
  teal: "#0bd2b5", tealDim: "rgba(11,210,181,0.1)", tealMid: "rgba(11,210,181,0.25)",
  flight: "#6FA8F5", hotel: "#B08CF0", activity: "#F07AA3", dining: "#F0975A", transfer: "#A0AEC0",
};
const light = {
  bg: "#f5f6fa", card: "#ffffff", elevated: "#f0f1f5",
  border: "rgba(0,0,0,0.07)",
  textPrimary: "#0d0f14", textSecondary: "#4b5263", textTertiary: "#555d6e", textDim: "#c5cad6",
  teal: "#0ab8a0", tealDim: "rgba(10,184,160,0.12)", tealMid: "rgba(10,184,160,0.25)",
  flight: "#2F80ED", hotel: "#8E5CD9", activity: "#E0447A", dining: "#E8791D", transfer: "#4A5568",
};

type C = typeof dark;

function eventColor(type: string, c: C) {
  return (c as Record<string, string>)[type] ?? c.activity;
}

function groupEventsByDay(events: TravelEvent[]) {
  const map = new Map<string, TravelEvent[]>();
  for (const ev of events) {
    const d = ev.date || "unknown";
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(ev);
  }
  const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, evs] of sorted) {
    evs.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  }
  return sorted;
}

function timeToMin(t: string) {
  if (!t) return 0;
  const match = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return 0;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + m;
}

type IconWeight = "regular" | "fill";
function TransferIcon({ transferType, color, size = 12, weight = "regular" }: { transferType?: string; color: string; size?: number; weight?: IconWeight }) {
  switch (transferType) {
    case "train": return <Train size={size} color={color} weight={weight} />;
    case "bus": return <Bus size={size} color={color} weight={weight} />;
    case "ferry": return <Boat size={size} color={color} weight={weight} />;
    case "cruise": return <Anchor size={size} color={color} weight={weight} />;
    default: return <Van size={size} color={color} weight={weight} />;
  }
}

function EventIcon({ type, color, transferType, size = 12, weight = "regular" }: { type: string; color: string; transferType?: string; size?: number; weight?: IconWeight }) {
  switch (type) {
    case "flight": return <AirplaneTilt size={size} color={color} weight={weight} />;
    case "hotel": return <Bed size={size} color={color} weight={weight} />;
    case "activity": return <MapPin size={size} color={color} weight={weight} />;
    case "dining": return <ForkKnife size={size} color={color} weight={weight} />;
    case "transfer": return <TransferIcon transferType={transferType} color={color} size={size} weight={weight} />;
    default: return <MapPin size={size} color={color} weight={weight} />;
  }
}

/** Category circle: soft tint, filled glyph. Matches components/ui/CategoryDot on the phone. */
function CatCircle({ type, transferType, c, size = 28 }: { type: string; transferType?: string; c: C; size?: number }) {
  const fg = eventColor(type, c);
  const rgb = hexToRgb(fg).split(" ").join(",");
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: `rgba(${rgb},0.18)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <EventIcon type={type} transferType={transferType} color={fg} size={Math.round(size * 0.5)} weight="fill" />
    </div>
  );
}

function OrganizerSection({ org, c }: { org: TripOrganizer; c: C }) {
  const initials = org.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div style={{ margin: "14px 14px 0", background: c.card, borderRadius: 20, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {org.avatar ? (
          <img src={org.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 100, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 100, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: c.teal }}>{initials}</span>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.textTertiary, letterSpacing: 1.5, textTransform: "uppercase" }}>YOUR ORGANIZER</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary }}>{org.name}</div>
          {(org.role || org.company) && (
            <div style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, marginTop: 1 }}>
              {[org.role, org.company].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>
      {(org.phone || org.email) && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: `0.5px solid ${c.border}`, paddingTop: 10 }}>
          {org.phone && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: c.tealDim, borderRadius: 10, padding: "10px 0" }}>
              <Phone size={12} color={c.teal} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, letterSpacing: 1, textTransform: "uppercase" }}>Call</span>
            </div>
          )}
          {org.email && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: c.tealDim, borderRadius: 10, padding: "10px 0" }}>
              <Envelope size={12} color={c.teal} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, letterSpacing: 1, textTransform: "uppercase" }}>Email</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoDocsSection({ info, documents, c }: { info: TripInfo[]; documents: import("@/types").EventDocument[]; c: C }) {
  const [open, setOpen] = useState(false);
  const visibleInfo = info.filter(i => !i.leaderOnly);
  const totalCount = visibleInfo.length + documents.length;
  if (totalCount === 0) return null;

  const formatSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div style={{ margin: "10px 14px 0" }}>
      <div
        onClick={() => setOpen(p => !p)}
        style={{ padding: "12px 12px", background: c.card, borderRadius: open ? "20px 20px 0 0" : 20, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 12, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <FileText size={15} color={c.teal} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.textSecondary, letterSpacing: 1, flex: 1 }}>INFORMATION & DOCUMENTS</span>
        <div style={{ background: c.tealDim, borderRadius: 10, padding: "2px 6px" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, letterSpacing: 0.5 }}>{totalCount}</span>
        </div>
        {open ? <CaretDown size={14} color={c.textTertiary} /> : <CaretRight size={14} color={c.textTertiary} />}
      </div>
      {open && (
        <div style={{ background: c.card, borderRadius: "0 0 20px 20px", padding: "0 12px 12px" }}>
          {visibleInfo.map(item => (
            <div key={item.id} style={{ padding: "8px 10px", background: c.bg, borderRadius: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textPrimary }}>{item.title || "Untitled"}</span>
              {item.body && <p style={{ fontSize: 10, color: c.textSecondary, margin: "4px 0 0", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{item.body.length > 120 ? item.body.slice(0, 120) + "..." : item.body}</p>}
              {item.documents && item.documents.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {item.documents.map(doc => (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                      <Paperclip size={10} color={c.teal} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: c.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
                      <span style={{ fontSize: 8, color: c.textTertiary }}>{formatSize(doc.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {documents.length > 0 && (
            <>
              {visibleInfo.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                  <div style={{ height: 1, flex: 1, background: c.border }} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: c.textTertiary, letterSpacing: 1 }}>DOCUMENTS</span>
                  <div style={{ height: 1, flex: 1, background: c.border }} />
                </div>
              )}
              {documents.map(doc => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: c.bg, borderRadius: 10, marginBottom: 4 }}>
                  <Paperclip size={12} color={c.teal} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
                  <span style={{ fontSize: 9, color: c.textTertiary }}>{formatSize(doc.size)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const isPlaceholderTime = (t?: string) => !t || /^(tb[acd]|n\/a|—|-)$/i.test(t.trim());

function TripBody({ events, trip, c, activeEventId, today }: { events: TravelEvent[]; trip: Trip; c: C; activeEventId?: string | null; today?: string }) {
  const groups = useMemo(() => groupEventsByDay(events), [events]);
  const rootRef = useRef<HTMLDivElement>(null);
  const todayStr = today ?? new Date().toISOString().split("T")[0];

  // Every calendar day of the trip, then any event dates outside it
  const days = useMemo(() => {
    const keys: string[] = [];
    try {
      const d = new Date(trip.start + "T00:00:00");
      const end = new Date(trip.end + "T00:00:00");
      for (let i = 0; d <= end && i < 60; i++) { keys.push(d.toISOString().split("T")[0]); d.setDate(d.getDate() + 1); }
    } catch { /* bad dates */ }
    for (const [date] of groups) if (!keys.includes(date)) keys.push(date);
    keys.sort();
    return keys.map(date => ({ date, events: groups.find(([d]) => d === date)?.[1] ?? [] }));
  }, [groups, trip.start, trip.end]);

  // Follow the event being edited in the workspace
  useEffect(() => {
    if (!activeEventId) return;
    const id = window.setTimeout(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-preview-event="${activeEventId}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeEventId]);

  const jumpToDay = (date: string) => {
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-preview-day="${date}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // Next up: the first event that has not started yet (simulated day counts from midnight)
  const nowMin = today ? 0 : new Date().getHours() * 60 + new Date().getMinutes();
  const upNext = useMemo(() => {
    for (const [date, evs] of groups) {
      if (date < todayStr) continue;
      for (const e of evs) {
        if (date > todayStr) return e;
        if (isPlaceholderTime(e.time) || timeToMin(e.time) >= nowMin) return e;
      }
    }
    return null;
  }, [groups, todayStr, nowMin]);
  const untilLabel = (e: TravelEvent) => {
    if (e.date === todayStr) {
      if (isPlaceholderTime(e.time)) return "Today";
      const diff = timeToMin(e.time) - nowMin;
      if (diff <= 0) return "Now";
      if (diff < 60) return `in ${diff} min`;
      const h = Math.floor(diff / 60), m = diff % 60;
      return m ? `in ${h} h ${m} min` : `in ${h} h`;
    }
    const d = daysUntil(e.date, todayStr);
    if (d === 1) return "Tomorrow";
    try { return format(parseISO(e.date), d < 7 ? "EEEE" : "EEE d MMM"); } catch { return e.date; }
  };
  const dimPast = days.some(d => d.date >= todayStr);
  const cleanTitle = (t: string) => t.replace(/\s*\([A-Z]{3}\)\s*$/, "");

  const subtitle = (e: TravelEvent) => {
    if (e.type === "flight" && (e.airline || e.flightNum)) return [e.airline, e.flightNum].filter(Boolean).join(" ");
    return e.location || "";
  };

  return (
    <div ref={rootRef}>
      {/* Day rail */}
      <div className="scrollbar-hide" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "14px 14px 8px", justifyContent: days.length <= 6 ? "center" : "flex-start" }}>
        {days.map(({ date, events: evs }) => {
          const isToday = date === todayStr;
          const isPast = date < todayStr;
          let wd = "", num = "";
          try { const d = parseISO(date); wd = format(d, "EEE"); num = format(d, "d"); } catch { num = date.slice(-2); }
          return (
            <button
              key={date}
              type="button"
              onClick={() => jumpToDay(date)}
              style={{
                flexShrink: 0, width: 46, padding: "6px 4px 4px", cursor: "pointer",
                background: c.card, border: `1.5px solid ${isToday ? c.teal : "transparent"}`, borderRadius: 10,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                opacity: dimPast && isPast ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 600, color: isToday ? c.teal : c.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 }}>{wd}</span>
              <span style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{num}</span>
              <div style={{ display: "flex", gap: 2, height: 3, alignSelf: "stretch", marginTop: 3 }}>
                {evs.length === 0
                  ? <span style={{ flex: 1, height: 3, borderRadius: 2, background: c.border }} />
                  : evs.map(e => <span key={e.id} style={{ flex: 1, height: 3, borderRadius: 2, background: eventColor(e.type, c) }} />)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Next up */}
      {upNext && (
        <div style={{ margin: "4px 14px 4px", background: c.card, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 4px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>Next up</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.teal, fontVariantNumeric: "tabular-nums" }}>{untilLabel(upNext)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px 12px" }}>
            <CatCircle type={upNext.type} transferType={upNext.transferType} c={c} size={38} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary, letterSpacing: -0.2, lineHeight: "20px" }}>{cleanTitle(upNext.title)}</div>
              <div style={{ fontSize: 11, color: c.textTertiary, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[isPlaceholderTime(upNext.time) ? null : upNext.time, upNext.location].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          {upNext.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderTop: `0.5px solid ${c.border}`, fontSize: 12, fontWeight: 600, color: c.teal }}>
              <NavigationArrow size={13} color={c.teal} weight="fill" /> Directions
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {days.map(({ date, events: evs }) => {
        const isToday = date === todayStr;
        const isPast = date < todayStr;
        let head = date;
        try { head = format(parseISO(date), "EEE d MMM"); } catch { /* keep iso */ }
        return (
          <div key={date} data-preview-day={date} style={{ marginTop: 8, opacity: dimPast && isPast ? 0.6 : 1, scrollMarginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 18px 4px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>{head}</span>
              {isToday && <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: c.teal, borderRadius: 100, padding: "1px 6px" }}>Today</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: c.textTertiary }}>{evs.length ? `${evs.length} event${evs.length === 1 ? "" : "s"}` : "Free day"}</span>
            </div>
            {evs.length > 0 && (
              <div style={{ margin: "0 14px", background: c.card, borderRadius: 14, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: 14 + 14 - 1, top: 10 + 14, bottom: 10 + 14, width: 2, background: c.border }} />
                {evs.map((e, i) => {
                  const active = e.id === activeEventId;
                  const placeholder = isPlaceholderTime(e.time);
                  return (
                    <div key={e.id} data-preview-event={e.id} style={{ position: "relative" }}>
                      {i > 0 && <div style={{ height: 0.5, background: c.border, marginLeft: 14 + 28 + 10 }} />}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", minHeight: 52, background: active ? c.tealDim : "transparent", boxShadow: active ? `inset 0 0 0 1.5px ${c.teal}` : "none", transition: "background 200ms" }}>
                        <CatCircle type={e.type} transferType={e.transferType} c={c} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary, lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cleanTitle(e.title)}</div>
                          {subtitle(e) && <div style={{ fontSize: 11, color: c.textTertiary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle(e)}</div>}
                        </div>
                        {e.time && <span style={{ fontSize: 11, fontWeight: 500, color: placeholder ? c.textTertiary : c.teal, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{e.time}</span>}
                      </div>
                      {e.type === "flight" && (e.depAirport || e.arrAirport) && (
                        <div style={{ padding: `0 14px 10px ${14 + 28 + 10}px`, display: "flex", flexDirection: "column", gap: 3, marginTop: -4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: c.textSecondary }}>
                            <AirplaneTakeoff size={12} color={c.textTertiary} />
                            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[e.depAirport, e.terminal ? `Terminal ${e.terminal.replace(/^T/i, "")}` : null].filter(Boolean).join(" · ")}</span>
                            {!placeholder && <span style={{ color: c.textTertiary, fontVariantNumeric: "tabular-nums" }}>{e.time}</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: c.textSecondary }}>
                            <AirplaneLanding size={12} color={c.textTertiary} />
                            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[e.arrAirport, e.arrTerminal ? `Terminal ${e.arrTerminal.replace(/^T/i, "")}` : null].filter(Boolean).join(" · ")}</span>
                            {e.endTime && !isPlaceholderTime(e.endTime) && <span style={{ color: c.textTertiary, fontVariantNumeric: "tabular-nums" }}>{e.endTime}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PreviewPrefs {
  device: Device;
  finish: Record<Device, string>;
  textScale: number;
  /** ISO date to treat as "today", or null for the real date. */
  today: string | null;
}
const PREFS_KEY = "daf-preview-prefs";
const DEFAULT_PREFS: PreviewPrefs = { device: "iphone", finish: { iphone: "deep-blue", android: "obsidian" }, textScale: 1, today: null };
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
      for (let i = 0; d <= end && i < 60; i++) { out.push(d.toISOString().split("T")[0]); d.setDate(d.getDate() + 1); }
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
  // Show the traveler what they'll actually get: the agency accent, not the default teal
  const c: C = useMemo(() => {
    const base = isDark ? dark : light;
    const accent = brand.accentColor && /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : base.teal;
    if (accent === base.teal) return base;
    const rgb = hexToRgb(accent).split(" ").join(",");
    return { ...base, teal: accent, tealDim: `rgba(${rgb},0.12)`, tealMid: `rgba(${rgb},0.25)` };
  }, [isDark, brand.accentColor]);
  const previewEvents = events ?? trip.events;

  const paxNum = parseInt(trip.paxCount || trip.attendees || "0");
  const flag = destinationFlag(trip.destination);

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-border shrink-0">
        <div className="flex items-center gap-2">
          <DeviceMobileCamera className="h-4 w-4 text-brand" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Mobile Preview</span>
          {viewAsName && (
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-md bg-brand/10 text-brand text-[9px] font-black uppercase tracking-[0.12em] truncate max-w-[120px]" title={`Showing what ${viewAsName} sees`}>
              <Users size={10} /> {viewAsName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg bg-slate-100 dark:bg-secondary border border-slate-200 dark:border-border p-0.5">
            {DEVICES.map(d => (
              <button
                key={d.key}
                type="button"
                title={d.label}
                aria-pressed={prefs.device === d.key}
                onClick={() => updatePrefs({ device: d.key })}
                className={`h-6 w-7 rounded-md flex items-center justify-center transition-colors ${prefs.device === d.key ? "bg-white dark:bg-card text-brand shadow-sm" : "text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-white"}`}
              >
                {d.key === "iphone" ? <AppleLogo size={13} weight="fill" /> : <AndroidLogo size={13} weight="fill" />}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger
              title="Preview settings"
              className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-secondary border border-slate-200 dark:border-border flex items-center justify-center text-slate-500 dark:text-muted-foreground hover:text-brand transition-colors data-popup-open:text-brand"
            >
              <SlidersHorizontal size={12} weight="bold" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-border">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-muted-foreground">Preview settings</p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-border">
                <div className="px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-muted-foreground mb-2.5">Finish</p>
                  <div className="flex items-start gap-1">
                    {FINISHES[prefs.device].map(f => {
                      const active = prefs.finish[prefs.device] === f.key;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          title={f.label}
                          aria-pressed={active}
                          onClick={() => updatePrefs({ finish: { ...prefs.finish, [prefs.device]: f.key } })}
                          className="flex flex-col items-center gap-1.5 flex-1 py-1 rounded-lg group"
                        >
                          <span
                            className={`h-7 w-7 rounded-full transition-transform ${active ? "scale-110" : "group-hover:scale-105"}`}
                            style={{
                              background: `linear-gradient(135deg, ${f.a}, ${f.b})`,
                              boxShadow: active ? "0 0 0 2px hsl(var(--popover)), 0 0 0 4px rgb(var(--brand-rgb))" : undefined,
                            }}
                          />
                          <span className={`text-[9px] font-bold tracking-wide ${active ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-muted-foreground"}`}>
                            {f.label.split(" ").pop()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-muted-foreground flex items-center gap-1 shrink-0"><TextAa size={11} /> Text size</p>
                    <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 dark:bg-secondary p-0.5">
                      {TEXT_SCALES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          aria-pressed={prefs.textScale === t.value}
                          onClick={() => updatePrefs({ textScale: t.value })}
                          className={`h-6 px-2 rounded-md text-[10px] font-bold transition-colors ${prefs.textScale === t.value ? "bg-white dark:bg-card text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-white"}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-500 dark:text-muted-foreground">Checks readability with larger accessibility text.</p>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-muted-foreground flex items-center gap-1"><CalendarDot size={11} /> Simulate today</p>
                    {prefs.today && (
                      <button
                        type="button"
                        onClick={() => updatePrefs({ today: null })}
                        className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center rounded-lg bg-slate-100 dark:bg-secondary p-0.5">
                    <button
                      type="button"
                      aria-label="Previous day"
                      disabled={simPrevDisabled}
                      onClick={() => stepSim(-1)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-slate-600 dark:text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <CaretLeft size={12} weight="bold" />
                    </button>
                    <span className={`flex-1 text-center text-[11px] font-bold ${prefs.today ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-muted-foreground"}`}>
                      {simLabel}
                    </span>
                    <button
                      type="button"
                      aria-label="Next day"
                      disabled={simNextDisabled}
                      onClick={() => stepSim(1)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-slate-600 dark:text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <CaretRight size={12} weight="bold" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-500 dark:text-muted-foreground">Shows past days dimmed and the TODAY badge as travelers will see them.</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")}
            className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-secondary border border-slate-200 dark:border-border flex items-center justify-center text-slate-500 dark:text-muted-foreground hover:text-brand transition-colors"
          >
            {previewTheme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-secondary border border-slate-200 dark:border-border flex items-center justify-center text-slate-500 dark:text-muted-foreground hover:text-brand transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Phone frame container */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <PhoneFrame isDark={isDark} device={prefs.device} finish={prefs.finish[prefs.device]} screenBg={c.bg} statusInk={c.textPrimary}>
              {/* Scrollable mobile screen */}
              <div
                style={{ background: c.bg, height: "100%", overflowY: "auto", overflowX: "hidden", zoom: prefs.textScale, position: "relative" }}
                className="scrollbar-hide"
              >
                {/* The photo, blurred, behind the top of the page; a scrim rises to the page colour */}
                <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: HERO + 300, overflow: "hidden", pointerEvents: "none" }}>
                  <img src={trip.image} alt="" style={{ position: "absolute", inset: -40, width: "calc(100% + 80px)", height: "calc(100% + 80px)", objectFit: "cover", filter: "blur(40px)", opacity: 0.95 }} />
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${c.bg}1a 0%, ${c.bg}b3 55%, ${c.bg} 100%)` }} />
                </div>

                {/* Hero: sharp photo dissolving into the wash, the essentials centred on it */}
                <div style={{ position: "relative", height: HERO, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <img
                    src={trip.image}
                    alt=""
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 45%, transparent 100%)" }}
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 30%)" }} />
                  <div style={{ position: "relative", padding: "0 18px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center", textShadow: isDark ? "0 1px 6px rgba(0,0,0,0.6)" : "none" }}>
                    {flag && (
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 4 }}>{flag}</div>
                    )}
                    {trip.destination && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.9)" : c.textPrimary, textTransform: "uppercase", letterSpacing: 0.6 }}>{trip.destination}</div>
                    )}
                    <div style={{ fontSize: 26, fontWeight: 700, color: isDark ? "#fff" : c.textPrimary, letterSpacing: -0.4, lineHeight: "30px" }}>{trip.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.92)" : c.textPrimary, marginTop: 2 }}>{tripFactLine(trip, prefs.today ?? undefined)}</div>
                    <div style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.72)" : c.textSecondary }}>{shortDay(trip.start)} → {shortDay(trip.end)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, fontWeight: 500, color: isDark ? "rgba(255,255,255,0.85)" : c.textSecondary }}>
                      {paxNum > 0 ? `${paxNum} traveller${paxNum === 1 ? "" : "s"} · ` : ""}Hosted by {brand.name}
                      {brand.logoUrl && <img src={brand.logoUrl} alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />}
                    </div>
                  </div>
                </div>

                <div style={{ position: "relative" }}>
                <TripBody events={previewEvents} trip={trip} c={c} activeEventId={activeEventId} today={prefs.today ?? undefined} />
                </div>

                {/* Organizer */}
                {trip.organizer && <OrganizerSection org={trip.organizer} c={c} />}

                {/* Info */}
                {((trip.info && trip.info.length > 0) || (trip.documents && trip.documents.length > 0)) && <InfoDocsSection info={trip.info ?? []} documents={trip.documents ?? []} c={c} />}

                {/* Bottom spacer */}
                <div style={{ height: 24 }} />
              </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}
