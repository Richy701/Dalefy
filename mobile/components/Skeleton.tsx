import { useEffect } from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { R, S } from "@/constants/theme";

interface SkeletonProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width, height, borderRadius = R.sm, style }: SkeletonProps) {
  const { C } = useTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 0.8]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: C.elevated,
          overflow: "hidden",
        },
        animStyle,
        style,
      ]}
    />
  );
}

/** Skeleton layout matching an UpcomingCard */
export function TripCardSkeleton() {
  const { C } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: S.sm2,
        backgroundColor: C.card,
        borderRadius: R.xl,
        padding: S.sm2,
        marginHorizontal: S.md,
      }}
    >
      <Skeleton width={48} height={48} borderRadius={R.xl} />
      <View style={{ flex: 1, gap: S.xs }}>
        <Skeleton width="70%" height={14} borderRadius={R.sm} />
        <Skeleton width="50%" height={10} borderRadius={R.sm} />
      </View>
      <Skeleton width={38} height={32} borderRadius={R.sm} />
    </View>
  );
}

/** Skeleton layout matching a SpotlightEventCard */
export function SpotlightCardSkeleton() {
  const { C } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: C.card,
        borderRadius: R.xl,
        overflow: "hidden",
        minHeight: 110,
      }}
    >
      <Skeleton width={110} height={110} borderRadius={0} />
      <View style={{ flex: 1, padding: S.sm2, justifyContent: "space-between" }}>
        <View style={{ gap: S.xs }}>
          <Skeleton width="80%" height={14} borderRadius={R.sm} />
          <Skeleton width="60%" height={10} borderRadius={R.sm} />
        </View>
        <View style={{ flexDirection: "row", gap: S["2xs"] }}>
          <Skeleton width={52} height={18} borderRadius={R.full} />
          <Skeleton width={60} height={18} borderRadius={R.full} />
        </View>
      </View>
    </View>
  );
}

/** Skeleton layout matching a TripRow */
export function TripRowSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: S.sm2,
        padding: S.sm2,
      }}
    >
      <Skeleton width={52} height={52} borderRadius={R.xl} />
      <View style={{ flex: 1, gap: S.xs }}>
        <Skeleton width={60} height={10} borderRadius={R.sm} />
        <Skeleton width="75%" height={14} borderRadius={R.sm} />
        <Skeleton width="50%" height={10} borderRadius={R.sm} />
      </View>
      <Skeleton width={38} height={40} borderRadius={R.sm} />
    </View>
  );
}
