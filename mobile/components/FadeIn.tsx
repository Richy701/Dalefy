import { View, type ViewStyle, type StyleProp } from "react-native";

interface FadeInProps {
  /** Retained for existing callers; section entrances no longer delay visibility. */
  delay?: number;
  /** Retained for existing callers; sections render in their final position. */
  slideUp?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Keep section content visible from its first native commit.
 * Animated initial opacity could remain hidden during startup or tab reattachment,
 * even with a completion callback and timer fallback. This wrapper deliberately
 * has no animation state, worklet, or timer that content must wait for.
 */
export function FadeIn({ style, children }: FadeInProps) {
  return <View style={style}>{children}</View>;
}
