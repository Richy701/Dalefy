import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/context/ThemeContext";

/** A photo resolves into the page itself, with no blurred second crop beneath it. */
export function CoverFade() {
  const { C } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Keep the top controls legible without darkening the bottom of the cover. */}
      <LinearGradient
        colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0)"]}
        locations={[0, 0.4]}
        style={StyleSheet.absoluteFill}
      />
      {/* Same RGB at every stop avoids a grey/black fringe in the light theme.
          The eased opacity reaches the exact page colour before the image edge. */}
      <LinearGradient
        colors={[
          `${C.bg}00`, `${C.bg}00`, `${C.bg}0a`, `${C.bg}2b`,
          `${C.bg}66`, `${C.bg}b3`, `${C.bg}eb`, C.bg, C.bg,
        ]}
        locations={[0, 0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
