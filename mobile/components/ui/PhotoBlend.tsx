import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { MaskedView } from "@/components/native/MaskedView";
import { LinearGradient } from "expo-linear-gradient";

/** Fade the sharp cover and its shading together into the coloured wash. */
export function PhotoBlend({ children }: { children: ReactNode }) {
  return (
    <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.6, 1]} style={{ flex: 1 }} />}>
      {children}
      <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.25)"]} locations={[0, 0.25, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
    </MaskedView>
  );
}
