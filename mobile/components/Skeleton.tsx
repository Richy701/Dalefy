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

interface SkeletonProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
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
        gap: 10,
        backgroundColor: C.card,
        borderRadius: 18,
        padding: 10,
        marginHorizontal: 14,
      }}
    >
      <Skeleton width={48} height={48} borderRadius={10} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" height={14} borderRadius={6} />
        <Skeleton width="50%" height={10} borderRadius={5} />
      </View>
      <Skeleton width={38} height={32} borderRadius={8} />
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
        borderRadius: 18,
        overflow: "hidden",
        minHeight: 110,
      }}
    >
      <Skeleton width={110} height={110} borderRadius={0} />
      <View style={{ flex: 1, padding: 10, justifyContent: "space-between" }}>
        <View style={{ gap: 8 }}>
          <Skeleton width="80%" height={14} borderRadius={6} />
          <Skeleton width="60%" height={10} borderRadius={5} />
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Skeleton width={52} height={18} borderRadius={100} />
          <Skeleton width={60} height={18} borderRadius={100} />
        </View>
      </View>
    </View>
  );
}

/** Skeleton layout matching a TripRow */
export function TripRowSkeleton() {
  const { C } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
      }}
    >
      <Skeleton width={52} height={52} borderRadius={10} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width={60} height={9} borderRadius={4} />
        <Skeleton width="75%" height={14} borderRadius={6} />
        <Skeleton width="50%" height={10} borderRadius={5} />
      </View>
      <Skeleton width={38} height={40} borderRadius={8} />
    </View>
  );
}
