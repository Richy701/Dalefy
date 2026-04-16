import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Compass, MapPin, Users, Moon, Map
} from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { resolveCoords } from "@/shared/coordinates";
import { EventCard, ConfRow } from "@/components/EventCard";
import { useMemo, useState, useCallback } from "react";

// Safe conditional import — @rnmapbox/maps throws at eval time when native module
// is not linked (Expo Go). Guard so the screen renders without crashing.
// Token is set once in app/_layout.tsx before any screen loads.
let MapboxGL: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  MapboxGL = require("@rnmapbox/maps").default;
} catch { /* native module not available — map will be hidden */ }

const DARK_STYLE  = "mapbox://styles/mapbox/dark-v11";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";


export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const trip = trips.find(t => t.id === id);
  const [mapReady, setMapReady] = useState(false);
  const handleMapLoaded = useCallback(() => setMapReady(true), []);

  // Resolve event locations to map coordinates
  const eventCoords = useMemo(() => {
    if (!trip) return [];
    return trip.events
      .filter(ev => ev.location)
      .map(ev => ({ id: ev.id, type: ev.type, coords: resolveCoords(ev.location) }))
      .filter(item => item.coords !== null) as Array<{
        id: string; type: string; coords: [number, number];
      }>;
  }, [trip]);

  const mapCenter = useMemo((): [number, number] | null => {
    if (eventCoords.length === 0) return null;
    // resolveCoords returns [lat, lng], Mapbox needs [lng, lat]
    const avgLat = eventCoords.reduce((s, c) => s + c.coords[0], 0) / eventCoords.length;
    const avgLng = eventCoords.reduce((s, c) => s + c.coords[1], 0) / eventCoords.length;
    return [avgLng, avgLat];
  }, [eventCoords]);

  const mapZoom = useMemo(() => {
    if (eventCoords.length <= 1) return 8;
    const lats = eventCoords.map(c => c.coords[0]);
    const lngs = eventCoords.map(c => c.coords[1]);
    const spread = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lngs) - Math.min(...lngs),
    );
    if (spread < 0.5) return 11;
    if (spread < 2)   return 9;
    if (spread < 8)   return 7;
    if (spread < 20)  return 5;
    return 3;
  }, [eventCoords]);

  const geojson: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: eventCoords.map(item => ({
      type: "Feature" as const,
      properties: { type: item.type },
      geometry: {
        type: "Point" as const,
        // coords is [lat, lng], convert to [lng, lat] for Mapbox
        coordinates: [item.coords[1], item.coords[0]],
      },
    })),
  }), [eventCoords]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start  = new Date(trip.start);
  const end    = new Date(trip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);

  const grouped = trip.events.reduce<Record<string, typeof trip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Hero banner — matches web WorkspacePage trip banner ── */}
        <View style={styles.hero}>
          <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} />
          {/* Two-layer gradient matching web: top-to-bottom + subtle left-to-right */}
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

          {/* Top row: back + status + event/days count */}
          <View style={[styles.heroTopRow, { top: Platform.OS === "android" ? 20 : 56 }]}>
            <Pressable
              style={({ pressed }) => [styles.backCircle, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.back()}
            >
              <ArrowLeft size={15} color="#fff" strokeWidth={2} />
            </Pressable>
            <View style={[
              styles.statusBadge,
              trip.status === "Published" ? styles.statusPublished
                : trip.status === "In Progress" ? styles.statusActive
                : styles.statusDraft,
            ]}>
              <Text style={[
                styles.statusBadgeText,
                trip.status === "Draft" ? { color: "#fff" } : { color: trip.status === "Published" ? "#fff" : "#000" },
              ]}>
                {trip.status === "In Progress" ? "● ACTIVE"
                  : trip.status === "Published" ? "✓ PUBLISHED"
                  : "DRAFT"}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{trip.events.length} events</Text>
              <Text style={styles.countPillDot}>·</Text>
              <Text style={styles.countPillText}>{Object.keys(grouped).length} days</Text>
            </View>
          </View>

          {/* Bottom: eyebrow + title + frosted glass chips */}
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>DAF Adventures · Itinerary</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>

            {/* Frosted glass stat chips */}
            <View style={styles.chipsRow}>
              {trip.attendees ? (
                <View style={styles.chip}>
                  <Users size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.chipText}>{trip.attendees}</Text>
                </View>
              ) : null}
              <View style={styles.chip}>
                <Moon size={10} color={C.teal} strokeWidth={2} />
                <Text style={styles.chipText}>
                  {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" — "}
                  {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              {trip.destination ? (
                <View style={styles.chip}>
                  <MapPin size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.chipText}>{trip.destination}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Map (only when native module is linked) ── */}
        {mapCenter && MapboxGL && (
          <View style={styles.mapSection}>
            <View style={styles.sectionHeader}>
              <Map size={13} color={C.teal} strokeWidth={1.8} />
              <Text style={styles.sectionEyebrow}>ROUTE MAP</Text>
            </View>
            <View style={styles.mapWrap}>
              <MapboxGL.MapView
                style={StyleSheet.absoluteFillObject}
                styleURL={isDark ? DARK_STYLE : LIGHT_STYLE}
                projection="mercator"
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                logoEnabled={false}
                attributionEnabled={false}
                compassEnabled={false}
                onDidFinishLoadingStyle={handleMapLoaded}
              >
                <MapboxGL.Camera
                  zoomLevel={mapZoom}
                  centerCoordinate={mapCenter}
                  animationDuration={0}
                />
                {mapReady && (
                  <>
                    <MapboxGL.ShapeSource id="trip-rings" shape={geojson}>
                      <MapboxGL.CircleLayer
                        id="trip-ring-layer"
                        style={{
                          circleRadius: 13,
                          circleColor: "transparent",
                          circleStrokeWidth: 1.5,
                          circleStrokeColor: C.teal,
                          circleStrokeOpacity: 0.45,
                        }}
                      />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id="trip-dots" shape={geojson}>
                      <MapboxGL.CircleLayer
                        id="trip-dot-layer"
                        style={{
                          circleRadius: 5,
                          circleColor: C.teal,
                          circleStrokeWidth: 2,
                          circleStrokeColor: isDark ? "#060608" : "#ffffff",
                        }}
                      />
                    </MapboxGL.ShapeSource>
                  </>
                )}
              </MapboxGL.MapView>
              <LinearGradient
                colors={["transparent", C.bg]}
                locations={[0.65, 1]}
                style={styles.mapFade}
              />
            </View>
          </View>
        )}

        {/* ── Itinerary ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Compass size={13} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.sectionEyebrow}>ITINERARY</Text>
          </View>

          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, events], dayIdx) => {
              const d = new Date(date + "T12:00:00");
              return (
                <View key={date} style={styles.dayGroup}>
                  <View style={styles.dayHeader}>
                    <View style={styles.dayNumBox}>
                      <Text style={styles.dayNum}>{dayIdx + 1}</Text>
                    </View>
                    <View style={styles.dayInfo}>
                      <Text style={styles.dayName}>
                        {d.toLocaleDateString("en-US", { weekday: "long" })}
                      </Text>
                      <Text style={styles.dayMonth}>
                        {d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                  </View>

                  {events.map(ev => (
                    <View key={ev.id} style={styles.eventWrap}>
                      <EventCard ev={ev} C={C} />
                      {ev.confNumber && <ConfRow confNumber={ev.confNumber} C={C} />}
                    </View>
                  ))}
                </View>
              );
            })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 60 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    backBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    backBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

    // Hero — matches web WorkspacePage trip banner
    hero: { height: 380, position: "relative" },
    backCircle: {
      width: 32, height: 32, borderRadius: R.full,
      backgroundColor: "#00000055", alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
    },

    heroTopRow: {
      position: "absolute", left: S.md, right: S.md,
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    statusBadge: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.full,
    },
    statusPublished: { backgroundColor: "#10b981" },
    statusActive:    { backgroundColor: C.teal },
    statusDraft:     { backgroundColor: "rgba(255,255,255,0.2)" },
    statusBadgeText: { fontSize: 9, fontWeight: T.bold, letterSpacing: 1.2 },
    countPill: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: "rgba(0,0,0,0.4)", borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)",
    },
    countPillText: { fontSize: 9, fontWeight: T.bold, color: "rgba(255,255,255,0.7)", letterSpacing: 0.8 },
    countPillDot:  { fontSize: 9, color: "rgba(255,255,255,0.3)" },

    // Bottom content
    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingBottom: S.lg,
    },
    heroEyebrow: {
      fontSize: 9, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 6,
    },
    heroTitle: {
      fontSize: T["3xl"] + 4, fontFamily: F.black, fontWeight: T.black,
      color: "#ffffff", letterSpacing: -0.3, marginBottom: S.sm, lineHeight: 36,
      textTransform: "uppercase",
    },

    // Frosted glass chips — matches web's bg-white/10 backdrop-blur chips
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    },
    chipText: {
      fontSize: 9, fontWeight: T.bold,
      color: "rgba(255,255,255,0.9)", letterSpacing: 0.5, textTransform: "uppercase",
    },

    // Map
    mapSection: { paddingTop: S.md },
    mapWrap: {
      height: 220, marginHorizontal: S.md,
      borderRadius: R.xl, overflow: "hidden",
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    mapFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },

    // Section headers
    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm,
    },
    sectionEyebrow: {
      fontSize: 10, fontWeight: T.black, color: C.textTertiary,
      letterSpacing: 1.5,
    },

    // Itinerary
    section: { paddingBottom: S.md },
    dayGroup: { marginBottom: S.xl, paddingHorizontal: S.md },
    dayHeader: {
      flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.sm,
      paddingBottom: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    dayNumBox: {
      width: 42, height: 42, borderRadius: R.md, backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    dayNum: { fontSize: T.xl, fontWeight: T.black, color: C.teal, letterSpacing: -0.2 },
    dayInfo: { flex: 1 },
    dayName: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.2 },
    dayMonth: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },
    dayCountBadge: {
      backgroundColor: C.elevated, borderRadius: R.sm,
      paddingHorizontal: S.xs, paddingVertical: 3,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    dayCountText: { fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary, letterSpacing: 0.5 },

    eventWrap: { marginBottom: S.xs },
  });
}
