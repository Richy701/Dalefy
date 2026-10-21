import { View, Text, Pressable } from "react-native";
import { R, S, T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "@/services/haptics";

/**
 * The app's one empty-state layout: tinted icon circle, title, message,
 * optional CTA pill. Replaces the six per-screen variants.
 */
export function EmptyState({ icon, title, message, cta, compact }: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  cta?: { label: string; onPress: () => void };
  compact?: boolean;
}) {
  const { C } = useTheme();
  // Apple's empty-screen shape: a bare symbol, a plain title, one line, and a text action
  return (
    <View style={{ alignItems: "center", gap: S.xs, paddingVertical: compact ? S.lg : S["2xl"], paddingHorizontal: S.xl }}>
      {icon ? <View style={{ marginBottom: S.xs }}>{icon}</View> : null}
      <Text style={{ fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary, textAlign: "center" }}>{title}</Text>
      {message && (
        <Text style={{ fontSize: T.base, color: C.textSecondary, textAlign: "center", lineHeight: 21 }}>{message}</Text>
      )}
      {cta && (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); cta.onPress(); }}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontSize: T.base, fontWeight: T.semibold, color: C.tealText }}>{cta.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
