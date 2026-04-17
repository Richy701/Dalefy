import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { Plane, Hotel, Compass, Utensils, ChevronRight } from "lucide-react-native";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import type { TravelEvent } from "@/shared/types";
import { useHaptic } from "@/hooks/useHaptic";
import { ScalePress } from "@/components/ScalePress";

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Plane,
  hotel: Hotel,
  activity: Compass,
  dining: Utensils,
};

const TYPE_LABELS: Record<string, string> = {
  flight: "FLIGHT",
  hotel: "HOTEL",
  activity: "ACTIVITY",
  dining: "DINING",
};

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

interface DaySummaryRowProps {
  dayIndex: number;
  date: string;
  events: TravelEvent[];
  C: ThemeColors;
  isToday?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onPress: () => void;
}

export function DaySummaryRow({
  dayIndex, date, events, C, isToday, isFirst, isLast, onPress,
}: DaySummaryRowProps) {
  const d = new Date(date + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const fullDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const s = useMemo(() => makeStyles(C), [C]);
  const haptic = useHaptic();

  const handlePress = () => {
    haptic.light();
    onPress();
  };

  // Collect event types with counts
  const typeCounts: Record<string, number> = {};
  for (const ev of events) {
    typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
  }

  // First event preview (sorted by time)
  const sorted = [...events].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  const firstEvent = sorted[0];
  const lastEvent = sorted[sorted.length - 1];

  // Time span text
  const timeSpan = firstEvent?.time && lastEvent?.time && events.length > 1
    ? `${firstEvent.time} — ${lastEvent.time}`
    : firstEvent?.time || "";

  // Dominant event type (most frequent) for accent
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "activity";
  const accentColor = (C as any)[dominantType] ?? C.teal;

  return (
    <ScalePress
      style={[s.cardOuter, s.card, isToday && s.cardToday]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Day ${dayIndex}, ${fullDate}, ${events.length} events`}
    >
          {/* Day number — large typographic element */}
          <View style={s.dayCol}>
            <Text style={[s.dayNum, { color: isToday ? C.teal : C.textPrimary }]}>{dayIndex}</Text>
            <Text style={[s.dayLabel, { color: isToday ? C.teal : C.textTertiary }]}>{weekday}</Text>
          </View>

          {/* Center: date + event pills + preview */}
          <View style={s.center}>
            {/* Date + time span */}
            <View style={s.dateRow}>
              <Text style={s.dateText}>{fullDate}</Text>
              {timeSpan ? (
                <Text style={s.timeSpan}>{timeSpan}</Text>
              ) : null}
            </View>

            {/* Event type pills */}
            <View style={s.pillsRow}>
              {Object.entries(typeCounts).map(([type, count]) => {
                const color = (C as any)[type] ?? C.teal;
                const Icon = TYPE_ICONS[type] ?? Compass;
                const label = TYPE_LABELS[type] ?? type.toUpperCase();
                return (
                  <View key={type} style={[s.pill, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
                    <Icon size={9} color={color} strokeWidth={2} />
                    <Text style={[s.pillText, { color }]}>
                      {count > 1 ? `${count} ${label}S` : label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* First event preview */}
            {firstEvent && (
              <Text style={s.preview} numberOfLines={1}>
                {firstEvent.title}
                {events.length > 1 ? ` +${events.length - 1} more` : ""}
              </Text>
            )}
          </View>

          {/* Right: count + chevron */}
          <View style={s.right}>
            <View style={[s.countBadge, isToday && { backgroundColor: C.tealDim, borderColor: C.tealMid }]}>
              <Text style={[s.countNum, isToday && { color: C.teal }]}>{events.length}</Text>
            </View>
            <ChevronRight size={14} color={isToday ? C.teal : C.textTertiary} strokeWidth={2} />
          </View>
    </ScalePress>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    // Card
    cardOuter: {
      flex: 1,
      marginBottom: S.xs,
    },
    card: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.card,
      borderRadius: R.xl,
      overflow: "hidden",
    },
    cardToday: {
      backgroundColor: `${C.teal}08`,
    },

    // Day number column
    dayCol: {
      width: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: S.sm,
    },
    dayNum: {
      fontSize: T["2xl"],
      fontWeight: T.bold,
      letterSpacing: -0.3,
      lineHeight: 26,
    },
    dayLabel: {
      fontSize: 10,
      fontWeight: T.bold,
      letterSpacing: 1.2,
      marginTop: 1,
    },

    // Center content
    center: {
      flex: 1,
      paddingVertical: S.sm,
      paddingRight: S.xs,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 5,
    },
    dateText: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textPrimary,
    },
    timeSpan: {
      fontSize: 10,
      fontWeight: T.bold,
      color: C.textTertiary,
      letterSpacing: 0.3,
    },

    // Event type pills
    pillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginBottom: 5,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2.5,
      borderRadius: R.full,
    },
    pillText: {
      fontSize: 10,
      fontWeight: T.bold,
      letterSpacing: 0.6,
    },

    // First event preview
    preview: {
      fontSize: T.xs,
      fontWeight: T.medium,
      color: C.textTertiary,
      lineHeight: 15,
    },

    // Right column
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingRight: S.sm,
    },
    countBadge: {
      backgroundColor: C.elevated,
      borderRadius: R.sm,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    countNum: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textSecondary,
      letterSpacing: -0.2,
    },
  });
}
