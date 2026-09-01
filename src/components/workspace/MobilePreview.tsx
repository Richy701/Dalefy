import { useState, useMemo, useRef, useEffect } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { DEVICES, FINISHES, type Device } from "./phoneFrameConfig";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Car, MapPin, Users, Moon,
  CaretRight, CaretLeft, CaretDown, FileText, Phone, Envelope, Hash, ArrowRight, Sun,
  DeviceMobileCamera, X, Train, Bus, Boat, Anchor, MapTrifold, Paperclip,
  AppleLogo, AndroidLogo, SlidersHorizontal, TextAa, CalendarDot,
} from "@phosphor-icons/react";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import type { Trip, TravelEvent, TripOrganizer, TripInfo } from "@/types";

const dark = {
  bg: "#09090b", card: "#141418", elevated: "#1c1c22",
  border: "rgba(255,255,255,0.10)",
  textPrimary: "#EDEDEF", textSecondary: "#9a9a9a", textTertiary: "#8e8e96", textDim: "#4a4a4a",
  teal: "#0bd2b5", tealDim: "rgba(11,210,181,0.1)", tealMid: "rgba(11,210,181,0.25)",
  flight: "#0bd2b5", hotel: "#a78bfa", activity: "#f59e0b", dining: "#fb7185", transfer: "#60a5fa",
};
const light = {
  bg: "#f5f6fa", card: "#ffffff", elevated: "#f0f1f5",
  border: "rgba(0,0,0,0.07)",
  textPrimary: "#0d0f14", textSecondary: "#4b5263", textTertiary: "#555d6e", textDim: "#c5cad6",
  teal: "#0ab8a0", tealDim: "rgba(10,184,160,0.12)", tealMid: "rgba(10,184,160,0.25)",
  flight: "#0ab8a0", hotel: "#8b5cf6", activity: "#d97706", dining: "#e11d48", transfer: "#3b82f6",
};

type C = typeof dark;

function eventColor(type: string, c: C) {
  return (c as Record<string, string>)[type] ?? c.teal;
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

function formatTo24h(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

const IATA_CITY: Record<string, string> = {
  LHR: "London", LGW: "London", STN: "London", CDG: "Paris", ORY: "Paris",
  JFK: "New York", EWR: "New York", LGA: "New York", LAX: "Los Angeles",
  SFO: "San Francisco", ORD: "Chicago", ATL: "Atlanta", MIA: "Miami",
  DFW: "Dallas", DEN: "Denver", SEA: "Seattle", BOS: "Boston",
  SIN: "Singapore", HND: "Tokyo", NRT: "Tokyo", ICN: "Seoul",
  HKG: "Hong Kong", BKK: "Bangkok", DXB: "Dubai", DOH: "Doha",
  IST: "Istanbul", SYD: "Sydney", MEL: "Melbourne", FCO: "Rome",
  AMS: "Amsterdam", FRA: "Frankfurt", MAD: "Madrid", BCN: "Barcelona",
  LIS: "Lisbon", ZRH: "Zurich", VIE: "Vienna", DUB: "Dublin",
  ACC: "Accra", LOS: "Lagos", NBO: "Nairobi",
};

const ICON_ORDER = ["flight", "train", "bus", "car", "ferry", "hotel", "dining", "activity"] as const;

const TYPE_ICON_MAP: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, train: Train, bus: Bus, car: Car, ferry: Boat,
  hotel: Bed, dining: ForkKnife, activity: Compass,
};

const DAY_THUMB_ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, hotel: Bed, activity: Compass,
  dining: ForkKnife, transfer: Car,
};

function typeCounts(events: TravelEvent[]): Array<{ key: string; Icon: React.ComponentType<any>; count: number }> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.type === "transfer") {
      const sub = e.transferType || "car";
      counts[sub] = (counts[sub] || 0) + 1;
    } else {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
  }
  const result: Array<{ key: string; Icon: React.ComponentType<any>; count: number }> = [];
  for (const k of ICON_ORDER) {
    if (counts[k]) result.push({ key: k, Icon: TYPE_ICON_MAP[k] || Compass, count: counts[k] });
  }
  return result.length <= 5 ? result : result.slice(0, 4);
}


function TransferIcon({ transferType, color }: { transferType?: string; color: string }) {
  const s = 12;
  switch (transferType) {
    case "train": return <Train size={s} color={color} />;
    case "bus": return <Bus size={s} color={color} />;
    case "ferry": return <Boat size={s} color={color} />;
    case "cruise": return <Anchor size={s} color={color} />;
    default: return <Car size={s} color={color} />;
  }
}

function EventIcon({ type, color, transferType }: { type: string; color: string; transferType?: string }) {
  const s = 12;
  switch (type) {
    case "flight": return <AirplaneTilt size={s} color={color} />;
    case "hotel": return <Bed size={s} color={color} />;
    case "activity": return <Compass size={s} color={color} />;
    case "dining": return <ForkKnife size={s} color={color} />;
    case "transfer": return <TransferIcon transferType={transferType} color={color} />;
    default: return <Compass size={s} color={color} />;
  }
}

function GlassPill({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      paddingInline: 10, paddingBlock: 5, borderRadius: 100,
      background: "rgba(9,9,11,0.65)",
      border: "0.5px solid rgba(255,255,255,0.10)",
    }}>
      {children}
    </div>
  );
}

function GlassPillText({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color }}>
      {children}
    </span>
  );
}

function FlightCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = c.flight;
  let depCode = ev.depAirport?.toUpperCase() || "";
  let arrCode = ev.arrAirport?.toUpperCase() || "";
  if (!depCode || !arrCode) {
    const loc = ev.location || ev.title || "";
    const m = loc.match(/([A-Z]{3})\s*(?:to|→|➜|>|–|—|-)\s*([A-Z]{3})/i);
    if (m) {
      if (!depCode) depCode = m[1].toUpperCase();
      if (!arrCode) arrCode = m[2].toUpperCase();
    }
  }
  const cleanAirportName = (s: string) => s.replace(/\s+(international\s+)?airport$/i, "").trim();
  const depCity = (depCode && IATA_CITY[depCode]) || cleanAirportName(ev.location?.split("→")[0]?.trim() || "");
  const arrCity = (arrCode && IATA_CITY[arrCode]) || cleanAirportName(ev.location?.split("→")[1]?.trim() || "");
  const cleanTime = (t?: string) => (!t || /^(tbd|tba|n\/a|—|-)$/i.test(t.trim()) ? "" : formatTo24h(t));
  const depTime = cleanTime(ev.time);
  const arrTime = cleanTime(ev.endTime);

  const primary = (code: string, city: string, placeholder: string) =>
    code ? (
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{code}</div>
    ) : city ? (
      <div style={{
        fontSize: 15, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.25, color: c.textPrimary,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{city}</div>
    ) : (
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.textDim }}>{placeholder}</div>
    );

  return (
    <div style={{ background: c.card, borderRadius: 20, padding: "20px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 8 }}>
        {depCode && depCity && <div style={{ gridColumn: 1, gridRow: 1, alignSelf: "end", fontSize: 11, color: c.textSecondary, marginBottom: 2 }}>{depCity}</div>}
        {ev.flightNum && <div style={{ gridColumn: 2, gridRow: 1, alignSelf: "end", textAlign: "center", fontSize: 10, fontWeight: 500, color: c.textTertiary, letterSpacing: 0.3, marginBottom: 2 }}>{ev.flightNum}</div>}
        {arrCode && arrCity && <div style={{ gridColumn: 3, gridRow: 1, alignSelf: "end", textAlign: "right", fontSize: 11, color: c.textSecondary, marginBottom: 2 }}>{arrCity}</div>}

        <div style={{ gridColumn: 1, gridRow: 2, alignSelf: "center" }}>{primary(depCode, depCity, "DEP")}</div>
        <div style={{ gridColumn: 2, gridRow: 2, alignSelf: "center", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ flex: 1, height: 3, background: col + "55", borderRadius: 2 }} />
          <AirplaneTilt size={16} color={col} style={{ transform: "rotate(90deg)" }} />
          <div style={{ flex: 1, height: 3, background: col + "55", borderRadius: 2 }} />
        </div>
        <div style={{ gridColumn: 3, gridRow: 2, alignSelf: "center", display: "flex", justifyContent: "flex-end", textAlign: "right" }}>{primary(arrCode, arrCity, "ARR")}</div>

        {depTime && <div style={{ gridColumn: 1, gridRow: 3, fontSize: 12, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{depTime}</div>}
        {ev.duration && <div style={{ gridColumn: 2, gridRow: 3, textAlign: "center", fontSize: 10, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{ev.duration}</div>}
        {arrTime && <div style={{ gridColumn: 3, gridRow: 3, textAlign: "right", fontSize: 12, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{arrTime}</div>}
      </div>

      {(ev.gate || ev.seatDetails) && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {ev.gate && <Chip label="GATE" value={ev.gate} c={c} />}
          {ev.seatDetails && <Chip label="SEAT" value={ev.seatDetails} c={c} />}
        </div>
      )}

      {ev.confNumber && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 10 }}>
          <Hash size={9} color={c.textDim} />
          <span style={{ fontSize: 9, fontWeight: 700, color: c.textDim, letterSpacing: 0.8 }}>{ev.confNumber}</span>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, c }: { label: string; value: string; c: C }) {
  return (
    <div style={{ background: c.elevated, borderRadius: 10, padding: "6px 10px" }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: c.textTertiary, letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.textPrimary }}>{value}</div>
    </div>
  );
}

function CardHeader({ icon, label, color, time, c }: { icon: React.ReactNode; label: string; color: string; time?: string; c: C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <div style={{ width: 24, height: 24, borderRadius: 12, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, flex: 1, letterSpacing: 0.5 }}>{label}</span>
      {time && <span style={{ fontSize: 11, color: c.textTertiary }}>{time}</span>}
    </div>
  );
}

function HotelCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = c.hotel;
  const label = ev.isOvernight ? "Overnight" : "Stay";
  return (
    <div style={{ background: c.card, borderRadius: 20, overflow: "hidden" }}>
      {ev.image && (
        <div style={{ position: "relative", height: 140, overflow: "hidden" }}>
          <img src={ev.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <GlassPill>
              <Bed size={10} color={c.teal} />
              <GlassPillText color={c.teal}>{ev.isOvernight ? "Overnight" : "Stay"}</GlassPillText>
            </GlassPill>
            {!ev.isOvernight && ev.time && (
              <GlassPill>
                <GlassPillText color="#f4f4f5">{ev.time}</GlassPillText>
              </GlassPill>
            )}
          </div>
        </div>
      )}
      <div style={{ padding: "12px 14px" }}>
        {!ev.image && (
          <CardHeader
            icon={<Bed size={12} color={col} />}
            label={label}
            color={col}
            time={!ev.isOvernight ? ev.time : undefined}
            c={c}
          />
        )}
        <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, letterSpacing: -0.2, marginBottom: 4 }}>{ev.title}</div>
        {ev.location && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 10 }}>
            <MapPin size={10} color={c.textTertiary} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, lineHeight: "15px" }}>{ev.location}</span>
          </div>
        )}
        {!ev.isOvernight && (ev.time || ev.endTime) && !ev.image && (
          <div style={{ display: "flex", alignItems: "center", background: c.elevated, borderRadius: 10, padding: "6px 10px", marginBottom: 6 }}>
            {ev.time && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: c.textTertiary, letterSpacing: 0.5, marginBottom: 1 }}>Check in</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.textPrimary }}>{formatTo24h(ev.time)}</div>
              </div>
            )}
            {ev.time && ev.endTime && <ArrowRight size={12} color={col} />}
            {ev.endTime && (
              <div style={{ flex: 1, textAlign: ev.time ? "right" : "left" }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: c.textTertiary, letterSpacing: 0.5, marginBottom: 1 }}>Check out</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.textPrimary }}>{formatTo24h(ev.endTime)}</div>
              </div>
            )}
          </div>
        )}
        {ev.roomType && <div style={{ fontSize: 10, fontWeight: 700, color: col, marginTop: 6 }}>{ev.roomType}</div>}
      </div>
    </div>
  );
}

function GenericCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = eventColor(ev.type, c);
  const transferLabels: Record<string, string> = { car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise", other: "Transfer" };
  const label = ev.type === "dining" ? "Dining" : ev.type === "transfer" ? (transferLabels[ev.transferType || "car"] || "Transfer") : "Activity";
  const timeStr = ev.time ? `${ev.time}${ev.endTime ? ` – ${ev.endTime}` : ""}` : undefined;
  return (
    <div style={{ background: c.card, borderRadius: 20, overflow: "hidden" }}>
      {ev.image && (
        <div style={{ position: "relative", height: 140, overflow: "hidden" }}>
          <img src={ev.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <GlassPill>
              <EventIcon type={ev.type} color={c.teal} transferType={ev.transferType} />
              <GlassPillText color={c.teal}>{label}</GlassPillText>
            </GlassPill>
            {timeStr && (
              <GlassPill>
                <GlassPillText color="#f4f4f5">{timeStr}</GlassPillText>
              </GlassPill>
            )}
          </div>
        </div>
      )}
      <div style={{ padding: "12px 14px" }}>
        {!ev.image && (
          <CardHeader
            icon={<EventIcon type={ev.type} color={col} transferType={ev.transferType} />}
            label={label}
            color={col}
            time={timeStr}
            c={c}
          />
        )}
        <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, letterSpacing: -0.2, marginBottom: 4 }}>{ev.title}</div>
        {ev.description && <div style={{ fontSize: 11, color: c.textTertiary, lineHeight: "17px", marginBottom: 6 }}>{ev.description}</div>}
        {ev.location && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 6 }}>
            <MapPin size={10} color={c.textTertiary} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary }}>{ev.location}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {ev.status && <span style={{ fontSize: 10, fontWeight: 700, color: c.textDim, letterSpacing: 0.6, textTransform: "uppercase" }}>{ev.status}</span>}
          {ev.price && <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{ev.price}</span>}
        </div>
      </div>
    </div>
  );
}

function MobileEventCard({ ev, c }: { ev: TravelEvent; c: C }) {
  if (ev.type === "flight") return <FlightCard ev={ev} c={c} />;
  if (ev.type === "hotel") return <HotelCard ev={ev} c={c} />;
  return <GenericCard ev={ev} c={c} />;
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

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function DayListSection({ events, trip, c, isDark, activeEventId, today }: { events: TravelEvent[]; trip: Trip; c: C; isDark: boolean; activeEventId?: string | null; today?: string }) {
  const groups = useMemo(() => groupEventsByDay(events), [events]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Follow the event being edited in the workspace: open its day and bring the
  // card into view so the organizer sees how their change lands on a phone.
  useEffect(() => {
    if (!activeEventId) return;
    const group = groups.find(([, evs]) => evs.some(e => e.id === activeEventId));
    if (!group) return;
    const day = group[0];
    const id = window.setTimeout(() => {
      setOpenDay(day);
      requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLElement>(`[data-preview-event="${activeEventId}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeEventId, groups]);

  const jumpToDay = (date: string) => {
    setOpenDay(date);
    window.setTimeout(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-preview-day="${date}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 30);
  };

  if (groups.length === 0) return null;

  const todayStr = today ?? new Date().toISOString().split("T")[0];
  const start = new Date(trip.start + "T00:00:00");
  const end = new Date(trip.end + "T00:00:00");
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const totalEvents = events.length;
  // Only events on days that have passed count as done; we can't know about today's
  const completed = events.filter(e => e.date < todayStr).length;

  const currentDayIdx = groups.findIndex(([d]) => d >= todayStr);
  const currentDay = currentDayIdx >= 0 ? currentDayIdx + 1 : totalDays;

  const progressBg = isDark ? c.elevated : "#e4e4e7";

  return (
    <div ref={rootRef} style={{ paddingBottom: 16 }}>
      {/* Itinerary header */}
      <div style={{ padding: "18px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.textTertiary, letterSpacing: 1.5 }}>ITINERARY</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: c.textDim }}>
            Day {currentDay} of {totalDays}  ·  {completed}/{totalEvents} done
          </span>
        </div>
        <div style={{ height: 3, background: progressBg, borderRadius: 100, overflow: "hidden" }}>
          <div style={{
            height: 3, background: c.teal, borderRadius: 100,
            width: `${Math.min((completed / Math.max(totalEvents, 1)) * 100, 100)}%`,
          }} />
        </div>
        {groups.length > 1 && (
          <div className="scrollbar-hide" style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 12, paddingBottom: 2 }}>
            {groups.map(([date], i) => {
              const active = openDay === date;
              let lbl = "";
              try { lbl = format(parseISO(date), "EEE d"); } catch { lbl = date; }
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => jumpToDay(date)}
                  style={{
                    flexShrink: 0, cursor: "pointer",
                    padding: "5px 9px", borderRadius: 8,
                    border: `1px solid ${active ? c.teal : c.border}`,
                    background: active ? c.tealDim : "transparent",
                    color: active ? c.teal : c.textDim,
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1,
                  }}
                >
                  <span style={{ opacity: 0.6, marginRight: 4 }}>D{i + 1}</span>{lbl}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Day cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 14px" }}>
        {groups.map(([date, evs]) => {
          const isToday = date === todayStr;
          const isPast = date < todayStr;
          const isOpen = openDay === date;

          let weekday = "";
          let shortDate = "";
          try {
            const d = parseISO(date);
            weekday = format(d, "EEEE");
            shortDate = format(d, "MMM d");
          } catch { weekday = date; }

          const icons = typeCounts(evs);
          const firstTime = evs[0]?.time
            ? evs[0].time.replace(/^(\d{1,2}:\d{2}).*/, "$1")
            : null;

          const photo = evs.find(e => e.image)?.image || null;
          const FallbackIcon = DAY_THUMB_ICONS[evs[0]?.type] || MapTrifold;
          const gradHue = hashStr(evs[0]?.title || date) % 360;

          return (
            <div key={date} data-preview-day={date} style={{ scrollMarginTop: 8 }}>
              <button
                type="button"
                onClick={() => setOpenDay(prev => prev === date ? null : date)}
                style={{
                  display: "block", width: "100%", cursor: "pointer",
                  background: "none", border: "none", textAlign: "left",
                  padding: 0, position: "relative",
                  height: 100, borderRadius: 14, overflow: "hidden",
                }}
              >
                {/* Background: photo or gradient */}
                {photo ? (
                  <img src={photo} alt="" style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%", objectFit: "cover",
                  }} />
                ) : (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `linear-gradient(135deg, hsl(${gradHue}, 35%, ${isDark ? 22 : 55}%), hsl(${(gradHue + 40) % 360}, 30%, ${isDark ? 12 : 40}%))`,
                  }} />
                )}

                {/* Past overlay */}
                {isPast && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
                )}

                {/* Bottom gradient */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.7) 100%)",
                }} />

                {/* Fallback icon (no photo) */}
                {!photo && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: 0.15,
                  }}>
                    <FallbackIcon size={36} color="#fff" />
                  </div>
                )}

                {/* Bottom content overlay */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 12px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: -0.2 }}>
                      {weekday}
                    </span>
                    {isToday && (
                      <span style={{
                        padding: "1px 6px", borderRadius: 100,
                        background: c.teal,
                        fontSize: 8, fontWeight: 800, color: "#000",
                        letterSpacing: 1, textTransform: "uppercase",
                      }}>
                        TODAY
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{shortDate}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>·</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
                        {evs.length} event{evs.length !== 1 ? "s" : ""}
                      </span>
                      {firstTime && (
                        <>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>·</span>
                          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{firstTime}</span>
                        </>
                      )}
                    </div>
                    {icons.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {icons.map(({ key, Icon, count }) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <Icon size={10} color="rgba(255,255,255,0.6)" />
                            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded events */}
              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, paddingBottom: 4 }}>
                  {evs.map(ev => {
                    const active = ev.id === activeEventId;
                    return (
                      <div
                        key={ev.id}
                        data-preview-event={ev.id}
                        style={{
                          borderRadius: 14,
                          boxShadow: active ? `0 0 0 2px ${c.teal}, 0 0 0 6px ${c.tealDim}` : "none",
                          transition: "box-shadow 200ms",
                        }}
                      >
                        <MobileEventCard ev={ev} c={c} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
    return { ...base, teal: accent, tealDim: `rgba(${rgb},0.12)`, tealMid: `rgba(${rgb},0.25)`, flight: accent };
  }, [isDark, brand.accentColor]);
  const previewEvents = events ?? trip.events;

  const paxNum = parseInt(trip.paxCount || trip.attendees || "0");
  let dateRange = "";
  try { dateRange = `${format(parseISO(trip.start), "MMM d")} – ${format(parseISO(trip.end), "MMM d, yyyy")}`; } catch { dateRange = `${trip.start} – ${trip.end}`; }

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
                style={{ background: c.bg, height: "100%", overflowY: "auto", overflowX: "hidden", zoom: prefs.textScale }}
                className="scrollbar-hide"
              >
                {/* Hero */}
                <div style={{ position: "relative", height: 310, overflow: "hidden" }}>
                  <img
                    src={trip.image}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to bottom, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.91) 100%)",
                  }} />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to right, rgba(0,0,0,0.15) 0%, transparent 100%)",
                  }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 14px 16px" }}>
                    {/* Brand eyebrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                      {brand.logoUrl ? (
                        <img src={brand.logoUrl} alt="" style={{ width: 10, height: 10, borderRadius: 2 }} />
                      ) : (
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: c.teal }} />
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, textTransform: "uppercase", letterSpacing: 2 }}>
                        {brand.name} · Itinerary
                      </span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: -0.3, lineHeight: "30px", marginBottom: 10 }}>
                      {trip.name}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {paxNum > 0 && (
                        <HeroChip><Users size={10} color={c.teal} /> {paxNum} attendees</HeroChip>
                      )}
                      <HeroChip><Moon size={10} color={c.teal} /> {dateRange}</HeroChip>
                      {trip.destination && (
                        <HeroChip><MapPin size={10} color={c.teal} /> {trip.destination}</HeroChip>
                      )}
                    </div>
                  </div>
                </div>

                {/* Organizer */}
                {trip.organizer && <OrganizerSection org={trip.organizer} c={c} />}

                {/* Info */}
                {((trip.info && trip.info.length > 0) || (trip.documents && trip.documents.length > 0)) && <InfoDocsSection info={trip.info ?? []} documents={trip.documents ?? []} c={c} />}

                {/* Day list */}
                <DayListSection events={previewEvents} trip={trip} c={c} isDark={isDark} activeEventId={activeEventId} today={prefs.today ?? undefined} />

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

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: "rgba(255,255,255,0.10)", borderRadius: 100,
      padding: "5px 10px", fontSize: 10, fontWeight: 600,
      color: "rgba(255,255,255,0.85)", letterSpacing: 0.1,
      whiteSpace: "nowrap",
    }}>
      {children}
    </div>
  );
}
