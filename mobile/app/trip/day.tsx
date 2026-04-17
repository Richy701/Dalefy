import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Plane, Hotel, Compass, Utensils,
} from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, type ThemeColors, eventColor } from "@/constants/theme";
import { EventCard, ConfRow, DocsRow } from "@/components/EventCard";
import { useMemo, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function timeToMinutes(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Plane, hotel: Hotel, activity: Compass, dining: Utensils,
};

export default function DayDetailScreen() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const trip = trips.find(t => t.id === tripId);
  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found</Text>
          <Pressable onPress={safeBack} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const dayEvents = trip.events
    .filter(ev => ev.date === date)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  const allDates = [...new Set(trip.events.map(e => e.date))].sort();
  const dayIndex = allDates.indexOf(date!) + 1;

  const d = new Date(date + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  // Event type breakdown for stat chips
  const typeCounts: Record<string, number> = {};
  for (const ev of dayEvents) {
    typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={safeBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={16} color={C.textSecondary} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>Day {dayIndex} · {weekday}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{trip.name}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Type breakdown strip */}
        <View style={styles.typeStrip}>
          {Object.entries(typeCounts).map(([type, count]) => {
            const color = eventColor(type, C);
            const Icon = TYPE_ICONS[type] ?? Compass;
            return (
              <View key={type} style={styles.typeChip}>
                <Icon size={11} color={color} strokeWidth={2} />
                <Text style={[styles.typeChipText, { color }]}>
                  {count} {type}{count > 1 ? "s" : ""}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Events — full width cards */}
        <View style={styles.eventsSection}>
          {dayEvents.map((ev) => (
            <View key={ev.id} style={styles.eventWrap}>
              <EventCard ev={ev} C={C} />
              {ev.confNumber && <ConfRow confNumber={ev.confNumber} C={C} />}
              {ev.documents && ev.documents.length > 0 && (
                <DocsRow documents={ev.documents} C={C} />
              )}
            </View>
          ))}

          {dayEvents.length === 0 && (
            <View style={styles.emptyWrap}>
              <Compass size={24} color={C.textDim} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No Events</Text>
              <Text style={styles.emptyText}>Nothing scheduled for this day</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 60 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: S.sm,
      paddingBottom: S.sm,
    },
    backBtn: {
      width: 40, height: 40,
      alignItems: "center", justifyContent: "center",
    },
    headerCenter: {
      flex: 1, alignItems: "center",
    },
    headerTitle: {
      fontSize: T.base,
      fontWeight: T.semibold,
      color: C.textPrimary,
    },
    headerSub: {
      fontSize: T.xs,
      fontWeight: T.medium,
      color: C.textTertiary,
      marginTop: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
      marginBottom: S.sm,
    },

    // Type breakdown strip
    typeStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: S.md,
      marginBottom: S.md,
    },
    typeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: R.full,
      backgroundColor: C.elevated,
    },
    typeChipText: {
      fontSize: 10,
      fontWeight: T.semibold,
      letterSpacing: 0.2,
    },

    // Events — full width
    eventsSection: {
      paddingHorizontal: S.md,
      gap: S.xs,
    },
    eventWrap: {
      marginBottom: 2,
    },

    // Empty state
    emptyWrap: {
      padding: S["2xl"],
      alignItems: "center",
      gap: S.xs,
    },
    emptyTitle: {
      fontSize: T.md,
      fontWeight: T.bold,
      color: C.textSecondary,
      marginTop: S.xs,
    },
    emptyText: {
      fontSize: T.sm,
      color: C.textTertiary,
      fontWeight: T.medium,
    },
  });
}
