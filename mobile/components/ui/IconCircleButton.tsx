import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";

type Variant = "glass" | "elevated" | "accent" | "plain";

/**
 * Circular icon-only button. accessibilityLabel is required — icon-only
 * controls are invisible to screen readers without one.
 */
export function IconCircleButton({ size = 44, onPress, variant = "elevated", accessibilityLabel, children, style }: {
  size?: number;
  onPress: () => void;
  variant?: Variant;
  accessibilityLabel: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { C, isDark } = useTheme();
  const bg = {
    glass: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)",
    elevated: C.elevated,
    accent: C.teal,
    plain: "transparent",
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={size >= 44 ? undefined : Math.ceil((44 - size) / 2)}
      style={({ pressed }) => [{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      }, style]}
    >
      {children}
    </Pressable>
  );
}
