import { useEffect, useMemo, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  FadeInDown, Easing,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay,
} from "react-native-reanimated";
import { R, type ThemeColors } from "@/constants/theme";

// Pieces of Dale's chat shared by the chat screen and the tour's preview of it

const EASE_OUT = Easing.out(Easing.cubic);

/** Writes the answer out a few words at a time, like a reply being typed */
export function StreamedText({ text, style, animate, onDone }: {
  text: string;
  style: StyleProp<TextStyle>;
  animate: boolean;
  onDone: () => void;
}) {
  const parts = useMemo(() => text.split(/(\s+)/), [text]);
  const [shown, setShown] = useState(animate ? 0 : parts.length);
  useEffect(() => {
    if (!animate) return;
    // Short answers go word by word; long ones speed up so none takes much over a second and a half
    const step = Math.max(1, Math.ceil(parts.length / 60));
    const id = setInterval(() => setShown(n => Math.min(n + step, parts.length)), 26);
    return () => clearInterval(id);
  }, [animate, parts.length]);
  const done = shown >= parts.length;
  useEffect(() => { if (animate && done) onDone(); }, [animate, done, onDone]);
  return <Text style={style} selectable accessibilityLabel={text}>{parts.slice(0, shown).join("")}</Text>;
}

/** One typing dot: rises and brightens, then rests, on a shared 900ms beat */
function TypingDot({ color, delay }: { color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const beat = withRepeat(withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 300 }),
    ), -1);
    // Reanimated never starts withDelay(0), so the first dot starts bare
    t.value = delay > 0 ? withDelay(delay, beat) : beat;
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + t.value * 0.65,
    transform: [{ translateY: -4 * t.value }],
  }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }, style]} />;
}

/** The three dots chat apps show while the other side is typing */
export function TypingDots({ C }: { C: ThemeColors }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(220).easing(EASE_OUT)}
      accessible
      accessibilityLabel="Dale is typing"
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5,
        backgroundColor: C.elevated, borderRadius: R.lg,
        paddingHorizontal: 16, paddingTop: 15, paddingBottom: 11,
      }}
    >
      {[0, 150, 300].map(d => <TypingDot key={d} color={C.textSecondary} delay={d} />)}
    </Animated.View>
  );
}
