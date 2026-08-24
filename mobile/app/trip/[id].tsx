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
  CaretLeft, MapPin, Users, Moon, MapTrifold,
  Airplane, Bed, ForkKnife, Car, Compass, Train, Bus, Boat,
} from "phosphor-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, F, shadow, type ThemeColors } from "@/constants/theme";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import { ScalePress } from "@/components/ScalePress";
import { geocode } from "@/services/geocode";
import { parseTripDate } from "@/shared/dates";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import { EventCard } from "@/components/EventCard";
import { OrganizerCard } from "@/components/OrganizerCard";
import { useTripRole } from "@/hooks/useTripRole";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
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
   
  MapboxGL = require("@rnmapbox/maps").default;
} catch { /* native module not available — map will be hidden */ }

const MAP_STYLE = "mapbox://styles/mapbox/standard";

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
  const linkedTravelerId = useLinkedTravelerId(id);
  const [showAllEvents, setShowAllEvents] = useState(false);

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
              <Text style={styles.errorText}>Loading trip…</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorText}>Trip not found</Text>
              <Pressable onPress={safeBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
                <Text style={styles.backBtnText}>Go back</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const start  = parseTripDate(trip.start);
  const end    = parseTripDate(trip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);

  const visibleEvents = useMemo(() => {
    if (!linkedTravelerId || showAllEvents) return trip.events;
    return trip.events.filter(e =>
      !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(linkedTravelerId)
    );
  }, [trip.events, linkedTravelerId, showAllEvents]);

  const grouped = visibleEvents.reduce<Record<string, typeof trip.events>>((acc, ev) => {
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
        headerTintColor: "#fff",
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? {
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
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, {
            backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(245,246,250,0.97)",
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
          <Animated.View style={[StyleSheet.absoluteFill, heroImageStyle]}>
            {Platform.OS === "ios" && Link.AppleZoomTarget ? (
              <Link.AppleZoomTarget>
                <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={{ top: "35%", left: "50%" }} />
              </Link.AppleZoomTarget>
            ) : (
              <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={{ top: "35%", left: "50%" }} />
            )}
          </Animated.View>
          <LinearGradient
            colors={["rgba(0,0,0,0.2)", "transparent"]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.15 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.85)"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0.4 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />


          {/* Bottom: eyebrow + title + frosted glass chips — fades on scroll */}
          <Animated.View style={[styles.heroContent, heroContentStyle]}>
            <View style={styles.heroEyebrowRow}>
              {brand.logoUrl ? (
                <Image source={{ uri: brand.logoUrl }} style={{ width: 10, height: 10, borderRadius: 2 }} />
              ) : (
                <Logo size={10} color={C.teal} />
              )}
              <Text style={styles.heroEyebrow}>{brand.name} · Itinerary</Text>
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
                  {" – "}
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

        {/* ── Organiser contact card ── */}
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
          <ScalePress style={styles.mapSection} onPress={openInMaps} accessibilityRole="button" accessibilityLabel="Open location in Maps">
            <View style={styles.sectionHeader}>
              <MapTrifold size={13} color={C.teal} weight="regular" />
              <MicroLabel>Location</MicroLabel>
              <View style={{ flex: 1 }} />
              <MicroLabel color={C.tealText}>Open in Maps ›</MicroLabel>
            </View>
            <View style={[styles.mapWrap, shadow("card", isDark)]}>
              <MapboxGL.MapView
                key={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
                styleURL={MAP_STYLE}
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
                <MapboxGL.StyleImport
                  id="basemap"
                  existing
                  config={{
                    lightPreset: isDark ? "night" : "day",
                    showPointOfInterestLabels: false,
                    showTransitLabels: false,
                    showPlaceLabels: true,
                    showRoadLabels: false,
                    show3dObjects: false,
                  } as any}
                />
                <MapboxGL.Camera
                  zoomLevel={3}
                  centerCoordinate={mapCenter ?? [0, 20]}
                  pitch={0}
                  heading={0}
                  animationDuration={0}
                />
                {mapReady && mapCenter && (
                  <MapboxGL.PointAnnotation id="trip-pin" coordinate={mapCenter}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.teal, borderWidth: 2, borderColor: "#fff" }} />
                  </MapboxGL.PointAnnotation>
                )}
              </MapboxGL.MapView>
            </View>
          </ScalePress>
          </ContextMenu>
        )}


        {/* ── Itinerary — inline days with events ── */}
        <View style={styles.section}>
          <DayList grouped={grouped} trip={trip} C={C} isDark={isDark} isLeader={isLeader} start={start} end={end} nights={nights} linkedTravelerId={linkedTravelerId} showAllEvents={showAllEvents} onToggleFilter={() => setShowAllEvents(p => !p)} />
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

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const DAY_THUMB_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Airplane, hotel: Bed, activity: Compass,
  dining: ForkKnife, transfer: Car,
};

function DayList({ grouped, trip, C, isDark, isLeader, nights, linkedTravelerId, showAllEvents, onToggleFilter }: {
  grouped: Record<string, any[]>;
  trip: { id: string; name: string; events: any[]; paxCount?: string; attendees?: string; travelers?: any[] };
  C: ThemeColors;
  isDark: boolean;
  isLeader: boolean;
  start: Date;
  end: Date;
  nights: number;
  linkedTravelerId: string | null;
  showAllEvents: boolean;
  onToggleFilter: () => void;
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

  const toggle = (date: string) => {
    Haptics.selectionAsync();
    setOpenDay(prev => prev === date ? null : date);
  };

  return (
    <View>
      {/* ── Itinerary header ── */}
      <View style={{ paddingHorizontal: S.md, paddingTop: S.xl, paddingBottom: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm }}>
          <MicroLabel>ITINERARY</MicroLabel>
          <Text style={{ fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary }}>
            Day {currentDay} of {totalDays}  ·  {completed}/{totalEvents} done
          </Text>
        </View>
        <View style={{ height: 3, backgroundColor: C.elevated, borderRadius: R.full, overflow: "hidden" }}>
          <View style={{
            height: 3, backgroundColor: C.teal, borderRadius: R.full,
            width: `${Math.min((completed / Math.max(totalEvents, 1)) * 100, 100)}%` as any,
          }} />
        </View>
      </View>

      {/* Per-traveler filter toggle */}
      {linkedTravelerId && trip.events.some(e => e.assignedTo && e.assignedTo.length > 0) && (
        <View style={{ paddingHorizontal: S.md, marginBottom: S.sm }}>
          <Pressable
            onPress={() => { onToggleFilter(); Haptics.selectionAsync(); }}
            accessibilityRole="button"
            accessibilityLabel={showAllEvents ? "Show only your events" : "Show all events"}
            accessibilityState={{ selected: !showAllEvents }}
            style={{
              flexDirection: "row", alignItems: "center", gap: S.xs,
              paddingVertical: S.xs, paddingHorizontal: S.sm,
              backgroundColor: showAllEvents ? C.elevated : C.tealDim,
              borderRadius: R.full, alignSelf: "flex-start",
            }}
          >
            <View style={{
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: showAllEvents ? C.textTertiary : C.teal,
            }} />
            <Text style={{
              fontSize: T.xs, fontWeight: T.bold,
              color: showAllEvents ? C.textTertiary : C.tealText,
              letterSpacing: 0.8, textTransform: "uppercase",
            }}>
              {showAllEvents ? "All events" : "Your events"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Day cards ── */}
      <View style={{ paddingHorizontal: S.md, gap: S.sm }}>
        {sortedDays.map(([date, events]) => {
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

          const photo = events.find((e: any) => e.image)?.image || null;
          const FallbackIcon = DAY_THUMB_ICONS[events[0]?.type] || MapTrifold;
          const gradHue = hashStr(events[0]?.title || date) % 360;

          return (
            <View key={date}>
              <ScalePress
                onPress={() => toggle(date)}
                accessibilityRole="button"
                accessibilityLabel={`${weekday} ${fullDate}, ${events.length} event${events.length !== 1 ? "s" : ""}`}
                accessibilityState={{ expanded: isOpen }}
                style={{
                  height: 140,
                  borderRadius: R.xl,
                  overflow: "hidden",
                  ...shadow("card", isDark),
                }}
              >
                {photo ? (
                  <CachedImage uri={photo} style={StyleSheet.absoluteFill} />
                ) : (
                  <LinearGradient
                    colors={[`hsl(${gradHue}, 35%, ${isDark ? 22 : 55}%)`, `hsl(${(gradHue + 40) % 360}, 30%, ${isDark ? 12 : 40}%)`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                {isPast && (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]} />
                )}
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.7)"]}
                  locations={[0.25, 1]}
                  style={StyleSheet.absoluteFill}
                />
                {!photo && (
                  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: 0.15 }}>
                    <FallbackIcon size={48} color="#fff" weight="regular" />
                  </View>
                )}

                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs, marginBottom: S["2xs"] }}>
                    <Text style={{ fontSize: T.xl, fontWeight: T.bold, color: "#fff", letterSpacing: -0.2 }}>
                      {weekday}
                    </Text>
                    {isToday && <Pill tone="accent" label="TODAY" />}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs2 }}>
                      <Text style={{ fontSize: T.sm, fontWeight: T.medium, color: "rgba(255,255,255,0.7)" }}>
                        {fullDate}
                      </Text>
                      <Text style={{ fontSize: T.sm, color: "rgba(255,255,255,0.35)" }}>·</Text>
                      <Text style={{ fontSize: T.sm, fontWeight: T.medium, color: "rgba(255,255,255,0.7)" }}>
                        {events.length} event{events.length !== 1 ? "s" : ""}
                      </Text>
                      {firstTime && (
                        <>
                          <Text style={{ fontSize: T.sm, color: "rgba(255,255,255,0.35)" }}>·</Text>
                          <Text style={{ fontSize: T.sm, fontWeight: T.medium, color: "rgba(255,255,255,0.7)" }}>
                            {firstTime}
                          </Text>
                        </>
                      )}
                    </View>
                    {icons.length > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs }}>
                        {icons.map(({ key, Icon, count }) => (
                          <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                            <Icon size={12} color="rgba(255,255,255,0.6)" weight="regular" />
                            <Text style={{ fontSize: T["2xs"], fontWeight: T.semibold, color: "rgba(255,255,255,0.6)" }}>{count}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </ScalePress>

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
    backBtnText: { color: C.onAccent, fontWeight: T.bold, fontSize: T.base },

    // Sticky compact header
    stickyHeader: {
      position: "absolute", top: 0, left: 0, right: 0,
      zIndex: 10, overflow: "hidden",
    },
    stickyInner: {
      flex: 1, flexDirection: "row", alignItems: "center",
      paddingHorizontal: S.sm,
    },
    stickyTitle: {
      flex: 1, fontSize: T.base, fontWeight: T.bold,
      textAlign: "center", letterSpacing: -0.2,
    },

    // Hero — parallax
    hero: { height: HERO_H, position: "relative", overflow: "hidden" },
    // Bottom content
    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingBottom: S.lg,
    },
    heroEyebrow: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase",
    },
    heroEyebrowRow: {
      flexDirection: "row", alignItems: "center", gap: S.xs2, marginBottom: S.xs2,
    },
    heroTitle: {
      fontSize: T["4xl"], fontFamily: F.extrabold, textTransform: "uppercase",
      color: "#fff", letterSpacing: 0.3, marginBottom: S.sm, lineHeight: 38,
    },

    // Frosted glass chips over the hero photo
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: S.xs2 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: S["2xs"],
      backgroundColor: C.glass,
      borderWidth: 1, borderColor: C.glassBorder,
      borderRadius: R.full, paddingHorizontal: S.sm2, paddingVertical: 5,
    },
    chipText: {
      fontSize: T.xs, fontWeight: T.semibold,
      color: C.textPrimary, letterSpacing: 0.1,
    },

    // Map
    mapSection: { paddingTop: S.xl },
    mapWrap: {
      height: 240, marginHorizontal: S.md,
      borderRadius: R.xl, overflow: "hidden",
      backgroundColor: C.card,
    },

    // Section headers
    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      paddingHorizontal: S.md, paddingBottom: S.sm,
    },

    // Itinerary
    section: { paddingBottom: S.lg },

  });
}
