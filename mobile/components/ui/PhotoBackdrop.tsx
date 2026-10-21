import { View, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { darkColors, applyAccentHex, type ThemeColors } from "@/constants/theme";

/*
 * Invites-style photo pages: the cover photo, blurred and darkened, fills the whole page,
 * and the sharp photo at the top dissolves into exactly that backdrop. Pages that use it
 * always take the dark palette, with white-at-partial-strength secondary text.
 */

const BLUR = 70;
const SCALE = 1.3;
// Dark enough that white text at 0.75 stays above 4.5:1 even over a bright photo
const SHADE = "rgba(8,8,10,0.66)";

function BlurredPhoto({ uri }: { uri: string }) {
  return (
    <>
      <CachedImage uri={uri} blurRadius={BLUR} transition={0} style={[StyleSheet.absoluteFill, { transform: [{ scale: SCALE }] }]} accessible={false} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: SHADE }]} />
    </>
  );
}

/** Full-page backdrop; place first inside the screen's root view. */
export function PhotoBackdrop({ uri }: { uri: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BlurredPhoto uri={uri} />
    </View>
  );
}

/**
 * Place inside the hero photo's container (absolute fill, top of the screen) so its bottom melts into the backdrop.
 * Pass the page's scroll offset: the backdrop stays put while the hero scrolls, so the copy here moves back down
 * by the same amount to stay lined up with it, or a seam shows at the hero's bottom edge.
 */
export function PhotoDissolve({ uri, scrollY }: { uri: string; scrollY?: SharedValue<number> }) {
  const { height } = useWindowDimensions();
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, scrollY?.value ?? 0) }] }));
  return (
    <MaskedView
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      maskElement={<LinearGradient colors={["transparent", "rgba(0,0,0,0.55)", "#000"]} locations={[0.4, 0.72, 0.97]} style={{ flex: 1 }} />}
    >
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, height }, follow]}>
        <BlurredPhoto uri={uri} />
      </Animated.View>
    </MaskedView>
  );
}

/** The palette for text on a photo backdrop. */
export function photoPalette(base: ThemeColors, isDark: boolean): ThemeColors {
  // Light mode still gets the dark palette here, with the brand accent re-derived for dark backgrounds
  const dark = isDark ? base : applyAccentHex(darkColors, base.teal);
  return { ...dark, textSecondary: "rgba(255,255,255,0.82)", textTertiary: "rgba(255,255,255,0.75)", border: "rgba(255,255,255,0.16)" };
}

