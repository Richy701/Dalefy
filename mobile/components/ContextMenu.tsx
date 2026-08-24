import React from "react";
import { View } from "react-native";
import type { ContextMenuProps } from "react-native-context-menu-view";

// Native iOS/Android context menu (long-press). Falls back to rendering
// children directly if the native view is unavailable (e.g. Expo Go).
let NativeContextMenu: React.ComponentType<ContextMenuProps> | null = null;
try {
  NativeContextMenu = require("react-native-context-menu-view").default;
} catch { /* native module not registered */ }

export default function ContextMenu(props: ContextMenuProps) {
  if (NativeContextMenu) return <NativeContextMenu {...props} />;
  return <View>{props.children}</View>;
}
