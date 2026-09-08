import {
  View, Text, Pressable, ActivityIndicator, ScrollView,
  StyleSheet, Platform, Linking, Share,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Link, Stack } from "expo-router";
import { CaretLeft, MapTrifold, AirplaneTakeoff, AirplaneLanding, NavigationArrow } from "phosphor-react-native";
import { Image, Linking as RNLinking } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, shadow, type ThemeColors } from "@/constants/theme";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { ScalePress } from "@/components/ScalePress";
import { geocode } from "@/services/geocode";
import { parseTripDate } from "@/shared/dates";
import { tripFactLine, shortDay, tripDays, todayKey, destinationFlag, nextEvent, untilLabel } from "@/shared/tripSummary";
import { useBrand } from "@/context/BrandContext";
import { Avatar } from "@/components/ui/Avatar";
import { OrganizerCard } from "@/components/OrganizerCard";
import { useTripRole } from "@/hooks/useTripRole";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
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
import type { TravelEvent } from "@/shared/types";

const HERO_H = 380;
const HEADER_H = 56;
const COLLAPSE_START = 180;
const COLLAPSE_END = HERO_H - HEADER_H;
const DOT = 32;

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

const isPlaceholderTime = (t?: string) => !t || /^tb[acd]$/i.test(t);

function cleanTitle(title: string): string {
  // "PG215 — Arrival into Chiang Mai (CNX)" → keep as is; strip trailing airport codes in parentheses for width
  return title.replace(/\s*\([A-Z]{3}\)\s*$/, "");
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
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const trip = trips.find(t => t.id === id);

  // ── Parallax scroll state ──
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });
  const scrollRef = useRef<any>(null);

  // Hero image: parallax (moves at 50% scroll speed) + slight scale on overscroll
  const heroImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-100, 0, HERO_H], [-50, 0, HERO_H * 0.4], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.4, 1], Extrapolation.CLAMP) },
    ],
  }));

  // Hero content (title, fact line): fade out as we scroll
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_START], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, COLLAPSE_START], [0, -30], Extrapolation.CLAMP) }],
  }));

  // Compact sticky header: fades in as hero collapses
  const stickyHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_START, COLLAPSE_END], [0, 1], Extrapolation.CLAMP),
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

  // Keep "today" fresh while the screen stays open
  const [today, setToday] = useState(todayKey);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => { setToday(todayKey()); setNow(new Date()); }, 60_000);
    return () => clearInterval(t);
  }, []);


  // Day positions inside the scroll content, for the week strip to jump to
  const timelineY = useRef(0);
  const dayY = useRef<Record<string, number>>({});
  const jumpToDay = useCallback((date: string) => {
    const y = dayY.current[date];
    if (y == null) return;
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ y: Math.max(0, timelineY.current + y - insets.top - HEADER_H - S.sm), animated: true });
  }, [insets.top]);

  const visibleEvents = useMemo(() => {
    if (!trip) return [] as TravelEvent[];
    if (!linkedTravelerId || showAllEvents) return trip.events;
    return trip.events.filter(e =>
      !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(linkedTravelerId)
    );
  }, [trip, linkedTravelerId, showAllEvents]);

  const upNext = useMemo(() => nextEvent(visibleEvents, now), [visibleEvents, now]);

  const days = useMemo(() => {
    if (!trip) return [];
    const grouped: Record<string, TravelEvent[]> = {};
    for (const ev of visibleEvents) (grouped[ev.date] ??= []).push(ev);
    for (const evs of Object.values(grouped)) evs.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    // Calendar days first, then any event dates that fall outside the trip window
    const keys = tripDays(trip);
    for (const k of Object.keys(grouped)) if (!keys.includes(k)) keys.push(k);
    keys.sort();
    return keys.map(date => ({ date, events: grouped[date] ?? [] }));
  }, [trip, visibleEvents]);

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
              {__DEV__ && (
                <Text style={[styles.errorText, { fontSize: 12 }]}>
                  DEBUG id={String(id)} · trips={trips.length} · ids={trips.map(t => t.id).join(",")} · ready={String(ready)}
                </Text>
              )}
              <Pressable onPress={safeBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
                <Text style={styles.backBtnText}>Go back</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const flag = destinationFlag(trip.destination);
  const travellers = trip.travelers ?? [];
  const parsedPax = parseInt(trip.paxCount || "", 10);
  const travellerCount = travellers.length || (isNaN(parsedPax) ? 0 : parsedPax);
  // Dim days that have passed, but only while the trip is still running; a finished trip stays readable.
  const dimPast = days.some(d => d.date >= today);
  const hasFilter = !!linkedTravelerId && trip.events.some(e => e.assignedTo && e.assignedTo.length > 0);

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
        style={[styles.stickyHeader, { paddingTop: insets.top, height: HEADER_H + insets.top }, stickyHeaderStyle]}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={95} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(245,246,250,0.97)" }]} />
        )}
        <View style={styles.stickyInner}>
          <View style={{ width: 44 }} />
          <Text style={[styles.stickyTitle, { color: C.textPrimary }]} numberOfLines={1}>{trip.name}</Text>
          <View style={{ width: 44 }} />
        </View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── The photo, blurred, sits behind the whole page; a scrim rises to the page colour ── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <CachedImage uri={trip.image} blurRadius={90} style={[StyleSheet.absoluteFill, { opacity: 0.95 }]} transition={0} />
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[`${C.bg}1a`, `${C.bg}b3`, C.bg]}
              locations={[0, 0.55, 1]}
              style={{ height: HERO_H + 300 }}
            />
            <View style={{ flex: 1, backgroundColor: C.bg }} />
          </View>
        </View>

        {/* ── Hero: parallax photo that dissolves into the wash ── */}
        <View style={styles.hero}>
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.45, 1]} style={{ flex: 1 }} />}
          >
            <Animated.View style={[StyleSheet.absoluteFill, heroImageStyle]}>
              {Platform.OS === "ios" && Link.AppleZoomTarget ? (
                <Link.AppleZoomTarget>
                  <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={{ top: "35%", left: "50%" }} />
                </Link.AppleZoomTarget>
              ) : (
                <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={{ top: "35%", left: "50%" }} />
              )}
            </Animated.View>
          </MaskedView>
          <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} locations={[0, 0.3]} style={StyleSheet.absoluteFill} />

          <Animated.View style={[styles.heroContent, heroContentStyle]}>
            {flag ? (
              <View style={styles.flagWrap} accessible={false}>
                <Text style={styles.flag}>{flag}</Text>
              </View>
            ) : null}
            {trip.destination ? <Text style={[styles.heroDest, styles.heroShadow]} numberOfLines={1}>{trip.destination}</Text> : null}
            <Text style={[styles.heroName, styles.heroShadow]} numberOfLines={2}>{trip.name}</Text>
            <Text style={[styles.heroFact, styles.heroShadow]} numberOfLines={1}>{tripFactLine(trip)}</Text>
            <Text style={[styles.heroDates, styles.heroShadow]}>{shortDay(trip.start)} → {shortDay(trip.end)}</Text>

            {/* A hosted group, not a solo plan: who is coming and who is looking after them */}
            <View style={styles.groupRow}>
              {travellers.length > 0 && (
                <View style={styles.avatars}>
                  {travellers.slice(0, 5).map((t, i) => (
                    <View key={t.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -6 }]}>
                      <Avatar size={26} initials={t.initials} color="#fff" ringColor="rgba(0,0,0,0.28)" />
                    </View>
                  ))}
                  {travellerCount > 5 && (
                    <View style={[styles.avatarSlot, styles.avatarMore, { marginLeft: -6 }]}>
                      <Text style={styles.avatarMoreText}>+{travellerCount - 5}</Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={[styles.groupText, styles.heroShadow]} numberOfLines={1}>
                {travellerCount > 0 ? `${travellerCount} traveller${travellerCount === 1 ? "" : "s"} · ` : ""}Hosted by {brand.name}
              </Text>
              {brand.logoUrl ? <Image source={{ uri: brand.logoUrl }} style={styles.hostLogo} accessible={false} /> : null}
            </View>
          </Animated.View>
        </View>

        {/* ── Week strip: one cell per day ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {days.map(({ date, events }) => {
            const d = parseTripDate(date);
            const isToday = date === today;
            const isPast = date < today;
            return (
              <Pressable
                key={date}
                onPress={() => jumpToDay(date)}
                accessibilityRole="button"
                accessibilityLabel={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${events.length} event${events.length === 1 ? "" : "s"}`}
                style={({ pressed }) => [
                  styles.stripDay,
                  isToday && styles.stripDayToday,
                  { opacity: pressed ? 0.6 : dimPast && isPast ? 0.55 : 1 },
                ]}
              >
                <Text style={[styles.stripWeekday, isToday && { color: C.tealText }]}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</Text>
                <Text style={styles.stripNumText}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Next up: the one thing a traveller needs right now ── */}
        {upNext && (
          <View style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <Text style={styles.nextEyebrow}>Next up</Text>
              <Text style={styles.nextWhen}>{untilLabel(upNext, now)}</Text>
            </View>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); router.push(`/trip/event?tripId=${trip.id}&eventId=${upNext.id}`); }}
              accessibilityRole="button"
              accessibilityLabel={`Next up: ${cleanTitle(upNext.title)}, ${untilLabel(upNext, now)}`}
              style={({ pressed }) => [styles.nextBody, { opacity: pressed ? 0.7 : 1 }]}
            >
              <CategoryDot type={upNext.type} transferType={upNext.transferType} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nextTitle} numberOfLines={2}>{cleanTitle(upNext.title)}</Text>
                <Text style={styles.nextSub} numberOfLines={1}>
                  {[isPlaceholderTime(upNext.time) ? null : upNext.time, upNext.location].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </Pressable>
            {upNext.location ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const c = upNext.locationCoords;
                  const q = c ? `${c[0]},${c[1]}` : encodeURIComponent(upNext.location);
                  RNLinking.openURL(Platform.OS === "ios" ? `maps:?q=${q}` : `geo:0,0?q=${q}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Directions to ${upNext.location}`}
                style={({ pressed }) => [styles.nextAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <NavigationArrow size={14} color={C.tealText} weight="fill" />
                <Text style={styles.nextActionText}>Directions</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* ── Per-traveller filter ── */}
        {hasFilter && (
          <View style={{ paddingHorizontal: S.md, marginBottom: S.xs }}>
            <Pressable
              onPress={() => { setShowAllEvents(p => !p); Haptics.selectionAsync(); }}
              accessibilityRole="button"
              accessibilityLabel={showAllEvents ? "Show only your events" : "Show all events"}
              accessibilityState={{ selected: !showAllEvents }}
              style={[styles.filterChip, { backgroundColor: showAllEvents ? C.elevated : C.tealDim }]}
            >
              <Text style={[styles.filterText, { color: showAllEvents ? C.textSecondary : C.tealText }]}>
                {showAllEvents ? "Showing all events" : "Showing your events"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Timeline ── */}
        <View onLayout={e => { timelineY.current = e.nativeEvent.layout.y; }}>
          {days.map(({ date, events }) => {
            const d = parseTripDate(date);
            const isToday = date === today;
            const isPast = date < today;
            return (
              <View
                key={date}
                onLayout={e => { dayY.current[date] = e.nativeEvent.layout.y; }}
                style={[styles.dayBlock, dimPast && isPast && { opacity: 0.6 }]}
              >
                <View style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>
                    {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </Text>
                  {isToday && <Pill tone="accent" size="sm" label="Today" />}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.dayHeaderMeta}>{events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "Free day"}</Text>
                </View>

                {events.length > 0 && (
                  <View style={styles.dayCard}>
                    {/* the line the category circles sit on */}
                    <View style={styles.tlLine} pointerEvents="none" />
                    {events.map((ev, i) => (
                      <View key={ev.id}>
                        {i > 0 && <View style={styles.tlSep} />}
                        <Pressable
                          onPress={() => { Haptics.selectionAsync(); router.push(`/trip/event?tripId=${trip.id}&eventId=${ev.id}`); }}
                          accessibilityRole="button"
                          accessibilityLabel={`${cleanTitle(ev.title)}${isPlaceholderTime(ev.time) ? "" : `, ${ev.time}`}`}
                          style={({ pressed }) => [styles.tlRow, { backgroundColor: pressed ? C.elevated : "transparent" }]}
                        >
                          <CategoryDot type={ev.type} transferType={ev.transferType} size={DOT} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tlTitle} numberOfLines={2}>{cleanTitle(ev.title)}</Text>
                            {ev.type === "flight" && (ev.airline || ev.flightNum) ? (
                              <Text style={styles.tlSub} numberOfLines={1}>{[ev.airline, ev.flightNum].filter(Boolean).join(" ")}</Text>
                            ) : ev.location ? (
                              <Text style={styles.tlSub} numberOfLines={1}>{ev.location}</Text>
                            ) : null}
                          </View>
                          {ev.time ? (
                            <Text style={[styles.tlTime, isPlaceholderTime(ev.time) && { color: C.textTertiary }]}>{ev.time}</Text>
                          ) : null}
                        </Pressable>

                        {/* Flights expand into departure and arrival */}
                        {ev.type === "flight" && (ev.depAirport || ev.arrAirport) ? (
                          <View style={styles.legs}>
                            <View style={styles.leg}>
                              <AirplaneTakeoff size={13} color={C.textTertiary} weight="regular" />
                              <Text style={styles.legText} numberOfLines={1}>
                                {[ev.depAirport, ev.terminal ? `Terminal ${ev.terminal}` : null].filter(Boolean).join(" · ")}
                              </Text>
                              {!isPlaceholderTime(ev.time) && <Text style={styles.legTime}>{ev.time}</Text>}
                            </View>
                            <View style={styles.leg}>
                              <AirplaneLanding size={13} color={C.textTertiary} weight="regular" />
                              <Text style={styles.legText} numberOfLines={1}>
                                {[ev.arrAirport, ev.arrTerminal ? `Terminal ${ev.arrTerminal}` : null].filter(Boolean).join(" · ")}
                              </Text>
                              {!isPlaceholderTime(ev.endTime) && <Text style={styles.legTime}>{ev.endTime}</Text>}
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Organiser ── */}
        {trip.organizer && (
          <View style={styles.section}>
            <OrganizerCard organizer={trip.organizer} C={C} isLeader={isLeader} />
          </View>
        )}

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
              <MapTrifold size={13} color={C.textTertiary} weight="regular" />
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
      </Animated.ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: {},
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    backBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.sm },
    backBtnText: { color: C.onAccent, fontWeight: T.bold, fontSize: T.base },

    // Sticky compact header
    stickyHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, overflow: "hidden" },
    stickyInner: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: S.sm },
    stickyTitle: { flex: 1, fontSize: T.base, fontWeight: T.bold, textAlign: "center", letterSpacing: -0.2 },

    // Hero
    hero: { height: HERO_H, overflow: "hidden", justifyContent: "flex-end" },
    heroContent: { paddingHorizontal: S.lg, paddingBottom: S.sm, gap: 3, alignItems: "center" },
    // The hero is always the dark photo treatment: white text on a dark scrim, in both themes
    heroShadow: {
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    },
    heroDest: {
      fontSize: T.sm, fontWeight: T.bold, color: "rgba(255,255,255,0.9)",
      textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center",
    },
    heroName: {
      fontSize: 30, lineHeight: 34, fontWeight: T.bold, color: "#fff", letterSpacing: -0.4, textAlign: "center",
    },
    heroFact: { fontSize: T.base, fontWeight: T.semibold, color: "rgba(255,255,255,0.92)", marginTop: 2, textAlign: "center" },
    heroDates: { fontSize: T.sm, color: "rgba(255,255,255,0.72)", textAlign: "center" },
    flagWrap: {
      width: 44, height: 44, borderRadius: 22, marginBottom: S.xs,
      backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
    },
    flag: { fontSize: 24, lineHeight: 30 },
    groupRow: { flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.sm },
    avatars: { flexDirection: "row", alignItems: "center" },
    avatarSlot: { borderRadius: 13, backgroundColor: "rgba(255,255,255,0.22)" },
    avatarMore: {
      width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 2, borderColor: "rgba(0,0,0,0.28)",
    },
    avatarMoreText: { fontSize: 9, fontWeight: T.bold, color: "#fff" },
    groupText: { fontSize: T.sm, fontWeight: T.medium, color: "rgba(255,255,255,0.85)", flexShrink: 1 },
    hostLogo: { width: 16, height: 16, borderRadius: 4 },

    // Next up
    nextCard: {
      marginHorizontal: S.md, marginTop: S.xs, marginBottom: S.xs,
      backgroundColor: C.card, borderRadius: R.lg, overflow: "hidden",
      ...shadow("card", isDark),
    },
    nextHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, paddingTop: S.sm2, paddingBottom: S.xs,
    },
    nextEyebrow: { fontSize: T.sm, fontWeight: T.bold, color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
    nextWhen: { fontSize: T.sm, fontWeight: T.bold, color: C.tealText, fontVariant: ["tabular-nums"] },
    nextBody: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md, paddingBottom: S.sm2 },
    nextTitle: { fontSize: T.xl, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2 },
    nextSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 2 },
    nextAction: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      paddingHorizontal: S.md, paddingVertical: S.sm2,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    },
    nextActionText: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },

    // Day rail
    strip: { paddingHorizontal: S.md, paddingTop: S.md, paddingBottom: S.sm, gap: S.xs, flexGrow: 1, justifyContent: "center" },
    stripDay: {
      width: 52, paddingTop: S.xs, paddingBottom: S.xs2, paddingHorizontal: S.xs2,
      alignItems: "center", gap: 2,
      backgroundColor: C.card, borderRadius: R.sm,
      borderWidth: 1.5, borderColor: "transparent",
    },
    stripDayToday: { borderColor: C.teal },
    stripWeekday: { fontSize: T["2xs"], fontWeight: T.semibold, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 },
    stripNumText: { fontSize: T.xl, fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },

    filterChip: { alignSelf: "flex-start", paddingVertical: S.xs, paddingHorizontal: S.sm2, borderRadius: R.sm },
    filterText: { fontSize: T.sm, fontWeight: T.semibold },

    // Timeline
    dayBlock: { marginTop: S.sm },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingHorizontal: S.md + S.xs, paddingBottom: S.xs },
    dayHeaderText: { fontSize: T.sm, fontWeight: T.bold, color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
    dayHeaderMeta: { fontSize: T.sm, color: C.textTertiary },
    dayCard: {
      marginHorizontal: S.md, backgroundColor: C.card, borderRadius: R.lg, overflow: "hidden",
      ...shadow("card", isDark),
    },
    tlLine: {
      position: "absolute", left: S.md + DOT / 2 - 1, top: S.sm + DOT / 2, bottom: S.sm + DOT / 2, width: 2,
      backgroundColor: C.border,
    },
    tlRow: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 56 },
    tlSep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: S.md + DOT + S.sm2 },
    tlTitle: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    tlSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 1 },
    tlTime: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText, fontVariant: ["tabular-nums"] },
    legs: { paddingLeft: S.md + DOT + S.sm2, paddingRight: S.md, paddingBottom: S.sm, gap: S.xs2 },
    leg: { flexDirection: "row", alignItems: "center", gap: S.xs },
    legText: { flex: 1, fontSize: T.sm, color: C.textSecondary },
    legTime: { fontSize: T.sm, color: C.textTertiary, fontVariant: ["tabular-nums"] },

    // Cards below the timeline
    section: { marginTop: S.lg },
    mapSection: { paddingTop: S.lg },
    mapWrap: { height: 240, marginHorizontal: S.md, borderRadius: R.lg, overflow: "hidden", backgroundColor: C.card },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingHorizontal: S.md, paddingBottom: S.sm },
  });
}
