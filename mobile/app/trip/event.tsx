import {
  View, Text, ScrollView, Pressable, Linking,
  StyleSheet, Platform, Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { FlightRouteMap } from "@/components/FlightRouteMap";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  MapPin, Clock, Hash, FileText,
  Calendar, Users, ArrowRight, Copy, CaretRight, CaretLeft,
  AirplaneTakeoff, AirplaneLanding, Timer, Armchair, Door,
  Ruler,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { parseEventDateTime } from "@/shared/dates";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";
import { T, R, S, F, shadow, statusTone, type ThemeColors } from "@/constants/theme";
import { LOCATION_COORDS, toLngLat, isSamePoint } from "@/shared/coordinates";
import { useMemo, useCallback, useState, useEffect } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { TravelEvent } from "@/shared/types";
import { openDocument } from "@/services/openDocument";
import { StatusIndicator } from "@/components/StatusIndicator";
import { EventLocationMap } from "@/components/EventLocationMap";
import { geocode } from "@/services/geocode";
import { OrganizerCard } from "@/components/OrganizerCard";
import { Pill } from "@/components/ui/Pill";
import { MicroLabel } from "@/components/ui/MicroLabel";

// Airline logo plate stays white in both themes so carrier marks render as designed
const LOGO_PLATE = "#fff";
const LOGO_INK = "#111";

// ── Helpers ─────────────────────────────────────────────────────────────────

function openInMaps(location: string, coords?: [number, number]) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (coords) {
    const [lng, lat] = coords;
    const label = encodeURIComponent(location);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${label}`);
  } else {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`);
  }
}

function formatShortDate(d: string): string {
  const raw = d.includes("T") ? d : d + "T12:00:00";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
  LHR: "London", LGW: "London", STN: "London", MAN: "Manchester",
  CDG: "Paris", ORY: "Paris", AMS: "Amsterdam", FRA: "Frankfurt",
  MUC: "Munich", FCO: "Rome", MXP: "Milan", NAP: "Naples",
  MAD: "Madrid", BCN: "Barcelona", LIS: "Lisbon", ZRH: "Zurich",
  GVA: "Geneva", VIE: "Vienna", PRG: "Prague", WAW: "Warsaw",
  BRU: "Brussels", CPH: "Copenhagen", OSL: "Oslo", ARN: "Stockholm",
  HEL: "Helsinki", DUB: "Dublin", EDI: "Edinburgh", ATH: "Athens",
  IST: "Istanbul", SAW: "Istanbul", AYT: "Antalya", KEF: "Reykjavik",
  JFK: "New York", EWR: "New York", LGA: "New York",
  LAX: "Los Angeles", SFO: "San Francisco", OAK: "Oakland",
  SJC: "San Jose", ORD: "Chicago", ATL: "Atlanta", MIA: "Miami",
  FLL: "Fort Lauderdale", DFW: "Dallas", IAH: "Houston",
  DEN: "Denver", SEA: "Seattle", BOS: "Boston",
  IAD: "Washington", DCA: "Washington", BWI: "Baltimore",
  PHL: "Philadelphia", CLT: "Charlotte", MSP: "Minneapolis",
  DTW: "Detroit", PHX: "Phoenix", SAN: "San Diego",
  TPA: "Tampa", MCO: "Orlando", SLC: "Salt Lake City",
  PDX: "Portland", HNL: "Honolulu", AUS: "Austin",
  RDU: "Raleigh", CHS: "Charleston", BNA: "Nashville",
  STL: "St Louis", PIT: "Pittsburgh", IND: "Indianapolis",
  MCI: "Kansas City",
  YYZ: "Toronto", YVR: "Vancouver", YUL: "Montreal",
  YOW: "Ottawa", YYC: "Calgary",
  SIN: "Singapore", HND: "Tokyo", NRT: "Tokyo", KIX: "Osaka",
  CTS: "Sapporo", NGO: "Nagoya", FUK: "Fukuoka",
  ICN: "Seoul", GMP: "Seoul", PUS: "Busan",
  HKG: "Hong Kong", BKK: "Bangkok", TPE: "Taipei",
  PEK: "Beijing", PVG: "Shanghai", KUL: "Kuala Lumpur",
  MNL: "Manila", DEL: "Delhi", BOM: "Mumbai",
  DXB: "Dubai", AUH: "Abu Dhabi", DOH: "Doha",
  RUH: "Riyadh", JED: "Jeddah", CAI: "Cairo",
  ACC: "Accra", NBO: "Nairobi", ADD: "Addis Ababa",
  JNB: "Johannesburg", CPT: "Cape Town", LOS: "Lagos",
  CMN: "Casablanca", MLE: "Male", DPS: "Bali",
  SYD: "Sydney", MEL: "Melbourne",
  MEX: "Mexico City", CUN: "Cancun", GRU: "Sao Paulo",
  GIG: "Rio de Janeiro", EZE: "Buenos Aires", BOG: "Bogota",
  LIM: "Lima", SCL: "Santiago",
};

const IATA_AIRPORT: Record<string, string> = {
  LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", MAN: "Manchester",
  CDG: "Charles de Gaulle", ORY: "Orly", AMS: "Schiphol", FRA: "Frankfurt",
  MUC: "Munich", FCO: "Fiumicino", MXP: "Malpensa", NAP: "Capodichino",
  MAD: "Barajas", BCN: "El Prat", LIS: "Humberto Delgado", ZRH: "Zurich",
  GVA: "Geneva", VIE: "Vienna Intl", PRG: "Vaclav Havel", WAW: "Chopin",
  BRU: "Brussels", CPH: "Kastrup", OSL: "Gardermoen", ARN: "Arlanda",
  HEL: "Helsinki-Vantaa", DUB: "Dublin", EDI: "Edinburgh", ATH: "Eleftherios Venizelos",
  IST: "Istanbul", SAW: "Sabiha Gokcen", AYT: "Antalya", KEF: "Keflavik",
  JFK: "John F. Kennedy", EWR: "Newark Liberty", LGA: "LaGuardia",
  LAX: "Los Angeles Intl", SFO: "San Francisco Intl", OAK: "Oakland Intl",
  SJC: "San Jose Intl", ORD: "O'Hare", ATL: "Hartsfield-Jackson",
  MIA: "Miami Intl", FLL: "Fort Lauderdale", DFW: "Dallas/Fort Worth",
  IAH: "George Bush", DEN: "Denver Intl", SEA: "Seattle-Tacoma",
  BOS: "Logan Intl", IAD: "Dulles", DCA: "Reagan National",
  BWI: "Baltimore/Washington", PHL: "Philadelphia Intl", CLT: "Charlotte Douglas",
  MSP: "Minneapolis-St Paul", DTW: "Detroit Metro", PHX: "Sky Harbor",
  SAN: "San Diego Intl", TPA: "Tampa Intl", MCO: "Orlando Intl",
  SLC: "Salt Lake City Intl", PDX: "Portland Intl", HNL: "Honolulu",
  AUS: "Austin-Bergstrom", RDU: "Raleigh-Durham", CHS: "Charleston Intl",
  BNA: "Nashville Intl", STL: "St Louis Lambert", PIT: "Pittsburgh Intl",
  IND: "Indianapolis Intl", MCI: "Kansas City Intl",
  YYZ: "Toronto Pearson", YVR: "Vancouver Intl", YUL: "Montreal-Trudeau",
  YOW: "Ottawa Intl", YYC: "Calgary Intl",
  SIN: "Changi", HND: "Haneda", NRT: "Narita", KIX: "Kansai Intl",
  CTS: "New Chitose", NGO: "Chubu Centrair", FUK: "Fukuoka",
  ICN: "Incheon", GMP: "Gimpo", PUS: "Gimhae",
  HKG: "Hong Kong Intl", BKK: "Suvarnabhumi", TPE: "Taoyuan",
  PEK: "Beijing Capital", PVG: "Pudong", KUL: "Kuala Lumpur Intl",
  MNL: "Ninoy Aquino", DEL: "Indira Gandhi", BOM: "Chhatrapati Shivaji",
  DXB: "Dubai Intl", AUH: "Abu Dhabi", DOH: "Hamad Intl",
  RUH: "King Khalid", JED: "King Abdulaziz", CAI: "Cairo Intl",
  ACC: "Kotoka Intl", NBO: "Jomo Kenyatta", ADD: "Bole Intl",
  JNB: "O.R. Tambo", CPT: "Cape Town Intl", LOS: "Murtala Muhammed",
  CMN: "Mohammed V", MLE: "Velana Intl", DPS: "Ngurah Rai",
  SYD: "Kingsford Smith", MEL: "Tullamarine",
  MEX: "Benito Juarez", CUN: "Cancun Intl", GRU: "Guarulhos",
  GIG: "Galeao", EZE: "Ezeiza", BOG: "El Dorado",
  LIM: "Jorge Chavez", SCL: "Arturo Merino Benitez",
};

import { IATA_TZ } from "@/shared/timezones";

function getTzLabel(iata: string, refDate: string): { abbr: string; offset: string } | null {
  const tz = IATA_TZ[iata];
  if (!tz) return null;
  try {
    const d = new Date(refDate + "T12:00:00Z");

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);

    const localH = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const localM = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    const localDay = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
    const utcDay = d.getUTCDate();

    let offsetMins = (localH * 60 + localM) - (12 * 60);
    if (localDay > utcDay) offsetMins += 1440;
    else if (localDay < utcDay) offsetMins -= 1440;

    const sign = offsetMins >= 0 ? "+" : "-";
    const absH = Math.floor(Math.abs(offsetMins) / 60);
    const absM = Math.abs(offsetMins) % 60;
    const offsetStr = offsetMins === 0 ? "GMT"
      : absM === 0 ? `GMT${sign}${absH}`
      : `GMT${sign}${absH}:${String(absM).padStart(2, "0")}`;

    let abbr = "";
    try {
      const abbrParts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(d);
      abbr = abbrParts.find(p => p.type === "timeZoneName")?.value || "";
    } catch {}
    if (!abbr || abbr === offsetStr || (abbr === "GMT" && offsetMins !== 0)) abbr = "";

    return { abbr, offset: offsetStr };
  } catch { return null; }
}

function toRad(d: number) { return (d * Math.PI) / 180; }

function gcDistance(from: [number, number], to: [number, number]): number {
  const R = 6371;
  const dLat = toRad(to[0] - from[0]);
  const dLon = toRad(to[1] - from[1]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gcBearing(from: [number, number], to: [number, number]): number {
  const dLon = toRad(to[1] - from[1]);
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function getCountdown(dateStr: string, timeStr?: string): string | null {
  const raw = timeStr
    ? `${dateStr}T${timeStr.replace(/\s*(AM|PM)/i, " $1").trim()}`
    : `${dateStr}T12:00:00`;
  const dep = new Date(raw);
  if (isNaN(dep.getTime())) return null;
  const diff = dep.getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatGap(ms: number): string {
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hrs > 0) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  return `${Math.max(1, mins)}m`;
}

function parseDuration(dur?: string): { h: number; m: number } | null {
  if (!dur) return null;
  const match = dur.match(/(\d+)\s*h\s*(?:(\d+)\s*m)?/i);
  if (match) return { h: parseInt(match[1]), m: parseInt(match[2] || "0") };
  return null;
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, hotel: Bed, activity: Compass, dining: ForkKnife, transfer: Car,
};

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity", dining: "Dining", transfer: "Transfer",
};

const TRANSFER_ICONS: Record<string, React.ComponentType<any>> = {
  car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor, other: Compass,
};
const TRANSFER_LABELS: Record<string, string> = {
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise", other: "Transfer",
};

function cleanEventTitle(title: string, type: string, transferType?: string): string {
  const labels = [
    TRANSFER_LABELS[transferType || ""] || "",
    TYPE_LABELS[type] || "",
  ];
  for (const l of labels) {
    if (!l) continue;
    const re = new RegExp(`^${l}\\s*[-–·:]\\s*`, "i");
    title = title.replace(re, "");
  }
  return title;
}

function eventStatus(status: string | undefined, C: ThemeColors, eventDate?: string) {
  const s = (status || "confirmed").toLowerCase();
  const isPast = !!eventDate && new Date(eventDate + "T23:59:59").getTime() < Date.now();
  const pick = (key: string, label: string, state: "destructive" | "warning" | "past" | "upcoming") =>
    ({ ...statusTone(key, C), label, state });
  if (s.includes("cancel")) return pick("cancelled", "Cancelled", "destructive");
  if (s.includes("delay")) return pick("delayed", "Delayed", "warning");
  if (s.includes("pend") || s.includes("hold")) return pick("pending", "Pending", "warning");
  if (s.includes("done") || s.includes("complet") || isPast) return pick("past", "Done", "past");
  return pick("confirmed", "Confirmed", "upcoming");
}

function parseDocFilename(filename: string, size: number) {
  const base = filename.replace(/\.[^.]+$/, "");
  const match = base.match(/^([A-Za-z]+)(\d+)\s+(\d{1,2})([A-Za-z]+)(\d{4})/);
  if (match) {
    const [, type, num, day, mon, year] = match;
    return { label: `${type} ${num}`, date: `${day} ${mon} ${year}`, size: formatFileSize(size) };
  }
  return { label: base, date: "", size: formatFileSize(size) };
}

function formatFileSize(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { tripId, eventId } = useLocalSearchParams<{ tripId: string; eventId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C, isDark } = useTheme();
  const { isLeader } = useTripRole(tripId);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const trip = trips.find(t => t.id === tripId);
  const ev = trip?.events.find(e => e.id === eventId);

  // Resolve the event position as [lng, lat]. Stored coords have inconsistent order, so the
  // trip destination (or, failing that, the geocoded address) is the reference to pick the right one.
  // Nothing renders until this pass finishes, so the map never mounts at the wrong place.
  const evLocation = ev?.location;
  const tripDest = trip?.destination;
  const [resolved, setResolved] = useState<{ ref: [number, number] | null; geo: [number, number] | null } | null>(null);
  useEffect(() => {
    setResolved(null);
    let cancelled = false;
    (async () => {
      const dest = tripDest ? await geocode(tripDest) : null;
      const near = dest ?? undefined;
      const loc = evLocation ? await geocode(evLocation, near) : null;
      if (cancelled) return;
      const geo: [number, number] | null = loc ? [loc[1], loc[0]] : null;
      const ref: [number, number] | null = dest ? [dest[1], dest[0]] : geo;
      setResolved({ ref, geo });
    })();
    return () => { cancelled = true; };
  }, [evLocation, tripDest]);

  if (!trip || !ev) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Event not found</Text>
          <Pressable onPress={safeBack} style={styles.errorBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.errorBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (ev.type === "flight") {
    return <FlightDetailScreen ev={ev} trip={trip} C={C} isDark={isDark} isLeader={isLeader} insets={insets} router={router} safeBack={safeBack} />;
  }

  // ── Non-flight unified detail ──

  const Icon = ev.type === "transfer" ? (TRANSFER_ICONS[ev.transferType || "car"] || Car) : (TYPE_ICONS[ev.type] ?? Compass);
  const typeLabel = ev.type === "transfer" ? (TRANSFER_LABELS[ev.transferType || "car"] || "Transfer") : (TYPE_LABELS[ev.type] ?? "Event");
  const title = cleanEventTitle(ev.title, ev.type, ev.transferType);
  const isHotel = ev.type === "hotel";

  const sp = eventStatus(ev.status, C, ev.date);
  const storedLngLat = resolved ? toLngLat(ev.locationCoords, resolved.ref ?? undefined) : undefined;
  const storedIsCentroid = !!(storedLngLat && resolved?.ref && isSamePoint(storedLngLat, resolved.ref));
  const locationCoords = resolved
    ? ((storedIsCentroid ? undefined : storedLngLat) ?? resolved.geo ?? undefined)
    : undefined;
  const hasCoords = !!locationCoords;
  const hasDocs = (ev.documents?.length ?? 0) > 0;
  const showActionBar = hasCoords || hasDocs;

  const copyConf = () => {
    if (ev.confNumber) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Clipboard.setStringAsync(ev.confNumber);
    }
  };

  const detailRows: Array<{ icon: React.ComponentType<any>; label: string; value: string; onPress?: () => void }> = [];
  if (ev.duration) detailRows.push({ icon: Timer, label: "Duration", value: ev.duration });
  if (ev.roomType) detailRows.push({ icon: Bed, label: "Room type", value: ev.roomType });
  if (ev.seatDetails) detailRows.push({ icon: Armchair, label: "Seat", value: ev.seatDetails });
  if (ev.terminal) detailRows.push({ icon: Door, label: "Terminal", value: ev.terminal });
  if (ev.gate) detailRows.push({ icon: Door, label: "Gate", value: ev.gate });
  if (ev.price) detailRows.push({ icon: Hash, label: "Price", value: ev.price });
  if (isLeader && ev.supplier) detailRows.push({ icon: Users, label: "Supplier", value: ev.supplier });
  if (isLeader && ev.confNumber) detailRows.push({ icon: Hash, label: "Booking ref", value: ev.confNumber, onPress: copyConf });

  // Live timing: "Starts in" within 24h, "Ends in" while underway (needs an end time)
  const nowMs = Date.now();
  const startAt = ev.date ? parseEventDateTime(ev.date, ev.time).getTime() : NaN;
  const endAt = ev.date && ev.endTime ? parseEventDateTime(ev.endDate || ev.date, ev.endTime).getTime() : NaN;
  const startsIn = !isNaN(startAt) && startAt > nowMs && startAt - nowMs < 24 * 3600000 ? formatGap(startAt - nowMs) : null;
  const endsIn = !isNaN(startAt) && !isNaN(endAt) && nowMs >= startAt && nowMs < endAt ? formatGap(endAt - nowMs) : null;

  // Neighbouring events on the same day
  const dayEvents = trip.events
    .filter(e => e.date === ev.date)
    .sort((a, b) => parseEventDateTime(a.date, a.time).getTime() - parseEventDateTime(b.date, b.time).getTime());
  const dayIdx = dayEvents.findIndex(e => e.id === ev.id);
  const neighbours = [
    { label: "Before", e: dayIdx > 0 ? dayEvents[dayIdx - 1] : null },
    { label: "Up next", e: dayIdx >= 0 && dayIdx < dayEvents.length - 1 ? dayEvents[dayIdx + 1] : null },
  ].filter((n): n is { label: string; e: TravelEvent } => !!n.e);
  const goToEvent = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace({ pathname: "/trip/event", params: { tripId: trip.id, eventId: id } });
  };

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{
        headerShown: true,
        title: "",
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: true,
        headerTintColor: "#fff",
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? {
          headerStyle: { backgroundColor: "transparent" },
          headerLeft: () => (
            <Pressable
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginLeft: 4 }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <CaretLeft size={20} color="#fff" weight="bold" />
            </Pressable>
          ),
        } : {}),
      }} />

      <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: showActionBar ? 80 + insets.bottom : insets.bottom + 24, backgroundColor: C.bg }}
      >
        {/* Hero — photo only, no overlay text */}
        <View style={styles.heroWrap}>
          {ev.image ? (
            <CachedImage uri={ev.image} style={styles.heroImage} contentPosition={{ top: "35%", left: "50%" }} />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: C.card }]}>
              <Icon size={56} color={C.tealDim} weight="thin" />
            </View>
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.2)", "transparent"]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.15 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.5)"]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0.6 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* Type badge + title — below the photo */}
        <View style={styles.px}>
          <Pill
            tone="custom"
            bg={C.tealDim}
            color={C.tealText}
            icon={<Icon size={11} color={C.teal} weight="bold" />}
            label={typeLabel.toUpperCase()}
            style={styles.typePill}
          />
          <Text style={[styles.titleBelow, { color: C.textPrimary }]} numberOfLines={3}>{title}</Text>
        </View>

        {/* Pill row: Status + Date + Time */}
        <Animated.View entering={FadeInDown.delay(50).duration(300)} style={styles.chipWrap}>
          <Pill
            tone="custom"
            bg={sp.bg}
            color={sp.text}
            icon={<StatusIndicator state={sp.state} size={10} color={sp.color} />}
            label={sp.label}
            style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: sp.border }}
          />
          {ev.date && (
            <Pill
              tone="custom"
              bg={C.card}
              color={C.textPrimary}
              icon={<Calendar size={12} color={C.textTertiary} weight="regular" />}
              label={formatShortDate(ev.date)}
            />
          )}
          {!(isHotel && ev.isOvernight) && ev.time && (
            <Pill
              tone="custom"
              bg={C.card}
              color={C.textPrimary}
              icon={<Clock size={12} color={C.textTertiary} weight="regular" />}
              label={`${ev.time}${ev.endTime ? ` – ${ev.endTime}` : ""}`}
            />
          )}
          {(endsIn || startsIn) && (
            <Pill
              tone="custom"
              bg={C.tealDim}
              color={C.tealText}
              icon={<Timer size={12} color={C.textTertiary} weight="regular" />}
              label={endsIn ? `Ends in ${endsIn}` : `Starts in ${startsIn}`}
            />
          )}
        </Animated.View>

        {/* Location card */}
        {ev.location && (
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <Pressable
              onPress={() => openInMaps(ev.location, locationCoords)}
              accessibilityRole="button"
              accessibilityLabel="Open location in Maps"
              style={({ pressed }) => [styles.locationCard, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }, shadow("card", isDark)]}
            >
              <View style={{ borderRadius: R.xl, overflow: "hidden" }}>
              {locationCoords && (
                <EventLocationMap coords={locationCoords} accentColor={C.teal} isDark={isDark} />
              )}
              <View style={styles.locationRow}>
                <View style={[styles.locationIcon, { backgroundColor: C.tealDim }]}>
                  <MapPin size={18} color={C.textTertiary} weight="regular" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.locationLabel, { color: C.textTertiary }]}>Location</Text>
                  <Text style={[styles.locationValue, { color: C.textPrimary }]} numberOfLines={3}>{ev.location}</Text>
                </View>
                <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ flexShrink: 0, alignSelf: "center" }} />
              </View>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {/* Hotel check-in/out */}
        {isHotel && !ev.isOvernight && (ev.time || ev.endTime) && (
          <Animated.View entering={FadeInDown.delay(150).duration(300)}>
            <View style={[styles.checkCard, { backgroundColor: C.card }, shadow("card", isDark)]}>
              {ev.time && (
                <View style={{ flex: 1 }}>
                  <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK IN</Text>
                  <Text style={[styles.checkValue, { color: C.textPrimary }]}>{ev.time}</Text>
                </View>
              )}
              {ev.time && ev.endTime && <ArrowRight size={16} color={C.textTertiary} weight="regular" />}
              {ev.endTime && (
                <View style={{ flex: 1, alignItems: ev.time ? "flex-end" as const : "flex-start" as const }}>
                  <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK OUT</Text>
                  <Text style={[styles.checkValue, { color: C.textPrimary }]}>{ev.endTime}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Details list */}
        {detailRows.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={[styles.infoCard, { backgroundColor: C.card, padding: 0 }, shadow("card", isDark)]}>
            {detailRows.map((row, i) => {
              const RowIcon = row.icon;
              return (
                <Pressable
                  key={i}
                  onPress={row.onPress}
                  accessibilityRole={row.onPress ? "button" : undefined}
                  accessibilityLabel={row.onPress ? `Copy ${row.label}` : undefined}
                  style={[
                    styles.detailListRow,
                    i < detailRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                  ]}
                >
                  <RowIcon size={16} color={C.textTertiary} weight="regular" style={{ marginTop: 2 }} />
                  <Text style={[styles.detailListLabel, { color: C.textTertiary, minWidth: 90 }]}>{row.label}</Text>
                  <Text style={[styles.detailListValue, { color: C.textPrimary, flex: 1 }]}>{row.value}</Text>
                  {row.onPress && <Copy size={12} color={C.textTertiary} weight="light" style={{ marginLeft: S.xs2 }} />}
                </Pressable>
              );
            })}
          </Animated.View>
        )}

        {/* Notes / description — single section, no double label */}
        {(ev.description || ev.notes) && (
          <Animated.View entering={FadeInDown.delay(250).duration(300)} style={[styles.infoCard, { backgroundColor: C.card }, shadow("card", isDark)]}>
            <MicroLabel style={{ marginBottom: S.sm }}>Notes</MicroLabel>
            {ev.description && (
              <Text style={[styles.infoValue, { color: C.textPrimary }]} selectable>{ev.description}</Text>
            )}
            {ev.description && ev.notes && <View style={{ height: S.sm }} />}
            {ev.notes && (
              <Text style={[styles.infoValue, { color: C.textPrimary }]} selectable>{ev.notes}</Text>
            )}
          </Animated.View>
        )}

        {/* Documents */}
        {hasDocs && (
          <Animated.View entering={FadeInDown.delay(300).duration(300)} style={[styles.infoCard, { backgroundColor: C.card, padding: 0 }, shadow("card", isDark)]}>
            <View style={{ paddingHorizontal: S.md, paddingTop: S.md, paddingBottom: S.xs }}>
              <MicroLabel>Documents</MicroLabel>
            </View>
            {ev.documents!.map((doc, i) => {
              const parsed = parseDocFilename(doc.name, doc.size);
              return (
                <Pressable
                  key={doc.id}
                  onPress={() => openDocument(doc.url, doc.name).catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel={`Open document ${parsed.label}`}
                  style={({ pressed }) => [
                    styles.detailListRow,
                    { backgroundColor: pressed ? C.elevated : "transparent" },
                    i < ev.documents!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                  ]}
                >
                  <View style={[styles.docIcon, { backgroundColor: C.tealDim }]}>
                    <FileText size={16} color={C.textTertiary} weight="regular" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.docName, { color: C.textPrimary }]} numberOfLines={1}>{parsed.label}</Text>
                    <Text style={[styles.docMeta, { color: C.textTertiary }]}>
                      {parsed.date ? `${parsed.date} · ` : ""}{parsed.size}
                    </Text>
                  </View>
                  <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center" }} />
                </Pressable>
              );
            })}
          </Animated.View>
        )}

        {/* Before / up next on the same day */}
        {neighbours.length > 0 && (
          <Animated.View entering={FadeInDown.delay(350).duration(300)} style={[styles.infoCard, { backgroundColor: C.card, padding: 0 }, shadow("card", isDark)]}>
            {neighbours.map(({ label, e }, i) => (
              <Pressable
                key={e.id}
                onPress={() => goToEvent(e.id)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${cleanEventTitle(e.title, e.type, e.transferType)}`}
                style={({ pressed }) => [
                  styles.detailListRow,
                  { alignItems: "center", backgroundColor: pressed ? C.elevated : "transparent" },
                  i < neighbours.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                ]}
              >
                <Text style={[styles.detailListLabel, { color: C.textTertiary, minWidth: 90 }]}>{label}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.detailListValue, { color: C.textPrimary }]} numberOfLines={1}>
                    {cleanEventTitle(e.title, e.type, e.transferType)}
                  </Text>
                  {e.time ? (
                    <Text style={{ fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary, marginTop: 2 }}>{e.time}</Text>
                  ) : null}
                </View>
                <CaretRight size={14} color={C.textTertiary} weight="regular" />
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Organiser contact */}
        {trip.organizer && (
          <Animated.View entering={FadeInDown.delay(400).duration(300)} style={{ marginTop: -S.sm, marginBottom: S.md }}>
            <OrganizerCard organizer={trip.organizer} C={C} isLeader={isLeader} />
          </Animated.View>
        )}
      </ScrollView>

      {/* Action bar — data-driven */}
      {showActionBar && (
        <View style={styles.actionBarWrap}>
          <LinearGradient
            colors={[`${C.bg}00`, C.bg]}
            style={styles.actionBarGradient}
            pointerEvents="none"
          />
          <View style={[styles.actionBarInner, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
            {hasCoords ? (
              <>
                <Pressable
                  onPress={() => openInMaps(ev.location, locationCoords)}
                  accessibilityRole="button"
                  accessibilityLabel="Open in Maps"
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1, flex: 1 }]}
                >
                  <MapPin size={16} color={C.onAccent} weight="bold" />
                  <Text style={styles.primaryBtnText}>Open in Maps</Text>
                </Pressable>
                {hasDocs && (
                  <Pressable
                    onPress={() => ev.documents?.[0] && openDocument(ev.documents[0].url, ev.documents[0].name).catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel="View documents"
                    style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <FileText size={18} color={C.textTertiary} weight="regular" />
                  </Pressable>
                )}
              </>
            ) : hasDocs ? (
              <Pressable
                onPress={() => ev.documents?.[0] && openDocument(ev.documents[0].url, ev.documents[0].name).catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel="View documents"
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1, flex: 1 }]}
              >
                <FileText size={16} color={C.onAccent} weight="bold" />
                <Text style={styles.primaryBtnText}>View documents</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      </View>
    </View>
  );
}

// ── Flight Detail Screen ────────────────────────────────────────────────────

function TbaText({ C }: { C: ThemeColors }) {
  return <Text style={{ color: C.textTertiary, fontSize: T.sm, fontWeight: T.semibold }}>TBA</Text>;
}

function FlightDetailScreen({
  ev, C, isDark, isLeader, insets, safeBack,
}: {
  ev: TravelEvent;
  trip: any;
  C: ThemeColors;
  isDark: boolean;
  isLeader: boolean;
  insets: { bottom: number; top: number };
  router: any;
  safeBack: () => void;
}) {
  const { data: live } = useFlightLiveData(ev.flightNum, ev.date);

  const locMatch = (ev.location || "").match(/^([A-Z]{3})\s*(?:to|→|➜|>|–|—|-)\s*([A-Z]{3})$/i);
  const depCode = locMatch?.[1]?.toUpperCase() || ev.depAirport?.toUpperCase() || "";
  const arrCode = locMatch?.[2]?.toUpperCase() || ev.arrAirport?.toUpperCase() || "";
  const depCity = IATA_CITY[depCode] || "";
  const arrCity = IATA_CITY[arrCode] || "";
  const depAirportName = IATA_AIRPORT[depCode] || "";
  const arrAirportName = IATA_AIRPORT[arrCode] || "";

  const rawDep = (LOCATION_COORDS[depCode] as [number, number] | undefined) ?? ev.depCoords;
  const rawArr = (LOCATION_COORDS[arrCode] as [number, number] | undefined) ?? ev.arrCoords;
  const isFiniteCoord = (c: unknown): c is [number, number] =>
    Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
  const depCoords = isFiniteCoord(rawDep) ? rawDep : undefined;
  const arrCoords = isFiniteCoord(rawArr) ? rawArr : undefined;
  const hasMap = !!(depCoords && arrCoords);

  // LOCATION_COORDS is [lat, lng], Mapbox needs [lng, lat]
  const mapFrom = depCoords ? [depCoords[1], depCoords[0]] as [number, number] : undefined;
  const mapTo = arrCoords ? [arrCoords[1], arrCoords[0]] as [number, number] : undefined;

  const distance = useMemo(() => {
    if (!depCoords || !arrCoords) return null;
    return Math.round(gcDistance(depCoords, arrCoords));
  }, [depCoords, arrCoords]);

  const bearing = useMemo(() => {
    if (!depCoords || !arrCoords) return null;
    return gcBearing(depCoords, arrCoords);
  }, [depCoords, arrCoords]);

  const depTime = ev.time ? formatTo24h(ev.time) : "";
  const arrTime = ev.endTime ? formatTo24h(ev.endTime) : "";
  const dur = parseDuration(ev.duration);
  const countdown = ev.date ? getCountdown(ev.date, ev.time) : null;

  const { arrivalDate, dayOffset } = useMemo(() => {
    if (ev.endDate && ev.date && ev.endDate !== ev.date) {
      const d0 = new Date(ev.date + "T00:00:00");
      const d1 = new Date(ev.endDate + "T00:00:00");
      return { arrivalDate: ev.endDate, dayOffset: Math.round((d1.getTime() - d0.getTime()) / 86400000) };
    }
    if (ev.date && dur) {
      const dep = parseEventDateTime(ev.date, depTime);
      dep.setHours(dep.getHours() + dur.h, dep.getMinutes() + dur.m);
      const arrDateStr = dep.toISOString().slice(0, 10);
      const d0 = new Date(ev.date + "T00:00:00");
      const d1 = new Date(arrDateStr + "T00:00:00");
      return { arrivalDate: arrDateStr, dayOffset: Math.round((d1.getTime() - d0.getTime()) / 86400000) };
    }
    return { arrivalDate: ev.date, dayOffset: 0 };
  }, [ev.date, ev.endDate, dur, depTime]);

  const depTz = useMemo(() => ev.date ? getTzLabel(depCode, ev.date) : null, [depCode, ev.date]);
  const arrTz = useMemo(() => arrivalDate ? getTzLabel(arrCode, arrivalDate) : null, [arrCode, arrivalDate]);

  const airlineIata = ev.flightNum?.match(/^([A-Z0-9]{2})/)?.[1] || "";
  const [logoError, setLogoError] = useState(false);

  const statusLower = (live?.status || "").toLowerCase();
  const isPast = useMemo(() => {
    if (!ev.date) return false;
    const d = new Date(ev.date + "T23:59:59");
    return d.getTime() < Date.now();
  }, [ev.date]);
  const statusLabel = statusLower.includes("cancel") ? "Cancelled"
    : statusLower.includes("delay") ? "Delayed"
    : (statusLower.includes("land") || statusLower.includes("arrived") || isPast) ? "Landed" : "On Time";
  const tone = statusTone(statusLabel, C);

  const copyConf = () => {
    if (ev.confNumber) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Clipboard.setStringAsync(ev.confNumber);
    }
  };

  const fs = useMemo(() => makeFlightStyles(C), [C]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{
        headerShown: true,
        title: "",
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: true,
        headerBlurEffect: undefined,
        headerTintColor: isDark ? "#fff" : "#000",
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? {
          headerStyle: { backgroundColor: "transparent" },
          headerLeft: () => (
            <Pressable
              onPress={safeBack}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center", marginLeft: 4 }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <CaretLeft size={22} color={isDark ? "#fff" : "#000"} weight="regular" />
            </Pressable>
          ),
        } : {}),
      }} />

      <View style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* 1. Map hero */}
          <View style={{ position: "relative" }}>
            {hasMap && mapFrom && mapTo ? (
              <FlightRouteMap
                from={mapFrom}
                to={mapTo}
                fromCode={depCode}
                toCode={arrCode}
                height={320}
                accentColor={C.teal}
                isDark={isDark}
              />
            ) : (
              <View style={{ height: 320, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
                <AirplaneTilt size={48} color={C.textTertiary} weight="thin" />
              </View>
            )}

            {/* Floating stats */}
            {(distance || bearing !== null) && (
              <View style={fs.mapStatsRow}>
                {distance ? (
                  <Pill tone="custom" bg={C.glass} color={C.textSecondary} label={`${distance.toLocaleString()} km`} />
                ) : null}
                {bearing !== null ? (
                  <Pill tone="custom" bg={C.glass} color={C.textSecondary} label={`${Math.round(bearing)}° ${bearingLabel(bearing)}`} />
                ) : null}
              </View>
            )}
          </View>

          <View style={fs.body}>
            {/* 2. Airline row */}
            <Animated.View entering={FadeInDown.delay(20).duration(300)} style={fs.airlineRow}>
              <View style={fs.airlineTile}>
                {airlineIata && !logoError ? (
                  <Image
                    source={{ uri: `https://images.kiwi.com/airlines/64/${airlineIata}.png` }}
                    style={fs.airlineLogo}
                    onError={() => setLogoError(true)}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={fs.airlineIata}>
                    {airlineIata || (ev.airline || "--").slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[fs.airlineName, { color: C.textPrimary }]} numberOfLines={1}>
                  {ev.airline || "Airline"}
                </Text>
                <Text style={[fs.flightNum, { color: C.textTertiary }]}>
                  {ev.flightNum || "---"}
                </Text>
              </View>
            </Animated.View>

            {/* 3. Route header */}
            <Animated.View entering={FadeInDown.delay(50).duration(300)}>
              <Text style={[fs.routeTitle, { color: C.textPrimary }]}>
                {depCity || depCode || "---"}
                <Text style={{ color: C.tealText }}> → </Text>
                {arrCity || arrCode || "---"}
              </Text>
              <Text style={[fs.routeSub, { color: C.textTertiary }]}>
                {depCode || "---"} · {depAirportName || "---"}  →  {arrCode || "---"} · {arrAirportName || "---"}
              </Text>
            </Animated.View>

            {/* 4. Status pills */}
            <Animated.View entering={FadeInDown.delay(100).duration(300)} style={fs.pillRow}>
              {ev.status && (
                <Pill
                  tone="custom"
                  bg={tone.bg}
                  color={tone.text}
                  icon={
                    <StatusIndicator
                      state={
                        statusLabel === "Cancelled" ? "destructive"
                        : statusLabel === "Delayed" ? "warning"
                        : statusLabel === "Landed" ? "completed"
                        : "upcoming"
                      }
                      size={10}
                      color={tone.color}
                    />
                  }
                  label={statusLabel}
                />
              )}
              {countdown && (
                <Pill
                  tone="neutral"
                  icon={<StatusIndicator state="upcoming" size={12} color={C.textSecondary} />}
                  label={`Departs in ${countdown}`}
                />
              )}
            </Animated.View>

            {/* 5. Times card */}
            <Animated.View entering={FadeInDown.delay(150).duration(300)} style={[fs.card, { backgroundColor: C.card }, shadow("card", isDark)]}>
              <View style={fs.timesRow}>
                {/* Departure */}
                <View style={{ flex: 1 }}>
                  <Text style={[fs.bigTime, { color: C.textPrimary }]}>{depTime || "--:--"}</Text>
                  {depTz && (
                    <Text style={[fs.tzLabel, { color: C.textTertiary }]}>
                      {depTz.abbr ? `${depTz.abbr} · ${depTz.offset}` : depTz.offset}
                    </Text>
                  )}
                  <Text style={[fs.airportCode, { color: C.textTertiary }]}>{depCode || "---"}</Text>
                  <Text style={[fs.airportName, { color: C.textTertiary }]} numberOfLines={1}>{depAirportName || "---"}</Text>
                </View>

                {/* Arc connector */}
                <View style={fs.arcConnector}>
                  <View style={fs.arcLineRow}>
                    <View style={[fs.dashLine, { borderColor: C.border }]} />
                    <AirplaneTilt size={16} color={C.teal} weight="fill" style={{ transform: [{ rotate: "45deg" }] }} />
                    <View style={[fs.dashLine, { borderColor: C.border }]} />
                  </View>
                  {dur && (
                    <Text style={[fs.durLabel, { color: C.textTertiary }]}>
                      {dur.h}h{dur.m > 0 ? ` ${dur.m}m` : ""}
                    </Text>
                  )}
                </View>

                {/* Arrival */}
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
                    <Text style={[fs.bigTime, { color: C.textPrimary }]}>{arrTime || "--:--"}</Text>
                    {dayOffset > 0 && (
                      <View style={[fs.plusOneBadge, { backgroundColor: C.tealDim }]}>
                        <Text style={[fs.plusOneText, { color: C.tealText }]}>+{dayOffset}</Text>
                      </View>
                    )}
                  </View>
                  {arrTz && (
                    <Text style={[fs.tzLabel, { color: C.textTertiary }]}>
                      {arrTz.abbr ? `${arrTz.abbr} · ${arrTz.offset}` : arrTz.offset}
                    </Text>
                  )}
                  <Text style={[fs.airportCode, { color: C.textTertiary }]}>{arrCode || "---"}</Text>
                  <Text style={[fs.airportName, { color: C.textTertiary }]} numberOfLines={1}>{arrAirportName || "---"}</Text>
                </View>
              </View>

              {/* Date row — departure & arrival */}
              {ev.date && (
                <View style={[fs.dateRow, { borderTopColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[fs.dateColLabel, { color: C.textTertiary }]}>DEPARTURE</Text>
                    <Text style={[fs.dateText, { color: C.textTertiary }]}>{formatShortDate(ev.date)}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[fs.dateColLabel, { color: C.textTertiary }]}>ARRIVAL</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs2 }}>
                      <Text style={[fs.dateText, { color: C.textTertiary }]}>
                        {formatShortDate(arrivalDate)}
                      </Text>
                      {dayOffset > 0 && (
                        <View style={[fs.plusOneBadge, { backgroundColor: C.tealDim }]}>
                          <Text style={[fs.plusOneText, { color: C.tealText }]}>+{dayOffset}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </Animated.View>

            {/* 6. Terminal pair */}
            <Animated.View entering={FadeInDown.delay(200).duration(300)} style={fs.termRow}>
              <View style={[fs.termCard, { backgroundColor: C.card }, shadow("card", isDark)]}>
                <View style={fs.termHeader}>
                  <AirplaneTakeoff size={13} color={C.teal} weight="bold" />
                  <Text style={[fs.termHeaderText, { color: C.textTertiary }]}>DEPARTURE</Text>
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textTertiary }]}>Terminal</Text>
                  {(live?.terminal || ev.terminal) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{(live?.terminal || ev.terminal || "").replace(/^T/i, "")}</Text>
                  ) : <TbaText C={C} />}
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textTertiary }]}>Gate</Text>
                  {(live?.gate || ev.gate) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{live?.gate || ev.gate}</Text>
                  ) : <TbaText C={C} />}
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textTertiary }]}>Check-in</Text>
                  {ev.checkin ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{ev.checkin}</Text>
                  ) : <TbaText C={C} />}
                </View>
              </View>

              <View style={[fs.termCard, { backgroundColor: C.card }, shadow("card", isDark)]}>
                <View style={fs.termHeader}>
                  <AirplaneLanding size={13} color={C.teal} weight="bold" />
                  <Text style={[fs.termHeaderText, { color: C.textTertiary }]}>ARRIVAL</Text>
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textTertiary }]}>Terminal</Text>
                  {(live?.arrTerminal || ev.arrTerminal) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{(live?.arrTerminal || ev.arrTerminal || "").replace(/^T/i, "")}</Text>
                  ) : <TbaText C={C} />}
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textTertiary }]}>Gate</Text>
                  {(live?.arrGate || ev.arrGate) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{live?.arrGate || ev.arrGate}</Text>
                  ) : <TbaText C={C} />}
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textTertiary }]}>Belt</Text>
                  {(live?.baggageBelt || ev.baggageBelt) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{live?.baggageBelt || ev.baggageBelt}</Text>
                  ) : <TbaText C={C} />}
                </View>
              </View>
            </Animated.View>

            {/* 7. Details list */}
            <Animated.View entering={FadeInDown.delay(250).duration(300)} style={[fs.card, { backgroundColor: C.card, padding: 0 }, shadow("card", isDark)]}>
              {[
                { icon: AirplaneTilt, label: "Aircraft", value: live?.aircraft || ev.aircraft || null },
                distance ? { icon: Ruler, label: "Distance", value: `${distance.toLocaleString()} km` } : null,
                isLeader && ev.confNumber ? { icon: Hash, label: "Booking ref", value: ev.confNumber, onPress: copyConf } : null,
                ev.seatDetails ? { icon: Armchair, label: "Seat", value: ev.seatDetails } : null,
              ].filter(Boolean).map((item: any, i, arr) => (
                <Pressable
                  key={i}
                  onPress={item.onPress}
                  accessibilityRole={item.onPress ? "button" : undefined}
                  accessibilityLabel={item.onPress ? `Copy ${item.label}` : undefined}
                  style={[
                    fs.detailRow,
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                  ]}
                >
                  <item.icon size={16} color={C.textTertiary} weight="regular" style={{ marginTop: 2 }} />
                  <Text style={[fs.detailLabel, { color: C.textTertiary, flex: 1 }]}>{item.label}</Text>
                  {item.value ? (
                    <Text style={[fs.detailValue, { color: C.textPrimary, textAlign: "right" }]}>{item.value}</Text>
                  ) : <TbaText C={C} />}
                  {item.onPress && <Copy size={12} color={C.textTertiary} weight="light" style={{ marginLeft: S.xs2 }} />}
                </Pressable>
              ))}
            </Animated.View>

            {/* Documents */}
            {ev.documents && ev.documents.length > 0 && (
              <View>
                <MicroLabel style={{ marginBottom: S.xs }}>Documents</MicroLabel>
                {ev.documents.map(doc => (
                  <Pressable
                    key={doc.id}
                    onPress={() => openDocument(doc.url, doc.name).catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel={`Open document ${doc.name}`}
                    style={({ pressed }) => [fs.docRow, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <View style={[fs.docIcon, { backgroundColor: C.tealDim }]}>
                      <FileText size={14} color={C.textTertiary} weight="regular" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[{ fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary }]} numberOfLines={1}>{doc.name}</Text>
                      <Text style={{ fontSize: T.xs, color: C.textTertiary }}>{Math.round(doc.size / 1024)} KB</Text>
                    </View>
                    <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center" }} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

      </View>
    </View>
  );
}

// ── Flight styles ───────────────────────────────────────────────────────────

function makeFlightStyles(C: ThemeColors) {
  return StyleSheet.create({
    mapStatsRow: {
      position: "absolute", bottom: S.xs, left: S.md, right: S.md,
      flexDirection: "row", justifyContent: "space-between",
    },

    body: { paddingHorizontal: S.md, paddingTop: S.lg, gap: S.md },

    airlineRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
    airlineTile: {
      width: 40, height: 40, borderRadius: R.md,
      backgroundColor: LOGO_PLATE,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      alignItems: "center", justifyContent: "center",
    },
    airlineIata: { fontSize: T.xs, fontWeight: T.black, color: LOGO_INK, letterSpacing: 0.5 },
    airlineLogo: { width: 30, height: 30, borderRadius: 4 },
    airlineName: { fontSize: T.sm, fontWeight: T.bold },
    flightNum: { fontSize: T.xs, fontWeight: T.medium, letterSpacing: 0.3, marginTop: 1 },

    routeTitle: { fontSize: 28, fontFamily: F.black, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 34 },
    routeSub: { fontSize: T.xs, fontWeight: T.medium, letterSpacing: 0.2, marginTop: 4 },

    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: S.xs },

    card: { borderRadius: R.xl, padding: S.md },

    timesRow: { flexDirection: "row", alignItems: "flex-start" },
    bigTime: {
      fontSize: 32, fontWeight: T.bold, lineHeight: 36,
      fontVariant: ["tabular-nums"], letterSpacing: -0.5,
    },
    tzLabel: { fontSize: T["2xs"], fontWeight: T.medium, letterSpacing: 0.5, marginTop: 4, fontVariant: ["tabular-nums"] },
    airportCode: { fontSize: T.xs, fontWeight: T.medium, marginTop: 6 },
    airportName: { fontSize: T.xs, marginTop: 2 },
    arcConnector: { alignItems: "center", justifyContent: "center", paddingHorizontal: S.sm, paddingTop: 8 },
    arcLineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dashLine: { width: 20, height: 0, borderTopWidth: 1, borderStyle: "dashed" },
    durLabel: { fontSize: T["2xs"], fontWeight: T.bold, letterSpacing: 0.3, marginTop: 6 },
    plusOneBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
    plusOneText: { fontSize: T["2xs"], fontWeight: T.bold },

    dateRow: {
      flexDirection: "row", justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: S.md, paddingTop: S.sm,
    },
    dateText: { fontSize: T.xs, fontWeight: T.medium },

    termRow: { flexDirection: "row", gap: S.sm },
    termCard: { flex: 1, borderRadius: R.lg, padding: S.md },
    termHeader: { flexDirection: "row", alignItems: "center", gap: S.xs2, marginBottom: S.sm },
    termHeaderText: { fontSize: T["2xs"], fontWeight: T.black, letterSpacing: 1.2 },
    termField: { marginBottom: S.xs },
    termFieldLabel: { fontSize: T["2xs"], fontWeight: T.bold, letterSpacing: 0.5, marginBottom: 2 },
    termFieldValue: { fontSize: T.sm, fontWeight: T.bold },

    detailRow: {
      flexDirection: "row", alignItems: "flex-start", gap: S.sm,
      paddingHorizontal: S.md, paddingVertical: S.sm,
    },
    detailLabel: { fontSize: T.sm, fontWeight: T.medium },
    detailValue: { fontSize: T.sm, fontWeight: T.semibold, fontVariant: ["tabular-nums"] },

    docRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      padding: S.md, borderRadius: R.lg, marginBottom: S["2xs"],
    },
    docIcon: { width: 40, height: 40, borderRadius: R.md, alignItems: "center", justifyContent: "center" },

    dateColLabel: { fontSize: T["2xs"], fontWeight: T.bold, letterSpacing: 1, marginBottom: 4 },
  });
}

// ── Non-flight styles ───────────────────────────────────────────────────────

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.onAccent, fontWeight: T.bold, fontSize: T.base },
    px: { paddingHorizontal: S.md, marginBottom: S.md },

    heroWrap: { position: "relative", aspectRatio: 16 / 9, marginBottom: 0 },
    heroImage: {
      width: "100%", height: "100%",
      alignItems: "center", justifyContent: "center",
    },
    typePill: {
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
      marginTop: S.lg, marginBottom: S.sm,
    },
    titleBelow: {
      fontSize: T["2xl"], fontWeight: T.bold,
      letterSpacing: -0.3, lineHeight: 30,
      marginBottom: S.md,
    },

    chipWrap: {
      flexDirection: "row", flexWrap: "wrap", gap: S.xs,
      paddingHorizontal: S.md, marginBottom: S.md,
    },

    locationCard: {
      marginHorizontal: S.md, marginBottom: S.md,
      borderRadius: R.xl,
    },
    locationRow: {
      flexDirection: "row", alignItems: "flex-start", gap: S.sm,
      padding: S.md,
    },
    locationIcon: {
      width: 32, height: 32, borderRadius: R.md,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    locationLabel: { fontSize: T["2xs"], fontWeight: T.semibold, letterSpacing: 0.5, marginBottom: 2 },
    locationValue: { fontSize: T.sm, fontWeight: T.semibold, lineHeight: 18 },

    checkCard: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      marginHorizontal: S.md, marginBottom: S.md,
      padding: S.md, borderRadius: R.xl,
    },
    checkLabel: { fontSize: T["2xs"], fontWeight: T.bold, letterSpacing: 1, marginBottom: S["2xs"] },
    checkValue: { fontSize: T.base, fontWeight: T.bold },

    infoCard: {
      marginHorizontal: S.md, marginBottom: S.md,
      padding: S.md, borderRadius: R.xl,
    },
    infoValue: { fontSize: T.sm, lineHeight: 20, fontWeight: T.regular },

    detailListRow: {
      flexDirection: "row", alignItems: "flex-start", gap: S.sm,
      paddingHorizontal: S.md, paddingVertical: S.sm,
    },
    detailListLabel: { fontSize: T.sm, fontWeight: T.medium },
    detailListValue: { fontSize: T.sm, fontWeight: T.semibold },

    docIcon: {
      width: 40, height: 40, borderRadius: R.md,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.borderLight,
    },
    docName: { fontSize: T.sm, fontWeight: T.semibold },
    docMeta: {
      fontSize: T.xs, fontWeight: T.medium, marginTop: 2,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },

    actionBarWrap: {
      position: "absolute", bottom: 0, left: 0, right: 0,
    },
    actionBarGradient: {
      position: "absolute", top: -40, left: 0, right: 0, height: 40,
    },
    actionBarInner: {
      flexDirection: "row", gap: S.sm,
      paddingHorizontal: S.md, paddingVertical: S.md,
      backgroundColor: C.bg,
    },
    primaryBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S.xs, height: 52, borderRadius: R.xl,
    },
    primaryBtnText: { fontSize: T.md, fontWeight: T.bold, color: C.onAccent },
    secondaryBtn: {
      width: 52, height: 52, borderRadius: R.xl,
      alignItems: "center", justifyContent: "center",
    },
  });
}
