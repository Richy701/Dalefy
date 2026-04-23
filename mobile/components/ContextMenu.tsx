import { View } from "react-native";

// Always use passthrough — native context menus only work in dev builds, not Expo Go.
// The real module will be enabled once we have a native build.
export default function ContextMenu(props: any) {
  return <View>{props.children}</View>;
}
