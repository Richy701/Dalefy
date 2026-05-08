import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Car, MapPin, Users, Moon,
  CaretDown, FileText, Phone, Envelope, Hash, ArrowRight, Sun,
  DeviceMobileCamera, X, Info, Train, Bus, Boat, Anchor,
} from "@phosphor-icons/react";
import type { Trip, TravelEvent, TripOrganizer, TripInfo } from "@/types";

const dark = {
  bg: "#09090b", card: "#141418", elevated: "#1c1c22",
  border: "rgba(255,255,255,0.10)",
  textPrimary: "#EDEDEF", textSecondary: "#9a9a9a", textTertiary: "#8e8e96", textDim: "#4a4a4a",
  teal: "#0bd2b5", tealDim: "rgba(11,210,181,0.1)",
  flight: "#0bd2b5", hotel: "#a78bfa", activity: "#f59e0b", dining: "#fb7185", transfer: "#60a5fa",
};
const light = {
  bg: "#f5f6fa", card: "#ffffff", elevated: "#f0f1f5",
  border: "rgba(0,0,0,0.07)",
  textPrimary: "#0d0f14", textSecondary: "#4b5263", textTertiary: "#555d6e", textDim: "#c5cad6",
  teal: "#0ab8a0", tealDim: "rgba(10,184,160,0.12)",
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
    evs.sort((a, b) => {
      const ta = timeToMin(a.time);
      const tb = timeToMin(b.time);
      return ta - tb;
    });
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
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{depCode || "DEP"}</div>
          {depTime && <div style={{ fontSize: 12, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{depTime}</div>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {ev.flightNum && <span style={{ fontSize: 10, fontWeight: 500, color: c.textTertiary, letterSpacing: 0.3 }}>{ev.flightNum}</span>}
            <Info size={11} color={c.textTertiary} />
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
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{arrCode || "ARR"}</div>
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
      <Info size={13} color={c.textTertiary} />
    </div>
  );
}

function HotelCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = c.hotel;
  const label = ev.isOvernight ? "Overnight" : "Stay";
  return (
    <div style={{ background: c.card, borderRadius: 20, overflow: "hidden" }}>
      {ev.image && <img src={ev.image} alt="" style={{ width: "100%", height: 130, objectFit: "cover" }} />}
      <div style={{ padding: "12px 14px" }}>
        <CardHeader
          icon={<Bed size={12} color={col} />}
          label={label}
          color={col}
          time={!ev.isOvernight ? ev.time : undefined}
          c={c}
        />
        <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, letterSpacing: -0.2, marginBottom: 4 }}>{ev.title}</div>
        {ev.location && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 10 }}>
            <MapPin size={10} color={c.textTertiary} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, lineHeight: "15px" }}>{ev.location}</span>
          </div>
        )}
        {!ev.isOvernight && (ev.time || ev.endTime) && (
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
      {ev.image && <img src={ev.image} alt="" style={{ width: "100%", height: 130, objectFit: "cover" }} />}
      <div style={{ padding: "12px 14px" }}>
        <CardHeader
          icon={<EventIcon type={ev.type} color={col} transferType={ev.transferType} />}
          label={label}
          color={col}
          time={timeStr}
          c={c}
        />
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
          <img src={org.avatar} alt="" style={{ width: 44, height: 44, borderRadius: 100, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 100, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: c.teal }}>{initials}</span>
          </div>
        )}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: c.textTertiary, letterSpacing: 1.5, textTransform: "uppercase" }}>YOUR ORGANIZER</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>{org.name}</div>
          {(org.role || org.company) && (
            <div style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, marginTop: 1 }}>
              {[org.role, org.company].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>
      {(org.phone || org.email) && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
          {org.phone && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: c.tealDim, borderRadius: 10, padding: "8px 0" }}>
              <Phone size={12} color={c.teal} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, letterSpacing: 1, textTransform: "uppercase" }}>Call</span>
            </div>
          )}
          {org.email && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: c.tealDim, borderRadius: 10, padding: "8px 0" }}>
              <Envelope size={12} color={c.teal} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, letterSpacing: 1, textTransform: "uppercase" }}>Email</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoDocsSection({ info, c }: { info: TripInfo[]; c: C }) {
  const visibleCount = info.filter(i => !i.leaderOnly).length;
  if (visibleCount === 0) return null;
  return (
    <div style={{ margin: "10px 14px 0", padding: "10px 12px", background: c.card, borderRadius: 20, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={13} color={c.teal} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.textSecondary, letterSpacing: 1, flex: 1 }}>INFORMATION & DOCUMENTS</span>
      <div style={{ background: c.tealDim, borderRadius: 8, padding: "2px 6px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, letterSpacing: 0.5 }}>{visibleCount}</span>
      </div>
    </div>
  );
}

const DAY_TYPE_ICONS: Record<string, string> = {
  flight: "flight", hotel: "hotel", activity: "activity", dining: "dining", transfer: "transfer",
};

function ItinerarySection({ events, c }: { events: TravelEvent[]; c: C }) {
  const groups = useMemo(() => groupEventsByDay(events), [events]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ paddingBottom: 16 }}>
      <SectionHeader label="ITINERARY" c={c} />
      <div style={{ padding: "0 14px" }}>
        {groups.map(([date, evs]) => {
          const isToday = date === today;
          const isOpen = openDay === date;
          let weekday = "";
          let shortDate = "";
          try {
            const d = parseISO(date);
            weekday = format(d, "EEEE");
            shortDate = format(d, "MMM d");
          } catch { weekday = date; }

          const iconKeys = new Set<string>();
          evs.forEach(e => {
            if (e.type === "transfer" && e.transferType) iconKeys.add(`transfer:${e.transferType}`);
            else iconKeys.add(e.type);
          });
          const typeIcons = [...iconKeys].slice(0, 4);

          return (
            <div key={date}>
              <button
                type="button"
                onClick={() => setOpenDay(prev => prev === date ? null : date)}
                style={{ display: "block", padding: "10px 6px", width: "100%", cursor: "pointer", background: "none", border: "none", textAlign: "left" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: isToday ? c.teal : c.textPrimary }}>{weekday}</span>
                  <CaretDown size={13} color={c.textTertiary} style={{ transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", marginTop: 3, gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary }}>
                    {shortDate} · {evs.length} event{evs.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {typeIcons.map(key => {
                      const baseType = key.startsWith("transfer:") ? "transfer" : key;
                      const iconColor = eventColor(baseType, c);
                      const transferType = key.startsWith("transfer:") ? key.split(":")[1] : undefined;
                      return <EventIcon key={key} type={baseType} color={iconColor} transferType={transferType} />;
                    })}
                  </div>
                </div>
                {!isOpen && <div style={{ height: 1, background: c.border, marginTop: 10 }} />}
              </button>
              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 2, paddingBottom: 6 }}>
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

function SectionHeader({ label, c }: { label: string; c: C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "20px 14px 10px" }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: c.textTertiary, letterSpacing: 1.8 }}>{label}</span>
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
          {/* Phone bezel — titanium-style gradient shell */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              borderRadius: 44,
              background: previewTheme === "dark"
                ? "linear-gradient(160deg, #3a3a3e 0%, #1c1c1e 30%, #252528 60%, #1a1a1c 100%)"
                : "linear-gradient(160deg, #e8e8ed 0%, #d1d1d6 30%, #e0e0e5 60%, #c7c7cc 100%)",
              padding: 2,
              boxShadow: previewTheme === "dark"
                ? "0 2px 4px rgba(0,0,0,0.3), 0 12px 40px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08) inset"
                : "0 2px 4px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(255,255,255,0.6) inset",
            }}
          >
            {/* Screen area */}
            <div
              style={{
                borderRadius: 42,
                overflow: "hidden",
                height: "100%",
                position: "relative",
              }}
            >
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
                <div style={{ position: "relative", height: 280, overflow: "hidden" }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: c.teal }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.teal, textTransform: "uppercase", letterSpacing: 2 }}>Itinerary</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: -0.3, lineHeight: "26px", marginBottom: 10 }}>
                      {trip.name}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {paxNum > 0 && (
                        <HeroChip><Users size={9} color="rgba(255,255,255,0.85)" /> {paxNum} attendees</HeroChip>
                      )}
                      <HeroChip><Moon size={9} color="rgba(255,255,255,0.85)" /> {dateRange}</HeroChip>
                      {trip.destination && (
                        <HeroChip><MapPin size={9} color="rgba(255,255,255,0.85)" /> {trip.destination}</HeroChip>
                      )}
                    </div>
                  </div>
                </div>

                {/* Organizer */}
                {trip.organizer && <OrganizerSection org={trip.organizer} c={c} />}

                {/* Info */}
                {trip.info && trip.info.length > 0 && <InfoDocsSection info={trip.info} c={c} />}

                {/* Itinerary */}
                <ItinerarySection events={trip.events} c={c} />

                {/* Bottom spacer */}
                <div style={{ height: 24 }} />
              </div>
            </div>
          </div>

          {/* Side buttons — subtle, matches bezel */}
          <div className="absolute top-[18%] -left-[1px] w-[2px] h-[20px] rounded-r-sm" style={{ background: previewTheme === "dark" ? "#2a2a2c" : "#c7c7cc" }} />
          <div className="absolute top-[26%] -left-[1px] w-[2px] h-[38px] rounded-r-sm" style={{ background: previewTheme === "dark" ? "#2a2a2c" : "#c7c7cc" }} />
          <div className="absolute top-[34%] -left-[1px] w-[2px] h-[38px] rounded-r-sm" style={{ background: previewTheme === "dark" ? "#2a2a2c" : "#c7c7cc" }} />
          <div className="absolute top-[28%] -right-[1px] w-[2px] h-[56px] rounded-l-sm" style={{ background: previewTheme === "dark" ? "#2a2a2c" : "#c7c7cc" }} />
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
      padding: "4px 9px", fontSize: 10, fontWeight: 600,
      color: "rgba(255,255,255,0.85)", letterSpacing: 0.1,
      whiteSpace: "nowrap",
    }}>
      {children}
    </div>
  );
}
