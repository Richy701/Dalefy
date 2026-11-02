import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { IconWeight } from "phosphor-react-native";
import { Bed, ForkKnife, MapPin, Van, Car, Train, Bus, Boat, Anchor } from "@/components/ui/OnboardingIcons";
import { useTheme } from "@/context/ThemeContext";
import { categoryTone, type ThemeColors } from "@/constants/theme";
import { PlaneIcon } from "@/components/ui/PlaneIcon";

/** What the category icons take: Phosphor's icons and PlaneIcon (an SF Symbol on iOS) both fit */
export type GlyphIcon = React.ComponentType<{ size?: number; color?: string; weight?: IconWeight; style?: StyleProp<ViewStyle> }>;

const ICONS: Record<string, GlyphIcon> = {
  flight: PlaneIcon, hotel: Bed, dining: ForkKnife, activity: MapPin, transfer: Van,
};
const TRANSFER_ICONS: Record<string, GlyphIcon> = {
  car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor,
};

export function categoryIcon(type: string, transferType?: string): GlyphIcon {
  if (type === "transfer" && transferType && TRANSFER_ICONS[transferType]) return TRANSFER_ICONS[transferType];
  return ICONS[type] ?? MapPin;
}

/**
 * Category circle: soft tint with a solid glyph. This is the only place a glyph
 * is filled, so the circle reads as the category marker everywhere it appears.
 */
export function CategoryDot({ type, transferType, size = 28, base, palette }: {
  type: string;
  transferType?: string;
  size?: number;
  /** Opaque colour under the tint so lines behind the circle don't show through. Defaults to the card colour. */
  base?: string;
  /** Colours to use instead of the theme's, e.g. the dark palette on photo pages in light mode. */
  palette?: ThemeColors;
}) {
  const theme = useTheme();
  const C = palette ?? theme.C;
  const tone = categoryTone(type, C);
  const Icon = categoryIcon(type, transferType);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: base ?? C.card,
        alignItems: "center", justifyContent: "center",
      }}
      accessible={false}
    >
      <View
        style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: tone.bg,
          alignItems: "center", justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line react-hooks/static-components -- Icon comes from categoryIcon's module-level lookup, not a component created in render */}
        <Icon size={Math.round(size * 0.5)} color={tone.fg} weight="fill" />
      </View>
    </View>
  );
}
