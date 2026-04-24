import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, Share,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { Illustration } from "@/components/Illustration";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  CalendarDays, MapPin, ChevronRight,
  Plane, Hotel, Compass, Utensils, Car,
} from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useMemo, useState, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import { ScalePress } from "@/components/ScalePress";
import * as Haptics from "expo-haptics";
import type { Trip, TravelEvent } from "@/shared/types";

const LOOKAHEAD_DAYS = 4; // today + 3

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function timeToMinutes(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (m[3]) {
    const pm = m[3].toUpperCase() === "PM";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return h * 60 + min;
}

const EVENT_ICON: Record<string, typeof Plane> = {
  flight: Plane,
  hotel: Hotel,
  dining: Utensils,
  activity: Compass,
  transfer: Car,
};

const EVENT_COLOR_KEY: Record<string, string> = {
  flight: "flight",
  hotel: "hotel",
  dining: "dining",
  activity: "activity",
  transfer: "transfer",
};

interface ScheduleEvent {
  event: TravelEvent;
  trip: Trip;
}

interface DayGroup {
  date: Date;
  label: string;
  sublabel: string;
  events: ScheduleEvent[];
}

function buildSchedule(trips: Trip[]): DayGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const days: DayGroup[] = [];

  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const label =
      i === 0 ? "Today" :
      i === 1 ? "Tomorrow" :
      d.toLocaleDateString("en-US", { weekday: "long" });

    const sublabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });

    const events: ScheduleEvent[] = [];
    for (const trip of trips) {
      // Only include active/upcoming trips
      const tripEnd = new Date(trip.end + "T23:59:59");
      if (tripEnd < today) continue;

      for (const ev of trip.events) {
        if (ev.date === dateStr) {
          events.push({ event: ev, trip });
        }
      }
    }

    // Sort by time
    events.sort((a, b) => timeToMinutes(a.event.time) - timeToMinutes(b.event.time));

    days.push({ date: d, label, sublabel, events });
  }

  return days;
}

function EventRow({ item, C, onPress }: {
  item: ScheduleEvent;
  C: ThemeColors;
  onPress: () => void;
}) {
  const { event: ev, trip } = item;
  const Icon = EVENT_ICON[ev.type] ?? Compass;
  const colorKey = EVENT_COLOR_KEY[ev.type] ?? "teal";
  const color = (C as Record<string, string>)[colorKey] ?? C.teal;

  return (
    <ScalePress
      style={[styles.eventRow, { backgroundColor: C.card }]}
      activeScale={0.98}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
    >
      {/* Time column */}
      <View style={styles.timeCol}>
        <Text style={[styles.timeText, { color: C.textPrimary }]}>
          {ev.time || "—"}
        </Text>
        {ev.endTime && (
          <Text style={[styles.endTimeText, { color: C.textTertiary }]}>{ev.endTime}</Text>
        )}
      </View>

      {/* Color bar */}
      <View style={[styles.colorBar, { backgroundColor: color }]} />

      {/* Content */}
      <View style={styles.eventContent}>
        <View style={styles.eventTop}>
          <View style={[styles.eventIconBox, { backgroundColor: `${color}18` }]}>
            <Icon size={13} color={color} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eventTitle, { color: C.textPrimary }]} numberOfLines={1}>
              {ev.title}
            </Text>
            {ev.location && (
              <View style={styles.locationRow}>
                <MapPin size={9} color={C.textTertiary} strokeWidth={1.5} />
                <Text style={[styles.locationText, { color: C.textTertiary }]} numberOfLines={1}>
                  {ev.location}
                </Text>
              </View>
            )}
          </View>
          <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
        </View>

        {/* Trip badge */}
        <View style={[styles.tripBadge, { backgroundColor: C.elevated }]}>
          <Text style={[styles.tripBadgeText, { color: C.textSecondary }]} numberOfLines={1}>
            {trip.destination || trip.name}
          </Text>
        </View>
      </View>
    </ScalePress>
  );
}

function EmptyDay({ C }: { C: ThemeColors }) {
  return (
    <View style={[styles.emptyDay, { backgroundColor: C.card }]}>
      <Text style={[styles.emptyDayText, { color: C.textTertiary }]}>Nothing planned</Text>
    </View>
  );
}

export default function ScheduleScreen() {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const { trips, ready, reload } = useTrips();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const schedule = useMemo(() => buildSchedule(trips), [trips]);
  const hasAnyEvents = schedule.some(d => d.events.length > 0);

  if (ready && trips.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
        <View style={styles.emptyState}>
          <Illustration name="sitting" width={260} height={160} />
          <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>No schedule yet</Text>
          <Text style={[styles.emptyText, { color: C.textTertiary }]}>
            Join a trip from the home screen and your upcoming events will appear here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + S.md }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Schedule</Text>
          <Text style={[styles.headerSub, { color: C.textSecondary }]}>
            {hasAnyEvents ? "Your next few days" : "No events coming up"}
          </Text>
        </View>

        {/* Day groups */}
        {schedule.map((day, i) => {
          const isToday = i === 0;
          return (
            <View key={day.label} style={styles.dayGroup}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                <View style={[styles.dayDot, {
                  backgroundColor: isToday ? C.teal : C.border,
                }]} />
                <Text style={[styles.dayLabel, {
                  color: isToday ? C.teal : C.textPrimary,
                }]}>
                  {day.label}
                </Text>
                <Text style={[styles.daySublabel, { color: C.textTertiary }]}>
                  {day.sublabel}
                </Text>
                {day.events.length > 0 && (
                  <View style={[styles.countBadge, {
                    backgroundColor: isToday ? C.tealDim : C.elevated,
                  }]}>
                    <Text style={[styles.countText, {
                      color: isToday ? C.teal : C.textSecondary,
                    }]}>{day.events.length}</Text>
                  </View>
                )}
              </View>

              {/* Events or empty */}
              {day.events.length > 0 ? (
                <View style={styles.eventsList}>
                  {day.events.map(item => (
                    <ContextMenu
                      key={`${item.trip.id}-${item.event.id}`}
                      actions={[
                        { title: "Open Trip", systemIcon: "arrow.right" },
                        { title: "Share", systemIcon: "square.and.arrow.up" },
                      ]}
                      onPress={(e: any) => {
                        if (e.nativeEvent.index === 0) router.push(`/trip/${item.trip.id}`);
                        else if (e.nativeEvent.index === 1) Share.share({ message: `${item.event.title} — ${item.trip.name}` });
                      }}
                    >
                      <EventRow
                        item={item}
                        C={C}
                        onPress={() => router.push(`/trip/${item.trip.id}`)}
                      />
                    </ContextMenu>
                  ))}
                </View>
              ) : (
                <EmptyDay C={C} />
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 90 },

  header: { paddingHorizontal: S.md, marginBottom: S.lg },
  headerTitle: {
    fontSize: 28, fontFamily: F.black, fontWeight: "900",
    letterSpacing: -0.5,
  },
  headerSub: { fontSize: T.sm, fontWeight: "500", marginTop: 4 },

  // Day groups
  dayGroup: { marginBottom: S.lg },
  dayHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: S.md, marginBottom: S.sm,
  },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { fontSize: T.md, fontWeight: "700" },
  daySublabel: { fontSize: T.sm, fontWeight: "500", flex: 1 },
  countBadge: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  countText: { fontSize: T.xs, fontWeight: "700" },

  // Event row
  eventRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: R.xl, padding: S.sm,
    marginHorizontal: S.md, marginBottom: S.xs,
  },
  timeCol: { width: 52, alignItems: "center" },
  timeText: { fontSize: T.sm, fontWeight: "700" },
  endTimeText: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  colorBar: { width: 3, borderRadius: 2, alignSelf: "stretch", marginHorizontal: S.xs },
  eventContent: { flex: 1 },
  eventTop: { flexDirection: "row", alignItems: "center", gap: S.xs },
  eventIconBox: {
    width: 30, height: 30, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
  },
  eventTitle: { fontSize: T.base, fontWeight: "600", letterSpacing: -0.1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  locationText: { fontSize: T.xs, fontWeight: "500", flex: 1 },
  tripBadge: {
    alignSelf: "flex-start", borderRadius: R.full,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 6, marginLeft: 38,
  },
  tripBadgeText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },

  // Empty day
  emptyDay: {
    marginHorizontal: S.md, borderRadius: R.lg,
    paddingVertical: S.md, alignItems: "center",
  },
  emptyDayText: { fontSize: T.sm, fontWeight: "500", fontStyle: "italic" },

  // Empty state
  emptyState: {
    alignItems: "center", paddingTop: 100,
    paddingHorizontal: S.xl, gap: S.sm,
  },
  emptyTitle: { fontSize: T.xl, fontWeight: "700", letterSpacing: -0.3 },
  emptyText: {
    fontSize: T.base, textAlign: "center", lineHeight: 24, maxWidth: 280,
  },
});
