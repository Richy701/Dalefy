import {
  View, Text, ScrollView, Pressable, Linking,
  StyleSheet, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  Airplane, AirplaneTilt, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  MapPin, Clock, Hash, FileText, NavigationArrow,
  Calendar, Users, ArrowRight, Copy, CaretRight, CaretLeft,
  AirplaneTakeoff, AirplaneLanding, Timer, Armchair, Door,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, F, type ThemeColors, eventColor } from "@/constants/theme";
import { useMemo, useCallback } from "react";
import type { TravelEvent } from "@/shared/types";

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

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, hotel: Bed, activity: Compass, dining: ForkKnife, transfer: Car,
};

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity", dining: "Dining", transfer: "Transfer",
};

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

  const transferIcons: Record<string, React.ComponentType<any>> = { car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor, other: Compass };
  const transferLabels: Record<string, string> = { car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise", other: "Transfer" };
  const color = eventColor(ev.type, C);
  const Icon = ev.type === "transfer" ? (transferIcons[ev.transferType || "car"] || Car) : (TYPE_ICONS[ev.type] ?? Compass);
  const typeLabel = ev.type === "transfer" ? (transferLabels[ev.transferType || "car"] || "Transfer") : (TYPE_LABELS[ev.type] ?? "Event");

  const copyConf = () => {
    if (ev.confNumber) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Clipboard.setStringAsync(ev.confNumber);
    }
  };

  const isFlight = ev.type === "flight";
  const isHotel = ev.type === "hotel";

  // Build compact detail chips (skip flight-specific ones - handled in FlightRoute)
  const chips: Array<{ icon: React.ComponentType<any>; text: string }> = [];
  if (ev.date) chips.push({ icon: Calendar, text: formatDate(ev.date) });
  if (!isFlight && !(isHotel && ev.isOvernight) && ev.time) chips.push({ icon: Clock, text: ev.time + (ev.endTime ? ` - ${ev.endTime}` : "") });
  if (!isFlight && ev.duration) chips.push({ icon: Clock, text: ev.duration });
  if (isLeader && ev.supplier) chips.push({ icon: Users, text: ev.supplier });
  if (!isFlight && ev.terminal) chips.push({ icon: NavigationArrow, text: `Terminal ${ev.terminal}` });
  if (!isFlight && ev.gate) chips.push({ icon: NavigationArrow, text: `Gate ${ev.gate}` });
  if (!isFlight && ev.seatDetails) chips.push({ icon: Users, text: `Seat ${ev.seatDetails}` });
  if (ev.roomType) chips.push({ icon: Bed, text: ev.roomType });
  if (ev.price) chips.push({ icon: Hash, text: ev.price });

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
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {/* ── Hero with gradient overlay ── */}
        <View style={styles.heroWrap}>
          {ev.image ? (
            <CachedImage uri={ev.image} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: "#111" }]}>
              <Icon size={56} color={`${color}22`} weight="thin" />
            </View>
          )}
          <LinearGradient
            colors={["#00000008", "#00000040", "#000000e8"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={["#00000025", "transparent"]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Title over gradient */}
          <View style={styles.heroContent}>
            <View style={[styles.typePill, { backgroundColor: `${color}25` }]}>
              <Icon size={11} color={color} weight="bold" />
              <Text style={[styles.typePillText, { color }]}>{typeLabel.toUpperCase()}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={3}>{ev.title}</Text>
            {ev.airline && (
              <Text style={styles.heroSub}>
                {ev.airline}{ev.flightNum ? ` · ${ev.flightNum}` : ""}
              </Text>
            )}
          </View>
        </View>

        {/* ── Flight route ── */}
        {ev.type === "flight" && (
          <FlightRoute ev={ev} C={C} color={color} />
        )}

        {/* ── Quick info chips ── */}
        {chips.length > 0 && (
          <View style={styles.chipWrap}>
            {chips.map((chip, i) => {
              const ChipIcon = chip.icon;
              return (
                <View key={i} style={[styles.chip, { backgroundColor: C.card }]}>
                  <ChipIcon size={12} color={color} weight="regular" />
                  <Text style={[styles.chipText, { color: C.textPrimary }]}>{chip.text}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Status badge (non-flight only, flights show inline) ── */}
        {!isFlight && ev.status && (() => {
          const sl = ev.status.toLowerCase();
          const sc = sl.includes("cancel") ? "#ef4444" : sl.includes("delay") ? "#f59e0b" : "#22c55e";
          return (
            <View style={styles.px}>
              <View style={[styles.statusPill, { backgroundColor: `${sc}15` }]}>
                <View style={[styles.statusDotSmall, { backgroundColor: sc }]} />
                <Text style={[styles.statusPillText, { color: sc }]}>{ev.status}</Text>
              </View>
            </View>
          );
        })()}

        {/* ── Location card ── */}
        {ev.location && ev.type !== "flight" && (
          <Pressable
            onPress={() => openInMaps(ev.location, ev.locationCoords)}
            style={({ pressed }) => [styles.locationCard, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.locationIcon, { backgroundColor: `${color}15` }]}>
              <MapPin size={18} color={color} weight="regular" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.locationLabel, { color: C.textTertiary }]}>Location</Text>
              <Text style={[styles.locationValue, { color: C.textPrimary }]} numberOfLines={3}>{ev.location}</Text>
            </View>
            <CaretRight size={14} color={C.textDim} weight="regular" style={{ flexShrink: 0 }} />
          </Pressable>
        )}

        {/* ── Check-in / Check-out times ── */}
        {isHotel && !ev.isOvernight && (ev.checkin || ev.checkout) && (ev.time || ev.endTime) && (
          <View style={[styles.checkCard, { backgroundColor: C.card }]}>
            {ev.time && (
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK IN</Text>
                <Text style={[styles.checkValue, { color: C.textPrimary }]}>{ev.time}</Text>
              </View>
            )}
            {ev.time && ev.endTime && (
              <ArrowRight size={16} color={color} weight="regular" />
            )}
            {ev.endTime && (
              <View style={{ flex: 1, alignItems: ev.time ? "flex-end" as const : "flex-start" as const }}>
                <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK OUT</Text>
                <Text style={[styles.checkValue, { color: C.textPrimary }]}>{ev.endTime}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Confirmation number (tap to copy) ── */}
        {isLeader && ev.confNumber && (
          <Pressable onPress={copyConf} style={({ pressed }) => [styles.confCard, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.confLabel, { color: C.textTertiary }]}>CONFIRMATION</Text>
              <Text style={[styles.confValue, { color: C.teal }]}>{ev.confNumber}</Text>
            </View>
            <Copy size={16} color={C.textDim} weight="light" />
          </Pressable>
        )}

        {/* ── Information ── */}
        {(() => {
          const infoRows: Array<{ label: string; value: string }> = [];
          if (ev.description) infoRows.push({ label: "Description", value: ev.description });
          if (ev.notes) infoRows.push({ label: "Notes", value: ev.notes });
          if (isLeader && ev.supplier) infoRows.push({ label: "Supplier", value: ev.supplier });
          if (isLeader && ev.confNumber) infoRows.push({ label: "Confirmation", value: ev.confNumber });
          if (ev.price) infoRows.push({ label: "Price", value: ev.price });
          if (ev.roomType) infoRows.push({ label: "Room Type", value: ev.roomType });
          if (ev.seatDetails) infoRows.push({ label: "Seat", value: ev.seatDetails });
          if (ev.duration && !isFlight) infoRows.push({ label: "Duration", value: ev.duration });
          if (!infoRows.length) return null;
          return (
            <View style={[styles.infoCard, { backgroundColor: C.card }]}>
              <Text style={[styles.textCardLabel, { color }]}>INFORMATION</Text>
              {infoRows.map((row, i) => (
                <View key={i} style={[styles.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                  <Text style={[styles.infoLabel, { color: C.textTertiary }]}>{row.label}</Text>
                  <Text style={[styles.infoValue, { color: C.textPrimary }]} selectable>{row.value}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        {/* ── Documents ── */}
        {ev.documents && ev.documents.length > 0 && (
          <View style={styles.px}>
            <Text style={[styles.sectionLabel, { color }]}>DOCUMENTS</Text>
            {ev.documents.map(doc => (
              <Pressable
                key={doc.id}
                onPress={() => Linking.openURL(doc.url).catch(() => {})}
                style={({ pressed }) => [styles.docRow, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={[styles.docIcon, { backgroundColor: `${color}15` }]}>
                  <FileText size={14} color={color} weight="regular" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.docName, { color: C.textPrimary }]} numberOfLines={1}>{doc.name}</Text>
                  <Text style={[styles.docSize, { color: C.textTertiary }]}>
                    {Math.round(doc.size / 1024)} KB
                  </Text>
                </View>
                <CaretRight size={12} color={C.textDim} weight="regular" />
              </Pressable>
            ))}
          </View>
        )}

      </ScrollView>

      {ev.location && ev.type !== "flight" && (
        <Pressable
          onPress={() => openInMaps(ev.location, ev.locationCoords)}
          style={({ pressed }) => [styles.mapsBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1 }]}
        >
          <MapPin size={16} color="#000" weight="regular" />
          <Text style={styles.mapsBtnText}>Open in Maps</Text>
        </Pressable>
      )}
      </View>
    </SafeAreaView>
  );
}

// ── Flight route visual ─────────────────────────────────────────────────────
function parseFlightCities(title: string): { from: string; to: string } {
  const toMatch = title.match(/(?:^[A-Z]{2}\d+\s*[—\-–]\s*)?(.+?)\s+to\s+(.+?)(?:\s*\(.*\))?$/i);
  if (toMatch) return { from: toMatch[1].trim(), to: toMatch[2].trim().replace(/\s*\(.*\)$/, "") };
  const arrowMatch = title.match(/^(.+?)\s*[→➜>]\s*(.+)$/);
  if (arrowMatch) return { from: arrowMatch[1].trim(), to: arrowMatch[2].trim() };
  return { from: title, to: "" };
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

function FlightRoute({ ev, C, color }: { ev: TravelEvent; C: ThemeColors; color: string }) {
  let depCode = ev.depAirport?.trim().toUpperCase() || "";
  let arrCode = ev.arrAirport?.trim().toUpperCase() || "";

  if ((!depCode || !arrCode) && ev.location) {
    const locMatch = ev.location.match(/^([A-Z]{3})\s+to\s+([A-Z]{3})$/i);
    if (locMatch) {
      if (!depCode) depCode = locMatch[1].toUpperCase();
      if (!arrCode) arrCode = locMatch[2].toUpperCase();
    }
  }

  const hasIata = depCode.length >= 3 && arrCode.length >= 3;
  let cities = parseFlightCities(ev.title || "");
  if (!cities.to && ev.location) {
    cities = parseFlightCities(ev.location);
  }
  const countdown = ev.date ? getCountdown(ev.date, ev.time) : null;

  const statusLower = (ev.status || "").toLowerCase();
  const statusColor = statusLower.includes("cancel") ? "#ef4444"
    : statusLower.includes("delay") ? "#f59e0b" : "#22c55e";
  const statusBg = statusLower.includes("cancel") ? "rgba(239,68,68,0.12)"
    : statusLower.includes("delay") ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)";
  const statusLabel = statusLower.includes("cancel") ? "Cancelled"
    : statusLower.includes("delay") ? "Delayed"
    : statusLower.includes("land") ? "Landed" : "On Time";

  if (!hasIata && !cities.to) return null;

  const flightLabel = ev.flightNum || (ev.airline ? ev.airline : "");

  const detailItems: Array<{ icon: React.ComponentType<any>; label: string; value: string }> = [];
  if (ev.terminal) detailItems.push({ icon: Door, label: "Terminal", value: ev.terminal });
  if (ev.gate) detailItems.push({ icon: NavigationArrow, label: "Gate", value: ev.gate });
  if (ev.seatDetails) detailItems.push({ icon: Armchair, label: "Seat", value: ev.seatDetails });

  return (
    <View style={[frs.card, { backgroundColor: C.card }]}>
      {/* Status + Countdown row */}
      <View style={frs.topRow}>
        {ev.status && (
          <View style={[frs.statusPill, { backgroundColor: statusBg }]}>
            <View style={[frs.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[frs.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        )}
        {countdown && (
          <View style={[frs.countdownPill, { backgroundColor: C.tealDim }]}>
            <Timer size={11} color={C.teal} weight="bold" />
            <Text style={[frs.countdownText, { color: C.teal }]}>in {countdown}</Text>
          </View>
        )}
      </View>

      {/* Route — Tripsy style */}
      <View style={frs.routeRow}>
        <View style={frs.endpoint}>
          {hasIata ? (
            <>
              <Text style={[frs.cityName, { color: C.textSecondary }]} numberOfLines={1}>{cities.from}</Text>
              <Text style={[frs.iata, { color: C.textPrimary }]}>{depCode.slice(0, 3)}</Text>
            </>
          ) : (
            <Text style={[frs.iata, { color: C.textPrimary, fontSize: 24 }]} numberOfLines={1}>{cities.from}</Text>
          )}
          {ev.time && <Text style={[frs.time, { color: C.textTertiary }]}>{ev.time}</Text>}
        </View>

        <View style={frs.connector}>
          {flightLabel ? <Text style={[frs.flightNum, { color: C.textTertiary }]}>{flightLabel}</Text> : null}
          <View style={frs.lineRow}>
            <View style={[frs.line, { backgroundColor: C.flight + "55" }]} />
            <View style={[frs.line, { backgroundColor: C.flight + "55" }]} />
            <View style={frs.planeAbsolute}>
              <Airplane size={18} color={C.flight} weight="fill" style={{ transform: [{ rotate: "90deg" }] }} />
            </View>
          </View>
          {ev.duration && <Text style={[frs.durationText, { color: C.textTertiary }]}>{ev.duration}</Text>}
        </View>

        <View style={[frs.endpoint, { alignItems: "flex-end" }]}>
          {hasIata ? (
            <>
              <Text style={[frs.cityName, { color: C.textSecondary, textAlign: "right" }]} numberOfLines={1}>{cities.to}</Text>
              <Text style={[frs.iata, { color: C.textPrimary }]}>{arrCode.slice(0, 3)}</Text>
            </>
          ) : (
            <Text style={[frs.iata, { color: C.textPrimary, fontSize: 24, textAlign: "right" }]} numberOfLines={1}>{cities.to}</Text>
          )}
          {ev.endTime && <Text style={[frs.time, { color: C.textTertiary }]}>{ev.endTime}</Text>}
        </View>
      </View>

      {/* Detail grid */}
      {detailItems.length > 0 && (
        <View style={[frs.detailGrid, { borderTopColor: C.border }]}>
          {detailItems.map((item, i) => (
            <View key={i} style={frs.detailCell}>
              <Text style={[frs.detailLabel, { color: C.textTertiary }]}>{item.label}</Text>
              <Text style={[frs.detailValue, { color: C.textPrimary }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const frs = StyleSheet.create({
  card: {
    marginHorizontal: S.lg, marginBottom: S.md,
    borderRadius: R.xl, padding: S.lg, overflow: "hidden",
  },
  topRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: S.md,
  },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  countdownPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full,
  },
  countdownText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  routeRow: {
    flexDirection: "row", alignItems: "stretch",
    marginBottom: 4,
  },
  endpoint: { flex: 1 },
  cityName: { fontSize: T.base, fontWeight: "400", marginBottom: 2 },
  iata: { fontSize: 34, fontWeight: "800", letterSpacing: -0.5, lineHeight: 38 },
  time: { fontSize: T.base, fontWeight: "500", marginTop: 6 },
  connector: {
    flex: 1.1, alignItems: "center", justifyContent: "space-between",
  },
  flightNum: { fontSize: T.sm, fontWeight: "500", letterSpacing: 0.3, marginBottom: 8 },
  lineRow: {
    flexDirection: "row", alignItems: "center",
    width: "100%", height: 22, position: "relative" as const,
  },
  line: { flex: 1, height: 3, borderRadius: 2 },
  planeAbsolute: {
    position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  durationText: { fontSize: T.sm, fontWeight: "500", marginTop: 8 },
  detailGrid: {
    flexDirection: "row", flexWrap: "wrap",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: S.md, paddingTop: S.md,
    gap: 4,
  },
  detailCell: {
    width: "47%", paddingVertical: 4,
  },
  detailLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, color: "#888", marginBottom: 2 },
  detailValue: { fontSize: 16, fontWeight: "700" },
});

// ── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.bg, fontWeight: "700", fontSize: T.base },
    px: { paddingHorizontal: S.lg, marginBottom: S.md },

    // Hero
    heroWrap: { position: "relative", height: 340, marginBottom: S.md },
    heroImage: {
      width: "100%", height: "100%",
      alignItems: "center", justifyContent: "center",
    },
    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.lg, paddingBottom: S.lg,
    },
    typePill: {
      flexDirection: "row", alignItems: "center", gap: 5,
      alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full,
      marginBottom: S.sm,
    },
    typePillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
    heroTitle: {
      fontSize: 20, fontWeight: "700", color: "#fff",
      letterSpacing: -0.2, lineHeight: 26,
    },
    heroSub: { fontSize: T.base, fontWeight: "500", color: "rgba(255,255,255,0.7)", marginTop: 4 },

    // Chips
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

    // Status
    statusPill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.full,
    },
    statusDotSmall: { width: 6, height: 6, borderRadius: 3 },
    statusPillText: { fontSize: T.xs, fontWeight: "700", letterSpacing: 0.3 },

    // Location
    locationCard: {
      flexDirection: "row", alignItems: "flex-start", gap: S.sm,
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.md, borderRadius: R.xl,
    },
    locationIcon: {
      width: 32, height: 32, borderRadius: R.md,
      alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    },
    locationLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginBottom: 2 },
    locationValue: { fontSize: T.sm, fontWeight: "600", lineHeight: 18 },

    // Check-in/out
    checkCard: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.lg, borderRadius: R.xl,
    },
    checkLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    checkValue: { fontSize: T.base, fontWeight: "700" },

    // Confirmation
    confCard: {
      flexDirection: "row", alignItems: "center",
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.lg, borderRadius: R.xl, gap: S.sm,
    },
    confLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    confValue: { fontSize: 20, fontWeight: "700", letterSpacing: 2 },

    // Text cards
    textCard: {
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.lg, borderRadius: R.xl,
    },
    textCardLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    textBody: { fontSize: T.base, lineHeight: 24, fontWeight: "400" },

    // Information card
    infoCard: {
      marginHorizontal: S.lg, marginBottom: S.md,
      padding: S.lg, borderRadius: R.xl,
    },
    infoRow: {
      paddingVertical: 10,
    },
    infoLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: 4 },
    infoValue: { fontSize: T.sm, lineHeight: 20, fontWeight: "400" },

    // Documents
    sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: S.sm },
    docRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      padding: S.md, borderRadius: R.lg, marginBottom: 4,
    },
    docIcon: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: "center", justifyContent: "center",
    },
    docName: { flex: 1, fontSize: T.sm, fontWeight: "600" },
    docSize: { fontSize: T.xs, fontWeight: "500" },

    // Maps button
    mapsBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, marginHorizontal: S.lg, marginBottom: S.md,
      paddingVertical: 16, borderRadius: R.xl,
    },
    mapsBtnText: { fontSize: T.base, fontWeight: "800", color: "#000" },
  });
}
