import { useState, useMemo, useRef, useEffect } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { DEVICES, FINISHES, type Device } from "./phoneFrameConfig";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import {
  AirplaneTilt, Bed, ForkKnife, Van, MapPin, Users,
  CaretRight, CaretLeft, FileText, Sun, Moon,
  DeviceMobileCamera, X, Train, Bus, Boat, Anchor, Paperclip,
  AppleLogo, AndroidLogo, SlidersHorizontal, TextAa, CalendarDot,
  AirplaneTakeoff, AirplaneLanding, NavigationArrow,
  ArrowRight, Timer, Armchair, Door, Hash, ArrowSquareOut, Warning, WarningCircle, Clock, Calendar, Check,
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
  green: "#3DDC97", amber: "#F5B74A", red: "#F26D6D",
};
const light = {
  bg: "#f5f6fa", card: "#ffffff", elevated: "#f0f1f5",
  border: "rgba(0,0,0,0.07)",
  textPrimary: "#0d0f14", textSecondary: "#4b5263", textTertiary: "#555d6e", textDim: "#c5cad6",
  teal: "#0ab8a0", tealDim: "rgba(10,184,160,0.12)", tealMid: "rgba(10,184,160,0.25)",
  flight: "#2F80ED", hotel: "#8E5CD9", activity: "#E0447A", dining: "#E8791D", transfer: "#4A5568",
  green: "#1B9E6B", amber: "#B7791F", red: "#D64545",
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

const TYPE_LABELS: Record<string, string> = { flight: "Flight", hotel: "Hotel", activity: "Activity", dining: "Dining", transfer: "Transfer" };
const TRANSFER_LABELS: Record<string, string> = { car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise", other: "Transfer" };

function typeLabelFor(e: TravelEvent) {
  return e.type === "transfer" ? (TRANSFER_LABELS[e.transferType || "car"] || "Transfer") : (TYPE_LABELS[e.type] ?? "Event");
}
function cleanEventTitle(e: TravelEvent) {
  let title = e.title;
  for (const l of [TRANSFER_LABELS[e.transferType || ""] || "", TYPE_LABELS[e.type] || ""]) {
    if (!l) continue;
    title = title.replace(new RegExp(`^${l}\\s*[-–·:]\\s*`, "i"), "");
  }
  return title;
}
function shortDate(d: string) {
  try { return format(parseISO(d), "EEE d MMM"); } catch { return d; }
}
function rgba(hex: string, a: number) {
  return `rgba(${hexToRgb(hex).split(" ").join(",")},${a})`;
}
function formatSize(b: number) {
  const kb = Math.max(1, Math.round(b / 1024));
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/** Status pill. Same recipe as the phone: soft tint, dot, label. */
function eventStatusPill(status: string | undefined, date: string | undefined, c: C, today: string) {
  const s = (status || "confirmed").toLowerCase();
  const isPast = !!date && date < today;
  const pick = (color: string, label: string) => ({ color, label });
  if (s.includes("cancel")) return pick(c.red, "Cancelled");
  if (s.includes("delay")) return pick(c.amber, "Delayed");
  if (s.includes("pend") || s.includes("hold")) return pick(c.amber, "Pending");
  if (s.includes("done") || s.includes("complet") || isPast) return pick(c.textTertiary, "Done");
  return null;
}
function StatusPill({ color, label, c }: { color: string; label: string; c: C }) {
  const tint = color === c.textTertiary ? c.elevated : rgba(color, 0.15);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 100, background: tint, fontSize: 10, fontWeight: 600, color }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />{label}
    </span>
  );
}

const CARD = 16;

/** Quiet section label, as MicroLabel on the phone. */
function Micro({ children, c, style }: { children: React.ReactNode; c: C; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: c.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, ...style }}>{children}</div>;
}

/** The organiser, as OrganizerCard on the phone: avatar, name, a quiet line. Call and email are leader only. */
function OrganizerSection({ org, c }: { org: TripOrganizer; c: C }) {
  const initials = org.name?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  return (
    <div style={{ margin: "12px 14px 0", background: c.card, borderRadius: CARD, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
      {org.avatar ? (
        <img src={org.avatar} alt="" style={{ width: 40, height: 40, borderRadius: 20, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 20, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.teal }}>{initials}</span>
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org.name}</div>
        <div style={{ fontSize: 11, color: c.textTertiary, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {["Your organiser", org.role, org.company].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

/** One row that opens the Info screen, as InfoDocsRow on the phone. */
function InfoDocsRow({ count, c, onOpen }: { count: number; c: C; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ margin: "12px 14px 0", background: c.card, borderRadius: CARD, padding: "10px 10px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 17, background: c.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={15} color={c.textSecondary} weight="fill" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>Information &amp; documents</div>
        <div style={{ fontSize: 11, color: c.textTertiary, marginTop: 2 }}>{count} {count === 1 ? "item" : "items"} from your organiser</div>
      </div>
      <CaretRight size={13} color={c.textTertiary} />
    </div>
  );
}

/** Glass back control at the top of a pushed screen. */
function BackButton({ onBack, ink = "#fff" }: { onBack: () => void; ink?: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back"
      style={{ position: "absolute", left: 12, top: 8, zIndex: 5, width: 34, height: 34, borderRadius: 17, border: "none", cursor: "pointer", background: ink === "#fff" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <CaretLeft size={16} color={ink} weight="bold" />
    </button>
  );
}

function DetailRow({ icon, label, value, c, last }: { icon: React.ReactNode; label: string; value: string; c: C; last: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderBottom: last ? "none" : `0.5px solid ${c.border}` }}>
      <span style={{ marginTop: 2, display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, minWidth: 78 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, flex: 1 }}>{value}</span>
    </div>
  );
}

function DocRow({ name, size, c, last, tint }: { name: string; size: number; c: C; last: boolean; tint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: last ? "none" : `0.5px solid ${c.border}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={15} color={c.textTertiary} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name.replace(/\.[^.]+$/, "")}</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, marginTop: 1 }}>{formatSize(size)}</div>
      </div>
      <CaretRight size={13} color={c.textTertiary} />
    </div>
  );
}

/** Event detail, as app/trip/event.tsx on the phone. Flights get the pass layout. */
function EventScreen({ ev, trip, c, isDark, today, onBack, onOpenEvent }: { ev: TravelEvent; trip: Trip; c: C; isDark: boolean; today: string; onBack: () => void; onOpenEvent: (id: string) => void }) {
  if (ev.type === "flight") return <FlightScreen ev={ev} trip={trip} c={c} isDark={isDark} today={today} onBack={onBack} />;
  const title = cleanEventTitle(ev);
  const isHotel = ev.type === "hotel";
  const status = eventStatusPill(ev.status, ev.date, c, today);
  const timeText = isHotel && ev.isOvernight ? null : ev.time && !isPlaceholderTime(ev.time) ? `${ev.time}${ev.endTime && !isPlaceholderTime(ev.endTime) ? ` – ${ev.endTime}` : ""}` : null;
  const fact = [ev.date ? shortDate(ev.date) : null, timeText].filter(Boolean).join(" · ");

  const details: Array<{ icon: React.ReactNode; label: string; value: string }> = [];
  const ic = (I: React.ComponentType<{ size?: number; color?: string }>) => <I size={14} color={c.textTertiary} />;
  if (ev.duration) details.push({ icon: ic(Timer), label: "Duration", value: ev.duration });
  if (ev.roomType) details.push({ icon: ic(Bed), label: "Room type", value: ev.roomType });
  if (ev.seatDetails) details.push({ icon: ic(Armchair), label: "Seat", value: ev.seatDetails });
  if (ev.terminal) details.push({ icon: ic(Door), label: "Terminal", value: ev.terminal });
  if (ev.gate) details.push({ icon: ic(Door), label: "Gate", value: ev.gate });
  if (ev.price) details.push({ icon: ic(Hash), label: "Price", value: ev.price });

  const dayEvents = trip.events.filter(e => e.date === ev.date).sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  const idx = dayEvents.findIndex(e => e.id === ev.id);
  const neighbours = [
    { label: "Before", e: idx > 0 ? dayEvents[idx - 1] : null },
    { label: "Up next", e: idx >= 0 && idx < dayEvents.length - 1 ? dayEvents[idx + 1] : null },
  ].filter((n): n is { label: string; e: TravelEvent } => !!n.e);

  const card: React.CSSProperties = { margin: "0 14px 12px", background: c.card, borderRadius: CARD, overflow: "hidden" };

  return (
    <div style={{ position: "relative" }}>
      <BackButton onBack={onBack} />
      {/* Hero: the event's photo, or the trip's, with the essentials on it */}
      <div style={{ position: "relative", height: 250, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", marginBottom: 12, background: c.elevated }}>
        {ev.image ? (
          <img src={ev.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 35%" }} />
        ) : trip.image ? (
          <img src={trip.image} alt="" style={{ position: "absolute", inset: -30, width: "calc(100% + 60px)", height: "calc(100% + 60px)", objectFit: "cover", filter: "blur(14px)" }} />
        ) : null}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 35%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.85) 100%)" }} />
        <div style={{ position: "relative", padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CatCircle type={ev.type} transferType={ev.transferType} c={c} size={24} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.5, flex: 1 }}>{typeLabelFor(ev)}</span>
            {status && <StatusPill color={status.color} label={status.label} c={c} />}
          </div>
          <div style={{ fontSize: 24, lineHeight: "27px", fontWeight: 700, color: "#fff", letterSpacing: -0.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
          {fact && <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>{fact}</div>}
        </div>
      </div>

      {/* Location */}
      {ev.location && (
        <div style={{ ...card, padding: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <MapPin size={16} color={c.textTertiary} style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: c.textPrimary, lineHeight: "18px" }}>{ev.location}</div>
          <CaretRight size={13} color={c.textTertiary} style={{ alignSelf: "center", flexShrink: 0 }} />
        </div>
      )}

      {/* Hotel check-in and out */}
      {isHotel && !ev.isOvernight && (ev.time || ev.endTime) && (
        <div style={{ ...card, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
          {ev.time && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: c.textTertiary, marginBottom: 3 }}>CHECK IN</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>{ev.time}</div>
            </div>
          )}
          {ev.time && ev.endTime && <ArrowRight size={14} color={c.textTertiary} />}
          {ev.endTime && (
            <div style={{ flex: 1, textAlign: ev.time ? "right" : "left" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: c.textTertiary, marginBottom: 3 }}>CHECK OUT</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>{ev.endTime}</div>
            </div>
          )}
        </div>
      )}

      {/* Details */}
      {details.length > 0 && (
        <div style={card}>
          {details.map((d, i) => <DetailRow key={d.label} icon={d.icon} label={d.label} value={d.value} c={c} last={i === details.length - 1} />)}
        </div>
      )}

      {/* Notes */}
      {(ev.description || ev.notes) && (
        <div style={{ ...card, padding: 12 }}>
          <Micro c={c} style={{ marginBottom: 8 }}>Notes</Micro>
          {ev.description && <div style={{ fontSize: 12, lineHeight: "18px", color: c.textPrimary, whiteSpace: "pre-wrap" }}>{ev.description}</div>}
          {ev.description && ev.notes && <div style={{ height: 8 }} />}
          {ev.notes && <div style={{ fontSize: 12, lineHeight: "18px", color: c.textPrimary, whiteSpace: "pre-wrap" }}>{ev.notes}</div>}
        </div>
      )}

      {/* Documents */}
      {ev.documents && ev.documents.length > 0 && (
        <div style={card}>
          <div style={{ padding: "12px 12px 4px" }}><Micro c={c}>Documents</Micro></div>
          {ev.documents.map((d, i) => <DocRow key={d.id} name={d.name} size={d.size} c={c} last={i === ev.documents!.length - 1} tint={c.tealDim} />)}
        </div>
      )}

      {/* Before and up next on the same day */}
      {neighbours.length > 0 && (
        <div style={card}>
          {neighbours.map(({ label, e }, i) => (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenEvent(e.id)}
              onKeyDown={k => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); onOpenEvent(e.id); } }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: i < neighbours.length - 1 ? `0.5px solid ${c.border}` : "none" }}
            >
              <CatCircle type={e.type} transferType={e.transferType} c={c} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: c.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cleanEventTitle(e)}</div>
              </div>
              {e.time && !isPlaceholderTime(e.time) && <span style={{ fontSize: 11, fontWeight: 500, color: c.teal, fontVariantNumeric: "tabular-nums" }}>{e.time}</span>}
              <CaretRight size={13} color={c.textTertiary} />
            </div>
          ))}
        </div>
      )}

      {trip.organizer && <div style={{ marginTop: -12, paddingBottom: 12 }}><OrganizerSection org={trip.organizer} c={c} /></div>}
      <div style={{ height: 24 }} />
    </div>
  );
}

/** Flight detail: the pass, as the phone shows it. The route map is replaced by the trip photo here. */
function FlightScreen({ ev, trip, c, isDark, today, onBack }: { ev: TravelEvent; trip: Trip; c: C; isDark: boolean; today: string; onBack: () => void }) {
  const [logoError, setLogoError] = useState(false);
  const iata = (ev.flightNum || "").match(/^([A-Z0-9]{2})\s*\d/i)?.[1]?.toUpperCase() ?? "";
  const code = (s?: string) => (s || "").match(/\(([A-Z]{3})\)/)?.[1] ?? ((s || "").match(/^[A-Z]{3}$/) ? s : "");
  const depCode = code(ev.depAirport), arrCode = code(ev.arrAirport);
  const nameOf = (s?: string) => (s || "").replace(/\s*\([A-Z]{3}\)\s*$/, "");
  const status = eventStatusPill(ev.status, ev.date, c, today);
  const flightColor = eventColor("flight", c);
  const stub = [
    { label: "Terminal", value: (ev.terminal || "").replace(/^T/i, "") || null },
    { label: "Gate", value: ev.gate || null },
    { label: "Seat", value: ev.seatDetails || null },
    { label: "Check-in", value: ev.checkin || null },
    { label: "Arrival terminal", value: (ev.arrTerminal || "").replace(/^T/i, "") || null },
    { label: "Baggage belt", value: ev.baggageBelt || null },
  ];
  return (
    <div style={{ position: "relative" }}>
      <BackButton onBack={onBack} ink={isDark ? "#fff" : c.textPrimary} />
      <div style={{ position: "relative", height: 190, overflow: "hidden", background: c.elevated }}>
        {trip.image && <img src={trip.image} alt="" style={{ position: "absolute", inset: -30, width: "calc(100% + 60px)", height: "calc(100% + 60px)", objectFit: "cover", filter: "blur(16px)" }} />}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)"} 0%, transparent 30%)` }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${c.bg}00 60%, ${c.bg} 100%)` }} />
      </div>
      <div style={{ padding: "0 14px", marginTop: -70, position: "relative" }}>
        <div style={{ background: c.card, borderRadius: CARD, overflow: "hidden", boxShadow: isDark ? "none" : "0 8px 24px rgba(0,0,0,0.10)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 8px" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {iata && !logoError
                ? <img src={`https://images.kiwi.com/airlines/64/${iata}.png`} alt="" onError={() => setLogoError(true)} style={{ width: 28, height: 28, objectFit: "contain" }} />
                : <span style={{ fontSize: 12, fontWeight: 800, color: "#111" }}>{iata || (ev.airline || "--").slice(0, 2).toUpperCase()}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.airline || "Airline"}</div>
              <div style={{ fontSize: 11, color: c.textTertiary, marginTop: 1 }}>{[ev.flightNum, ev.aircraft].filter(Boolean).join(" · ")}</div>
            </div>
            {status && <StatusPill color={status.color} label={status.label} c={c} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: c.textPrimary, lineHeight: 1 }}>{depCode || "---"}</div>
              <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(ev.depAirport) || " "}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1.2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                <span style={{ flex: 1, height: 1, background: c.border }} />
                <AirplaneTilt size={16} color={flightColor} weight="fill" style={{ transform: "rotate(45deg)" }} />
                <span style={{ flex: 1, height: 1, background: c.border }} />
              </div>
              <div style={{ fontSize: 10, color: c.textTertiary, whiteSpace: "nowrap" }}>{ev.duration || " "}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: c.textPrimary, lineHeight: 1 }}>{arrCode || "---"}</div>
              <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(ev.arrAirport) || " "}</div>
            </div>
          </div>
          <div style={{ display: "flex", padding: "8px 12px 12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: c.textTertiary }}>Departs</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: c.textPrimary, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{isPlaceholderTime(ev.time) ? "--:--" : ev.time}</div>
              <div style={{ fontSize: 10, color: c.textTertiary }}>{[ev.date ? shortDate(ev.date) : null, ev.depTz].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontSize: 10, color: c.textTertiary }}>Arrives</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: c.textPrimary, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{!ev.endTime || isPlaceholderTime(ev.endTime) ? "--:--" : ev.endTime}</div>
              <div style={{ fontSize: 10, color: c.textTertiary }}>{[ev.endDate ? shortDate(ev.endDate) : ev.date ? shortDate(ev.date) : null, ev.arrTz].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          {/* perforation */}
          <div style={{ position: "relative", height: 16, display: "flex", alignItems: "center", padding: "0 10px" }}>
            <div style={{ position: "absolute", left: -8, top: 0, width: 16, height: 16, borderRadius: 8, background: c.bg }} />
            <div style={{ flex: 1, borderTop: `1.5px dashed ${c.border}` }} />
            <div style={{ position: "absolute", right: -8, top: 0, width: 16, height: 16, borderRadius: 8, background: c.bg }} />
          </div>
          {/* stub */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", rowGap: 10, padding: "6px 12px 12px" }}>
            {stub.map(f => (
              <div key={f.label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, color: c.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: f.value ? c.textPrimary : c.textTertiary, marginTop: 2 }}>{f.value ?? "TBA"}</div>
              </div>
            ))}
          </div>
        </div>

        {ev.documents && ev.documents.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <Micro c={c} style={{ marginBottom: 6 }}>Documents</Micro>
            <div style={{ background: c.card, borderRadius: CARD, overflow: "hidden" }}>
              {ev.documents.map((d, i) => <DocRow key={d.id} name={d.name} size={d.size} c={c} last={i === ev.documents!.length - 1} tint={c.elevated} />)}
            </div>
          </div>
        )}
      </div>
      {trip.organizer && <OrganizerSection org={trip.organizer} c={c} />}
      <div style={{ height: 24 }} />
    </div>
  );
}

const FACT_RE = /([A-Za-z][^.,:;()\n]{2,48}?)\s*[:(]\s*((?:£|\$|€)\s?[\d,]+(?:\.\d{2})?)/g;
function extractFacts(body: string) {
  const out: { label: string; amount: string }[] = [];
  for (const m of body.matchAll(FACT_RE)) {
    const label = m[1].trim().replace(/\s+/g, " ");
    if (label.length > 2 && out.length < 3 && !out.some(f => f.label === label)) out.push({ label, amount: m[2].replace(/\s/g, "") });
  }
  return out;
}
function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function deadlineMeta(item: TripInfo, c: C, today: string) {
  if (item.completed) return { Icon: Check, label: "Completed", color: c.green };
  if (!item.deadline) return null;
  let dl = item.deadline;
  try { dl = format(parseISO(item.deadline), "EEE d MMM"); } catch { /* keep iso */ }
  const days = daysUntil(item.deadline, today);
  if (days < 0) return { Icon: WarningCircle, label: `Overdue · was due ${dl}`, color: c.red };
  if (days <= 7) return { Icon: Clock, label: `Due in ${days} day${days !== 1 ? "s" : ""} · ${dl}`, color: c.amber };
  return { Icon: Calendar, label: `Due ${dl}`, color: c.teal };
}

/** Information, as app/trip/info.tsx on the phone: one section per item. */
function InfoScreen({ info, c, today, onBack }: { info: TripInfo[]; c: C; today: string; onBack: () => void }) {
  const items = info.filter(i => !i.leaderOnly);
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  return (
    <div style={{ position: "relative" }}>
      <BackButton onBack={onBack} ink={c.textPrimary} />
      <div style={{ padding: "48px 18px 8px", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: c.textPrimary }}>Information</div>
      <div style={{ padding: "0 14px" }}>
        {items.length === 0 && <div style={{ fontSize: 12, color: c.textTertiary, padding: "24px 0", textAlign: "center" }}>Nothing shared yet.</div>}
        {items.map(item => {
          const isOpen = openId === item.id;
          const meta = deadlineMeta(item, c, today);
          const facts = item.body ? extractFacts(item.body) : [];
          const isLong = !!item.body && item.body.length > 220;
          return (
            <div key={item.id} style={{ background: c.card, borderRadius: CARD, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 4px" }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: c.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileText size={16} color={c.textPrimary} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>{item.title || "Information"}</div>
                  {item.source && <div style={{ fontSize: 11, color: c.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>From {item.source}</div>}
                </div>
              </div>
              <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {meta && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: meta.color }}>
                    <meta.Icon size={13} color={meta.color} weight="bold" />{meta.label}
                  </div>
                )}
                {facts.length > 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {facts.map(f => (
                      <div key={f.label} style={{ flex: 1, minWidth: 0, background: c.elevated, borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, letterSpacing: -0.2 }}>{f.amount}</div>
                        <div style={{ fontSize: 10, color: c.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                {item.actionUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.elevated, borderRadius: 12, padding: "8px 10px" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 15, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ArrowSquareOut size={14} color={c.teal} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>{item.actionLabel ?? "Open link"}</div>
                      <div style={{ fontSize: 10, color: c.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hostname(item.actionUrl)}</div>
                    </div>
                    <CaretRight size={13} color={c.textTertiary} />
                  </div>
                )}
                {item.notes?.map((note, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, background: rgba(c.amber, 0.12), borderRadius: 10, padding: "8px 10px" }}>
                    <Warning size={13} color={c.amber} weight="fill" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ fontSize: 11, lineHeight: "16px", color: c.textPrimary }}>{note}</div>
                  </div>
                ))}
                {item.body && (
                  <div>
                    <div style={{ position: "relative" }}>
                      <div style={{ fontSize: 12, lineHeight: "18px", color: c.textPrimary, whiteSpace: "pre-wrap", display: isLong && !isOpen ? "-webkit-box" : "block", WebkitLineClamp: isLong && !isOpen ? 5 : undefined, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.actionUrl ? item.body.split(item.actionUrl).join("").trim() : item.body}
                      </div>
                      {isLong && !isOpen && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: `linear-gradient(to bottom, ${c.card}00, ${c.card})` }} />}
                    </div>
                    {isLong && (
                      <button type="button" onClick={() => setOpenId(isOpen ? null : item.id)} style={{ marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: c.teal }}>
                        {isOpen ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                )}
                {item.documents && item.documents.length > 0 && (
                  <div style={{ borderTop: `0.5px solid ${c.border}`, paddingTop: 6 }}>
                    {item.documents.map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                        <Paperclip size={13} color={c.textTertiary} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                        <CaretRight size={13} color={c.textTertiary} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

const isPlaceholderTime = (t?: string) => !t || /^(tb[acd]|n\/a|—|-)$/i.test(t.trim());

function TripBody({ events, trip, c, activeEventId, today, onOpenEvent }: { events: TravelEvent[]; trip: Trip; c: C; activeEventId?: string | null; today?: string; onOpenEvent: (id: string) => void }) {
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
              aria-label={`${wd} ${num}, ${evs.length} event${evs.length === 1 ? "" : "s"}`}
              style={{
                flexShrink: 0, width: 48, padding: "8px 6px 6px", cursor: "pointer",
                background: c.card, border: `1.5px solid ${isToday ? c.teal : "transparent"}`, borderRadius: 12,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                opacity: dimPast && isPast ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 600, color: isToday ? c.teal : c.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 }}>{wd}</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: c.textPrimary, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{num}</span>
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
          <div role="button" tabIndex={0} onClick={() => onOpenEvent(upNext.id)} onKeyDown={k => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); onOpenEvent(upNext.id); } }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px 12px", cursor: "pointer" }}>
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
                      <div role="button" tabIndex={0} onClick={() => onOpenEvent(e.id)} onKeyDown={k => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); onOpenEvent(e.id); } }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", minHeight: 52, cursor: "pointer", background: active ? c.tealDim : "transparent", boxShadow: active ? `inset 0 0 0 1.5px ${c.teal}` : "none", transition: "background 200ms" }}>
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
  const todayStr = prefs.today ?? new Date().toISOString().split("T")[0];

  // Screen stack: the Trip screen, or an event or the Info screen pushed on top of it
  const [screen, setScreen] = useState<{ kind: "trip" } | { kind: "event"; id: string } | { kind: "info" }>({ kind: "trip" });
  const screenRef = useRef<HTMLDivElement>(null);
  const openEvent = (id: string) => setScreen({ kind: "event", id });
  const goBack = () => setScreen({ kind: "trip" });
  // Follow the event being edited in the workspace: open it, and return when the editor closes
  useEffect(() => {
    if (activeEventId) setScreen({ kind: "event", id: activeEventId });
    else setScreen(prev => prev.kind === "event" ? { kind: "trip" } : prev);
  }, [activeEventId]);
  useEffect(() => {
    if (screen.kind !== "trip") screenRef.current?.scrollTo({ top: 0 });
  }, [screen]);
  const screenEvent = screen.kind === "event" ? previewEvents.find(e => e.id === screen.id) ?? trip.events.find(e => e.id === screen.id) : null;
  const visibleInfo = (trip.info ?? []).filter(i => !i.leaderOnly);
  const infoCount = visibleInfo.length + (trip.documents?.length ?? 0);

  const paxNum = parseInt(trip.paxCount || trip.attendees || "0");
  const flag = destinationFlag(trip.destination);

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
            <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-[11px] font-medium text-muted-foreground">Preview settings</p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-border">
                <div className="px-4 py-3">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2.5">Finish</p>
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
                          <span className={`text-[9px] font-bold tracking-wide ${active ? "text-foreground" : "text-muted-foreground"}`}>
                            {f.label.split(" ").pop()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 shrink-0"><TextAa size={11} /> Text size</p>
                    <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-secondary p-0.5">
                      {TEXT_SCALES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          aria-pressed={prefs.textScale === t.value}
                          onClick={() => updatePrefs({ textScale: t.value })}
                          className={`h-6 px-2 rounded-md text-[10px] font-bold transition-colors ${prefs.textScale === t.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Checks readability with larger accessibility text.</p>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"><CalendarDot size={11} /> Simulate today</p>
                    {prefs.today && (
                      <button
                        type="button"
                        onClick={() => updatePrefs({ today: null })}
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center rounded-lg bg-secondary p-0.5">
                    <button
                      type="button"
                      aria-label="Previous day"
                      disabled={simPrevDisabled}
                      onClick={() => stepSim(-1)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <CaretLeft size={12} weight="bold" />
                    </button>
                    <span className={`flex-1 text-center text-[11px] font-bold ${prefs.today ? "text-foreground" : "text-muted-foreground"}`}>
                      {simLabel}
                    </span>
                    <button
                      type="button"
                      aria-label="Next day"
                      disabled={simNextDisabled}
                      onClick={() => stepSim(1)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <CaretRight size={12} weight="bold" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Shows past days dimmed and the TODAY badge as travelers will see them.</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")}
            className="h-7 w-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors"
          >
            {previewTheme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors"
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
                ref={screenRef}
                style={{ background: c.bg, height: "100%", overflowY: "auto", overflowX: "hidden", zoom: prefs.textScale, position: "relative" }}
                className="scrollbar-hide"
              >
                {screen.kind === "event" && screenEvent ? (
                  <EventScreen key={screenEvent.id} ev={screenEvent} trip={trip} c={c} isDark={isDark} today={todayStr} onBack={goBack} onOpenEvent={openEvent} />
                ) : screen.kind === "info" ? (
                  <InfoScreen info={trip.info ?? []} c={c} today={todayStr} onBack={goBack} />
                ) : (
                  <>
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
                <TripBody events={previewEvents} trip={trip} c={c} activeEventId={activeEventId} today={prefs.today ?? undefined} onOpenEvent={openEvent} />
                </div>

                {/* Organiser and the information row, as the phone shows them under the timeline */}
                {trip.organizer && <OrganizerSection org={trip.organizer} c={c} />}
                {infoCount > 0 && <InfoDocsRow count={infoCount} c={c} onOpen={() => setScreen({ kind: "info" })} />}

                {/* Bottom spacer */}
                <div style={{ height: 24 }} />
                  </>
                )}
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
