import { Text, type TextStyle, type StyleProp } from "react-native";
import { T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

/**
 * Section heading for boxless sections: system font, sentence case,
 * 17pt semibold in the primary text colour. One style everywhere.
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
        fontSize: T.lg,
        fontWeight: T.semibold,
        letterSpacing: -0.2,
        color: color ?? C.textPrimary,
      }, style]}
    >
      {children}
    </Text>
  );
}
