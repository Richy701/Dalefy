import {
  View, Text, ScrollView, Image, Pressable,
  StyleSheet, Platform, RefreshControl,
} from "react-native";
import { Illustration } from "@/components/Illustration";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowRight, Compass, MapPin, Moon, CalendarDays } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useMemo, useState, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import { EventCard, ConfRow } from "@/components/EventCard";
import type { Trip } from "@/shared/types";

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function isToday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  return (
    d.getDate()     === now.getDate()  &&
    d.getMonth()    === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function NoTrip() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.emptyState}>
        <Illustration name="sitting" width={260} height={160} />
        <Text style={styles.emptyTitle}>No itinerary yet</Text>
        <Text style={styles.emptyText}>Add a trip from the home screen with a code or QR, and your day-by-day plan shows up here.</Text>
      </View>
    </SafeAreaView>
  );
}

export default function ItineraryScreen() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips } = useTrips();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const activeTrip: Trip | undefined = useMemo(() => {
    const sorted = [...trips].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    if (active) return active;
    const upcoming = sorted.find(t => daysUntil(t.start) > 0);
    return upcoming ?? sorted[sorted.length - 1];
  }, [trips]);

  if (!activeTrip) return <NoTrip />;

  const start  = new Date(activeTrip.start);
  const end    = new Date(activeTrip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const days   = daysUntil(activeTrip.start);
  const isActive = days <= 0 && daysUntil(activeTrip.end) >= 0;
  const isPast   = daysUntil(activeTrip.end) < 0;

  const grouped = activeTrip.events.reduce<Record<string, typeof activeTrip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  const tripLabel = isPast ? "PREVIOUS TRIP" : isActive ? "CURRENT TRIP" : `IN ${days} DAYS`;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── Full-bleed hero ── */}
        <View style={styles.hero}>
          <Image source={{ uri: activeTrip.image }} style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={["#00000010", "#00000055", "#000000f0"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Top row */}
          <View style={[styles.heroTop, { paddingTop: Platform.OS === "android" ? S.md : 56 }]}>
            <View style={styles.tripLabel}>
              <Text style={[styles.tripLabelText, {
                color: isActive ? C.teal : isPast ? C.textTertiary : C.amber,
              }]}>{tripLabel}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              onPress={() => router.push(`/trip/${activeTrip.id}`)}
            >
              <ArrowRight size={18} color="#ffffffcc" strokeWidth={2} />
            </Pressable>
          </View>

          {/* Bottom content */}
          <View style={styles.heroContent}>
            {activeTrip.destination && (
              <View style={styles.destRow}>
                <MapPin size={9} color={C.teal} strokeWidth={2} />
                <Text style={styles.heroDest}>{activeTrip.destination.toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.heroTitle} numberOfLines={2}>{activeTrip.name}</Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Moon size={11} color="#ffffffaa" strokeWidth={1.8} />
                <Text style={styles.heroStatText}>{nights} nights</Text>
              </View>
              <View style={styles.heroDot} />
              <View style={styles.heroStat}>
                <Compass size={11} color="#ffffffaa" strokeWidth={1.8} />
                <Text style={styles.heroStatText}>{activeTrip.events.length} events</Text>
              </View>
              <View style={styles.heroDot} />
              <Text style={styles.heroStatText}>
                {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" – "}
                {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Day-by-day itinerary ── */}
        <View style={styles.body}>
          {(() => {
            const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
            return entries.map(([date, events], dayIdx) => {
              const d     = new Date(date + "T12:00:00");
              const today = isToday(date);
              const isLast = dayIdx === entries.length - 1;

              return (
                <View key={date} style={[styles.dayGroup, isLast && { marginBottom: 0 }]}>
                  {/* Day header */}
                  <View style={[styles.dayHeader, today && styles.dayHeaderToday]}>
                    <View style={[styles.dayNumBox, today && styles.dayNumBoxToday]}>
                      <Text style={[styles.dayNum, today && styles.dayNumToday]}>{dayIdx + 1}</Text>
                    </View>
                    <View style={styles.dayInfo}>
                      <View style={styles.dayTitleRow}>
                        <Text style={styles.dayName}>
                          {d.toLocaleDateString("en-US", { weekday: "long" })}
                        </Text>
                        {today && (
                          <View style={styles.todayChip}>
                            <Text style={styles.todayChipText}>TODAY</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.dayDate}>
                        {d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                    <View style={styles.dayCountBadge}>
                      <Text style={styles.dayCountText}>{events.length}</Text>
                    </View>
                  </View>

                  {/* Events */}
                  {events.map(ev => (
                    <View key={ev.id} style={styles.eventWrap}>
                      <EventCard ev={ev} C={C} />
                      {ev.confNumber && (
                        <ConfRow confNumber={ev.confNumber} C={C} />
                      )}
                    </View>
                  ))}
                </View>
              );
            });
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 72 },

    // Hero
    hero: { height: 280, position: "relative" },
    heroTop: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, position: "absolute", left: 0, right: 0, top: 0,
    },
    tripLabel: {
      flexDirection: "row", alignItems: "center",
    },
    tripLabelText: { fontSize: T.xs, fontWeight: T.black, letterSpacing: 1.5 },

    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: S.md, paddingBottom: S.lg,
    },
    destRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
    heroDest: { fontSize: T.xs, fontWeight: T.black, color: C.teal, letterSpacing: 1.8 },
    heroTitle: {
      fontSize: T["3xl"] - 2, fontFamily: F.black, fontWeight: T.black,
      color: "#ffffff", letterSpacing: -0.5, marginBottom: 6, lineHeight: 34,
    },
    heroStats: { flexDirection: "row", alignItems: "center", gap: 6 },
    heroStat: { flexDirection: "row", alignItems: "center", gap: 4 },
    heroStatText: { fontSize: T.sm, color: "#ffffffaa", fontWeight: T.medium },
    heroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#ffffff30" },

    body: { padding: S.md },

    // Day groups
    dayGroup: { marginBottom: S.xl },
    dayHeader: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      marginBottom: S.sm, paddingBottom: S.sm,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    dayHeaderToday: { borderBottomColor: `${C.teal}40` },
    dayNumBox: {
      width: 38, height: 38, borderRadius: R.md, backgroundColor: C.card,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    dayNumBoxToday: { backgroundColor: C.tealDim, borderColor: C.tealMid },
    dayNum: { fontSize: T.lg, fontWeight: T.black, color: C.textSecondary },
    dayNumToday: { color: C.teal },
    dayInfo: { flex: 1 },
    dayTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dayName: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary },
    dayDate: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },
    todayChip: {
      backgroundColor: C.tealDim, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 2,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    todayChipText: { fontSize: T.xs, fontWeight: T.black, color: C.teal, letterSpacing: 1.5 },
    dayCountBadge: {
      backgroundColor: C.elevated, borderRadius: R.sm,
      paddingHorizontal: 7, paddingVertical: 3,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    dayCountText: { fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary },

    // Event cards
    eventWrap: { marginBottom: S.xs },

    emptyState: {
      alignItems: "center", paddingTop: 80,
      paddingHorizontal: S.xl, paddingBottom: S.xl, gap: S.sm,
    },
    emptyTitle: { fontSize: T.xl, fontFamily: F.black, fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.5 },
    emptyText: {
      fontSize: T.base, color: C.textTertiary,
      textAlign: "center", lineHeight: 24, maxWidth: 280,
    },
    emptyBtn: {
      marginTop: S.xs, backgroundColor: C.teal,
      borderRadius: R.full, paddingHorizontal: S.lg, paddingVertical: 11,
    },
    emptyBtnText: {
      fontSize: T.sm, fontWeight: T.black,
      color: "#000", letterSpacing: 0.5, textTransform: "uppercase",
    },
  });
}
