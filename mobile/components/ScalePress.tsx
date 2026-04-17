import { type ReactNode } from "react";
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.4,
};

interface ScalePressProps extends Omit<PressableProps, "style"> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale value when pressed (default 0.97) */
  activeScale?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ScalePress({
  children,
  style,
  activeScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: ScalePressProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(activeScale, SPRING_CONFIG);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING_CONFIG);
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
