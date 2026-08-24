import { Text, type TextStyle, type StyleProp } from "react-native";
import { F, T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

/**
 * The app's uppercase micro-label (section eyebrows, card kickers).
 * One style to replace the five drifted variants: Barlow Condensed 700,
 * 11pt, letterSpacing 1, uppercase, tertiary text.
 */
export function MicroLabel({ children, color, style }: {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const { C } = useTheme();
  return (
    <Text
      style={[{
        fontFamily: F.bold,
        lineHeight: 14, includeFontPadding: false,
        fontSize: T.xs,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: color ?? C.textTertiary,
      }, style]}
    >
      {children}
    </Text>
  );
}
