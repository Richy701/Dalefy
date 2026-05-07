import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Car, MapPin, Users, Moon,
  CaretDown, FileText, Phone, Envelope, Hash, ArrowRight, Sun,
  DeviceMobileCamera, X,
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

function EventIcon({ type, color }: { type: string; color: string }) {
  const cls = "shrink-0";
  const s = 13;
  switch (type) {
    case "flight": return <AirplaneTilt size={s} color={color} className={cls} />;
    case "hotel": return <Bed size={s} color={color} className={cls} />;
    case "activity": return <Compass size={s} color={color} className={cls} />;
    case "dining": return <ForkKnife size={s} color={color} className={cls} />;
    case "transfer": return <Car size={s} color={color} className={cls} />;
    default: return <Compass size={s} color={color} className={cls} />;
  }
}

function FlightCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = c.flight;
  return (
    <div style={{ background: c.card, borderRadius: 20, overflow: "hidden" }}>
      <div style={{ padding: "28px 20px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 12, color: c.textTertiary, marginBottom: 2 }}>{ev.location?.split("→")[0]?.trim() || ev.depAirport || "Departure"}</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{ev.depAirport || "DEP"}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{ev.time}</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
            {ev.flightNum && <div style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, letterSpacing: 0.3, marginBottom: 8 }}>{ev.flightNum}</div>}
            <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 4 }}>
              <div style={{ flex: 1, height: 3, background: col + "55", borderRadius: 2 }} />
              <AirplaneTilt size={18} color={col} style={{ transform: "rotate(90deg)" }} />
              <div style={{ flex: 1, height: 3, background: col + "55", borderRadius: 2 }} />
            </div>
            {ev.duration && <div style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, marginTop: 8 }}>{ev.duration}</div>}
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ fontSize: 12, color: c.textTertiary, marginBottom: 2 }}>{ev.location?.split("→")[1]?.trim() || ev.arrAirport || "Arrival"}</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.textPrimary }}>{ev.arrAirport || "ARR"}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.textTertiary, marginTop: 4 }}>{ev.endTime || ""}</div>
          </div>
        </div>

        {(ev.terminal || ev.gate || ev.seatDetails) && (
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {ev.terminal && <Chip label="TERMINAL" value={ev.terminal} c={c} />}
            {ev.gate && <Chip label="GATE" value={ev.gate} c={c} />}
            {ev.seatDetails && <Chip label="SEAT" value={ev.seatDetails} c={c} />}
          </div>
        )}

        {ev.confNumber && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12 }}>
            <Hash size={10} color={c.textDim} />
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textDim, letterSpacing: 0.8 }}>{ev.confNumber}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, value, c }: { label: string; value: string; c: C }) {
  return (
    <div style={{ background: c.elevated, borderRadius: 12, padding: "8px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: c.textTertiary, letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary }}>{value}</div>
    </div>
  );
}

function HotelCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = c.hotel;
  return (
    <div style={{ background: c.card, borderRadius: 20, overflow: "hidden" }}>
      {ev.image && <img src={ev.image} alt="" style={{ width: "100%", height: 140, objectFit: "cover" }} />}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: c.elevated, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bed size={13} color={col} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: col }}>Stay</span>
          <span style={{ fontSize: 11, color: c.textTertiary, marginLeft: "auto" }}>{ev.time}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: c.textPrimary, letterSpacing: -0.2, marginBottom: 4 }}>{ev.title}</div>
        {ev.location && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 12 }}>
            <MapPin size={11} color={c.textTertiary} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: c.textTertiary, lineHeight: "16px" }}>{ev.location}</span>
          </div>
        )}
        {(ev.checkin || ev.checkout) && (
          <div style={{ display: "flex", alignItems: "center", background: c.elevated, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: c.textTertiary, letterSpacing: 0.5, marginBottom: 1 }}>CHECK-IN</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.textPrimary }}>{ev.checkin ? format(parseISO(ev.checkin), "MMM d") : "—"}</div>
            </div>
            <ArrowRight size={14} color={col} />
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: c.textTertiary, letterSpacing: 0.5, marginBottom: 1 }}>CHECK-OUT</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.textPrimary }}>{ev.checkout ? format(parseISO(ev.checkout), "MMM d") : "—"}</div>
            </div>
          </div>
        )}
        {ev.roomType && <div style={{ fontSize: 11, fontWeight: 700, color: col, marginTop: 8 }}>{ev.roomType}</div>}
      </div>
    </div>
  );
}

function GenericCard({ ev, c }: { ev: TravelEvent; c: C }) {
  const col = eventColor(ev.type, c);
  const label = ev.type === "dining" ? "Dining" : ev.type === "transfer" ? "Transfer" : "Activity";
  return (
    <div style={{ background: c.card, borderRadius: 20, overflow: "hidden" }}>
      {ev.image && <img src={ev.image} alt="" style={{ width: "100%", height: 140, objectFit: "cover" }} />}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: c.elevated, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EventIcon type={ev.type} color={col} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{label}</span>
          <span style={{ fontSize: 11, color: c.textTertiary, marginLeft: "auto" }}>
            {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}
          </span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: c.textPrimary, letterSpacing: -0.2, marginBottom: 4 }}>{ev.title}</div>
        {ev.description && <div style={{ fontSize: 12, color: c.textTertiary, lineHeight: "20px", marginBottom: 8 }}>{ev.description}</div>}
        {ev.location && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 8 }}>
            <MapPin size={11} color={c.textTertiary} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: c.textTertiary }}>{ev.location}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {ev.status && <span style={{ fontSize: 11, fontWeight: 700, color: c.textDim, letterSpacing: 0.6, textTransform: "uppercase" }}>{ev.status}</span>}
          {ev.price && <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{ev.price}</span>}
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
    <div style={{ margin: "16px 16px 0", background: c.card, borderRadius: 20, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {org.avatar ? (
          <img src={org.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 100, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 100, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: c.teal }}>{initials}</span>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.textTertiary, letterSpacing: 1.5, textTransform: "uppercase" }}>YOUR ORGANIZER</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: c.textPrimary }}>{org.name}</div>
          {org.role && <div style={{ fontSize: 12, fontWeight: 500, color: c.textTertiary, marginTop: 1 }}>{org.role}</div>}
        </div>
      </div>
      {(org.phone || org.email) && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
          {org.phone && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: c.tealDim, borderRadius: 12, padding: "10px 0" }}>
              <Phone size={13} color={c.teal} />
              <span style={{ fontSize: 11, fontWeight: 700, color: c.teal, letterSpacing: 1, textTransform: "uppercase" }}>Call</span>
            </div>
          )}
          {org.email && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: c.tealDim, borderRadius: 12, padding: "10px 0" }}>
              <Envelope size={13} color={c.teal} />
              <span style={{ fontSize: 11, fontWeight: 700, color: c.teal, letterSpacing: 1, textTransform: "uppercase" }}>Email</span>
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
    <div style={{ margin: "12px 16px 0", padding: "12px", background: c.card, borderRadius: 20, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: c.tealDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={15} color={c.teal} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: c.textSecondary, letterSpacing: 1, flex: 1 }}>INFORMATION & DOCUMENTS</span>
      <div style={{ background: c.tealDim, borderRadius: 10, padding: "3px 7px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.teal, letterSpacing: 0.5 }}>{visibleCount}</span>
      </div>
    </div>
  );
}

function ItinerarySection({ events, c }: { events: TravelEvent[]; c: C }) {
  const groups = useMemo(() => groupEventsByDay(events), [events]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (groups.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ paddingBottom: 20 }}>
      <SectionHeader icon={<Compass size={13} color={c.teal} />} label="ITINERARY" c={c} />
      <div style={{ padding: "0 16px" }}>
        {groups.map(([date, evs], dayIdx) => {
          const isToday = date === today;
          const isCollapsed = collapsed.has(date);
          let dateLabel = "";
          let weekday = "";
          try {
            const d = parseISO(date);
            weekday = format(d, "EEEE");
            dateLabel = format(d, "MMMM d");
          } catch { dateLabel = date; }

          return (
            <div key={date}>
              <button
                type="button"
                onClick={() => setCollapsed(prev => { const n = new Set(prev); if (n.has(date)) n.delete(date); else n.add(date); return n; })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", width: "100%", cursor: "pointer", background: "none", border: "none", textAlign: "left" }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 12,
                  background: isToday ? c.teal : c.elevated,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: isToday ? "#fff" : c.textPrimary }}>{dayIdx + 1}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: isToday ? c.teal : c.textPrimary }}>{weekday}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: c.textTertiary, marginTop: 1 }}>
                    {dateLabel} · {evs.length} event{evs.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <CaretDown size={16} color={c.textTertiary} style={{ transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, paddingBottom: 8 }}>
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

function SectionHeader({ icon, label, c }: { icon: React.ReactNode; label: string; c: C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "28px 16px 12px" }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: 700, color: c.textTertiary, letterSpacing: 1.8 }}>{label}</span>
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
          style={{ maxWidth: 320, aspectRatio: "390 / 844" }}
        >
          {/* Phone bezel */}
          <div
            className="absolute inset-0 rounded-[40px] shadow-2xl overflow-hidden"
            style={{ border: `3px solid ${previewTheme === "dark" ? "#2a2a2a" : "#d4d4d8"}` }}
          >
            {/* Status bar */}
            <div style={{ background: c.bg, padding: "8px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", height: 44, position: "relative", zIndex: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>9:41</span>
              {/* Dynamic Island */}
              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 8, width: 120, height: 28, borderRadius: 20, background: "#000" }} />
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div style={{ width: 16, height: 10, borderRadius: 2, border: `1.5px solid ${c.textTertiary}`, position: "relative" }}>
                  <div style={{ position: "absolute", inset: 2, borderRadius: 1, background: c.textPrimary }} />
                </div>
              </div>
            </div>

            {/* Scrollable mobile screen */}
            <div
              style={{ background: c.bg, height: "calc(100% - 44px)", overflowY: "auto", overflowX: "hidden" }}
              className="scrollbar-hide"
            >
              {/* Hero */}
              <div style={{ position: "relative", height: 320, overflow: "hidden" }}>
                <img
                  src={trip.image}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to bottom, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.91) 100%)",
                }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c.teal }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.teal, textTransform: "uppercase", letterSpacing: 2 }}>Itinerary</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: -0.3, lineHeight: "30px", marginBottom: 12 }}>
                    {trip.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {paxNum > 0 && (
                      <HeroChip><Users size={10} color="rgba(255,255,255,0.85)" /> {paxNum}</HeroChip>
                    )}
                    <HeroChip><Moon size={10} color="rgba(255,255,255,0.85)" /> {dateRange}</HeroChip>
                    {trip.destination && (
                      <HeroChip><MapPin size={10} color="rgba(255,255,255,0.85)" /> {trip.destination}</HeroChip>
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
              <div style={{ height: 32 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: "rgba(255,255,255,0.10)", borderRadius: 100,
      padding: "5px 10px", fontSize: 11, fontWeight: 600,
      color: "rgba(255,255,255,0.85)", letterSpacing: 0.1,
      whiteSpace: "nowrap",
    }}>
      {children}
    </div>
  );
}
