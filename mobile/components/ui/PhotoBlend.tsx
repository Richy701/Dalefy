import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { useTheme } from "@/context/ThemeContext";

/** The cover's colours continue beneath the content before reaching the page colour. */
export function PhotoWash({ uri, heroHeight }: { uri: string; heroHeight: number }) {
  const { C, isDark } = useTheme();
  const height = heroHeight + 300;
  const fadeStops = [0, heroHeight * 0.6 / height, heroHeight * 0.84 / height, (heroHeight + 50) / height, (heroHeight + 150) / height, (heroHeight + 240) / height, 1] as const;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: 0, left: 0, right: 0, height }}>
      <CachedImage uri={uri} blurRadius={90} style={StyleSheet.absoluteFill} transition={0} />
      {isDark && <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.25)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />}
      <LinearGradient
        colors={isDark
          ? [`${C.bg}00`, `${C.bg}00`, `${C.bg}1a`, `${C.bg}66`, `${C.bg}b3`, `${C.bg}eb`, C.bg]
          : [`${C.bg}00`, `${C.bg}00`, `${C.bg}a6`, `${C.bg}b8`, `${C.bg}e6`, `${C.bg}fa`, C.bg]}
        locations={fadeStops}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Fade the sharp cover and its shading together into the coloured wash. */
export function PhotoBlend({ children }: { children: ReactNode }) {
  return (
    <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.6, 1]} style={{ flex: 1 }} />}>
      {children}
      <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.25)"]} locations={[0, 0.25, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
    </MaskedView>
  );
}
