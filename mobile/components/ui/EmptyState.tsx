import { View, Text, Pressable } from "react-native";
import { R, S, T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

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
  return (
    <View style={{ alignItems: "center", gap: S.sm, paddingVertical: compact ? S.lg : S["2xl"], paddingHorizontal: S.xl }}>
      {icon && (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: C.tealDim,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: S["2xs"],
          }}
        >
          {icon}
        </View>
      )}
      <Text style={{ fontSize: T.lg, fontWeight: T.bold, color: C.textPrimary, textAlign: "center" }}>{title}</Text>
      {message && (
        <Text style={{ fontSize: T.sm, color: C.textTertiary, textAlign: "center", lineHeight: 18 }}>{message}</Text>
      )}
      {cta && (
        <Pressable
          onPress={cta.onPress}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: C.teal,
            borderRadius: R.xl,
            paddingHorizontal: S.lg,
            paddingVertical: S.sm2,
            marginTop: S.xs,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: T.base, fontWeight: T.bold, color: C.onAccent }}>{cta.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
