import { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import {
  Check, WarningCircle, XCircle,
} from "phosphor-react-native";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

export type StatusState =
  | "live"
  | "upcoming"
  | "completed"
  | "past"
  | "warning"
  | "destructive";

function stateColor(state: StatusState, C: ThemeColors): string {
  switch (state) {
    case "live":
    case "upcoming":
    case "completed":
      return C.green;
    case "past":
      return C.textTertiary;
    case "warning":
      return C.amber;
    case "destructive":
      return C.red;
  }
}

function PulsingDot({ size = 8, color }: { size?: number; color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export function StatusIndicator({
  state,
  size = 12,
  color: colorOverride,
}: {
  state: StatusState;
  size?: number;
  color?: string;
}) {
  const { C } = useTheme();
  const c = colorOverride ?? stateColor(state, C);

  switch (state) {
    case "live":
      return <PulsingDot size={size} color={c} />;
    case "upcoming":
      return <Check size={size} color={c} weight="bold" />;
    case "completed":
      return <Check size={size} color={c} weight="bold" />;
    case "past":
      return <Check size={size} color={c} weight="bold" />;
    case "warning":
      return <WarningCircle size={size} color={c} weight="fill" />;
    case "destructive":
      return <XCircle size={size} color={c} weight="fill" />;
  }
}
