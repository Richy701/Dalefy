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
  Airplane, AirplaneTilt, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  MapPin, Clock, Hash, FileText,
  Calendar, Users, ArrowRight, Copy, CaretRight, CaretLeft,
  AirplaneTakeoff, AirplaneLanding, Timer, Armchair, Door,
  Ruler,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { LOCATION_COORDS } from "@/shared/coordinates";
import { useMemo, useCallback, useState } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { TravelEvent } from "@/shared/types";

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

function formatDate(d: string): string {
  const raw = d.includes("T") ? d : d + "T12:00:00";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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
  LHR: "London", LGW: "London", STN: "London", CDG: "Paris", ORY: "Paris",
  JFK: "New York", EWR: "New York", LGA: "New York", LAX: "Los Angeles",
  SFO: "San Francisco", ORD: "Chicago", ATL: "Atlanta", MIA: "Miami",
  DFW: "Dallas", DEN: "Denver", SEA: "Seattle", BOS: "Boston",
  SIN: "Singapore", HND: "Tokyo", NRT: "Tokyo", ICN: "Seoul",
  HKG: "Hong Kong", BKK: "Bangkok", DXB: "Dubai", DOH: "Doha",
  IST: "Istanbul", SYD: "Sydney", MEL: "Melbourne", FCO: "Rome",
  AMS: "Amsterdam", FRA: "Frankfurt", MAD: "Madrid", BCN: "Barcelona",
  LIS: "Lisbon", ZRH: "Zurich", VIE: "Vienna", DUB: "Dublin",
  ACC: "Accra", LOS: "Lagos", NBO: "Nairobi", MAN: "Manchester",
  MLE: "Male", NAP: "Naples", KEF: "Reykjavik", DPS: "Bali",
  AYT: "Antalya", SAW: "Istanbul", KIX: "Osaka",
};

const IATA_AIRPORT: Record<string, string> = {
  LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", CDG: "Charles de Gaulle",
  JFK: "John F. Kennedy", EWR: "Newark Liberty", LGA: "LaGuardia",
  LAX: "Los Angeles Intl", SFO: "San Francisco Intl", ORD: "O'Hare",
  ATL: "Hartsfield-Jackson", MIA: "Miami Intl", DFW: "Dallas/Fort Worth",
  SIN: "Changi", HND: "Haneda", NRT: "Narita", ICN: "Incheon",
  HKG: "Hong Kong Intl", BKK: "Suvarnabhumi", DXB: "Dubai Intl",
  DOH: "Hamad Intl", IST: "Istanbul", SYD: "Kingsford Smith",
  AMS: "Schiphol", FRA: "Frankfurt", FCO: "Fiumicino",
  MAD: "Barajas", BCN: "El Prat", ZRH: "Zurich",
  ACC: "Kotoka Intl", NBO: "Jomo Kenyatta", MAN: "Manchester",
  MLE: "Velana Intl", DPS: "Ngurah Rai", AYT: "Antalya",
  DEN: "Denver Intl", SEA: "Seattle-Tacoma", BOS: "Logan Intl",
  LOS: "Murtala Muhammed", DUB: "Dublin", LIS: "Humberto Delgado",
  VIE: "Vienna Intl", MEL: "Tullamarine", KIX: "Kansai Intl",
  KEF: "Keflavik", NAP: "Capodichino", SAW: "Sabiha Gokcen", ORY: "Orly",
};

const IATA_TZ: Record<string, string> = {
  LHR: "Europe/London", LGW: "Europe/London", STN: "Europe/London", MAN: "Europe/London",
  CDG: "Europe/Paris", ORY: "Europe/Paris", AMS: "Europe/Amsterdam", FRA: "Europe/Berlin",
  FCO: "Europe/Rome", NAP: "Europe/Rome", MAD: "Europe/Madrid", BCN: "Europe/Madrid",
  LIS: "Europe/Lisbon", ZRH: "Europe/Zurich", VIE: "Europe/Vienna", DUB: "Europe/Dublin",
  IST: "Europe/Istanbul", SAW: "Europe/Istanbul", AYT: "Europe/Istanbul",
  KEF: "Atlantic/Reykjavik",
  JFK: "America/New_York", EWR: "America/New_York", LGA: "America/New_York",
  BOS: "America/New_York", MIA: "America/New_York", ATL: "America/New_York",
  ORD: "America/Chicago", DFW: "America/Chicago",
  DEN: "America/Denver",
  LAX: "America/Los_Angeles", SFO: "America/Los_Angeles", SEA: "America/Los_Angeles",
  DXB: "Asia/Dubai", DOH: "Asia/Qatar",
  SIN: "Asia/Singapore", HKG: "Asia/Hong_Kong", BKK: "Asia/Bangkok",
  HND: "Asia/Tokyo", NRT: "Asia/Tokyo", KIX: "Asia/Tokyo",
  ICN: "Asia/Seoul", DPS: "Asia/Makassar",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  ACC: "Africa/Accra", LOS: "Africa/Lagos", NBO: "Africa/Nairobi",
  MLE: "Indian/Maldives",
};

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

function eventStatusPill(status: string | undefined, C: ThemeColors) {
  const s = (status || "confirmed").toLowerCase();
  if (s.includes("cancel")) return { color: C.red, bg: C.redDim, border: "rgba(239,68,68,0.25)", label: "Cancelled" };
  if (s.includes("delay")) return { color: C.amber, bg: C.amberDim, border: "rgba(245,158,11,0.25)", label: "Delayed" };
  if (s.includes("pend") || s.includes("hold")) return { color: C.amber, bg: C.amberDim, border: "rgba(245,158,11,0.25)", label: "Pending" };
  if (s.includes("done") || s.includes("complet")) return { color: C.textDim, bg: C.elevated, border: C.border, label: "Done" };
  return { color: C.teal, bg: C.tealDim, border: C.tealMid, label: "Confirmed" };
}

function parseDocFilename(filename: string, size: number) {
  const ext = filename.match(/\.[^.]+$/)?.[0] || "";
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

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

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

  if (!trip || !ev) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Event not found</Text>
          <Pressable onPress={safeBack} style={styles.errorBtn}>
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

  const sp = eventStatusPill(ev.status, C);
  const hasCoords = !!ev.locationCoords;
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

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{
        headerShown: true,
        title: "",
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: Platform.OS === "ios",
        headerBlurEffect: Platform.OS === "ios" ? (isDark ? "dark" : "light") : undefined,
        headerTintColor: "#fff",
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? {
          headerStyle: { backgroundColor: "transparent" },
          headerLeft: () => (
            <Pressable
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", marginLeft: 4 }}
              hitSlop={8}
            >
              <CaretLeft size={22} color="#fff" weight="regular" />
            </Pressable>
          ),
        } : {}),
      }} />

      <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: showActionBar ? 80 : 16 }}
      >
        {/* Hero — photo only, no overlay text */}
        <View style={styles.heroWrap}>
          {ev.image ? (
            <CachedImage uri={ev.image} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: C.card }]}>
              <Icon size={56} color={C.tealDim} weight="thin" />
            </View>
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.25)"]}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Type badge + title — below the photo */}
        <View style={styles.px}>
          <View style={[styles.typePill, { backgroundColor: C.tealDim, borderColor: C.tealMid }]}>
            <Icon size={11} color={C.teal} weight="bold" />
            <Text style={[styles.typePillText, { color: C.teal }]}>{typeLabel.toUpperCase()}</Text>
          </View>
          <Text style={[styles.titleBelow, { color: C.textPrimary }]} numberOfLines={3}>{title}</Text>
        </View>

        {/* Pill row: Status + Date + Time */}
        <Animated.View entering={FadeInDown.delay(50).duration(300)} style={styles.chipWrap}>
          <View style={[styles.statusChip, { backgroundColor: sp.bg, borderColor: sp.border }]}>
            <View style={[styles.statusDotSmall, { backgroundColor: sp.color }]} />
            <Text style={[styles.statusChipText, { color: sp.color }]}>{sp.label}</Text>
          </View>
          {ev.date && (
            <View style={[styles.chip, { backgroundColor: C.card }]}>
              <Calendar size={12} color={C.teal} weight="regular" />
              <Text style={[styles.chipText, { color: C.textPrimary }]}>{formatShortDate(ev.date)}</Text>
            </View>
          )}
          {!(isHotel && ev.isOvernight) && ev.time && (
            <View style={[styles.chip, { backgroundColor: C.card }]}>
              <Clock size={12} color={C.teal} weight="regular" />
              <Text style={[styles.chipText, { color: C.textPrimary }]}>{ev.time}{ev.endTime ? ` - ${ev.endTime}` : ""}</Text>
            </View>
          )}
        </Animated.View>

        {/* Location card */}
        {ev.location && (
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <Pressable
              onPress={() => openInMaps(ev.location, ev.locationCoords)}
              style={({ pressed }) => [styles.locationCard, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.locationIcon, { backgroundColor: C.tealDim }]}>
                <MapPin size={18} color={C.teal} weight="regular" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.locationLabel, { color: C.textTertiary }]}>Location</Text>
                <Text style={[styles.locationValue, { color: C.textPrimary }]} numberOfLines={3}>{ev.location}</Text>
              </View>
              <CaretRight size={14} color={C.textDim} weight="regular" style={{ flexShrink: 0 }} />
            </Pressable>
          </Animated.View>
        )}

        {/* Hotel check-in/out */}
        {isHotel && !ev.isOvernight && (ev.time || ev.endTime) && (
          <Animated.View entering={FadeInDown.delay(150).duration(300)}>
            <View style={[styles.checkCard, { backgroundColor: C.card }]}>
              {ev.time && (
                <View style={{ flex: 1 }}>
                  <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK IN</Text>
                  <Text style={[styles.checkValue, { color: C.textPrimary }]}>{ev.time}</Text>
                </View>
              )}
              {ev.time && ev.endTime && <ArrowRight size={16} color={C.teal} weight="regular" />}
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
          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={[styles.infoCard, { backgroundColor: C.card, padding: 0 }]}>
            {detailRows.map((row, i) => {
              const RowIcon = row.icon;
              return (
                <Pressable
                  key={i}
                  onPress={row.onPress}
                  style={[
                    styles.detailListRow,
                    i < detailRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                  ]}
                >
                  <RowIcon size={16} color={C.teal} weight="regular" />
                  <Text style={[styles.detailListLabel, { color: C.textTertiary }]}>{row.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.detailListValue, { color: C.textPrimary }]}>{row.value}</Text>
                  {row.onPress && <Copy size={12} color={C.textDim} weight="light" style={{ marginLeft: 6 }} />}
                </Pressable>
              );
            })}
          </Animated.View>
        )}

        {/* Notes / description — single section, no double label */}
        {(ev.description || ev.notes) && (
          <Animated.View entering={FadeInDown.delay(250).duration(300)} style={[styles.infoCard, { backgroundColor: C.card }]}>
            <Text style={[styles.sectionLabel, { color: C.textDim }]}>NOTES</Text>
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
          <Animated.View entering={FadeInDown.delay(300).duration(300)} style={[styles.infoCard, { backgroundColor: C.card, padding: 0 }]}>
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.xs }}>
              <Text style={[styles.sectionLabel, { color: C.textDim }]}>DOCUMENTS</Text>
            </View>
            {ev.documents!.map((doc, i) => {
              const parsed = parseDocFilename(doc.name, doc.size);
              return (
                <Pressable
                  key={doc.id}
                  onPress={() => Linking.openURL(doc.url).catch(() => {})}
                  style={({ pressed }) => [
                    styles.detailListRow,
                    { backgroundColor: pressed ? C.elevated : "transparent" },
                    i < ev.documents!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                  ]}
                >
                  <View style={[styles.docIcon, { backgroundColor: C.tealDim }]}>
                    <FileText size={16} color={C.teal} weight="regular" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.docName, { color: C.textPrimary }]} numberOfLines={1}>{parsed.label}</Text>
                    <Text style={[styles.docMeta, { color: C.textDim }]}>
                      {parsed.date ? `${parsed.date} · ` : ""}{parsed.size}
                    </Text>
                  </View>
                  <CaretRight size={14} color={C.textDim} weight="regular" />
                </Pressable>
              );
            })}
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
          <View style={styles.actionBarInner}>
            {hasCoords ? (
              <>
                <Pressable
                  onPress={() => openInMaps(ev.location, ev.locationCoords)}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1, flex: 1 }]}
                >
                  <MapPin size={16} color="#000" weight="bold" />
                  <Text style={styles.primaryBtnText}>Open in Maps</Text>
                </Pressable>
                {hasDocs && (
                  <Pressable
                    onPress={() => ev.documents?.[0] && Linking.openURL(ev.documents[0].url).catch(() => {})}
                    style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <FileText size={18} color={C.teal} weight="regular" />
                  </Pressable>
                )}
              </>
            ) : hasDocs ? (
              <Pressable
                onPress={() => ev.documents?.[0] && Linking.openURL(ev.documents[0].url).catch(() => {})}
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1, flex: 1 }]}
              >
                <FileText size={16} color="#000" weight="bold" />
                <Text style={styles.primaryBtnText}>View Documents</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      </View>
    </SafeAreaView>
  );
}

// ── Flight Detail Screen ────────────────────────────────────────────────────

function TbaText({ C }: { C: ThemeColors }) {
  return <Text style={{ color: C.textDim, fontSize: T.sm, fontWeight: T.semibold }}>TBA</Text>;
}


function FlightDetailScreen({
  ev, trip, C, isDark, isLeader, insets, router, safeBack,
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

  const depCoords = LOCATION_COORDS[depCode] as [number, number] | undefined;
  const arrCoords = LOCATION_COORDS[arrCode] as [number, number] | undefined;
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
      const dep = new Date(`${ev.date}T${depTime || "12:00"}:00`);
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
  const statusColor = statusLower.includes("cancel") ? "#ef4444"
    : statusLower.includes("delay") ? "#f59e0b" : "#22c55e";
  const statusBg = statusLower.includes("cancel") ? "rgba(239,68,68,0.12)"
    : statusLower.includes("delay") ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)";
  const statusLabel = statusLower.includes("cancel") ? "Cancelled"
    : statusLower.includes("delay") ? "Delayed"
    : (statusLower.includes("land") || statusLower.includes("arrived")) ? "Landed" : "On Time";

  const copyConf = () => {
    if (ev.confNumber) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Clipboard.setStringAsync(ev.confNumber);
    }
  };

  const fs = useMemo(() => makeFlightStyles(C), [C]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["bottom"]}>
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
            >
              <CaretLeft size={22} color={isDark ? "#fff" : "#000"} weight="regular" />
            </Pressable>
          ),
        } : {}),
      }} />

      <View style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
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
            ) : ev.image ? (
              <View style={{ height: 320 }}>
                <CachedImage uri={ev.image} style={StyleSheet.absoluteFillObject} />
                <LinearGradient
                  colors={isDark
                    ? ["#00000008", "#00000040", "#000000e8"]
                    : ["#ffffff08", "#ffffff40", "#ffffffd8"]}
                  locations={[0, 0.4, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
            ) : (
              <View style={{ height: 320, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
                <AirplaneTilt size={48} color={C.textDim} weight="thin" />
              </View>
            )}

            {/* Floating stats */}
            {(distance || bearing !== null) && (
              <View style={fs.mapStatsRow}>
                {distance ? (
                  <View style={[fs.mapStatPill, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)" }]}>
                    <Text style={[fs.mapStat, { color: isDark ? C.textSecondary : C.textTertiary }]}>
                      {distance.toLocaleString()} km
                    </Text>
                  </View>
                ) : null}
                {bearing !== null ? (
                  <View style={[fs.mapStatPill, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)" }]}>
                    <Text style={[fs.mapStat, { color: isDark ? C.textSecondary : C.textTertiary }]}>
                      {Math.round(bearing)}° {bearingLabel(bearing)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={fs.body}>
            {/* 2. Airline row */}
            <Animated.View entering={FadeInDown.delay(20).duration(400)} style={fs.airlineRow}>
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
            <Animated.View entering={FadeInDown.delay(50).duration(400)}>
              <Text style={[fs.routeTitle, { color: C.textPrimary }]}>
                {depCity || depCode || "---"}
                <Text style={{ color: C.teal }}> → </Text>
                {arrCity || arrCode || "---"}
              </Text>
              <Text style={[fs.routeSub, { color: C.textTertiary }]}>
                {depCode || "---"} · {depAirportName || "---"}  →  {arrCode || "---"} · {arrAirportName || "---"}
              </Text>
            </Animated.View>

            {/* 4. Status pills */}
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={fs.pillRow}>
              {ev.status && (
                <View style={[fs.pill, { backgroundColor: statusBg }]}>
                  {(statusLabel === "On Time" || statusLabel === "Landed") && (
                    <View style={[fs.statusDot, { backgroundColor: statusColor }]} />
                  )}
                  <Text style={[fs.pillText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              )}
              {countdown && (
                <View style={[fs.pill, { backgroundColor: C.elevated }]}>
                  <Timer size={12} color={C.textSecondary} weight="bold" />
                  <Text style={[fs.pillText, { color: C.textSecondary }]}>Departs in {countdown}</Text>
                </View>
              )}
            </Animated.View>

            {/* 5. Times card */}
            <Animated.View entering={FadeInDown.delay(150).duration(400)} style={[fs.card, { backgroundColor: C.card }]}>
              <View style={fs.timesRow}>
                {/* Departure */}
                <View style={{ flex: 1 }}>
                  <Text style={[fs.bigTime, { color: C.textPrimary }]}>{depTime || "--:--"}</Text>
                  {depTz && (
                    <Text style={[fs.tzLabel, { color: C.textDim }]}>
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
                        <Text style={[fs.plusOneText, { color: C.teal }]}>+{dayOffset}</Text>
                      </View>
                    )}
                  </View>
                  {arrTz && (
                    <Text style={[fs.tzLabel, { color: C.textDim }]}>
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
                    <Text style={[fs.dateColLabel, { color: C.textDim }]}>DEPARTURE</Text>
                    <Text style={[fs.dateText, { color: C.textTertiary }]}>{formatShortDate(ev.date)}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[fs.dateColLabel, { color: C.textDim }]}>ARRIVAL</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[fs.dateText, { color: C.textTertiary }]}>
                        {formatShortDate(arrivalDate)}
                      </Text>
                      {dayOffset > 0 && (
                        <View style={[fs.plusOneBadge, { backgroundColor: C.tealDim }]}>
                          <Text style={[fs.plusOneText, { color: C.teal }]}>+{dayOffset}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </Animated.View>

            {/* 6. Terminal pair */}
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={fs.termRow}>
              <View style={[fs.termCard, { backgroundColor: C.card }]}>
                <View style={fs.termHeader}>
                  <AirplaneTakeoff size={13} color={C.teal} weight="bold" />
                  <Text style={[fs.termHeaderText, { color: C.textTertiary }]}>DEPARTURE</Text>
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textDim }]}>Terminal</Text>
                  {(live?.terminal || ev.terminal) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{(live?.terminal || ev.terminal || "").replace(/^T/i, "")}</Text>
                  ) : <TbaText C={C} />}
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textDim }]}>Gate</Text>
                  {(live?.gate || ev.gate) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{live?.gate || ev.gate}</Text>
                  ) : <TbaText C={C} />}
                </View>
              </View>

              <View style={[fs.termCard, { backgroundColor: C.card }]}>
                <View style={fs.termHeader}>
                  <AirplaneLanding size={13} color={C.teal} weight="bold" />
                  <Text style={[fs.termHeaderText, { color: C.textTertiary }]}>ARRIVAL</Text>
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textDim }]}>Terminal</Text>
                  {(live?.arrTerminal || ev.arrTerminal) ? (
                    <Text style={[fs.termFieldValue, { color: C.textPrimary }]}>{(live?.arrTerminal || ev.arrTerminal || "").replace(/^T/i, "")}</Text>
                  ) : <TbaText C={C} />}
                </View>
                <View style={fs.termField}>
                  <Text style={[fs.termFieldLabel, { color: C.textDim }]}>Belt</Text>
                  <TbaText C={C} />
                </View>
              </View>
            </Animated.View>

            {/* 7. Details list */}
            <Animated.View entering={FadeInDown.delay(250).duration(400)} style={[fs.card, { backgroundColor: C.card, padding: 0 }]}>
              {[
                { icon: AirplaneTilt, label: "Aircraft", value: live?.aircraft || ev.aircraft || null },
                distance ? { icon: Ruler, label: "Distance", value: `${distance.toLocaleString()} km` } : null,
                isLeader && ev.confNumber ? { icon: Hash, label: "Booking ref", value: ev.confNumber, onPress: copyConf } : null,
                ev.seatDetails ? { icon: Armchair, label: "Seat", value: ev.seatDetails } : null,
              ].filter(Boolean).map((item: any, i, arr) => (
                <Pressable
                  key={i}
                  onPress={item.onPress}
                  style={[
                    fs.detailRow,
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
                  ]}
                >
                  <item.icon size={16} color={C.teal} weight="regular" />
                  <Text style={[fs.detailLabel, { color: C.textTertiary }]}>{item.label}</Text>
                  <View style={{ flex: 1 }} />
                  {item.value ? (
                    <Text style={[fs.detailValue, { color: C.textPrimary }]}>{item.value}</Text>
                  ) : <TbaText C={C} />}
                  {item.onPress && <Copy size={12} color={C.textDim} weight="light" style={{ marginLeft: 6 }} />}
                </Pressable>
              ))}
            </Animated.View>

            {/* Documents */}
            {ev.documents && ev.documents.length > 0 && (
              <View>
                <Text style={[fs.sectionHead, { color: C.teal }]}>DOCUMENTS</Text>
                {ev.documents.map(doc => (
                  <Pressable
                    key={doc.id}
                    onPress={() => Linking.openURL(doc.url).catch(() => {})}
                    style={({ pressed }) => [fs.docRow, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <View style={[fs.docIcon, { backgroundColor: C.tealDim }]}>
                      <FileText size={14} color={C.teal} weight="regular" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[{ fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary }]} numberOfLines={1}>{doc.name}</Text>
                      <Text style={{ fontSize: T.xs, color: C.textTertiary }}>{Math.round(doc.size / 1024)} KB</Text>
                    </View>
                    <CaretRight size={12} color={C.textDim} weight="regular" />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}

// ── Flight styles ───────────────────────────────────────────────────────────

function makeFlightStyles(C: ThemeColors) {
  return StyleSheet.create({
    mapStatsRow: {
      position: "absolute", bottom: S.xs, left: S.md, right: S.md,
      flexDirection: "row", justifyContent: "space-between",
    },
    mapStatPill: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.sm,
    },
    mapStat: {
      fontSize: T.xs, fontWeight: T.semibold, letterSpacing: 0.5,
      fontVariant: ["tabular-nums"],
    },

    body: { paddingHorizontal: S.lg, paddingTop: S.lg, gap: S.md },

    airlineRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
    airlineTile: {
      width: 40, height: 40, borderRadius: R.md,
      backgroundColor: "#fff",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      alignItems: "center", justifyContent: "center",
    },
    airlineIata: { fontSize: T.xs, fontWeight: T.black, color: "#111", letterSpacing: 0.5 },
    airlineLogo: { width: 30, height: 30, borderRadius: 4 },
    airlineName: { fontSize: T.sm, fontWeight: T.bold },
    flightNum: { fontSize: T.xs, fontWeight: T.medium, letterSpacing: 0.3, marginTop: 1 },

    routeTitle: { fontSize: 28, fontWeight: T.extrabold, letterSpacing: -0.5, lineHeight: 34 },
    routeSub: { fontSize: T.xs, fontWeight: T.medium, letterSpacing: 0.2, marginTop: 4 },

    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: S.xs },
    pill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: T.xs, fontWeight: T.bold, letterSpacing: 0.3 },

    card: { borderRadius: R.xl, padding: S.lg },

    timesRow: { flexDirection: "row", alignItems: "flex-start" },
    bigTime: {
      fontSize: 32, fontWeight: T.bold, lineHeight: 36,
      fontVariant: ["tabular-nums"], letterSpacing: -0.5,
    },
    tzLabel: { fontSize: 10, fontWeight: T.medium, letterSpacing: 0.5, marginTop: 4, fontVariant: ["tabular-nums"] },
    airportCode: { fontSize: T.xs, fontWeight: T.medium, marginTop: 6 },
    airportName: { fontSize: T.xs, marginTop: 2 },
    arcConnector: { alignItems: "center", justifyContent: "center", paddingHorizontal: S.sm, paddingTop: 8 },
    arcLineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dashLine: { width: 20, height: 0, borderTopWidth: 1, borderStyle: "dashed" },
    durLabel: { fontSize: 10, fontWeight: T.bold, letterSpacing: 0.3, marginTop: 6 },
    plusOneBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
    plusOneText: { fontSize: 10, fontWeight: T.bold },

    dateRow: {
      flexDirection: "row", justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: S.md, paddingTop: S.sm,
    },
    dateText: { fontSize: T.xs, fontWeight: T.medium },

    termRow: { flexDirection: "row", gap: S.sm },
    termCard: { flex: 1, borderRadius: R.lg, padding: S.md },
    termHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: S.sm },
    termHeaderText: { fontSize: 9, fontWeight: T.black, letterSpacing: 1.2 },
    termField: { marginBottom: S.xs },
    termFieldLabel: { fontSize: 9, fontWeight: T.bold, letterSpacing: 0.5, marginBottom: 2 },
    termFieldValue: { fontSize: T.sm, fontWeight: T.bold },

    detailRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.lg, paddingVertical: 14,
    },
    detailLabel: { fontSize: T.sm, fontWeight: T.medium },
    detailValue: { fontSize: T.sm, fontWeight: T.semibold, fontVariant: ["tabular-nums"] },

    sectionHead: { fontSize: 10, fontWeight: T.bold, letterSpacing: 1, marginBottom: S.xs },
    docRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      padding: S.md, borderRadius: R.lg, marginBottom: 4,
    },
    docIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

    dateColLabel: { fontSize: 9, fontWeight: T.bold, letterSpacing: 1, marginBottom: 4 },
  });
}

// ── Non-flight styles ───────────────────────────────────────────────────────

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.bg, fontWeight: "700", fontSize: T.base },
    px: { paddingHorizontal: S.lg, marginBottom: S.md },

    heroWrap: { position: "relative", height: 280, marginBottom: 0 },
    heroImage: {
      width: "100%", height: "100%",
      alignItems: "center", justifyContent: "center",
    },
    typePill: {
      flexDirection: "row", alignItems: "center", gap: 5,
      alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full,
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: S.lg, marginBottom: S.sm,
    },
    typePillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
    titleBelow: {
      fontSize: T["2xl"], fontWeight: "700",
      letterSpacing: -0.3, lineHeight: 30,
      marginBottom: S.md,
    },

    chipWrap: {
      flexDirection: "row", flexWrap: "wrap", gap: 8,
      paddingHorizontal: S.lg, marginBottom: S.md,
    },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.full,
      maxWidth: "100%",
    },
    chipText: { fontSize: T.sm, fontWeight: "600" },

    statusChip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statusDotSmall: { width: 5, height: 5, borderRadius: 3 },
    statusChipText: { fontSize: 10.5, fontWeight: "600" },

    locationCard: {
      flexDirection: "row", alignItems: "flex-start", gap: S.sm,
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.md, borderRadius: R.xl,
    },
    locationIcon: {
      width: 32, height: 32, borderRadius: R.md,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    locationLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginBottom: 2 },
    locationValue: { fontSize: T.sm, fontWeight: "600", lineHeight: 18 },

    checkCard: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.lg, borderRadius: R.xl,
    },
    checkLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    checkValue: { fontSize: T.base, fontWeight: "700" },

    infoCard: {
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.lg, borderRadius: R.xl,
    },
    infoValue: { fontSize: T.sm, lineHeight: 20, fontWeight: "400" },

    sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: S.sm },

    detailListRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.lg, paddingVertical: S.sm + 2,
    },
    detailListLabel: { fontSize: T.sm, fontWeight: "500" },
    detailListValue: { fontSize: T.sm, fontWeight: "600" },

    docIcon: {
      width: 40, height: 40, borderRadius: R.lg,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.06)",
    },
    docName: { fontSize: T.sm, fontWeight: "600" },
    docMeta: {
      fontSize: 10.5, fontWeight: "500", marginTop: 2,
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
      paddingHorizontal: S.lg, paddingVertical: S.md,
      backgroundColor: C.bg,
    },
    primaryBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 16, borderRadius: R.xl,
    },
    primaryBtnText: { fontSize: T.base, fontWeight: "800", color: "#000" },
    secondaryBtn: {
      width: 52, height: 52, borderRadius: R.xl,
      alignItems: "center", justifyContent: "center",
    },
  });
}
