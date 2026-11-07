import { useCollapsingHeader, CompactHeader, ScreenTitle } from "@/components/ui/CollapsingHeader";
import { CachedImage } from "@/components/CachedImage";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator, View, Text, StyleSheet, Dimensions, FlatList,
  Pressable, Alert, Platform, RefreshControl, Modal, Share,
} from "react-native";
import type { HostInstance } from "react-native";
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";
import type { ContextMenuOnPressNativeEvent } from "react-native-context-menu-view";
import { Image as ExpoImage } from "expo-image";
import ContextMenu from "@/components/ContextMenu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Play, Plus, Camera, X, Trash, Heart, Export, VideoCamera, ImageSquare,
  CaretDown, Images, Flag,
} from "phosphor-react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
  interpolate, Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoTripsPage } from "@/components/ui/JoinTripNote";
import { PhotoLikesSheet } from "@/components/PhotoLikesSheet";
import { GalleryUploadSheet } from "@/components/GalleryUploadSheet";
import * as Haptics from "@/services/haptics";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTheme } from "@/context/ThemeContext";
import { ScrollViewMarker } from "@/components/ScrollViewMarker";
import { useToast } from "@/context/ToastContext";
import { type ThemeColors, T, R, S, SCROLL_BOTTOM_PAD } from "@/constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseTripDate } from "@/shared/dates";
import { reportTripMedia } from "@/services/firebaseTrips";
import { firebaseAuth, waitForAuth } from "@/services/firebase";
import { getDeviceId } from "@/services/deviceId";
import type { TripMedia } from "@/shared/types";

const API_BASE = `${process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app"}/api`;

async function notifyTripMembers(tripId: string, tripName: string, uploaderName: string, count: number, senderDeviceId: string | null) {
  try {
    await waitForAuth();
    const idToken = await firebaseAuth().currentUser?.getIdToken();
    if (!idToken) return;
    const s = count === 1 ? "" : "s";
    await fetch(`${API_BASE}/notify-trip-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        tripId,
        tripName,
        changes: [`${uploaderName} added ${count} photo${s}`],
        excludeDeviceId: senderDeviceId,
      }),
    });
  } catch {}
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_COLS = 3;
// Edge to edge like Photos: no side gutter, hairline gaps, square corners
const GRID_ITEM_SIZE = (SCREEN_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
// Photo banner per trip: the card plus room above (a gap between trips) and below
const TRIP_BANNER_H = 176;
const TRIP_HEADER_H = TRIP_BANNER_H + S.lg + S.xs;
const DAY_HEADER_H = 46;

type OriginRect = { x: number; y: number; width: number; height: number; aspect?: number };

const FALLBACK_ORIGIN: OriginRect = { x: SCREEN_W / 2 - 40, y: SCREEN_H / 2 - 40, width: 80, height: 80 };

function fitRect(aspect?: number): OriginRect {
  if (!aspect) return { x: 0, y: 0, width: SCREEN_W, height: SCREEN_H };
  const screenAspect = SCREEN_W / SCREEN_H;
  const width = aspect > screenAspect ? SCREEN_W : SCREEN_H * aspect;
  const height = aspect > screenAspect ? SCREEN_W / aspect : SCREEN_H;
  return { x: (SCREEN_W - width) / 2, y: (SCREEN_H - height) / 2, width, height };
}

type GalleryRow =
  | { type: "trip-header"; key: string; name: string; dateRange: string; count: number; cover?: string; first: boolean }
  | { type: "day-header"; key: string; label: string; date: string; count: number }
  | { type: "grid-row"; key: string; tripId: string; tripName: string; items: TripMedia[] };

type ViewerItem = TripMedia & { tripId: string; tripName: string; dayLabel: string };

/** Calendar day (YYYY-MM-DD, device local) a photo belongs to: when it was taken, else when it was added */
function mediaDayKey(m: TripMedia): string {
  if (m.takenAt && /^\d{4}-\d{2}-\d{2}/.test(m.takenAt)) return m.takenAt.slice(0, 10);
  const d = new Date(m.uploadedAt);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mediaTime(m: TripMedia): number {
  const t = new Date(m.takenAt ?? m.uploadedAt).getTime();
  return isNaN(t) ? 0 : t;
}

function dayDate(key: string): Date {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1);
}

/** "Day 3" inside the trip, otherwise "Before the trip" / "After the trip" */
function dayLabelFor(key: string, tripStart: string, tripEnd: string): string {
  if (!key) return "Undated";
  const start = parseTripDate(tripStart);
  const end = parseTripDate(tripEnd);
  const day = dayDate(key);
  const s0 = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e0 = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const t = day.getTime();
  if (t < s0) return "Before the trip";
  if (t > e0) return "After the trip";
  return `Day ${Math.round((t - s0) / 86400000) + 1}`;
}

function formatDayDate(key: string): string {
  if (!key) return "";
  return dayDate(key).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function buildGalleryRows(
  filteredTrips: Array<{ id: string; name: string; destination?: string; start: string; end: string; image?: string; media?: TripMedia[] }>,
): GalleryRow[] {
  const rows: GalleryRow[] = [];
  for (const [tripIndex, trip] of filteredTrips.entries()) {
    const media = trip.media ?? [];
    if (media.length === 0) continue;
    const tripName = trip.destination || trip.name;

    // Each trip opens on a banner of its own newest photo, falling back to the trip cover
    const dateRange = `${parseTripDate(trip.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parseTripDate(trip.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    const newestPhoto = media.filter(m => m.type === "image").sort((a, b) => mediaTime(b) - mediaTime(a))[0];
    rows.push({ type: "trip-header", key: `h-${trip.id}`, name: tripName, dateRange, count: media.length, cover: newestPhoto?.url || trip.image, first: tripIndex === 0 });

    // Newest day first, newest photo first within a day
    const byDay = new Map<string, TripMedia[]>();
    for (const m of media) {
      const k = mediaDayKey(m);
      const list = byDay.get(k);
      if (list) list.push(m); else byDay.set(k, [m]);
    }
    // Older uploads have no taken time; outside the trip dates their day is only when they were uploaded,
    // so those days go last instead of reading like trip days
    const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a)).map(k => {
      const items = byDay.get(k)!.slice().sort((a, b) => mediaTime(b) - mediaTime(a));
      let label = dayLabelFor(k, trip.start, trip.end);
      if (label.endsWith("the trip") && !items.some(m => m.takenAt)) label = "Uploaded";
      return { k, items, label };
    });
    days.sort((a, b) => Number(a.label === "Uploaded") - Number(b.label === "Uploaded"));
    for (const { k, items, label } of days) {
      rows.push({ type: "day-header", key: `d-${trip.id}-${k}`, label, date: formatDayDate(k), count: items.length });
      for (let i = 0; i < items.length; i += GRID_COLS) {
        rows.push({ type: "grid-row", key: `r-${trip.id}-${k}-${i}`, tripId: trip.id, tripName, items: items.slice(i, i + GRID_COLS) });
      }
    }
  }
  return rows;
}

function rowHeight(row: GalleryRow): number {
  if (row.type === "trip-header") return TRIP_HEADER_H;
  if (row.type === "day-header") return DAY_HEADER_H;
  return GRID_ITEM_SIZE + GRID_GAP;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateCompact(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${mon}, ${h}:${m}`;
}

// ── Zoomable Image ──────────────────────────────────────────────────────────

// Viewer controls: real Liquid Glass where available, a dark frosted fill elsewhere
const VIEWER_GLASS = isLiquidGlassAvailable();
// A dark tint under the glass so the controls stay visible over bright and dark photos alike
function ViewerGlass({ style, children }: { style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return VIEWER_GLASS
    ? <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor="rgba(20,20,24,0.45)" isInteractive style={style}>{children}</GlassView>
    : <View style={[style, { backgroundColor: "rgba(40,40,46,0.72)" }]}>{children}</View>;
}
const TEXT_ON_PHOTO = { textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };
const viewerStyles = StyleSheet.create({
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  toolbar: {
    alignSelf: "center", flexDirection: "row", alignItems: "center", gap: S.sm,
    paddingHorizontal: S.sm, height: 56, borderRadius: 28, overflow: "hidden",
  },
  tool: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
});

const ZOOM_SPRING = { damping: 15, stiffness: 120 };

const ZoomableImage = React.memo(function ZoomableImage({ uri, thumbUri, width, height, onTap, onZoomChange }: {
  uri: string; thumbUri?: string; width: number; height: number; onTap: () => void; onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const aspect = useSharedValue(width / height);
  // While zoomed, one finger moves the photo, and the pager and swipe-to-close stand down
  const [zoomed, setZoomed] = useState(false);
  const reportZoom = useCallback((next: boolean) => { setZoomed(next); onZoomChange(next); }, [onZoomChange]);

  /** How far the photo may move at a scale before its edge leaves the screen's edge */
  const limits = (s: number) => {
    "worklet";
    const contentW = Math.min(width, height * aspect.value);
    const contentH = Math.min(height, width / aspect.value);
    return { x: Math.max(0, (contentW * s - width) / 2), y: Math.max(0, (contentH * s - height) / 2) };
  };
  const clamp = (v: number, max: number) => { "worklet"; return Math.min(max, Math.max(-max, v)); };

  const settle = (s: number) => {
    "worklet";
    const { x, y } = limits(s);
    const nx = clamp(translateX.value, x);
    const ny = clamp(translateY.value, y);
    translateX.value = withSpring(nx, ZOOM_SPRING);
    translateY.value = withSpring(ny, ZOOM_SPRING);
    savedTranslateX.value = nx;
    savedTranslateY.value = ny;
  };

  const reset = () => {
    "worklet";
    scale.value = withSpring(1, ZOOM_SPRING);
    translateX.value = withSpring(0, ZOOM_SPRING);
    translateY.value = withSpring(0, ZOOM_SPRING);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    runOnJS(reportZoom)(false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
        return;
      }
      const s = Math.min(scale.value, 4);
      if (scale.value > 4) scale.value = withSpring(4, ZOOM_SPRING);
      savedScale.value = s;
      settle(s);
      runOnJS(reportZoom)(true);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .maxPointers(2)
    .onUpdate((e) => {
      const { x, y } = limits(scale.value);
      // A little give past the edge, like Photos
      const rubber = (v: number, max: number) => v > max ? max + (v - max) * 0.3 : v < -max ? -max + (v + max) * 0.3 : v;
      translateX.value = rubber(savedTranslateX.value + e.translationX, x);
      translateY.value = rubber(savedTranslateY.value + e.translationY, y);
    })
    .onEnd(() => {
      settle(savedScale.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e, success) => {
      if (!success) return;
      if (savedScale.value > 1) {
        reset();
      } else {
        // Zoom in on the spot that was tapped
        const s = 2.5;
        const { x, y } = limits(s);
        const nx = clamp((width / 2 - e.x) * (s - 1), x);
        const ny = clamp((height / 2 - e.y) * (s - 1), y);
        scale.value = withSpring(s, ZOOM_SPRING);
        translateX.value = withSpring(nx, ZOOM_SPRING);
        translateY.value = withSpring(ny, ZOOM_SPRING);
        savedScale.value = s;
        savedTranslateX.value = nx;
        savedTranslateY.value = ny;
        runOnJS(reportZoom)(true);
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((_e, success) => { if (success) runOnJS(onTap)(); });

  const composed = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width, height, justifyContent: "center", alignItems: "center" }, animStyle]}>
        <ExpoImage
          source={{ uri }}
          placeholder={thumbUri ? { uri: thumbUri } : undefined}
          placeholderContentFit="contain"
          recyclingKey={uri}
          style={{ width, height }}
          contentFit="contain"
          // Avoid synchronous bitmap resizing while viewer pages mount.
          allowDownscaling={false}
          cachePolicy="memory-disk"
          onLoad={(e) => { if (e?.source?.width && e?.source?.height) aspect.value = e.source.width / e.source.height; }}
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ── Fullscreen Viewer ────────────────────────────────────────────────────────

function MediaViewer({ items, initialIndex, visible, origin, onClose, onDelete, onReport, canDelete, liking, onToggleHeart, C }: {
  items: ViewerItem[];
  initialIndex: number;
  visible: boolean;
  origin: OriginRect | null;
  onClose: () => void;
  onDelete: (item: ViewerItem) => void;
  onReport: (item: ViewerItem) => void;
  canDelete: (item: ViewerItem) => boolean;
  liking: Set<string>;
  onToggleHeart: (item: ViewerItem) => void;
  C: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showLikes, setShowLikes] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const dismissY = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const progress = useSharedValue(1);
  const heroOpacity = useSharedValue(0);
  const pagerOpacity = useSharedValue(1);
  const chrome = useSharedValue(1);
  const originRect = useSharedValue<OriginRect>(FALLBACK_ORIGIN);
  const targetRect = useSharedValue<OriginRect>(fitRect());
  const closingRef = useRef(false);

  const hideHero = useCallback(() => {
    setTimeout(() => { heroOpacity.value = 0; }, 32);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- heroOpacity is a useSharedValue, its reference never changes
  }, []);

  const openStartedRef = useRef(false);
  const startOpen = useCallback(() => {
    if (openStartedRef.current) return;
    openStartedRef.current = true;
    bgOpacity.value = withTiming(1, { duration: 260 });
    progress.value = withSpring(1, { damping: 22, stiffness: 190, mass: 0.8 }, (finished) => {
      if (finished) {
        pagerOpacity.value = 1;
        runOnJS(hideHero)();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bgOpacity, progress and pagerOpacity are useSharedValues, their references never change
  }, [hideHero]);

  useEffect(() => {
    if (visible && initialIndex >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the viewer page and chrome each time it opens on a new photo
      setActiveIndex(initialIndex);
      setChromeVisible(true);
      setZoomed(false);
      closingRef.current = false;
      openStartedRef.current = false;
      dismissY.value = 0;
      originRect.value = origin ?? FALLBACK_ORIGIN;
      targetRect.value = fitRect(origin?.aspect);
      progress.value = 0;
      heroOpacity.value = 1;
      pagerOpacity.value = 0;
      bgOpacity.value = 0;
      chrome.value = 1;
      // iOS takes a few frames to present the modal; starting the spring before
      // then plays its first frames off-screen and the fly-in looks like a jump.
      // Modal onShow starts it, this is only a fallback if onShow never fires.
      const fallback = setTimeout(startOpen, 400);
      setTimeout(() => flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false }), 50);
      return () => clearTimeout(fallback);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- must run once per open: origin arrives in the same state batch as visible, the rest are useSharedValues and a stable startOpen, and re-running would replay the fly-in
  }, [visible, initialIndex]);

  useEffect(() => {
    chrome.value = withTiming(chromeVisible ? 1 : 0, { duration: 200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chrome is a useSharedValue, its reference never changes
  }, [chromeVisible]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const canReturn = !!origin && activeIndex === initialIndex;
    chrome.value = withTiming(0, { duration: 120 });
    if (canReturn) {
      heroOpacity.value = 1;
      pagerOpacity.value = 0;
      bgOpacity.value = withTiming(0, { duration: 260 });
      dismissY.value = withTiming(0, { duration: 300 });
      progress.value = withTiming(0, { duration: 300 }, () => runOnJS(handleDismiss)());
    } else {
      bgOpacity.value = withTiming(0, { duration: 200 });
      dismissY.value = withTiming(
        dismissY.value >= 0 ? SCREEN_H : -SCREEN_H,
        { duration: 220 },
        () => runOnJS(handleDismiss)(),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the missing names are all useSharedValues, their references never change
  }, [origin, activeIndex, initialIndex, handleDismiss]);

  const swipeToDismiss = useMemo(() => Gesture.Pan()
    .enabled(!zoomed)
    .minPointers(1)
    .activeOffsetY([-20, 20])
    .failOffsetX([-10, 10])
    .onUpdate((e) => {
      dismissY.value = e.translationY;
      bgOpacity.value = interpolate(
        Math.abs(e.translationY), [0, 300], [1, 0.2], Extrapolation.CLAMP,
      );
    })
    // eslint-disable-next-line react-hooks/refs -- animateClose touches closingRef, but this handler only runs when the gesture ends, never during render
    .onEnd((e) => {
      if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 800) {
        runOnJS(animateClose)();
      } else {
        dismissY.value = withSpring(0, { damping: 20, stiffness: 200 });
        bgOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissY and bgOpacity are useSharedValues, their references never change
    }), [animateClose, zoomed]);

  const dismissStyle = useAnimatedStyle(() => ({
    opacity: pagerOpacity.value,
    transform: [
      { translateY: dismissY.value },
      { scale: interpolate(Math.abs(dismissY.value), [0, 400], [1, 0.85], Extrapolation.CLAMP) },
    ],
  }));

  const heroStyle = useAnimatedStyle(() => {
    const o = originRect.value;
    const t = targetRect.value;
    const p = progress.value;
    const dragScale = interpolate(Math.abs(dismissY.value), [0, 400], [1, 0.85], Extrapolation.CLAMP);
    return {
      opacity: heroOpacity.value,
      left: interpolate(p, [0, 1], [o.x, t.x]),
      top: interpolate(p, [0, 1], [o.y, t.y]),
      width: interpolate(p, [0, 1], [o.width, t.width]),
      height: interpolate(p, [0, 1], [o.height, t.height]),
      borderRadius: interpolate(p, [0, 1], [R.lg, 0]),
      transform: [{ translateY: dismissY.value * p }, { scale: 1 - (1 - dragScale) * p }],
    };
  });

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${bgOpacity.value})`,
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value * progress.value }));

  const chromeOpacity = useAnimatedStyle(() => ({
    opacity: chrome.value * progress.value,
    pointerEvents: chromeVisible ? "auto" as const : "none" as const,
  }));

  const toggleChrome = useCallback(() => setChromeVisible(v => !v), []);

  const renderItem = useCallback(({ item }: { item: TripMedia & { tripName: string } }) => (
    // Clipped, so a zoomed photo never spills over the next one
    <View style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
      {item.type === "image" ? (
        <ZoomableImage uri={item.url} thumbUri={item.thumbUrl} width={SCREEN_W} height={SCREEN_H} onTap={toggleChrome} onZoomChange={setZoomed} />
      ) : (
        <Pressable onPress={toggleChrome} accessibilityRole="button" accessibilityLabel="Play video" style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
          <Play size={28} color="#fff" weight="fill" />
        </Pressable>
      )}
    </View>
  ), [toggleChrome]);

  if (!visible || items.length === 0) return null;
  const current = items[activeIndex] ?? items[0];

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onShow={startOpen} onRequestClose={animateClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, bgStyle]}>
          {/* Like the trip pages: the photo, blurred and darkened, fills the space around it */}
          {current.type === "image" && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }, backdropStyle]}>
              <CachedImage
                uri={current.thumbUrl ?? current.url}
                blurRadius={60}
                transition={250}
                style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.3 }] }]}
                accessible={false}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
            </Animated.View>
          )}
          <GestureDetector gesture={swipeToDismiss}>
            <Animated.View style={[{ flex: 1 }, dismissStyle]}>
              <FlatList
                ref={flatListRef}
                data={items}
                renderItem={renderItem}
                keyExtractor={(m) => m.id}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed}
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={initialIndex}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                  setActiveIndex(idx);
                }}
              />
            </Animated.View>
          </GestureDetector>

          {/* Hero image: flies between the grid tile and full screen */}
          {items[initialIndex]?.type === "image" && (
            <Animated.View pointerEvents="none" style={[{ position: "absolute", overflow: "hidden", backgroundColor: C.card, zIndex: 5 }, heroStyle]}>
              <ExpoImage
                source={{ uri: items[initialIndex].thumbUrl ?? items[initialIndex].url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                // Animated bounds otherwise trigger CPU bitmap resizing each frame.
                allowDownscaling={false}
                cachePolicy="memory-disk"
                onLoad={(e) => {
                  if (!origin?.aspect && e?.source?.width && e?.source?.height) {
                    targetRect.value = fitRect(e.source.width / e.source.height);
                  }
                }}
              />
            </Animated.View>
          )}

          {/* Top chrome */}
          <Animated.View style={[{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          }, chromeOpacity]} accessibilityElementsHidden={!chromeVisible} importantForAccessibility={chromeVisible ? "auto" : "no-hide-descendants"}>
            <LinearGradient
              // No dark band: the controls sit straight on the photo and its blurred surround
              colors={["transparent", "transparent"]}
              style={{ paddingTop: insets.top + 8, paddingHorizontal: S.md, paddingBottom: 32 }}
            >
              {/* Photos-style: close on the left, who added it and when in the middle */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <Pressable onPress={animateClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                  <ViewerGlass style={viewerStyles.circle}>
                    <X size={18} color="#fff" weight="bold" />
                  </ViewerGlass>
                </Pressable>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: T.base, fontWeight: T.semibold, color: "#fff", ...TEXT_ON_PHOTO }} numberOfLines={1}>
                    {current.uploadedBy?.trim() || "Someone on the trip"}
                  </Text>
                  <Text style={{ fontSize: T.sm, color: "rgba(255,255,255,0.85)", marginTop: 1, ...TEXT_ON_PHOTO }} numberOfLines={1}>
                    {[/^Day \d/.test(current.dayLabel) ? current.dayLabel : null, formatDateCompact(current.takenAt ?? current.uploadedAt)].filter(Boolean).join(", ")}
                  </Text>
                </View>
                <View style={{ width: 44 }} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Bottom chrome */}
          <Animated.View style={[{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
          }, chromeOpacity]} accessibilityElementsHidden={!chromeVisible} importantForAccessibility={chromeVisible ? "auto" : "no-hide-descendants"}>
            <LinearGradient
              colors={["transparent", "transparent"]}
              style={{ paddingBottom: insets.bottom + S.md, paddingHorizontal: S.md, paddingTop: 48 }}
            >
              {/* One glass toolbar: share, favourite, and delete on your own photos or report someone else's */}
              <ViewerGlass style={viewerStyles.toolbar}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Share.share({ url: current.url, message: Platform.OS === "android" ? current.url : undefined }); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Share"
                  style={({ pressed }) => [viewerStyles.tool, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Export size={22} color="#fff" weight="regular" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onToggleHeart(current);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  disabled={liking.has(`${current.tripId}:${current.id}`)}
                  accessibilityLabel={(current.likes ?? []).some(like => like.uid === firebaseAuth().currentUser?.uid) ? "Unlike photo" : "Like photo"}
                  accessibilityState={{ selected: (current.likes ?? []).some(like => like.uid === firebaseAuth().currentUser?.uid) }}
                  style={({ pressed }) => [viewerStyles.tool, { opacity: pressed ? 0.6 : 1 }]}
                >
                  {liking.has(`${current.tripId}:${current.id}`) ? <ActivityIndicator color="#fff" /> : <Heart
                    size={24}
                    color={(current.likes ?? []).some(like => like.uid === firebaseAuth().currentUser?.uid) ? "#ff4d6d" : "#fff"}
                    weight={(current.likes ?? []).some(like => like.uid === firebaseAuth().currentUser?.uid) ? "fill" : "regular"}
                  />}
                </Pressable>
                <Pressable onPress={() => setShowLikes(true)} accessibilityRole="button" accessibilityLabel={`See ${(current.likes ?? []).length} likes`} style={[viewerStyles.tool, { width: 64 }]}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{(current.likes ?? []).length} {(current.likes ?? []).length === 1 ? "like" : "likes"}</Text>
                </Pressable>
                {canDelete(current) && (
                  <Pressable
                    onPress={() => onDelete(current)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete photo"
                    style={({ pressed }) => [viewerStyles.tool, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Trash size={22} color="#fff" weight="regular" />
                  </Pressable>
                )}
                {!canDelete(current) && (
                  <Pressable
                    onPress={() => onReport(current)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Report photo"
                    style={({ pressed }) => [viewerStyles.tool, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Flag size={22} color="#fff" weight="regular" />
                  </Pressable>
                )}
              </ViewerGlass>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
        {showLikes && current && <PhotoLikesSheet likes={current.likes ?? []} onClose={() => setShowLikes(false)} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── Media Grid Item ──────────────────────────────────────────────────────────

const GridItem = React.memo(function GridItem({ item, tripId, size, onPress, onDelete, onReport, C }: {
  item: TripMedia;
  tripId: string;
  size: number;
  onPress: (id: string, origin: OriginRect | null) => void;
  onDelete?: (item: TripMedia & { tripId: string }) => void;
  onReport?: (item: TripMedia & { tripId: string }) => void;
  C: ThemeColors;
}) {
  const tileRef = useRef<HostInstance>(null);
  const aspectRef = useRef<number | undefined>(undefined);
  const open = () => {
    const node = tileRef.current;
    if (!node) { onPress(item.id, null); return; }
    node.measureInWindow((x, y, w, h) => {
      onPress(item.id, w > 0 && h > 0 ? { x, y, width: w, height: h, aspect: aspectRef.current } : null);
    });
  };
  return (
    <ContextMenu
      actions={[
        { title: "View", systemIcon: "eye" },
        { title: "Share", systemIcon: "square.and.arrow.up" },
        // Delete only on your own photos; anyone else's can be reported
        ...(onDelete ? [{ title: "Delete", systemIcon: "trash", destructive: true }] : []),
        ...(onReport ? [{ title: "Report", systemIcon: "flag", destructive: true }] : []),
      ]}
      onPress={(e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
        if (e.nativeEvent.index === 0) open();
        else if (e.nativeEvent.index === 1) Share.share({ url: item.url });
        else if (e.nativeEvent.index === 2) (onDelete ?? onReport)?.({ ...item, tripId });
      }}
    >
    <Pressable
      ref={tileRef}
      onPress={() => { Haptics.selectionAsync(); open(); }}
      accessibilityRole="button"
      accessibilityLabel={item.uploadedBy ? `Photo by ${item.uploadedBy}` : "Photo"}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: 0,
        overflow: "hidden",
        backgroundColor: C.elevated,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {item.type === "image" ? (
        <CachedImage
          uri={item.thumbUrl ?? item.url}
          style={{ width: "100%", height: "100%" }}
          transition={120}
          enforceEarlyResizing
          recyclingKey={item.id}
          onLoad={(e) => {
            if (e?.source?.width && e?.source?.height) aspectRef.current = e.source.width / e.source.height;
          }}
        />
      ) : (
        <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
          <Play size={22} color={C.textSecondary} weight="fill" />
        </View>
      )}
    </Pressable>
    </ContextMenu>
  );
});

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function MediaScreen() {
  const { C } = useTheme();
  const route = useLocalSearchParams<{ tripId?: string; mediaId?: string }>();
  const openedPhoto = useRef<string | null>(null);
  const { toast } = useToast();
  const { prefs } = usePreferences();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, ready, offline, deletePhoto, likePhoto, reload } = useTrips();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [viewerOrigin, setViewerOrigin] = useState<OriginRect | null>(null);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  }, [reload]);

  // Only confirmed gallery records appear here; upload previews live in the sharing sheet.
  const mergedTrips = useMemo(() => trips.map(t => ({
    ...t, media: (t.media ?? []).filter(m => m.url?.startsWith("https://")),
  })), [trips]);

  // Photos this person reported stay hidden on this device, whatever the organiser decides
  const HIDDEN_KEY = "daf-media-hidden";
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY).then(raw => {
      if (raw) setHidden(new Set(JSON.parse(raw)));
    }).catch(() => {});
  }, []);

  // Photos only until the app has a video player: a video tile would open to a play button that does nothing
  const tripsWithMedia = useMemo(() => mergedTrips
    .map(t => ({ ...t, media: t.media?.filter(m => m.type === "image" && !hidden.has(m.id)) }))
    .filter(t => (t.media?.length ?? 0) > 0), [mergedTrips, hidden]);

  // Default to everything. Only a trip that is live right now narrows the
  // gallery, so an upcoming trip with no photos never makes it look empty.
  const resolvedTripFilter = useMemo(() => {
    if (tripFilter !== null) return tripFilter;
    if (trips.length <= 1) return "all";
    const now = new Date();
    const active = trips.find(t => parseTripDate(t.start) <= now && parseTripDate(t.end) >= now);
    return active ? active.id : "all";
  }, [tripFilter, trips]);

  const filteredTrips = useMemo(() => {
    let list = resolvedTripFilter === "all" ? tripsWithMedia : tripsWithMedia.filter(t => t.id === resolvedTripFilter);
    if (mediaFilter !== "all") {
      list = list
        .map(t => ({ ...t, media: t.media?.filter(m => m.type === mediaFilter) }))
        .filter(t => (t.media?.length ?? 0) > 0);
    }
    return list;
  }, [tripsWithMedia, resolvedTripFilter, mediaFilter]);

  const galleryRows = useMemo(() => buildGalleryRows(filteredTrips), [filteredTrips]);

  // The viewer pages through exactly what the grid shows, in the same order
  const allItems = useMemo(() => {
    const out: ViewerItem[] = [];
    let dayLabel = "";
    for (const row of galleryRows) {
      if (row.type === "day-header") dayLabel = row.label;
      else if (row.type === "grid-row") for (const m of row.items) out.push({ ...m, tripId: row.tripId, tripName: row.tripName, dayLabel });
    }
    return out;
  }, [galleryRows]);

  useEffect(() => {
    if (!route.tripId || !route.mediaId) return;
    const key = `${route.tripId}:${route.mediaId}`;
    if (openedPhoto.current === key) return;
    // Present after navigation has attached the gallery screen to its window.
    const frame = requestAnimationFrame(() => {
      if (resolvedTripFilter !== route.tripId) { setTripFilter(route.tripId!); return; }
      const index = allItems.findIndex(photo => photo.tripId === route.tripId && photo.id === route.mediaId);
      if (index >= 0) { openedPhoto.current = key; setViewerIndex(index); }
    });
    return () => cancelAnimationFrame(frame);
  }, [route.tripId, route.mediaId, allItems, resolvedTripFilter]);

  const allItemsIndex = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((m, i) => map.set(m.id, i));
    return map;
  }, [allItems]);

  const [liking, setLiking] = useState<Set<string>>(new Set());
  const likeRequests = useRef(new Set<string>());
  const toggleHeart = useCallback(async (item: ViewerItem) => {
    const key = `${item.tripId}:${item.id}`;
    if (likeRequests.current.has(key)) return;
    likeRequests.current.add(key);
    setLiking(new Set(likeRequests.current));
    try {
      const liked = (item.likes ?? []).some(like => like.uid === firebaseAuth().currentUser?.uid);
      await likePhoto(item.tripId, item.id, !liked);
    } catch { toast("Couldn’t save your like. Please try again.", "error"); }
    finally {
      likeRequests.current.delete(key);
      setLiking(new Set(likeRequests.current));
    }
  }, [likePhoto, toast]);
  const router = useRouter();
  const emptyTrip = useMemo(() => {
    if (resolvedTripFilter !== "all") return trips.find(t => t.id === resolvedTripFilter) ?? null;
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.find(t => parseTripDate(t.end) >= new Date()) ?? sorted[sorted.length - 1] ?? null;
  }, [trips, resolvedTripFilter]);

  const [galleryHeaderHeight, setGalleryHeaderHeight] = useState(0);
  const rowOffsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const r of galleryRows) { out.push(y); y += rowHeight(r); }
    return out;
  }, [galleryRows]);
  const getItemLayout = useCallback((_: unknown, index: number) => (
    { length: rowHeight(galleryRows[index]), offset: galleryHeaderHeight + (rowOffsets[index] ?? 0), index }
  ), [galleryRows, rowOffsets, galleryHeaderHeight]);

  const isMine = useCallback((item: TripMedia) =>
    !!item.uploaderId && (item.uploaderId === deviceId || item.uploaderId === firebaseAuth().currentUser?.uid), [deviceId]);

  const handleDelete = useCallback((item: TripMedia & { tripId: string }) => {
    const isOwner = item.uploaderId && (item.uploaderId === deviceId || item.uploaderId === firebaseAuth().currentUser?.uid);
    if (!isOwner) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Can't delete", "You can only remove photos you uploaded.");
      return;
    }
    // A warning tap ahead of a destructive confirm
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete photo?", `Remove "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          setViewerIndex(-1);
          try {
            await deletePhoto(item.tripId, item.id);
          } catch {
            toast("Couldn't remove this photo. Please try again.", "error");
            return;
          }
          toast("Removed");
        },
      },
    ]);
  }, [deletePhoto, toast, deviceId]);

  const handleReport = useCallback((item: TripMedia & { tripId: string }) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Report this photo?", "Your trip organiser will be told so they can review it. It's hidden for you straight away.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report", style: "destructive",
        onPress: async () => {
          setHidden(prev => {
            const next = new Set(prev).add(item.id);
            AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
            return next;
          });
          const sent = await reportTripMedia(item.tripId, item.id);
          if (sent) toast("Reported. Your organiser has been told.");
          else toast("Hidden for you, but the report didn't send. Check your connection.", "error");
        },
      },
    ]);
  }, [toast]);

  const openMedia = useCallback((id: string, origin: OriginRect | null) => {
    setViewerOrigin(origin);
    setViewerIndex(allItemsIndex.get(id) ?? -1);
  }, [allItemsIndex]);

  const renderGalleryRow = useCallback(({ item: row }: { item: GalleryRow }) => {
    if (row.type === "trip-header") {
      return (
        <View style={{ height: TRIP_HEADER_H, paddingHorizontal: S.md, paddingTop: row.first ? S.xs : S.lg, paddingBottom: row.first ? S.lg : S.xs }}>
          <View style={styles.tripBanner}>
            {row.cover ? <CachedImage uri={row.cover} style={StyleSheet.absoluteFill} accessible={false} /> : null}
            {/* Dark at the foot so white text holds at 4.5:1 even on a white photo */}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.68)"]}
              locations={[0.3, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.tripBannerText} accessible accessibilityRole="header" accessibilityLabel={`${row.name}, ${row.dateRange}, ${row.count} photo${row.count !== 1 ? "s" : ""}`}>
              <Text style={styles.tripBannerName} numberOfLines={1}>{row.name}</Text>
              <Text style={styles.tripBannerSub} numberOfLines={1}>
                {row.dateRange}, {row.count} photo{row.count !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    if (row.type === "day-header") {
      return (
        <View style={{ height: DAY_HEADER_H, paddingHorizontal: S.md, paddingBottom: S.xs2, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
          <Text style={{ fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary }} numberOfLines={1}>{row.label}</Text>
          <Text style={{ fontSize: T.sm, color: C.textTertiary, flex: 1 }} numberOfLines={1}>{row.date}</Text>
        </View>
      );
    }

    return (
      <View style={{ flexDirection: "row", gap: GRID_GAP, marginBottom: GRID_GAP }}>
        {row.items.map(m => (
          <GridItem
            key={m.id}
            item={m}
            tripId={row.tripId}
            size={GRID_ITEM_SIZE}
            onPress={openMedia}
            onDelete={isMine(m) ? handleDelete : undefined}
            onReport={isMine(m) ? undefined : handleReport}
            C={C}
          />
        ))}
      </View>
    );
  }, [C, styles, openMedia, handleDelete, handleReport, isMine]);

  const handleUploadNew = useCallback(() => {
    if (!trips.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerOpen(true);
  }, [trips.length]);

  const handleShared = useCallback((tripId: string, count: number) => {
    setTripFilter(tripId);
    const trip = trips.find(t => t.id === tripId);
    if (trip && count) void notifyTripMembers(tripId, trip.destination || trip.name, prefs.name || "Someone", count, deviceId);
  }, [trips, prefs.name, deviceId]);

  const mediaChips = useMemo(() => ([
    { id: "all" as const, label: "All" },
    { id: "image" as const, label: "Photos" },
    { id: "video" as const, label: "Videos" },
  ]), []);

  const tripMenuLabel = useMemo(() => {
    if (resolvedTripFilter === "all") return "All trips";
    const t = trips.find(x => x.id === resolvedTripFilter);
    return t?.destination || t?.name || "All trips";
  }, [resolvedTripFilter, trips]);

  const tripMenuImage = resolvedTripFilter === "all" ? undefined : trips.find(x => x.id === resolvedTripFilter)?.image;

  const { onScroll, barStyle } = useCollapsingHeader();

  const listHeader = useMemo(() => (
    <View>
      {/* ── Filters ── */}
      {tripsWithMedia.length > 0 && (
        <View style={styles.chipRow}>
          {trips.length > 1 && (
            <ContextMenu
              dropdownMenuMode
              title="Show photos from"
              actions={[
                { title: "All trips", selected: resolvedTripFilter === "all" },
                ...trips.map(t => ({ title: t.destination || t.name, selected: resolvedTripFilter === t.id })),
              ]}
              onPress={(e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
                const idx = e.nativeEvent.index as number;
                Haptics.selectionAsync();
                setTripFilter(idx === 0 ? "all" : trips[idx - 1]?.id ?? "all");
              }}
            >
              <View style={styles.tripMenuBtn} accessibilityRole="button" accessibilityLabel={`Trip: ${tripMenuLabel}`}>
                {tripMenuImage ? (
                  <CachedImage uri={tripMenuImage} style={styles.tripMenuThumb} accessible={false} />
                ) : (
                  <View style={[styles.tripMenuThumb, { alignItems: "center", justifyContent: "center" }]}>
                    <Images size={14} color={C.textSecondary} weight="fill" />
                  </View>
                )}
                <Text style={styles.tripMenuText} numberOfLines={1}>{tripMenuLabel}</Text>
                <CaretDown size={12} color={C.textSecondary} weight="bold" />
              </View>
            </ContextMenu>
          )}
          <View style={{ flex: 1 }} />

        </View>
      )}

      {/* ── Empty states ── */}
      {trips.length === 0 ? null : filteredTrips.length === 0 && mediaFilter !== "all" && tripsWithMedia.length > 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            compact
            symbol={mediaFilter === "video" ? "video" : "photo"}
            icon={mediaFilter === "video"
              ? <VideoCamera size={30} color={C.tealText} weight="duotone" />
              : <ImageSquare size={30} color={C.tealText} weight="duotone" />}
            title={mediaFilter === "video" ? "No videos yet" : "No photos yet"}
            message={`Nothing ${mediaFilter === "video" ? "filmed" : "photographed"} on this trip so far.`}
            secondary={{ label: "Show all photos and videos", onPress: () => setMediaFilter("all") }}
          />
        </View>
      ) : (tripsWithMedia.length === 0 || filteredTrips.length === 0) && emptyTrip ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            compact
            symbol="camera"
            icon={<Camera size={30} color={C.tealText} weight="duotone" />}
            title={`No photos from ${emptyTrip.destination || emptyTrip.name} yet`}
            message="Anything you or the group add shows up here for everyone, newest first."
            cta={{ label: "Add photos", onPress: handleUploadNew }}
          />
          {resolvedTripFilter !== "all" && tripsWithMedia.length > 0 && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setTripFilter("all"); }}
              accessibilityRole="button"
              style={({ pressed }) => [{ alignSelf: "center", paddingVertical: S.xs }, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.emptyLink}>Show all trips</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mediaChips and router are no longer read in this header, they only cause a harmless extra recompute
  ), [C, mediaChips, tripMenuLabel, tripMenuImage, trips, filteredTrips.length, mediaFilter, resolvedTripFilter, styles, tripsWithMedia.length, emptyTrip, router, handleUploadNew]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollViewMarker style={{ flex: 1 }} scrollEdgeEffects={{ top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" }}>
      <Animated.FlatList
        data={galleryRows}
        renderItem={renderGalleryRow}
        keyExtractor={r => r.key}
        getItemLayout={getItemLayout}
        ListHeaderComponent={
          <View onLayout={e => setGalleryHeaderHeight(e.nativeEvent.layout.height)}>
            {trips.length === 0 ? (
              <NoTripsPage screen="gallery" ready={ready} offline={offline} onRetry={onRefresh} retrying={refreshing} />
            ) : (
            <ScreenTitle
              right={trips.length > 0 ? (
                <IconCircleButton
                  variant="glass" size={36}
                  onPress={handleUploadNew}
                  accessibilityLabel="Add photos to the trip gallery"
                >
                  <Plus size={18} color={C.textPrimary} weight="bold" />
                </IconCircleButton>
              ) : undefined}
            >
              Gallery
            </ScreenTitle>
            )}
            {listHeader}
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={9}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      />
      </ScrollViewMarker>

      <CompactHeader title="Gallery" barStyle={barStyle} />

      {pickerOpen && <GalleryUploadSheet
        trips={trips}
        initialTripId={resolvedTripFilter !== "all" ? resolvedTripFilter : undefined}
        onShared={handleShared}
        onClose={() => setPickerOpen(false)}
      />}

      <MediaViewer
        items={allItems}
        initialIndex={viewerIndex}
        visible={viewerIndex >= 0}
        origin={viewerOrigin}
        onClose={() => setViewerIndex(-1)}
        onDelete={(item) => { setViewerIndex(-1); handleDelete(item); }}
        onReport={(item) => { setViewerIndex(-1); handleReport(item); }}
        canDelete={isMine}
        liking={liking}
        onToggleHeart={toggleHeart}
        C={C}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    scroll: { paddingBottom: SCROLL_BOTTOM_PAD },
    headerUploadBtn: {
      width: 34, height: 34, borderRadius: R.full,
      backgroundColor: C.teal,
      alignItems: "center", justifyContent: "center",
    },

    // ── Filters ──
    chipRow: {
      flexDirection: "row", alignItems: "center", gap: S.xs2,
      paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.md,
    },
    tripMenuBtn: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      maxWidth: 220, paddingVertical: 5, paddingLeft: 5, paddingRight: S.sm,
      borderRadius: R.md, backgroundColor: C.elevated,
    },
    tripMenuThumb: { width: 24, height: 24, borderRadius: R.sm, backgroundColor: C.card, overflow: "hidden" },
    tripBanner: { flex: 1, borderRadius: R.xl, overflow: "hidden", backgroundColor: C.elevated, justifyContent: "flex-end" },
    tripBannerText: { paddingHorizontal: S.md, paddingBottom: S.sm2 },
    tripBannerName: { fontSize: T["2xl"], fontWeight: T.bold, color: "#fff", letterSpacing: -0.3 },
    tripBannerSub: { fontSize: T.sm, color: "rgba(255,255,255,0.88)", marginTop: 2 },
    tripMenuText: { fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary, flexShrink: 1 },

    // ── Upload progress ──
    progressCard: { marginHorizontal: S.md, marginBottom: S.md, padding: S.md, backgroundColor: C.card, borderRadius: R.lg, gap: S.xs },
    progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    progressText: { fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary },
    progressPct: { fontSize: T.sm, color: C.textTertiary, fontVariant: ["tabular-nums"] },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: C.elevated, overflow: "hidden" },
    progressFill: { height: 4, backgroundColor: C.teal },

    // ── Empty ──
    emptyWrap: { paddingTop: S.xl, paddingHorizontal: S.md },
    emptyLink: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText },
  });
}
