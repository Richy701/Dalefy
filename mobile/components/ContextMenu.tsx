import React from "react";
import { View } from "react-native";

// react-native-context-menu-view requires a dev client build — it crashes in
// Expo Go because the native view isn't registered.  Until we switch to a dev
// client, just render children directly so the rest of the app works fine.
export default function ContextMenu({ children }: any) {
  return <View>{children}</View>;
}
