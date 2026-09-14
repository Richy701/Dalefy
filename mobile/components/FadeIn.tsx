import { useEffect, useState } from "react";
import { type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  cancelAnimation,
  runOnJS,
} from "react-native-reanimated";

const TIMING = { duration: 250, easing: Easing.out(Easing.cubic) };
const VISIBLE_STYLE: ViewStyle = { opacity: 1, transform: [{ translateY: 0 }] };

interface FadeInProps {
  /** Stagger delay in ms (e.g. index * 80) */
  delay?: number;
  /** Slide-up distance in px */
  slideUp?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Wraps children with a fade-in + slide-up entrance animation.
 * Use `delay` to stagger siblings (e.g. `delay={index * 80}`).
 */
export function FadeIn({ delay = 0, slideUp = 18, style, children }: FadeInProps) {
  const progress = useSharedValue(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let active = true;
    const finish = () => {
      if (!active) return;
      cancelAnimation(progress);
      progress.value = 1;
      setSettled(true);
    };
    // Keep the entrance transient. Commit the visible style through React so
    // native screen reattachment cannot restore the initial hidden props.
    const fade = withTiming(1, TIMING, (finished) => {
      if (finished) runOnJS(finish)();
    });
    progress.value = delay > 0 ? withDelay(delay, fade) : fade;
    // Also reveal content if an off-screen/interrupted animation never finishes.
    const fallback = setTimeout(finish, Math.max(0, delay) + TIMING.duration + 100);
    return () => {
      active = false;
      clearTimeout(fallback);
      cancelAnimation(progress);
    };
  }, [delay, progress]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * slideUp }],
  }));

  return (
    <Animated.View style={[style, settled ? VISIBLE_STYLE : animStyle]}>
      {children}
    </Animated.View>
  );
}
