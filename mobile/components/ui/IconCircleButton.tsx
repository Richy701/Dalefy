import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/context/ThemeContext";

type Variant = "glass" | "elevated" | "accent" | "plain";

// iOS 26 renders the real Liquid Glass material; older systems keep the frosted fill
const LIQUID_GLASS = isLiquidGlassAvailable();

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
  const nativeGlass = variant === "glass" && LIQUID_GLASS;
  const bg = {
    glass: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)",
    elevated: C.elevated,
    accent: C.teal,
    plain: "transparent",
  }[variant];
  if (nativeGlass) {
    // The glass is the container so it gets the touches for its own press shimmer
    return (
      <GlassView
        isInteractive
        glassEffectStyle="regular"
        style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, style]}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          hitSlop={size >= 44 ? undefined : Math.ceil((44 - size) / 2)}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          {children}
        </Pressable>
      </GlassView>
    );
  }
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
