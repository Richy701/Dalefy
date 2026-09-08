import { View } from "react-native";
import { AirplaneTilt, Bed, ForkKnife, MapPin, Van, Car, Train, Bus, Boat, Anchor } from "phosphor-react-native";
import { useTheme } from "@/context/ThemeContext";
import { categoryTone } from "@/constants/theme";

const ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, hotel: Bed, dining: ForkKnife, activity: MapPin, transfer: Van,
};
const TRANSFER_ICONS: Record<string, React.ComponentType<any>> = {
  car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor,
};

export function categoryIcon(type: string, transferType?: string): React.ComponentType<any> {
  if (type === "transfer" && transferType && TRANSFER_ICONS[transferType]) return TRANSFER_ICONS[transferType];
  return ICONS[type] ?? MapPin;
}

/**
 * Category circle: soft tint with a solid glyph. This is the only place a glyph
 * is filled, so the circle reads as the category marker everywhere it appears.
 */
export function CategoryDot({ type, transferType, size = 28 }: {
  type: string;
  transferType?: string;
  size?: number;
}) {
  const { C } = useTheme();
  const tone = categoryTone(type, C);
  const Icon = categoryIcon(type, transferType);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: tone.bg,
        alignItems: "center", justifyContent: "center",
      }}
      accessible={false}
    >
      <Icon size={Math.round(size * 0.5)} color={tone.fg} weight="fill" />
    </View>
  );
}
