import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Car, MapPin, Users, Moon,
  CaretRight, CaretDown, FileText, Phone, Envelope, Hash, ArrowRight, Sun,
  DeviceMobileCamera, X, Train, Bus, Boat, Anchor, MapTrifold, Paperclip,
} from "@phosphor-icons/react";
import { useBrand } from "@/context/BrandContext";
import type { Trip, TravelEvent, TripOrganizer, TripInfo } from "@/types";

const MONO = "Menlo, Monaco, 'Courier New', monospace";

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

function resolveLocation(events: TravelEvent[]): string | null {
  for (const e of events) {
    if (!e.location) continue;
    const loc = e.location.replace(/\s+to\s+.*/i, "").trim();
    const city = loc.split(",")[0].trim();
    if (city) return city;
  }
  return null;
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
  const depCity = (depCode && IATA_CITY[depCode]) || ev.location?.split("→")[0]?.trim() || "";
  const arrCity = (arrCode && IATA_CITY[arrCode]) || ev.location?.split("→")[1]?.trim() || "";
  const depTime = ev.time ? formatTo24h(ev.time) : "";
  const arrTime = ev.endTime ? formatTo24h(ev.endTime) : "";

  return (
    <div style={{ background: c.card, borderRadius: 20, padding: "20px 16px" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
        <div style={{ flex: 1 }}>
          {depCity && <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 2 }}>{depCity}</div>}
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{depCode || "DEP"}</div>
          {depTime && <div style={{ fontSize: 12, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{depTime}</div>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {ev.flightNum && <span style={{ fontSize: 10, fontWeight: 500, color: c.textTertiary, letterSpacing: 0.3 }}>{ev.flightNum}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 4 }}>
            <div style={{ flex: 1, height: 3, background: col + "55", borderRadius: 2 }} />
            <AirplaneTilt size={16} color={col} style={{ transform: "rotate(90deg)" }} />
            <div style={{ flex: 1, height: 3, background: col + "55", borderRadius: 2 }} />
          </div>
          {ev.duration && <span style={{ fontSize: 10, fontWeight: 500, color: c.textTertiary }}>{ev.duration}</span>}
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          {arrCity && <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 2 }}>{arrCity}</div>}
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{arrCode || "ARR"}</div>
          {arrTime && <div style={{ fontSize: 12, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{arrTime}</div>}
        </div>
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
              <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{item.title || "Untitled"}</span>
              {item.body && <p style={{ fontSize: 10, color: c.textSecondary, margin: "4px 0 0", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{item.body.length > 120 ? item.body.slice(0, 120) + "..." : item.body}</p>}
              {item.documents && item.documents.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {item.documents.map(doc => (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                      <Paperclip size={10} color={c.teal} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: c.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
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
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
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

function DayListSection({ events, trip, c, isDark }: { events: TravelEvent[]; trip: Trip; c: C; isDark: boolean }) {
  const groups = useMemo(() => groupEventsByDay(events), [events]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  const start = new Date(trip.start + "T00:00:00");
  const end = new Date(trip.end + "T00:00:00");
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const nights = totalDays - 1;

  const currentDayIdx = groups.findIndex(([d]) => d >= todayStr);
  const currentDay = currentDayIdx >= 0 ? currentDayIdx + 1 : totalDays;
  const totalEvents = events.length;
  const pastEvents = events.filter(e => e.date < todayStr).length;
  const todayDoneEst = Math.round(events.filter(e => e.date === todayStr).length * 0.5);
  const completed = pastEvents + todayDoneEst;

  const dateRange = (() => {
    try {
      return `${format(parseISO(trip.start), "MMM d")} - ${format(parseISO(trip.end), "MMM d, yyyy")}`;
    } catch { return `${trip.start} - ${trip.end}`; }
  })();

  const travelerCount = (() => {
    if (trip.travelers?.length) return trip.travelers.length;
    const parsed = parseInt(trip.paxCount || "", 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    if (trip.attendees) {
      const moreMatch = trip.attendees.match(/\+(\d+)\s+more/i);
      const listed = trip.attendees.replace(/\+\d+\s+more/i, "").split(",").filter(s => s.trim()).length;
      return listed + (moreMatch ? parseInt(moreMatch[1], 10) : 0);
    }
    return 0;
  })();

  const maxEvents = Math.max(...groups.map(([, evs]) => evs.length), 1);

  const dayLocations = useMemo(() => {
    const locs: Record<string, string | null> = {};
    for (const [date, evs] of groups) locs[date] = resolveLocation(evs);
    return locs;
  }, [groups]);

  const isMultiCity = useMemo(() => {
    const unique = new Set(Object.values(dayLocations).filter(Boolean));
    return unique.size >= 2;
  }, [dayLocations]);

  const dividerColor = isDark ? c.border : "#e4e4e7";
  const progressBg = isDark ? c.elevated : "#e4e4e7";

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Trip header block */}
      <div style={{
        padding: "22px 18px 16px",
        borderBottom: `0.5px solid ${dividerColor}`,
      }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: c.textPrimary, letterSpacing: -0.3, marginBottom: 6 }}>
          {trip.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: c.textTertiary }}>{dateRange}</span>
          <span style={{ fontSize: 11, color: c.textDim }}> · </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: c.textTertiary }}>{totalDays} days</span>
          {travelerCount > 0 && (
            <>
              <span style={{ fontSize: 11, color: c.textDim }}> · </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: c.textTertiary }}>
                {travelerCount} traveler{travelerCount !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>

        {/* Progress strip */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: c.textDim, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Day {currentDay} of {totalDays}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: c.textDim, textTransform: "uppercase", letterSpacing: 1.5 }}>
              {completed}/{totalEvents} events
            </span>
          </div>
          <div style={{ height: 3, background: progressBg, borderRadius: 100, overflow: "hidden" }}>
            <div style={{
              height: 3, background: c.teal, borderRadius: 100,
              width: `${Math.min((completed / Math.max(totalEvents, 1)) * 100, 100)}%`,
            }} />
          </div>
        </div>
      </div>

      {/* Day rows */}
      <div style={{ padding: "0 14px" }}>
        {groups.map(([date, evs], dayIdx) => {
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
          const firstTime = !isPast && evs[0]?.time
            ? evs[0].time.replace(/^(\d{1,2}:\d{2}).*/, "$1")
            : null;

          const barPct = (evs.length / maxEvents) * 100;

          const dayNameColor = isToday
            ? (isDark ? c.teal : "#059669")
            : isPast
              ? (isDark ? c.textDim : "#a1a1aa")
              : c.textPrimary;
          const subColor = isToday
            ? c.textTertiary
            : isPast
              ? (isDark ? c.textDim : "#d4d4d8")
              : c.textTertiary;
          const iconColor = isToday
            ? (isDark ? c.teal : "#059669")
            : isPast
              ? (isDark ? c.textDim : "#a1a1aa")
              : (isDark ? c.textDim : "#71717a");
          const countColor = isToday
            ? (isDark ? c.teal : "#047857")
            : isPast
              ? (isDark ? c.textDim : "#a1a1aa")
              : (isDark ? c.textTertiary : "#52525b");
          const barColor = isToday
            ? c.teal
            : isPast
              ? (isDark ? c.elevated : "#d4d4d8")
              : (isDark ? c.textDim : "#a1a1aa");

          const photo = evs.find(e => e.image)?.image || null;
          const FallbackIcon = DAY_THUMB_ICONS[evs[0]?.type] || MapTrifold;

          const dayLoc = dayLocations[date];
          const prevLoc = dayIdx > 0 ? dayLocations[groups[dayIdx - 1][0]] : null;
          const showLocChip = isMultiCity && dayLoc && (dayIdx === 0 || dayLoc !== prevLoc);

          return (
            <div key={date}>
              <button
                type="button"
                onClick={() => setOpenDay(prev => prev === date ? null : date)}
                style={{
                  display: "block", width: "100%", cursor: "pointer",
                  background: "none", border: "none", textAlign: "left",
                  padding: "14px 12px", borderRadius: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  {/* Left: day info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Row 1: Weekday + Today pill + location chip */}
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <span style={{ fontSize: 18, fontWeight: 600, color: dayNameColor, letterSpacing: -0.2 }}>
                        {weekday}
                      </span>
                      {isToday && (
                        <span style={{
                          display: "inline-block",
                          padding: "2px 7px", borderRadius: 100,
                          background: isDark ? `${c.teal}18` : "#ecfdf5",
                          border: `0.5px solid ${isDark ? `${c.teal}33` : "#a7f3d0"}`,
                          fontFamily: MONO, fontSize: 9, fontWeight: 600,
                          color: isDark ? c.teal : "#047857",
                          textTransform: "uppercase", letterSpacing: 1.5,
                        }}>
                          Today
                        </span>
                      )}
                      {showLocChip && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          padding: "2px 7px", borderRadius: 100,
                          background: isDark ? c.elevated : "#f4f4f5",
                          border: `0.5px solid ${dividerColor}`,
                        }}>
                          <MapPin size={10} color={isDark ? c.textTertiary : "#71717a"} weight="fill" />
                          <span style={{ fontSize: 10.5, fontWeight: 500, color: isDark ? c.textTertiary : "#52525b" }}>
                            {dayLoc}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Row 2: Date + event count */}
                    <div style={{ fontFamily: MONO, fontSize: 11, color: subColor, marginTop: 3 }}>
                      {shortDate} · {evs.length} event{evs.length !== 1 ? "s" : ""}
                    </div>

                    {/* Row 3: Type icons with counts */}
                    {icons.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                        {icons.map(({ key, Icon, count }) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <Icon size={13} color={iconColor} />
                            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: countColor }}>
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: thumbnail + time */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: 12, gap: 4 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, overflow: "hidden",
                      background: isDark ? c.elevated : "#f4f4f5",
                      opacity: isPast ? 0.5 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {photo ? (
                        <img src={photo} alt="" style={{ width: 40, height: 40, objectFit: "cover" }} />
                      ) : (
                        <FallbackIcon size={16} color={isDark ? c.textDim : "#a1a1aa"} />
                      )}
                    </div>
                    {firstTime && (
                      <span style={{ fontFamily: MONO, fontSize: 10, color: isDark ? c.textDim : "#a1a1aa" }}>
                        {firstTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Density bar */}
                <div style={{ height: 3, background: isDark ? c.elevated : "#e4e4e7", borderRadius: 100, marginTop: 10, overflow: "hidden" }}>
                  <div style={{ height: 3, borderRadius: 100, background: barColor, width: `${barPct}%` }} />
                </div>
              </button>

              {/* Divider */}
              {!isOpen && (
                <div style={{ height: 0.5, background: dividerColor, marginInline: 12 }} />
              )}

              {/* Expanded events */}
              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 2, paddingBottom: 6 }}>
                  {evs.map(ev => <MobileEventCard key={ev.id} ev={ev} c={c} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MobilePreviewProps {
  trip: Trip;
  onClose: () => void;
}

export function MobilePreview({ trip, onClose }: MobilePreviewProps) {
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light">("dark");
  const c = previewTheme === "dark" ? dark : light;
  const isDark = previewTheme === "dark";
  const { brand } = useBrand();

  const paxNum = parseInt(trip.paxCount || trip.attendees || "0");
  let dateRange = "";
  try { dateRange = `${format(parseISO(trip.start), "MMM d")} – ${format(parseISO(trip.end), "MMM d, yyyy")}`; } catch { dateRange = `${trip.start} – ${trip.end}`; }

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#1f1f1f] shrink-0">
        <div className="flex items-center gap-2">
          <DeviceMobileCamera className="h-4 w-4 text-brand" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Mobile Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewTheme(previewTheme === "dark" ? "light" : "dark")}
            className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors"
          >
            {previewTheme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Phone frame container */}
      <div className="flex-1 flex items-start justify-center overflow-hidden p-4">
        <div
          className="relative w-full shrink-0"
          style={{ maxWidth: 310, aspectRatio: "390 / 844" }}
        >
          {/* Phone bezel */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              borderRadius: 44,
              background: isDark
                ? "linear-gradient(160deg, #3a3a3e 0%, #1c1c1e 30%, #252528 60%, #1a1a1c 100%)"
                : "linear-gradient(160deg, #e8e8ed 0%, #d1d1d6 30%, #e0e0e5 60%, #c7c7cc 100%)",
              padding: 2,
              boxShadow: isDark
                ? "0 2px 4px rgba(0,0,0,0.3), 0 12px 40px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08) inset"
                : "0 2px 4px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(255,255,255,0.6) inset",
            }}
          >
            {/* Screen area */}
            <div style={{ borderRadius: 42, overflow: "hidden", height: "100%", position: "relative" }}>
              {/* Status bar */}
              <div style={{ background: c.bg, padding: "6px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", height: 40, position: "relative", zIndex: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.textPrimary }}>9:41</span>
                {/* Dynamic Island */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 6, width: 100, height: 24, borderRadius: 16, background: "#000" }} />
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  <div style={{ width: 14, height: 9, borderRadius: 2, border: `1.5px solid ${c.textTertiary}`, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 2, borderRadius: 1, background: c.textPrimary }} />
                  </div>
                </div>
              </div>

              {/* Scrollable mobile screen */}
              <div
                style={{ background: c.bg, height: "calc(100% - 40px)", overflowY: "auto", overflowX: "hidden" }}
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
                <DayListSection events={trip.events} trip={trip} c={c} isDark={isDark} />

                {/* Bottom spacer */}
                <div style={{ height: 24 }} />
              </div>
            </div>
          </div>

          {/* Side buttons */}
          <div className="absolute top-[18%] -left-[1px] w-[2px] h-[20px] rounded-r-sm" style={{ background: isDark ? "#2a2a2c" : "#c7c7cc" }} />
          <div className="absolute top-[26%] -left-[1px] w-[2px] h-[38px] rounded-r-sm" style={{ background: isDark ? "#2a2a2c" : "#c7c7cc" }} />
          <div className="absolute top-[34%] -left-[1px] w-[2px] h-[38px] rounded-r-sm" style={{ background: isDark ? "#2a2a2c" : "#c7c7cc" }} />
          <div className="absolute top-[28%] -right-[1px] w-[2px] h-[56px] rounded-l-sm" style={{ background: isDark ? "#2a2a2c" : "#c7c7cc" }} />
        </div>
      </div>
    </div>
  );
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
