import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, Platform, Share,
  Dimensions,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { Swipeable } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import { Avatar } from "@/components/ui/Avatar";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { CategoryDot } from "@/components/ui/CategoryDot";
import * as Haptics from "@/services/haptics";
import { useRouter, Link, useLocalSearchParams } from "expo-router";
import { parseTripDate } from "@/shared/dates";
import { daysUntil, tripFactLine, shortDay, destinationFlag } from "@/shared/tripSummary";
import { useToast } from "@/context/ToastContext";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  CalendarDots,
  ShareNetwork, Bell, Plus,
  WifiSlash,
  Info, Export,
} from "phosphor-react-native";
import { NoTripsHero } from "@/components/ui/JoinTripNote";
import { PhotoBlend } from "@/components/ui/PhotoBlend";
import { ListSkeleton } from "@/components/Skeleton";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { tidyTitleSeparators, tidyLocation } from "@/shared/eventTitle";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/components/Logo";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { ScrollViewMarker } from "react-native-screens/src/components/gamma/scroll-view-marker";
import { useNotifications } from "@/context/NotificationContext";
import { usePreferences } from "@/context/PreferencesContext";
import { type ThemeColors, T, R, S, F, TAB_BAR_HEIGHT, shadow } from "@/constants/theme";
import type { Trip, TravelEvent } from "@/shared/types";

const HERO_H = 300;
// iOS 26: the round actions under the cover use the real Liquid Glass material
const LIQUID_GLASS = isLiquidGlassAvailable();

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity",
  dining: "Dining", transfer: "Transfer",
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
};

function cleanTitle(title: string, type: string, transferType?: string): string {
  const labels = [TYPE_LABELS[transferType || ""] || "", TYPE_LABELS[type] || ""];
  for (const l of labels) {
    if (!l) continue;
    const re = new RegExp(`^${l}\\s*[-–·:]\\s*`, "i");
    title = title.replace(re, "");
  }
  return title;
}

function normaliseTitle(title: string, type: string, transferType?: string): string {
  let t = cleanTitle(title, type, transferType);
  return tidyTitleSeparators(t);
}


function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


// ── Trip Found Reveal ────────────────────────────────────────────────────────
function GreetingHero({ nextTrip, isActive, onPress, scrollY, overPhoto = !!nextTrip }: {
  nextTrip: Trip | undefined;
  isActive: boolean;
  onPress: (t: Trip) => void;
  /** Page scroll offset; the bar stays pinned to the top while the page is pulled past it */
  scrollY?: SharedValue<number>;
  /** Bar sits over a cover photo (a trip's, or the no-trips cover) rather than the page ground */
  overPhoto?: boolean;
}) {
  const { C, isDark } = useTheme();
  const { unreadCount } = useNotifications();
  const { prefs } = usePreferences();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ join?: string }>();
  useEffect(() => {
    if (params.join) router.push("/join");
  }, [params.join]);
  const styles = useMemo(() => makeGreetingStyles(C, isDark), [C, isDark]);
  // Glass circles are dark in dark mode and white in light mode; the glyph takes the opposite.
  const barIcon = isDark ? "#fff" : C.textPrimary;

  const pinTop = useAnimatedStyle(() => {
    const y = scrollY?.value ?? 0;
    return { transform: [{ translateY: y < 0 ? y : 0 }] };
  });

  return (
    <View style={[styles.outer, { paddingTop: insets.top + S.xs }]} pointerEvents="box-none">
      {/* Top bar — avatar (left) · logo (center) · + and bell (right) */}
      <Animated.View style={[styles.topBar, pinTop]}>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [styles.avatarRing, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            hitSlop={6}
          >
            <Avatar
              size={30}
              uri={prefs.avatar}
              initials={(prefs.name || "").trim().charAt(0).toUpperCase() || "?"}
            />
          </Pressable>
        </View>
        <Logo size={24} color={overPhoto ? "#fff" : C.textPrimary} />
        <View style={[styles.headerActions, { justifyContent: "flex-end" }]}>
          <IconCircleButton variant="glass" size={36}
            onPress={() => router.push("/join")}
            accessibilityLabel="Join a trip"
          >
            <Plus size={18} color={barIcon} weight="bold" />
          </IconCircleButton>
          <IconCircleButton variant="glass" size={36}
            onPress={() => router.push("/notifications")}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Bell size={18} color={barIcon} weight="fill" />
            {unreadCount > 0 && (
              <View pointerEvents="none" accessible={false} style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </IconCircleButton>
        </View>
      </Animated.View>


    </View>
  );
}

function makeGreetingStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    outer: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      paddingHorizontal: S.md,
    },
    topBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      height: 44,
    },
    avatarRing: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)",
      alignItems: "center", justifyContent: "center",
    },
    headerActions: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: S["2xs"],
    },
    unreadBadge: {
      position: "absolute", top: -4, right: -4,
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: C.textPrimary,
      borderWidth: 2, borderColor: C.card,
      alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    },
    unreadBadgeText: {
      fontSize: T["2xs"], fontWeight: "700", color: C.bg,
      lineHeight: 12,
    },
    codeSheet: {
      backgroundColor: C.card,
      paddingHorizontal: S.lg, paddingTop: S.xs, paddingBottom: S.xl,
    },
    sheetHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
      marginBottom: S.xs,
    },
    // ── Native grouped form ──
    navBar: {
      flexDirection: "row", alignItems: "center", height: 44, marginBottom: S.sm,
    },
    navSide: { width: 72, justifyContent: "center" },
    navAction: { fontSize: T.lg, color: C.tealText },
    navTitle: {
      flex: 1, textAlign: "center", fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary,
    },
    backLink: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginBottom: S.md },
    pinTitle: { fontSize: T.xl, fontWeight: T.semibold, color: C.textPrimary, textAlign: "center", marginTop: S.xs, marginBottom: S.md },
    pinBoxes: { flexDirection: "row", justifyContent: "center", gap: S.xs },
    pinBox: {
      width: 46, height: 58, borderRadius: R.lg, backgroundColor: C.elevated,
      borderWidth: 1.5, borderColor: "transparent", alignItems: "center", justifyContent: "center",
    },
    pinBoxActive: { borderColor: C.teal },
    pinBoxFilled: { backgroundColor: C.card, borderColor: C.border },
    pinBoxText: { fontSize: T["2xl"], fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"] },
    pinHiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
    pinHintRow: { flexDirection: "row", alignItems: "flex-start", gap: S.sm, paddingHorizontal: S.xs, marginTop: S.sm, marginBottom: S.lg },
    pinHint: { flex: 1, paddingHorizontal: 0, marginTop: 0, marginBottom: 0 },
    altRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.md, marginTop: S.md, marginBottom: S.lg },
    altBtn: { flexDirection: "row", alignItems: "center", gap: S.xs2, paddingVertical: S.xs },
    altDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: C.border },
    altLink: { fontSize: T.md, fontWeight: T.medium, color: C.tealText },
    group: {
      backgroundColor: C.elevated, borderRadius: R.sm, overflow: "hidden",
    },
    groupRow: {
      flexDirection: "row", alignItems: "center", minHeight: 48,
      paddingHorizontal: S.md, gap: S.sm,
    },
    rowLabel: { fontSize: T.lg, color: C.textPrimary, width: 84 },
    rowInput: {
      flex: 1, fontSize: T.lg, color: C.textPrimary, paddingVertical: S.sm,
    },
    rowInputPin: {
      letterSpacing: 3, fontVariant: ["tabular-nums"], fontWeight: T.semibold,
    },
    rowAction: { fontSize: T.lg, color: C.tealText },
    groupFooter: {
      fontSize: 13, lineHeight: 18, color: C.textTertiary,
      paddingHorizontal: S.md, marginTop: S.xs, marginBottom: S.lg,
    },
    groupHeader: {
      fontSize: 13, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.3,
      paddingHorizontal: S.md, marginBottom: S.xs,
    },
    previewRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm2, padding: S.sm2,
    },
    previewThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.card },
    previewName: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary },
    previewSub: { fontSize: T.sm, color: C.textTertiary },
    tripRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm2,
      paddingHorizontal: S.sm2, paddingVertical: S.xs2, minHeight: 56,
    },
    tripRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    tripThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.card },
    tripName: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    modeContent: {
      alignItems: "center",
      paddingHorizontal: S.xs,
    },
    checkingText: {
      fontSize: T.xs, fontFamily: F.bold, lineHeight: 14, includeFontPadding: false, color: C.tealText,
      letterSpacing: 1, textTransform: "uppercase",
      textAlign: "center", marginTop: S.xs,
    },
    errorCallout: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      marginTop: S.sm, padding: S.sm,
      borderRadius: R.md,
      backgroundColor: C.redDim,
      borderWidth: 1, borderColor: C.redMid,
      width: "100%",
    },
    errorCalloutText: {
      flex: 1, fontSize: T.xs, fontWeight: T.medium,
      color: C.redText, lineHeight: 17,
    },
    qrFrame: {
      width: Dimensions.get("window").width - 80,
      height: Dimensions.get("window").width - 80,
      borderRadius: R["2xl"], overflow: "hidden",
      backgroundColor: C.bg,
      alignSelf: "center",
    },
    qrCorner: {
      position: "absolute", width: 36, height: 36,
      borderTopWidth: 3, borderLeftWidth: 3,
      borderColor: C.teal, borderTopLeftRadius: 10,
    },
    codeInput: {
      height: 50, borderRadius: R.md,
      backgroundColor: C.elevated,
      paddingHorizontal: S.sm,
      fontSize: T.sm, color: C.textPrimary,
      borderWidth: 1.5, borderColor: C.border,
      marginBottom: S.xs,
    },
    linkPasteBtn: {
      position: "absolute", right: 8, top: 0, bottom: 0,
      justifyContent: "center",
      paddingHorizontal: S.sm2, paddingVertical: S.xs2,
    },
    linkPasteBtnText: {
      fontSize: T.xs, fontWeight: T.semibold,
      color: C.textSecondary,
      backgroundColor: C.bg,
      paddingHorizontal: S.sm2, paddingVertical: 5,
      borderRadius: R.sm, overflow: "hidden",
    },
    codeSubmit: {
      height: 50, borderRadius: R.sm, width: "100%",
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
    },
    codeSubmitText: {
      fontSize: T.md, fontWeight: T.bold,
    },
  });
}

// ── Trip Row (All Trips list) ──────────────────────────────────────────────────
function TripRow({ trip }: { trip: Trip }) {
  const { C, isDark } = useTheme();
  const { toast } = useToast();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const swipeRef = useRef<Swipeable>(null);
  const start   = parseTripDate(trip.start);
  const end     = parseTripDate(trip.end);
  const days    = daysUntil(trip.start);
  const isPast  = daysUntil(trip.end) < 0;
  const isActive = days <= 0 && !isPast;
  const flag = destinationFlag(trip.destination);
  // UK style: "11–16 May", or "19 May – 1 Jun" across months
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const dateRange = sameMonth
    ? `${start.getDate()}–${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const whenLine = isPast ? dateRange : isActive ? tripFactLine(trip).split(", ")[0] : days === 1 ? "tomorrow" : `in ${days} days`;

  const renderRightActions = useCallback(() => (
    <View style={{ flexDirection: "row" }}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` });
          swipeRef.current?.close();
        }}
        accessibilityRole="button"
        accessibilityLabel="Share trip"
        style={{
          backgroundColor: C.teal,
          justifyContent: "center",
          alignItems: "center",
          width: 72,
        }}
      >
        <ShareNetwork size={18} color={C.onAccent} weight="regular" />
        <Text style={{ color: C.onAccent, fontSize: T.xs, fontWeight: "700", marginTop: 4 }}>Share</Text>
      </Pressable>
    </View>
  ), [C, trip]);

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
    <ContextMenu
      actions={[
        { title: "Share Trip", systemIcon: "square.and.arrow.up" },
        { title: "Copy Link", systemIcon: "link" },
      ]}
      onPress={(e: { nativeEvent: { index: number } }) => {
        if (e.nativeEvent.index === 0) {
          Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` });
        } else if (e.nativeEvent.index === 1) {
          const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app";
          Clipboard.setStringAsync(`${base}/#/shared/${trip.id}`).then(() => toast("Link copied")).catch(() => {});
        }
      }}
    >
    <Link href={`/trip/${trip.id}`} asChild>
    <ScalePress
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, ${trip.destination || ""}, ${isPast ? "past trip" : isActive ? "active now" : `${days} days away`}`}
    >
      {Platform.OS === "ios" && Link.AppleZoom ? (
        <Link.AppleZoom>
          <CachedImage uri={trip.image} style={styles.rowThumb} accessible={false} />
        </Link.AppleZoom>
      ) : (
        <CachedImage uri={trip.image} style={styles.rowThumb} accessible={false} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.rowDest} numberOfLines={1}>
          {flag ? `${flag}  ` : ""}{trip.destination ? `${trip.destination}, ` : ""}
          <Text style={isActive ? { color: C.tealText, fontWeight: T.semibold } : undefined}>{whenLine}</Text>
        </Text>
      </View>
    </ScalePress>
    </Link>
    </ContextMenu>
    </Swipeable>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const { trips, ready, offline, reload } = useTrips();
  const router = useRouter();
  const { toast } = useToast();
  const { prefs } = usePreferences();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const ok = await reload();
    setRefreshing(false);
    toast(ok ? "You're all up to date" : "You're offline");
  }, [reload, toast]);

  const sorted = useMemo(() =>
    [...trips].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [trips]);

  // Next trip for greeting hero countdown
  const nextUpcoming = useMemo(() => {
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    return active ?? sorted.find(t => daysUntil(t.start) > 0);
  }, [sorted]);

  const isNextActive = useMemo(() =>
    !!nextUpcoming && daysUntil(nextUpcoming.start) <= 0 && daysUntil(nextUpcoming.end) >= 0,
    [nextUpcoming]);

  // The trip on the cover: the next one that is not a draft, else the most recent.
  const heroTrip = useMemo(() =>
    sorted.filter(t => t.status !== "Draft").find(t => parseTripDate(t.end) >= new Date()) ??
    sorted.find(t => parseTripDate(t.end) >= new Date()) ??
    (sorted.length ? sorted[sorted.length - 1] : null),
    [sorted]);

  const otherTrips = useMemo(() => sorted.filter(t => t.id !== heroTrip?.id), [sorted, heroTrip]);
  // Upcoming first (soonest at the top), then past (most recent at the top)
  const upcomingTrips = useMemo(() => otherTrips.filter(t => parseTripDate(t.end) >= new Date()), [otherTrips]);
  const pastTrips = useMemo(() => otherTrips.filter(t => parseTripDate(t.end) < new Date()).reverse(), [otherTrips]);

  // The day the Itinerary card shows: today while travelling, otherwise the first day.
  const todayStr = new Date().toISOString().slice(0, 10);
  const heroDay = useMemo(() => {
    if (!heroTrip) return { date: null as string | null, events: [] as TravelEvent[], dayCount: 0 };
    const dates = [...new Set(heroTrip.events.map(e => e.date))].sort();
    const date = dates.includes(todayStr) ? todayStr : (dates.find(d => d >= todayStr) ?? dates[0] ?? null);
    const events = date ? heroTrip.events.filter(e => e.date === date) : [];
    return { date, events, dayCount: dates.length };
  }, [heroTrip, todayStr]);

  // Latest photos — diversify across uploaders, then fill chronologically
  const latestPhotos = useMemo(() => {
    if (!heroTrip?.media?.length) return [];
    const all = [...heroTrip.media]
      .filter(m => m.type === "image" && m.url?.startsWith("https://"))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    const seen = new Set<string>();
    const picks: typeof all = [];
    for (const m of all) {
      const key = m.uploadedBy || m.uploaderId || "";
      if (!seen.has(key)) { seen.add(key); picks.push(m); }
      if (picks.length >= 8) break;
    }
    if (picks.length < 8) {
      for (const m of all) {
        if (!picks.includes(m)) picks.push(m);
        if (picks.length >= 8) break;
      }
    }
    return picks;
  }, [heroTrip]);

  const fmtDay = shortDay;
  // Pulling past the top stretches the photo from its top edge instead of dragging it off the status bar
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
  const heroH = HERO_H + insets.top;
  const heroStretch = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y >= 0) return { transform: [{ translateY: 0 }, { scale: 1 }] };
    return { transform: [{ translateY: y / 2 }, { scale: 1 - y / heroH }] };
  });
  const factLine = tripFactLine;

  // Ground the photo fades into: the page colour, thinner in light mode so the photo keeps
  // showing through instead of washing out to white.
  const onGround = isDark ? "#fff" : C.textPrimary;
  const heroActions = heroTrip ? [
    { label: "Itinerary", Icon: CalendarDots, go: () => router.push(`/trip/${heroTrip.id}`) },
    { label: "Info", Icon: Info, go: () => router.push(`/trip/info?tripId=${heroTrip.id}`) },
    // Today and Photos are already tabs; sharing the trip isn't anywhere else on Home
    {
      label: "Share", Icon: Export,
      go: () => Share.share({ message: `${heroTrip.name}: ${process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app"}/#/shared/${heroTrip.id}` }),
    },
  ] : [];

  return (
    <View style={styles.safe}>
      <ScrollViewMarker style={{ flex: 1 }} scrollEdgeEffects={{ top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + S.xs }]}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} style={{ zIndex: 5 }} />}
      >
        {/* Top bar scrolls away with the cover; it also owns the join sheet */}
        <GreetingHero
          scrollY={scrollY}
          nextTrip={heroTrip ?? undefined}
          isActive={isNextActive}
          onPress={(t) => router.push(`/trip/${t.id}`)}
          overPhoto={!!heroTrip || (ready && trips.length === 0 && !offline)}
        />

        {/* ── Cover ── */}
        {!ready ? (
          <>
            <View style={[styles.hero, { height: HERO_H + insets.top, backgroundColor: C.elevated }]} />
            <ListSkeleton rows={4} />
          </>
        ) : heroTrip ? (
          <>
            <Pressable
              onPress={() => { router.push(`/trip/${heroTrip.id}`); }}
              accessibilityRole="button"
              accessibilityLabel={`${heroTrip.name}. ${factLine(heroTrip)}`}
            >
              <View style={[styles.hero, { height: HERO_H + insets.top }]}>
                {/* The photo resolves into the exact page colour before the cover ends. */}
                <Animated.View style={[StyleSheet.absoluteFill, heroStretch]}>
                  <PhotoBlend>
                    <CachedImage uri={heroTrip.image} style={StyleSheet.absoluteFill} accessible={false} />
                  </PhotoBlend>
                </Animated.View>
                <View style={styles.heroBody}>
                  {heroTrip.destination ? <Text style={[styles.heroDest, styles.heroShadow]} numberOfLines={1}>{heroTrip.destination}</Text> : null}
                  <Text style={[styles.heroName, styles.heroShadow]} numberOfLines={2}>{heroTrip.name}</Text>
                  <Text style={[styles.heroFact, isDark && styles.heroShadow]} numberOfLines={1}>{factLine(heroTrip)}</Text>
                  <Text style={[styles.heroDates, isDark && styles.heroShadow]}>{fmtDay(heroTrip.start)} – {fmtDay(heroTrip.end)}</Text>
                </View>
              </View>
            </Pressable>

            {/* ── Actions ── */}
            <View style={styles.actions}>
              {heroActions.map(a => (
                <Pressable
                  key={a.label}
                  onPress={() => { a.go(); }}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
                >
                  {LIQUID_GLASS ? (
                    <GlassView glassEffectStyle="regular" style={[styles.actionCircle, styles.actionGlass]}>
                      <a.Icon size={22} color={onGround} weight="fill" />
                    </GlassView>
                  ) : (
                    <View style={styles.actionCircle}>
                      <a.Icon size={22} color={onGround} weight="fill" />
                    </View>
                  )}
                  <Text style={[styles.actionLabel, { color: onGround }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Offline banner ── */}
            {offline && (
              <View style={styles.offlineBanner}>
                <WifiSlash size={14} color={C.textTertiary} weight="regular" />
                <Text style={styles.offlineText}>You're offline. Showing saved trips.</Text>
              </View>
            )}

            {/* ── Itinerary ── */}
            <FadeIn delay={0}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Itinerary</Text>
                  {heroDay.date ? (
                    <Text style={styles.cardMeta}>
                      {parseTripDate(heroDay.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </Text>
                  ) : null}
                </View>
                {heroDay.events.length === 0 ? (
                  <Text style={styles.cardEmpty}>Nothing on the itinerary yet. Your organiser is still adding to it.</Text>
                ) : heroDay.events.slice(0, 4).map((ev, i) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => { router.push(`/trip/event?tripId=${heroTrip.id}&eventId=${ev.id}`); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${normaliseTitle(ev.title, ev.type, ev.transferType)}${ev.time ? `, ${ev.time}` : ""}`}
                    style={({ pressed }) => [styles.evRow, i > 0 && styles.evRowBorder, { backgroundColor: pressed ? C.elevated : "transparent" }]}
                  >
                    <CategoryDot type={ev.type} transferType={ev.transferType} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.evTitle} numberOfLines={1}>{ev.type === "hotel" ? normaliseTitle(ev.title, ev.type, ev.transferType).split(" – ")[0] : normaliseTitle(ev.title, ev.type, ev.transferType)}</Text>
                      {ev.location ? <Text style={styles.evSub} numberOfLines={1}>{tidyLocation(ev.location)}</Text> : null}
                    </View>
                    {ev.time && !/^tb[acd]$/i.test(ev.time)
                      ? <Text style={styles.evTime}>{ev.time}</Text>
                      : <Text style={[styles.evTime, { color: C.textTertiary }]}>TBC</Text>}
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => { router.push(`/trip/${heroTrip.id}`); }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cardFooter, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={styles.cardLink}>
                    {heroDay.dayCount > 1 ? `See all ${heroDay.dayCount} days` : "Open itinerary"}
                  </Text>
                </Pressable>
              </View>
            </FadeIn>

            {/* ── Photos: hidden before the trip starts unless someone already added some ── */}
            {(latestPhotos.length > 0 || daysUntil(heroTrip.start) <= 0) && (
            <FadeIn delay={0}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Photos</Text>
                  <Pressable
                    onPress={() => { router.push("/(tabs)/media"); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={latestPhotos.length > 0 ? "See all photos" : "Add a photo"}
                  >
                    <Text style={styles.cardLink}>{latestPhotos.length > 0 ? "See all" : "Add"}</Text>
                  </Pressable>
                </View>
                {latestPhotos.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoStrip}
                  >
                    {latestPhotos.map((photo) => {
                      const firstName = (photo.uploadedBy || "").split(/\s+/)[0];
                      const initial = firstName ? firstName[0].toUpperCase() : "";
                      return (
                        <Pressable
                          key={photo.id}
                          onPress={() => { router.push("/(tabs)/media"); }}
                          accessibilityRole="button"
                          accessibilityLabel={firstName ? `Photo by ${firstName}` : "Trip photo"}
                          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                        >
                          <CachedImage uri={photo.thumbUrl ?? photo.url} style={styles.latestPhoto} />
                          {firstName ? (
                            <View style={styles.photoCaption}>
                              <Avatar size={16} initials={initial} />
                              <Text style={styles.photoCaptionText} numberOfLines={1}>
                                {firstName}, {relativeTime(photo.uploadedAt)}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.cardEmpty}>No photos yet. Be the first to share a moment from this trip.</Text>
                )}
              </View>
            </FadeIn>
            )}
          </>
        ) : null}

        {/* ── Other trips: upcoming, then past ── */}
        {ready && [
          { key: "up", title: "Upcoming", list: upcomingTrips },
          { key: "past", title: "Past trips", list: pastTrips },
        ].filter(g => g.list.length > 0).map(g => (
          <FadeIn key={g.key} delay={80}>
            <View style={styles.section}>
              <Text style={styles.groupHeader}>{g.title}</Text>
              <View style={styles.listCard}>
                {g.list.map((trip, i) => (
                  <View key={trip.id}>
                    <TripRow trip={trip} />
                    {i < g.list.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>
        ))}

        {/* ── Empty state ── */}
        {ready && trips.length === 0 && (
          <NoTripsHero
            greeting={prefs.name.trim() ? `Welcome, ${prefs.name.trim().split(" ")[0].replace(/^./, c => c.toUpperCase())}` : "Welcome"}
            offline={offline}
            onRetry={onRefresh}
            retrying={refreshing}
          />
        )}
      </Animated.ScrollView>
      </ScrollViewMarker>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: {},

    section: { marginTop: S.lg },

    // ── Cover ──
    hero: { justifyContent: "flex-end" },
    heroBody: { paddingHorizontal: S.lg, paddingBottom: S.sm, gap: 3, alignItems: "center" },
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
    heroFact: { fontSize: T.base, fontWeight: T.semibold, color: isDark ? "rgba(255,255,255,0.92)" : C.textPrimary, marginTop: 2, textAlign: "center" },
    heroDates: { fontSize: T.sm, color: isDark ? "rgba(255,255,255,0.72)" : C.textPrimary, textAlign: "center" },

    // ── Actions ──
    actions: {
      flexDirection: "row", justifyContent: "space-evenly",
      paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.md,
    },
    action: { alignItems: "center", gap: S.xs2, minWidth: 64 },
    actionCircle: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: isDark ? "rgba(255,255,255,0.16)" : C.card,
      alignItems: "center", justifyContent: "center",
      ...shadow("subtle", isDark),
    },
    actionGlass: { backgroundColor: "transparent", overflow: "hidden", shadowOpacity: 0, elevation: 0 },
    actionLabel: { fontSize: T.xs, fontWeight: T.medium, color: C.textPrimary },

    // ── Inset cards ──
    // Boxless: sections sit on the page under a small grey label, rows split by hairlines
    card: { marginTop: S.xl },
    cardHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, paddingBottom: S.xs,
    },
    cardTitle: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2 },
    cardMeta: { fontSize: T.sm, color: C.textTertiary },
    cardEmpty: { fontSize: T.sm, color: C.textTertiary, lineHeight: 19, paddingHorizontal: S.md, paddingBottom: S.md },
    cardFooter: { paddingHorizontal: S.md, paddingVertical: S.sm2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    cardLink: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },
    groupHeader: {
      fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2,
      paddingHorizontal: S.md, marginBottom: S.xs,
    },

    // ── Itinerary rows ──
    evRow: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 48 },
    evRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    evTitle: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    evSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 1 },
    evTime: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText, fontVariant: ["tabular-nums"] },

    // ── Trip rows ──
    listCard: {
    },
    row: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md, paddingVertical: S.sm },
    rowDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.md + 60 + S.md,
    },
    rowThumb: { width: 60, height: 60, borderRadius: R.lg, backgroundColor: C.elevated },
    rowBody: { flex: 1, gap: 2 },
    rowName: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    rowDest: { fontSize: T.sm, color: C.textSecondary },
    rowFact: { fontSize: T.sm, color: C.textTertiary },
    photoStrip: { gap: S.sm2, paddingHorizontal: S.md, paddingBottom: S.md },
    latestPhoto: {
      width: 104, height: 138, borderRadius: R.sm,
      backgroundColor: C.elevated,
    },
    photoCaption: {
      flexDirection: "row", alignItems: "center", gap: S["2xs"], marginTop: S.xs2,
    },
    photoCaptionText: {
      fontSize: T.xs, color: C.textTertiary, maxWidth: 100,
    },

    // ── Offline banner ──
    offlineBanner: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S.xs, paddingVertical: S.sm2, paddingHorizontal: S.md,
      backgroundColor: C.elevated, borderRadius: R.lg,
      marginHorizontal: S.md, marginTop: S.sm,
    },
    offlineText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary,
    },
  });
}
