import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { CheckCircle, Images } from "phosphor-react-native";
import BottomSheet from "@expo/ui/community/bottom-sheet";
import { GalleryAction, GalleryTripPicker, GalleryProgress } from "./GalleryNativeControls";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTrips } from "@/context/TripsContext";
import { T, R, S } from "@/constants/theme";
import { shareGalleryPhotos } from "@/services/galleryShare";
import { firebaseAuth, waitForAuth } from "@/services/firebase";
import { fetchTripById } from "@/services/firebaseTrips";
import * as Haptics from "@/services/haptics";
import type { Trip, TripMedia } from "@/shared/types";

const SHEET_SNAP_POINTS = ["60%", "92%"];

function takenAt(exif: Record<string, unknown> | null | undefined): { takenAt?: string } {
  const raw = exif?.DateTimeOriginal ?? (exif?.["{Exif}"] as Record<string, unknown> | undefined)?.DateTimeOriginal ?? exif?.DateTime;
  const match = typeof raw === "string" && raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  return match ? { takenAt: `${match[1]}-${match[2]}-${match[3]}T${match[4]}` } : {};
}

function PhotoPreview({ photo, index, width, single, uploading, onRemove }: {
  photo: TripMedia; index: number; width: number; single: boolean; uploading: boolean; onRemove?: () => void;
}) {
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return <View style={{ width }}>
    <View style={[styles.tile, { width, height: single ? Math.min(width * 0.75, 320) : width, backgroundColor: C.elevated }]}>
    <Image source={{ uri: photo.thumbUrl ?? photo.url }} style={{ width: "100%", height: "100%" }} contentFit="cover"
      onLoadStart={() => { setLoading(true); setFailed(false); }} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }}
      accessibilityLabel={`Selected photo ${index + 1}`} />
    {(loading || failed) && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 8 }]}>
      {failed ? <><Images size={28} color={C.textSecondary} /><Text style={{ color: C.textSecondary, fontSize: T.xs }}>Preview unavailable</Text></> : <ActivityIndicator color={C.tealText} />}
    </View>}
    {uploading && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color="#fff" size="large" /></View>}
    </View>
    {onRemove && <GalleryAction label="Remove" onPress={onRemove} />}
  </View>;
}

/** Kept mounted while sharing; retries preserve selection and already-uploaded bytes. */
export function GalleryUploadSheet({ trips, initialTripId, onClose, onShared }: {
  trips: Trip[];
  initialTripId?: string;
  onClose: () => void;
  onShared: (tripId: string, count: number) => void;
}) {
  const { C } = useTheme();
  const { prefs } = usePreferences();
  const { updateTripLocal } = useTrips();
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const [uploadFraction, setUploadFraction] = useState(0);
  const [tripId, setTripId] = useState(initialTripId ?? trips[0]?.id ?? "");
  const sheetRef = useRef<BottomSheet>(null);
  const [photos, setPhotos] = useState<TripMedia[]>([]);
  const [phase, setPhase] = useState<"review" | "uploading" | "saving" | "failed" | "done">("review");
  const [done, setDone] = useState(0);
  const [shared, setShared] = useState<TripMedia[]>([]);
  const [picking, setPicking] = useState(false);
  const busyRef = useRef(false);
  const trip = trips.find(t => t.id === tripId);
  const busy = phase === "uploading" || phase === "saving";
  const title = phase === "done" ? `${shared.length === 1 ? "Photo" : "Photos"} shared` : phase === "failed" ? "Some photos weren’t shared" : busy ? "Sharing Photos" : photos.length ? "Selected Photos" : "Choose Photos";
  const label = (count: number) => `${count} photo${count === 1 ? "" : "s"}`;
  const dismiss = () => sheetRef.current?.close();
  const close = () => {
    if (busyRef.current || picking) return;
    if (photos.length && phase !== "done") {
      Alert.alert("Leave without sharing?", "Your photos will stay in your phone’s library.", [
        { text: "Keep choosing", style: "cancel" }, { text: "Leave", style: "destructive", onPress: dismiss },
      ]);
    } else dismiss();
  };
  const choosePhotos = async () => {
    if (picking || busyRef.current) return;
    setPicking(true);
    try {
      // The system picker grants access to selected photos; full library access isn't required.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsMultipleSelection: true, orderedSelection: true,
        selectionLimit: 20 - photos.length, quality: 0.85, exif: true,
      });
      if (!result.canceled) {
        const stamp = Date.now();
        setPhotos(previous => [...previous, ...result.assets.map((asset, index): TripMedia => ({
          id: `upload-${stamp}-${index}`, type: "image", name: asset.fileName ?? `Photo ${index + 1}`,
          url: asset.uri, size: asset.fileSize ?? 0, uploadedAt: new Date().toISOString(), ...takenAt(asset.exif),
        }))].slice(0, 20));
        setPhase("review");
        sheetRef.current?.expand();
      }
    } catch {
      Alert.alert("Couldn’t open your photos", "Try again, or check photo access in Settings.", [
        { text: "OK" }, { text: "Open Settings", onPress: () => { void Linking.openSettings(); } },
      ]);
    } finally { setPicking(false); }
  };
  const share = async () => {
    if (!trip || !photos.length || busyRef.current) return;
    busyRef.current = true;
    setPhase("uploading"); setDone(0); setUploadFraction(0);
    try {
      await waitForAuth();
      const uid = firebaseAuth().currentUser?.uid;
      if (!uid) throw new Error("Sign-in unavailable");
      const batch = photos.map(photo => ({ ...photo, uploadedBy: prefs.name || "Traveller", uploaderId: uid }));
      const result = await shareGalleryPhotos(batch, trip.id, (completed, _total, saving, fraction) => {
        if (fraction !== undefined) setUploadFraction(fraction);
        setDone(completed); if (saving) setPhase("saving");
      });
      setPhotos(result.retry);
      setShared(previous => [...previous, ...result.saved]);
      if (result.saved.length) {
        onShared(trip.id, result.saved.length);
        // A refresh failure must never turn a confirmed share into an upload error.
        const savedIds = new Set(result.saved.map(photo => photo.id));
        updateTripLocal({ ...trip, media: [...(trip.media ?? []).filter(photo => !savedIds.has(photo.id)), ...result.saved] });
        void fetchTripById(trip.id).then(fresh => { if (fresh) updateTripLocal(fresh); }).catch(() => {});
      }
      setPhase(result.retry.length ? "failed" : "done");
      if (!result.retry.length) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { setPhase("failed"); }
    finally { busyRef.current = false; }
  };
  const displayPhotos = phase === "done" ? shared : photos;
  const availableWidth = gridWidth || Math.max(1, windowWidth - S.md * 2);
  const tileWidth = displayPhotos.length === 1 ? availableWidth : Math.floor((availableWidth - 12) / 3);
  const editable = !busy && phase !== "done";
  const tripLocked = shared.length > 0 || photos.some(photo => photo.url.startsWith("https://"));
  return (
    <BottomSheet ref={sheetRef} snapPoints={SHEET_SNAP_POINTS} enableDynamicSizing={false} enablePanDownToClose={!busy && !picking && (!photos.length || phase === "done")} onClose={onClose} backgroundStyle={{ backgroundColor: C.bg }}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: S.sm }}>
        <View style={styles.top}>
          <Text accessibilityRole="header" style={{ color: C.textPrimary, fontSize: T.lg, fontWeight: T.semibold }}>{busy ? "Sharing Photos" : phase === "done" ? "Photos shared" : "Share Photos"}</Text>
          <View style={{ width: 84 }}><GalleryAction label={phase === "done" ? "Done" : "Cancel"} onPress={close} disabled={busy || picking} /></View>
        </View>
        <ScrollView contentContainerStyle={{ padding: S.md, paddingTop: S.xs, gap: S.lg }}>
          <View accessibilityLiveRegion="polite">
            {phase === "done" && <CheckCircle size={38} color={C.tealText} weight="duotone" style={{ marginBottom: S.sm }} />}
            {phase === "failed" && <Text style={{ fontSize: T.xl, fontWeight: T.semibold, color: C.textPrimary }}>{title}</Text>}
            <Text style={{ marginTop: S.xs, fontSize: T.base, lineHeight: 23, color: C.textSecondary }}>
              {phase === "done" ? `${label(shared.length)} added to ${trip?.name}. Everyone on the trip can see ${shared.length === 1 ? "it" : "them"} now.`
                : phase === "failed" ? `${shared.length ? `${label(shared.length)} already shared. ` : ""}${label(photos.length)} still to share. Your selection is here, ready to retry.`
                : busy ? `Your photos are on their way to ${trip?.name}. Keep this screen open until they’re saved.` : photos.length ? "Review your photos below, then tap Share when you’re ready." : "Choose photos, review them, then share with your group."}
            </Text>
          </View>
          <View style={{ backgroundColor: C.card, borderRadius: R.md, padding: S.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              {trip?.image && <Image source={{ uri: trip.image }} contentFit="cover" style={{ width: 56, height: 56, borderRadius: R.sm }} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.textSecondary, fontSize: T.xs }}>SHARING TO</Text>
                <GalleryTripPicker value={tripId} options={trips} onChange={setTripId} disabled={!editable || tripLocked} />
              </View>
            </View>
          </View>
          {displayPhotos.length > 0 && <View>
            <View style={[styles.row, { marginBottom: S.sm }]}>
              <Text style={{ flex: 1, color: C.textPrimary, fontSize: T.base, fontWeight: T.semibold }}>{label(displayPhotos.length)}{phase === "done" ? " shared" : " selected"}</Text>
              {editable && photos.length < 20 && <View style={{ width: 100 }}><GalleryAction label="Add Photos" onPress={choosePhotos} disabled={picking} /></View>}
            </View>
            <View style={styles.grid} onLayout={event => setGridWidth(event.nativeEvent.layout.width)}>
              {displayPhotos.map((photo, index) => <PhotoPreview key={photo.id} photo={photo} index={index} width={tileWidth} single={displayPhotos.length === 1}
                uploading={phase === "uploading" && index === done}
                onRemove={editable ? () => setPhotos(current => current.filter(p => p.id !== photo.id)) : undefined} />)}
            </View>
          </View>}
        </ScrollView>
        <View style={{ paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.md, backgroundColor: C.bg, gap: S.sm }}>
          {busy ? <View accessibilityLiveRegion="polite" style={{ gap: S.sm }}>
            <View style={styles.row}><Text style={{ color: C.textPrimary, fontSize: T.base, fontWeight: T.semibold }}>{phase === "saving" ? "Adding photos to the album…" : `${uploadFraction === 0 ? "Preparing" : "Uploading"} photo ${Math.min(done + 1, photos.length)} of ${photos.length}`}</Text><View>{phase === "saving" ? null : <Text style={{ color: C.tealText, fontSize: T.base, fontWeight: T.semibold, fontVariant: ["tabular-nums"] }}>{Math.round(uploadFraction * 100)}%</Text>}</View></View>
            <GalleryProgress value={uploadFraction} saving={phase === "saving"} />
            <Text style={{ color: C.textSecondary, fontSize: T.sm }}>Keep this screen open while your photos are shared.</Text>
          </View> : <>
            <GalleryAction primary disabled={phase !== "done" && (!trip || picking)}
              onPress={phase === "done" ? dismiss : photos.length ? share : choosePhotos}
              label={phase === "done" ? "Done" : picking ? "Opening Photos…" : !photos.length ? "Choose Photos" : phase === "failed" ? `Retry ${label(photos.length)}` : `Share ${label(photos.length)}`} />
            {phase !== "done" && <Text style={{ textAlign: "center", color: C.textSecondary, fontSize: T.xs }}>{photos.length ? "Shared with everyone on this trip." : "You’ll review your photos before sharing."}</Text>}
          </>}
        </View>
      </View>
    </BottomSheet>
  );
}
const styles = StyleSheet.create({
  top: { paddingHorizontal: S.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  grid: { alignSelf: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: { borderRadius: R.md, overflow: "hidden" },
});
