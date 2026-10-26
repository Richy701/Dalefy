import { useEffect } from "react";
import { Pressable, Dimensions } from "react-native";
import Animated, {
  Easing, cancelAnimation, interpolateColor, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { S, type ThemeColors } from "@/constants/theme";

/**
 * One cell of the six-character trip PIN, shared by the Join sheet and onboarding. Pass `styles` with
 * pinCell, pinCellText and pinCaret (sized from PIN_W) and the palette the cells sit on.
 */
export const PIN_LEN = 6;
const PIN_GAP = S.xs;
export const PIN_W = Math.min(54, Math.floor((Dimensions.get("window").width - S.lg * 2 - PIN_GAP * (PIN_LEN - 1)) / PIN_LEN));
// Reanimated 4.5.1 never starts withDelay(0), so the first cell runs undelayed
const after = (ms: number, anim: any) => (ms > 0 ? withDelay(ms, anim) : anim);

export function PinCell({ ch, index, active, resolving, lit, C, styles, onPress }: {
  ch: string; index: number; active: boolean; resolving: boolean; lit: boolean;
  C: ThemeColors; styles: any; onPress: () => void;
}) {
  const pop = useSharedValue(ch ? 1 : 0);
  const caret = useSharedValue(0);
  const lift = useSharedValue(0);
  const glow = useSharedValue(0);

  // Each character springs into its cell as it's typed
  useEffect(() => {
    pop.value = ch ? withSequence(withTiming(0, { duration: 0 }), withSpring(1, { damping: 13, stiffness: 280, mass: 0.5 })) : 0;
  }, [ch]);

  // A soft breathing caret in the cell you're typing into
  useEffect(() => {
    if (active) caret.value = withRepeat(withTiming(1, { duration: 560, easing: Easing.inOut(Easing.ease) }), -1, true);
    else { cancelAnimation(caret); caret.value = 0; }
  }, [active]);

  // While we look the PIN up, the cells ripple left to right
  useEffect(() => {
    if (resolving) {
      lift.value = after(index * 70, withRepeat(withSequence(
        withTiming(-5, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      ), -1));
    } else {
      cancelAnimation(lift);
      lift.value = withTiming(0, { duration: 160 });
    }
  }, [resolving]);

  // Trip found: the cells light up one after another
  useEffect(() => {
    glow.value = lit ? after(index * 45, withTiming(1, { duration: 220 })) : withTiming(0, { duration: 160 });
  }, [lit]);

  const restBorder = active ? C.teal : C.border;
  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
    backgroundColor: interpolateColor(glow.value, [0, 1], [C.fieldFill, C.tealDim]),
    borderColor: interpolateColor(glow.value, [0, 1], [restBorder, C.teal]),
  }));
  const charStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ translateY: (1 - pop.value) * 6 }, { scale: 0.6 + 0.4 * pop.value }],
  }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * caret.value }));

  return (
    <Pressable onPress={onPress} accessible={false}>
      <Animated.View style={[styles.pinCell, cellStyle]}>
        {ch ? (
          <Animated.Text style={[styles.pinCellText, charStyle]}>{ch}</Animated.Text>
        ) : active ? (
          <Animated.View style={[styles.pinCaret, caretStyle]} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
