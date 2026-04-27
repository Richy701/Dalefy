import { Illustration } from "@/components/Illustration";
import { CachedImage } from "@/components/CachedImage";
import {
  View, Text, ScrollView, Image, StyleSheet, Dimensions, FlatList,
  Pressable, Alert, Platform, RefreshControl, Modal, Share, ActionSheetIOS,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Images, Play, Plus, Upload, Camera, X, Trash2,
  Image as LucideImage, Film, MapPin, ChevronRight, Aperture,
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadTripMedia } from "@/services/mediaUpload";
import { upsertTrip as upsertTripRemote, fetchTripById } from "@/services/firebaseTrips";
import type { TripMedia, Trip } from "@/shared/types";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_GAP = 3;
const GRID_COLS = 3;
const GRID_ITEM_SIZE = (SCREEN_W - S.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

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
    mediaTypes: ["images", "videos"],
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

// ── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ icon: Icon, value, label, C }: {
  icon: React.ComponentType<any>;
  value: number;
  label: string;
  C: ThemeColors;
}) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: `${C.teal}12`, borderRadius: R.full,
      paddingHorizontal: 12, paddingVertical: 7,
    }}>
      <Icon size={13} color={C.teal} strokeWidth={2} />
      <Text style={{
        fontSize: 18, fontWeight: T.bold, color: C.textPrimary,
        letterSpacing: -0.5,
      }}>{value}</Text>
      <Text style={{
        fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
        letterSpacing: 0.8, textTransform: "uppercase",
      }}>{label}</Text>
    </View>
  );
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
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
      </Pressable>
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        backgroundColor: C.card,
        borderTopLeftRadius: R["2xl"], borderTopRightRadius: R["2xl"],
        paddingBottom: insets.bottom + S.md,
        maxHeight: "70%",
      }}>
        <View style={{
          alignSelf: "center", width: 40, height: 4,
          borderRadius: 2, backgroundColor: C.border,
          marginTop: S.sm, marginBottom: S.md,
        }} />
        <Text style={{
          fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary,
          letterSpacing: -0.3, paddingHorizontal: S.md, marginBottom: S.sm,
        }}>Upload to Trip</Text>
        <Text style={{
          fontSize: T.sm, color: C.textTertiary, paddingHorizontal: S.md,
          marginBottom: S.md, lineHeight: 18,
        }}>Which trip are these memories from?</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {trips.map(t => (
            <Pressable
              key={t.id}
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
                  <Text style={{
                    fontSize: T.xs, fontWeight: T.bold, color: C.teal,
                    letterSpacing: 1, textTransform: "uppercase", marginBottom: 2,
                  }}>{t.destination}</Text>
                )}
                <Text style={{
                  fontSize: T.base, fontWeight: T.bold, color: C.textPrimary,
                }} numberOfLines={1}>{t.name}</Text>
                <Text style={{
                  fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium,
                  marginTop: 2,
                }}>{t.media?.length ?? 0} items</Text>
              </View>
              <ChevronRight size={16} color={C.textTertiary} strokeWidth={1.5} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
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
  const flatListRef = useRef<FlatList>(null);

  // Sync when opening on a new item
  useEffect(() => {
    if (visible && initialIndex >= 0) {
      setActiveIndex(initialIndex);
      setTimeout(() => flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false }), 50);
    }
  }, [visible, initialIndex]);

  if (!visible || items.length === 0) return null;
  const current = items[activeIndex] ?? items[0];

  const renderItem = ({ item }: { item: TripMedia & { tripName: string } }) => (
    <View style={{ width: SCREEN_W, height: "100%", justifyContent: "center", alignItems: "center" }}>
      {item.type === "image" ? (
        <Image source={{ uri: item.url }} style={{ width: SCREEN_W, height: "100%" }} resizeMode="contain" />
      ) : (
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
          <Play size={28} color="#fff" strokeWidth={2} fill="#fff" />
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
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

        {/* Top bar */}
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "transparent"]}
          pointerEvents="box-none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + S.xs, paddingHorizontal: S.md, paddingBottom: S.xl }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable
              onPress={onClose}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
            >
              <X size={18} color="#fff" strokeWidth={2} />
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: T.xs, fontWeight: T.bold, color: "rgba(255,255,255,0.6)" }}>
                {activeIndex + 1} / {items.length}
              </Text>
              <Pressable
                onPress={() => onDelete(current)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(239,68,68,0.3)", alignItems: "center", justifyContent: "center" }}
              >
                <Trash2 size={16} color="#ef4444" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {/* Bottom info */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          pointerEvents="none"
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: insets.bottom + S.md, paddingHorizontal: S.md, paddingTop: S.xl }}
        >
          <Text style={{ fontSize: T.base, fontWeight: T.bold, color: "#fff", marginBottom: 4 }} numberOfLines={1}>{current.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Text style={{ fontSize: T.xs, fontWeight: T.bold, color: C.teal, letterSpacing: 0.8, textTransform: "uppercase" }}>{current.tripName}</Text>
            {current.size > 0 && (
              <>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.4)" }}>·</Text>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", fontWeight: T.medium }}>{formatSize(current.size)}</Text>
              </>
            )}
            {current.uploadedAt && (
              <>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.4)" }}>·</Text>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", fontWeight: T.medium }}>{formatDate(current.uploadedAt)}</Text>
              </>
            )}
          </View>
        </LinearGradient>

        {/* Page dots */}
        {items.length > 1 && items.length <= 12 && (
          <View style={{ position: "absolute", bottom: insets.bottom + S.md + 60, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 4 }}>
            {items.map((_, i) => (
              <View key={i} style={{ width: i === activeIndex ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === activeIndex ? C.teal : "rgba(255,255,255,0.3)" }} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Media Grid Item ──────────────────────────────────────────────────────────

function GridItem({ item, index, isLast, remaining, onPress, onDelete, isSolo, C }: {
  item: TripMedia;
  index: number;
  isLast: boolean;
  remaining: number;
  onPress: () => void;
  onDelete: () => void;
  isSolo?: boolean;
  C: ThemeColors;
}) {
  const isHero = index === 0;
  const fullWidth = SCREEN_W - S.md * 2;
  const size = isHero || isSolo ? fullWidth : GRID_ITEM_SIZE;
  const height = isHero || isSolo ? fullWidth * 0.55 : GRID_ITEM_SIZE;

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
    <ScalePress
      activeScale={0.96}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        width: size,
        height,
        borderRadius: isHero || isSolo ? R.xl : R.md,
        overflow: "hidden",
        backgroundColor: C.card,
      }}
    >
      {item.type === "image" ? (
        <CachedImage uri={item.url} style={{ width: "100%", height: "100%" }} />
      ) : (
        <View style={{ width: "100%", height: "100%", backgroundColor: `${C.teal}12`, alignItems: "center", justifyContent: "center" }}>
          <View style={{
            width: isHero ? 52 : 32, height: isHero ? 52 : 32, borderRadius: R.full,
            backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
          }}>
            <Play size={isHero ? 20 : 14} color="#fff" strokeWidth={2} fill="#fff" />
          </View>
        </View>
      )}

      {/* Type badge on hero / solo */}
      {(isHero || isSolo) && (
        <View style={{
          position: "absolute", top: S.xs, left: S.xs,
          flexDirection: "row", alignItems: "center", gap: 4,
          backgroundColor: "rgba(0,0,0,0.5)", borderRadius: R.full,
          paddingHorizontal: 8, paddingVertical: 4,
        }}>
          {item.type === "image"
            ? <LucideImage size={10} color="#fff" strokeWidth={2} />
            : <Film size={10} color="#fff" strokeWidth={2} />}
          <Text style={{
            fontSize: 9, fontWeight: T.bold, color: "#fff",
            letterSpacing: 0.5, textTransform: "uppercase",
          }}>{item.type === "image" ? "Photo" : "Video"}</Text>
        </View>
      )}

      {/* +N overlay on last visible item */}
      {isLast && remaining > 0 && (
        <View style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(0,0,0,0.6)",
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{
            fontSize: isHero ? T["3xl"] : T.xl, fontWeight: T.bold,
            color: "#fff", letterSpacing: -0.5,
          }}>+{remaining}</Text>
        </View>
      )}
    </ScalePress>
    </ContextMenu>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function MediaScreen() {
  const { C, isDark } = useTheme();
  const { toast } = useToast();
  const { prefs } = usePreferences();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, updateTrip, updateTripLocal, reload } = useTrips();
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState("all");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(-1);

  const [uploading, setUploading] = useState(false);
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

  // Clean up pending items that have been uploaded or removed
  useEffect(() => {
    let changed = false;
    const cleaned: Record<string, TripMedia[]> = {};
    for (const [tripId, items] of Object.entries(pendingMedia)) {
      const trip = trips.find(t => t.id === tripId);
      const existingIds = new Set((trip?.media ?? []).map(m => m.id));
      // Keep only items not yet in Firestore and not already uploaded
      const remaining = items.filter(m =>
        !existingIds.has(m.id) && !m.url.includes("firebasestorage.googleapis.com")
      );
      if (remaining.length !== items.length) changed = true;
      if (remaining.length > 0) cleaned[tripId] = remaining;
    }
    if (changed) setPendingMedia(() => cleaned);
  }, [trips, pendingMedia, setPendingMedia]);

  // Merge context trips with pending uploads so local picks show instantly
  // Dedup: skip pending items already in context
  const mergedTrips = useMemo(() =>
    trips.map(t => {
      const pending = pendingMedia[t.id];
      if (!pending?.length) return t;
      const existingIds = new Set((t.media ?? []).map(m => m.id));
      const newItems = pending.filter(m => !existingIds.has(m.id));
      if (!newItems.length) return t;
      return { ...t, media: [...(t.media ?? []), ...newItems] };
    }),
    [trips, pendingMedia],
  );

  // Aggregated data
  const allItems = useMemo(() =>
    mergedTrips.flatMap(t => (t.media ?? []).map(m => ({ ...m, tripId: t.id, tripName: t.destination || t.name }))),
    [mergedTrips],
  );

  const photos = useMemo(() => allItems.filter(m => m.type === "image").length, [allItems]);
  const videos = useMemo(() => allItems.filter(m => m.type === "video").length, [allItems]);
  const tripsWithMedia = useMemo(() => mergedTrips.filter(t => (t.media?.length ?? 0) > 0), [mergedTrips]);

  const filteredTrips = useMemo(() => {
    let list = tripFilter === "all" ? tripsWithMedia : tripsWithMedia.filter(t => t.id === tripFilter);
    if (mediaFilter !== "all") {
      list = list
        .map(t => ({ ...t, media: t.media?.filter(m => m.type === mediaFilter) }))
        .filter(t => (t.media?.length ?? 0) > 0);
    }
    return list;
  }, [tripsWithMedia, tripFilter, mediaFilter]);

  // Hero banner trip (first trip with media, or the filtered one)
  const heroTrip = useMemo(() => {
    if (tripFilter !== "all") return trips.find(t => t.id === tripFilter) ?? null;
    return tripsWithMedia[0] ?? null;
  }, [tripFilter, tripsWithMedia, trips]);

  const handleUploadToTrip = useCallback((tripId: string) => {
    console.log("[Media] handleUploadToTrip called, tripId:", tripId);
    const trip = trips.find(t => t.id === tripId);
    if (!trip) { console.warn("[Media] trip not found!"); return; }
    setPickerOpen(false);
    pickMedia((rawItems) => {
      // Stamp uploader name onto each item
      const items = rawItems.map(m => ({ ...m, uploadedBy: prefs.name || "Traveler" }));

      // 1. Show immediately using component-local state (subscription can't touch this)
      setPendingMedia(prev => ({ ...prev, [tripId]: [...(prev[tripId] ?? []), ...items] }));
      setUploading(true);
      console.log("[Media] picked", items.length, "items, uploading to trip:", tripId);
      toast(`Uploading ${items.length} file${items.length > 1 ? "s" : ""}...`);

      // 2. Upload to cloud, then write directly to Firestore
      uploadTripMedia(items, tripId)
        .then(async (uploaded) => {
          // Fetch latest trip from Firestore to avoid overwriting media from other uploads
          const freshTrip = await fetchTripById(tripId) ?? trip;
          const existingMedia = freshTrip.media ?? [];
          // Deduplicate by id in case of retry
          const existingIds = new Set(existingMedia.map(m => m.id));
          const newMedia = uploaded.filter(m => !existingIds.has(m.id));
          const finalMedia = [...existingMedia, ...newMedia];
          const finalTrip = { ...freshTrip, media: finalMedia };

          // Write to Firestore FIRST — only clear pending once confirmed
          try {
            await upsertTripRemote(finalTrip);
            // Firestore confirmed! Update context and clear pending
            updateTrip(finalTrip);
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
          } catch (err) {
            console.warn("[Media] Firestore write failed:", err);
            // Keep pending items — they'll persist via AsyncStorage
            updateTrip(finalTrip); // optimistic at least
            toast("Photos saved — syncing shortly");
          }
        })
        .catch((err) => {
          console.warn("[Media] Upload failed:", err);
          toast("Couldn't upload — try again later");
        })
        .finally(() => {
          setUploading(false);
        });
    });
  }, [trips, updateTrip, setPendingMedia, toast]);

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
        { options, cancelButtonIndex: options.length - 1, title: "Upload to Trip" },
        (idx) => { if (idx < trips.length) handleUploadToTrip(trips[idx].id); },
      );
    } else {
      setPickerOpen(true);
    }
  }, [trips, handleUploadToTrip]);

  const handleDelete = useCallback((item: TripMedia & { tripId: string }) => {
    Alert.alert("Delete?", `Remove "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            // Fetch fresh trip to avoid stale closure
            const freshTrip = await fetchTripById(item.tripId);
            const trip = freshTrip ?? trips.find(t => t.id === item.tripId);
            if (!trip) return;
            const updated = { ...trip, media: (trip.media ?? []).filter(m => m.id !== item.id) };
            // Optimistic local update
            updateTripLocal(updated);
            setViewerIndex(-1);
            // Write to Firestore directly so we can catch failures
            await upsertTripRemote(updated);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toast("Removed");
          } catch (err: any) {
            const msg = err?.message || String(err);
            console.warn("[handleDelete] Firestore write failed:", msg);
            // Revert — reload from Firestore
            reload().catch(() => {});
            Alert.alert("Delete failed", msg);
          }
        },
      },
    ]);
  }, [trips, updateTripLocal, reload, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: C.card }}>
      {/* ── Sticky blur header ── */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)" }]} />
        )}
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Gallery</Text>
          {trips.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.headerUploadBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
            >
              <Plus size={16} color="#000" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 52 }]}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── Hero Banner ── */}
        {allItems.length > 0 ? (
          <View style={styles.heroBanner}>
            {heroTrip?.image && (
              <CachedImage uri={heroTrip.image} style={StyleSheet.absoluteFillObject} accessible={false} />
            )}
            <LinearGradient
              colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.85)"]}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Hero content */}
            <View style={styles.heroContent}>
              {heroTrip?.destination && (
                <View style={styles.heroLocRow}>
                  <MapPin size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.heroLocText}>{heroTrip.destination.toUpperCase()}</Text>
                </View>
              )}

              <View style={styles.statRow}>
                <StatPill icon={LucideImage} value={photos} label={photos === 1 ? "Photo" : "Photos"} C={C} />
                <StatPill icon={Film} value={videos} label={videos === 1 ? "Video" : "Videos"} C={C} />
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Filter Chips ── */}
        {(tripsWithMedia.length > 0) && (
          <View style={styles.filtersSection}>
            {/* Trip filter */}
            {tripsWithMedia.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {[{ id: "all", name: "All Trips" }, ...tripsWithMedia.map(t => ({
                  id: t.id, name: t.destination || t.name,
                }))].map(item => {
                  const active = tripFilter === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => { Haptics.selectionAsync(); setTripFilter(item.id); }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Media type toggle */}
            <SegmentedControl
              values={["All", "Photos", "Videos"]}
              selectedIndex={mediaFilter === "all" ? 0 : mediaFilter === "image" ? 1 : 2}
              onChange={(e) => {
                const idx = e.nativeEvent.selectedSegmentIndex;
                const val = (["all", "image", "video"] as const)[idx];
                Haptics.selectionAsync();
                setMediaFilter(val);
              }}
              style={{ marginHorizontal: S.md }}
              appearance={isDark ? "dark" : "light"}
            />
          </View>
        )}

        {/* ── Content ── */}
        {tripsWithMedia.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Illustration name="wavy" width={220} height={140} />
            <Text style={styles.emptyTitle}>Your memories{"\n"}begin here</Text>
            <Text style={styles.emptyText}>
              Photos and videos from your trips will appear here, organised by destination.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.uploadFab, { opacity: pressed ? 0.8 : 1, marginTop: S.sm }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
            >
              <Aperture size={15} color="#000" strokeWidth={2.5} />
              <Text style={styles.uploadFabText}>Upload</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.galleryWrap}>
            {filteredTrips.map((trip, tripIndex) => {
              const media = trip.media ?? [];
              const maxVisible = 7; // hero (1) + 6 small
              const visible = media.slice(0, maxVisible);
              const remaining = media.length - maxVisible;

              return (
                <FadeIn key={trip.id} delay={tripIndex * 120}>
                <View style={styles.tripSection}>
                  {/* Trip section header */}
                  <View style={styles.tripHeader}>
                    <CachedImage uri={trip.image} style={styles.tripThumb} />
                    <View style={styles.tripInfo}>
                      {trip.destination && (
                        <Text style={styles.tripDest}>{trip.destination.toUpperCase()}</Text>
                      )}
                      <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
                    </View>
                    <View style={styles.tripMeta}>
                      <Text style={styles.tripCount}>{media.length}</Text>
                      <Text style={styles.tripCountLabel}>items</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
                      onPress={() => handleUploadToTrip(trip.id)}
                    >
                      <Camera size={14} color={C.teal} strokeWidth={2} />
                    </Pressable>
                  </View>

                  {/* Hero image — full width */}
                  {visible[0] && (
                    <GridItem
                      item={visible[0]}
                      index={0}
                      isSolo={visible.length === 1}
                      isLast={visible.length === 1 && remaining > 0}
                      remaining={visible.length === 1 ? remaining : 0}
                      onPress={() => setViewerIndex(allItems.findIndex(a => a.id === visible[0].id))}
                      onDelete={() => handleDelete({ ...visible[0], tripId: trip.id })}
                      C={C}
                    />
                  )}
                  {/* Grid of remaining items — 3 columns */}
                  {visible.length > 1 && (
                    <View style={styles.gridWrap}>
                      {visible.slice(1).map((m, i) => (
                        <GridItem
                          key={m.id}
                          item={m}
                          index={i + 1}
                          isLast={i === visible.length - 2 && remaining > 0}
                          remaining={i === visible.length - 2 ? remaining : 0}
                          onPress={() => setViewerIndex(allItems.findIndex(a => a.id === m.id))}
                          onDelete={() => handleDelete({ ...m, tripId: trip.id })}
                          C={C}
                        />
                      ))}
                    </View>
                  )}
                </View>
                </FadeIn>
              );
            })}
          </View>
        )}

      </ScrollView>

      {/* Trip picker bottom sheet */}
      <TripPickerSheet
        visible={pickerOpen}
        trips={trips}
        onPick={handleUploadToTrip}
        onClose={() => setPickerOpen(false)}
        C={C}
      />

      {/* Full-screen viewer */}
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
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100, flexGrow: 1 },
    stickyHeader: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      overflow: "hidden",
    },
    headerRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, paddingVertical: 10,
    },
    screenTitle: {
      fontSize: 22, fontWeight: "700",
      color: C.textPrimary,
    },
    headerUploadBtn: {
      width: 32, height: 32, borderRadius: R.full,
      backgroundColor: C.teal,
      alignItems: "center", justifyContent: "center",
    },

    // ── Hero Banner ──
    heroBanner: {
      backgroundColor: "#0a0a0a",
      overflow: "hidden",
      borderBottomLeftRadius: R["2xl"],
      borderBottomRightRadius: R["2xl"],
      paddingHorizontal: S.md,
      paddingBottom: S.lg,
      justifyContent: "flex-end",
      minHeight: 200,
    },
    emptyHeader: {
      paddingHorizontal: S.md,
      paddingBottom: S.sm,
    },
    uploadFab: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: C.teal, borderRadius: R.full,
      paddingHorizontal: S.sm, paddingVertical: 8,
    },
    uploadFabText: {
      fontSize: T.sm, fontWeight: T.bold, color: "#000",
      letterSpacing: 0.3,
    },
    heroContent: {
      gap: S.xs,
    },
    heroLocRow: {
      flexDirection: "row", alignItems: "center", gap: 5,
    },
    heroLocText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 1.5,
    },
    statRow: {
      flexDirection: "row", gap: S.xs, marginTop: S.xs,
    },

    // ── Filters ──
    filtersSection: {
      paddingTop: S.md, gap: S.sm,
    },
    chipRow: {
      paddingHorizontal: S.md, gap: S.xs,
    },
    chip: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: R.full, backgroundColor: C.card,
    },
    chipActive: { backgroundColor: C.teal },
    chipText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary,
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    chipTextActive: { color: "#000" },
    typeToggle: {
      flexDirection: "row", marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R.lg,
      padding: 3, gap: 2,
    },
    typeBtn: {
      flex: 1, flexDirection: "row", alignItems: "center",
      justifyContent: "center", gap: 5,
      paddingVertical: 8, borderRadius: R.md,
    },
    typeBtnActive: { backgroundColor: C.teal },
    typeBtnText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 0.3, textTransform: "uppercase",
    },
    typeBtnTextActive: { color: "#000" },

    // ── Empty ──
    emptyWrap: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T["2xl"], fontWeight: "700", color: C.textPrimary,
      letterSpacing: -0.3, textAlign: "center",
    },
    emptyText: {
      fontSize: T.sm, color: C.textTertiary,
      textAlign: "center", lineHeight: 22, maxWidth: 260,
    },
    emptyBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      marginTop: S.xs, borderRadius: R.full,
      paddingHorizontal: S.lg, paddingVertical: 14,
      backgroundColor: C.teal,
    },
    emptyBtnText: { fontSize: T.base, fontWeight: T.bold, color: "#000" },

    // ── Gallery ──
    galleryWrap: {
      paddingTop: S.md, gap: S["2xl"],
    },

    // ── Trip Section ──
    tripSection: {
      paddingHorizontal: S.md,
    },
    tripHeader: {
      flexDirection: "row", alignItems: "center",
      gap: S.xs, marginBottom: S.sm,
    },
    tripThumb: {
      width: 44, height: 44, borderRadius: R.md,
    },
    tripInfo: { flex: 1 },
    tripDest: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 1.2, marginBottom: 2,
    },
    tripName: {
      fontSize: T.base, fontWeight: T.bold, color: C.textPrimary,
    },
    tripMeta: { alignItems: "center", marginRight: S.xs },
    tripCount: {
      fontSize: T.lg, fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: -0.3,
    },
    tripCountLabel: {
      fontSize: 9, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    addBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
    },

    // ── Photo Grid ──
    gridWrap: {
      flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP,
      marginTop: GRID_GAP,
    },
  });
}
