import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { AirplaneTilt, Bed, Compass, ForkKnife, Car, CaretRight } from "phosphor-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TravelEvent } from "@/shared/types";
import { useHaptic } from "@/hooks/useHaptic";
import { ScalePress } from "@/components/ScalePress";

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt,
  hotel: Bed,
  activity: Compass,
  dining: ForkKnife,
  transfer: Car,
};

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity",
  dining: "Dining", transfer: "Transfer",
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
};

function cleanTitle(title: string, type: string): string {
  const label = TYPE_LABELS[type] || "";
  if (label) {
    const re = new RegExp(`^${label}\\s*[-–·:]\\s*`, "i");
    title = title.replace(re, "");
  }
  return title;
}

function timeToMinutes(t: string): number {
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
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
  const fullDate = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const s = useMemo(() => makeStyles(C), [C]);
  const haptic = useHaptic();

  const handlePress = () => {
    haptic.light();
    onPress();
  };

  const typeCounts: Record<string, number> = {};
  for (const ev of events) {
    typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
  }

  const sorted = [...events].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  const firstEvent = sorted[0];

  return (
    <ScalePress
      style={[s.cardOuter, s.card, isToday && s.cardToday]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Day ${dayIndex}, ${fullDate}, ${events.length} events`}
    >
          <View style={s.content}>
            {/* Header row — formatted date left, Day N right */}
            <View style={s.headerRow}>
              <Text style={[s.dateText, isToday && { color: C.teal }]}>{fullDate}</Text>
              <Text style={[s.dayLabel, isToday && { color: C.teal }]}>Day {dayIndex}</Text>
            </View>

            {/* Event type pills — all mint */}
            <View style={s.pillsRow}>
              {Object.entries(typeCounts).map(([type, count]) => {
                const Icon = TYPE_ICONS[type] ?? Compass;
                return (
                  <View key={type} style={s.pill}>
                    <Icon size={11} color={C.teal} weight="regular" />
                    {count > 1 && <Text style={s.pillCount}>{count}</Text>}
                  </View>
                );
              })}
            </View>

            {/* First event preview — cleaned title, clamped */}
            <View style={s.previewRow}>
              {firstEvent && (
                <Text style={s.preview} numberOfLines={2}>
                  {cleanTitle(firstEvent.title, firstEvent.type)}
                  {events.length > 1 ? ` +${events.length - 1} more` : ""}
                </Text>
              )}

              {/* Count + chevron — no pill background */}
              <View style={s.right}>
                <Text style={[s.countText, isToday && { color: C.teal }]}>{events.length}</Text>
                <CaretRight size={14} color={isToday ? C.teal : C.textTertiary} weight="regular" />
              </View>
            </View>
          </View>
    </ScalePress>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    cardOuter: {
      flex: 1,
      marginBottom: S.sm,
    },
    card: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: R.xl,
      overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
    },
    cardToday: {
      backgroundColor: `${C.teal}08`,
    },

    content: {
      padding: S.md,
    },

    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    dateText: {
      fontSize: T.sm,
      fontWeight: "600",
      color: C.textSecondary,
    },
    dayLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: C.textTertiary,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },

    pillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginBottom: 6,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: R.full,
      backgroundColor: `${C.teal}15`,
    },
    pillCount: {
      fontSize: 11,
      fontWeight: "700",
      color: C.teal,
      fontVariant: ["tabular-nums"],
    },

    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    preview: {
      flex: 1,
      fontSize: T.xs,
      fontWeight: "500",
      color: C.textTertiary,
      lineHeight: 17,
    },

    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    countText: {
      fontSize: T.sm,
      fontWeight: "700",
      color: C.textSecondary,
      fontVariant: ["tabular-nums"],
    },
  });
}
