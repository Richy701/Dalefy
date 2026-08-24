import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import {
  Airplane, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  MapPin, ArrowRight, Hash, FileText,
} from "phosphor-react-native";
import { type ThemeColors, T, R, S, F, statusTone } from "@/constants/theme";
import { ScalePress } from "@/components/ScalePress";
import { Pill } from "@/components/ui/Pill";
import type { TravelEvent, EventDocument } from "@/shared/types";

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

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("confirm") || s === "expected") return "Confirmed";
  if (s.includes("pend") || s.includes("hold")) return "Pending";
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("done") || s.includes("complet")) return "Done";
  return status;
}

// ── Flight Card ──────────────────────────────────────────────────────────────
function parseFlightCities(title: string): { from: string; to: string } {
  const toMatch = title.match(/(?:^[A-Z]{2}\d+\s*[—\-–]\s*)?(.+?)\s+to\s+(.+?)(?:\s*\(.*\))?$/i);
  if (toMatch) return { from: toMatch[1].trim(), to: toMatch[2].trim().replace(/\s*\(.*\)$/, "") };
  const arrowMatch = title.match(/^(.+?)\s*[→➜>]\s*(.+)$/);
  if (arrowMatch) return { from: arrowMatch[1].trim(), to: arrowMatch[2].trim() };
  return { from: title, to: "" };
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
    <ScalePress
      onPress={handlePress}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={hasCodes ? `Flight ${depCode} to ${arrCode}` : ev.title}
      style={[fs.card, { backgroundColor: C.card }]}
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
              <Text style={[fs.iata, fs.iataCity, { color: C.textPrimary }]} numberOfLines={1}>{depCity}</Text>
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
              <Text style={[fs.iata, fs.iataCity, { color: C.textPrimary, textAlign: "right" }]} numberOfLines={1}>{arrCity}</Text>
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
            <Hash size={10} color={C.textTertiary} weight="regular" />
            <Text style={[cs.confText, { color: C.textTertiary }]}>{ev.confNumber}</Text>
          </View>
        </View>
      )}
    </ScalePress>
  );
}

const fs = StyleSheet.create({
  card: { borderRadius: R.xl, padding: S.md },
  route: {
    flexDirection: "row", alignItems: "stretch",
    marginBottom: S.sm,
  },
  endpoint: { flex: 1 },
  cityName: { fontSize: T.base, fontWeight: T.regular, marginBottom: 2 },
  iata: { fontSize: 30, fontFamily: F.extrabold, letterSpacing: 0.5, lineHeight: 32, includeFontPadding: false },
  iataCity: { fontSize: T["2xl"] },
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
  chipLabel: { fontSize: T["2xs"], fontWeight: T.bold, letterSpacing: 0.8, marginBottom: 2 },
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
    <ScalePress
      onPress={handlePress}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={ev.title}
      style={[cs.card, { backgroundColor: C.card, overflow: "hidden" }]}
    >
      {ev.image && (
        <View>
          <CachedImage uri={ev.image} style={cs.imageBanner} />
          <LinearGradient
            colors={["rgba(9,9,11,0.05)", "rgba(9,9,11,0.45)"]}
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl }]}
          />
          <View style={cs.photoOverlay}>
            <Pill tone="glass" icon={<Bed size={11} color={C.teal} weight="regular" />} label={ev.isOvernight ? "OVERNIGHT" : "STAY"} />
            {!ev.isOvernight && ev.time && (
              <Pill tone="glass" label={ev.time} />
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
            <Text style={[cs.smallLabel, { color: C.tealText, flex: 1 }]}>{ev.isOvernight ? "Overnight" : "Stay"}</Text>
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
              <Hash size={10} color={C.textTertiary} weight="regular" />
              <Text style={[cs.confText, { color: C.textTertiary }]}>{ev.confNumber}</Text>
            </View>
          </View>
        )}
      </View>
    </ScalePress>
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
    <ScalePress
      onPress={handlePress}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={ev.title}
      style={[cs.card, { backgroundColor: C.card, overflow: "hidden" }]}
    >
      {ev.image && (
        <View>
          <CachedImage uri={ev.image} style={cs.imageBanner} />
          <LinearGradient
            colors={["rgba(9,9,11,0.05)", "rgba(9,9,11,0.45)"]}
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl }]}
          />
          <View style={cs.photoOverlay}>
            <Pill tone="glass" icon={<Icon size={11} color={C.teal} weight="regular" />} label={label.toUpperCase()} />
            {timeStr && (
              <Pill tone="glass" label={timeStr} />
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
            <Text style={[cs.smallLabel, { color: C.tealText, flex: 1 }]}>{label}</Text>
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
              const label = statusLabel(ev.status);
              const sp = statusTone(label, C);
              return (
                <Pill
                  tone="custom"
                  bg={sp.bg}
                  color={sp.text}
                  bordered
                  style={{ borderColor: sp.border }}
                  icon={<View style={[cs.statusDot, { backgroundColor: sp.color }]} />}
                  label={label}
                />
              );
            })()}
            {ev.price && (
              <Text style={[cs.priceText, { color: C.tealText }]}>{ev.price}</Text>
            )}
            <View style={{ flex: 1 }} />
            {ev.confNumber && (
              <View style={cs.confRow}>
                <Hash size={10} color={C.textTertiary} weight="regular" />
                <Text style={[cs.confText, { color: C.textTertiary }]}>{ev.confNumber}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScalePress>
  );
}

// ── Shared card styles ───────────────────────────────────────────────────────
const cs = StyleSheet.create({
  card: { borderRadius: R.xl },
  content: { padding: S.md },
  imageBanner: { width: "100%", height: 170, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },

  header: { flexDirection: "row", alignItems: "center", gap: S.xs, marginBottom: S.sm },
  iconBox: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  smallLabel: { fontSize: T.xs, fontWeight: T.semibold, letterSpacing: 0.5 },
  meta: { fontSize: T.xs, fontWeight: T.regular, marginTop: 1 },

  title: { fontSize: T.lg, fontWeight: T.bold, letterSpacing: -0.2, marginBottom: 4 },
  desc: { fontSize: T.sm, lineHeight: 20, marginBottom: S.xs },

  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginBottom: S.sm },
  locationText: { fontSize: T.sm, fontWeight: T.medium, flex: 1, lineHeight: 16 },

  // Hotel dates
  checkRow: {
    flexDirection: "row", alignItems: "center", gap: S.xs,
    borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: S.xs,
    marginBottom: S.xs,
  },
  checkLabel: { fontSize: T["2xs"], fontWeight: T.semibold, letterSpacing: 0.5, marginBottom: 1 },
  checkVal: { fontSize: T.sm, fontWeight: T.bold },

  roomType: { fontSize: T.xs, fontWeight: T.bold, marginTop: S.xs },
  notesFlat: { fontSize: T.sm, lineHeight: 20, marginTop: S.xs },

  footer: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap" },
  priceText: { fontSize: T.sm, fontWeight: T.bold },
  confRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  confText: { fontSize: T["2xs"], fontWeight: T.bold, letterSpacing: 0.8 },

  photoOverlay: {
    position: "absolute", top: S.sm, left: S.sm, right: S.sm,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
});

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
