import { createContext, useContext, useMemo, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { View, Text, Image, Pressable, ScrollView, StyleSheet, Platform, useWindowDimensions } from "react-native";
import type { ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Animated, {
  Easing, FadeInDown, FadeInUp, FadeOut, LinearTransition, Extrapolation, interpolate, cancelAnimation,
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { ArrowUp, Bed, Bell, CalendarDots, ChatsTeardrop, Export, FileText, Info, User } from "@/components/ui/OnboardingIcons";
import { CachedImage } from "@/components/CachedImage";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { photoPalette } from "@/components/ui/PhotoBackdrop";
import { HeroSlideshow } from "@/components/ui/HeroSlideshow";
import { Logo } from "@/components/Logo";
import { PlaneIcon } from "@/components/ui/PlaneIcon";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand } from "@/context/BrandContext";
import { useHaptic } from "@/hooks/useHaptic";
import { registerForPushNotifications } from "@/services/pushNotifications";
import { fetchTripById } from "@/services/firebaseTrips";
import { parseTripDate } from "@/shared/dates";
import { tripFactLine, shortDay } from "@/shared/tripSummary";
import { tidyTitleSeparators } from "@/shared/eventTitle";
import { areaOf } from "@/shared/eventDisplay";
import { StreamedText, TypingDots } from "@/components/DaleChat";
import type { Trip, TravelEvent } from "@/shared/types";
import { T, R, S, shadow, type ThemeColors } from "@/constants/theme";

// The SwiftUI pager needs iOS 17; older phones and the web preview get a paging ScrollView
const NATIVE_PAGER = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 17;
const PAGE_COUNT = 6;

const fmtDay = (d: string) => parseTripDate(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const hasTime = (ev: TravelEvent) => !!ev.time && !/^tb[acd]$/i.test(ev.time);
const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

/** The trip on Home: the next one that isn't a draft, else the most recent */
function pickTrip(trips: Trip[]): Trip | null {
  const sorted = [...trips].sort((a, b) => parseTripDate(a.start).getTime() - parseTripDate(b.start).getTime());
  const now = new Date();
  return sorted.filter(t => t.status !== "Draft").find(t => parseTripDate(t.end) >= now)
    ?? sorted.find(t => parseTripDate(t.end) >= now)
    ?? sorted[sorted.length - 1]
    ?? null;
}

/** Today's events while travelling, otherwise the trip's first day */
function pickDay(trip: Trip | null): { date: string; events: TravelEvent[] } | null {
  if (!trip?.events.length) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const dates = [...new Set(trip.events.map(e => e.date).filter(Boolean))].sort();
  const date = dates.find(d => d >= todayStr) ?? dates[0];
  const events = trip.events
    .filter(e => e.date === date)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  return { date, events };
}

/** Which page a piece belongs to and the pager's live position, so pieces can arrive with the swipe */
const PageCtx = createContext<{ progress: SharedValue<number>; index: number } | null>(null);

/**
 * Pieces rise into place as their page slides in, in order, following the finger: later pieces wait until
 * the page is nearer. It all runs on the UI thread, so nothing re-renders mid-swipe (which made the native
 * pager snap back) and nothing waits for the swipe to settle.
 */
function useArrive(order: number, from: "down" | "up" | "zoom" = "down") {
  const ctx = useContext(PageCtx);
  return useAnimatedStyle(() => {
    if (!ctx) return {};
    const d = Math.abs(ctx.progress.value - ctx.index);
    const v = interpolate(d, [0, Math.max(0.14, 0.62 - Math.min(order, 7) * 0.065)], [1, 0], Extrapolation.CLAMP);
    if (from === "zoom") return { opacity: v, transform: [{ scale: 0.92 + 0.08 * v }] };
    return { opacity: v, transform: [{ translateY: (1 - v) * (from === "up" ? -22 : 22) }] };
  });
}

function Reveal({ order, from = "down", style, children }: {
  shown?: boolean; order: number; from?: "down" | "up" | "zoom"; style?: any; children: ReactNode;
}) {
  const arrive = useArrive(order, from);
  return <Animated.View style={[style, arrive]}>{children}</Animated.View>;
}

export default function TourScreen() {
  const { C: themeC, isDark: themeDark } = useTheme();
  const { trips } = useTrips();
  const { prefs, setPref } = usePreferences();
  const { brand } = useBrand();
  const router = useRouter();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // ?tripId=… : a trip new to this phone. Someone who has seen the tour gets only its welcome page.
  // Read once on open, so finishing (which sets seenTour) doesn't flip the page count mid-exit.
  const params = useLocalSearchParams<{ tripId?: string }>();
  const [welcomeOnly] = useState(() => prefs.seenTour && !!params.tripId);
  const pageCount = welcomeOnly ? 1 : PAGE_COUNT;

  // A trip just joined may not be in the list yet, so fetch it while the photos play
  const [fetched, setFetched] = useState<Trip | null>(null);
  const wantedId = params.tripId || "";
  useEffect(() => {
    if (!wantedId || trips.some(t => t.id === wantedId)) return;
    fetchTripById(wantedId).then(t => { if (t) setFetched(t); }).catch(() => {});
  }, [wantedId, trips]);

  // The trip they just joined; replays from Profile use the trip on Home
  const trip = useMemo(
    () => (wantedId ? trips.find(t => t.id === wantedId) ?? (fetched?.id === wantedId ? fetched : undefined) : undefined) ?? pickTrip(trips),
    [trips, wantedId, fetched],
  );
  // Like Home, every page sits on a blurred photo, so the photo palette is used in both themes
  const C = useMemo(() => photoPalette(themeC, themeDark), [themeC, themeDark]);
  const isDark = true;
  const styles = useMemo(() => makeStyles(C), [C]);

  const day = useMemo(() => pickDay(trip), [trip]);
  const flight = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return trip?.events.find(e => e.type === "flight" && e.date >= todayStr) ?? trip?.events.find(e => e.type === "flight") ?? null;
  }, [trip]);
  // The next plan with a time, for trips with no flight
  const nextPlan = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const timed = (trip?.events ?? []).filter(hasTime).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return timed.find(e => e.date >= todayStr) ?? timed[0] ?? null;
  }, [trip]);
  const [notifGranted, setNotifGranted] = useState(false);
  useEffect(() => {
    try {
      const N = require("expo-notifications");
      N.getPermissionsAsync().then((p: { status: string }) => setNotifGranted(p.status === "granted")).catch(() => {});
    } catch { /* not available on web */ }
  }, []);

  // progress: the pager's position as a float (1.5 = halfway between pages 2 and 3), drives the parallax and the bar
  const progress = useSharedValue(0);
  const [page, setPage] = useState(0);
  const pagerRef = useRef<{ setPage: (p: number) => void } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const isLast = page === pageCount - 1;

  const land = useCallback((p: number) => {
    setPage(prev => {
      if (prev !== p) haptic.selection();
      return p;
    });
    // iOS 17 sends no scroll positions, so bring the bar and the swipe-linked pieces to the page here
    if (Math.abs(progress.value - p) > 0.02) progress.value = withTiming(p, { duration: 300 });
  }, [haptic, progress]);

  // Only the bar and parallax follow the finger; re-rendering a page mid-swipe makes the native pager snap back
  const onPosition = useCallback((pos: number) => {
    progress.value = pos;
  }, [progress]);

  const goTo = useCallback((p: number) => {
    if (NATIVE_PAGER) pagerRef.current?.setPage(p);
    else scrollRef.current?.scrollTo({ x: p * width, animated: true });
    // iOS 17 has no scroll progress events, so move the bar ourselves
    progress.value = withTiming(p, { duration: 320 });
    land(p);
  }, [width, land, progress]);

  const finish = useCallback(() => {
    haptic.medium();
    setPref("seenTour", true);
    // Every trip on the phone now counts as introduced, so only trips that arrive later get a welcome
    // ("*" marks the list as kept by this version, see the layout)
    setPref("introducedTrips", [...new Set(["*", ...prefs.introducedTrips, ...trips.map(t => t.id), ...(trip ? [trip.id] : [])])]);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [haptic, setPref, router, prefs.introducedTrips, trips, trip]);

  const onPrimary = useCallback(async () => {
    haptic.light();
    if (!isLast) { goTo(page + 1); return; }
    if (!notifGranted && !welcomeOnly) await registerForPushNotifications({ prompt: true });
    finish();
  }, [haptic, isLast, goTo, page, notifGranted, welcomeOnly, finish]);

  const firstName = (prefs.name || "").trim().split(/\s+/)[0];
  const organiser = trip?.organizer?.company || (brand.name !== "Dalefy" ? brand.name : "") || trip?.organizer?.name || "";
  const name = firstName ? `${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : "";
  const welcomeBody = welcomeOnly
    ? (trip ? `${organiser || "Your organiser"} has planned ${trip.name} for you. Everything for it is ready in the app.` : "Your new trip is ready in the app.")
    : trip
      ? `${organiser || "Your organiser"} has planned ${trip.name} for you. Here's a quick look at how the app works.`
      : "Here's a quick look at how the app works, so you're ready when your trip is.";

  const pages: { key: string; title: string; body: string; hero?: boolean; fill?: boolean; preview: (shown: boolean, active: boolean) => ReactNode }[] = [
    {
      key: "welcome",
      title: welcomeOnly ? (name ? `Welcome back, ${name}` : "Welcome back") : (name ? `Welcome, ${name}` : "Welcome aboard"),
      body: welcomeBody,
      hero: true,
      preview: () => null,
    },
    {
      key: "home",
      title: "Your trip, all in one place",
      body: "Flights, hotels, transfers and the plan for every day. Your organiser keeps it current, so what you see is always the latest.",
      preview: (shown, active) => <HomePreview trip={trip} day={day} C={C} isDark={isDark} shown={shown} active={active} />,
    },
    {
      key: "today",
      title: "Always know what's next",
      body: "Today shows what's coming up and when to be ready. Tap any plan for the address, your tickets and directions.",
      preview: (shown, active) => <TodayPreview day={day} C={C} styles={styles} shown={shown} active={active} />,
    },
    {
      key: "dale",
      title: "Ask Dale anything",
      body: "Dale is your trip concierge. Ask about times, places or what to pack, and the answer comes straight from your itinerary.",
      preview: (shown, active) => <DalePreview trip={trip} flight={flight} nextPlan={nextPlan} C={C} active={active} />,
    },
    {
      key: "gallery",
      // The album sizes itself to the space, so it doesn't need shrinking
      fill: true,
      title: "Every moment, shared",
      body: "Add your photos and see everyone else's from the trip, together in one album and sorted by day.",
      preview: (shown, active) => <GalleryPreview photos={HOLIDAY_PHOTOS} C={C} shown={shown} active={active} screenWidth={width} />,
    },
    {
      key: "alerts",
      title: "We'll keep you on time",
      body: "A nudge before pickups and flights, a note if plans change, and your flight live on the Lock Screen. You can change this in Profile anytime.",
      preview: (shown, active) => <AlertsPreview trip={trip} flight={flight} nextPlan={nextPlan} C={C} isDark={isDark} shown={shown} active={active} />,
    },
  ];

  // Each page has its own photo behind it; they blend into each other as you swipe
  // The trip's own cover behind every page, as on Home; other photos blur to grey under the shade
  const backdrops: (number | string)[] = [trip?.image || HOLIDAY_PHOTOS[1]];

  const pageViews = pages.slice(0, pageCount).map((p, i) => (
    <PageCtx.Provider key={p.key} value={{ progress, index: i }}>{p.hero ? (
    // Welcome: the words sit low on the full-screen photo, just above the button
    <View style={[styles.page, { width, justifyContent: "flex-end" }]}>
      <Reveal order={0} style={[pv.heroLogo, { backgroundColor: brand.logoUrl ? "#fff" : "rgba(10,10,12,0.55)" }]}>
        {brand.logoUrl ? <CachedImage uri={brand.logoUrl} style={{ width: 46, height: 46 }} accessible={false} /> : <Logo size={24} color="#fff" />}
      </Reveal>
      <CopyBlock index={i} progress={progress} width={width} title={p.title} body={p.body} styles={styles} />
    </View>
  ) : (
    <View style={[styles.page, { width }]}>
      {/* The live preview plays on a phone up top; the words sit low, just above the button, as on the welcome page */}
      <Parallax index={i} progress={progress} width={width} style={styles.previewArea}>
        <PhoneFrame />
        {p.fill ? p.preview(true, page === i) : <FitBox>{p.preview(true, page === i)}</FitBox>}
      </Parallax>
      <CopyBlock index={i} progress={progress} width={width} title={p.title} body={p.body} styles={styles} />
    </View>
  )}</PageCtx.Provider>
  ));

  let pager: ReactNode;
  if (NATIVE_PAGER) {
    const { PagerView } = require("@expo/ui/community/pager-view");
    pager = (
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        onPageScroll={(e: { nativeEvent: { position: number; offset: number } }) => onPosition(e.nativeEvent.position + e.nativeEvent.offset)}
        onPageSelected={(e: { nativeEvent: { position: number } }) => land(e.nativeEvent.position)}
      >
        {pageViews}
      </PagerView>
    );
  } else {
    pager = (
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // Keep animated preview children mounted as pages enter from offscreen.
        removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={e => onPosition(e.nativeEvent.contentOffset.x / width)}
        onMomentumScrollEnd={e => land(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {pageViews}
      </ScrollView>
    );
  }

  const primaryLabel = welcomeOnly ? "See your trip" : isLast ? (notifGranted ? "Get started" : "Turn on notifications") : "Continue";
  const secondaryLabel = welcomeOnly ? null : isLast ? (notifGranted ? null : "Not now") : "Skip";

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, S.md) }]}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {backdrops.map((src, i) => <BackdropLayer key={i} index={i} progress={progress} source={src} still />)}
        <WelcomeHero progress={progress} active={page === 0} />
      </View>
      <View style={[styles.progressRow, welcomeOnly && { opacity: 0 }]} accessible={!welcomeOnly} accessibilityLabel={`Page ${page + 1} of ${pageCount}`}>
        {pages.slice(0, pageCount).map((p, i) => <ProgressSegment key={p.key} index={i} progress={progress} C={C} />)}
      </View>
      {pager}
      <View style={styles.footer}>
        <Pressable
          onPress={onPrimary}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
        >
          {isLast && !notifGranted ? <Bell size={17} color={C.onAccent} weight="bold" /> : null}
          <Text style={styles.ctaText}>{primaryLabel}</Text>
        </Pressable>
        <Pressable
          onPress={finish}
          style={({ pressed }) => [styles.secondary, { opacity: secondaryLabel ? (pressed ? 0.6 : 1) : 0 }]}
          disabled={!secondaryLabel}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel ?? undefined}
        >
          <Text style={styles.secondaryText}>{secondaryLabel ?? " "}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * How far the phone sits in from the page edges. Each preview's main card spans the full page, so it breaks
 * out past the phone's sides; everything else stays inside the screen.
 */
const PHONE_INSET = 30;
const IN_PHONE = PHONE_INSET + S.sm;

/** A phone with no edges, just a lighter screen that fades away towards the words */
function PhoneFrame() {
  return (
    <Reveal order={0} from="zoom" style={pv.phone}>
      <LinearGradient
        colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0)"]}
        locations={[0, 0.4, 0.72]}
        style={StyleSheet.absoluteFill}
      />
      <View style={pv.island} />
    </Reveal>
  );
}

/** Shrinks a preview that's taller than the phone's screen (iPhone SE, mini) so nothing gets cut off */
function FitBox({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState(0);
  const [natural, setNatural] = useState(0);
  const s = room && natural > room ? room / natural : 1;
  return (
    <View style={{ flex: 1, alignSelf: "stretch" }} onLayout={e => setRoom(e.nativeEvent.layout.height)}>
      {/* Scaled about the top edge, so it still starts just under the island */}
      <View onLayout={e => setNatural(e.nativeEvent.layout.height)} style={{ transform: [{ translateY: (-natural * (1 - s)) / 2 }, { scale: s }] }}>
        {children}
      </View>
    </View>
  );
}

/** The preview drifts slower than the page and eases back a little as it leaves, so the swipe has depth */
function Parallax({ index, progress, width, style, children }: {
  index: number; progress: SharedValue<number>; width: number; style: any; children: ReactNode;
}) {
  const anim = useAnimatedStyle(() => {
    const d = progress.value - index;
    return {
      // Gone by two-thirds of the way across, so a leaving preview never lingers over the next page
      opacity: interpolate(Math.abs(d), [0, 0.65], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(d, [-1, 0, 1], [-width * 0.2, 0, width * 0.2], Extrapolation.CLAMP) },
        { scale: interpolate(Math.abs(d), [0, 1], [1, 0.94], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** The same blur and shade as Home's photo backdrop; each page's layer fades in as that page arrives */
function BackdropLayer({ index, progress, source, still }: { index: number; progress: SharedValue<number>; source: number | string; still?: boolean }) {
  const { width, height } = useWindowDimensions();
  const fade = useAnimatedStyle(() => ({
    opacity: still ? 1 : interpolate(Math.abs(progress.value - index), [0, 1], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]}>
      {typeof source === "string" ? (
        // The trip's cover, through the cache and the resizer like everywhere else
        <CachedImage uri={source} blurRadius={70} transition={0} style={{ position: "absolute", top: 0, left: 0, width, height, transform: [{ scale: 1.12 }] }} accessible={false} />
      ) : (
        <Image
          source={source}
          blurRadius={70}
          resizeMode="cover"
          style={{ position: "absolute", top: 0, left: 0, width, height, transform: [{ scale: 1.12 }] }}
          accessible={false}
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(8,8,10,0.66)" }]} />
    </Animated.View>
  );
}

/** The welcome page's photos (the same slideshow as sign-in), fading away as the next page slides in */
function WelcomeHero({ progress, active }: { progress: SharedValue<number>; active: boolean }) {
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.7], [1, 0], Extrapolation.CLAMP) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]}>
      <HeroSlideshow active={active} />
      {/* Dark at the top for the status bar and progress, and low down where the words sit */}
      <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]} locations={[0, 0.22]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.88)"]} locations={[0.35, 0.62, 1]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/**
 * The headline arrives a word at a time, then the line under it. While swiping, the words travel a little
 * faster than the page and fade, so they lead the way out and follow the new page in.
 */
function CopyBlock({ index, progress, width, title, body, styles }: {
  index: number; progress: SharedValue<number>; width: number; title: string; body: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  const drift = useAnimatedStyle(() => {
    const d = progress.value - index;
    return { transform: [{ translateX: interpolate(d, [-1, 0, 1], [width * 0.25, 0, -width * 0.25], Extrapolation.CLAMP) }] };
  });
  const words = title.split(" ");
  return (
    <Animated.View style={[styles.copy, drift]}>
      <View style={pv.titleRow} accessible accessibilityRole="header" accessibilityLabel={title}>
        {words.map((w, j) => <Word key={j} order={j * 0.5} style={styles.title}>{w}{j < words.length - 1 ? " " : ""}</Word>)}
      </View>
      <Word order={words.length * 0.5 + 0.5} style={styles.body}>{body}</Word>
    </Animated.View>
  );
}

function Word({ order, style, children }: { order: number; style: any; children: ReactNode }) {
  const arrive = useArrive(order);
  return <Animated.Text style={[style, arrive]}>{children}</Animated.Text>;
}

/** One bar per page; it fills as you swipe towards that page */
function ProgressSegment({ index, progress, C }: { index: number; progress: SharedValue<number>; C: ThemeColors }) {
  const fill = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [index - 1, index], [0, 100], Extrapolation.CLAMP)}%`,
  }));
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: C.elevated, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: 2, backgroundColor: C.textPrimary }, fill]} />
    </View>
  );
}

// ── Previews: the traveler's own trip, drawn the way the app draws it, each with a gentle loop while on screen ──

/** Runs `start` while the page is on screen and stops the loop when it leaves */
function useLoop(active: boolean, start: () => void, stop: () => void) {
  useEffect(() => {
    if (active) start();
    else stop();
    return stop;
  }, [active]);
}

type HomeMode = -1 | 0 | 1 | 2;

/**
 * The trip card with Home's three buttons under it. Each button lights up in turn and does its job on the
 * card: Itinerary slides up the day, Info shows where you're staying and who to call, Share shows how to
 * send the plan. Then the photo again.
 */
function HomePreview({ trip, day, C, active }: {
  trip: Trip | null; day: { date: string; events: TravelEvent[] } | null; C: ThemeColors; isDark: boolean; shown?: boolean; active: boolean;
}) {
  // A slow push-in on the cover photo, back and forth
  const zoom = useSharedValue(1);
  useLoop(active,
    () => { zoom.value = withRepeat(withTiming(1.12, { duration: 7000, easing: Easing.inOut(Easing.quad) }), -1, true); },
    () => { cancelAnimation(zoom); });
  const kenBurns = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));

  const [mode, setMode] = useState<HomeMode>(-1);
  useEffect(() => {
    if (!active) { setMode(-1); return; }
    const order: HomeMode[] = [0, 1, 2, -1];
    let i = 0;
    const kick = setTimeout(() => setMode(order[0]), 450);
    const t = setInterval(() => { i = (i + 1) % order.length; setMode(order[i]); }, 2300);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, [active]);

  // The trip's name steps aside while a panel is up, so it doesn't show through it
  const titleShown = useSharedValue(1);
  useEffect(() => { titleShown.value = withTiming(mode >= 0 ? 0 : 1, { duration: 220 }); }, [mode, titleShown]);
  const titleFade = useAnimatedStyle(() => ({ opacity: titleShown.value }));

  const hotel = trip?.events.find(e => e.type === "hotel");
  const plans = (day?.events ?? []).slice(0, 3);
  const notes = trip?.info?.length ?? 0;

  return (
    <View style={{ alignSelf: "stretch" }}>
    <Reveal order={0} from="zoom" style={[pv.photoCard, { backgroundColor: C.card }, pv.lift]}>
      <View style={pv.photoClip}>
      {trip?.image ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, kenBurns]}>
            <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} />
          </Animated.View>
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, kenBurns]}>
            <Image source={HOLIDAY_PHOTOS[1]} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          </Animated.View>
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
        </>
      )}
      <Animated.View style={[pv.photoText, titleFade]}>
        {trip?.destination ? <Text style={pv.photoEyebrow} numberOfLines={1}>{trip.destination.toUpperCase()}</Text> : null}
        <Text style={pv.photoTitle} numberOfLines={2}>{trip?.name ?? "Your next trip"}</Text>
        {trip ? <Text style={pv.photoFact} numberOfLines={1}>{tripFactLine(trip)}</Text> : null}
        {trip ? <Text style={pv.photoDates}>{shortDay(trip.start)} – {shortDay(trip.end)}</Text> : null}
      </Animated.View>

      {mode >= 0 ? (
        <Animated.View
          key={mode}
          entering={FadeInDown.duration(320).easing(Easing.out(Easing.cubic))}
          exiting={FadeOut.duration(180)}
          style={pv.cardPanel}
        >
          {mode === 0 ? (
            <>
              <Text style={pv.panelHead}>{day?.date ? fmtDay(day.date) : "Day 1"}</Text>
              {(plans.length ? plans : SAMPLE_DAY).map(ev => (
                <View key={ev.id} style={pv.panelRow}>
                  <CategoryDot palette={C} type={ev.type} transferType={ev.transferType} size={24} />
                  <Text style={pv.panelText} numberOfLines={1}>{tidyTitleSeparators(ev.title)}</Text>
                  <Text style={[pv.panelTime, { color: C.tealText }]}>{hasTime(ev) ? ev.time : "TBC"}</Text>
                </View>
              ))}
            </>
          ) : mode === 1 ? (
            <>
              <View style={pv.panelRow}>
                <Bed size={18} color="#fff" weight="fill" />
                <Text style={pv.panelLabel}>Staying at</Text>
                <Text style={pv.panelValue} numberOfLines={1}>{hotel ? tidyTitleSeparators(hotel.title) : "Shared soon"}</Text>
              </View>
              <View style={pv.panelRow}>
                <User size={18} color="#fff" weight="fill" />
                <Text style={pv.panelLabel}>Organiser</Text>
                <Text style={pv.panelValue} numberOfLines={1}>{trip?.organizer?.name?.trim() || "Your organiser"}</Text>
              </View>
              <View style={pv.panelRow}>
                <FileText size={18} color="#fff" weight="fill" />
                <Text style={pv.panelLabel}>Trip notes</Text>
                <Text style={pv.panelValue} numberOfLines={1}>{notes ? `${notes} to read` : "Visas, money, packing"}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={pv.panelRow}>
                <Export size={18} color="#fff" weight="bold" />
                <Text style={[pv.panelText, { fontWeight: T.semibold }]}>Share the plan</Text>
              </View>
              <Text style={pv.panelBody}>Send the itinerary to family, so they always know where you are.</Text>
              {trip?.shortCode ? <Text style={[pv.panelTime, { color: C.tealText }]}>Trip code {trip.shortCode}</Text> : null}
            </>
          )}
        </Animated.View>
      ) : null}
      </View>
    </Reveal>
    <HomeActions mode={mode} />
    </View>
  );
}

const HOME_ACTIONS = [
  { label: "Itinerary", Icon: CalendarDots },
  { label: "Info", Icon: Info },
  { label: "Share", Icon: Export },
] as const;

/** Home's three round buttons; the one in use is lit, with a tap ripple and a tick */
function HomeActions({ mode }: { mode: HomeMode }) {
  const haptic = useHaptic();
  const lit = useSharedValue(-1);
  // One ripple per button (the list is fixed at three)
  const taps = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  useEffect(() => {
    lit.value = mode;
    if (mode < 0) return;
    haptic.selection();
    taps[mode].value = withSequence(withTiming(0, { duration: 1 }), withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  return (
    <View style={pv.actions}>
      {HOME_ACTIONS.map((a, i) => (
        <Reveal key={a.label} order={i + 1} style={pv.action}>
          <ActionCircle index={i} lit={lit} tap={taps[i]} Icon={a.Icon} />
          <Text style={pv.actionLabel}>{a.label}</Text>
        </Reveal>
      ))}
    </View>
  );
}

/**
 * Home's solid circle (the fallback Home uses without Liquid Glass). The glass version renders nothing
 * inside the pager, which left the icons floating with no circle.
 */
function ActionCircle({ index, lit, tap, Icon }: { index: number; lit: SharedValue<number>; tap: SharedValue<number>; Icon: typeof Info }) {
  const pulse = useAnimatedStyle(() => {
    const on = lit.value === index ? 1 : 0;
    return { transform: [{ scale: withTiming(on ? 1.12 : 1, { duration: 260, easing: Easing.out(Easing.cubic) }) }] };
  });
  // A ring spreading out from the button, like a finger has just tapped it
  const ripple = useAnimatedStyle(() => ({
    opacity: interpolate(tap.value, [0, 0.15, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(tap.value, [0, 1], [1, 1.75]) }],
  }));
  return (
    <Animated.View style={pulse}>
      <Animated.View pointerEvents="none" style={[pv.actionRipple, ripple]} />
      <View style={pv.actionCircle}>
        <Icon size={22} color="#fff" weight="fill" />
      </View>
    </Animated.View>
  );
}

const SAMPLE_DAY: TravelEvent[] = [
  { id: "s1", type: "transfer", date: "", time: "09:30", title: "Airport transfer", location: "Hotel lobby" },
  { id: "s2", type: "activity", date: "", time: "11:00", title: "City walking tour", location: "Old Town" },
  { id: "s3", type: "dining", date: "", time: "19:30", title: "Welcome dinner", location: "Hotel restaurant" },
];

function TodayPreview({ day, C, styles, shown, active }: {
  day: { date: string; events: TravelEvent[] } | null; C: ThemeColors; styles: ReturnType<typeof makeStyles>; shown: boolean; active: boolean;
}) {
  const all = day?.events.length ? day.events : SAMPLE_DAY;
  const nextEv = all.find(hasTime) ?? all[0];
  // The list picks up after the plan in the Next up card, as Home's "Then on" list does
  const events = all.filter(e => e.id !== nextEv.id).slice(0, 3);
  // The highlight walks down the day, one plan at a time, the way the day itself unfolds
  const current = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const haptic = useHaptic();
  useLoop(active,
    () => {
      let i = 0;
      current.value = 0;
      timer.current = setInterval(() => {
        i = (i + 1) % events.length;
        haptic.selection();
        current.value = withTiming(i, { duration: 450, easing: Easing.out(Easing.cubic) });
      }, 1400);
    },
    () => { if (timer.current) clearInterval(timer.current); timer.current = null; });
  const next = nextEv;
  const ready = readyBy(next);
  const left = useCountdown(active);
  return (
    <View style={{ alignSelf: "stretch" }}>
      <Reveal order={0} style={[pv.nextCard, { backgroundColor: C.card, borderColor: C.border }, pv.lift]}>
        <View style={pv.nextTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[pv.nextLabel, { color: C.textTertiary }]}>Next up</Text>
            <Text style={[pv.nextTitle, { color: C.textPrimary }]} numberOfLines={1}>{tidyTitleSeparators(next.title)}</Text>
            <Text style={[pv.bannerSub, { color: C.textSecondary }]} numberOfLines={1}>
              {[next.location, hasTime(next) ? next.time : null].filter(Boolean).join(", ")}
            </Text>
          </View>
          <CategoryDot palette={C} type={next.type} transferType={next.transferType} size={40} />
        </View>
        <View style={[pv.nextBottom, { borderTopColor: C.border }]}>
          {ready ? (
            <View style={{ flex: 1 }}>
              <Text style={[pv.nextSmall, { color: C.textTertiary }]}>{ready.label}</Text>
              <Text style={[pv.nextReady, { color: C.textPrimary }]}>{ready.time}</Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[pv.nextSmall, { color: C.textTertiary }]}>Time to go</Text>
            <Text style={[pv.nextCountdown, { color: C.tealText }]}>{clock(left)}</Text>
          </View>
        </View>
      </Reveal>
      <View style={{ marginHorizontal: IN_PHONE }}>
      <Reveal order={1} style={[styles.cardHeader, { marginTop: S.lg }]}>
        <Text style={styles.cardTitle}>Then on {day?.date ? fmtDay(day.date) : "day 1"}</Text>
        {events.some(ev => !hasTime(ev)) ? <Text style={styles.cardMeta}>{events.every(ev => !hasTime(ev)) ? "Times TBC" : "Some times TBC"}</Text> : null}
      </Reveal>
      {events.map((ev, i) => (
        <Reveal key={ev.id} shown={shown} order={i + 2} style={[styles.evRow, pv.todayRow, i > 0 && styles.evRowBorder]}>
          <RowGlow index={i} current={current} C={C} />
          <CategoryDot palette={C} type={ev.type} transferType={ev.transferType} />
          <View style={{ flex: 1 }}>
            <Text style={styles.evTitle} numberOfLines={1}>{tidyTitleSeparators(ev.title)}</Text>
            {ev.location ? <Text style={styles.evSub} numberOfLines={1}>{ev.location}</Text> : null}
          </View>
          {hasTime(ev) ? <Text style={styles.evTime}>{ev.time}</Text> : null}
        </Reveal>
      ))}
      </View>
    </View>
  );
}

/** When to be ready for a plan: at the airport two hours before a flight, otherwise a quarter of an hour before */
function readyBy(ev: TravelEvent): { label: string; time: string } | null {
  const m = ev.time?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const lead = ev.type === "flight" ? 120 : 15;
  const mins = (Number(m[1]) * 60 + Number(m[2]) - lead + 1440) % 1440;
  const time = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { label: ev.type === "flight" ? "At the airport by" : "Be ready by", time };
}

const COUNTDOWN_FROM = 85 * 60;

/** Seconds left, ticking down while the page is up (a sample morning, starting at 1:25:00) */
function useCountdown(active: boolean) {
  const [left, setLeft] = useState(COUNTDOWN_FROM);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setLeft(v => (v <= 1 ? COUNTDOWN_FROM : v - 1)), 1000);
    return () => clearInterval(t);
  }, [active]);
  return left;
}

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")}`;
};

function RowGlow({ index, current, C }: { index: number; current: SharedValue<number>; C: ThemeColors }) {
  const glow = useAnimatedStyle(() => {
    const near = interpolate(Math.abs(current.value - index), [0, 1], [1, 0], Extrapolation.CLAMP);
    return { opacity: near, transform: [{ scale: 0.97 + near * 0.03 }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: R.md, backgroundColor: C.elevated }, glow]} />;
}

/** People on holiday, bundled so the page never waits on the network (Unsplash, free licence) */
const HOLIDAY_PHOTOS = [
  require("@/assets/images/tour/holiday-1.jpg"), require("@/assets/images/tour/holiday-2.jpg"),
  require("@/assets/images/tour/holiday-3.jpg"), require("@/assets/images/tour/holiday-4.jpg"),
  require("@/assets/images/tour/holiday-5.jpg"), require("@/assets/images/tour/holiday-6.jpg"),
  require("@/assets/images/tour/holiday-7.jpg"), require("@/assets/images/tour/holiday-8.jpg"),
  require("@/assets/images/tour/holiday-9.jpg"), require("@/assets/images/tour/holiday-10.jpg"),
];

const TILE_GAP = S.xs;

/** Three rows of photos drifting past, each its own speed and direction, while uploads from the group pop up on top */
function GalleryPreview({ photos, C, shown, active, screenWidth }: {
  photos: number[]; C: ThemeColors; shown: boolean; active: boolean; screenWidth: number;
}) {
  // The rows share whatever height the page leaves them, so the album fills the space on any phone
  const [areaH, setAreaH] = useState(0);
  const tileH = areaH ? Math.min(210, (areaH - TILE_GAP * 2 - S.xl * 2) / 3) : 0;
  const tileW = Math.round(tileH * 0.78);
  const rows = [photos.slice(0, 4), photos.slice(4, 7), photos.slice(7)];

  // Demo names, so test or placeholder travelers on a trip never show up here
  const people = ["Priya", "Sam", "Jordan", "Ama"];
  const uploads = people.slice(0, 4).map((n, i) => `${n} added ${[4, 1, 6, 2][i]} photo${[4, 1, 6, 2][i] === 1 ? "" : "s"}`);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick(v => v + 1), 2600);
    return () => clearInterval(t);
  }, [active]);
  const who = people[tick % Math.min(4, people.length)];

  return (
    <View style={{ flex: 1, alignSelf: "stretch", justifyContent: "center" }} onLayout={e => setAreaH(e.nativeEvent.layout.height)}>
      {tileH > 0 ? (
        <View style={{ width: screenWidth - S.lg * 2 - PHONE_INSET * 2, marginLeft: PHONE_INSET, gap: TILE_GAP, overflow: "hidden" }}>
          {rows.map((row, r) => (
            <Reveal key={r} shown={shown} order={r} from="zoom">
              <MarqueeRow photos={row} reverse={r === 1} active={active} tileW={tileW} tileH={tileH} speed={[3400, 2800, 3800][r]} />
            </Reveal>
          ))}
        </View>
      ) : null}
      {active ? (
        <View pointerEvents="none" style={pv.uploadWrap}>
          <Animated.View
            key={tick}
            // The old pill is gone before the new one arrives, so the two never overlap
            entering={FadeInDown.delay(180).duration(360).easing(Easing.out(Easing.cubic))}
            exiting={FadeOut.duration(150)}
            style={[pv.uploadPill, { backgroundColor: "rgba(20,20,24,0.82)", borderColor: C.border }]}
          >
            <View style={[pv.uploadAvatar, { backgroundColor: C.teal }]}>
              <Text style={[pv.uploadInitial, { color: C.onAccent }]}>{who.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={[pv.uploadText, { color: C.textPrimary }]} numberOfLines={1}>{uploads[tick % uploads.length]}</Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function MarqueeRow({ photos, reverse, active, tileW, tileH, speed }: {
  photos: number[]; reverse: boolean; active: boolean; tileW: number; tileH: number; speed: number;
}) {
  const span = photos.length * (tileW + TILE_GAP);
  const x = useSharedValue(reverse ? -span : 0);
  useLoop(active,
    () => {
      x.value = reverse ? -span : 0;
      x.value = withRepeat(withTiming(reverse ? 0 : -span, { duration: photos.length * speed, easing: Easing.linear }), -1, false);
    },
    () => { cancelAnimation(x); });
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // The row is drawn twice so the loop has no seam
  return (
    <Animated.View style={[{ flexDirection: "row", gap: TILE_GAP }, drift]}>
      {[...photos, ...photos].map((src, i) => (
        <View key={i} style={[pv.marqueeTile, { width: tileW, height: tileH }]}>
          <Image source={src} style={{ width: tileW, height: tileH }} resizeMode="cover" accessible={false} />
        </View>
      ))}
    </Animated.View>
  );
}

type DaleExchange = { q: string; a: string; ev: TravelEvent | null };

/** Questions a traveller would ask, answered from their own trip the way Dale answers. Scripted, so the tour never calls the AI */
function daleScript(trip: Trip | null, flight: TravelEvent | null, nextPlan: TravelEvent | null): DaleExchange[] {
  const out: DaleExchange[] = [];
  const next = nextPlan ?? SAMPLE_DAY[0];
  out.push({
    q: "What's next for me?",
    a: `${tidyTitleSeparators(next.title)}${next.date ? ` on ${fmtDay(next.date)}` : ""}${hasTime(next) ? ` at ${next.time}` : ""}${next.location ? `, from ${areaOf(next.location)}` : ""}.`,
    ev: next,
  });
  const hotel = trip?.events.find(e => e.type === "hotel");
  if (hotel) {
    out.push({
      q: "Where am I staying?",
      a: `You're at ${tidyTitleSeparators(hotel.title)}${hotel.location ? ` in ${areaOf(hotel.location)}` : ""}. You check in on ${fmtDay(hotel.date)}.`,
      ev: hotel,
    });
  }
  if (flight) {
    out.push({
      q: "When's my flight?",
      a: `${flight.flightNum || tidyTitleSeparators(flight.title)} leaves on ${fmtDay(flight.date)}${hasTime(flight) ? ` at ${flight.time}` : ""}. Aim to be at the airport two hours before.`,
      ev: flight,
    });
  }
  out.push({
    q: "What should I pack?",
    a: `Light layers and comfy shoes for ${trip?.destination || "the trip"}, plus your passport and a charger. As general advice, check your organiser's notes for the full list.`,
    ev: null,
  });
  return out;
}

const TYPE_MS = 40;

/**
 * Dale on a phone: a question types itself into the message box, rises as a bubble, the dots show Dale
 * thinking, the answer writes itself out and the event it's about slides in. Then the next question.
 */
function DalePreview({ trip, flight, nextPlan, C, active }: {
  trip: Trip | null; flight: TravelEvent | null; nextPlan: TravelEvent | null; C: ThemeColors; active: boolean;
}) {
  const script = useMemo(() => daleScript(trip, flight, nextPlan), [trip, flight, nextPlan]);
  const haptic = useHaptic();
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [stage, setStage] = useState<"typing" | "thinking" | "answer" | "card">("typing");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const ask = useCallback((n: number) => {
    clear();
    const q = script[n % script.length].q;
    setIdx(n);
    setStage("typing");
    setTyped(0);
    for (let c = 1; c <= q.length; c++) at(500 + c * TYPE_MS, () => setTyped(c));
    const sent = 500 + q.length * TYPE_MS + 350;
    at(sent, () => { haptic.light(); setStage("thinking"); });
    at(sent + 1300, () => setStage("answer"));
  }, [script, haptic]);

  // Starts fresh each time the page comes on screen (ask resets everything), and stops when it leaves
  useEffect(() => {
    clear();
    if (active) at(0, () => ask(0));
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The answer has finished writing: the event slides in, then the next question starts
  const answered = useCallback(() => {
    haptic.selection();
    setStage("card");
    at(2600, () => ask(idx + 1));
  }, [haptic, ask, idx]);

  const ex = script[idx % script.length];
  const typing = stage === "typing";
  const draft = typing ? ex.q.slice(0, typed) : "";

  return (
    <View style={{ alignSelf: "stretch" }}>
      <Reveal order={0} style={[pv.daleHead, { marginHorizontal: IN_PHONE }]}>
        <View style={[pv.daleMark, { backgroundColor: C.teal }]}>
          <ChatsTeardrop size={15} color={C.onAccent} weight="fill" />
        </View>
        <Text style={[pv.daleName, { color: C.textPrimary }]}>Dale</Text>
      </Reveal>

      <View style={[pv.daleThread, { marginHorizontal: IN_PHONE }]}>
        {!typing ? (
          <Animated.View
            key={`q${idx}`}
            entering={FadeInDown.duration(300).easing(Easing.out(Easing.cubic))}
            exiting={FadeOut.duration(180)}
            style={[pv.daleQ, { backgroundColor: C.elevated }]}
          >
            <Text style={[pv.daleText, { color: C.textPrimary }]}>{ex.q}</Text>
          </Animated.View>
        ) : null}
        {stage === "thinking" ? <TypingDots C={C} /> : null}
        {stage === "answer" || stage === "card" ? (
          <Animated.View key={`a${idx}`} exiting={FadeOut.duration(180)}>
            <StreamedText text={ex.a} style={[pv.daleA, { color: C.textPrimary }]} animate={stage === "answer"} onDone={answered} />
          </Animated.View>
        ) : null}
        {stage === "card" && ex.ev ? (
          <Animated.View
            key={`e${idx}`}
            entering={FadeInDown.duration(320).easing(Easing.out(Easing.cubic))}
            exiting={FadeOut.duration(180)}
            style={[pv.daleCard, { backgroundColor: C.elevated }]}
          >
            <CategoryDot palette={C} type={ex.ev.type} transferType={ex.ev.transferType} size={32} base={C.elevated} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[pv.bannerTitle, { color: C.textPrimary }]} numberOfLines={1}>{tidyTitleSeparators(ex.ev.title)}</Text>
              <Text style={[pv.bannerSub, { color: C.textSecondary }]} numberOfLines={1}>
                {[ex.ev.date ? fmtDay(ex.ev.date) : "", hasTime(ex.ev) ? ex.ev.time : ""].filter(Boolean).join(", ") || "On your itinerary"}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </View>

      {/* The message box breaks out of the phone, like each page's main card */}
      <Reveal order={1} style={[pv.daleComposer, { backgroundColor: C.card, borderColor: C.border }, pv.lift]}>
        <Text style={[pv.daleText, { flex: 1, color: draft ? C.textPrimary : C.textTertiary }]} numberOfLines={1}>
          {draft || "Message Dale"}
        </Text>
        <View style={[pv.daleSend, { backgroundColor: draft ? C.teal : C.border }]}>
          <ArrowUp size={16} weight="bold" color={draft ? C.onAccent : C.textTertiary} />
        </View>
      </Reveal>
    </View>
  );
}

type Banner = { title: string; body: string };

/** A Lock Screen three hours before the flight: the clock, the flight's Live Activity, then notifications arriving */
function AlertsPreview({ trip, flight, nextPlan, C, isDark, active }: {
  trip: Trip | null; flight: TravelEvent | null; nextPlan: TravelEvent | null; C: ThemeColors; isDark: boolean; shown?: boolean; active: boolean;
}) {
  const flightLabel = flight?.flightNum || flight?.title || "Your flight";
  // Trips without a flight (coach, rail, a city break) get the next timed plan on the Lock Screen instead
  const upcoming = flight ? null : (nextPlan ?? null);
  // Read the airports the way the flight page does: "BKK to CNX" in the location, then the airport fields.
  // Without both, the route shows the two times instead of guessing.
  const codes = (() => {
    const loc = (flight?.location || "").match(/^([A-Z]{3})\s*(?:to|→|➜|>|–|—|-)\s*([A-Z]{3})$/i);
    const iata = (v?: string) => (v && /^[A-Z]{3}$/i.test(v.trim()) ? v.trim().toUpperCase() : null);
    const dep = loc?.[1]?.toUpperCase() || iata(flight?.depAirport);
    const arr = loc?.[2]?.toUpperCase() || iata(flight?.arrAirport);
    return dep && arr ? [dep, arr] : null;
  })();
  const depTime = flight && hasTime(flight) ? flight.time : upcoming && hasTime(upcoming) ? upcoming.time : "08:05";
  const arrTime = flight?.endTime && /^\d/.test(flight.endTime) ? flight.endTime : null;
  const lockTime = (() => {
    const [hh, mm] = depTime.split(":").map(Number);
    if (!Number.isFinite(hh)) return "05:05";
    const at = (hh * 60 + (mm || 0) - (flight ? 180 : 30) + 1440) % 1440;
    return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
  })();
  const lockOn = flight?.date || upcoming?.date;
  const lockDate = lockOn
    ? parseTripDate(lockOn).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const feed: Banner[] = [
    flight
      ? { title: `${flightLabel} departs in 3 hours`, body: codes ? `From ${codes[0]}, time to head to the airport` : "Time to head to the airport" }
      : { title: `${upcoming ? tidyTitleSeparators(upcoming.title) : "Your pickup"} in 30 minutes`, body: upcoming?.location || "Your driver meets you in the hotel lobby" },
    { title: "Your itinerary was updated", body: "Dinner moved to 20:00" },
    { title: "Pickup in 30 minutes", body: "Your driver meets you in the hotel lobby" },
    { title: "Welcome to your hotel", body: "Check-in from 14:00, your room is ready" },
  ];

  // New notifications keep landing on top and push the last one down
  const [tick, setTick] = useState(1);
  const feedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedKick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const haptic = useHaptic();
  // The plane flies the route, rests on arrival, then sets off again
  const leg = useSharedValue(0);
  const [trackW, setTrackW] = useState(0);
  useLoop(active,
    () => {
      // The first one lands almost straight away, then one every few seconds
      const bump = () => { haptic.light(); setTick(t => t + 1); };
      feedKick.current = setTimeout(bump, 700);
      feedTimer.current = setInterval(bump, 2800);
      leg.value = 0;
      leg.value = withRepeat(withSequence(
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
        withDelay(700, withTiming(0, { duration: 1 })),
      ), -1, false);
    },
    () => {
      if (feedTimer.current) clearInterval(feedTimer.current);
      if (feedKick.current) clearTimeout(feedKick.current);
      feedTimer.current = null; feedKick.current = null; cancelAnimation(leg);
    });
  // Flight time in minutes, from the itinerary's duration ("1h 20m") or the two clock times
  const flightMins = (() => {
    const d = flight?.duration?.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
    const fromDur = d ? Number(d[1] || 0) * 60 + Number(d[2] || 0) : 0;
    if (fromDur > 0) return fromDur;
    const toM = (t?: string | null) => { const x = t?.match(/^(\d{1,2}):(\d{2})/); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };
    const a = toM(depTime), b = toM(arrTime);
    return a != null && b != null ? ((b - a + 1440) % 1440) || 80 : 80;
  })();
  // "Lands in 52m" follows the plane along the line
  const [landsIn, setLandsIn] = useState(`Lands in ${fmtMins(flightMins)}`);
  const [startsIn, setStartsIn] = useState("Starts in 30m");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const p = leg.value;
      setLandsIn(p >= 0.995 ? "Landed" : `Lands in ${fmtMins(Math.max(1, Math.round(flightMins * (1 - p))))}`);
      setStartsIn(p >= 0.995 ? "Starting now" : `Starts in ${fmtMins(Math.max(1, Math.round(30 * (1 - p))))}`);
    }, 200);
    return () => clearInterval(t);
  }, [active, flightMins, leg]);
  const fillStyle = useAnimatedStyle(() => ({ width: 8 + leg.value * Math.max(0, trackW - 16) }));
  const planeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: leg.value * Math.max(0, trackW - 16) }] }));

  const visible = [0, 1].map(k => {
    const n = tick - k;
    return { key: n, k, banner: feed[((n % feed.length) + feed.length) % feed.length], when: k === 0 ? "now" : "2m ago" };
  });

  return (
    <View style={{ gap: S.sm, alignSelf: "stretch" }}>
      <Reveal order={0} from="zoom" style={{ alignItems: "center", marginBottom: S.xs }}>
        <Text style={[pv.lockDate, { color: C.textSecondary }]}>{lockDate}</Text>
        <Text style={[pv.lockTime, { color: C.textPrimary }]}>{lockTime}</Text>
      </Reveal>

      {/* Live Activity: the flight's progress, the way it sits on the Lock Screen */}
      {flight ? (
      <Reveal order={1} from="up" style={[pv.activity, { backgroundColor: C.card, borderColor: C.border }, pv.lift]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs }}>
          <View style={[pv.appIconSm, { backgroundColor: C.teal }]}><Logo size={13} color={C.onAccent} /></View>
          <Text style={[pv.bannerTitle, { color: C.textPrimary, flex: 1 }]} numberOfLines={1}>{flightLabel}</Text>
          <Text style={[pv.bannerSub, { color: C.tealText, fontWeight: T.semibold }]}>On time</Text>
        </View>
        <View style={pv.routeRow}>
          <View>
            <Text style={[pv.code, { color: C.textPrimary }]}>{codes ? codes[0] : depTime}</Text>
            <Text style={[pv.bannerSub, { color: C.textSecondary }]}>{codes ? depTime : "Departs"}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={pv.trackBox} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
              <View style={[pv.trackLine, { backgroundColor: C.border }]} />
              <Animated.View style={[pv.trackFill, { backgroundColor: C.teal }, fillStyle]} />
              <Animated.View style={[pv.trackPlane, planeStyle]}><PlaneIcon size={16} color={C.textPrimary} /></Animated.View>
            </View>
            <Text style={[pv.landsIn, { color: C.textSecondary }]}>{landsIn}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[pv.code, { color: C.textPrimary }]}>{codes ? codes[1] : (arrTime ?? "--:--")}</Text>
            <Text style={[pv.bannerSub, { color: C.textSecondary }]}>{codes ? (arrTime ?? "Arrives") : "Arrives"}</Text>
          </View>
        </View>
      </Reveal>
      ) : (
        // No flight: the next plan counting down, with its own icon travelling the line
        <Reveal order={1} from="up" style={[pv.activity, { backgroundColor: C.card, borderColor: C.border }, pv.lift]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.xs }}>
            <View style={[pv.appIconSm, { backgroundColor: C.teal }]}><Logo size={13} color={C.onAccent} /></View>
            <Text style={[pv.bannerTitle, { color: C.textPrimary, flex: 1 }]} numberOfLines={1}>{upcoming ? tidyTitleSeparators(upcoming.title) : "Your pickup"}</Text>
            <Text style={[pv.bannerSub, { color: C.tealText, fontWeight: T.semibold }]}>{upcoming?.type === "transfer" || !upcoming ? "Driver on the way" : "Coming up"}</Text>
          </View>
          <View style={pv.routeRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={pv.trackBox} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
                <View style={[pv.trackLine, { backgroundColor: C.border }]} />
                <Animated.View style={[pv.trackFill, { backgroundColor: C.teal }, fillStyle]} />
                <Animated.View style={[pv.trackPlane, planeStyle]}>
                  <CategoryDot palette={C} type={upcoming?.type ?? "transfer"} transferType={upcoming?.transferType} size={18} />
                </Animated.View>
              </View>
              <Text style={[pv.landsIn, { color: C.textSecondary, textAlign: "left" }]}>{startsIn}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[pv.code, { color: C.textPrimary }]}>{depTime}</Text>
              <Text style={[pv.bannerSub, { color: C.textSecondary }]} numberOfLines={1}>{upcoming?.location ? upcoming.location.split(/\s*(?:→|,)\s*/)[0] : "Hotel lobby"}</Text>
            </View>
          </View>
        </Reveal>
      )}

      <Reveal order={2} from="up" style={{ gap: S.sm, marginHorizontal: PHONE_INSET + S.xs }}>
        {visible.map(({ key, k, banner, when }) => (
          <Animated.View
            key={key}
            entering={FadeInUp.duration(420).easing(Easing.out(Easing.cubic))}
            exiting={FadeOut.duration(200)}
            layout={LinearTransition.duration(380).easing(Easing.out(Easing.cubic))}
            // The older one sits back a little, as on the iOS Lock Screen
            style={[pv.banner, { backgroundColor: C.elevated, borderColor: C.border }, shadow("card", isDark), k === 1 && pv.bannerOlder]}
          >
            <View style={[pv.appIcon, { backgroundColor: C.teal }]}>
              <Logo size={20} color={C.onAccent} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={[pv.bannerTitle, { color: C.textPrimary, flex: 1 }]} numberOfLines={1}>{banner.title}</Text>
                <Text style={[pv.bannerWhen, { color: C.textTertiary }]}>{when}</Text>
              </View>
              {trip ? <Text style={[pv.bannerSub, { color: C.textPrimary }]} numberOfLines={1}>{trip.name}</Text> : null}
              <Text style={[pv.bannerSub, { color: C.textSecondary }]} numberOfLines={1}>{banner.body}</Text>
            </View>
          </Animated.View>
        ))}
      </Reveal>
    </View>
  );
}

const pv = StyleSheet.create({
  daleHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs, paddingBottom: S.md },
  daleMark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  daleName: { fontSize: T.md, fontWeight: T.semibold },
  // Fixed height, so the phone doesn't resize as messages come and go
  daleThread: { height: 290, gap: S.sm, overflow: "hidden" },
  daleQ: { alignSelf: "flex-end", maxWidth: "85%", borderRadius: R.lg, paddingHorizontal: S.sm2 + 4, paddingVertical: S.sm2 },
  daleText: { fontSize: T.base, lineHeight: 21 },
  daleA: { fontSize: T.base, lineHeight: 22, paddingRight: S.sm },
  daleCard: { flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.sm2, borderRadius: R.lg },
  daleComposer: {
    flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.md,
    height: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingLeft: S.md, paddingRight: 9,
  },
  daleSend: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  phone: { position: "absolute", top: 0, bottom: 0, left: PHONE_INSET, right: PHONE_INSET, borderTopLeftRadius: 46, borderTopRightRadius: 46, overflow: "hidden", alignItems: "center" },
  island: { marginTop: 12, width: 96, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)" },
  photoCard: { alignSelf: "stretch", aspectRatio: 1.15, borderRadius: R.xl },
  photoClip: { flex: 1, borderRadius: R.xl, overflow: "hidden", justifyContent: "flex-end" },
  // The card that breaks out of the phone: solid, lifted off it with a shadow that shows on dark
  lift: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
  photoText: { padding: S.lg, gap: 2, alignItems: "center" },
  photoEyebrow: { color: "rgba(255,255,255,0.85)", fontSize: T.sm, fontWeight: T.semibold, letterSpacing: 1.5 },
  photoTitle: { color: "#fff", fontSize: 26, lineHeight: 30, fontWeight: T.bold, letterSpacing: -0.4, textAlign: "center" },
  photoFact: { color: "rgba(255,255,255,0.92)", fontSize: T.base, fontWeight: T.semibold, marginTop: 2 },
  photoDates: { color: "rgba(255,255,255,0.75)", fontSize: T.sm },
  titleRow: { flexDirection: "row", flexWrap: "wrap" },
  // Company logos sit on white, as on the "Connected to" screen
  heroLogo: {
    width: 60, height: 60, borderRadius: R.lg, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: S.xs,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  cardPanel: { position: "absolute", left: S.sm, right: S.sm, bottom: S.sm, padding: S.md, gap: S.sm, borderRadius: R.lg, backgroundColor: "rgba(14,14,18,0.9)" },
  panelHead: { color: "#fff", fontSize: T.base, fontWeight: T.bold },
  panelRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  panelText: { flex: 1, color: "#fff", fontSize: T.base },
  panelTime: { fontSize: T.sm, fontWeight: T.semibold, fontVariant: ["tabular-nums"] },
  panelLabel: { color: "rgba(255,255,255,0.7)", fontSize: T.sm, width: 78 },
  panelValue: { flex: 1, color: "#fff", fontSize: T.base, fontWeight: T.semibold },
  panelBody: { color: "rgba(255,255,255,0.82)", fontSize: T.sm, lineHeight: 19 },
  actions: { flexDirection: "row", justifyContent: "center", gap: S.lg, paddingTop: S.lg, marginHorizontal: IN_PHONE },
  action: { alignItems: "center", gap: S.xs2, minWidth: 64 },
  actionCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: T.xs, fontWeight: T.medium, color: "#fff" },
  nextCard: { padding: S.md, borderRadius: R.xl, borderWidth: StyleSheet.hairlineWidth, gap: S.md },
  nextTop: { flexDirection: "row", alignItems: "center", gap: S.sm },
  nextLabel: { fontSize: T.xs, fontWeight: T.semibold, letterSpacing: 0.4 },
  nextBottom: { flexDirection: "row", alignItems: "flex-end", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: S.sm },
  nextSmall: { fontSize: T.xs, fontWeight: T.medium },
  nextReady: { fontSize: 22, fontWeight: T.bold, fontVariant: ["tabular-nums"], marginTop: 1 },
  nextCountdown: { fontSize: 28, lineHeight: 32, fontWeight: T.bold, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  actionRipple: { position: "absolute", width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: "#fff" },
  landsIn: { fontSize: T.xs, fontWeight: T.semibold, textAlign: "center", fontVariant: ["tabular-nums"] },
  trackBox: { height: 20, justifyContent: "center" },
  bannerOlder: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  nextTitle: { fontSize: 21, lineHeight: 26, fontWeight: T.bold, letterSpacing: -0.3 },
  marqueeTile: { borderRadius: R.lg, overflow: "hidden" },
  uploadWrap: { position: "absolute", left: 0, right: 0, bottom: S.sm, alignItems: "center" },
  uploadPill: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingLeft: 6, paddingRight: S.md, paddingVertical: 6, borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth },
  uploadAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  uploadInitial: { fontSize: T.sm, fontWeight: T.bold },
  uploadText: { fontSize: T.base, fontWeight: T.semibold },
  todayRow: { marginHorizontal: -S.sm, paddingHorizontal: S.sm },
  lockDate: { fontSize: T.md, fontWeight: T.semibold },
  lockTime: { fontSize: 76, lineHeight: 84, fontWeight: T.bold, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  activity: { padding: S.md, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: S.sm },
  appIconSm: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  routeRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  code: { fontSize: 26, fontWeight: T.bold, letterSpacing: -0.3 },
  trackLine: { height: 3, borderRadius: 2 },
  trackFill: { position: "absolute", left: 0, height: 3, borderRadius: 2 },
  trackPlane: { position: "absolute", left: 0 },
  banner: { flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.sm, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  appIcon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  bannerTitle: { fontSize: T.base, fontWeight: T.semibold },
  bannerWhen: { fontSize: T.xs, marginLeft: S.xs },
  bannerSub: { fontSize: T.sm },
});

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    progressRow: { flexDirection: "row", gap: S["2xs"], paddingHorizontal: S.lg, paddingTop: S.xs, paddingBottom: S.sm },
    page: { flex: 1, paddingHorizontal: S.lg },
    // Not clipped: the breakout cards' shadows reach past this box, and cutting them off drew lines down the sides
    previewArea: { flex: 1, alignItems: "center", paddingTop: 64, marginTop: S.sm },
    copy: { gap: S.xs, paddingTop: S.lg, paddingBottom: S.sm, minHeight: 150 },
    title: { fontSize: 28, lineHeight: 33, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.4 },
    body: { fontSize: T.md, lineHeight: 23, color: C.textSecondary },
    footer: { paddingHorizontal: S.lg, gap: S["2xs"] },
    // The app's own call-to-action, same as sign-in and the welcome screen
    cta: {
      height: 52, borderRadius: R.xl, backgroundColor: C.teal,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
    },
    ctaText: { fontSize: T.md, fontWeight: T.bold, color: C.onAccent },
    secondary: { alignItems: "center", paddingVertical: S.sm },
    secondaryText: { fontSize: T.base, fontWeight: T.medium, color: C.textSecondary },
    // Home's day list
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: S.xs },
    cardTitle: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2 },
    cardMeta: { fontSize: T.sm, color: C.textTertiary },
    evRow: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingVertical: S.sm, minHeight: 48 },
    evRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    evTitle: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    evSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 1 },
    evTime: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText, fontVariant: ["tabular-nums"] },
  });
}
