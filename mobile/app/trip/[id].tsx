import { PhotoBlend } from "@/components/ui/PhotoBlend";
import { heroPosition } from "@/shared/imagePosition";
import { mergeMeasuredPositions } from "@/shared/measuredPositions";
import { tidyTitleSeparators } from "@/shared/eventTitle";
import { Skeleton, ListSkeleton } from "@/components/Skeleton";
import * as Clipboard from "expo-clipboard";
import { useBannerStretch } from "@/hooks/useBannerStretch";
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Platform, Linking,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { PhotoBackdrop, PhotoDissolve, photoPalette } from "@/components/ui/PhotoBackdrop";
import * as Haptics from "@/services/haptics";
import { useLocalSearchParams, useRouter, Link, Stack } from "expo-router";
import { CaretLeft, AirplaneTakeoff, AirplaneLanding } from "phosphor-react-native";
import { Image, Linking as RNLinking } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, shadow, categoryTone, type ThemeColors } from "@/constants/theme";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { rowTitle, rowSub } from "@/shared/eventDisplay";
import { ScalePress } from "@/components/ScalePress";
import { geocode } from "@/services/geocode";
import { parseTripDate } from "@/shared/dates";
import { tripFactLine, shortDay, tripDays, todayKey, destinationFlag, nextEvent, untilLabel } from "@/shared/tripSummary";
import { useBrand } from "@/context/BrandContext";
import { Avatar } from "@/components/ui/Avatar";
import { useTripRole } from "@/hooks/useTripRole";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
import { TripQuickTiles } from "@/components/TripQuickTiles";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { TravelEvent } from "@/shared/types";

const HERO_H = 380;
const HEADER_H = 56;
const COLLAPSE_START = 180;
// iOS 26 has the native scroll edge effect; Liquid Glass availability is the same version gate
const NATIVE_EDGE = Platform.OS === "ios" && isLiquidGlassAvailable();
const COLLAPSE_END = HERO_H - HEADER_H;
const DOT = 32;
const RAIL_GAP = 5;

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
  return tidyTitleSeparators(title.replace(/\s*\([A-Z]{3}\)\s*$/, ""));
}

export default function TripScreen() {
  const { id, date: landDate } = useLocalSearchParams<{ id: string; date?: string }>();
  const { trips, ready } = useTrips();
  const router = useRouter();
  const { C: themeC, isDark: themeDark } = useTheme();
  // Invites-style: a trip with a cover photo gets a photo backdrop, so the page always uses the dark palette
  const photoPage = !!trips.find(t => t.id === id)?.image;
  // On the photo backdrop, secondary text is white at partial strength (like Invites) so it reads on any photo's colours
  const C = useMemo(() => (photoPage ? photoPalette(themeC, themeDark) : themeC), [photoPage, themeDark, themeC]);
  const isDark = photoPage || themeDark;
  const { brand } = useBrand();
  const { isLeader } = useTripRole(id);
  const linkedTravelerId = useLinkedTravelerId(id);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const insets = useSafeAreaInsets();
  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);
  const styles = useMemo(() => makeStyles(C, isDark, photoPage), [C, isDark, photoPage]);
  const trip = trips.find(t => t.id === id);

  // ── Parallax scroll state ──
  // Timeline: where each category circle's centre sits inside its day, so the rail can run circle to circle
  const [dotY, setDotY] = useState<Record<string, number>>({});
  const evWrapY = useRef<Record<string, number>>({});
  const evRowMid = useRef<Record<string, number>>({});
  const pendingDots = useRef<Record<string, number>>({});
  const dotFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (dotFrame.current !== null) cancelAnimationFrame(dotFrame.current);
    dotFrame.current = null;
    pendingDots.current = {};
  }, []);
  const syncDot = useCallback((id: string) => {
    const y = (evWrapY.current[id] ?? NaN) + (evRowMid.current[id] ?? NaN);
    if (!Number.isFinite(y)) return;
    pendingDots.current[id] = y;
    if (dotFrame.current !== null) return;
    dotFrame.current = requestAnimationFrame(() => {
      dotFrame.current = null;
      const measured = pendingDots.current;
      pendingDots.current = {};
      setDotY(prev => mergeMeasuredPositions(prev, measured));
    });
  }, []);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });
  const scrollRef = useRef<any>(null);

  // Date strip pins under the title bar once the page scrolls past it
  const stripY = useSharedValue(0);
  const stripH = useRef(0);
  const pinTop = insets.top + HEADER_H;
  // Frosted backing behind the strip, only once it has pinned under the bar
  const stripBackingStyle = useAnimatedStyle(() => ({
    opacity: stripY.value > 0 && scrollY.value >= stripY.value - pinTop ? 1 : 0,
  }));

  const { stretchStyle } = useBannerStretch(HERO_H, scrollY);

  // Preserve upward-scroll parallax; the outer photo layer handles pull-down.
  const heroImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, HERO_H], [0, HERO_H * 0.4], Extrapolation.CLAMP) },
    ],
  }));

  // Hero content (title, fact line): fade out as we scroll
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_START], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, COLLAPSE_START], [0, -30], Extrapolation.CLAMP) }],
  }));

  // Compact sticky header: fades in as hero collapses
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > COLLAPSE_END,
    (now, prev) => { if (now !== prev) runOnJS(setCollapsed)(now); },
  );
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
  const orderedDayY = useRef<[string, number][]>([]);
  // A tapped or linked day stays highlighted even when the page can't scroll it to the top
  // (the last days sit near the end); scrolling by hand hands control back to the scroll position
  const chosenDay = useRef<string | null>(null);
  const shownDay = useRef<string | null>(null);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const jumpToDay = useCallback((date: string) => {
    const y = dayY.current[date];
    if (y == null) return;
    Haptics.selectionAsync();
    chosenDay.current = date;
    shownDay.current = date;
    setActiveDay(date);
    scrollRef.current?.scrollTo({ y: Math.max(0, timelineY.current + y - insets.top - HEADER_H - stripH.current - S.sm), animated: true });
  }, [insets.top]);

  // The day being read highlights in the pinned strip
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [stripPinned, setStripPinned] = useState(false);
  useAnimatedReaction(
    () => stripY.value > 0 && scrollY.value >= stripY.value - pinTop,
    (now, prev) => { if (now !== prev) runOnJS(setStripPinned)(now); },
  );
  const updateActiveDay = useCallback((y: number) => {
    if (chosenDay.current) return;
    if (y <= 0) { shownDay.current = null; setActiveDay(null); return; }
    const line = y + insets.top + HEADER_H + stripH.current + S.md;
    const ordered = orderedDayY.current;
    let cur: string | null = null;
    for (const [date, dy] of ordered) {
      if (timelineY.current + dy <= line) cur = date;
    }
    // At the very bottom the last day is what you're looking at, even if its header never reached the top
    if (ordered.length && viewH.current && y + viewH.current >= contentH.current - 24) cur = ordered[ordered.length - 1][0];
    if (shownDay.current === cur) return;
    // A picker-style tick as each new day takes over while scrolling by hand
    if (shownDay.current && cur) Haptics.selectionAsync();
    shownDay.current = cur;
    setActiveDay(cur);
  }, [insets.top]);
  useAnimatedReaction(
    () => Math.round(scrollY.value / 24),
    (step, prev) => { if (step !== prev) runOnJS(updateActiveDay)(step * 24); },
    [updateActiveDay],
  );

  // Widget and Live Activity deep links carry ?date=; land on that day once it has been laid out
  const pendingDate = useRef<string | null>(typeof landDate === "string" && landDate ? landDate : null);
  const landOnPendingDate = useCallback(() => {
    const date = pendingDate.current;
    if (!date) return;
    const y = dayY.current[date];
    if (y == null || !timelineY.current) return;
    pendingDate.current = null;
    chosenDay.current = date;
    shownDay.current = date;
    setActiveDay(date);
    scrollRef.current?.scrollTo({ y: Math.max(0, timelineY.current + y - insets.top - HEADER_H - stripH.current - S.sm), animated: false });
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
    // Timed events go in time order; untimed ones (TBC) keep the organiser's order rather than
    // being treated as noon, so an airport transfer stays before its flight
    const timed = (ev: TravelEvent) => /^\d{1,2}:\d{2}/.test((ev.time || "").trim());
    for (const evs of Object.values(grouped)) {
      const slots = evs.map((ev, i) => (timed(ev) ? i : -1)).filter(i => i >= 0);
      const sorted = slots.map(i => evs[i]).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      slots.forEach((slot, k) => { evs[slot] = sorted[k]; });
    }
    // Calendar days first, then any event dates that fall outside the trip window
    const keys = tripDays(trip);
    for (const k of Object.keys(grouped)) if (!keys.includes(k)) keys.push(k);
    keys.sort();
    return keys.map(date => ({ date, events: grouped[date] ?? [] }));
  }, [trip, visibleEvents]);

  const renderStrip = () => (
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
            activeDay === date && styles.stripDayActive,
            { opacity: pressed ? 0.6 : dimPast && isPast ? 0.55 : 1 },
          ]}
        >
          <Text style={[styles.stripWeekday, isToday && { color: C.tealText }, activeDay === date && { color: C.bg }]}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</Text>
          <Text style={[styles.stripNumText, activeDay === date && { color: C.bg }]}>{d.getDate()}</Text>
        </Pressable>
      );
    })}
  </ScrollView>
  );

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {!ready ? (
            <View style={{ alignSelf: "stretch", flex: 1 }}>
              <Skeleton width="100%" height={300} borderRadius={0} />
              <View style={{ paddingHorizontal: S.md, gap: 10, marginTop: S.lg }}>
                <Skeleton width="70%" height={24} />
                <Skeleton width="45%" height={13} />
              </View>
              <ListSkeleton rows={5} />
            </View>
          ) : (
            <>
              <Text style={styles.errorText}>Trip not found</Text>
              {__DEV__ && (
                <Text style={[styles.errorText, { fontSize: 12 }]}>
                  DEBUG id={String(id)}, trips={trips.length}, ids={trips.map(t => t.id).join(",")}, ready={String(ready)}
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
      {photoPage && <PhotoBackdrop uri={trip.image} />}
      <Stack.Screen options={{
        headerShown: true,
        headerTransparent: true,
        // iOS 26: the system's own soft scroll edge sits behind the bar, and the trip name appears once the photo scrolls away
        title: NATIVE_EDGE && collapsed ? trip.name : "",
        headerTitleStyle: { color: C.textPrimary, fontWeight: "600" },
        ...(NATIVE_EDGE ? { scrollEdgeEffects: { top: "soft" as const, bottom: "hidden" as const, left: "hidden" as const, right: "hidden" as const } } : {}),
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: NATIVE_EDGE && collapsed ? C.textPrimary : "#fff",
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

      {/* ── Fallback sticky header for systems without the iOS 26 scroll edge effect ── */}
      {!NATIVE_EDGE && (
      <Animated.View
        pointerEvents="box-none"
        style={[styles.stickyHeader, { paddingTop: insets.top, height: HEADER_H + insets.top }, stickyHeaderStyle]}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={100} tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(245,246,250,0.97)" }]} />
        )}
        <View style={styles.stickyInner}>
          <View style={{ width: 44 }} />
          <Text style={[styles.stickyTitle, { color: C.textPrimary }]} numberOfLines={1}>{trip.name}</Text>
          <View style={{ width: 44 }} />
        </View>
      </Animated.View>
      )}

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { chosenDay.current = null; }}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
        onContentSizeChange={(_, h) => { contentH.current = h; }}
      >

        {/* ── Hero: parallax photo that dissolves into the wash ── */}
        <View style={styles.hero}>
          <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, stretchStyle]}>
            {photoPage ? (
              // The dissolve alone carries the photo into the blur; PhotoBlend's fade and dark band would fight it
              <>
              <Animated.View style={[StyleSheet.absoluteFill, heroImageStyle]}>
                {Platform.OS === "ios" && Link.AppleZoomTarget ? (
                  <Link.AppleZoomTarget>
                    <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={heroPosition(trip.imagePosition)} />
                  </Link.AppleZoomTarget>
                ) : (
                  <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={heroPosition(trip.imagePosition)} />
                )}
              </Animated.View>
                <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]} locations={[0, 0.3]} style={StyleSheet.absoluteFill} pointerEvents="none" />
              </>
            ) : (
              <PhotoBlend>
              <Animated.View style={[StyleSheet.absoluteFill, heroImageStyle]}>
                {Platform.OS === "ios" && Link.AppleZoomTarget ? (
                  <Link.AppleZoomTarget>
                    <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={heroPosition(trip.imagePosition)} />
                  </Link.AppleZoomTarget>
                ) : (
                  <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={heroPosition(trip.imagePosition)} />
                )}
              </Animated.View>
              </PhotoBlend>
            )}
            {photoPage && <PhotoDissolve uri={trip.image} scrollY={scrollY} />}
            {/* Shade behind the title block so the dates and host line hold over bright photos */}
            {photoPage && (
              <LinearGradient
                pointerEvents="none"
                // Fades back out at the foot so it melts into the page instead of ending in a line
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.36)", "rgba(0,0,0,0.36)", "rgba(0,0,0,0)"]}
                locations={[0.3, 0.6, 0.86, 1]}
                style={StyleSheet.absoluteFill}
              />
            )}
          </Animated.View>
          <Animated.View style={[styles.heroContent, heroContentStyle]}>
            {flag ? (
              <View style={styles.flagWrap} accessible={false}>
                <Text style={styles.flag}>{flag}</Text>
              </View>
            ) : null}
            {trip.destination ? <Text style={[styles.heroDest, photoPage && styles.heroShadow]} numberOfLines={1}>{trip.destination}</Text> : null}
            <Text style={[styles.heroName, photoPage && styles.heroShadow]} numberOfLines={2}>{trip.name}</Text>
            <Text style={[styles.heroFact, isDark && styles.heroShadow]} numberOfLines={1}>{tripFactLine(trip)}</Text>
            <Text style={[styles.heroDates, isDark && styles.heroShadow]}>{shortDay(trip.start)} – {shortDay(trip.end)}</Text>

            {/* A hosted group, not a solo plan: who is coming and who is looking after them */}
            <View style={styles.groupRow}>
              {travellers.length > 0 && (
                <View style={styles.avatars}>
                  {travellers.slice(0, 5).map((t, i) => (
                    <View key={t.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -6 }]}>
                      <Avatar size={26} uri={t.avatar} initials={t.initials} color="rgba(255,255,255,0.92)" solid ringColor="rgba(0,0,0,0.28)" />
                    </View>
                  ))}
                  {travellerCount > 5 && (
                    <View style={[styles.avatarSlot, styles.avatarMore, { marginLeft: -6 }]}>
                      <Text style={styles.avatarMoreText}>+{travellerCount - 5}</Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={[styles.groupText, isDark && styles.heroShadow]} numberOfLines={1}>
                {travellerCount > 0 ? `${travellerCount} traveller${travellerCount === 1 ? "" : "s"}, ` : ""}Hosted by {brand.name}
              </Text>
              {brand.logoUrl ? <Image source={{ uri: brand.logoUrl }} style={styles.hostLogo} accessible={false} /> : null}
            </View>
          </Animated.View>
        </View>

        {/* ── Week strip: one cell per day, pinned under the title bar while scrolling ── */}
        {/* ── Week strip: scrolls with the page; a fixed copy takes over once it reaches the bar ── */}
        <View onLayout={e => { stripY.value = e.nativeEvent.layout.y; stripH.current = e.nativeEvent.layout.height; }}>
          {renderStrip()}
        </View>

        {/* ── Next up: the one thing a traveller needs right now ── */}
        {upNext && (
          <View style={styles.nextCard}>
            {/* Just when: the icon beside the title already says what it is. Time, or a live countdown on the day itself */}
            <View style={styles.nextHeader}>
              <Text style={[styles.nextEyebrow, { flex: 1 }]} numberOfLines={1}>
                {upNext.date === todayKey() ? "Today" : untilLabel(upNext, now) === "Tomorrow" ? "Tomorrow" : parseTripDate(upNext.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </Text>
              {upNext.date === todayKey() ? (
                <Text style={styles.nextWhen}>{untilLabel(upNext, now)}</Text>
              ) : !isPlaceholderTime(upNext.time) && upNext.time ? (
                <Text style={[styles.nextWhen, { color: C.textPrimary }]}>{upNext.time}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => { router.push(`/trip/event?tripId=${trip.id}&eventId=${upNext.id}`); }}
              accessibilityRole="button"
              accessibilityLabel={`Next up: ${cleanTitle(upNext.title)}, ${untilLabel(upNext, now)}`}
              style={({ pressed }) => [styles.nextBody, { opacity: pressed ? 0.7 : 1 }]}
            >
              <CategoryDot palette={C} type={upNext.type} transferType={upNext.transferType} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nextTitle} numberOfLines={2}>{cleanTitle(upNext.title)}</Text>
                <Text style={styles.nextSub} numberOfLines={1}>
                  {upNext.location ? tidyTitleSeparators(upNext.location) : ""}
                </Text>
              </View>
            </Pressable>
            {upNext.type === "flight" ? (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/event?tripId=${trip.id}&eventId=${upNext.id}`); }}
                accessibilityRole="button"
                accessibilityLabel="View flight"
                style={({ pressed }) => [styles.nextAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={styles.nextActionText}>View flight</Text>
              </Pressable>
            ) : upNext.location ? (
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
                <Text style={styles.nextActionText}>Directions</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* ── Documents and the organiser, where travellers look first ── */}
        <TripQuickTiles
          C={C}
          docCount={(trip.info ?? []).filter(i => isLeader || !i.leaderOnly).length}
          onDocs={() => router.push({ pathname: "/trip/info", params: { tripId: trip.id } })}
          // The organiser is usually on the trip too, so their traveller photo stands in when they have none of their own
          organizer={trip.organizer && !trip.organizer.avatar
            ? { ...trip.organizer, avatar: trip.travelers?.find(t => t.name.trim().toLowerCase() === trip.organizer!.name.trim().toLowerCase())?.avatar }
            : trip.organizer}
          onAsk={() => router.push({ pathname: "/trip/ask", params: { tripId: trip.id } })}
        />

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
        <View onLayout={e => { timelineY.current = e.nativeEvent.layout.y; landOnPendingDate(); }}>
          {days.map(({ date, events }) => {
            const d = parseTripDate(date);
            const isToday = date === today;
            const isPast = date < today;
            return (
              <View
                key={date}
                onLayout={e => {
                  const y = e.nativeEvent.layout.y;
                  if (dayY.current[date] !== y) {
                    dayY.current[date] = y;
                    orderedDayY.current = Object.entries(dayY.current).sort((a, b) => a[1] - b[1]);
                  }
                  landOnPendingDate();
                }}
                // Past days stay full strength (fading the whole block fails contrast); only the date dims
                style={styles.dayBlock}
              >
                <View style={styles.dayHeader}>
                  <Text accessibilityRole="header" style={[styles.dayHeaderText, dimPast && isPast && { color: C.textTertiary }]}>
                    {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </Text>
                  {isToday && <Pill tone="custom" bg={C.tealDim} color={C.tealText} size="sm" label="Today" />}
                  <View style={{ flex: 1 }} />
                  {/* "Times TBC" lives here once, rather than on each row */}
                  <Text style={styles.dayHeaderMeta}>{events.length ? `${events.length} event${events.length === 1 ? "" : "s"}${events.every(e => isPlaceholderTime(e.time)) ? ", times TBC" : ""}` : "Free day"}</Text>
                </View>

                {events.length > 0 && (
                  <View style={styles.dayCard}>
                    {/* The rail: one segment per gap, fading from one stop's colour to the next and
                        stopping short of each circle, so the circles read as stops */}
                    {events.slice(1).map((ev, i) => {
                      const prev = events[i];
                      const top = dotY[prev.id], bottom = dotY[ev.id];
                      if (top == null || bottom == null) return null;
                      const y1 = top + DOT / 2 + RAIL_GAP, y2 = bottom - DOT / 2 - RAIL_GAP;
                      if (y2 - y1 < 4) return null;
                      return (
                        <LinearGradient
                          key={`rail-${ev.id}`}
                          pointerEvents="none"
                          colors={[categoryTone(prev.type, C).fg, categoryTone(ev.type, C).fg]}
                          style={[styles.tlRail, { top: y1, height: y2 - y1 }]}
                        />
                      );
                    })}
                    {events.map((ev, i) => (
                      <View key={ev.id} onLayout={e => { evWrapY.current[ev.id] = e.nativeEvent.layout.y; syncDot(ev.id); }}>
                        {i > 0 && <View style={styles.tlSep} />}
                        <Pressable
                          onPress={() => { router.push(`/trip/event?tripId=${trip.id}&eventId=${ev.id}`); }}
                          accessibilityRole="button"
                          accessibilityLabel={`${cleanTitle(ev.title)}${isPlaceholderTime(ev.time) ? "" : `, ${ev.time}`}`}
                          onLayout={e => { evRowMid.current[ev.id] = e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2; syncDot(ev.id); }}
                          style={({ pressed }) => [styles.tlRow, { backgroundColor: pressed ? C.elevated : "transparent" }]}
                        >
                          <CategoryDot palette={C} base={photoPage ? "transparent" : undefined} type={ev.type} transferType={ev.transferType} size={DOT} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tlTitle} numberOfLines={2}>{ev.type === "hotel" ? cleanTitle(ev.title).split(" – ")[0] : rowTitle(cleanTitle(ev.title), rowSub(ev))}</Text>
                            {ev.type === "flight" && (ev.airline || ev.flightNum) ? (
                              <Text style={styles.tlSub} numberOfLines={1}>{[ev.airline, ev.flightNum].filter(Boolean).join(" ")}</Text>
                            ) : rowSub(ev) ? (
                              <Text style={styles.tlSub} numberOfLines={1}>{rowSub(ev)}</Text>
                            ) : null}
                          </View>
                          {ev.time && !isPlaceholderTime(ev.time) ? (
                            <Text style={styles.tlTime}>{ev.time}</Text>
                          ) : null}
                        </Pressable>

                        {/* Flights expand into departure and arrival */}
                        {ev.type === "flight" && (ev.depAirport || ev.arrAirport) ? (
                          <View style={styles.legs}>
                            <View style={styles.leg}>
                              <AirplaneTakeoff size={13} color={C.textTertiary} weight="regular" />
                              <Text style={styles.legText} numberOfLines={1}>
                                {[ev.depAirport, ev.terminal ? `Terminal ${ev.terminal}` : null].filter(Boolean).join(", ")}
                              </Text>
                              {!isPlaceholderTime(ev.time) && <Text style={styles.legTime}>{ev.time}</Text>}
                            </View>
                            <View style={styles.leg}>
                              <AirplaneLanding size={13} color={C.textTertiary} weight="regular" />
                              <Text style={styles.legText} numberOfLines={1}>
                                {[ev.arrAirport, ev.arrTerminal ? `Terminal ${ev.arrTerminal}` : null].filter(Boolean).join(", ")}
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
              else if (e.nativeEvent.index === 1) Clipboard.setStringAsync(trip.destination || trip.name).catch(() => {});
            }}
          >
          <ScalePress style={styles.mapSection} onPress={openInMaps} accessibilityRole="button" accessibilityLabel="Open location in Maps">
            <View style={styles.sectionHeader}>
              <MicroLabel color={C.textPrimary}>Location</MicroLabel>
              <View style={{ flex: 1 }} />
              <MicroLabel color={C.tealText}>Open in Maps ›</MicroLabel>
            </View>
            <View style={[styles.mapWrap, shadow("card", isDark)]}>
              <MapboxGL.MapView
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


      {/* Fixed copy of the strip under the bar, shown once the in-page strip scrolls up to it */}
      <Animated.View
        pointerEvents={stripPinned ? "box-none" : "none"}
        style={[{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: pinTop, zIndex: 15 }, stripBackingStyle]}
      >
        {photoPage
          ? <BlurView intensity={100} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />}
        {renderStrip()}
      </Animated.View>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean, photoBackdrop = false) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: photoBackdrop ? "#000" : C.bg },
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
    hero: { height: HERO_H, justifyContent: "flex-end" },
    heroContent: { paddingHorizontal: S.lg, paddingBottom: S.sm, gap: 3, alignItems: "center" },
    // Both themes keep white text over the photo; the page fade starts below it.
    heroShadow: {
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    },
    // White sits on the photo; a trip without one shows the title on the plain page
    heroDest: {
      fontSize: T.sm, fontWeight: T.bold, color: photoBackdrop ? "rgba(255,255,255,0.9)" : C.textSecondary,
      textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center",
    },
    heroName: {
      fontSize: 30, lineHeight: 34, fontWeight: T.bold, color: photoBackdrop ? "#fff" : C.textPrimary, letterSpacing: -0.4, textAlign: "center",
    },
    heroFact: { fontSize: T.base, fontWeight: T.semibold, color: isDark ? "rgba(255,255,255,0.92)" : C.textPrimary, marginTop: 2, textAlign: "center" },
    heroDates: { fontSize: T.sm, fontWeight: T.medium, color: isDark ? "rgba(255,255,255,0.88)" : C.textPrimary, textAlign: "center" },
    flagWrap: {
      width: 44, height: 44, borderRadius: 22, marginBottom: S.xs,
      backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
    },
    flag: { fontSize: 24, lineHeight: 30 },
    groupRow: { flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.sm },
    avatars: { flexDirection: "row", alignItems: "center" },
    // Every circle opaque, photo or initials, so a stack of headshots and fallbacks reads as one row
    avatarSlot: { borderRadius: 13, backgroundColor: "rgba(255,255,255,0.92)" },
    avatarMore: {
      width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.92)",
      borderWidth: 2, borderColor: "rgba(0,0,0,0.28)",
    },
    avatarMoreText: { fontSize: 9, fontWeight: T.bold, color: "rgba(0,0,0,0.82)" },
    groupText: { fontSize: T.sm, fontWeight: T.semibold, color: isDark ? "rgba(255,255,255,0.94)" : C.textPrimary, flexShrink: 1 },
    hostLogo: { width: 16, height: 16, borderRadius: 4 },

    // Next up
    // Boxless: sections sit on the page, rows at the standard 16pt gutter
    nextCard: {
      marginTop: S.xs, marginBottom: S.xs,
    },
    nextHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, paddingTop: S.sm2, paddingBottom: S.xs,
    },
    nextEyebrow: { fontSize: T.sm, fontWeight: T.semibold, color: C.textSecondary },
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
      backgroundColor: photoBackdrop ? "rgba(255,255,255,0.12)" : C.card, borderRadius: R.sm,
      borderWidth: 1.5, borderColor: "transparent",
    },
    stripDayToday: { borderColor: C.teal },
    stripDayActive: { backgroundColor: C.textPrimary },
    stripWeekday: { fontSize: T["2xs"], fontWeight: T.semibold, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 },
    stripNumText: { fontSize: T.xl, fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },

    filterChip: { alignSelf: "flex-start", paddingVertical: S.xs, paddingHorizontal: S.sm2, borderRadius: R.sm },
    filterText: { fontSize: T.sm, fontWeight: T.semibold },

    // Timeline
    dayBlock: { marginTop: S.lg },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingHorizontal: S.md, paddingBottom: S.xs },
    dayHeaderText: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2 },
    dayHeaderMeta: { fontSize: T.sm, color: C.textTertiary },
    dayCard: {},
    tlRail: { position: "absolute", left: S.md + DOT / 2 - 1, width: 2, borderRadius: 1, opacity: 0.5 },
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
