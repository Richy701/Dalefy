import { Illustration } from "@/components/Illustration";
import {
  View, Text, ScrollView, Image, StyleSheet, Dimensions,
  Pressable, Alert, Platform, RefreshControl, Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo, useCallback, useRef } from "react";
import {
  Images, Play, Plus, Upload, Camera, X, Trash2,
  Image as LucideImage, Film, MapPin, ChevronRight, Aperture,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ScalePress } from "@/components/ScalePress";
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import * as ImagePicker from "expo-image-picker";
import { File as ExpoFile } from "expo-file-system/next";
import type { TripMedia, Trip } from "@/shared/types";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_GAP = 3;
const GRID_COLS = 3;
const GRID_ITEM_SIZE = (SCREEN_W - S.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

// ── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
    const items: TripMedia[] = await Promise.all(
      result.assets.map(async (a, i) => {
        let url = a.uri;
        try {
          const file = new ExpoFile(a.uri);
          const buffer = await file.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const mimeType = a.type === "video"
            ? "video/mp4"
            : a.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
          url = `data:${mimeType};base64,${base64}`;
        } catch {
          // Fall back to local URI
        }
        return {
          id: `upload-${Date.now()}-${i}`,
          type: (a.type === "video" ? "video" : "image") as "image" | "video",
          name: a.fileName ?? `media-${i + 1}`,
          url,
          size: a.fileSize ?? 0,
          uploadedAt: new Date().toISOString(),
        };
      }),
    );
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
              <Image source={{ uri: t.image }} style={{
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

function MediaViewer({ item, tripName, visible, onClose, onDelete, C }: {
  item: (TripMedia & { tripName: string }) | null;
  tripName: string;
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  C: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  if (!item) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {/* Image */}
        {item.type === "image" ? (
          <Image
            source={{ uri: item.url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Play size={28} color="#fff" strokeWidth={2} fill="#fff" />
            </View>
          </View>
        )}

        {/* Top bar */}
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + S.xs, paddingHorizontal: S.md, paddingBottom: S.xl }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.15)",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={18} color="#fff" strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: "rgba(239,68,68,0.3)",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Trash2 size={16} color="#ef4444" strokeWidth={2} />
            </Pressable>
          </View>
        </LinearGradient>

        {/* Bottom info */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            paddingBottom: insets.bottom + S.md, paddingHorizontal: S.md, paddingTop: S.xl,
          }}
        >
          <Text style={{
            fontSize: T.base, fontWeight: T.bold, color: "#fff",
            marginBottom: 4,
          }} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Text style={{
              fontSize: T.xs, fontWeight: T.bold, color: C.teal,
              letterSpacing: 0.8, textTransform: "uppercase",
            }}>{tripName}</Text>
            {item.size > 0 && (
              <>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.4)" }}>·</Text>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", fontWeight: T.medium }}>{formatSize(item.size)}</Text>
              </>
            )}
            {item.uploadedAt && (
              <>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.4)" }}>·</Text>
                <Text style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", fontWeight: T.medium }}>{formatDate(item.uploadedAt)}</Text>
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ── Media Grid Item ──────────────────────────────────────────────────────────

function GridItem({ item, index, isLast, remaining, onPress, C }: {
  item: TripMedia;
  index: number;
  isLast: boolean;
  remaining: number;
  onPress: () => void;
  C: ThemeColors;
}) {
  // First item in section = hero (spans 2 cols, 2 rows)
  const isHero = index === 0;
  const size = isHero
    ? GRID_ITEM_SIZE * 2 + GRID_GAP
    : GRID_ITEM_SIZE;

  return (
    <ScalePress
      activeScale={0.96}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        width: size,
        height: size,
        borderRadius: isHero ? R.xl : R.md,
        overflow: "hidden",
        backgroundColor: C.card,
      }}
    >
      {item.type === "image" ? (
        <Image source={{ uri: item.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
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

      {/* Type badge on hero */}
      {isHero && (
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
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function MediaScreen() {
  const { C, isDark } = useTheme();
  const { brand } = useBrand();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, updateTrip, reload } = useTrips();
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState("all");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<(TripMedia & { tripId: string; tripName: string }) | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  // Aggregated data
  const allItems = useMemo(() =>
    trips.flatMap(t => (t.media ?? []).map(m => ({ ...m, tripId: t.id, tripName: t.destination || t.name }))),
    [trips],
  );

  const photos = useMemo(() => allItems.filter(m => m.type === "image").length, [allItems]);
  const videos = useMemo(() => allItems.filter(m => m.type === "video").length, [allItems]);
  const tripsWithMedia = useMemo(() => trips.filter(t => (t.media?.length ?? 0) > 0), [trips]);

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
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    setPickerOpen(false);
    pickMedia(items => {
      updateTrip({ ...trip, media: [...(trip.media ?? []), ...items] });
      toast(`${items.length} file${items.length > 1 ? "s" : ""} added`);
    });
  }, [trips, updateTrip, toast]);

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
    setPickerOpen(true);
  }, [trips, handleUploadToTrip]);

  const handleDelete = useCallback((item: TripMedia & { tripId: string }) => {
    Alert.alert("Delete?", `Remove "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          const trip = trips.find(t => t.id === item.tripId);
          if (!trip) return;
          updateTrip({ ...trip, media: (trip.media ?? []).filter(m => m.id !== item.id) });
          setViewerItem(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          toast("Removed");
        },
      },
    ]);
  }, [trips, updateTrip, toast]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── Hero Banner ── */}
        {allItems.length > 0 ? (
          <View style={[styles.heroBanner, { paddingTop: insets.top + S.xs }]}>
            {heroTrip?.image && (
              <Image
                source={{ uri: heroTrip.image }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            )}
            <LinearGradient
              colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.85)"]}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Top row */}
            <View style={styles.heroTopRow}>
              <View style={styles.brandRow}>
                {brand.logoUrl ? (
                  <Image source={{ uri: brand.logoUrl }} style={{ width: 22, height: 22, borderRadius: 5 }} />
                ) : (
                  <Logo size={18} color={C.teal} />
                )}
                <Text style={styles.brandText}>{brand.name}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.uploadFab, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
              >
                <Aperture size={15} color="#000" strokeWidth={2.5} />
                <Text style={styles.uploadFabText}>Upload</Text>
              </Pressable>
            </View>

            {/* Hero content */}
            <View style={styles.heroContent}>
              {heroTrip?.destination && (
                <View style={styles.heroLocRow}>
                  <MapPin size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.heroLocText}>{heroTrip.destination.toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.heroTitle}>Gallery</Text>

              <View style={styles.statRow}>
                <StatPill icon={LucideImage} value={photos} label={photos === 1 ? "Photo" : "Photos"} C={C} />
                <StatPill icon={Film} value={videos} label={videos === 1 ? "Video" : "Videos"} C={C} />
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.emptyHeader, { paddingTop: insets.top + S.xs }]}>
            <View style={styles.heroTopRow}>
              <View style={styles.brandRow}>
                {brand.logoUrl ? (
                  <Image source={{ uri: brand.logoUrl }} style={{ width: 22, height: 22, borderRadius: 5 }} />
                ) : (
                  <Logo size={18} color={C.teal} />
                )}
                <Text style={[styles.brandText, { color: C.textPrimary }]}>{brand.name}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.uploadFab, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
              >
                <Aperture size={15} color="#000" strokeWidth={2.5} />
                <Text style={styles.uploadFabText}>Upload</Text>
              </Pressable>
            </View>
          </View>
        )}

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
            <View style={styles.typeToggle}>
              {([
                { key: "all" as const, label: "All", Icon: Images },
                { key: "image" as const, label: "Photos", Icon: LucideImage },
                { key: "video" as const, label: "Videos", Icon: Film },
              ]).map(({ key, label, Icon }) => {
                const active = mediaFilter === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.typeBtn, active && styles.typeBtnActive]}
                    onPress={() => { Haptics.selectionAsync(); setMediaFilter(key); }}
                  >
                    <Icon size={13} color={active ? "#000" : C.textTertiary} strokeWidth={2} />
                    <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Content ── */}
        {tripsWithMedia.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Illustration name="wavy" width={240} height={150} />
            <Text style={styles.emptyTitle}>Your memories begin here</Text>
            <Text style={styles.emptyText}>
              Capture photos and videos from every trip — they'll land here, organised by destination.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleUploadNew}
            >
              <Upload size={15} color={C.teal} strokeWidth={2} />
              <Text style={styles.emptyBtnText}>Upload your first memory</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.galleryWrap}>
            {filteredTrips.map(trip => {
              const media = trip.media ?? [];
              const maxVisible = 7; // hero (1) + 6 small
              const visible = media.slice(0, maxVisible);
              const remaining = media.length - maxVisible;

              return (
                <View key={trip.id} style={styles.tripSection}>
                  {/* Trip section header */}
                  <View style={styles.tripHeader}>
                    <Image source={{ uri: trip.image }} style={styles.tripThumb} />
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

                  {/* Masonry-ish grid: hero + small items */}
                  <View style={styles.masonryWrap}>
                    {/* Hero item (left) */}
                    {visible[0] && (
                      <GridItem
                        item={visible[0]}
                        index={0}
                        isLast={visible.length === 1 && remaining > 0}
                        remaining={visible.length === 1 ? remaining : 0}
                        onPress={() => setViewerItem({ ...visible[0], tripId: trip.id, tripName: trip.destination || trip.name })}
                        C={C}
                      />
                    )}
                    {/* Right column (stacked small items) */}
                    {visible.length > 1 && (
                      <View style={styles.masonryRight}>
                        {visible.slice(1).map((m, i) => (
                          <GridItem
                            key={m.id}
                            item={m}
                            index={i + 1}
                            isLast={i === visible.length - 2 && remaining > 0}
                            remaining={i === visible.length - 2 ? remaining : 0}
                            onPress={() => setViewerItem({ ...m, tripId: trip.id, tripName: trip.destination || trip.name })}
                            C={C}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                </View>
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
        item={viewerItem}
        tripName={viewerItem?.tripName ?? ""}
        visible={!!viewerItem}
        onClose={() => setViewerItem(null)}
        onDelete={() => viewerItem && handleDelete(viewerItem)}
        C={C}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },

    // ── Hero Banner ──
    heroBanner: {
      backgroundColor: "#0a0a0a",
      overflow: "hidden",
      borderBottomLeftRadius: R["2xl"],
      borderBottomRightRadius: R["2xl"],
      paddingHorizontal: S.md,
      paddingBottom: S.lg,
    },
    emptyHeader: {
      paddingHorizontal: S.md,
      paddingBottom: S.sm,
    },
    heroTopRow: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between",
      marginBottom: S.md,
    },
    brandRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    brandText: {
      fontSize: T.xs, fontWeight: T.bold, color: "#fff",
      letterSpacing: 1.5, textTransform: "uppercase",
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
    heroTitle: {
      fontSize: T["4xl"] + 4, fontFamily: F.black, fontWeight: T.black,
      color: "#fff", letterSpacing: -1, lineHeight: T["4xl"] + 6,
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
      alignItems: "center", paddingTop: 60, paddingBottom: S.xl,
      paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T["2xl"], fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: -0.3, textAlign: "center",
    },
    emptyText: {
      fontSize: T.base, color: C.textTertiary,
      textAlign: "center", lineHeight: 24, maxWidth: 280,
    },
    emptyBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      marginTop: S.sm, borderRadius: R.full,
      paddingHorizontal: S.md, paddingVertical: 10,
      backgroundColor: C.tealDim,
    },
    emptyBtnText: { fontSize: T.base, fontWeight: T.semibold, color: C.teal },

    // ── Gallery ──
    galleryWrap: {
      paddingTop: S.md, gap: S.xl,
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

    // ── Masonry Grid ──
    masonryWrap: {
      flexDirection: "row", gap: GRID_GAP,
    },
    masonryRight: {
      flex: 1, gap: GRID_GAP,
      flexDirection: "row", flexWrap: "wrap",
    },
  });
}
