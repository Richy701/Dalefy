import { Platform, type StyleProp, type ViewStyle } from "react-native";
import { SymbolView } from "expo-symbols";
import { Airplane } from "phosphor-react-native";

/**
 * The plane used everywhere a flight appears: Apple's own SF Symbol on iOS,
 * Phosphor's straight plane (turned to point the same way) elsewhere.
 * Accepts the Phosphor-style props so it can sit in icon maps.
 */
export function PlaneIcon({ size = 18, color, style }: { size?: number; color?: string; weight?: string; style?: StyleProp<ViewStyle> }) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name="airplane"
        size={size}
        tintColor={color}
        weight="semibold"
        style={[{ width: size, height: size }, style]}
      />
    );
  }
  return <Airplane size={size} color={color} weight="fill" style={[{ transform: [{ rotate: "90deg" }] }, style as any]} />;
}
