import {
  View, Text, ScrollView, Image, StyleSheet,
  Pressable, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Images, Play, Plus, Upload, Camera } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S } from "@/constants/theme";
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

  const { photos, videos } = useMemo(() => {
    const all = trips.flatMap(t => t.media ?? []);
    return {
      photos: all.filter(m => m.type === "image").length,
      videos: all.filter(m => m.type === "video").length,
    };
  }, [trips]);

  const tripsWithMedia = trips.filter(t => (t.media?.length ?? 0) > 0);

  const handleUploadToTrip = (tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    pickMedia(items => {
      updateTrip({ ...trip, media: [...(trip.media ?? []), ...items] });
    });
  };

  const handleUploadNew = () => {
    // Show trip picker — upload to first available trip for simplicity
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

        {/* Header row */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.pageTitle}>Gallery</Text>
            <Text style={styles.countSummary}>
              {photos} {photos === 1 ? "photo" : "photos"} · {videos} {videos === 1 ? "video" : "videos"}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.uploadBtn, { opacity: pressed ? 0.75 : 1 }]}
            onPress={handleUploadNew}
          >
            <Plus size={16} color={C.bg} strokeWidth={2.5} />
            <Text style={styles.uploadBtnText}>Upload</Text>
          </Pressable>
        </View>

        {tripsWithMedia.length === 0 ? (
          /* ── Empty state ── */
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconRing}>
              <Images size={32} color={C.teal} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>No memories yet</Text>
            <Text style={styles.emptyText}>
              Upload photos and videos from your trips to build your travel gallery.
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
          tripsWithMedia.map(trip => (
            <View key={trip.id} style={styles.tripSection}>
              {/* Trip header */}
              <View style={styles.tripSectionHeader}>
                <Image source={{ uri: trip.image }} style={styles.tripThumb} />
                <View style={styles.tripSectionInfo}>
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
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: S.md, paddingBottom: S.lg },

    titleRow: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between",
      marginBottom: S.lg, paddingTop: S.sm,
    },
    pageTitle: { fontSize: 28, fontWeight: "900", color: C.textPrimary, letterSpacing: -0.5 },
    countSummary: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 2 },

    uploadBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: C.teal, borderRadius: R.full,
      paddingHorizontal: S.sm, paddingVertical: 8,
    },
    uploadBtnText: { fontSize: T.sm, fontWeight: T.bold, color: C.bg },

    // Empty state
    emptyWrap: {
      alignItems: "center", paddingTop: 60, paddingBottom: 40,
      paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyIconRing: {
      width: 72, height: 72, borderRadius: R.full,
      backgroundColor: C.tealDim, borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.tealMid, alignItems: "center", justifyContent: "center",
      marginBottom: S.sm,
    },
    emptyTitle: {
      fontSize: T["2xl"], fontWeight: T.black, color: C.textPrimary,
      letterSpacing: -0.5, textAlign: "center",
    },
    emptyText: {
      fontSize: T.base, color: C.textTertiary, textAlign: "center",
      lineHeight: 22, maxWidth: 260,
    },
    emptyUploadBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      marginTop: S.sm, borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.tealMid, borderRadius: R.full,
      paddingHorizontal: S.md, paddingVertical: 10,
      backgroundColor: C.tealDim,
    },
    emptyUploadText: { fontSize: T.base, fontWeight: T.semibold, color: C.teal },

    // Trip sections
    tripSection: { marginBottom: S.xl },
    tripSectionHeader: {
      flexDirection: "row", alignItems: "center",
      gap: S.xs, marginBottom: S.xs,
    },
    tripThumb: { width: 36, height: 36, borderRadius: R.sm },
    tripSectionInfo: { flex: 1 },
    tripSectionName: { fontSize: T.base, fontWeight: T.bold, color: C.textPrimary },
    tripSectionCount: { fontSize: T.xs, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },

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
      borderRadius: R.sm, overflow: "hidden",
      backgroundColor: C.card,
    },
    gridImage: { width: "100%", height: "100%" },
    videoThumb: {
      backgroundColor: `${C.teal}18`,
      alignItems: "center", justifyContent: "center",
    },
    playBtn: {
      width: 32, height: 32, borderRadius: R.full,
      backgroundColor: "#00000060", alignItems: "center", justifyContent: "center",
    },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#00000075",
      alignItems: "center", justifyContent: "center",
    },
    moreText: { fontSize: T.lg, fontWeight: T.black, color: "#fff" },
  });
}
