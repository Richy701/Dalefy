import { Illustration } from "@/components/Illustration";
import {
  View, Text, ScrollView, Image, StyleSheet,
  Pressable, Alert, Platform, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useMemo } from "react";
import { Images, Play, Plus, Upload, Camera } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import { Logo } from "@/components/Logo";
import * as ImagePicker from "expo-image-picker";
import type { TripMedia } from "@/shared/types";

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
      type: a.type === "video" ? "video" : "image",
      name: a.fileName ?? `media-${i + 1}`,
      url: a.uri,
      size: a.fileSize ?? 0,
      uploadedAt: new Date().toISOString(),
    }));
    onPicked(items);
  }
}

export default function MediaScreen() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, updateTrip } = useTrips();

  const { photos, videos, totalItems } = useMemo(() => {
    const all = trips.flatMap(t => t.media ?? []);
    return {
      photos:     all.filter(m => m.type === "image").length,
      videos:     all.filter(m => m.type === "video").length,
      totalItems: all.length,
    };
  }, [trips]);

  const tripsWithMedia = trips.filter(t => (t.media?.length ?? 0) > 0);
  const [tripFilter, setTripFilter] = useState("all");
  const filteredTrips = useMemo(() =>
    tripFilter === "all" ? tripsWithMedia : tripsWithMedia.filter(t => t.id === tripFilter),
    [tripsWithMedia, tripFilter]);

  const handleUploadToTrip = (tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    pickMedia(items => updateTrip({ ...trip, media: [...(trip.media ?? []), ...items] }));
  };

  const handleUploadNew = () => {
    if (trips.length === 0) {
      Alert.alert("No trips", "Add a trip first before uploading memories.");
      return;
    }
    Alert.alert(
      "Upload to trip",
      "Which trip are these memories from?",
      trips.slice(0, 5).map(t => ({
        text: t.name,
        onPress: () => handleUploadToTrip(t.id),
      })).concat([{ text: "Cancel", style: "cancel" } as any]),
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.brandRow}>
              <Logo size={11} color={C.teal} />
              <Text style={[styles.brandName, { marginBottom: 0 }]}>DAF Adventures</Text>
            </View>
            <Text style={styles.pageTitle}>Gallery</Text>
            {totalItems > 0 && (
              <Text style={styles.pageSub}>
                {photos} {photos === 1 ? "photo" : "photos"} · {videos} {videos === 1 ? "video" : "videos"}
              </Text>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [styles.uploadBtn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadNew(); }}
          >
            <Plus size={15} color={C.bg} strokeWidth={2.5} />
            <Text style={styles.uploadBtnText}>Upload</Text>
          </Pressable>
        </View>

        {/* ── Trip filter ── */}
        {tripsWithMedia.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {[{ id: "all", name: "All Trips" }, ...tripsWithMedia.map(t => ({ id: t.id, name: t.destination || t.name }))].map(item => {
              const active = tripFilter === item.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setTripFilter(item.id)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {tripsWithMedia.length === 0 ? (
          /* ── Empty state ── */
          <View style={styles.emptyWrap}>
            <Illustration name="together" width={260} height={160} />
            <Text style={styles.emptyTitle}>Your memories begin here</Text>
            <Text style={styles.emptyText}>
              Capture photos and videos from every trip — they'll land here, organised by where you've been.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyUploadBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleUploadNew}
            >
              <Upload size={15} color={C.teal} strokeWidth={2} />
              <Text style={styles.emptyUploadText}>Upload your first memory</Text>
            </Pressable>
          </View>
        ) : (
          filteredTrips.map(trip => (
            <View key={trip.id} style={styles.tripSection}>
              {/* Trip header */}
              <View style={styles.tripSectionHeader}>
                <Image source={{ uri: trip.image }} style={styles.tripThumb} />
                <View style={styles.tripSectionInfo}>
                  {trip.destination && (
                    <Text style={styles.tripDest}>{trip.destination.toUpperCase()}</Text>
                  )}
                  <Text style={styles.tripSectionName} numberOfLines={1}>{trip.name}</Text>
                  <Text style={styles.tripSectionCount}>
                    {trip.media?.length} {trip.media?.length === 1 ? "item" : "items"}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.addToTripBtn, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => handleUploadToTrip(trip.id)}
                >
                  <Camera size={13} color={C.teal} strokeWidth={2} />
                  <Text style={styles.addToTripText}>Add</Text>
                </Pressable>
              </View>

              {/* Photo grid */}
              <View style={styles.grid}>
                {trip.media?.slice(0, 9).map((m, i) => (
                  <Pressable
                    key={m.id}
                    style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => Haptics.selectionAsync()}
                  >
                    {m.type === "image" ? (
                      <Image source={{ uri: m.url }} style={styles.gridImage} />
                    ) : (
                      <View style={[styles.gridImage, styles.videoThumb]}>
                        <View style={styles.playBtn}>
                          <Play size={14} color="#fff" strokeWidth={2} fill="#fff" />
                        </View>
                      </View>
                    )}
                    {i === 8 && (trip.media?.length ?? 0) > 9 && (
                      <View style={styles.moreOverlay}>
                        <Text style={styles.moreText}>+{(trip.media?.length ?? 0) - 9}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },

    header: {
      flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
      paddingHorizontal: S.md,
      paddingTop: Platform.OS === "android" ? S.md : S.xs,
      paddingBottom: S.sm,
    },
    headerLeft: { flex: 1 },
    brandName: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 2,
    },
    brandRow: {
      flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2,
    },
    pageTitle: {
      fontSize: T["3xl"] + 2, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5, marginBottom: 2,
    },
    pageSub: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, lineHeight: 20 },
    uploadBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: C.teal, borderRadius: R.full,
      paddingHorizontal: S.sm, paddingVertical: 9, marginBottom: 2,
    },
    uploadBtnText: { fontSize: T.sm, fontWeight: T.black, color: C.bg, letterSpacing: 0.3 },

    // Filters
    filterRow: { paddingHorizontal: S.md, gap: S.xs, marginBottom: S.md },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.full,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    filterChipActive: { backgroundColor: C.teal, borderColor: C.teal },
    filterText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary,
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    filterTextActive: { color: "#000" },

    // Empty state
    emptyWrap: {
      alignItems: "center", paddingTop: 80, paddingBottom: S.xl,
      paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyIconRing: {
      width: 72, height: 72, borderRadius: R.full,
      backgroundColor: C.tealDim, borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.tealMid, alignItems: "center", justifyContent: "center",
      marginBottom: S.sm,
    },
    emptyTitle: {
      fontSize: T["2xl"], fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5, textAlign: "center",
    },
    emptyText: {
      fontSize: T.base, color: C.textTertiary,
      textAlign: "center", lineHeight: 24, maxWidth: 280,
    },
    emptyUploadBtn: {
      flexDirection: "row", alignItems: "center", gap: 8, marginTop: S.sm,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
      borderRadius: R.full, paddingHorizontal: S.md, paddingVertical: 10,
      backgroundColor: C.tealDim,
    },
    emptyUploadText: { fontSize: T.base, fontWeight: T.semibold, color: C.teal },

    // Trip sections
    tripSection: { marginBottom: S.xl, paddingHorizontal: S.md },
    tripSectionHeader: {
      flexDirection: "row", alignItems: "center",
      gap: S.xs, marginBottom: S.xs,
    },
    tripThumb: { width: 42, height: 42, borderRadius: R.md },
    tripSectionInfo: { flex: 1 },
    tripDest: {
      fontSize: T.xs, fontWeight: T.black, color: C.teal,
      letterSpacing: 1.2, marginBottom: 1,
    },
    tripSectionName: { fontSize: T.base, fontWeight: T.bold, color: C.textPrimary },
    tripSectionCount: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },
    addToTripBtn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: C.tealDim,
    },
    addToTripText: { fontSize: T.xs, fontWeight: T.bold, color: C.teal },

    // Grid
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
    gridItem: {
      width: "32.5%", aspectRatio: 1,
      borderRadius: R.sm, overflow: "hidden", backgroundColor: C.card,
    },
    gridImage: { width: "100%", height: "100%" },
    videoThumb: { backgroundColor: `${C.teal}18`, alignItems: "center", justifyContent: "center" },
    playBtn: {
      width: 32, height: 32, borderRadius: R.full,
      backgroundColor: "#00000060", alignItems: "center", justifyContent: "center",
    },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#00000075", alignItems: "center", justifyContent: "center",
    },
    moreText: { fontSize: T.lg, fontWeight: T.black, color: "#fff" },
  });
}
