import { View, Text, Pressable, StyleSheet } from "react-native";
import { ChatCircleText, CaretRight } from "phosphor-react-native";
import * as Haptics from "@/services/haptics";
import { type ThemeColors, T, S } from "@/constants/theme";

/**
 * Dale in the tab bar's bottom accessory (iOS 26). iOS renders two copies, one above the full bar
 * ("regular") and one beside the minimised bar ("inline"), so the content takes its placement as a prop.
 */
export function DaleAccessory({ C, placement, firstName, tripName, onPress }: {
  C: ThemeColors;
  placement: "regular" | "inline";
  firstName: string;
  tripName: string;
  onPress: () => void;
}) {
  const inline = placement === "inline";
  const greeting = firstName ? `Hi ${firstName}, ask Dale` : "Ask Dale";
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${greeting} about ${tripName}`}
      style={({ pressed }) => [styles.row, inline && styles.rowInline, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.mark, inline && styles.markInline, { backgroundColor: C.teal }]}>
        <ChatCircleText size={inline ? 14 : 17} color={C.onAccent} weight="fill" />
      </View>
      {inline ? (
        <Text style={[styles.title, { color: C.textPrimary }]} numberOfLines={1}>Ask Dale</Text>
      ) : (
        <>
          <View style={styles.text}>
            <Text style={[styles.title, { color: C.textPrimary }]} numberOfLines={1}>{greeting}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]} numberOfLines={1}>About {tripName}</Text>
          </View>
          <CaretRight size={14} color={C.textTertiary} weight="bold" />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md },
  rowInline: { gap: S.xs, paddingHorizontal: S.sm },
  mark: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  markInline: { width: 24, height: 24, borderRadius: 12 },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: T.base, fontWeight: T.semibold },
  sub: { fontSize: T.xs, marginTop: 1 },
});
