import { useEffect } from "react";
import { type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from "react-native-reanimated";

const SPRING = { damping: 20, stiffness: 120, mass: 0.8 };

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
    progress.value = withDelay(delay, withSpring(1, SPRING));
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
