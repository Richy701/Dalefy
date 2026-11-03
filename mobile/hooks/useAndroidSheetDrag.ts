import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { cancelAnimation, runOnJS, scrollTo, useAnimatedReaction, useSharedValue, withDecay, type AnimatedRef, type SharedValue } from "react-native-reanimated";
import type Animated from "react-native-reanimated";

const PULL_TO_REFRESH = 90;

/**
 * Android's ScrollView ignores drags while it has pointerEvents="box-none" (ReactScrollView.onTouchEvent), and the
 * Today page needs box-none so touches above the sheet reach the map. So on Android the sheet drives the scroll
 * itself: this pan scrolls the page, flings it on release, and stands in for pull to refresh at the top.
 */
export function useAndroidSheetDrag(ref: AnimatedRef<Animated.ScrollView>, scrollY: SharedValue<number>, onRefresh: () => void) {
  const y = useSharedValue(0);
  const startY = useSharedValue(0);
  const contentH = useSharedValue(0);
  const viewH = useSharedValue(0);

  useAnimatedReaction(() => y.value, (next, prev) => {
    if (prev !== null && next !== prev) scrollTo(ref, 0, next, false);
  });

  const gesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-10, 10])
    // Sideways drags stay with the photo strips inside the sheet
    .failOffsetX([-12, 12])
    .onBegin(() => { cancelAnimation(y); })
    .onStart(() => { startY.value = scrollY.value; y.value = scrollY.value; })
    .onUpdate(e => {
      const max = Math.max(0, contentH.value - viewH.value);
      y.value = Math.min(max, Math.max(0, startY.value - e.translationY));
    })
    .onEnd(e => {
      if (startY.value <= 0 && e.translationY > PULL_TO_REFRESH) runOnJS(onRefresh)();
      const max = Math.max(0, contentH.value - viewH.value);
      y.value = withDecay({ velocity: -e.velocityY, deceleration: 0.998, clamp: [0, max] });
    }), [contentH, onRefresh, scrollY, startY, viewH, y]);

  return { gesture, contentH, viewH };
}
