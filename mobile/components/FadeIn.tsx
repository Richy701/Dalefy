import { useEffect } from "react";
import { type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";

const TIMING = { duration: 250, easing: Easing.out(Easing.cubic) };

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

  useEffect(() => {
    // Reanimated 4.5 never starts a withDelay(0, ...) animation, so the wrapped
    // content stays at opacity 0. Only wrap when there is a real delay.
    const fade = withTiming(1, TIMING);
    progress.value = delay > 0 ? withDelay(delay, fade) : fade;
  }, [delay, progress]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * slideUp }],
  }));

  return (
    <Animated.View style={[style, animStyle]}>
      {children}
    </Animated.View>
  );
}
