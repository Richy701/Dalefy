import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  Check, WarningCircle, XCircle,
} from "phosphor-react-native";

export type StatusState =
  | "live"
  | "upcoming"
  | "completed"
  | "past"
  | "warning"
  | "destructive";

const COLORS = {
  live: "#34d399",
  upcoming: "#34d399",
  completed: "#34d399",
  past: "#a1a1aa",
  warning: "#f59e0b",
  destructive: "#ef4444",
} as const;

function PulsingDot({ size = 8, color = "#34d399" }: { size?: number; color?: string }) {
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
  }, []);

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
  const c = colorOverride ?? COLORS[state];

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
