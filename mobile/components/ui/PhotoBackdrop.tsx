import { View, StyleSheet, useWindowDimensions } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { darkColors, type ThemeColors } from "@/constants/theme";

/*
 * Invites-style photo pages: the cover photo, blurred and darkened, fills the whole page,
 * and the sharp photo at the top dissolves into exactly that backdrop. Pages that use it
 * always take the dark palette, with white-at-partial-strength secondary text.
 */

const BLUR = 70;
const SCALE = 1.3;
const SHADE = "rgba(8,8,10,0.58)";

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

/** Place inside the hero photo's container (absolute fill, top of the screen) so its bottom melts into the backdrop. */
export function PhotoDissolve({ uri }: { uri: string }) {
  const { height } = useWindowDimensions();
  return (
    <MaskedView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      maskElement={<LinearGradient colors={["transparent", "rgba(0,0,0,0.55)", "#000"]} locations={[0.4, 0.72, 0.97]} style={{ flex: 1 }} />}
    >
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height }}>
        <BlurredPhoto uri={uri} />
      </View>
    </MaskedView>
  );
}

/** The palette for text on a photo backdrop. */
export function photoPalette(base: ThemeColors, isDark: boolean): ThemeColors {
  const dark = isDark ? base : { ...darkColors, teal: base.teal, tealText: darkColors.tealText };
  return { ...dark, textSecondary: "rgba(255,255,255,0.8)", textTertiary: "rgba(255,255,255,0.66)", border: "rgba(255,255,255,0.16)" };
}

