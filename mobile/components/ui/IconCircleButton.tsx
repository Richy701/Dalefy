import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "@/services/haptics";

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
  // Every round icon button gives the same light tap
  const press = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); };
  const nativeGlass = variant === "glass" && LIQUID_GLASS;
  const bg = {
    glass: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)",
    elevated: C.elevated,
    accent: C.teal,
    plain: "transparent",
  }[variant];
  if (nativeGlass) {
    // The glass keeps its own Pressable so it gets the touch for its press shimmer. The glass clips
    // that Pressable's hitSlop to the visible circle, so an outer Pressable catches the extra margin
    // that brings small buttons up to a 44pt target.
    const slop = size >= 44 ? undefined : Math.ceil((44 - size) / 2);
    return (
      <Pressable onPress={press} hitSlop={slop} accessible={false} style={style}>
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}
        >
          <Pressable
            onPress={press}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            {children}
          </Pressable>
        </GlassView>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={press}
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
