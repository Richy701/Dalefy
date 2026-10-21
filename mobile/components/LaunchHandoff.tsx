import { useEffect, useState } from "react";
import { StyleSheet, Platform, AccessibilityInfo } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, Easing, runOnJS,
} from "react-native-reanimated";
import * as Application from "expo-application";

// Same colour and image as the native launch screen, so the takeover is invisible
const SPLASH_BG = "#131316";
const SPLASH_IMAGE = require("../assets/splash-icon.png");
// From these native builds on, the launch screen draws the image at 320pt; earlier ones use the 200pt default
const BIG_SPLASH_FROM = { ios: 71, android: 9 };

function splashImageWidth() {
  const build = Number(Application.nativeBuildVersion ?? 0);
  return build >= (Platform.OS === "ios" ? BIG_SPLASH_FROM.ios : BIG_SPLASH_FROM.android) ? 320 : 200;
}

/** Takes over from the native splash: the D winds back, then shoots forward along its arrow as the app shows through */
export function LaunchHandoff() {
  // Android's system splash sits differently, so it keeps the plain fade
  const [done, setDone] = useState(Platform.OS !== "ios");
  const nudge = useSharedValue(0);
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (done) return;
    let cancelled = false;
    const finish = () => setDone(true);
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (cancelled) return;
      if (reduce) {
        fade.value = withDelay(80, withTiming(0, { duration: 220 }, f => { if (f) runOnJS(finish)(); }));
        return;
      }
      nudge.value = withDelay(80, withSequence(
        withTiming(-6, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(30, { duration: 380, easing: Easing.in(Easing.cubic) }),
      ));
      scale.value = withDelay(230, withTiming(2.2, { duration: 380, easing: Easing.in(Easing.cubic) }));
      fade.value = withDelay(340, withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) }, f => { if (f) runOnJS(finish)(); }));
    }).catch(finish);
    return () => { cancelled = true; };
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const markStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }, { scale: scale.value }] }));

  if (done) return null;
  const size = splashImageWidth();
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} accessible={false}>
      <Animated.Image source={SPLASH_IMAGE} style={[{ width: size, height: size }, markStyle]} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: SPLASH_BG, alignItems: "center", justifyContent: "center", zIndex: 1000 },
});
