import { View, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { MaskedView } from "@/components/native/MaskedView";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { darkColors, applyAccentHex, type ThemeColors } from "@/constants/theme";

/*
 * Invites-style photo pages: the cover photo, blurred, fills the whole page, and the sharp photo
 * at the top dissolves into exactly that backdrop. Dark mode darkens the blur and uses white text;
 * light mode frosts it light, so the page keeps the photo's colour but reads as a light page.
 */

const BLUR = 70;
// Just enough zoom to hide the blur's soft edges; more shifts colours away from the sharp photo above
const SCALE = 1.12;
// Dark enough that white text at 0.75 stays above 4.5:1 even over a bright photo
const SHADE = "rgba(8,8,10,0.66)";
// Light mode: a see-through frost so the photo's colour comes through; photoPalette darkens the quieter text to match
const LIGHT_SHADE = "rgba(247,247,249,0.62)";

function BlurredPhoto({ uri, shade = SHADE }: { uri: string; shade?: string }) {
  return (
    <>
      <CachedImage uri={uri} blurRadius={BLUR} transition={0} style={[StyleSheet.absoluteFill, { transform: [{ scale: SCALE }] }]} accessible={false} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: shade }]} />
    </>
  );
}

/** Full-page backdrop; place first inside the screen's root view. `dark={false}` frosts it light for light mode. */
export function PhotoBackdrop({ uri, shade, dark = true }: { uri: string; shade?: string; dark?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BlurredPhoto uri={uri} shade={shade ?? (dark ? SHADE : LIGHT_SHADE)} />
    </View>
  );
}

/**
 * Place inside the hero photo's container (absolute fill, top of the screen) so its bottom melts into the backdrop.
 * Pass the page's scroll offset: the backdrop stays put while the hero scrolls, so the copy here moves back down
 * by the same amount to stay lined up with it, or a seam shows at the hero's bottom edge.
 */
export function PhotoDissolve({ uri, scrollY, shade, dark = true }: { uri: string; scrollY?: SharedValue<number>; shade?: string; dark?: boolean }) {
  const { height } = useWindowDimensions();
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, scrollY?.value ?? 0) }] }));
  return (
    <MaskedView
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      // Light mode takes a long, early fade: a dark photo meeting the light frost over a short distance leaves a grey band.
      // The title then sits on the frost in dark text.
      maskElement={<LinearGradient colors={["transparent", "rgba(0,0,0,0.5)", "#000"]} locations={dark ? [0.55, 0.8, 1] : [0.42, 0.64, 0.86]} style={{ flex: 1 }} />}
    >
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, height }, follow]}>
        <BlurredPhoto uri={uri} shade={shade ?? (dark ? SHADE : LIGHT_SHADE)} />
      </Animated.View>
    </MaskedView>
  );
}

/**
 * The palette for text on a photo backdrop. Onboarding and shared pages stay dark in light mode;
 * the app's own pages pass `followTheme` and get the light palette on a light-frosted backdrop.
 */
export function photoPalette(base: ThemeColors, isDark: boolean, followTheme = false): ThemeColors {
  // Light mode, frosted backdrop: the light palette, with fills that let the photo's colour through
  // The frost lets the photo's colour through, so the quieter text is darker than on a plain page to hold 4.5:1
  if (followTheme && !isDark) return { ...base, elevated: "rgba(255,255,255,0.6)", border: "rgba(0,0,0,0.08)", textSecondary: "#323846", textTertiary: "#343a48", tealText: "#00453b" };
  // Otherwise dark, with the brand accent re-derived for dark backgrounds when the app is in light mode
  const dark = isDark ? base : applyAccentHex(darkColors, base.teal);
  // elevated is the pressed-row fill: a soft lift of the backdrop rather than a solid dark slab
  return { ...dark, elevated: "rgba(255,255,255,0.1)", textSecondary: "rgba(255,255,255,0.82)", textTertiary: "rgba(255,255,255,0.75)", border: "rgba(255,255,255,0.16)" };
}

