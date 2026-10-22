import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, Platform, Share, Alert,
  Dimensions, useWindowDimensions,
} from "react-native";
// Native only: react-native-web (the admin's web preview) has no ActionSheetIOS export
const ActionSheetIOS: typeof import("react-native").ActionSheetIOS | null = Platform.OS === "ios" ? require("react-native").ActionSheetIOS : null;
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import { Avatar, avatarColor } from "@/components/ui/Avatar";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { CategoryDot, categoryIcon } from "@/components/ui/CategoryDot";
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
  Info, Export, Camera,
} from "phosphor-react-native";
import { NoTripsHero } from "@/components/ui/JoinTripNote";
import { EmptyNote } from "@/components/ui/EmptyState";
import { PhotoBackdrop, PhotoDissolve, photoPalette } from "@/components/ui/PhotoBackdrop";
import { ListSkeleton } from "@/components/Skeleton";
import { openJoinSheet, openSheet } from "@/services/openJoin";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView } from "expo-symbols";
import { tidyTitleSeparators, tidyLocation } from "@/shared/eventTitle";
import { rowTitle, rowSub } from "@/shared/eventDisplay";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/components/Logo";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { ScrollViewMarker } from "react-native-screens/src/components/gamma/scroll-view-marker";
import { useNotifications } from "@/context/NotificationContext";
import { usePreferences } from "@/context/PreferencesContext";
import { type ThemeColors, T, R, S, F, TAB_BAR_HEIGHT, shadow, categoryTone } from "@/constants/theme";
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
    if (params.join) openJoinSheet();
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
            style={({ pressed }) => [styles.avatarRing, { backgroundColor: avatarColor(prefs.name || "?", C), opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            hitSlop={6}
          >
            {/* A solid circle like the buttons beside it: their photo, or their initial on the accent */}
            {prefs.avatar ? (
              <Avatar size={36} uri={prefs.avatar} initials={(prefs.name || "").trim().charAt(0).toUpperCase() || "?"} />
            ) : (
              <Text style={[styles.avatarInitial, { color: "rgba(0,0,0,0.82)" }]}>{(prefs.name || "").trim().charAt(0).toUpperCase() || "?"}</Text>
            )}
          </Pressable>
        </View>
        <Logo size={24} color={overPhoto ? "#fff" : C.textPrimary} />
        <View style={[styles.headerActions, { justifyContent: "flex-end" }]}>
          <IconCircleButton variant="glass" size={36}
            onPress={openJoinSheet}
            accessibilityLabel="Join a trip"
          >
            <Plus size={18} color={barIcon} weight="bold" />
          </IconCircleButton>
          <IconCircleButton variant="glass" size={36}
            onPress={() => openSheet("/notifications")}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            badge={unreadCount > 0 ? (
              <View pointerEvents="none" accessible={false} style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : undefined}
          >
            <Bell size={18} color={barIcon} weight="fill" />
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
      width: 36, height: 36, borderRadius: 18, overflow: "hidden",
      backgroundColor: C.teal,
      alignItems: "center", justifyContent: "center",
    },
    avatarInitial: { fontSize: T.base, fontWeight: T.bold },
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

/** On iOS the link goes in as a URL so the share sheet (and Messages) show the trip's photo and name */
function shareTrip(name: string, link: string) {
  Share.share(Platform.OS === "ios" ? { url: link, message: name } : { message: `${name}: ${link}` }).catch(() => {});
}

// ── Trip cards ──────────────────────────────────────────────────────────────
// Other trips as Spotify-style squares, name and dates underneath. All one size: two fill the
// width as a pair, more become a shelf that runs off the edge.
function TripCard({ trip, styles, size }: { trip: Trip; styles: ReturnType<typeof makeStyles>; size: number }) {
  const { C } = useTheme();
  const { toast } = useToast();
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
  const photo = <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} />;
  const tripLink = `${process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app"}/shared/${trip.id}`;
  const copyLink = () => { Clipboard.setStringAsync(tripLink).then(() => toast("Link copied")).catch(() => {}); };
  const openActions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (ActionSheetIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: trip.name, options: ["Share Trip", "Copy Link", "Cancel"], cancelButtonIndex: 2 },
        (i) => { if (i === 0) shareTrip(trip.name, tripLink); else if (i === 1) copyLink(); },
      );
    } else {
      Alert.alert(trip.name, undefined, [
        { text: "Share Trip", onPress: () => shareTrip(trip.name, tripLink) },
        { text: "Copy Link", onPress: copyLink },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  return (
    <Link href={`/trip/${trip.id}`} asChild>
    <ScalePress
      style={StyleSheet.flatten([styles.tripCard, { width: size }])}
      // Link owns onPress for navigation; the tick goes on press-in
      onPressIn={() => { Haptics.selectionAsync(); }}
      // A plain action sheet rather than a context menu, which always lifts and zooms the card
      onLongPress={openActions}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, ${trip.destination || ""}, ${isPast ? "past trip" : isActive ? "active now" : `${days} days away`}`}
    >
      <View style={[styles.tripArt, { width: size, height: size }]}>
        {Platform.OS === "ios" && Link.AppleZoom ? <Link.AppleZoom>{photo}</Link.AppleZoom> : photo}
        {/* When it is goes on the photo, so the caption is just what and where */}
        {!isPast ? (
          <View style={[styles.tripChip, isActive && { backgroundColor: C.teal }]} accessible={false}>
            <Text style={[styles.tripChipText, isActive && { color: C.onAccent }]}>
              {isActive ? "On now" : days === 1 ? "Tomorrow" : `${days} days`}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tripCardBody}>
        <Text style={styles.tripCardName} numberOfLines={2}>{trip.name}</Text>
        <Text style={styles.tripCardSub} numberOfLines={1}>
          {flag ? `${flag}  ` : ""}{isPast ? dateRange : trip.destination || dateRange}
        </Text>
      </View>
    </ScalePress>
    </Link>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { C: themeC, isDark: themeDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { trips, ready, offline, reload } = useTrips();
  const router = useRouter();
  const { toast } = useToast();
  const { prefs } = usePreferences();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    // A light tap when the pull triggers a refresh, like Mail
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    const ok = await reload();
    setRefreshing(false);
    toast(ok ? "You're all up to date" : "You're offline", ok ? "success" : "error");
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

  // Invites-style: the cover photo, blurred, carries down the whole page
  const photoPage = !!heroTrip?.image;
  const C = useMemo(() => (photoPage ? photoPalette(themeC, themeDark) : themeC), [photoPage, themeDark, themeC]);
  const isDark = photoPage || themeDark;
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

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
  // Every calendar day of the trip for the day strip, with the day's first real event for its icon
  const tripDays = useMemo(() => {
    if (!heroTrip) return [] as { date: string; weekday: string; day: number; ev?: TravelEvent }[];
    const out: { date: string; weekday: string; day: number; ev?: TravelEvent }[] = [];
    const end = parseTripDate(heroTrip.end);
    for (let d = parseTripDate(heroTrip.start); d <= end && out.length < 60; d = new Date(d.getTime() + 86400000)) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      // Itinerary order, the same as the card above, so untimed days still lead with the right event
      const ev = heroTrip.events.find(e => e.date === date);
      out.push({ date, weekday: d.toLocaleDateString("en-GB", { weekday: "short" }), day: d.getDate(), ev });
    }
    return out;
  }, [heroTrip]);
  const nextEvent = heroDay.events[0];
  const restEvents = heroDay.events.slice(1, 4);
  const hasTime = (ev: TravelEvent) => !!ev.time && !/^tb[acd]$/i.test(ev.time);
  const dayLabel = heroDay.date ? parseTripDate(heroDay.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
  const dayIn = heroDay.date ? daysUntil(heroDay.date) : 0;
  const eventTitle = (ev: TravelEvent) => {
    const t = normaliseTitle(ev.title, ev.type, ev.transferType);
    return ev.type === "hotel" ? t.split(" – ")[0] : t;
  };
  // The headline reads as words; a leading flight number moves into the line underneath
  const nextHeadline = useMemo(() => {
    if (!nextEvent) return { title: "", sub: "" };
    const title = eventTitle(nextEvent);
    const place = nextEvent.location ? tidyLocation(nextEvent.location) : "";
    const m = title.match(/^([A-Z0-9]{2}\s?\d{1,4})\s+[–-]\s+(.+)$/);
    const flightNo = nextEvent.flightNum || m?.[1] || "";
    return {
      title: m ? m[2] : title,
      sub: [flightNo && !place.includes(flightNo) ? flightNo : "", place].filter(Boolean).join(", "),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextEvent]);
  const NextIcon = nextEvent ? categoryIcon(nextEvent.type, nextEvent.transferType) : CalendarDots;

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
  const { width: screenW } = useWindowDimensions();
  const pairCard = Math.floor((screenW - S.md * 2 - S.sm2) / 2);
  const shelfCard = Math.floor(pairCard * 0.86);
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
    { label: "Itinerary", Icon: CalendarDots, symbol: "calendar" as const, go: () => router.push(`/trip/${heroTrip.id}`) },
    { label: "Info", Icon: Info, symbol: "info.circle" as const, go: () => router.push(`/trip/info?tripId=${heroTrip.id}`) },
    // Today and Photos are already tabs; sharing the trip isn't anywhere else on Home
    {
      label: "Share", Icon: Export, symbol: "square.and.arrow.up" as const,
      go: () => shareTrip(heroTrip.name, `${process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app"}/shared/${heroTrip.id}`),
    },
  ] : [];

  return (
    <View style={styles.safe}>
      {photoPage && heroTrip && <PhotoBackdrop uri={heroTrip.image} />}
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
              onPress={() => { Haptics.selectionAsync(); router.push(`/trip/${heroTrip.id}`); }}
              accessibilityRole="button"
              accessibilityLabel={`${heroTrip.name}. ${factLine(heroTrip)}`}
            >
              <View style={[styles.hero, { height: HERO_H + insets.top }]}>
                {/* The photo melts into the blurred copy of itself behind the page */}
                <Animated.View style={[StyleSheet.absoluteFill, heroStretch]}>
                  <CachedImage uri={heroTrip.image} style={StyleSheet.absoluteFill} accessible={false} />
                  <PhotoDissolve uri={heroTrip.image} scrollY={scrollY} />
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
                <ScalePress
                  key={a.label}
                  activeScale={0.9}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); a.go(); }}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  style={styles.action}
                >
                  {LIQUID_GLASS ? (
                    // Always the dark glass: the page under it is the dark photo backdrop in either theme
                    <GlassView glassEffectStyle="regular" colorScheme="dark" style={[styles.actionCircle, styles.actionGlass]}>
                      <SymbolView name={a.symbol} size={21} tintColor="#fff" weight="medium" style={{ width: 24, height: 24 }} />
                    </GlassView>
                  ) : (
                    <View style={styles.actionCircle}>
                      <a.Icon size={22} color={onGround} weight="fill" />
                    </View>
                  )}
                  <Text style={[styles.actionLabel, { color: onGround }]}>{a.label}</Text>
                </ScalePress>
              ))}
            </View>

            {/* ── Offline banner ── */}
            {offline && (
              <View style={styles.offlineBanner}>
                <WifiSlash size={14} color={C.textTertiary} weight="regular" />
                <Text style={styles.offlineText}>You're offline. Showing saved trips.</Text>
              </View>
            )}

            {/* ── Next up, then the rest of that day ── */}
            <FadeIn delay={0}>
              {!nextEvent ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle} accessibilityRole="header">Itinerary</Text>
                  <View style={{ marginTop: S.sm }}>
                    <EmptyNote
                      palette={C}
                      icon={<CalendarDots size={22} color={C.tealText} weight="duotone" />}
                      title="Plans are on the way"
                      message="Your organiser is still adding to the itinerary. It appears here as soon as they do."
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push(`/trip/event?tripId=${heroTrip.id}&eventId=${nextEvent.id}`); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Next up, ${dayLabel}${hasTime(nextEvent) ? ` at ${nextEvent.time}` : ""}, ${eventTitle(nextEvent)}`}
                    style={({ pressed }) => [styles.card, styles.nextUp, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={styles.nextMeta}>
                      <NextIcon size={15} color={categoryTone(nextEvent.type, C).fg} weight="fill" />
                      {/* What and when; the trip countdown already sits in the hero above */}
                      <Text style={[styles.nextLabel, { color: categoryTone(nextEvent.type, C).fg }]}>
                        {nextEvent.type.charAt(0).toUpperCase() + nextEvent.type.slice(1)}, {dayIn <= 0 ? "today" : dayIn === 1 ? "tomorrow" : dayLabel}
                      </Text>
                      {hasTime(nextEvent) ? <Text style={styles.nextCountdown}>{nextEvent.time}</Text> : null}
                    </View>
                    <Text style={styles.nextTitle} numberOfLines={2}>{nextHeadline.title}</Text>
                    {nextHeadline.sub ? <Text style={styles.nextSub} numberOfLines={2}>{nextHeadline.sub}</Text> : null}
                  </Pressable>

                  <View style={styles.card}>
                    {restEvents.length > 0 && (
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle} accessibilityRole="header">Then on {dayLabel}</Text>
                        {restEvents.some(ev => !hasTime(ev)) ? <Text style={styles.cardMeta}>{restEvents.every(ev => !hasTime(ev)) ? "Times TBC" : "Some times TBC"}</Text> : null}
                      </View>
                    )}
                    {restEvents.map((ev, i) => (
                      <Pressable
                        key={ev.id}
                        onPress={() => { Haptics.selectionAsync(); router.push(`/trip/event?tripId=${heroTrip.id}&eventId=${ev.id}`); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${eventTitle(ev)}${hasTime(ev) ? `, ${ev.time}` : ""}`}
                        style={({ pressed }) => [styles.evRow, i > 0 && styles.evRowBorder, { opacity: pressed ? 0.6 : 1 }]}
                      >
                        <CategoryDot palette={C} type={ev.type} transferType={ev.transferType} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.evTitle} numberOfLines={1}>{rowTitle(eventTitle(ev), rowSub(ev))}</Text>
                          {rowSub(ev) ? <Text style={styles.evSub} numberOfLines={1}>{rowSub(ev)}</Text> : null}
                        </View>
                        {hasTime(ev) ? <Text style={styles.evTime}>{ev.time}</Text> : null}
                      </Pressable>
                    ))}
                    {/* Jump to any day of the trip; the day shown above is picked out */}
                    {tripDays.length > 1 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={[styles.dayStrip, restEvents.length === 0 && { borderTopWidth: 0 }]}
                        contentContainerStyle={styles.dayStripContent}
                      >
                        {tripDays.map(d => {
                          const current = d.date === heroDay.date;
                          const DayIcon = d.ev ? categoryIcon(d.ev.type, d.ev.transferType) : null;
                          return (
                            <ScalePress
                              key={d.date}
                              activeScale={0.94}
                              onPress={() => { Haptics.selectionAsync(); router.push(`/trip/${heroTrip.id}?date=${d.date}`); }}
                              accessibilityRole="button"
                              accessibilityLabel={`${parseTripDate(d.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${d.ev ? `, ${eventTitle(d.ev)}` : ", nothing planned"}`}
                              style={[styles.dayChip, current && styles.dayChipCurrent]}
                            >
                              <Text style={[styles.dayChipWeekday, current && { color: C.tealText }]}>{d.weekday}</Text>
                              <Text style={[styles.dayChipNum, current && { color: C.tealText }]}>{d.day}</Text>
                              {DayIcon ? (
                                <DayIcon size={14} color={categoryTone(d.ev!.type, C).fg} weight="fill" />
                              ) : (
                                <View style={styles.dayChipEmpty} />
                              )}
                            </ScalePress>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <Pressable
                        onPress={() => { router.push(`/trip/${heroTrip.id}`); }}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.cardFooter, restEvents.length === 0 && { borderTopWidth: 0, paddingTop: 0 }, { opacity: pressed ? 0.6 : 1 }]}
                      >
                        <Text style={styles.cardLink}>Open itinerary</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </FadeIn>

            {/* ── Photos: hidden before the trip starts unless someone already added some ── */}
            {(latestPhotos.length > 0 || daysUntil(heroTrip.start) <= 0) && (
            <FadeIn delay={0}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} accessibilityRole="header">Photos</Text>
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/media"); }}
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
                          onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/media"); }}
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
                  <View style={{ paddingHorizontal: S.md }}>
                    <EmptyNote
                      palette={C}
                      icon={<Camera size={22} color={C.tealText} weight="duotone" />}
                      title="No photos yet"
                      message="Be the first to share a moment from this trip."
                      action={{ label: "Add", onPress: () => router.push("/(tabs)/media") }}
                    />
                  </View>
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
              <Text style={styles.groupHeader} accessibilityRole="header">{g.title}</Text>
              <ScrollView horizontal scrollEnabled={g.list.length > 2} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripCards}>
                {g.list.map(trip => <TripCard key={trip.id} trip={trip} styles={styles} size={g.list.length > 2 ? shelfCard : pairCard} />)}
              </ScrollView>
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
      flexDirection: "row", justifyContent: "center", gap: S.xl,
      paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.md,
    },
    action: { alignItems: "center", gap: S.xs2, minWidth: 64 },
    actionCircle: {
      width: 48, height: 48, borderRadius: 24,
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
    cardFooter: { paddingHorizontal: S.md, paddingVertical: S.sm2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    cardLink: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },
    dayStrip: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    dayStripContent: { paddingHorizontal: S.md, paddingVertical: S.sm2, gap: S.xs },
    dayChip: {
      width: 54, paddingVertical: S.xs2, borderRadius: R.lg, alignItems: "center", gap: 2,
      backgroundColor: C.elevated, borderWidth: 1.5, borderColor: "transparent",
    },
    dayChipCurrent: { borderColor: C.teal, backgroundColor: C.tealDim },
    dayChipWeekday: { fontSize: T.xs, fontWeight: T.medium, color: C.textSecondary },
    dayChipNum: { fontSize: T.xl, fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"], marginBottom: 2 },
    dayChipEmpty: { width: 14, height: 14 },
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

    // ── Next up ──
    nextUp: { paddingHorizontal: S.md, gap: S.xs },
    nextMeta: { flexDirection: "row", alignItems: "center", gap: S.xs },
    nextLabel: { flex: 1, fontSize: T.sm, fontWeight: T.semibold, color: C.textSecondary },
    nextCountdown: { fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"] },
    nextTitle: { fontSize: 24, lineHeight: 29, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.3 },
    nextSub: { fontSize: T.base, color: C.textSecondary, lineHeight: 21 },

    // ── Trip cards ──
    tripCards: { gap: S.sm2, paddingHorizontal: S.md },
    tripCard: { gap: S.xs },
    tripArt: { borderRadius: R.sm, overflow: "hidden", backgroundColor: C.elevated },
    tripCardBody: { gap: 1 },
    tripCardName: { fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary, lineHeight: 17 },
    tripCardSub: { fontSize: T.xs, color: C.textSecondary },
    // Dark enough that white text holds over a bright photo
    tripChip: {
      position: "absolute", top: S.xs, left: S.xs,
      paddingHorizontal: S.xs2, paddingVertical: 4, borderRadius: R.sm,
      backgroundColor: "rgba(0,0,0,0.62)",
    },
    tripChipText: { fontSize: T.xs, fontWeight: T.semibold, color: "#fff" },
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
