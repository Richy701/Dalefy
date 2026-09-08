import { Text, type TextStyle, type StyleProp } from "react-native";
import { T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

/**
 * Quiet section label (eyebrows, card kickers): system font, sentence case,
 * tertiary text. One style everywhere.
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
        fontSize: T.sm,
        fontWeight: T.medium,
        color: color ?? C.textTertiary,
      }, style]}
    >
      {children}
    </Text>
  );
}
