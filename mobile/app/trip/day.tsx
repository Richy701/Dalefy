import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  AirplaneTilt, Bed, Compass, ForkKnife, Calendar, MapPin,
  CaretLeft, CaretRight, Clock,
} from "phosphor-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, F, statusTone, type ThemeColors, eventColor } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { DragHandle } from "@/components/ui/DragHandle";
import { FadeIn } from "@/components/FadeIn";
import { EventCard, DocsRow } from "@/components/EventCard";
import { useMemo, useCallback, useState } from "react";
import type { TravelEvent } from "@/shared/types";
import { StatusIndicator } from "@/components/StatusIndicator";

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
  const insets = useSafeAreaInsets();
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
          <Pressable onPress={safeBack} style={styles.errorBtn} accessibilityRole="button" accessibilityLabel="Go back">
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
    <View style={styles.safe}>
      <Stack.Screen options={{
        headerShown: true,
        headerLargeTitle: true,
        headerLargeTitleShadowVisible: false,
        headerLargeTitleStyle: { color: C.teal },
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} contentInsetAdjustmentBehavior="automatic">
        {/* Day title section */}
        <FadeIn style={styles.titleSection}>
          <Text style={styles.dayTitle}>{weekday}</Text>
          <View style={styles.dateRow}>
            <Calendar size={12} color={C.textTertiary} weight="regular" />
            <Text style={styles.dateText}>{dateFormatted}</Text>
          </View>
        </FadeIn>

        {/* Type breakdown pills */}
        {Object.keys(typeCounts).length > 0 && (
          <FadeIn delay={60} style={styles.typeStrip}>
            {Object.entries(typeCounts).map(([type, count]) => {
              const color = eventColor(type, C);
              const Icon = TYPE_ICONS[type] ?? Compass;
              return (
                <Pill
                  key={type}
                  tone="custom"
                  bg={`${color}15`}
                  color={color}
                  icon={<Icon size={12} color={color} weight="regular" />}
                  label={`${count} ${type}${count > 1 ? "s" : ""}`}
                />
              );
            })}
          </FadeIn>
        )}

        {/* Prev / Next day nav */}
        {allDates.length > 1 && (
          <FadeIn delay={120} style={styles.dayNav}>
            <Pressable
              onPress={() => prevDate && goToDay(prevDate)}
              style={({ pressed }) => [styles.dayNavBtn, !prevDate && styles.dayNavDisabled, pressed && { opacity: 0.7 }]}
              disabled={!prevDate}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <CaretLeft size={16} color={prevDate ? C.textPrimary : C.textTertiary} weight="regular" />
              <Text style={[styles.dayNavText, { color: prevDate ? C.textPrimary : C.textTertiary }]}>
                {prevDate ? `Day ${currentIdx}` : ""}
              </Text>
            </Pressable>

            <Text style={[styles.dayNavCurrent, { color: C.textTertiary }]}>
              {dayIndex} / {allDates.length}
            </Text>

            <Pressable
              onPress={() => nextDate && goToDay(nextDate)}
              style={({ pressed }) => [styles.dayNavBtn, !nextDate && styles.dayNavDisabled, pressed && { opacity: 0.7 }]}
              disabled={!nextDate}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Text style={[styles.dayNavText, { color: nextDate ? C.textPrimary : C.textTertiary }]}>
                {nextDate ? `Day ${currentIdx + 2}` : ""}
              </Text>
              <CaretRight size={16} color={nextDate ? C.textPrimary : C.textTertiary} weight="regular" />
            </Pressable>
          </FadeIn>
        )}

        {/* Events */}
        <FadeIn delay={180} style={styles.eventsSection}>
          {dayEvents.map((ev) => (
            <View key={ev.id}>
              <EventCard ev={ev} C={C} tripId={tripId} isLeader={isLeader} onPress={setSheetEvent} />
              {isLeader && ev.documents && ev.documents.length > 0 && (
                <DocsRow documents={ev.documents} C={C} />
              )}
            </View>
          ))}
        </FadeIn>

        {/* Empty state */}
        {dayEvents.length === 0 && (
          <FadeIn delay={60}>
            <EmptyState
              icon={<Compass size={28} color={C.teal} weight="thin" />}
              title="No events"
              message="Nothing scheduled for this day yet."
            />
          </FadeIn>
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
    </View>
  );
}

// ── Event Summary Sheet ─────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity", dining: "Dining", transfer: "Transfer",
};

function EventSummarySheet({ ev, C, onViewFull }: {
  ev: TravelEvent;
  C: ThemeColors;
  tripId: string;
  onClose: () => void;
  onViewFull: () => void;
}) {
  const color = eventColor(ev.type, C);
  const Icon = TYPE_ICONS[ev.type] ?? Compass;
  const transferLabels: Record<string, string> = { car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise", other: "Transfer" };
  const typeLabel = ev.type === "transfer" ? (transferLabels[ev.transferType || "car"] || "Transfer") : (TYPE_LABELS[ev.type] ?? "Event");

  return (
    <View style={[ss.container, { backgroundColor: C.bg }]}>
      <DragHandle />

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
              {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}{ev.duration ? ` (${ev.duration})` : ""}
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
            <StatusIndicator
              state={
                ev.status.toLowerCase().includes("cancel") ? "destructive"
                : ev.status.toLowerCase().includes("delay") ? "warning"
                : ev.status.toLowerCase().includes("done") || ev.status.toLowerCase().includes("complet") || ev.status.toLowerCase().includes("land") ? "completed"
                : "upcoming"
              }
              size={10}
              color={statusTone(ev.status, C).color}
            />
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
        accessibilityRole="button"
        accessibilityLabel="View full details"
        style={({ pressed }) => [ss.fullBtn, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[ss.fullBtnText, { color: C.onAccent }]}>View full details</Text>
      </Pressable>
    </View>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: S.md },
  header: { flexDirection: "row", alignItems: "flex-start", gap: S.sm, marginBottom: S.lg },
  typeDot: { width: 40, height: 40, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: T.xs, fontWeight: T.bold, letterSpacing: 0.5, marginBottom: 2 },
  title: { fontSize: T.xl, fontWeight: T.bold, letterSpacing: -0.3, lineHeight: 26 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: S.md, gap: S.sm, marginBottom: S.md },
  detailRow: { flexDirection: "row", alignItems: "center", gap: S.sm2 },
  detailText: { fontSize: 14, fontWeight: T.medium, flex: 1 },
  desc: { fontSize: 14, lineHeight: 22, marginBottom: S.lg },
  fullBtn: { height: 52, borderRadius: R.xl, alignItems: "center", justifyContent: "center" },
  fullBtnText: { fontSize: T.md, fontWeight: T.bold },
});

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: S.md },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    errorBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    errorBtnText: { color: C.onAccent, fontWeight: T.bold, fontSize: T.base },

    // Title section
    titleSection: {
      paddingHorizontal: S.md,
      paddingBottom: S.lg,
    },
    dayTitle: {
      fontSize: T["4xl"],
      fontFamily: F.black,
      textTransform: "uppercase",
      color: C.textPrimary,
      letterSpacing: 0.5,
      lineHeight: 36,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.xs2,
      marginTop: S.xs2,
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
      gap: S.xs,
      paddingHorizontal: S.md,
      marginBottom: S.xl,
    },

    // Day navigation
    dayNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: S.md,
      marginBottom: S.lg,
    },
    dayNavBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: S["2xs"],
      paddingVertical: S.xs2,
      paddingHorizontal: S["2xs"],
      minWidth: 70,
    },
    dayNavDisabled: { opacity: 0.3 },
    dayNavText: { fontSize: T.sm, fontWeight: T.semibold },
    dayNavCurrent: { fontSize: T.sm, fontWeight: T.semibold },

    // Events
    eventsSection: {
      paddingHorizontal: S.md,
      gap: S.lg,
    },
  });
}
