import { View, Text, StyleSheet } from "react-native";
import { FileText, ChevronRight } from "lucide-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import { ScalePress } from "@/components/ScalePress";

interface InfoDocsRowProps {
  count: number;
  C: ThemeColors;
  onPress: () => void;
}

export function InfoDocsRow({ count, C, onPress }: InfoDocsRowProps) {
  const s = makeStyles(C);
  return (
    <ScalePress
      style={s.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Information and documents, ${count} items`}
    >
      <View style={s.iconBox}>
        <FileText size={15} color={C.teal} strokeWidth={1.8} />
      </View>
      <View style={s.center}>
        <Text style={s.label}>INFORMATION & DOCUMENTS</Text>
      </View>
      <View style={s.countBadge}>
        <Text style={s.countText}>{count}</Text>
      </View>
      <ChevronRight size={14} color={C.textTertiary} strokeWidth={2} />
    </ScalePress>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      marginHorizontal: S.md,
      marginTop: S.sm,
      paddingVertical: S.sm,
      paddingHorizontal: S.sm,
      backgroundColor: C.card,
      borderRadius: R.xl,
    },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: R.md,
      backgroundColor: C.tealDim,
      alignItems: "center",
      justifyContent: "center",
    },
    center: { flex: 1 },
    label: {
      fontSize: T.xs,
      fontWeight: T.bold,
      color: C.textSecondary,
      letterSpacing: 1,
    },
    countBadge: {
      backgroundColor: C.tealDim,
      borderRadius: R.sm,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    countText: {
      fontSize: T.xs,
      fontWeight: T.bold,
      color: C.teal,
      letterSpacing: 0.5,
    },
  });
}
