import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { CachedImage } from "@/components/CachedImage";
import * as Haptics from "@/services/haptics";
import { handOffTrip } from "@/services/joinHandoff";
import { dismissListedTrip, type ListedTrip } from "@/services/listedTrips";
import { shortDay } from "@/shared/tripSummary";
import { T, R, S, type ThemeColors } from "@/constants/theme";

/** Trips an organiser has added them to since they last looked: one tap to join, no PIN. */
export function ListedTrips({ rows, C, inset }: { rows: ListedTrip[]; C: ThemeColors; inset?: boolean }) {
  const router = useRouter();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={inset ? styles.inset : styles.section}>
      <Text style={[styles.title, !inset && styles.gutter]} accessibilityRole="header">You've been added</Text>
      {rows.map((row, i) => (
        <View key={row.trip.id} style={[styles.row, !inset && styles.gutter, i > 0 && styles.rowBorder]}>
          <CachedImage uri={row.trip.image} style={styles.photo} accessible={false} />
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>{row.trip.name}</Text>
            <Text style={styles.dates} numberOfLines={1}>{shortDay(row.trip.start)} – {shortDay(row.trip.end)}</Text>
          </View>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); dismissListedTrip(row.trip.id); }}
            accessibilityRole="button"
            accessibilityLabel={`Not now, ${row.trip.name}`}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={styles.dates}>Not now</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handOffTrip(row.trip);
              router.push(`/shared/${row.trip.id}?join=1${row.travelerId ? `&traveler=${encodeURIComponent(row.travelerId)}` : ""}`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Join ${row.trip.name}`}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={styles.join}>Join</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (C: ThemeColors) => StyleSheet.create({
  section: { marginTop: S.xl },
  inset: { marginTop: S.md },
  gutter: { paddingHorizontal: S.md },
  title: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2, paddingBottom: S.xs },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingVertical: S.sm, minHeight: 48 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  photo: { width: 40, height: 40, borderRadius: R.md },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
  dates: { fontSize: T.sm, color: C.textSecondary },
  join: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },
});
