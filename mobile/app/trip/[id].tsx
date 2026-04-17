import {
  View, Text, Pressable,
  StyleSheet, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Compass, MapPin, Users, Moon, Map, ChevronDown, Check,
  FileText,
} from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useCompliance } from "@/context/ComplianceContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { resolveCoords } from "@/shared/coordinates";
import { buildArc, interpolateArc } from "@/shared/mapUtils";
import { geocode } from "@/services/geocode";
import { Logo } from "@/components/Logo";
import { DaySummaryRow } from "@/components/DaySummaryRow";
import { OrganizerCard } from "@/components/OrganizerCard";
import { InfoDocsRow } from "@/components/InfoDocsRow";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

const HERO_H = 380;
const HEADER_H = 56;
const COLLAPSE_START = 180;
const COLLAPSE_END = HERO_H - HEADER_H;

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

function timeToMinutes(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C, isDark } = useTheme();
  const { pendingCount } = useCompliance();

  const insets = useSafeAreaInsets();
  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);
  const styles = useMemo(() => makeStyles(C), [C]);
  const trip = trips.find(t => t.id === id);

  // ── Parallax scroll state ──
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  // Hero image: parallax (moves at 50% scroll speed) + slight scale on overscroll
  const heroImageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [-100, 0, HERO_H],
          [-50, 0, HERO_H * 0.4],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          scrollY.value,
          [-200, 0],
          [1.4, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Hero content (title/chips): fade out as we scroll
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COLLAPSE_START],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COLLAPSE_START],
          [0, -30],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Compact sticky header: fades in as hero collapses
  const stickyHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_START, COLLAPSE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    pointerEvents: scrollY.value > COLLAPSE_START ? "auto" as const : "none" as const,
  }));

  // Back button: always visible but adjusts bg
  const backBtnStyle = useAnimatedStyle(() => ({
    opacity: 1,
  }));
  const [mapReady, setMapReady] = useState(false);
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const handleMapLoaded = useCallback(() => setMapReady(true), []);

  // Reset layers when theme swaps styleURL — new style has no layers yet.
  useEffect(() => { setMapReady(false); }, [isDark]);

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

  // Flight arc lines — great-circle arcs for "X to Y" flight locations
  const [arcGeoJSON, setArcGeoJSON] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection", features: [],
  });
  const [planeGeoJSON, setPlaneGeoJSON] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection", features: [],
  });
  const planeTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    (async () => {
      const flights = trip.events.filter(e => e.type === "flight");
      const features: GeoJSON.Feature[] = [];
      for (const fe of flights) {
        const match = fe.location.match(/^(.+?)\s+to\s+(.+)$/);
        if (!match) continue;
        const from = resolveCoords(match[1].trim()) ?? (await geocode(match[1].trim()));
        const to = resolveCoords(match[2].trim()) ?? (await geocode(match[2].trim()));
        if (!from || !to) continue;
        // buildArc returns [lat,lng][], convert to [lng,lat][] for Mapbox
        const arcCoords = buildArc(from, to).map(p => [p[1], p[0]]);
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: arcCoords },
          properties: {},
        });
      }
      if (!cancelled) setArcGeoJSON({ type: "FeatureCollection", features });
    })();
    return () => { cancelled = true; };
  }, [trip?.events]);

  // Animate planes along flight arcs
  useEffect(() => {
    if (arcGeoJSON.features.length === 0) {
      setPlaneGeoJSON({ type: "FeatureCollection", features: [] });
      return;
    }
    const arcs = arcGeoJSON.features.map(f => (f.geometry as any).coordinates as number[][]);
    const DURATION = 6000;
    const start = Date.now();

    planeTimerRef.current = setInterval(() => {
      const t = ((Date.now() - start) % DURATION) / DURATION;
      const features: GeoJSON.Feature[] = arcs.map((arc, i) => {
        const pos = interpolateArc(arc, t);
        return {
          type: "Feature",
          properties: { bearing: pos.bearing, idx: i },
          geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
        };
      });
      setPlaneGeoJSON({ type: "FeatureCollection", features });
    }, 80);

    return () => clearInterval(planeTimerRef.current);
  }, [arcGeoJSON]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found</Text>
          <Pressable onPress={safeBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start  = new Date(trip.start);
  const end    = new Date(trip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);

  const hasTravelers = (trip.travelers?.length ?? 0) > 0;
  const viewAsTraveler = viewAsId ? trip.travelers?.find(t => t.id === viewAsId) ?? null : null;

  const filteredEvents = viewAsId
    ? trip.events.filter(e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(viewAsId))
    : trip.events;

  const grouped = filteredEvents.reduce<Record<string, typeof trip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});
  for (const evs of Object.values(grouped)) {
    evs.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>

      {/* ── Sticky compact header — fades in as hero collapses ── */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top, height: HEADER_H + insets.top },
          stickyHeaderStyle,
        ]}
      >
        <BlurView
          intensity={Platform.OS === "ios" ? 60 : 80}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.stickyInner}>
          <Pressable
            style={({ pressed }) => [styles.stickyBackBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={safeBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={15} color={C.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.stickyTitle, { color: C.textPrimary }]} numberOfLines={1}>
            {trip.name}
          </Text>
          <View style={{ width: 44 }} />
        </View>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >

        {/* ── Hero banner — parallax ── */}
        <View style={styles.hero}>
          <Animated.View style={[StyleSheet.absoluteFillObject, heroImageStyle]}>
            <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} accessible={false} />
          </Animated.View>
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

          {/* Top row: back + event/days count */}
          <View style={[styles.heroTopRow, { top: insets.top + 8 }]}>
            <Animated.View style={backBtnStyle}>
              <Pressable
                style={({ pressed }) => [styles.backCircle, { opacity: pressed ? 0.7 : 1 }]}
                onPress={safeBack}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={15} color="#fff" strokeWidth={2} />
              </Pressable>
            </Animated.View>
            <View style={{ flex: 1 }} />
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{trip.events.length} events</Text>
              <Text style={styles.countPillDot}>·</Text>
              <Text style={styles.countPillText}>{Object.keys(grouped).length} days</Text>
            </View>
          </View>

          {/* Bottom: eyebrow + title + frosted glass chips — fades on scroll */}
          <Animated.View style={[styles.heroContent, heroContentStyle]}>
            <View style={styles.heroEyebrowRow}>
              <Logo size={10} color={C.teal} />
              <Text style={[styles.heroEyebrow, { marginBottom: 0 }]}>DAF Adventures · Itinerary</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>

            <View style={styles.chipsRow}>
              {(() => {
                const parsedPax = parseInt(trip.paxCount || "", 10);
                let label: string | null = null;
                if (!isNaN(parsedPax) && parsedPax > 0) {
                  label = `${parsedPax} ATTENDEES`;
                } else if (trip.attendees) {
                  const moreMatch = trip.attendees.match(/\+(\d+)\s+more/i);
                  const listed = trip.attendees.replace(/\+\d+\s+more/i, "").split(",").filter(s => s.trim()).length;
                  const total = listed + (moreMatch ? parseInt(moreMatch[1], 10) : 0);
                  label = total > 0 ? `${total} ATTENDEES` : trip.attendees;
                }
                return label ? (
                  <View style={styles.chip}>
                    <Users size={10} color={C.teal} strokeWidth={2} />
                    <Text style={styles.chipText}>{label}</Text>
                  </View>
                ) : null;
              })()}
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
          </Animated.View>
        </View>

        {/* ── Organizer contact card ── */}
        {trip.organizer && <OrganizerCard organizer={trip.organizer} C={C} />}

        {/* ── Information & Documents ── */}
        {trip.info && trip.info.length > 0 && (
          <InfoDocsRow
            count={trip.info.length}
            C={C}
            onPress={() => router.push({ pathname: "/trip/info", params: { tripId: trip.id } })}
          />
        )}

        {/* ── Compliance badge ── */}
        {pendingCount > 0 && (
          <Pressable
            style={({ pressed }) => [styles.complianceBadge, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <View style={[styles.complianceIcon, { backgroundColor: C.amberDim }]}>
              <FileText size={14} color={C.amber} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.complianceTitle}>Documents pending</Text>
              <Text style={styles.complianceSub}>
                {pendingCount} doc{pendingCount === 1 ? "" : "s"} require{pendingCount === 1 ? "s" : ""} your signature
              </Text>
            </View>
            <View style={[styles.complianceCount, { backgroundColor: C.amberDim }]}>
              <Text style={[styles.complianceCountText, { color: C.amber }]}>{pendingCount}</Text>
            </View>
          </Pressable>
        )}

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
                    {/* Flight arc lines */}
                    <MapboxGL.ShapeSource id="trip-arcs" shape={arcGeoJSON}>
                      <MapboxGL.LineLayer
                        id="arc-glow"
                        style={{
                          lineColor: C.teal,
                          lineWidth: 6,
                          lineOpacity: 0.08,
                          lineCap: "round",
                        }}
                      />
                      <MapboxGL.LineLayer
                        id="arc-line"
                        style={{
                          lineColor: C.teal,
                          lineWidth: 1.5,
                          lineOpacity: 0.6,
                          lineCap: "round",
                          lineDasharray: [2, 4],
                        }}
                      />
                    </MapboxGL.ShapeSource>
                    {/* Animated planes along arcs */}
                    <MapboxGL.ShapeSource id="trip-planes" shape={planeGeoJSON}>
                      <MapboxGL.SymbolLayer
                        id="trip-plane-icons"
                        style={{
                          iconImage: "airport",
                          iconSize: 0.7,
                          iconColor: C.teal,
                          iconRotate: ["get", "bearing"],
                          iconRotationAlignment: "map",
                          iconAllowOverlap: true,
                          iconIgnorePlacement: true,
                        }}
                      />
                    </MapboxGL.ShapeSource>
                    {/* Location rings */}
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

        {/* ── View As picker ── */}
        {hasTravelers && (
          <View style={styles.viewAsWrap}>
            <Pressable
              style={[styles.viewAsBtn, viewAsId ? styles.viewAsBtnActive : null]}
              onPress={() => setPickerOpen(!pickerOpen)}
            >
              <View style={[styles.viewAsAvatar, viewAsId ? styles.viewAsAvatarActive : null]}>
                {viewAsTraveler
                  ? <Text style={styles.viewAsAvatarText}>{viewAsTraveler.initials}</Text>
                  : <Users size={13} color={C.textSecondary} strokeWidth={2} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.viewAsLabel}>
                  {viewAsId ? "VIEWING AS" : "VIEW AS"}
                </Text>
                <Text style={[styles.viewAsName, { color: viewAsId ? C.teal : C.textPrimary }]} numberOfLines={1}>
                  {viewAsTraveler ? viewAsTraveler.name : "Everyone"}
                </Text>
              </View>
              <ChevronDown
                size={14} color={C.textTertiary} strokeWidth={2}
                style={{ transform: [{ rotate: pickerOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {pickerOpen && (
              <View style={styles.viewAsDropdown}>
                <Pressable
                  style={[styles.viewAsOption, !viewAsId && styles.viewAsOptionActive]}
                  onPress={() => { setViewAsId(null); setPickerOpen(false); }}
                >
                  <View style={styles.viewAsOptionDot}>
                    <Text style={[styles.viewAsOptionDotText, { color: C.textSecondary }]}>ALL</Text>
                  </View>
                  <Text style={styles.viewAsOptionName}>Everyone</Text>
                  {!viewAsId && <Check size={12} color={C.teal} strokeWidth={2.5} />}
                </Pressable>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 10 }} />
                {trip.travelers!.map(t => (
                  <Pressable
                    key={t.id}
                    style={[styles.viewAsOption, viewAsId === t.id && styles.viewAsOptionActive]}
                    onPress={() => { setViewAsId(t.id); setPickerOpen(false); }}
                  >
                    <View style={[styles.viewAsOptionDot, { backgroundColor: `${C.teal}15` }]}>
                      <Text style={[styles.viewAsOptionDotText, { color: C.teal }]}>{t.initials}</Text>
                    </View>
                    <Text style={styles.viewAsOptionName}>{t.name}</Text>
                    {viewAsId === t.id && <Check size={12} color={C.teal} strokeWidth={2.5} />}
                  </Pressable>
                ))}
              </View>
            )}

            {viewAsTraveler && (
              <Text style={styles.viewAsSubtext}>
                Showing {filteredEvents.length} of {trip.events.length} events
              </Text>
            )}
          </View>
        )}

        {/* ── Itinerary ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Compass size={13} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.sectionEyebrow}>ITINERARY</Text>
          </View>

          <View style={styles.dayRows}>
            {(() => {
              const sortedDays = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
              const todayStr = new Date().toISOString().split("T")[0];
              return sortedDays.map(([date, events], dayIdx) => (
                <DaySummaryRow
                  key={date}
                  dayIndex={dayIdx + 1}
                  date={date}
                  events={events}
                  C={C}
                  isToday={date === todayStr}
                  isFirst={dayIdx === 0}
                  isLast={dayIdx === sortedDays.length - 1}
                  onPress={() => router.push({ pathname: "/trip/day", params: { tripId: trip.id, date } })}
                />
              ));
            })()}
          </View>
        </View>
      </Animated.ScrollView>
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

    // Sticky compact header
    stickyHeader: {
      position: "absolute", top: 0, left: 0, right: 0,
      zIndex: 10, overflow: "hidden",
    },
    stickyInner: {
      flex: 1, flexDirection: "row", alignItems: "center",
      paddingHorizontal: S.sm,
    },
    stickyBackBtn: {
      width: 44, height: 44, borderRadius: R.full,
      alignItems: "center", justifyContent: "center",
    },
    stickyTitle: {
      flex: 1, fontSize: T.base, fontWeight: T.semibold,
      textAlign: "center", letterSpacing: -0.2,
    },

    // Hero — parallax
    hero: { height: HERO_H, position: "relative", overflow: "hidden" },
    backCircle: {
      width: 36, height: 36, borderRadius: R.full,
      backgroundColor: C.elevated, alignItems: "center", justifyContent: "center",
    },

    heroTopRow: {
      position: "absolute", left: S.md, right: S.md,
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    countPill: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: "rgba(0,0,0,0.35)", borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    countPillText: { fontSize: 10, fontWeight: T.bold, color: "rgba(255,255,255,0.7)", letterSpacing: 0.8 },
    countPillDot:  { fontSize: 10, color: "rgba(255,255,255,0.3)" },

    // Bottom content
    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingBottom: S.lg,
    },
    heroEyebrow: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 6,
    },
    heroEyebrowRow: {
      flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6,
    },
    heroTitle: {
      fontSize: T["3xl"] + 4, fontFamily: F.black, fontWeight: T.black,
      color: "#ffffff", letterSpacing: -0.3, marginBottom: S.sm, lineHeight: 36,
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
      fontSize: 10, fontWeight: T.bold,
      color: "rgba(255,255,255,0.9)", letterSpacing: 0.5, textTransform: "uppercase",
    },

    // Map
    // Compliance badge
    complianceBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      marginHorizontal: S.md,
      marginTop: S.sm,
      padding: S.sm,
      backgroundColor: C.card,
      borderRadius: R.xl,
      borderWidth: 1,
      borderColor: C.amberDim,
    },
    complianceIcon: {
      width: 34,
      height: 34,
      borderRadius: R.md,
      alignItems: "center",
      justifyContent: "center",
    },
    complianceTitle: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textPrimary,
    },
    complianceSub: {
      fontSize: T.xs,
      color: C.textTertiary,
      fontWeight: T.medium,
      marginTop: 1,
    },
    complianceCount: {
      width: 26,
      height: 26,
      borderRadius: R.full,
      alignItems: "center",
      justifyContent: "center",
    },
    complianceCountText: {
      fontSize: T.sm,
      fontWeight: T.bold,
    },

    mapSection: { paddingTop: S.md },
    mapWrap: {
      height: 220, marginHorizontal: S.md,
      borderRadius: R.xl, overflow: "hidden",
      backgroundColor: C.card,
    },
    mapFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },

    // Section headers
    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm,
    },
    sectionEyebrow: {
      fontSize: 10, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 1.5,
    },

    // Itinerary
    section: { paddingBottom: S.md },
    dayRows: { paddingHorizontal: S.md },

    // View As picker
    viewAsWrap: { paddingHorizontal: S.md, paddingTop: S.sm },
    viewAsBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      padding: 10, borderRadius: R.lg,
      backgroundColor: C.elevated,
    },
    viewAsBtnActive: {
      backgroundColor: `${C.teal}10`,
    },
    viewAsAvatar: {
      width: 32, height: 32, borderRadius: R.sm,
      backgroundColor: C.border, alignItems: "center", justifyContent: "center",
    },
    viewAsAvatarActive: { backgroundColor: `${C.teal}20` },
    viewAsAvatarText: {
      fontSize: 9, fontWeight: T.bold as any, color: C.teal,
      textTransform: "uppercase", letterSpacing: 0.3,
    },
    viewAsLabel: {
      fontSize: 10, fontWeight: T.bold as any, color: C.textTertiary,
      letterSpacing: 1.2, textTransform: "uppercase",
    },
    viewAsName: { fontSize: T.sm, fontWeight: T.bold as any, marginTop: 1 },
    viewAsDropdown: {
      marginTop: 4, borderRadius: R.lg, overflow: "hidden",
      backgroundColor: C.elevated,
    },
    viewAsOption: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 12, paddingHorizontal: 10, minHeight: 44,
    },
    viewAsOptionActive: { backgroundColor: `${C.teal}08` },
    viewAsOptionDot: {
      width: 26, height: 26, borderRadius: R.sm,
      backgroundColor: C.border, alignItems: "center", justifyContent: "center",
    },
    viewAsOptionDotText: {
      fontSize: 10, fontWeight: T.bold as any, textTransform: "uppercase" as const, letterSpacing: 0.2,
    },
    viewAsOptionName: {
      flex: 1, fontSize: T.xs, fontWeight: T.bold as any, color: C.textSecondary,
    },
    viewAsSubtext: {
      fontSize: 10, fontWeight: T.bold as any, color: `${C.teal}80`,
      letterSpacing: 0.6, textTransform: "uppercase", marginTop: 4,
    },
  });
}
