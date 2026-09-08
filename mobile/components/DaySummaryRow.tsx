import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { AirplaneTilt, Bed, Compass, ForkKnife, Car, CaretRight } from "phosphor-react-native";
import { type ThemeColors, T, R, S, shadow } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
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
  onPress: () => void;
}

export function DaySummaryRow({
  dayIndex, date, events, C, isToday, onPress,
}: DaySummaryRowProps) {
  const d = new Date(date + "T12:00:00");
  const fullDate = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const { isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, isDark), [C, isDark]);
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
      activeScale={0.98}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Day ${dayIndex}, ${fullDate}, ${events.length} events`}
    >
          <View style={s.content}>
            {/* Header row — formatted date left, Day N right */}
            <View style={s.headerRow}>
              <Text style={[s.dateText, isToday && { color: C.tealText }]}>{fullDate}</Text>
              <Text style={[s.dayLabel, isToday && { color: C.tealText }]}>Day {dayIndex}</Text>
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
                <Text style={[s.countText, isToday && { color: C.tealText }]}>{events.length}</Text>
                <CaretRight size={14} color={isToday ? C.teal : C.textTertiary} weight="regular" />
              </View>
            </View>
          </View>
    </ScalePress>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
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
      ...shadow("subtle", isDark),
    },
    cardToday: {
      backgroundColor: C.tealDim,
    },

    content: {
      padding: S.md,
    },

    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: S.xs2,
    },
    dateText: {
      fontSize: T.sm,
      fontWeight: T.semibold,
      color: C.textSecondary,
    },
    dayLabel: {
      fontSize: T["2xs"],
      fontWeight: T.bold,
      color: C.textTertiary,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },

    pillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: S["2xs"],
      marginBottom: S.xs2,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: S.xs,
      paddingVertical: S["2xs"],
      borderRadius: R.full,
      backgroundColor: C.tealDim,
    },
    pillCount: {
      fontSize: T.xs,
      fontWeight: T.bold,
      color: C.tealText,
      fontVariant: ["tabular-nums"],
    },

    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.xs,
    },
    preview: {
      flex: 1,
      fontSize: T.xs,
      fontWeight: T.medium,
      color: C.textTertiary,
      lineHeight: 17,
    },

    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: S["2xs"],
    },
    countText: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textSecondary,
      fontVariant: ["tabular-nums"],
    },
  });
}
