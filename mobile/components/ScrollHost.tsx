import { Platform, View, type ViewProps } from "react-native";
import type { ReactNode } from "react";

/**
 * Tells the native tab bar which ScrollView drives it (iOS 26 minimise-on-scroll,
 * bottom inset). Plain View elsewhere.
 */
let Marker: React.ComponentType<{ children: ReactNode; style?: ViewProps["style"] }> | null = null;
if (Platform.OS === "ios") {
  try {
    Marker = require("react-native-screens/experimental").ScrollViewMarker ?? null;
  } catch {
    Marker = null;
  }
}

export function ScrollHost({ children }: { children: ReactNode }) {
  if (Marker) return <Marker style={{ flex: 1 }}>{children}</Marker>;
  return <View style={{ flex: 1 }}>{children}</View>;
}
