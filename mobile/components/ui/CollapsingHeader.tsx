import { View, Text, Platform, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { S, T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

/**
 * Manual large-title header for tab screens. UIKit's large-title/scroll link
 * doesn't engage for stacks nested inside NativeTabs, so we drive it from the
 * scroll position ourselves: a big in-content title (ScreenTitle) plus a
 * compact frosted bar (CompactHeader) that fades in once the title scrolls away.
 */
export function useCollapsingHeader(threshold = 40) {
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [threshold - 16, threshold + 24], [0, 1], Extrapolation.CLAMP),
  }));
  return { onScroll, barStyle };
}

const BAR_H = 44;

/** Absolute compact bar. Render AFTER the scroll view so it sits on top. */
export function CompactHeader({ title, barStyle, right }: {
  title: string;
  barStyle: { opacity: number } | object;
  right?: React.ReactNode;
}) {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, height: insets.top + BAR_H },
        barStyle,
      ]}
    >
      {Platform.OS === "ios" ? (
        <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />
      )}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: BAR_H,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary }}>{title}</Text>
      </View>
      {right && (
        <View style={{ position: "absolute", right: S.md, bottom: 0, height: BAR_H, justifyContent: "center" }}>
          {right}
        </View>
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
    </Animated.View>
  );
}

/** Large in-content title. First element of the scroll content. */
export function ScreenTitle({ children, color, right }: {
  children: string;
  color?: string;
  right?: React.ReactNode;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + S.xs,
        paddingHorizontal: S.md,
        paddingBottom: S.xs,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 34, fontWeight: T.bold, letterSpacing: 0.4, color: color ?? C.textPrimary }}>
        {children}
      </Text>
      {right}
    </View>
  );
}
