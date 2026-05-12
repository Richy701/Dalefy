import { View, Text, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import {
  Airplane, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  MapPin, ArrowRight, Hash, FileText,
} from "phosphor-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TravelEvent, EventDocument } from "@/shared/types";

function formatDate(d: string): string {
  // Handle both "2026-07-15" and "2026-07-15T10:00:00" formats
  const raw = d.includes("T") ? d : d + "T12:00:00";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return d; // fallback to raw string
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function nextDay(d: string): string {
  const date = new Date(d + "T12:00:00");
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

function formatTimeTo24h(t: string): string {
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
  LHR: "London", LGW: "London", STN: "London", LTN: "London", LCY: "London",
  CDG: "Paris", ORY: "Paris", JFK: "New York", EWR: "New York", LGA: "New York",
  LAX: "Los Angeles", SFO: "San Francisco", ORD: "Chicago", MDW: "Chicago",
  ATL: "Atlanta", MIA: "Miami", FLL: "Fort Lauderdale", DFW: "Dallas",
  DEN: "Denver", SEA: "Seattle", BOS: "Boston", IAD: "Washington", DCA: "Washington",
  SIN: "Singapore", HND: "Tokyo", NRT: "Tokyo", ICN: "Seoul", PEK: "Beijing",
  PVG: "Shanghai", HKG: "Hong Kong", BKK: "Bangkok", KUL: "Kuala Lumpur",
  DEL: "New Delhi", BOM: "Mumbai", DXB: "Dubai", AUH: "Abu Dhabi", DOH: "Doha",
  IST: "Istanbul", CAI: "Cairo", JNB: "Johannesburg", CPT: "Cape Town",
  SYD: "Sydney", MEL: "Melbourne", AKL: "Auckland", FCO: "Rome", MXP: "Milan",
  AMS: "Amsterdam", FRA: "Frankfurt", MUC: "Munich", MAD: "Madrid", BCN: "Barcelona",
  LIS: "Lisbon", ZRH: "Zurich", VIE: "Vienna", CPH: "Copenhagen", OSL: "Oslo",
  ARN: "Stockholm", HEL: "Helsinki", DUB: "Dublin", EDI: "Edinburgh",
  MAN: "Manchester", BHX: "Birmingham", GLA: "Glasgow",
  CUN: "Cancun", GRU: "São Paulo", EZE: "Buenos Aires", BOG: "Bogotá",
  MEX: "Mexico City", LIM: "Lima", SCL: "Santiago", YYZ: "Toronto", YVR: "Vancouver",
  ACC: "Accra", LOS: "Lagos", NBO: "Nairobi", ADD: "Addis Ababa",
};

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity",
  dining: "Dining", transfer: "Transfer",
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
};

function cleanTitle(title: string, type: string, transferType?: string): string {
  const labels = [TYPE_LABELS[transferType || ""] || "", TYPE_LABELS[type] || ""];
  for (const l of labels) {
    if (!l) continue;
    const re = new RegExp(`^${l}\\s*[-–·:]\\s*`, "i");
    title = title.replace(re, "");
  }
  return title;
}

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

function statusPill(status: string, C: ThemeColors) {
  const s = status.toLowerCase();
  let color: string, bg: string, border: string, label: string;
  if (s.includes("confirm") || s === "expected") {
    color = C.teal; bg = C.tealDim; border = C.tealMid; label = "Confirmed";
  } else if (s.includes("pend") || s.includes("hold")) {
    color = C.amber; bg = C.amberDim; border = "rgba(245,158,11,0.25)"; label = "Pending";
  } else if (s.includes("cancel")) {
    color = C.red; bg = C.redDim; border = "rgba(239,68,68,0.25)"; label = "Cancelled";
  } else if (s.includes("done") || s.includes("complet")) {
    color = C.textDim; bg = C.elevated; border = C.border; label = "Done";
  } else {
    color = C.textTertiary; bg = C.elevated; border = C.border; label = status;
  }
  return { color, bg, border, label };
}

// ── Flight Card ──────────────────────────────────────────────────────────────
function parseFlightCities(title: string): { from: string; to: string } {
  const toMatch = title.match(/(?:^[A-Z]{2}\d+\s*[—\-–]\s*)?(.+?)\s+to\s+(.+?)(?:\s*\(.*\))?$/i);
  if (toMatch) return { from: toMatch[1].trim(), to: toMatch[2].trim().replace(/\s*\(.*\)$/, "") };
  const arrowMatch = title.match(/^(.+?)\s*[→➜>]\s*(.+)$/);
  if (arrowMatch) return { from: arrowMatch[1].trim(), to: arrowMatch[2].trim() };
  return { from: title, to: "" };
}

function flightStatusInfo(status: string | undefined, duration: string | undefined, C: ThemeColors) {
  if (!status) return { label: duration ?? null, color: C.textTertiary, isStatus: false };
  const s = status.toLowerCase();
  if (s.includes("cancel")) return { label: "CANCELLED", color: "#ef4444", isStatus: true };
  if (s.includes("delay")) return { label: "DELAYED", color: "#f59e0b", isStatus: true };
  if (s.includes("arriv") || s.includes("landed")) return { label: "ARRIVED", color: "#22c55e", isStatus: true };
  if (s.includes("board")) return { label: "BOARDING", color: C.flight, isStatus: true };
  if (s.includes("in flight") || s.includes("airborne") || s.includes("en route")) return { label: "IN FLIGHT", color: C.flight, isStatus: true };
  return { label: duration ?? null, color: C.textTertiary, isStatus: false };
}

function FlightCard({ ev, C, tripId, onPress }: { ev: TravelEvent; C: ThemeColors; tripId?: string; onPress?: (ev: TravelEvent) => void }) {
  const router = useRouter();
  let cities = parseFlightCities(ev.title ?? "");
  if (!cities.to && ev.location) cities = parseFlightCities(ev.location);

  let depCode = ev.depAirport?.toUpperCase() || "";
  let arrCode = ev.arrAirport?.toUpperCase() || "";
  const tryExtractCodes = (text: string) => {
    const m = text.match(/^([A-Z]{3})\s*(?:to|→|➜|>|–|—|-)\s*([A-Z]{3})$/i);
    if (m) {
      if (!depCode) depCode = m[1].toUpperCase();
      if (!arrCode) arrCode = m[2].toUpperCase();
    }
  };
  if (!depCode || !arrCode) {
    if (ev.location) tryExtractCodes(ev.location);
    if (!depCode || !arrCode) {
      const titleCodes = (ev.title ?? "").match(/\b([A-Z]{3})\s*(?:to|→|➜|>|–|—|-)\s*([A-Z]{3})\b/i);
      if (titleCodes) {
        if (!depCode) depCode = titleCodes[1].toUpperCase();
        if (!arrCode) arrCode = titleCodes[2].toUpperCase();
      }
    }
    if (!depCode && /^[A-Z]{3}$/i.test(cities.from)) depCode = cities.from.toUpperCase();
    if (!arrCode && /^[A-Z]{3}$/i.test(cities.to)) arrCode = cities.to.toUpperCase();
  }
  const hasCodes = depCode.length >= 3 && arrCode.length >= 3;

  const depCity = (depCode && IATA_CITY[depCode]) || cities.from || ev.location || "";
  const arrCity = (arrCode && IATA_CITY[arrCode]) || cities.to || "";

  const depTime = ev.time ? formatTimeTo24h(ev.time) : "";
  const arrTime = ev.endTime ? formatTimeTo24h(ev.endTime) : "";

  const badge = flightStatusInfo(ev.status, undefined, C);

  const chips = [
    ev.gate && { label: "GATE", value: ev.gate },
    ev.seatDetails && { label: "SEAT", value: ev.seatDetails },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const handlePress = () => {
    Haptics.selectionAsync();
    if (onPress) return onPress(ev);
    if (tripId) router.push(`/trip/event?tripId=${tripId}&eventId=${ev.id}`);
  };

  const flightLabel = ev.flightNum || (ev.airline ? `${ev.airline}` : "");

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [fs.card, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
    >
      {/* Route — Tripsy-style layout */}
      {arrCity ? (
        <View style={fs.route}>
          {/* Departure */}
          <View style={fs.endpoint}>
            {hasCodes ? (
              <>
                <Text style={[fs.cityName, { color: C.textSecondary }]} numberOfLines={1}>{depCity}</Text>
                <Text style={[fs.iata, { color: C.textPrimary }]}>{depCode.slice(0, 3)}</Text>
              </>
            ) : (
              <Text style={[fs.iata, { color: C.textPrimary, fontSize: 22 }]} numberOfLines={1}>{depCity}</Text>
            )}
            {depTime ? <Text style={[fs.time, { color: C.textTertiary }]}>{depTime}</Text> : null}
          </View>

          {/* Center connector */}
          <View style={fs.connector}>
            {flightLabel ? <Text style={[fs.flightNum, { color: C.textTertiary }]}>{flightLabel}</Text> : null}
            <View style={fs.lineRow}>
              <View style={[fs.line, { backgroundColor: C.flight + "55" }]} />
              <Airplane size={18} color={C.flight} weight="fill" style={{ transform: [{ rotate: "90deg" }] }} />
              <View style={[fs.line, { backgroundColor: C.flight + "55" }]} />
            </View>
            {ev.duration ? <Text style={[fs.durationText, { color: C.textTertiary }]}>{ev.duration}</Text> : null}
          </View>

          {/* Arrival */}
          <View style={[fs.endpoint, { alignItems: "flex-end" }]}>
            {hasCodes ? (
              <>
                <Text style={[fs.cityName, { color: C.textSecondary, textAlign: "right" }]} numberOfLines={1}>{arrCity}</Text>
                <Text style={[fs.iata, { color: C.textPrimary }]}>{arrCode.slice(0, 3)}</Text>
              </>
            ) : (
              <Text style={[fs.iata, { color: C.textPrimary, fontSize: 22, textAlign: "right" }]} numberOfLines={1}>{arrCity}</Text>
            )}
            {arrTime ? <Text style={[fs.time, { color: C.textTertiary }]}>{arrTime}</Text> : null}
          </View>
        </View>
      ) : (
        <Text style={[cs.title, { color: C.textPrimary }]}>{ev.title}</Text>
      )}

      {/* Detail chips */}
      {chips.length > 0 && (
        <View style={fs.chips}>
          {chips.map(c => (
            <View key={c.label} style={[fs.chip, { backgroundColor: C.elevated }]}>
              <Text style={[fs.chipLabel, { color: C.textTertiary }]}>{c.label}</Text>
              <Text style={[fs.chipValue, { color: C.textPrimary }]}>{c.value}</Text>
            </View>
          ))}
        </View>
      )}

      {ev.notes && (
        <Text style={[cs.notesFlat, { color: C.textTertiary }]}>{ev.notes}</Text>
      )}

      {ev.confNumber && (
        <View style={[cs.footer, { marginTop: chips.length > 0 ? S.xs : S.sm }]}>
          <View style={{ flex: 1 }} />
          <View style={cs.confRow}>
            <Hash size={10} color={C.textDim} weight="regular" />
            <Text style={[cs.confText, { color: C.textDim }]}>{ev.confNumber}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const fs = StyleSheet.create({
  card: { borderRadius: R.xl, paddingHorizontal: S.lg, paddingVertical: S.xl },
  route: {
    flexDirection: "row", alignItems: "stretch",
    marginBottom: S.sm,
  },
  endpoint: { flex: 1 },
  cityName: { fontSize: T.base, fontWeight: T.regular, marginBottom: 2 },
  iata: { fontSize: 30, fontWeight: T.extrabold, letterSpacing: -0.5 },
  time: { fontSize: T.base, fontWeight: T.medium, marginTop: 4 },
  connector: {
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  flightNum: { fontSize: T.sm, fontWeight: T.medium, letterSpacing: 0.3 },
  lineRow: {
    flexDirection: "row", alignItems: "center",
    width: "100%", gap: 4,
  },
  line: { flex: 1, height: 3, borderRadius: 2 },
  durationText: { fontSize: T.sm, fontWeight: T.medium },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.xs, marginBottom: S.xs },
  chip: {
    paddingHorizontal: S.sm, paddingVertical: S.xs,
    borderRadius: R.md,
  },
  chipLabel: { fontSize: 9, fontWeight: T.bold, letterSpacing: 0.8, marginBottom: 2 },
  chipValue: { fontSize: T.base, fontWeight: T.bold },
});

// ── Hotel Card ───────────────────────────────────────────────────────────────
function HotelCard({ ev, C, tripId, onPress }: { ev: TravelEvent; C: ThemeColors; tripId?: string; onPress?: (ev: TravelEvent) => void }) {
  const router = useRouter();
  const handlePress = () => {
    Haptics.selectionAsync();
    if (onPress) return onPress(ev);
    if (tripId) router.push(`/trip/event?tripId=${tripId}&eventId=${ev.id}`);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [cs.card, { backgroundColor: C.card, overflow: "hidden", opacity: pressed ? 0.85 : 1 }]}
    >
      {ev.image && (
        <View>
          <CachedImage uri={ev.image} style={cs.imageBanner} />
          <LinearGradient
            colors={["rgba(10,10,11,0.05)", "rgba(10,10,11,0.45)"]}
            style={[StyleSheet.absoluteFillObject, { borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl }]}
          />
          <View style={cs.photoOverlay}>
            <View style={cs.glassPill}>
              <Bed size={11} color={C.teal} weight="regular" />
              <Text style={[cs.glassPillText, { color: C.teal }]}>{ev.isOvernight ? "OVERNIGHT" : "STAY"}</Text>
            </View>
            {!ev.isOvernight && ev.time && (
              <View style={cs.glassPill}>
                <Text style={[cs.glassPillText, { color: "#f4f4f5" }]}>{ev.time}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={cs.content}>
        {!ev.image && (
          <View style={cs.header}>
            <View style={[cs.iconBox, { backgroundColor: C.tealDim }]}>
              <Bed size={12} color={C.teal} weight="regular" />
            </View>
            <Text style={[cs.smallLabel, { color: C.teal, flex: 1 }]}>{ev.isOvernight ? "Overnight" : "Stay"}</Text>
            {!ev.isOvernight && ev.time && <Text style={[cs.meta, { color: C.textTertiary }]}>{ev.time}</Text>}
          </View>
        )}

        <Text style={[cs.title, { color: C.textPrimary }]} numberOfLines={2}>{cleanTitle(ev.title, ev.type)}</Text>

        {ev.location && (
          <View style={cs.locationRow}>
            <MapPin size={11} color={C.textTertiary} weight="light" style={{ marginTop: 2 }} />
            <Text style={[cs.locationText, { color: C.textTertiary }]}>{ev.location}</Text>
          </View>
        )}

        {!ev.isOvernight && (ev.checkin || ev.checkout) && (ev.time || ev.endTime) && (
          <View style={[cs.checkRow, { backgroundColor: C.elevated }]}>
            {ev.time && (
              <View style={{ flex: 1 }}>
                <Text style={[cs.checkLabel, { color: C.textTertiary }]}>Check in</Text>
                <Text style={[cs.checkVal, { color: C.textPrimary }]}>{formatTimeTo24h(ev.time)}</Text>
              </View>
            )}
            {ev.time && ev.endTime && (
              <ArrowRight size={14} color={C.hotel} weight="regular" />
            )}
            {ev.endTime && (
              <View style={{ flex: 1, alignItems: ev.time ? "flex-end" : "flex-start" }}>
                <Text style={[cs.checkLabel, { color: C.textTertiary }]}>Check out</Text>
                <Text style={[cs.checkVal, { color: C.textPrimary }]}>{formatTimeTo24h(ev.endTime)}</Text>
              </View>
            )}
          </View>
        )}

        {ev.roomType && (
          <Text style={[cs.roomType, { color: C.hotel }]}>{ev.roomType}</Text>
        )}

        {ev.notes && (
          <Text style={[cs.notesFlat, { color: C.textTertiary }]}>{ev.notes}</Text>
        )}

        {ev.confNumber && (
          <View style={[cs.footer, { marginTop: S.sm }]}>
            <View style={{ flex: 1 }} />
            <View style={cs.confRow}>
              <Hash size={10} color={C.textDim} weight="regular" />
              <Text style={[cs.confText, { color: C.textDim }]}>{ev.confNumber}</Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Activity / Dining Card ───────────────────────────────────────────────────
function ActivityCard({ ev, C, tripId, onPress }: { ev: TravelEvent; C: ThemeColors; tripId?: string; onPress?: (ev: TravelEvent) => void }) {
  const isTransfer = ev.type === "transfer";
  const transferIcons: Record<string, typeof Car> = { car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor, other: Compass };
  const transferLabels: Record<string, string> = { car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise", other: "Transfer" };
  const Icon = isTransfer ? (transferIcons[ev.transferType || "car"] || Car) : ev.type === "dining" ? ForkKnife : Compass;
  const label = isTransfer ? (transferLabels[ev.transferType || "car"] || "Transfer") : ev.type === "dining" ? "Dining" : "Activity";

  const router = useRouter();
  const handlePress = () => {
    Haptics.selectionAsync();
    if (onPress) return onPress(ev);
    if (tripId) router.push(`/trip/event?tripId=${tripId}&eventId=${ev.id}`);
  };

  const timeStr = ev.time ? (ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time) : null;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [cs.card, { backgroundColor: C.card, overflow: "hidden", opacity: pressed ? 0.85 : 1 }]}
    >
      {ev.image && (
        <View>
          <CachedImage uri={ev.image} style={cs.imageBanner} />
          <LinearGradient
            colors={["rgba(10,10,11,0.05)", "rgba(10,10,11,0.45)"]}
            style={[StyleSheet.absoluteFillObject, { borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl }]}
          />
          <View style={cs.photoOverlay}>
            <View style={cs.glassPill}>
              <Icon size={11} color={C.teal} weight="regular" />
              <Text style={[cs.glassPillText, { color: C.teal }]}>{label.toUpperCase()}</Text>
            </View>
            {timeStr && (
              <View style={cs.glassPill}>
                <Text style={[cs.glassPillText, { color: "#f4f4f5" }]}>{timeStr}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={cs.content}>
        {!ev.image && (
          <View style={cs.header}>
            <View style={[cs.iconBox, { backgroundColor: C.tealDim }]}>
              <Icon size={12} color={C.teal} weight="regular" />
            </View>
            <Text style={[cs.smallLabel, { color: C.teal, flex: 1 }]}>{label}</Text>
            {timeStr && (
              <Text style={[cs.meta, { color: C.textTertiary }]}>{timeStr}</Text>
            )}
          </View>
        )}

        <Text style={[cs.title, { color: C.textPrimary }]} numberOfLines={2}>{cleanTitle(ev.title, ev.type, ev.transferType)}</Text>

        {ev.description && (
          <Text style={[cs.desc, { color: C.textTertiary }]} numberOfLines={2}>{ev.description}</Text>
        )}

        {ev.location && (
          <View style={cs.locationRow}>
            <MapPin size={11} color={C.textTertiary} weight="light" style={{ marginTop: 2 }} />
            <Text style={[cs.locationText, { color: C.textTertiary }]}>{ev.location}</Text>
          </View>
        )}

        {ev.notes && (
          <Text style={[cs.notesFlat, { color: C.textTertiary }]} numberOfLines={2}>{ev.notes}</Text>
        )}

        {/* Footer */}
        {(ev.status || ev.price || ev.confNumber) && (
          <View style={[cs.footer, { marginTop: S.sm }]}>
            {ev.status && (() => {
              const sp = statusPill(ev.status, C);
              return (
                <View style={[cs.statusPill, { backgroundColor: sp.bg, borderColor: sp.border }]}>
                  <View style={[cs.statusDot, { backgroundColor: sp.color }]} />
                  <Text style={[cs.statusPillText, { color: sp.color }]}>{sp.label}</Text>
                </View>
              );
            })()}
            {ev.price && (
              <Text style={[cs.priceText, { color: C.teal }]}>{ev.price}</Text>
            )}
            <View style={{ flex: 1 }} />
            {ev.confNumber && (
              <View style={cs.confRow}>
                <Hash size={10} color={C.textDim} weight="regular" />
                <Text style={[cs.confText, { color: C.textDim }]}>{ev.confNumber}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Shared card styles ───────────────────────────────────────────────────────
const cs = StyleSheet.create({
  card: { borderRadius: R.xl, padding: S.md },
  content: { padding: S.md },
  imageBanner: { width: "100%", height: 170, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },

  header: { flexDirection: "row", alignItems: "center", gap: S.xs, marginBottom: S.sm },
  iconBox: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  smallLabel: { fontSize: T.xs, fontWeight: T.semibold, letterSpacing: 0.5 },
  meta: { fontSize: T.xs, fontWeight: T.regular, marginTop: 1 },
  timeBadge: {
    fontSize: T.xs, fontWeight: T.bold,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full,
    overflow: "hidden",
  },

  title: { fontSize: T.lg, fontWeight: T.bold, letterSpacing: -0.2, marginBottom: 4 },
  desc: { fontSize: T.sm, lineHeight: 20, marginBottom: S.xs },

  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginBottom: S.sm },
  locationText: { fontSize: T.sm, fontWeight: T.medium, flex: 1, lineHeight: 16 },

  // Flight route
  routeSection: {
    flexDirection: "row", alignItems: "center",
    borderRadius: R.lg, padding: S.md, marginBottom: S.sm,
  },
  airport: { alignItems: "center", width: 80 },
  airportCode: { fontSize: T["3xl"], fontWeight: T.bold, letterSpacing: -0.5, lineHeight: 32 },
  airportLabel: { fontSize: T.xs, fontWeight: T.medium, marginTop: 3, maxWidth: 80 },
  routeLine: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  dash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 0.5 },

  metaInline: { flexDirection: "row", flexWrap: "wrap", marginTop: S.xs },
  metaInlineText: { fontSize: T.sm, fontWeight: T.medium },

  // Hotel dates
  checkRow: {
    flexDirection: "row", alignItems: "center", gap: S.xs,
    borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: S.xs,
    marginBottom: S.xs,
  },
  checkLabel: { fontSize: 9, fontWeight: T.semibold, letterSpacing: 0.5, marginBottom: 1 },
  checkVal: { fontSize: T.sm, fontWeight: T.bold },
  checkDate: { fontSize: T.xs, marginTop: 2 },

  roomType: { fontSize: T.xs, fontWeight: T.bold, marginTop: S.xs },
  notesFlat: { fontSize: T.sm, lineHeight: 20, marginTop: S.xs },

  footer: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap" },
  priceText: { fontSize: T.sm, fontWeight: T.bold },
  confRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  confText: { fontSize: 10, fontWeight: T.bold, letterSpacing: 0.8 },

  photoOverlay: {
    position: "absolute", top: S.sm, left: S.sm, right: S.sm,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  glassPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: R.full,
    backgroundColor: "rgba(9,9,11,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  glassPillText: {
    fontSize: 9.5, fontWeight: T.semibold, letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: R.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 10.5, fontWeight: T.medium },
});

// ── Compat exports ───────────────────────────────────────────────────────────
export function ConfRow({ confNumber, C }: { confNumber: string; C: ThemeColors }) {
  return null; // now rendered inside cards
}

export function DocsRow({ documents, C }: { documents: EventDocument[]; C: ThemeColors }) {
  if (!documents.length) return null;

  const handlePress = async (doc: EventDocument) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await Clipboard.setStringAsync(doc.url); } catch {}
    const sizeKb = Math.max(1, Math.round(doc.size / 1024));
    const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    Alert.alert(doc.name, `${doc.mimeType || "file"} · ${sizeText}\n\nLink copied to clipboard.`, [{ text: "OK" }]);
  };

  return (
    <View style={{ marginTop: 6, gap: 4 }}>
      {documents.map(doc => {
        const sizeKb = Math.max(1, Math.round(doc.size / 1024));
        const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        return (
          <Pressable
            key={doc.id}
            onPress={() => handlePress(doc)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 8,
              paddingHorizontal: S.sm, paddingVertical: 8,
              backgroundColor: C.elevated, borderRadius: R.md,
              opacity: pressed ? 0.7 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${doc.name}`}
          >
            <FileText size={12} color={C.teal} weight="regular" />
            <Text style={{ fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary, flex: 1 }} numberOfLines={1}>{doc.name}</Text>
            <Text style={{ fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary }}>{sizeText}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EventCard({ ev, C, tripId, isLeader = false, onPress }: { ev: TravelEvent; C: ThemeColors; tripId?: string; isLeader?: boolean; onPress?: (ev: TravelEvent) => void }) {
  // Strip sensitive fields for standard travelers
  const event = isLeader ? ev : { ...ev, notes: undefined, supplier: undefined, confNumber: undefined, documents: undefined };
  if (event.type === "flight") return <FlightCard ev={event} C={C} tripId={tripId} onPress={onPress} />;
  if (event.type === "hotel")  return <HotelCard  ev={event} C={C} tripId={tripId} onPress={onPress} />;
  return <ActivityCard ev={event} C={C} tripId={tripId} onPress={onPress} />;
}
