import {
  View, Text, ScrollView, Pressable, Linking,
  StyleSheet, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  Plane, Hotel, Compass, Utensils, Car,
  MapPin, Clock, Hash, FileText, Navigation,
  Calendar, Users, ArrowRight, Copy, ChevronRight,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, F, type ThemeColors, eventColor } from "@/constants/theme";
import { useMemo, useCallback } from "react";
import type { TravelEvent } from "@/shared/types";

function openInMaps(query: string) {
  const encoded = encodeURIComponent(query);
  const url = Platform.select({
    ios: `maps:0,0?q=${encoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  });
  Linking.openURL(url);
}

function formatDate(d: string): string {
  const raw = d.includes("T") ? d : d + "T12:00:00";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Plane, hotel: Hotel, activity: Compass, dining: Utensils, transfer: Car,
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
    if (ev.confNumber) Clipboard.setStringAsync(ev.confNumber);
  };

  // Build compact detail chips
  const chips: Array<{ icon: React.ComponentType<any>; text: string }> = [];
  if (ev.date) chips.push({ icon: Calendar, text: formatDate(ev.date) });
  if (ev.time) chips.push({ icon: Clock, text: ev.time + (ev.endTime ? ` – ${ev.endTime}` : "") });
  if (ev.duration) chips.push({ icon: Clock, text: ev.duration });
  if (isLeader && ev.supplier) chips.push({ icon: Users, text: ev.supplier });
  if (ev.terminal) chips.push({ icon: Navigation, text: `Terminal ${ev.terminal}` });
  if (ev.gate) chips.push({ icon: Navigation, text: `Gate ${ev.gate}` });
  if (ev.seatDetails) chips.push({ icon: Users, text: `Seat ${ev.seatDetails}` });
  if (ev.roomType) chips.push({ icon: Hotel, text: ev.roomType });
  if (ev.price) chips.push({ icon: Hash, text: ev.price });

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{
        headerShown: true,
        title: "",
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: true,
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: "#fff",
        headerShadowVisible: false,
      }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Hero with gradient overlay ── */}
        <View style={styles.heroWrap}>
          {ev.image ? (
            <CachedImage uri={ev.image} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: C.card }]}>
              <Icon size={48} color={`${color}33`} strokeWidth={1.2} />
            </View>
          )}
          <LinearGradient
            colors={["transparent", `${C.bg}CC`, C.bg]}
            locations={[0.3, 0.7, 1]}
            style={styles.heroGradient}
          />
          {/* Title over gradient */}
          <View style={styles.heroContent}>
            <View style={[styles.typePill, { backgroundColor: `${color}22` }]}>
              <Icon size={12} color={color} strokeWidth={2.5} />
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
                  <ChipIcon size={12} color={color} strokeWidth={2} />
                  <Text style={[styles.chipText, { color: C.textPrimary }]}>{chip.text}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Status badge ── */}
        {ev.status && (
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
        {ev.location && (
          <Pressable
            onPress={() => openInMaps(ev.title + " " + ev.location)}
            style={({ pressed }) => [styles.locationCard, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.locationIcon, { backgroundColor: `${color}15` }]}>
              <MapPin size={18} color={color} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.locationLabel, { color: C.textTertiary }]}>Location</Text>
              <Text style={[styles.locationValue, { color: C.textPrimary }]} numberOfLines={3}>{ev.location}</Text>
            </View>
            <ChevronRight size={14} color={C.textDim} strokeWidth={2} style={{ flexShrink: 0 }} />
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
              <ArrowRight size={16} color={color} strokeWidth={2} />
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
            <Copy size={16} color={C.textDim} strokeWidth={1.5} />
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
                <FileText size={14} color={C.teal} strokeWidth={1.5} />
                <Text style={[styles.docName, { color: C.textPrimary }]} numberOfLines={1}>{doc.name}</Text>
                <Text style={[styles.docSize, { color: C.textTertiary }]}>
                  {Math.round(doc.size / 1024)} KB
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Open in Maps button ── */}
        {ev.location && ev.type !== "flight" && (
          <Pressable
            onPress={() => openInMaps(ev.title + " " + ev.location)}
            style={({ pressed }) => [styles.mapsBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1 }]}
          >
            <MapPin size={16} color="#000" strokeWidth={2} />
            <Text style={styles.mapsBtnText}>Open in Maps</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Flight route visual ─────────────────────────────────────────────────────
function FlightRoute({ ev, C, color }: { ev: TravelEvent; C: ThemeColors; color: string }) {
  const routeMatch = ev.title?.match(/^(.+?)\s*[→➜>]\s*(.+)$/);
  const from = ev.depAirport || routeMatch?.[1]?.trim() || ev.location || "";
  const to = ev.arrAirport || routeMatch?.[2]?.trim() || "";
  const fromCode = from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase();
  const toCode = to ? (to.length <= 4 ? to.toUpperCase() : to.slice(0, 3).toUpperCase()) : "";

  if (!toCode) return null;

  return (
    <View style={[frs.routeCard, { backgroundColor: C.card }]}>
      <View style={frs.airport}>
        <Text style={[frs.code, { color: C.textPrimary }]}>{fromCode}</Text>
        <Text style={[frs.time, { color: C.textTertiary }]}>{ev.time || ""}</Text>
      </View>
      <View style={frs.routeMiddle}>
        <View style={[frs.dash, { borderColor: C.border }]} />
        <Plane size={14} color={color} strokeWidth={1.8} />
        <View style={[frs.dash, { borderColor: C.border }]} />
      </View>
      <View style={frs.airport}>
        <Text style={[frs.code, { color: C.textPrimary }]}>{toCode}</Text>
        <Text style={[frs.time, { color: C.textTertiary }]}>{ev.endTime || ""}</Text>
      </View>
    </View>
  );
}

const frs = StyleSheet.create({
  routeCard: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: S.lg, marginBottom: S.md,
    borderRadius: R.xl, padding: S.lg,
  },
  airport: { alignItems: "center", width: 80 },
  code: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  time: { fontSize: T.sm, fontWeight: "500", marginTop: 4 },
  routeMiddle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  dash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 0.5 },
});

// ── Styles ──────────────────────────────────────────────────────────────────
function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },
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
      flexShrink: 0, marginTop: 2,
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
