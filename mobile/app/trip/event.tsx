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
  AirplaneTilt, Bed, Compass, ForkKnife, Car,
  MapPin, Clock, Hash, FileText, NavigationArrow,
  Calendar, Users, ArrowRight, Copy, CaretRight, CaretLeft,
  AirplaneTakeoff, AirplaneLanding, Timer, Armchair, Door,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import Svg, { Path } from "react-native-svg";
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

  const color = eventColor(ev.type, C);
  const Icon = TYPE_ICONS[ev.type] ?? Compass;
  const typeLabel = TYPE_LABELS[ev.type] ?? "Event";

  const copyConf = () => {
    if (ev.confNumber) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Clipboard.setStringAsync(ev.confNumber);
    }
  };

  const isFlight = ev.type === "flight";

  // Build compact detail chips (skip flight-specific ones - handled in FlightRoute)
  const chips: Array<{ icon: React.ComponentType<any>; text: string }> = [];
  if (ev.date) chips.push({ icon: Calendar, text: formatDate(ev.date) });
  if (!isFlight && ev.time) chips.push({ icon: Clock, text: ev.time + (ev.endTime ? ` - ${ev.endTime}` : "") });
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
            <View style={[styles.heroImage, { backgroundColor: C.card }]}>
              <Icon size={48} color={`${color}33`} weight="thin" />
            </View>
          )}
          <LinearGradient
            colors={["transparent", `${C.bg}CC`, C.bg]}
            locations={[0.3, 0.7, 1]}
            style={styles.heroGradient}
          />
          {/* Title over gradient */}
          <View style={styles.heroContent}>
            <View style={[styles.typePill, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
              <Icon size={12} color="#fff" weight="bold" />
              <Text style={[styles.typePillText, { color: "#fff" }]}>{typeLabel.toUpperCase()}</Text>
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
        {!isFlight && ev.status && (
          <View style={styles.px}>
            <View style={[styles.statusRow, { backgroundColor: C.card }]}>
              <View style={[styles.statusDot, {
                backgroundColor: ev.status.toLowerCase().includes("cancel") ? "#ef4444"
                  : ev.status.toLowerCase().includes("delay") ? "#f59e0b" : "#22c55e"
              }]} />
              <Text style={[styles.statusText, { color: C.textPrimary }]}>{ev.status}</Text>
            </View>
          </View>
        )}

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

        {/* ── Check-in / Check-out ── */}
        {(ev.checkin || ev.checkout) && (
          <View style={[styles.checkCard, { backgroundColor: C.card }]}>
            {ev.checkin && (
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK IN</Text>
                <Text style={[styles.checkValue, { color: C.textPrimary }]}>{formatDate(ev.checkin)}</Text>
              </View>
            )}
            {ev.checkin && ev.checkout && (
              <ArrowRight size={16} color={color} weight="regular" />
            )}
            {ev.checkout && (
              <View style={{ flex: 1, alignItems: ev.checkin ? "flex-end" as const : "flex-start" as const }}>
                <Text style={[styles.checkLabel, { color: C.textTertiary }]}>CHECK OUT</Text>
                <Text style={[styles.checkValue, { color: C.textPrimary }]}>{formatDate(ev.checkout)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Confirmation number ── */}
        {isLeader && ev.confNumber && (
          <Pressable onPress={copyConf} style={({ pressed }) => [styles.confCard, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.confLabel, { color: C.textTertiary }]}>CONFIRMATION</Text>
              <Text style={[styles.confValue, { color: C.teal }]}>{ev.confNumber}</Text>
            </View>
            <Copy size={16} color={C.textDim} weight="light" />
          </Pressable>
        )}

        {/* ── Description ── */}
        {ev.description && (
          <View style={[styles.textCard, { backgroundColor: C.card }]}>
            <Text style={[styles.textBody, { color: C.textSecondary }]}>{ev.description}</Text>
          </View>
        )}

        {/* ── Notes (leader only) ── */}
        {isLeader && ev.notes && (
          <View style={[styles.textCard, { backgroundColor: C.card }]}>
            <Text style={[styles.textCardLabel, { color: C.textTertiary }]}>NOTES</Text>
            <Text style={[styles.textBody, { color: C.textSecondary }]}>{ev.notes}</Text>
          </View>
        )}

        {/* ── Documents (leader only) ── */}
        {isLeader && ev.documents && ev.documents.length > 0 && (
          <View style={styles.px}>
            <Text style={[styles.sectionLabel, { color: C.textTertiary }]}>DOCUMENTS</Text>
            {ev.documents.map(doc => (
              <Pressable
                key={doc.id}
                onPress={() => Linking.openURL(doc.url).catch(() => {})}
                style={({ pressed }) => [styles.docRow, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}
              >
                <FileText size={14} color={C.teal} weight="light" />
                <Text style={[styles.docName, { color: C.textPrimary }]} numberOfLines={1}>{doc.name}</Text>
                <Text style={[styles.docSize, { color: C.textTertiary }]}>
                  {Math.round(doc.size / 1024)} KB
                </Text>
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

function FlightArc({ color, planeColor }: { color: string; planeColor: string }) {
  return (
    <View style={{ width: "100%", height: 40, alignItems: "center", justifyContent: "center" }}>
      <Svg width="100%" height={40} viewBox="0 0 200 40" preserveAspectRatio="none">
        <Path
          d="M 10 32 Q 100 -8 190 32"
          stroke={color}
          weight="light"
          strokeDasharray="4,4"
          fill="none"
          opacity={0.5}
        />
      </Svg>
      <View style={{
        position: "absolute",
        top: 4,
        backgroundColor: "transparent",
        transform: [{ rotate: "45deg" }],
      }}>
        <AirplaneTilt size={14} color={planeColor} weight="fill" />
      </View>
    </View>
  );
}

function FlightRoute({ ev, C, color }: { ev: TravelEvent; C: ThemeColors; color: string }) {
  const depCode = ev.depAirport?.trim().toUpperCase() || "";
  const arrCode = ev.arrAirport?.trim().toUpperCase() || "";
  const hasIata = depCode.length >= 3 && arrCode.length >= 3;
  const cities = parseFlightCities(ev.title || "");
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

  const detailItems: Array<{ icon: React.ComponentType<any>; label: string; value: string }> = [];
  if (ev.terminal) detailItems.push({ icon: Door, label: "Terminal", value: ev.terminal });
  if (ev.gate) detailItems.push({ icon: NavigationArrow, label: "Gate", value: ev.gate });
  if (ev.seatDetails) detailItems.push({ icon: Armchair, label: "Seat", value: ev.seatDetails });
  if (ev.duration) detailItems.push({ icon: Timer, label: "Duration", value: ev.duration });

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

      {/* IATA codes + arc */}
      <View style={frs.routeRow}>
        <View style={frs.endpoint}>
          {hasIata && (
            <Text style={[frs.iata, { color: C.textPrimary }]}>{depCode.slice(0, 3)}</Text>
          )}
          <Text style={[frs.cityName, { color: C.textSecondary }]} numberOfLines={1}>{cities.from}</Text>
          {ev.time && <Text style={[frs.time, { color: C.textPrimary }]}>{ev.time}</Text>}
        </View>

        <View style={frs.arcWrap}>
          <FlightArc color={C.teal} planeColor={C.teal} />
          {ev.duration && (
            <Text style={[frs.durationLabel, { color: C.textTertiary }]}>{ev.duration}</Text>
          )}
        </View>

        <View style={[frs.endpoint, { alignItems: "flex-end" }]}>
          {hasIata && (
            <Text style={[frs.iata, { color: C.textPrimary }]}>{arrCode.slice(0, 3)}</Text>
          )}
          <Text style={[frs.cityName, { color: C.textSecondary, textAlign: "right" }]} numberOfLines={1}>{cities.to}</Text>
          {ev.endTime && <Text style={[frs.time, { color: C.textPrimary }]}>{ev.endTime}</Text>}
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
    flexDirection: "row", alignItems: "flex-start",
    marginBottom: 4,
  },
  endpoint: { flex: 1 },
  iata: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5, lineHeight: 36 },
  cityName: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  time: { fontSize: T.lg, fontWeight: "700", marginTop: 6 },
  arcWrap: { flex: 1.2, alignItems: "center", paddingTop: 2 },
  durationLabel: { fontSize: 11, fontWeight: "600", marginTop: -2 },
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
    heroWrap: { position: "relative", height: 300, marginBottom: S.sm },
    heroImage: {
      width: "100%", height: "100%",
      alignItems: "center", justifyContent: "center",
    },
    heroGradient: {
      position: "absolute", bottom: 0, left: 0, right: 0, height: 180,
    },
    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.lg, paddingBottom: S.sm,
    },
    typePill: {
      flexDirection: "row", alignItems: "center", gap: 5,
      alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full,
      marginBottom: 8,
    },
    typePillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
    heroTitle: {
      fontSize: 26, fontWeight: "700", color: C.textPrimary,
      letterSpacing: -0.3, lineHeight: 30,
    },
    heroSub: { fontSize: T.base, fontWeight: "500", color: C.textTertiary, marginTop: 2 },

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
    statusRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      padding: S.md, borderRadius: R.lg,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: T.base, fontWeight: "700" },

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

    // Documents
    sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: S.sm },
    docRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      padding: S.md, borderRadius: R.lg, marginBottom: 4,
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
