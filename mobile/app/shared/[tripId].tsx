import { useEffect, useState, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Compass, MapPin, Users, Moon, Share2, Plus, Check,
} from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { EventCard, ConfRow } from "@/components/EventCard";
import { fetchTripById } from "@/services/supabaseTrips";
import type { Trip } from "@/shared/types";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

export default function SharedTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { C } = useTheme();
  const { trips, addTrip } = useTrips();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const alreadyInMyTrips = useMemo(
    () => (tripId ? trips.some((t) => t.id === tripId) : false),
    [tripId, trips]
  );

  const handleAddToMyTrips = () => {
    if (!trip || alreadyInMyTrips) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTrip(trip);
  };

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    fetchTripById(tripId)
      .then((t) => {
        if (t && t.status === "Published") setTrip(t);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found or not published</Text>
          <Pressable onPress={() => router.back()} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start = new Date(trip.start);
  const end = new Date(trip.end);

  const grouped = trip.events.reduce<Record<string, typeof trip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  const handleShare = async () => {
    const url = `dafadventures://shared/${trip.id}`;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { dialogTitle: trip.name });
      } else {
        await Clipboard.setStringAsync(url);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={["#00000008", "#00000040", "#000000e8"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <Pressable
            style={({ pressed }) => [
              styles.backCircle,
              { top: Platform.OS === "android" ? 20 : 56, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={18} color="#fff" strokeWidth={2} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.shareCircle,
              { top: Platform.OS === "android" ? 20 : 56, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleShare}
          >
            <Share2 size={16} color="#fff" strokeWidth={2} />
          </Pressable>

          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>SHARED TRIP</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>
            <View style={styles.chipsRow}>
              {trip.attendees ? (
                <View style={styles.chip}>
                  <Users size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.chipText}>{trip.attendees}</Text>
                </View>
              ) : null}
              <View style={styles.chip}>
                <Moon size={10} color={C.teal} strokeWidth={2} />
                <Text style={styles.chipText}>
                  {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" — "}
                  {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              {trip.destination ? (
                <View style={styles.chip}>
                  <MapPin size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.chipText}>{trip.destination}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Itinerary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Compass size={13} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.sectionEyebrow}>ITINERARY</Text>
          </View>

          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, events], dayIdx) => {
              const d = new Date(date + "T12:00:00");
              return (
                <View key={date} style={styles.dayGroup}>
                  <View style={styles.dayHeader}>
                    <View style={styles.dayNumBox}>
                      <Text style={styles.dayNum}>{dayIdx + 1}</Text>
                    </View>
                    <View style={styles.dayInfo}>
                      <Text style={styles.dayName}>
                        {d.toLocaleDateString("en-US", { weekday: "long" })}
                      </Text>
                      <Text style={styles.dayMonth}>
                        {d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                    <View style={styles.dayCountBadge}>
                      <Text style={styles.dayCountText}>{events.length}</Text>
                    </View>
                  </View>

                  {events.map(ev => (
                    <View key={ev.id} style={styles.eventWrap}>
                      <EventCard ev={ev} C={C} />
                      {ev.confNumber && <ConfRow confNumber={ev.confNumber} C={C} />}
                    </View>
                  ))}
                </View>
              );
            })}
        </View>

        <Pressable
          onPress={handleAddToMyTrips}
          disabled={alreadyInMyTrips}
          style={({ pressed }) => [
            styles.addCta,
            {
              backgroundColor: alreadyInMyTrips ? C.elevated : C.teal,
              opacity: pressed && !alreadyInMyTrips ? 0.85 : 1,
            },
          ]}
        >
          {alreadyInMyTrips
            ? <Check size={16} color={C.textSecondary} strokeWidth={2.5} />
            : <Plus size={16} color="#000" strokeWidth={2.5} />}
          <Text style={[
            styles.addCtaText,
            { color: alreadyInMyTrips ? C.textSecondary : "#000" },
          ]}>
            {alreadyInMyTrips ? "Saved to my trips" : "Add to my trips"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 60 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md, textAlign: "center", paddingHorizontal: S.xl },
    actionBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    actionBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

    addCta: {
      marginHorizontal: S.md, marginTop: S.sm,
      height: 52, borderRadius: R.xl,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    addCtaText: {
      fontSize: T.sm, fontWeight: T.black, letterSpacing: 1.2,
      textTransform: "uppercase",
    },

    hero: { height: 340, position: "relative" },
    backCircle: {
      position: "absolute", left: S.md,
      width: 40, height: 40, borderRadius: R.full,
      backgroundColor: "#00000055", alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
    },
    shareCircle: {
      position: "absolute", right: S.md,
      width: 40, height: 40, borderRadius: R.full,
      backgroundColor: "#00000055", alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
    },

    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingBottom: S.lg,
    },
    heroEyebrow: {
      fontSize: 9, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 6,
    },
    heroTitle: {
      fontSize: T["3xl"] + 4, fontFamily: F.black, fontWeight: T.black,
      color: "#ffffff", letterSpacing: -0.3, marginBottom: S.sm, lineHeight: 36,
      textTransform: "uppercase",
    },

    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    },
    chipText: {
      fontSize: 9, fontWeight: T.bold,
      color: "rgba(255,255,255,0.9)", letterSpacing: 0.5, textTransform: "uppercase",
    },

    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm,
    },
    sectionEyebrow: {
      fontSize: 10, fontWeight: T.black, color: C.textTertiary, letterSpacing: 1.5,
    },

    section: { paddingBottom: S.md },
    dayGroup: { marginBottom: S.xl, paddingHorizontal: S.md },
    dayHeader: {
      flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.sm,
      paddingBottom: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    dayNumBox: {
      width: 42, height: 42, borderRadius: R.md, backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    dayNum: { fontSize: T.xl, fontWeight: T.black, color: C.teal, letterSpacing: -0.2 },
    dayInfo: { flex: 1 },
    dayName: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.2 },
    dayMonth: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },
    dayCountBadge: {
      backgroundColor: C.elevated, borderRadius: R.sm,
      paddingHorizontal: S.xs, paddingVertical: 3,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    dayCountText: { fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary, letterSpacing: 0.5 },
    eventWrap: { marginBottom: S.xs },
  });
}
