import { View, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { FileText, CaretRight } from "phosphor-react-native";
import { type ThemeColors, R, S } from "@/constants/theme";
import { ScalePress } from "@/components/ScalePress";
import { Pill } from "@/components/ui/Pill";
import { MicroLabel } from "@/components/ui/MicroLabel";

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
        <FileText size={15} color={C.textTertiary} weight="regular" />
      </View>
      <View style={s.center}>
        <MicroLabel color={C.textSecondary}>Information & documents</MicroLabel>
      </View>
      <Pill size="sm" tone="custom" bg={C.tealDim} color={C.tealText} label={String(count)} />
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
      width: 38,
      height: 38,
      borderRadius: R.md,
      backgroundColor: C.tealDim,
      alignItems: "center",
      justifyContent: "center",
    },
    center: { flex: 1 },
  });
}
