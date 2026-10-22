import { useEffect } from "react";
import { View, Text, Image, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing, cancelAnimation, interpolate, Extrapolation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { useTheme } from "@/context/ThemeContext";
import { R, S, T, type ThemeColors } from "@/constants/theme";

/*
 * Small live previews for screens with no trip yet: what the screen will look like once there is one.
 * Sample content only, faded at the edges so it reads as a preview rather than real plans.
 */

const SAMPLE = [
  { type: "transfer", title: "Airport transfer", sub: "Hotel lobby", time: "09:30" },
  { type: "activity", title: "Old town walking tour", sub: "Meet at the fountain", time: "11:00" },
  { type: "dining", title: "Welcome dinner", sub: "Hotel restaurant", time: "19:30" },
];

/** Today's preview: a sample day with the highlight stepping down it, the way the day unfolds */
export function SampleDayPreview() {
  const { C } = useTheme();
  const current = useSharedValue(0);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % SAMPLE.length;
      current.value = withTiming(i, { duration: 450, easing: Easing.out(Easing.cubic) });
    }, 1600);
    return () => { clearInterval(t); cancelAnimation(current); };
  }, [current]);
  return (
    <View style={styles.dayWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SAMPLE.map((ev, i) => (
        <View key={ev.title} style={[styles.dayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
          <Glow index={i} current={current} C={C} />
          <CategoryDot type={ev.type} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.dayTitle, { color: C.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
            <Text style={[styles.daySub, { color: C.textTertiary }]} numberOfLines={1}>{ev.sub}</Text>
          </View>
          <Text style={[styles.dayTime, { color: C.tealText }]}>{ev.time}</Text>
        </View>
      ))}
      {/* Fades out at the bottom so it reads as a glimpse */}
      <LinearGradient colors={[`${C.bg}00`, C.bg]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
    </View>
  );
}

function Glow({ index, current, C }: { index: number; current: SharedValue<number>; C: ThemeColors }) {
  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(current.value - index), [0, 1], [1, 0], Extrapolation.CLAMP),
  }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: R.md, backgroundColor: C.elevated }, glow]} />;
}

const PHOTOS = [
  require("@/assets/images/tour/holiday-1.jpg"), require("@/assets/images/tour/holiday-2.jpg"),
  require("@/assets/images/tour/holiday-4.jpg"), require("@/assets/images/tour/holiday-5.jpg"),
  require("@/assets/images/tour/holiday-6.jpg"), require("@/assets/images/tour/holiday-3.jpg"),
  require("@/assets/images/tour/holiday-8.jpg"), require("@/assets/images/tour/holiday-10.jpg"),
];
const TILE_W = 92;
const TILE_H = 116;
const GAP = S.xs;

/** Gallery's preview: two rows of holiday photos drifting past in opposite directions */
export function PhotoDriftPreview() {
  const { C } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={{ width, marginLeft: -(S.md + S.xs), gap: GAP, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <DriftRow photos={PHOTOS.slice(0, 4)} reverse={false} />
      <DriftRow photos={PHOTOS.slice(4)} reverse />
      {/* Soft edges left and right */}
      <LinearGradient colors={[C.bg, `${C.bg}00`, `${C.bg}00`, C.bg]} locations={[0, 0.12, 0.88, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
    </View>
  );
}

function DriftRow({ photos, reverse }: { photos: number[]; reverse: boolean }) {
  const span = photos.length * (TILE_W + GAP);
  const x = useSharedValue(reverse ? -span : 0);
  useEffect(() => {
    x.value = reverse ? -span : 0;
    x.value = withRepeat(withTiming(reverse ? 0 : -span, { duration: photos.length * 3600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [x, span, reverse, photos.length]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // Drawn twice so the loop has no seam
  return (
    <Animated.View style={[{ flexDirection: "row", gap: GAP }, drift]}>
      {[...photos, ...photos].map((src, i) => (
        <View key={i} style={styles.tile}>
          <Image source={src} style={{ width: TILE_W, height: TILE_H }} resizeMode="cover" accessible={false} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dayWrap: { alignSelf: "stretch" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm, paddingHorizontal: S.sm },
  dayTitle: { fontSize: T.base, fontWeight: T.medium },
  daySub: { fontSize: T.sm, marginTop: 1 },
  dayTime: { fontSize: T.sm, fontWeight: T.semibold, fontVariant: ["tabular-nums"] },
  tile: { width: TILE_W, height: TILE_H, borderRadius: R.md, overflow: "hidden" },
});
