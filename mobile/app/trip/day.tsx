import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  Plane, Hotel, Compass, Utensils, Calendar,
} from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, F, type ThemeColors, eventColor } from "@/constants/theme";
import { EventCard, DocsRow } from "@/components/EventCard";
import { useMemo, useCallback } from "react";

function timeToMinutes(t: string): number {
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m12 = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m12) return 720;
  let h = parseInt(m12[1]);
  const min = parseInt(m12[2]);
  const pm = m12[3].toUpperCase() === "PM";
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
  const { C, isDark } = useTheme();
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
  const dateFormatted = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Event type breakdown for stat chips
  const typeCounts: Record<string, number> = {};
  for (const ev of dayEvents) {
    typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{
        headerShown: true,
        title: `Day ${dayIndex}`,
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: true,
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: C.teal,
        headerTitleStyle: { color: C.teal, fontWeight: "700" },
        headerShadowVisible: false,
      }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} contentInsetAdjustmentBehavior="automatic">
        {/* Day title section */}
        <View style={styles.titleSection}>
          <Text style={styles.dayLabel}>DAY {dayIndex}</Text>
          <Text style={styles.dayTitle}>{weekday}</Text>
          <View style={styles.dateRow}>
            <Calendar size={12} color={C.textTertiary} strokeWidth={1.8} />
            <Text style={styles.dateText}>{dateFormatted}</Text>
          </View>
        </View>

        {/* Type breakdown pills */}
        {Object.keys(typeCounts).length > 0 && (
          <View style={styles.typeStrip}>
            {Object.entries(typeCounts).map(([type, count]) => {
              const color = eventColor(type, C);
              const Icon = TYPE_ICONS[type] ?? Compass;
              return (
                <View key={type} style={[styles.typeChip, { backgroundColor: `${color}15` }]}>
                  <Icon size={12} color={color} strokeWidth={2} />
                  <Text style={[styles.typeChipText, { color }]}>
                    {count} {type}{count > 1 ? "s" : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Events */}
        <View style={styles.eventsSection}>
          {dayEvents.map((ev) => (
            <View key={ev.id}>
              <EventCard ev={ev} C={C} />
              {ev.documents && ev.documents.length > 0 && (
                <DocsRow documents={ev.documents} C={C} />
              )}
            </View>
          ))}
        </View>

        {/* Empty state */}
        {dayEvents.length === 0 && (
          <View style={styles.emptyWrap}>
            <Compass size={28} color={C.textDim} strokeWidth={1.2} />
            <Text style={styles.emptyTitle}>No Events</Text>
            <Text style={styles.emptyText}>Nothing scheduled for this day yet.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },


    // Title section
    titleSection: {
      paddingHorizontal: S.lg,
      paddingBottom: S.lg,
    },
    dayLabel: {
      fontSize: T.xs,
      fontWeight: T.bold,
      color: C.teal,
      letterSpacing: 3,
      marginBottom: 4,
    },
    dayTitle: {
      fontSize: T["3xl"] + 4,
      fontFamily: F.black,
      fontWeight: T.black,
      color: C.textPrimary,
      letterSpacing: -0.8,
      lineHeight: 36,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
    },
    dateText: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: C.textTertiary,
    },

    // Type breakdown strip
    typeStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: S.lg,
      marginBottom: S.xl,
    },
    typeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: R.full,
    },
    typeChipText: {
      fontSize: T.xs,
      fontWeight: T.bold,
      letterSpacing: 0.3,
    },

    // Events
    eventsSection: {
      paddingHorizontal: S.md,
      gap: S.md,
    },

    // Empty state
    emptyWrap: {
      padding: S["2xl"],
      paddingTop: 80,
      alignItems: "center",
      gap: S.xs,
    },
    emptyTitle: {
      fontSize: T.lg,
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
