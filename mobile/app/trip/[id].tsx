import {
  View, Text, Pressable, Image,
  StyleSheet, Platform, Linking, Share,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Link, Stack } from "expo-router";
import {
  CaretLeft, Compass, MapPin, Users, Moon, MapTrifold, CaretDown,
  Airplane, Bed, ForkKnife, Car,
} from "phosphor-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { geocode } from "@/services/geocode";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import { EventCard } from "@/components/EventCard";
import { OrganizerCard } from "@/components/OrganizerCard";
import { useTripRole } from "@/hooks/useTripRole";
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
  const { isLeader } = useTripRole(id);


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
  }));

  // Back button: always visible but adjusts bg
  const backBtnStyle = useAnimatedStyle(() => ({
    opacity: 1,
  }));
  const [mapReady, setMapReady] = useState(false);
  const handleMapLoaded = useCallback(() => setMapReady(true), []);


  // Resolve trip destination to map coordinate (static lookup → Mapbox API fallback)
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!trip?.destination) { setDestCoords(null); return; }
    let cancelled = false;
    geocode(trip.destination).then(c => { if (!cancelled) setDestCoords(c); });
    return () => { cancelled = true; };
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              <CaretLeft size={22} color="#fff" weight="regular" />
            </Pressable>
          ),
        } : {}),
      }} />

      {/* ── Sticky compact header — fades in as hero collapses ── */}
      <Animated.View
        pointerEvents="box-none"
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
                    <Users size={10} color={C.teal} weight="regular" />
                    <Text style={styles.chipText}>{label}</Text>
                  </View>
                ) : null;
              })()}
              <View style={styles.chip}>
                <Moon size={10} color={C.teal} weight="regular" />
                <Text style={styles.chipText}>
                  {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" — "}
                  {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              {trip.destination ? (
                <View style={styles.chip}>
                  <MapPin size={10} color={C.teal} weight="regular" />
                  <Text style={styles.chipText}>{trip.destination}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>

        {/* ── Organizer contact card ── */}
        {trip.organizer && <OrganizerCard organizer={trip.organizer} C={C} isLeader={isLeader} />}

        {/* ── Information & Documents ── */}
        {trip.info && trip.info.length > 0 && (() => {
          const visibleInfo = isLeader ? trip.info : trip.info.filter(i => !i.leaderOnly);
          return visibleInfo.length > 0 ? (
            <InfoDocsRow
              count={visibleInfo.length}
              C={C}
              onPress={() => router.push({ pathname: "/trip/info", params: { tripId: trip.id } })}
            />
          ) : null;
        })()}


        {/* ── Map (only when native module is linked) ── */}
        {mapCenter && MapboxGL && (
          <ContextMenu
            actions={[
              { title: "Open in Maps", systemIcon: "map" },
              { title: "Copy Address", systemIcon: "doc.on.doc" },
            ]}
            onPress={(e: any) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (e.nativeEvent.index === 0) openInMaps();
              else if (e.nativeEvent.index === 1) Share.share({ message: trip.destination || trip.name });
            }}
          >
          <Pressable style={styles.mapSection} onPress={openInMaps}>
            <View style={styles.sectionHeader}>
              <MapTrifold size={13} color={C.teal} weight="regular" />
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
                  zoomLevel={4}
                  centerCoordinate={mapCenter ?? [0, 20]}
                  pitch={0}
                  heading={0}
                  animationDuration={0}
                />
                {mapReady && (
                  <MapboxGL.ShapeSource id="trip-pin" shape={pinGeoJSON}>
                    <MapboxGL.CircleLayer
                      id="trip-pin-glow"
                      style={{
                        circleRadius: 28,
                        circleColor: C.teal,
                        circleOpacity: 0.12,
                        circleBlur: 0.6,
                      }}
                    />
                    <MapboxGL.CircleLayer
                      id="trip-pin-ring"
                      style={{
                        circleRadius: 10,
                        circleColor: C.teal,
                        circleOpacity: 0.25,
                      }}
                    />
                    <MapboxGL.CircleLayer
                      id="trip-pin-dot"
                      style={{
                        circleRadius: 5,
                        circleColor: C.teal,
                        circleStrokeWidth: 2,
                        circleStrokeColor: isDark ? "#000" : "#fff",
                      }}
                    />
                    <MapboxGL.SymbolLayer
                      id="trip-pin-label"
                      style={{
                        textField: trip?.destination || trip?.name || "",
                        textSize: 12,
                        textFont: ["DIN Pro Bold"],
                        textColor: isDark ? "#fff" : "#111",
                        textHaloColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.85)",
                        textHaloWidth: 1.5,
                        textOffset: [0, 1.8],
                        textAllowOverlap: true,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                )}
              </MapboxGL.MapView>
            </View>
          </Pressable>
          </ContextMenu>
        )}


        {/* ── Itinerary — inline days with events ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>ITINERARY</Text>
          </View>

          <DayList grouped={grouped} trip={trip} C={C} isLeader={isLeader} />
        </View>

        {/* Terminal element clearance */}
        <View style={{ height: 16 }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const DAY_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Airplane, hotel: Bed, activity: Compass, dining: ForkKnife, transport: Car,
};

function DayList({ grouped, trip, C, isLeader }: {
  grouped: Record<string, any[]>;
  trip: { id: string; events: any[] };
  C: ThemeColors;
  isLeader: boolean;
}) {
  const sortedDays = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const todayStr = new Date().toISOString().split("T")[0];
  const [openDay, setOpenDay] = useState<string | null>(null);

  const toggle = (date: string) => {
    Haptics.selectionAsync();
    setOpenDay(prev => prev === date ? null : date);
  };

  return (
    <View style={{ paddingHorizontal: S.md }}>
      {sortedDays.map(([date, events], dayIdx) => {
        const dt = new Date(date + "T12:00:00");
        const isToday = date === todayStr;
        const weekday = dt.toLocaleDateString("en-US", { weekday: "long" });
        const fullDate = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const isOpen = openDay === date;

        const typeSet = new Set(events.map((e: any) => e.type));
        const typeIcons = [...typeSet].slice(0, 4);

        return (
          <View key={date} style={{ marginBottom: S.sm }}>
            <Pressable
              onPress={() => toggle(date)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: isOpen ? C.elevated : C.card,
                borderRadius: R.xl,
                padding: S.sm,
                gap: S.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{
                width: 38, height: 38, borderRadius: R.md,
                backgroundColor: isToday ? C.teal : C.elevated,
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{
                  fontSize: T.lg, fontWeight: "800",
                  color: isToday ? "#000" : C.textPrimary,
                }}>{dayIdx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: T.base, fontWeight: "700",
                  color: isToday ? C.teal : C.textPrimary,
                }}>{weekday}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 }}>
                  <Text style={{
                    fontSize: T.xs, fontWeight: "500",
                    color: C.textTertiary,
                  }}>{fullDate} · {events.length} event{events.length !== 1 ? "s" : ""}</Text>
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    {typeIcons.map(type => {
                      const Icon = DAY_TYPE_ICONS[type] || Compass;
                      return <Icon key={type} size={11} color={C.textTertiary} weight="regular" />;
                    })}
                  </View>
                </View>
              </View>
              <CaretDown
                size={14}
                color={C.textTertiary}
                weight="regular"
                style={{ transform: [{ rotate: isOpen ? "0deg" : "-90deg" }] }}
              />
            </Pressable>

            {isOpen && (
              <View style={{ gap: S.sm, paddingTop: S.sm }}>
                {events.map((ev: any) => (
                  <EventCard key={ev.id} ev={ev} C={C} tripId={trip.id} isLeader={isLeader} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: {},
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
      flex: 1, fontSize: T.base, fontWeight: T.bold,
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
      fontSize: T["3xl"] + 4, fontWeight: "700",
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
      fontSize: 11, fontWeight: "600",
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
      height: 240, marginHorizontal: S.md,
      borderRadius: R.xl, overflow: "hidden",
      backgroundColor: C.card,
    },
    mapFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },

    // Section headers
    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: S.md, paddingTop: S.xl, paddingBottom: S.sm,
    },
    sectionEyebrow: {
      fontSize: 10, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 1.8,
    },

    // Itinerary
    section: { paddingBottom: S.lg },

  });
}
