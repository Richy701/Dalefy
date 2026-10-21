import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "@/services/haptics";

type Variant = "glass" | "elevated" | "accent" | "plain";

// iOS 26 renders the real Liquid Glass material; older systems keep the frosted fill
const LIQUID_GLASS = isLiquidGlassAvailable();
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// Same spring as ScalePress, pressed a little deeper so small round buttons visibly react
const SPRING = { damping: 15, stiffness: 150, mass: 0.4 };
const PRESSED_SCALE = 0.88;

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
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pressIn = () => { scale.value = withSpring(PRESSED_SCALE, SPRING); };
  const pressOut = () => { scale.value = withSpring(1, SPRING); };
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
      <Pressable onPress={press} onPressIn={pressIn} onPressOut={pressOut} hitSlop={slop} accessible={false} style={style}>
        <Animated.View style={scaleStyle}>
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}
        >
          <Pressable
            onPress={press}
            onPressIn={pressIn}
            onPressOut={pressOut}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            {children}
          </Pressable>
        </GlassView>
        </Animated.View>
      </Pressable>
    );
  }
  return (
    <AnimatedPressable
      onPress={press}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={size >= 44 ? undefined : Math.ceil((44 - size) / 2)}
      style={[{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }, scaleStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
