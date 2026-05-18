import {
  View, Text, Pressable, Image, ActivityIndicator,
  StyleSheet, Platform, Linking, Share,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Link, Stack } from "expo-router";
import {
  CaretLeft, CaretRight, MapPin, Users, Moon, MapTrifold,
  Airplane, Bed, ForkKnife, Car, Compass, Train, Bus, Boat,
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
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
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
  const { trips, ready } = useTrips();
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
          {!ready ? (
            <>
              <ActivityIndicator size="large" color={C.teal} style={{ marginBottom: S.md }} />
              <Text style={styles.errorText}>Loading trip...</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorText}>Trip not found</Text>
              <Pressable onPress={safeBack} style={styles.backBtn}>
                <Text style={styles.backBtnText}>Go back</Text>
              </Pressable>
            </>
          )}
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
    <View style={styles.safe}>
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
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >

        {/* ── Hero banner — parallax + Apple Zoom target ── */}
        <View style={styles.hero}>
          <Animated.View style={[StyleSheet.absoluteFillObject, heroImageStyle]}>
            {Platform.OS === "ios" && Link.AppleZoomTarget ? (
              <Link.AppleZoomTarget>
                <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} accessible={false} />
              </Link.AppleZoomTarget>
            ) : (
              <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} accessible={false} />
            )}
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
          <DayList grouped={grouped} trip={trip} C={C} isDark={isDark} isLeader={isLeader} start={start} end={end} nights={nights} />
        </View>

      </Animated.ScrollView>
    </View>
  );
}

const ICON_ORDER = ["flight", "train", "bus", "car", "ferry", "hotel", "dining", "activity"] as const;

const TYPE_ICON_MAP: Record<string, React.ComponentType<any>> = {
  flight: Airplane, train: Train, bus: Bus, car: Car, ferry: Boat,
  hotel: Bed, dining: ForkKnife, activity: Compass,
};

function typeCounts(events: any[]): Array<{ key: string; Icon: React.ComponentType<any>; count: number }> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.type === "transfer") {
      const sub = e.transferType || "car";
      counts[sub] = (counts[sub] || 0) + 1;
    } else {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
  }
  const result: Array<{ key: string; Icon: React.ComponentType<any>; count: number }> = [];
  for (const k of ICON_ORDER) {
    if (counts[k]) result.push({ key: k, Icon: TYPE_ICON_MAP[k] || Compass, count: counts[k] });
  }
  if (result.length <= 5) return result;
  return result.slice(0, 4);
}

function dayProgress(events: any[], now: Date, dateStr: string): number {
  if (!events.length) return 0;
  const sorted = [...events].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  const firstMin = timeToMinutes(sorted[0].time);
  const lastEv = sorted[sorted.length - 1];
  const lastMin = timeToMinutes(lastEv.endTime || lastEv.time);

  const dayDate = new Date(dateStr + "T00:00:00");
  const firstMs = dayDate.getTime() + firstMin * 60_000;
  const lastMs = dayDate.getTime() + lastMin * 60_000;
  const nowMs = now.getTime();

  if (nowMs >= lastMs) return 1;
  if (nowMs <= firstMs) return 0;
  const total = lastMs - firstMs;
  if (total <= 0) return 0;
  return (nowMs - firstMs) / total;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const DAY_THUMB_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Airplane, hotel: Bed, activity: Compass,
  dining: ForkKnife, transfer: Car,
};

function DayList({ grouped, trip, C, isDark, isLeader, start, end, nights }: {
  grouped: Record<string, any[]>;
  trip: { id: string; name: string; events: any[]; paxCount?: string; attendees?: string; travelers?: any[] };
  C: ThemeColors;
  isDark: boolean;
  isLeader: boolean;
  start: Date;
  end: Date;
  nights: number;
}) {
  const sortedDays = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [openDay, setOpenDay] = useState<string | null>(null);

  const totalDays = nights + 1;
  const currentDayIdx = sortedDays.findIndex(([d]) => d >= todayStr);
  const currentDay = currentDayIdx >= 0 ? currentDayIdx + 1 : totalDays;
  const totalEvents = trip.events.length;
  const pastEvents = trip.events.filter(e => e.date < todayStr).length;
  const todayDoneEstimate = Math.round(
    trip.events.filter(e => e.date === todayStr).length * 0.5,
  );
  const completed = pastEvents + todayDoneEstimate;

  const dateRange = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const travelerCount = (() => {
    if (trip.travelers?.length) return trip.travelers.length;
    const parsed = parseInt(trip.paxCount || "", 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    if (trip.attendees) {
      const moreMatch = trip.attendees.match(/\+(\d+)\s+more/i);
      const listed = trip.attendees.replace(/\+\d+\s+more/i, "").split(",").filter((s: string) => s.trim()).length;
      return listed + (moreMatch ? parseInt(moreMatch[1], 10) : 0);
    }
    return 0;
  })();

  const toggle = (date: string) => {
    Haptics.selectionAsync();
    setOpenDay(prev => prev === date ? null : date);
  };

  const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
  const progressBg = isDark ? C.elevated : "#e4e4e7";
  const dividerColor = isDark ? C.border : "#e4e4e7";

  return (
    <View>
      {/* ── Trip header ── */}
      <View style={{
        paddingHorizontal: S.md + S.sm,
        paddingTop: S.xl,
        paddingBottom: S.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: dividerColor,
      }}>
        <Text style={{
          fontSize: T["2xl"], fontWeight: "600",
          color: C.textPrimary, letterSpacing: -0.3, marginBottom: 6,
        }}>{trip.name}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "500", color: C.textTertiary }}>
            {dateRange}
          </Text>
          <Text style={{ fontSize: 11, color: C.textDim }}> · </Text>
          <Text style={{ fontSize: 11, fontWeight: "500", color: C.textTertiary }}>
            {totalDays} days
          </Text>
          {travelerCount > 0 && (
            <>
              <Text style={{ fontSize: 11, color: C.textDim }}> · </Text>
              <Text style={{ fontSize: 11, fontWeight: "500", color: C.textTertiary }}>
                {travelerCount} traveler{travelerCount !== 1 ? "s" : ""}
              </Text>
            </>
          )}
        </View>

        {/* Progress strip */}
        <View style={{ marginTop: S.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{
              fontFamily: mono,
              fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1.5,
            }}>Day {currentDay} of {totalDays}</Text>
            <Text style={{
              fontFamily: mono,
              fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1.5,
            }}>{completed} of {totalEvents} done</Text>
          </View>
          <View style={{ height: 3, backgroundColor: progressBg, borderRadius: R.full, overflow: "hidden" }}>
            <View style={{
              height: 3, backgroundColor: C.teal, borderRadius: R.full,
              width: `${Math.min((completed / Math.max(totalEvents, 1)) * 100, 100)}%` as any,
            }} />
          </View>
        </View>
      </View>

      {/* ── Day rows ── */}
      <View style={{ paddingHorizontal: S.md, gap: S.sm }}>
        {sortedDays.map(([date, events], dayIdx) => {
          const dt = new Date(date + "T12:00:00");
          const isToday = date === todayStr;
          const isPast = date < todayStr;
          const weekday = dt.toLocaleDateString("en-US", { weekday: "long" });
          const fullDate = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const isOpen = openDay === date;
          const icons = typeCounts(events);

          const firstTime = events[0]?.time
            ? events[0].time.replace(/^(\d{1,2}:\d{2}).*/, "$1")
            : null;

          const barPct = dayProgress(events, now, date) * 100;
          const barColor = isToday
            ? C.teal
            : isPast
              ? (isDark ? "#3f3f46" : "#a1a1aa")
              : "transparent";
          const barBg = isDark ? C.elevated : "#e4e4e7";

          const dayNameColor = isToday
            ? (isDark ? C.teal : "#059669")
            : isPast
              ? (isDark ? C.textDim : "#a1a1aa")
              : C.textPrimary;
          const subColor = isToday
            ? C.textTertiary
            : isPast
              ? (isDark ? C.textDim : "#d4d4d8")
              : C.textTertiary;
          const iconColor = isToday
            ? (isDark ? C.teal : "#059669")
            : isPast
              ? (isDark ? C.textDim : "#a1a1aa")
              : (isDark ? `${C.teal}99` : "#059669aa");
          const countColor = isToday
            ? (isDark ? C.teal : "#047857")
            : isPast
              ? (isDark ? C.textDim : "#a1a1aa")
              : (isDark ? `${C.teal}99` : "#047857aa");

          const photo = events.find((e: any) => e.image && e.type !== "flight")?.image || null;
          const FallbackIcon = DAY_THUMB_ICONS[events[0]?.type] || MapTrifold;

          const gradHue = hashStr(events[0]?.title || date) % 360;

          return (
            <View key={date}>
              <Pressable
                onPress={() => toggle(date)}
                style={({ pressed }) => ({
                  paddingVertical: S.sm + 2,
                  paddingHorizontal: S.sm,
                  borderRadius: R.md,
                  backgroundColor: pressed
                    ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
                    : "transparent",
                  opacity: pressed ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* Left: day info */}
                  <View style={{ flex: 1 }}>
                    {/* Row 1: Day name + Today pill */}
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <Text style={{
                        fontSize: T.xl, fontWeight: "600",
                        color: dayNameColor, letterSpacing: -0.2,
                      }}>{weekday}</Text>
                      {isToday && (
                        <View style={{
                          paddingHorizontal: 7, paddingVertical: 2,
                          borderRadius: R.full,
                          backgroundColor: isDark ? `${C.teal}18` : "#ecfdf5",
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: isDark ? `${C.teal}33` : "#a7f3d0",
                        }}>
                          <Text style={{
                            fontSize: 9, fontWeight: "600",
                            color: isDark ? C.teal : "#047857",
                            textTransform: "uppercase", letterSpacing: 1.5,
                            fontFamily: mono,
                          }}>Today</Text>
                        </View>
                      )}
                    </View>

                    {/* Row 2: Date + event count */}
                    <Text style={{
                      fontSize: 11, fontWeight: "500", color: subColor, marginTop: 3,
                    }}>{fullDate} · {events.length} event{events.length !== 1 ? "s" : ""}</Text>

                    {/* Type icons with counts */}
                    {icons.length > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
                        {icons.map(({ key, Icon, count }) => (
                          <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Icon size={13} color={iconColor} weight="regular" />
                            <Text style={{
                              fontSize: T.xs, fontWeight: "500", color: countColor,
                              fontFamily: mono,
                            }}>{count}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Right: thumbnail + time */}
                  <View style={{ alignItems: "flex-end", marginLeft: S.sm, gap: 4 }}>
                    <View style={{
                      width: 56, height: 56, borderRadius: R.lg,
                      overflow: "hidden",
                      backgroundColor: isDark ? C.elevated : "#f4f4f5",
                      opacity: isPast ? 0.5 : 1,
                    }}>
                      {photo ? (
                        <CachedImage uri={photo} style={{ width: 56, height: 56 }} />
                      ) : (
                        <LinearGradient
                          colors={[`hsl(${gradHue}, 30%, 25%)`, `hsl(${(gradHue + 30) % 360}, 30%, 15%)`]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                        >
                          <FallbackIcon size={20} color="rgba(255,255,255,0.4)" weight="regular" />
                        </LinearGradient>
                      )}
                    </View>
                    {firstTime && (
                      <Text style={{
                        fontFamily: mono,
                        fontSize: 10, color: isDark ? C.textDim : "#a1a1aa",
                      }}>{firstTime}</Text>
                    )}
                  </View>

                  {/* Chevron */}
                  <CaretRight
                    size={16}
                    color={isPast ? (isDark ? C.textDim : "#a1a1aa") : (isDark ? "#71717a" : "#a1a1aa")}
                    weight="bold"
                    style={{ marginLeft: 6 }}
                  />
                </View>

                {/* Density bar */}
                <View style={{
                  height: 3, backgroundColor: barBg, borderRadius: R.full,
                  marginTop: S.xs + 2, overflow: "hidden",
                }}>
                  <View style={{
                    height: 3, borderRadius: R.full,
                    backgroundColor: barColor,
                    width: `${barPct}%` as any,
                  }} />
                </View>
              </Pressable>

              {/* Expanded events */}
              {isOpen && (
                <View style={{ gap: S.sm, paddingTop: S.xs, paddingBottom: S.xs }}>
                  {events.map((ev: any) => (
                    <EventCard key={ev.id} ev={ev} C={C} tripId={trip.id} isLeader={isLeader} />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
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
