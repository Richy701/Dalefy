import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Calendar, MapPin,
  CaretLeft, CaretRight, Clock, X,
} from "phosphor-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, type ThemeColors, eventColor } from "@/constants/theme";
import { EventCard, DocsRow } from "@/components/EventCard";
import { useMemo, useCallback, useState } from "react";
import type { TravelEvent } from "@/shared/types";

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

/** For sorting: hotel checkout events should sort by checkout time, not check-in time */
function sortMinutes(ev: { type: string; time: string; title: string; checkout?: string }): number {
  if (ev.type === "hotel" && ev.checkout && /check.?out/i.test(ev.title)) {
    return timeToMinutes(ev.checkout);
  }
  return timeToMinutes(ev.time);
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, hotel: Bed, activity: Compass, dining: ForkKnife,
};

export default function DayDetailScreen() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C, isDark } = useTheme();
  const { isLeader } = useTripRole(tripId);
  const styles = useMemo(() => makeStyles(C), [C]);
  const [sheetEvent, setSheetEvent] = useState<TravelEvent | null>(null);

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
    .sort((a, b) => sortMinutes(a) - sortMinutes(b));


  const allDates = [...new Set(trip.events.map(e => e.date))].sort();
  const currentIdx = allDates.indexOf(date!);
  const dayIndex = currentIdx + 1;
  const prevDate = currentIdx > 0 ? allDates[currentIdx - 1] : null;
  const nextDate = currentIdx < allDates.length - 1 ? allDates[currentIdx + 1] : null;

  const goToDay = useCallback((d: string) => {
    Haptics.selectionAsync();
    router.replace({ pathname: "/trip/day", params: { tripId, date: d } });
  }, [router, tripId]);

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
        headerTransparent: Platform.OS === "ios",
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: C.teal,
        headerTitleStyle: { color: C.teal, fontWeight: "700" },
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? { headerStyle: { backgroundColor: C.bg } } : {}),
      }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} contentInsetAdjustmentBehavior="automatic">
        {/* Day title section */}
        <View style={styles.titleSection}>
          <Text style={styles.dayTitle}>{weekday}</Text>
          <View style={styles.dateRow}>
            <Calendar size={12} color={C.textTertiary} weight="regular" />
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
                  <Icon size={12} color={color} weight="regular" />
                  <Text style={[styles.typeChipText, { color }]}>
                    {count} {type}{count > 1 ? "s" : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Prev / Next day nav */}
        {allDates.length > 1 && (
          <View style={styles.dayNav}>
            <Pressable
              onPress={() => prevDate && goToDay(prevDate)}
              style={[styles.dayNavBtn, !prevDate && styles.dayNavDisabled]}
              disabled={!prevDate}
              hitSlop={8}
            >
              <CaretLeft size={16} color={prevDate ? C.textPrimary : C.textDim} weight="regular" />
              <Text style={[styles.dayNavText, { color: prevDate ? C.textPrimary : C.textDim }]}>
                {prevDate ? `Day ${currentIdx}` : ""}
              </Text>
            </Pressable>

            <Text style={[styles.dayNavCurrent, { color: C.textTertiary }]}>
              {dayIndex} / {allDates.length}
            </Text>

            <Pressable
              onPress={() => nextDate && goToDay(nextDate)}
              style={[styles.dayNavBtn, !nextDate && styles.dayNavDisabled]}
              disabled={!nextDate}
              hitSlop={8}
            >
              <Text style={[styles.dayNavText, { color: nextDate ? C.textPrimary : C.textDim }]}>
                {nextDate ? `Day ${currentIdx + 2}` : ""}
              </Text>
              <CaretRight size={16} color={nextDate ? C.textPrimary : C.textDim} weight="regular" />
            </Pressable>
          </View>
        )}

        {/* Events */}
        <View style={styles.eventsSection}>
          {dayEvents.map((ev) => (
            <View key={ev.id}>
              <EventCard ev={ev} C={C} tripId={tripId} isLeader={isLeader} onPress={setSheetEvent} />
              {isLeader && ev.documents && ev.documents.length > 0 && (
                <DocsRow documents={ev.documents} C={C} />
              )}
            </View>
          ))}
        </View>

        {/* Empty state */}
        {dayEvents.length === 0 && (
          <View style={styles.emptyWrap}>
            <Compass size={28} color={C.textDim} weight="thin" />
            <Text style={styles.emptyTitle}>No Events</Text>
            <Text style={styles.emptyText}>Nothing scheduled for this day yet.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Event summary sheet ── */}
      <Modal
        visible={!!sheetEvent}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheetEvent(null)}
      >
        {sheetEvent && (
          <EventSummarySheet
            ev={sheetEvent}
            C={C}
            tripId={tripId!}
            onClose={() => setSheetEvent(null)}
            onViewFull={() => {
              setSheetEvent(null);
              router.push(`/trip/event?tripId=${tripId}&eventId=${sheetEvent.id}`);
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ── Event Summary Sheet ─────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity", dining: "Dining", transfer: "Transfer",
};

function EventSummarySheet({ ev, C, tripId, onClose, onViewFull }: {
  ev: TravelEvent;
  C: ThemeColors;
  tripId: string;
  onClose: () => void;
  onViewFull: () => void;
}) {
  const color = eventColor(ev.type, C);
  const Icon = TYPE_ICONS[ev.type] ?? Compass;
  const typeLabel = TYPE_LABELS[ev.type] ?? "Event";

  return (
    <View style={[ss.container, { backgroundColor: C.bg }]}>
      {/* Handle bar */}
      <View style={ss.handleWrap}>
        <View style={[ss.handle, { backgroundColor: C.border }]} />
      </View>

      {/* Header */}
      <View style={ss.header}>
        <View style={[ss.typeDot, { backgroundColor: `${color}20` }]}>
          <Icon size={16} color={color} weight="regular" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ss.typeLabel, { color }]}>{typeLabel}</Text>
          <Text style={[ss.title, { color: C.textPrimary }]} numberOfLines={2}>{ev.title}</Text>
        </View>
      </View>

      {/* Key details */}
      <View style={[ss.details, { borderColor: C.border }]}>
        {ev.date && (
          <View style={ss.detailRow}>
            <Calendar size={14} color={C.textTertiary} weight="regular" />
            <Text style={[ss.detailText, { color: C.textSecondary }]}>
              {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Text>
          </View>
        )}
        {ev.time && (
          <View style={ss.detailRow}>
            <Clock size={14} color={C.textTertiary} weight="regular" />
            <Text style={[ss.detailText, { color: C.textSecondary }]}>
              {ev.time}{ev.endTime ? ` - ${ev.endTime}` : ""}{ev.duration ? ` (${ev.duration})` : ""}
            </Text>
          </View>
        )}
        {ev.location && (
          <View style={ss.detailRow}>
            <MapPin size={14} color={C.textTertiary} weight="regular" />
            <Text style={[ss.detailText, { color: C.textSecondary }]} numberOfLines={2}>{ev.location}</Text>
          </View>
        )}
        {ev.status && (
          <View style={ss.detailRow}>
            <View style={[ss.statusDot, {
              backgroundColor: ev.status.toLowerCase().includes("cancel") ? "#ef4444"
                : ev.status.toLowerCase().includes("delay") ? "#f59e0b" : "#22c55e"
            }]} />
            <Text style={[ss.detailText, { color: C.textSecondary }]}>{ev.status}</Text>
          </View>
        )}
      </View>

      {ev.description && (
        <Text style={[ss.desc, { color: C.textTertiary }]} numberOfLines={3}>{ev.description}</Text>
      )}

      {/* View full detail button */}
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onViewFull(); }}
        style={({ pressed }) => [ss.fullBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={ss.fullBtnText}>View Full Details</Text>
      </Pressable>
    </View>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: S.lg },
  handleWrap: { alignItems: "center", paddingVertical: 12 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: S.lg },
  typeDot: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 2 },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2, lineHeight: 26 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: S.md, gap: 12, marginBottom: S.md },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailText: { fontSize: 14, fontWeight: "500", flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  desc: { fontSize: 14, lineHeight: 22, marginBottom: S.lg },
  fullBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  fullBtnText: { fontSize: 15, fontWeight: "700", color: "#000" },
});

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 16 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },


    // Title section
    titleSection: {
      paddingHorizontal: S.lg,
      paddingBottom: S.lg,
    },
    dayTitle: {
      fontSize: T["3xl"] + 4,
      fontWeight: "700",
      color: C.textPrimary,
      letterSpacing: -0.3,
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
      flexWrap: "wrap",
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

    // Day navigation
    dayNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: S.lg,
      marginBottom: S.lg,
    },
    dayNavBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 4,
      minWidth: 70,
    },
    dayNavDisabled: { opacity: 0.3 },
    dayNavText: { fontSize: T.sm, fontWeight: "600" },
    dayNavCurrent: { fontSize: T.sm, fontWeight: "600" },

    // Events
    eventsSection: {
      paddingHorizontal: S.md,
      gap: S.lg,
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
