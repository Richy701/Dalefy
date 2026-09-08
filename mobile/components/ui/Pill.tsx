import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { F, R, S, T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

type Tone = "accent" | "neutral" | "glass" | "custom";

/**
 * Standard pill/chip. Uppercase Barlow label, one radius (full).
 * size="md" (default): 10/5 padding. size="sm": compact count badge.
 * tone="accent"  -> teal fill, onAccent text
 * tone="neutral" -> elevated fill, secondary text
 * tone="glass"   -> over-photo glass (themed)
 * tone="custom"  -> supply bg/color
 *
 * The outer row wrapper lets the pill size to content inside column parents
 * while still honouring the parent's alignItems inside row parents.
 */
export function Pill({ label, icon, tone = "neutral", size = "md", bg, color, bordered, style }: {
  label: string;
  icon?: React.ReactNode;
  tone?: Tone;
  size?: "md" | "sm";
  bg?: string;
  color?: string;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { C, isDark } = useTheme();
  const palette = {
    accent: { bg: C.teal, color: C.onAccent, border: undefined },
    neutral: { bg: C.elevated, color: C.textSecondary, border: undefined },
    glass: { bg: C.glass, color: isDark ? "#f4f4f5" : C.textPrimary, border: C.glassBorder },
    custom: { bg: bg ?? C.elevated, color: color ?? C.textSecondary, border: undefined },
  }[tone];
  const compact = size === "sm";
  return (
    <View style={{ flexDirection: "row" }}>
      <View
        style={[{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: S["2xs"],
          backgroundColor: palette.bg,
          borderRadius: R.full,
          paddingHorizontal: compact ? 7 : S.sm2,
          paddingVertical: compact ? 3 : 5,
          minWidth: compact ? 22 : undefined,
          ...(bordered || palette.border ? { borderWidth: 1, borderColor: palette.border ?? C.border } : {}),
        }, style]}
      >
        {icon}
        <Text
          style={{
            fontFamily: F.bold,
            fontSize: T["2xs"],
            lineHeight: 13,
            includeFontPadding: false,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: palette.color,
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}
