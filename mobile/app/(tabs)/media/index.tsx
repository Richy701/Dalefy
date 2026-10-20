import { useCollapsingHeader, CompactHeader, ScreenTitle } from "@/components/ui/CollapsingHeader";
import { CachedImage } from "@/components/CachedImage";
import { useRouter } from "expo-router";
import {
  View, Text, ScrollView, StyleSheet, Dimensions, FlatList,
  Pressable, Alert, Platform, RefreshControl, Modal, Share, ActionSheetIOS,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import ContextMenu from "@/components/ContextMenu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Play, Plus, Camera, X, Trash, Heart, Export, VideoCamera, ImageSquare,
  CaretRight, CaretDown,
} from "phosphor-react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
  interpolate, Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoTripsPage } from "@/components/ui/JoinTripNote";
import { DragHandle } from "@/components/ui/DragHandle";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import * as Haptics from "@/services/haptics";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTheme } from "@/context/ThemeContext";
import { ScrollViewMarker } from "react-native-screens/src/components/gamma/scroll-view-marker";
import { useToast } from "@/context/ToastContext";
import { type ThemeColors, T, R, S, SCROLL_BOTTOM_PAD } from "@/constants/theme";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadTripMedia } from "@/services/mediaUpload";
import { parseTripDate } from "@/shared/dates";
import { changeTripMedia, fetchTripById } from "@/services/firebaseTrips";
import { firebaseAuth, waitForAuth } from "@/services/firebase";
import { getDeviceId } from "@/services/deviceId";
import type { TripMedia, Trip } from "@/shared/types";

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
const TRIP_HEADER_H = 60;
const DAY_HEADER_H = 44;

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
  | { type: "trip-header"; key: string; name: string; dateRange: string; count: number }
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
  filteredTrips: Array<{ id: string; name: string; destination?: string; start: string; end: string; media?: TripMedia[] }>,
): GalleryRow[] {
  const rows: GalleryRow[] = [];
  const showTripHeaders = filteredTrips.length > 1;
  for (const trip of filteredTrips) {
    const media = trip.media ?? [];
    if (media.length === 0) continue;
    const tripName = trip.destination || trip.name;

    if (showTripHeaders) {
      const dateRange = `${parseTripDate(trip.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parseTripDate(trip.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
      rows.push({ type: "trip-header", key: `h-${trip.id}`, name: tripName, dateRange, count: media.length });
    }

    // Newest day first, newest photo first within a day
    const byDay = new Map<string, TripMedia[]>();
    for (const m of media) {
      const k = mediaDayKey(m);
      const list = byDay.get(k);
      if (list) list.push(m); else byDay.set(k, [m]);
    }
    const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
    for (const k of days) {
      const items = byDay.get(k)!.slice().sort((a, b) => mediaTime(b) - mediaTime(a));
      // Older uploads have no taken time; outside the trip dates their day is only when they were added
      let label = dayLabelFor(k, trip.start, trip.end);
      if (label.endsWith("the trip") && !items.some(m => m.takenAt)) label = "Added";
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

/** EXIF "2026:11:09 14:02:11" -> { takenAt: "2026-11-09T14:02:11" }; omitted when missing (Firestore rejects undefined) */
function exifTakenAt(exif: Record<string, any> | null | undefined): { takenAt?: string } {
  const raw = exif?.DateTimeOriginal ?? exif?.["{Exif}"]?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== "string") return {};
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? { takenAt: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` } : {};
}

function formatDateCompact(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${mon}, ${h}:${m}`;
}

/**
 * Pick media from the device library.
 * Returns items with local URIs — caller is responsible for uploading.
 */
async function pickMedia(onPicked: (items: TripMedia[]) => void) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permission needed", "Allow access to your photo library to upload memories.");
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.85,
    selectionLimit: 20,
    exif: true,
  });
  if (!result.canceled) {
    const items: TripMedia[] = result.assets.map((a, i) => ({
      id: `upload-${Date.now()}-${i}`,
      type: (a.type === "video" ? "video" : "image") as "image" | "video",
      name: a.fileName ?? `media-${i + 1}`,
      url: a.uri,
      size: a.fileSize ?? 0,
      uploadedAt: new Date().toISOString(),
      ...exifTakenAt(a.exif),
    }));
    onPicked(items);
  }
}


// ── Trip Picker Sheet ────────────────────────────────────────────────────────

function TripPickerSheet({ visible, trips, onPick, onClose, C }: {
  visible: boolean;
  trips: Trip[];
  onPick: (tripId: string) => void;
  onClose: () => void;
  C: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
      </Pressable>
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        backgroundColor: C.card,
        borderTopLeftRadius: R["2xl"], borderTopRightRadius: R["2xl"],
        paddingBottom: insets.bottom + S.md,
        maxHeight: "70%",
      }}>
        <DragHandle />
        <Text style={{
          fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary,
          letterSpacing: -0.3, paddingHorizontal: S.md, marginBottom: S.sm,
        }}>Upload to trip</Text>
        <Text style={{
          fontSize: T.sm, color: C.textTertiary, paddingHorizontal: S.md,
          marginBottom: S.md, lineHeight: 18,
        }}>Which trip are these memories from?</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {trips.map(t => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={t.name}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: S.sm,
                paddingHorizontal: S.md, paddingVertical: S.sm,
                backgroundColor: pressed ? C.elevated : "transparent",
              })}
              onPress={() => { Haptics.selectionAsync(); onPick(t.id); }}
            >
              <CachedImage uri={t.image} style={{
                width: 48, height: 48, borderRadius: R.md,
              }} />
              <View style={{ flex: 1 }}>
                {t.destination && (
                  <MicroLabel color={C.tealText} style={{ marginBottom: 2 }}>{t.destination}</MicroLabel>
                )}
                <Text style={{
                  fontSize: T.base, fontWeight: T.bold, color: C.textPrimary,
                }} numberOfLines={1}>{t.name}</Text>
                <Text style={{
                  fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium,
                  marginTop: 2,
                }}>{t.media?.length ?? 0} items</Text>
              </View>
              <CaretRight size={16} color={C.textTertiary} weight="regular" />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Zoomable Image ──────────────────────────────────────────────────────────

// Viewer controls: real Liquid Glass where available, a dark frosted fill elsewhere
const VIEWER_GLASS = isLiquidGlassAvailable();
// A dark tint under the glass so the controls stay visible over bright and dark photos alike
function ViewerGlass({ style, children }: { style: any; children: React.ReactNode }) {
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

const ZoomableImage = React.memo(function ZoomableImage({ uri, thumbUri, width, height, onTap }: {
  uri: string; thumbUri?: string; width: number; height: number; onTap: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, { damping: 15, stiffness: 120 });
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withSpring(4, { damping: 15, stiffness: 120 });
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      if (!success) return;
      if (savedScale.value > 1) {
        scale.value = withSpring(1, { damping: 15, stiffness: 120 });
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5, { damping: 15, stiffness: 120 });
        savedScale.value = 2.5;
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
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ── Fullscreen Viewer ────────────────────────────────────────────────────────

function MediaViewer({ items, initialIndex, visible, origin, onClose, onDelete, canDelete, hearted, onToggleHeart, C }: {
  items: ViewerItem[];
  initialIndex: number;
  visible: boolean;
  origin: OriginRect | null;
  onClose: () => void;
  onDelete: (item: ViewerItem) => void;
  canDelete: (item: ViewerItem) => boolean;
  hearted: Set<string>;
  onToggleHeart: (id: string) => void;
  C: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
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
  }, [hideHero]);

  useEffect(() => {
    if (visible && initialIndex >= 0) {
      setActiveIndex(initialIndex);
      setChromeVisible(true);
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
  }, [visible, initialIndex]);

  useEffect(() => {
    chrome.value = withTiming(chromeVisible ? 1 : 0, { duration: 200 });
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
  }, [origin, activeIndex, initialIndex, handleDismiss]);

  const swipeToDismiss = useMemo(() => Gesture.Pan()
    .minPointers(1)
    .activeOffsetY([-20, 20])
    .failOffsetX([-10, 10])
    .onUpdate((e) => {
      dismissY.value = e.translationY;
      bgOpacity.value = interpolate(
        Math.abs(e.translationY), [0, 300], [1, 0.2], Extrapolation.CLAMP,
      );
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 800) {
        runOnJS(animateClose)();
      } else {
        dismissY.value = withSpring(0, { damping: 20, stiffness: 200 });
        bgOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      }
    }), [animateClose]);

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
    <View style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: "center", alignItems: "center" }}>
      {item.type === "image" ? (
        <ZoomableImage uri={item.url} thumbUri={item.thumbUrl} width={SCREEN_W} height={SCREEN_H} onTap={toggleChrome} />
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
          }, chromeOpacity]}>
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
          }, chromeOpacity]}>
            <LinearGradient
              colors={["transparent", "transparent"]}
              style={{ paddingBottom: insets.bottom + S.md, paddingHorizontal: S.md, paddingTop: 48 }}
            >
              {/* One glass toolbar: share, favourite, and delete on your own photos */}
              <ViewerGlass style={viewerStyles.toolbar}>
                <Pressable
                  onPress={() => { Share.share({ url: current.url, message: Platform.OS === "android" ? current.url : undefined }); }}
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
                    onToggleHeart(current.id);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={hearted.has(current.id) ? "Remove from favourites" : "Add to favourites"}
                  accessibilityState={{ selected: hearted.has(current.id) }}
                  style={({ pressed }) => [viewerStyles.tool, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Heart
                    size={24}
                    color={hearted.has(current.id) ? "#ff4d6d" : "#fff"}
                    weight={hearted.has(current.id) ? "fill" : "regular"}
                  />
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
              </ViewerGlass>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── Media Grid Item ──────────────────────────────────────────────────────────

const GridItem = React.memo(function GridItem({ item, size, onPress, onDelete, C }: {
  item: TripMedia;
  size: number;
  onPress: (origin: OriginRect | null) => void;
  onDelete: () => void;
  C: ThemeColors;
}) {
  const tileRef = useRef<View>(null);
  const aspectRef = useRef<number | undefined>(undefined);
  const open = () => {
    const node = tileRef.current;
    if (!node) { onPress(null); return; }
    node.measureInWindow((x, y, w, h) => {
      onPress(w > 0 && h > 0 ? { x, y, width: w, height: h, aspect: aspectRef.current } : null);
    });
  };
  return (
    <ContextMenu
      actions={[
        { title: "View", systemIcon: "eye" },
        { title: "Share", systemIcon: "square.and.arrow.up" },
        { title: "Delete", systemIcon: "trash", destructive: true },
      ]}
      onPress={(e: any) => {
        if (e.nativeEvent.index === 0) open();
        else if (e.nativeEvent.index === 1) Share.share({ url: item.url });
        else if (e.nativeEvent.index === 2) onDelete();
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
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.thumbUrl === next.item.thumbUrl &&
  prev.size === next.size &&
  prev.C === next.C
);

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function MediaScreen() {
  const { C, isDark } = useTheme();
  const { toast } = useToast();
  const { prefs } = usePreferences();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, ready, offline, updateTrip, updateTripLocal, reload } = useTrips();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [viewerOrigin, setViewerOrigin] = useState<OriginRect | null>(null);

  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  /** Pending uploads — persisted to AsyncStorage so they survive refresh + restart */
  const PENDING_KEY = "daf-pending-media";
  const [pendingMedia, setPendingMediaRaw] = useState<Record<string, TripMedia[]>>({});
  const pendingLoaded = useRef(false);

  // Wrap setter to also persist
  const setPendingMedia = useCallback((updater: (prev: Record<string, TripMedia[]>) => Record<string, TripMedia[]>) => {
    setPendingMediaRaw(prev => {
      const next = updater(prev);
      AsyncStorage.setItem(PENDING_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Load persisted pending media on mount
  useEffect(() => {
    AsyncStorage.getItem(PENDING_KEY).then(raw => {
      if (raw) setPendingMediaRaw(JSON.parse(raw));
      pendingLoaded.current = true;
    }).catch(() => { pendingLoaded.current = true; });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Clear pending media cache — Firestore is the source of truth
    setPendingMedia(() => ({}));
    await reload();
    setRefreshing(false);
  }, [reload, setPendingMedia]);

  // Clean up pending items that have been uploaded, are stale, have dead local URIs,
  // or belong to trips the user is no longer a member of
  useEffect(() => {
    let changed = false;
    const staleMs = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    const tripIds = new Set(trips.map(t => t.id));
    const cleaned: Record<string, TripMedia[]> = {};
    for (const [tripId, items] of Object.entries(pendingMedia)) {
      if (!tripIds.has(tripId)) { changed = true; continue; }
      const trip = trips.find(t => t.id === tripId);
      const existingIds = new Set((trip?.media ?? []).map(m => m.id));
      const remaining = items.filter(m => {
        if (existingIds.has(m.id)) return false;
        if (m.url.includes("firebasestorage")) return false;
        // Drop local URIs older than 1h — iOS reclaims temp files
        const age = m.uploadedAt ? now - new Date(m.uploadedAt).getTime() : staleMs + 1;
        if (!m.url.startsWith("https://") && age > staleMs) return false;
        return true;
      });
      if (remaining.length !== items.length) changed = true;
      if (remaining.length > 0) cleaned[tripId] = remaining;
    }
    if (changed) setPendingMedia(() => cleaned);
  }, [trips, pendingMedia, setPendingMedia]);

  const isValidMediaUrl = useCallback((url?: string) =>
    !!url && (url.startsWith("https://") || url.startsWith("file://") || url.startsWith("ph://")),
  []);

  const mergedTrips = useMemo(() =>
    trips.map(t => {
      const ownMedia = (t.media ?? []).filter(m => m.url?.startsWith("https://"));
      const pending = pendingMedia[t.id];
      if (!pending?.length) return { ...t, media: ownMedia };
      const existingIds = new Set(ownMedia.map(m => m.id));
      const newItems = pending.filter(m => !existingIds.has(m.id) && isValidMediaUrl(m.url));
      if (!newItems.length) return { ...t, media: ownMedia };
      return { ...t, media: [...ownMedia, ...newItems] };
    }),
    [trips, pendingMedia, isValidMediaUrl],
  );

  const tripsWithMedia = useMemo(() => mergedTrips.filter(t => (t.media?.length ?? 0) > 0), [mergedTrips]);

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

  const allItemsIndex = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((m, i) => map.set(m.id, i));
    return map;
  }, [allItems]);

  // Hearts are private favourites kept on this device
  const HEARTS_KEY = "daf-media-hearts";
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(HEARTS_KEY).then(raw => {
      if (raw) setHearted(new Set(JSON.parse(raw)));
    }).catch(() => {});
  }, []);
  const toggleHeart = useCallback((id: string) => {
    setHearted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      AsyncStorage.setItem(HEARTS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  const router = useRouter();
  const emptyTrip = useMemo(() => {
    if (resolvedTripFilter !== "all") return trips.find(t => t.id === resolvedTripFilter) ?? null;
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.find(t => parseTripDate(t.end) >= new Date()) ?? sorted[sorted.length - 1] ?? null;
  }, [trips, resolvedTripFilter]);

  const rowOffsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const r of galleryRows) { out.push(y); y += rowHeight(r); }
    return out;
  }, [galleryRows]);
  const getItemLayout = useCallback((_: any, index: number) => (
    { length: rowHeight(galleryRows[index]), offset: rowOffsets[index] ?? 0, index }
  ), [galleryRows, rowOffsets]);

  const handleDelete = useCallback((item: TripMedia & { tripId: string }) => {
    const isOwner = item.uploaderId && (item.uploaderId === deviceId || item.uploaderId === firebaseAuth().currentUser?.uid);
    if (!isOwner) {
      Alert.alert("Can't delete", "You can only remove photos you uploaded.");
      return;
    }
    Alert.alert("Delete photo?", `Remove "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          const trip = trips.find(t => t.id === item.tripId);
          if (!trip) return;
          const updated = { ...trip, media: (trip.media ?? []).filter(m => m.id !== item.id) };
          setViewerIndex(-1);
          setPendingMedia(prev => {
            const remaining = (prev[item.tripId] ?? []).filter(m => m.id !== item.id);
            if (!remaining.length) { const next = { ...prev }; delete next[item.tripId]; return next; }
            return { ...prev, [item.tripId]: remaining };
          });
          try {
            await updateTrip(updated);
          } catch {
            toast("Couldn't remove this photo. Please try again.");
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          toast("Removed");
        },
      },
    ]);
  }, [trips, updateTrip, toast, deviceId, setPendingMedia]);

  const renderGalleryRow = useCallback(({ item: row }: { item: GalleryRow }) => {
    if (row.type === "trip-header") {
      return (
        <View style={{ height: TRIP_HEADER_H, paddingHorizontal: S.md, paddingBottom: S.xs, justifyContent: "flex-end" }}>
          <Text style={{ fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.3 }} numberOfLines={1}>{row.name}</Text>
          <Text style={{ fontSize: T.sm, color: C.textTertiary, marginTop: 2 }} numberOfLines={1}>
            {row.dateRange}, {row.count} photo{row.count !== 1 ? "s" : ""}
          </Text>
        </View>
      );
    }

    if (row.type === "day-header") {
      return (
        <View style={{ height: DAY_HEADER_H, paddingHorizontal: S.md, paddingBottom: S.xs, flexDirection: "row", alignItems: "flex-end", gap: S.xs }}>
          <Text style={{ fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary }} numberOfLines={1}>{row.label}</Text>
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
            size={GRID_ITEM_SIZE}
            onPress={(origin) => { setViewerOrigin(origin); setViewerIndex(allItemsIndex.get(m.id) ?? -1); }}
            onDelete={() => handleDelete({ ...m, tripId: row.tripId })}
            C={C}
          />
        ))}
      </View>
    );
  }, [C, allItemsIndex, handleDelete]);

  const handleUploadToTrip = useCallback((tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    setPickerOpen(false);
    pickMedia((rawItems) => {
      // Stamp uploader name onto each item
      const items = rawItems.map(m => ({ ...m, uploadedBy: prefs.name || "Traveller", uploaderId: deviceId || "" }));

      // 1. Show immediately using component-local state (subscription can't touch this)
      setPendingMedia(prev => ({ ...prev, [tripId]: [...(prev[tripId] ?? []), ...items] }));
      setUploadProgress({ done: 0, total: items.length });

      // 2. Upload to cloud, then write directly to Firestore
      uploadTripMedia(items, tripId, (done, total) => {
        setUploadProgress({ done, total });
      })
        .then(async (uploaded) => {
          // Fetch latest trip from Firestore to avoid overwriting media from other uploads
          const freshTrip = await fetchTripById(tripId) ?? trip;
          const existingMedia = freshTrip.media ?? [];
          // Deduplicate by id in case of retry
          const existingIds = new Set(existingMedia.map(m => m.id));
          const newMedia = uploaded.filter(m => !existingIds.has(m.id) && m.url.startsWith("https://"));
          const finalMedia = [...existingMedia, ...newMedia];
          const finalTrip = { ...freshTrip, media: finalMedia };

          // Write to Firestore FIRST — only clear pending once confirmed
          try {
            await changeTripMedia(tripId, newMedia);
            // Firestore confirmed! Update local state only (no double-write)
            updateTripLocal(finalTrip);
            const itemIds = new Set(items.map(m => m.id));
            setPendingMedia(prev => {
              const remaining = (prev[tripId] ?? []).filter(m => !itemIds.has(m.id));
              if (!remaining.length) {
                const next = { ...prev };
                delete next[tripId];
                return next;
              }
              return { ...prev, [tripId]: remaining };
            });
            toast(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded`);

            // Notify other trip members
            const uploaderName = prefs.name || "Someone";
            const count = newMedia.length;
            const dest = trip.destination || trip.name;
            notifyTripMembers(tripId, dest, uploaderName, count, deviceId).catch(() => {});
          } catch (err) {
            console.warn("[Media] Firestore write failed:", err);
            // Keep pending items — they'll persist via AsyncStorage
            updateTripLocal(finalTrip);
            toast("Photos saved. Syncing shortly");
          }
        })
        .catch((err) => {
          console.warn("[Media] Upload failed:", err);
          const msg = err?.message ?? "";
          toast(msg.includes("too large") ? msg : "Couldn't upload. Try again later");
        })
        .finally(() => {
          setUploadProgress(null);
        });
    });
  }, [trips, updateTripLocal, setPendingMedia, toast]);

  const handleUploadNew = useCallback(() => {
    if (trips.length === 0) {
      Alert.alert("No trips", "Join a trip first before uploading memories.");
      return;
    }
    if (trips.length === 1) {
      handleUploadToTrip(trips[0].id);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      const options = [...trips.map(t => t.destination || t.name), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: "Upload to trip" },
        (idx) => { if (idx < trips.length) handleUploadToTrip(trips[idx].id); },
      );
    } else {
      setPickerOpen(true);
    }
  }, [trips, handleUploadToTrip]);

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
              onPress={(e: any) => {
                const idx = e.nativeEvent.index as number;
                Haptics.selectionAsync();
                setTripFilter(idx === 0 ? "all" : trips[idx - 1]?.id ?? "all");
              }}
            >
              <View style={styles.tripMenuBtn} accessibilityRole="button" accessibilityLabel={`Trip: ${tripMenuLabel}`}>
                <Text style={styles.tripMenuText} numberOfLines={1}>{tripMenuLabel}</Text>
                <CaretDown size={12} color={C.textSecondary} weight="bold" />
              </View>
            </ContextMenu>
          )}
          <View style={{ flex: 1 }} />
          <SegmentedControl
            values={mediaChips.map(chip => chip.label)}
            selectedIndex={Math.max(0, mediaChips.findIndex(chip => chip.id === mediaFilter))}
            onChange={(e) => { Haptics.selectionAsync(); setMediaFilter(mediaChips[e.nativeEvent.selectedSegmentIndex].id); }}
            style={{ width: 210 }}
            appearance={isDark ? "dark" : "light"}
          />
        </View>
      )}

      {/* ── Upload progress ── */}
      {uploadProgress && (
        <View style={styles.progressCard}>
          <View style={styles.progressHead}>
            <Text style={styles.progressText}>Uploading {Math.min(uploadProgress.done + 1, uploadProgress.total)} of {uploadProgress.total}</Text>
            <Text style={styles.progressPct}>{Math.round((uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100)}%` as any }]} />
          </View>
        </View>
      )}

      {/* ── Empty states ── */}
      {trips.length === 0 ? null : filteredTrips.length === 0 && mediaFilter !== "all" && tripsWithMedia.length > 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            compact
            icon={mediaFilter === "video"
              ? <VideoCamera size={48} color={C.textTertiary} weight="light" />
              : <ImageSquare size={48} color={C.textTertiary} weight="light" />}
            title={mediaFilter === "video" ? "No videos yet" : "No photos yet"}
            message={`Nothing ${mediaFilter === "video" ? "filmed" : "photographed"} on this trip so far.`}
            cta={{ label: "Show all photos and videos", onPress: () => { Haptics.selectionAsync(); setMediaFilter("all"); } }}
          />
        </View>
      ) : (tripsWithMedia.length === 0 || filteredTrips.length === 0) && emptyTrip ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            compact
            icon={<Camera size={48} color={C.textTertiary} weight="light" />}
            title={`No photos from ${emptyTrip.destination || emptyTrip.name} yet`}
            message="Anything you or the group add shows up here for everyone, newest first."
            cta={{ label: "Add photos", onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); } }}
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
  ), [C, mediaChips, tripMenuLabel, trips, filteredTrips.length, mediaFilter, resolvedTripFilter, styles, tripsWithMedia.length, emptyTrip, uploadProgress, router, handleUploadNew]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollViewMarker style={{ flex: 1 }} scrollEdgeEffects={{ top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" }}>
      <Animated.FlatList
        data={galleryRows}
        renderItem={renderGalleryRow}
        keyExtractor={r => r.key}
        getItemLayout={getItemLayout}
        ListHeaderComponent={
          <View>
            {trips.length === 0 ? (
              <NoTripsPage screen="gallery" ready={ready} offline={offline} onRetry={onRefresh} retrying={refreshing} />
            ) : (
            <ScreenTitle
              right={trips.length > 0 ? (
                <IconCircleButton
                  variant="glass" size={36}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
                  accessibilityLabel="Upload photos"
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

      <TripPickerSheet
        visible={pickerOpen}
        trips={trips}
        onPick={handleUploadToTrip}
        onClose={() => setPickerOpen(false)}
        C={C}
      />

      <MediaViewer
        items={allItems}
        initialIndex={viewerIndex}
        visible={viewerIndex >= 0}
        origin={viewerOrigin}
        onClose={() => setViewerIndex(-1)}
        onDelete={(item) => { setViewerIndex(-1); handleDelete(item); }}
        canDelete={(item) => !!item.uploaderId && (item.uploaderId === deviceId || item.uploaderId === firebaseAuth().currentUser?.uid)}
        hearted={hearted}
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
      flexDirection: "row", alignItems: "center", gap: S["2xs"],
      maxWidth: 180, paddingVertical: 5, paddingRight: S.xs,
    },
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
