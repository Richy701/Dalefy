import {
  View, Text, Pressable, Image,
  StyleSheet, Platform, Linking, Share,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Link, Stack } from "expo-router";
import {
  ChevronLeft, Compass, MapPin, Users, Moon, Map,
} from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { resolveCoords } from "@/shared/coordinates";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import { DaySummaryRow } from "@/components/DaySummaryRow";
import { OrganizerCard } from "@/components/OrganizerCard";
import { InfoDocsRow } from "@/components/InfoDocsRow";
import { useMemo, useState, useCallback, useEffect } from "react";
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

const DARK_STYLE  = "mapbox://styles/mapbox/navigation-night-v1";
const LIGHT_STYLE = "mapbox://styles/mapbox/navigation-day-v1";

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
  const { brand } = useBrand();


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
  const handleMapLoaded = useCallback(() => setMapReady(true), []);


  // Resolve trip destination to map coordinate
  const destCoords = useMemo((): [number, number] | null => {
    if (!trip?.destination) return null;
    return resolveCoords(trip.destination);
  }, [trip?.destination]);

  // [lng, lat] for Mapbox
  const mapCenter = useMemo((): [number, number] | null => {
    if (!destCoords) return null;
    return [destCoords[1], destCoords[0]];
  }, [destCoords]);

  const pinGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: destCoords ? [{
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Point" as const,
        coordinates: [destCoords[1], destCoords[0]],
      },
    }] : [],
  }), [destCoords]);

  const openInMaps = useCallback(() => {
    if (!mapCenter) return;
    const [lng, lat] = mapCenter;
    const label = encodeURIComponent(trip?.destination || trip?.name || "Destination");
    const url = Platform.select({
      ios: `maps:?ll=${lat},${lng}&q=${label}`,
      default: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    });
    Linking.openURL(url);
  }, [mapCenter, trip]);

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

  const grouped = trip.events.reduce<Record<string, typeof trip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});
  for (const evs of Object.values(grouped)) {
    evs.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{
        headerShown: true,
        headerTransparent: true,
        title: "",
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: C.teal,
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? {
          headerStyle: { backgroundColor: "transparent" },
          headerLeft: () => (
            <Pressable
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", marginLeft: 4 }}
              hitSlop={8}
            >
              <ChevronLeft size={22} color="#fff" strokeWidth={2} />
            </Pressable>
          ),
        } : {}),
      }} />

      {/* ── Sticky compact header — fades in as hero collapses ── */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top, height: HEADER_H + insets.top },
          stickyHeaderStyle,
        ]}
      >
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={95}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, {
            backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)",
          }]} />
        )}
        <View style={styles.stickyInner}>
          <View style={{ width: 44 }} />
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

        {/* ── Hero banner — parallax + Apple Zoom target ── */}
        <View style={styles.hero}>
          <Animated.View style={[StyleSheet.absoluteFillObject, heroImageStyle]}>
            <Link.AppleZoomTarget>
              <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} accessible={false} />
            </Link.AppleZoomTarget>
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


          {/* Bottom: eyebrow + title + frosted glass chips — fades on scroll */}
          <Animated.View style={[styles.heroContent, heroContentStyle]}>
            <View style={styles.heroEyebrowRow}>
              {brand.logoUrl ? (
                <Image source={{ uri: brand.logoUrl }} style={{ width: 10, height: 10, borderRadius: 2 }} />
              ) : (
                <Logo size={10} color={C.teal} />
              )}
              <Text style={[styles.heroEyebrow, { marginBottom: 0 }]}>{brand.name} · Itinerary</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>

            <View style={styles.chipsRow}>
              {(() => {
                const parsedPax = parseInt(trip.paxCount || "", 10);
                let label: string | null = null;
                if (!isNaN(parsedPax) && parsedPax > 0) {
                  label = `${parsedPax} attendees`;
                } else if (trip.attendees) {
                  const moreMatch = trip.attendees.match(/\+(\d+)\s+more/i);
                  const listed = trip.attendees.replace(/\+\d+\s+more/i, "").split(",").filter(s => s.trim()).length;
                  const total = listed + (moreMatch ? parseInt(moreMatch[1], 10) : 0);
                  label = total > 0 ? `${total} attendees` : trip.attendees;
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


        {/* ── Map (only when native module is linked) ── */}
        {mapCenter && MapboxGL && (
          <ContextMenu
            actions={[
              { title: "Open in Maps", systemIcon: "map" },
              { title: "Copy Address", systemIcon: "doc.on.doc" },
            ]}
            onPress={(e: any) => {
              if (e.nativeEvent.index === 0) openInMaps();
              else if (e.nativeEvent.index === 1) Share.share({ message: trip.destination || trip.name });
            }}
          >
          <Pressable style={styles.mapSection} onPress={openInMaps}>
            <View style={styles.sectionHeader}>
              <Map size={13} color={C.teal} strokeWidth={1.8} />
              <Text style={styles.sectionEyebrow}>LOCATION</Text>
              <View style={{ flex: 1 }} />
              <Text style={[styles.sectionEyebrow, { color: C.teal }]}>Open in Maps ›</Text>
            </View>
            <View style={styles.mapWrap}>
              <MapboxGL.MapView
                key={isDark ? "dark" : "light"}
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
                scaleBarEnabled={false}
                onDidFinishLoadingStyle={handleMapLoaded}
              >
                <MapboxGL.Camera
                  zoomLevel={3}
                  centerCoordinate={mapCenter}
                  pitch={0}
                  heading={0}
                  animationDuration={0}
                />
                {mapReady && (
                  <MapboxGL.ShapeSource id="trip-pin" shape={pinGeoJSON}>
                    <MapboxGL.CircleLayer
                      id="trip-pin-glow"
                      style={{
                        circleRadius: 18,
                        circleColor: C.teal,
                        circleOpacity: 0.08,
                      }}
                    />
                    <MapboxGL.CircleLayer
                      id="trip-pin-dot"
                      style={{
                        circleRadius: 4,
                        circleColor: C.teal,
                        circleOpacity: 0.7,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                )}
              </MapboxGL.MapView>
            </View>
          </Pressable>
          </ContextMenu>
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
                <ContextMenu
                  key={date}
                  actions={[
                    { title: "View Day", systemIcon: "calendar" },
                    { title: "Share Day", systemIcon: "square.and.arrow.up" },
                  ]}
                  onPress={(e: any) => {
                    if (e.nativeEvent.index === 0) router.push({ pathname: "/trip/day", params: { tripId: trip.id, date } });
                    else if (e.nativeEvent.index === 1) {
                      const dayLabel = new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                      Share.share({ message: `${trip.name} — ${dayLabel}: ${events.map(e => e.title).join(", ")}` });
                    }
                  }}
                >
                  <DaySummaryRow
                    dayIndex={dayIdx + 1}
                    date={date}
                    events={events}
                    C={C}
                    isToday={date === todayStr}
                    isFirst={dayIdx === 0}
                    isLast={dayIdx === sortedDays.length - 1}
                    onPress={() => router.push({ pathname: "/trip/day", params: { tripId: trip.id, date } })}
                  />
                </ContextMenu>
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
    scroll: { paddingBottom: 40 },
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
      width: 44, height: 44,
      alignItems: "center", justifyContent: "center",
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
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
    },
    chipText: {
      fontSize: 11, fontWeight: "500",
      color: "rgba(255,255,255,0.85)", letterSpacing: 0.1,
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

  });
}
