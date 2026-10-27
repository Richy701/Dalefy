import { useEffect, useRef, useState } from "react";
import { AppState, View, Image, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, useReducedMotion, withRepeat, withTiming, type SharedValue,
} from "react-native-reanimated";

/**
 * Full-screen photos of people on holiday, sized to the screen (Unsplash, free licence). Trip covers can't
 * fill a portrait screen: they're landscape banners (about 1200 x 627), so they'd stretch about 4x.
 */
export const HERO_PHOTOS = [
  require("@/assets/images/tour/hero-1.jpg"), require("@/assets/images/tour/hero-2.jpg"),
  require("@/assets/images/tour/hero-3.jpg"), require("@/assets/images/tour/hero-4.jpg"),
];

/** Each photo holds for a few seconds, then the next fades in over it, all slowly pushing in */
export function HeroSlideshow({ active = true }: { active?: boolean }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  const zoom = useSharedValue(1);
  // step counts up by one per photo; between whole numbers the next photo is part way through fading in
  const step = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!active || !foreground || reduceMotion) return;
    zoom.value = withRepeat(withTiming(1.08, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true);
    timer.current = setInterval(() => {
      step.value = withTiming(Math.round(step.value) + 1, { duration: 1400, easing: Easing.inOut(Easing.quad) });
    }, 5200);
    return () => {
      cancelAnimation(zoom);
      cancelAnimation(step);
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [active, foreground, reduceMotion, zoom, step]);
  const kenBurns = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, kenBurns]}>
        {HERO_PHOTOS.map((src, i) => <HeroLayer key={i} index={i} step={step} source={src} width={width} height={height} />)}
      </Animated.View>
    </View>
  );
}

function HeroLayer({ index, step, source, width, height }: { index: number; step: SharedValue<number>; source: number; width: number; height: number }) {
  const n = HERO_PHOTOS.length;
  const style = useAnimatedStyle(() => {
    const base = Math.floor(step.value);
    const frac = step.value - base;
    const shown = ((base % n) + n) % n;
    const next = (shown + 1) % n;
    const opacity = index === shown ? 1 : index === next ? frac : 0;
    return { opacity, zIndex: index === next ? 2 : index === shown ? 1 : 0 };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} resizeMode="cover" style={{ width, height }} accessible={false} />
    </Animated.View>
  );
}

/**
 * The background for the steps after the first screen (email, link sent, "Got a code?"): one hero photo,
 * blurred and darkened, so the flow reads as one piece. The balloons photo keeps its pink and teal sky when
 * blurred, where the others turn grey. Pages on it use the dark photo palette and a light status bar.
 */
export function BlurredHero() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={HERO_PHOTOS[1]} style={StyleSheet.absoluteFill} blurRadius={24} resizeMode="cover" accessible={false} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(6,6,8,0.5)" }]} />
    </View>
  );
}
