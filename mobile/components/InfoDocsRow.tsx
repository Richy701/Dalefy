import { View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { FileText, CaretRight } from "phosphor-react-native";
import { type ThemeColors, R, S, T } from "@/constants/theme";
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
      activeScale={0.98}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`Information and documents, ${count} items`}
    >
      <View style={s.iconBox}>
        <FileText size={16} color={C.textSecondary} weight="fill" />
      </View>
      <View style={s.center}>
        <Text style={s.title}>Information & documents</Text>
        <Text style={s.sub}>{count} {count === 1 ? "item" : "items"} from your organiser</Text>
      </View>
      <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center" }} />
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
      width: 36,
      height: 36,
      borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    center: { flex: 1, gap: 2 },
    title: { fontSize: T.base, fontWeight: T.medium, color: C.textPrimary },
    sub: { fontSize: T.sm, color: C.textTertiary },
  });
}
