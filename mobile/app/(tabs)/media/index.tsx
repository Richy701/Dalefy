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
  Play, Plus, Camera, X, Trash,
  VideoCamera, CaretRight, CaretDown, User,
} from "phosphor-react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
  interpolate, Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoTripsPage } from "@/components/ui/JoinTripNote";
import { DragHandle } from "@/components/ui/DragHandle";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import * as Haptics from "expo-haptics";
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
const GRID_GAP = 6;
const GRID_COLS = 3;
const GRID_ITEM_SIZE = (SCREEN_W - S.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CONTENT_W = SCREEN_W - S.md * 2;
const HERO_ROW_H = Math.floor(GRID_ITEM_SIZE * 1.6);
const COL2_WIDE = Math.floor((CONTENT_W - GRID_GAP) * 0.62);
const COL2_NARROW = CONTENT_W - COL2_WIDE - GRID_GAP;
const DUO_H = Math.floor(GRID_ITEM_SIZE * 1.35);
const FEATURE_H = Math.floor(CONTENT_W * 0.5);

type GridLayout = "hero" | "trio" | "duo" | "duo-r" | "feature";
type GalleryRow =
  | { type: "trip-header"; key: string; name: string; dateRange: string; count: number }
  | { type: "grid-row"; key: string; tripId: string; items: TripMedia[]; layout: GridLayout; isLast: boolean; remaining: number; startIndex: number };

const LAYOUT_CYCLE: GridLayout[] = ["hero", "trio", "duo", "trio", "duo-r", "trio", "feature", "trio"];

function buildGalleryRows(
  filteredTrips: Array<{ id: string; name: string; destination?: string; start: string; end: string; media?: TripMedia[] }>,
): GalleryRow[] {
  const rows: GalleryRow[] = [];
  for (const trip of filteredTrips) {
    const media = trip.media ?? [];
    const maxVisible = 20;
    const visible = media.slice(0, maxVisible);
    const remaining = media.length - maxVisible;
    if (visible.length === 0) continue;

    const dateRange = `${parseTripDate(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${parseTripDate(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    rows.push({ type: "trip-header", key: `h-${trip.id}`, name: trip.destination || trip.name, dateRange, count: media.length });

    let cursor = 0;
    let layoutIdx = 0;
    let rowIdx = 0;
    while (cursor < visible.length) {
      const left = visible.length - cursor;
      const pattern = LAYOUT_CYCLE[layoutIdx % LAYOUT_CYCLE.length];
      layoutIdx++;
      let layout: GridLayout;
      let take: number;

      if (pattern === "hero" && left >= 2) { layout = "hero"; take = 2; }
      else if (pattern === "trio" && left >= 3) { layout = "trio"; take = 3; }
      else if ((pattern === "duo" || pattern === "duo-r") && left >= 2) { layout = pattern; take = 2; }
      else if (pattern === "feature" && left >= 1) { layout = "feature"; take = 1; }
      else if (left >= 3) { layout = "trio"; take = 3; }
      else if (left >= 2) { layout = "duo"; take = 2; }
      else { layout = "feature"; take = 1; }

      const rowItems = visible.slice(cursor, cursor + take);
      const isLastRow = cursor + take >= visible.length;
      rows.push({
        type: "grid-row",
        key: `r-${trip.id}-${rowIdx}`,
        tripId: trip.id,
        items: rowItems,
        layout,
        isLast: isLastRow,
        remaining: isLastRow ? remaining : 0,
        startIndex: cursor,
      });
      cursor += take;
      rowIdx++;
    }
  }
  return rows;
}

function rowHeight(row: GalleryRow): number {
  if (row.type === "trip-header") return 60;
  switch (row.layout) {
    case "hero": return HERO_ROW_H + GRID_GAP;
    case "trio": return GRID_ITEM_SIZE + GRID_GAP;
    case "duo": case "duo-r": return DUO_H + GRID_GAP;
    case "feature": return FEATURE_H + GRID_GAP;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDateCompact(iso: string) {
  const d = new Date(iso);
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
  });
  if (!result.canceled) {
    const items: TripMedia[] = result.assets.map((a, i) => ({
      id: `upload-${Date.now()}-${i}`,
      type: (a.type === "video" ? "video" : "image") as "image" | "video",
      name: a.fileName ?? `media-${i + 1}`,
      url: a.uri,
      size: a.fileSize ?? 0,
      uploadedAt: new Date().toISOString(),
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
              <CaretRight size={16} color={C.textTertiary} weight="light" />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Zoomable Image ──────────────────────────────────────────────────────────

function ZoomableImage({ uri, width, height, onTap }: {
  uri: string; width: number; height: number; onTap: () => void;
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
        <ExpoImage source={{ uri }} style={{ width, height }} contentFit="contain" cachePolicy="memory-disk" />
      </Animated.View>
    </GestureDetector>
  );
}

// ── Fullscreen Viewer ────────────────────────────────────────────────────────

function MediaViewer({ items, initialIndex, visible, onClose, onDelete, C }: {
  items: (TripMedia & { tripId: string; tripName: string })[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  onDelete: (item: TripMedia & { tripId: string; tripName: string }) => void;
  C: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const dismissY = useSharedValue(0);
  const bgOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible && initialIndex >= 0) {
      setActiveIndex(initialIndex);
      setChromeVisible(true);
      dismissY.value = 0;
      bgOpacity.value = 1;
      setTimeout(() => flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false }), 50);
    }
  }, [visible, initialIndex]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const swipeToDismiss = Gesture.Pan()
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
        bgOpacity.value = withTiming(0, { duration: 200 });
        dismissY.value = withTiming(
          e.translationY > 0 ? SCREEN_H : -SCREEN_H,
          { duration: 200 },
          () => runOnJS(handleDismiss)(),
        );
      } else {
        dismissY.value = withSpring(0, { damping: 20, stiffness: 200 });
        bgOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      }
    });

  const dismissStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismissY.value },
      { scale: interpolate(Math.abs(dismissY.value), [0, 400], [1, 0.85], Extrapolation.CLAMP) },
    ],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${bgOpacity.value})`,
  }));

  const chromeOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(chromeVisible ? 1 : 0, { duration: 200 }),
    pointerEvents: chromeVisible ? "auto" as const : "none" as const,
  }));

  if (!visible || items.length === 0) return null;
  const current = items[activeIndex] ?? items[0];

  const toggleChrome = () => setChromeVisible(v => !v);

  const renderItem = ({ item }: { item: TripMedia & { tripName: string } }) => (
    <View style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: "center", alignItems: "center" }}>
      {item.type === "image" ? (
        <ZoomableImage uri={item.url} width={SCREEN_W} height={SCREEN_H} onTap={toggleChrome} />
      ) : (
        <Pressable onPress={toggleChrome} accessibilityRole="button" accessibilityLabel="Play video" style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
          <Play size={28} color="#fff" weight="fill" />
        </Pressable>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, bgStyle]}>
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
                getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                  setActiveIndex(idx);
                }}
              />
            </Animated.View>
          </GestureDetector>

          {/* Top chrome */}
          <Animated.View style={[{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          }, chromeOpacity]}>
            <LinearGradient
              colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.3)", "transparent"]}
              style={{ paddingTop: insets.top + 8, paddingHorizontal: S.md, paddingBottom: 32 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose(); }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}
                >
                  <X size={18} color="#fff" weight="bold" />
                </Pressable>

                <View style={{
                  backgroundColor: "rgba(255,255,255,0.12)", borderRadius: R.full,
                  paddingHorizontal: 12, paddingVertical: 6,
                }}>
                  <Text style={{ fontSize: T.xs, fontWeight: T.bold, color: "#fff", letterSpacing: 0.5 }}>
                    {activeIndex + 1} <Text style={{ color: "rgba(255,255,255,0.4)" }}>/</Text> {items.length}
                  </Text>
                </View>

                <Pressable
                  onPress={() => onDelete(current)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Delete photo"
                  style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.redDim, alignItems: "center", justifyContent: "center" }}
                >
                  <Trash size={16} color={C.red} weight="bold" />
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Bottom chrome */}
          <Animated.View style={[{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
          }, chromeOpacity]}>
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.8)"]}
              style={{ paddingBottom: insets.bottom + S.md, paddingHorizontal: S.md, paddingTop: 48 }}
            >
              {current.uploadedBy && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: "rgba(255,255,255,0.12)",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <User size={12} color="rgba(255,255,255,0.7)" weight="bold" />
                  </View>
                  <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.6)", fontWeight: T.medium }}>
                    {current.uploadedBy}
                  </Text>
                </View>
              )}

              <Text style={{ fontSize: T.lg, fontWeight: T.bold, color: "#fff", marginBottom: 4, letterSpacing: -0.3 }} numberOfLines={1}>
                {current.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: T.xs, fontWeight: T.bold, color: C.teal, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  {current.tripName}
                </Text>
                {current.size > 0 && (
                  <>
                    <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" }} />
                    <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", fontWeight: T.medium }}>{formatSize(current.size)}</Text>
                  </>
                )}
                {current.uploadedAt && (
                  <>
                    <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" }} />
                    <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", fontWeight: T.medium }}>{formatDate(current.uploadedAt)}</Text>
                  </>
                )}
              </View>

              {/* Scroll indicator */}
              {items.length > 1 && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 14 }}>
                  {items.length <= 20 ? (
                    items.map((_, i) => (
                      <View key={i} style={{
                        width: i === activeIndex ? 18 : 5, height: 5,
                        borderRadius: 2.5,
                        backgroundColor: i === activeIndex ? C.teal : "rgba(255,255,255,0.25)",
                      }} />
                    ))
                  ) : (
                    <View style={{
                      width: 120, height: 3, borderRadius: 1.5,
                      backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden",
                    }}>
                      <View style={{
                        width: Math.max(20, 120 / items.length),
                        height: 3, borderRadius: 1.5,
                        backgroundColor: C.teal,
                        marginLeft: (120 - Math.max(20, 120 / items.length)) * (activeIndex / (items.length - 1)),
                      }} />
                    </View>
                  )}
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── Media Grid Item ──────────────────────────────────────────────────────────

const GridItem = React.memo(function GridItem({ item, width, height, isLast, remaining, onPress, onDelete, C }: {
  item: TripMedia;
  width: number;
  height: number;
  isLast: boolean;
  remaining: number;
  onPress: () => void;
  onDelete: () => void;
  C: ThemeColors;
  index?: number;
}) {
  const isLarge = width > GRID_ITEM_SIZE + 1;
  return (
    <ContextMenu
      actions={[
        { title: "View", systemIcon: "eye" },
        { title: "Share", systemIcon: "square.and.arrow.up" },
        { title: "Delete", systemIcon: "trash", destructive: true },
      ]}
      onPress={(e: any) => {
        if (e.nativeEvent.index === 0) onPress();
        else if (e.nativeEvent.index === 1) Share.share({ url: item.url });
        else if (e.nativeEvent.index === 2) onDelete();
      }}
    >
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      style={({ pressed }) => ({
        width,
        height,
        borderRadius: R.lg,
        overflow: "hidden",
        backgroundColor: C.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {item.type === "image" ? (
        <CachedImage uri={item.url} style={{ width: "100%", height: "100%" }} />
      ) : (
        <View style={{ width: "100%", height: "100%", backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center" }}>
          <View style={{
            width: isLarge ? 44 : 30, height: isLarge ? 44 : 30, borderRadius: R.full,
            backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
          }}>
            <Play size={isLarge ? 18 : 13} color="#fff" weight="fill" />
          </View>
        </View>
      )}

      {!(isLast && remaining > 0) && (item.uploadedBy || item.uploadedAt || item.type === "video") && (
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            paddingHorizontal: isLarge ? 8 : 6, paddingBottom: isLarge ? 7 : 5, paddingTop: isLarge ? 24 : 16,
            borderBottomLeftRadius: R.lg, borderBottomRightRadius: R.lg,
          }}
        >
          {item.uploadedBy && (
            <Text style={{
              fontSize: isLarge ? T.sm : T.xs, fontWeight: T.bold, color: "#fff",
              letterSpacing: 0.1, marginBottom: 1,
            }} numberOfLines={1}>
              {item.uploadedBy.split(" ")[0]}
            </Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            {item.type === "video" && <VideoCamera size={isLarge ? 10 : 8} color="rgba(255,255,255,0.7)" weight="fill" />}
            {item.uploadedAt && (
              <Text style={{
                fontSize: isLarge ? T.xs : T["2xs"], color: "rgba(255,255,255,0.55)", fontWeight: T.medium,
              }} numberOfLines={1}>
                {formatDateCompact(item.uploadedAt)}
              </Text>
            )}
          </View>
        </LinearGradient>
      )}

      {isLast && remaining > 0 && (
        <View style={{
          ...StyleSheet.absoluteFill,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{
            fontSize: isLarge ? T["2xl"] : T.lg, fontWeight: T.bold,
            color: "#fff", letterSpacing: -0.5,
          }}>+{remaining}</Text>
        </View>
      )}
    </Pressable>
    </ContextMenu>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.width === next.width &&
  prev.height === next.height &&
  prev.isLast === next.isLast &&
  prev.remaining === next.remaining &&
  prev.C === next.C
);

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function MediaScreen() {
  const { C } = useTheme();
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

  const allItems = useMemo(() =>
    mergedTrips.flatMap(t => (t.media ?? []).map(m => ({ ...m, tripId: t.id, tripName: t.destination || t.name }))),
    [mergedTrips],
  );

  const allItemsIndex = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((m, i) => map.set(m.id, i));
    return map;
  }, [allItems]);

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
  const router = useRouter();
  const emptyTrip = useMemo(() => {
    if (resolvedTripFilter !== "all") return trips.find(t => t.id === resolvedTripFilter) ?? null;
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.find(t => parseTripDate(t.end) >= new Date()) ?? sorted[sorted.length - 1] ?? null;
  }, [trips, resolvedTripFilter]);

  const getItemLayout = useCallback((_: any, index: number) => {
    let offset = 0;
    for (let i = 0; i < index; i++) offset += rowHeight(galleryRows[i]);
    return { length: rowHeight(galleryRows[index]), offset, index };
  }, [galleryRows]);

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
        <View style={{ height: 60, paddingHorizontal: S.md, paddingBottom: S.sm2, justifyContent: "flex-end" }}>
          <Text style={{ fontSize: T["2xl"], fontWeight: "700", color: C.textPrimary, letterSpacing: -0.3 }} numberOfLines={1}>{row.name}</Text>
          <Text style={{ fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary, marginTop: 4 }}>
            {row.dateRange}{"  ·  "}{row.count} photo{row.count !== 1 ? "s" : ""}
          </Text>
        </View>
      );
    }

    const makeItem = (m: TripMedia, w: number, h: number, isLastItem: boolean, idx: number) => (
      <GridItem
        key={m.id}
        item={m}
        width={w}
        height={h}
        isLast={isLastItem && row.remaining > 0}
        remaining={isLastItem ? row.remaining : 0}
        onPress={() => setViewerIndex(allItemsIndex.get(m.id) ?? -1)}
        onDelete={() => handleDelete({ ...m, tripId: row.tripId })}
        C={C}
        index={idx}
      />
    );
    const isLastItem = (i: number) => row.isLast && i === row.items.length - 1;

    if (row.layout === "hero") {
      return (
        <View style={{ flexDirection: "row", gap: GRID_GAP, paddingHorizontal: S.md, marginBottom: GRID_GAP }}>
          {makeItem(row.items[0], COL2_WIDE, HERO_ROW_H, isLastItem(0), row.startIndex)}
          {makeItem(row.items[1], COL2_NARROW, HERO_ROW_H, isLastItem(1), row.startIndex + 1)}
        </View>
      );
    }
    if (row.layout === "trio") {
      return (
        <View style={{ flexDirection: "row", gap: GRID_GAP, paddingHorizontal: S.md, marginBottom: GRID_GAP }}>
          {row.items.map((m, i) => makeItem(m, GRID_ITEM_SIZE, GRID_ITEM_SIZE, isLastItem(i), row.startIndex + i))}
        </View>
      );
    }
    if (row.layout === "duo") {
      return (
        <View style={{ flexDirection: "row", gap: GRID_GAP, paddingHorizontal: S.md, marginBottom: GRID_GAP }}>
          {makeItem(row.items[0], COL2_WIDE, DUO_H, isLastItem(0), row.startIndex)}
          {makeItem(row.items[1], COL2_NARROW, DUO_H, isLastItem(1), row.startIndex + 1)}
        </View>
      );
    }
    if (row.layout === "duo-r") {
      return (
        <View style={{ flexDirection: "row", gap: GRID_GAP, paddingHorizontal: S.md, marginBottom: GRID_GAP }}>
          {makeItem(row.items[0], COL2_NARROW, DUO_H, isLastItem(0), row.startIndex)}
          {makeItem(row.items[1], COL2_WIDE, DUO_H, isLastItem(1), row.startIndex + 1)}
        </View>
      );
    }
    return (
      <View style={{ paddingHorizontal: S.md, marginBottom: GRID_GAP }}>
        {makeItem(row.items[0], CONTENT_W, FEATURE_H, isLastItem(0), row.startIndex)}
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
          {mediaChips.map(chip => (
            <Pressable
              key={chip.id}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              accessibilityState={{ selected: mediaFilter === chip.id }}
              hitSlop={{ top: 12, bottom: 12 }}
              onPress={() => { Haptics.selectionAsync(); setMediaFilter(chip.id); }}
            >
              <Pill label={chip.label} tone={mediaFilter === chip.id ? "accent" : "neutral"} />
            </Pressable>
          ))}
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
            title={mediaFilter === "video" ? "No videos yet" : "No photos yet"}
            message={`Nothing ${mediaFilter === "video" ? "filmed" : "photographed"} on this trip so far.`}
            cta={{ label: "Show everything", onPress: () => { Haptics.selectionAsync(); setMediaFilter("all"); } }}
          />
        </View>
      ) : (tripsWithMedia.length === 0 || filteredTrips.length === 0) && emptyTrip ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            compact
            icon={<Camera size={26} color={C.tealText} weight="regular" />}
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
                <Pressable
                  style={({ pressed }) => [styles.headerUploadBtn, { opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Upload photos"
                  hitSlop={5}
                >
                  <Plus size={16} color={C.onAccent} weight="bold" />
                </Pressable>
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
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={7}
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
        onClose={() => setViewerIndex(-1)}
        onDelete={(item) => { setViewerIndex(-1); handleDelete(item); }}
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
