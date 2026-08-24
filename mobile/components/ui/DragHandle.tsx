import { View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

/** Sheet drag handle: 36×4, radius 2, border color. One of these, not four. */
export function DragHandle() {
  const { C } = useTheme();
  return (
    <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginVertical: 8 }} />
  );
}
