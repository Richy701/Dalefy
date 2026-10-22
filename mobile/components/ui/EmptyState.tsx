import { useEffect } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { R, S, T, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import * as Haptics from "@/services/haptics";

// SwiftUI's ContentUnavailableView needs iOS 17
const NATIVE = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 17;

/**
 * The app's one empty state. On iOS 17+ it's Apple's own ContentUnavailableView (the empty state in Mail,
 * Photos and Files) with native buttons under it; elsewhere, the icon on a soft tinted tile, a title, one
 * line and the app's teal button. Pass `symbol` (an SF Symbol) for iOS and `icon` (size 30) for the rest;
 * `tone` picks the fallback tile tint (accent for empty, danger for errors).
 */
export function EmptyState(props: Parameters<typeof FallbackEmptyState>[0] & { symbol?: string }) {
  if (NATIVE && props.symbol) return <NativeEmptyState {...props} symbol={props.symbol} />;
  return <FallbackEmptyState {...props} />;
}

function NativeEmptyState({ symbol, title, message, cta, secondary, compact }: Parameters<typeof FallbackEmptyState>[0] & { symbol: string }) {
  const { C, isDark } = useTheme();
  const { Host, VStack, ContentUnavailableView, Button, Text: SText } = require("@expo/ui/swift-ui");
  const { buttonStyle, controlSize, tint, fixedSize, font, foregroundStyle, padding } = require("@expo/ui/swift-ui/modifiers");
  // fixedSize keeps ContentUnavailableView at its natural height (it would otherwise fill the host),
  // so the host can size to what's in it and the button sits right under the text
  return (
    <Host matchContents={{ vertical: true }} style={{ alignSelf: "stretch" }} colorScheme={isDark ? "dark" : "light"} seedColor={C.teal}>
      <VStack spacing={compact ? 10 : 14} modifiers={[padding({ top: compact ? 8 : 24, bottom: compact ? 8 : 24 })]}>
        <ContentUnavailableView title={title} systemImage={symbol} description={message} modifiers={[fixedSize({ vertical: true })]} />
        {cta ? (
          <Button
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); cta.onPress(); }}
            modifiers={[buttonStyle("borderedProminent"), controlSize("large"), tint(C.teal)]}
          >
            {/* The app's black-on-teal: white on this teal fails contrast */}
            <SText modifiers={[font({ size: 16, weight: "semibold" }), foregroundStyle(C.onAccent)]}>{cta.label}</SText>
          </Button>
        ) : null}
        {secondary ? (
          <Button
            label={secondary.label}
            onPress={() => { Haptics.selectionAsync(); secondary.onPress(); }}
            modifiers={[buttonStyle("borderless"), tint(C.tealText)]}
          />
        ) : null}
      </VStack>
    </Host>
  );
}

function FallbackEmptyState({ icon, title, message, cta, secondary, compact, tone = "accent" }: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  cta?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  compact?: boolean;
  tone?: "accent" | "danger" | "neutral";
}) {
  const { C } = useTheme();
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [drift]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: -3 + drift.value * 6 }] }));
  const tile = tone === "danger" ? C.redDim : tone === "neutral" ? C.elevated : C.tealDim;

  return (
    <View style={{ alignItems: "center", gap: S.xs, paddingVertical: compact ? S.lg : S["2xl"], paddingHorizontal: S.xl }}>
      {icon ? (
        <Animated.View
          style={[{ width: 72, height: 72, borderRadius: R.xl, backgroundColor: tile, alignItems: "center", justifyContent: "center", marginBottom: S.sm }, float]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </Animated.View>
      ) : null}
      <Text accessibilityRole="header" style={{ fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary, textAlign: "center", letterSpacing: -0.3 }}>{title}</Text>
      {message ? (
        <Text style={{ fontSize: T.base, color: C.textSecondary, textAlign: "center", lineHeight: 21, maxWidth: 300 }}>{message}</Text>
      ) : null}
      {cta ? (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); cta.onPress(); }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: S.md, minHeight: 48, paddingHorizontal: S.xl, borderRadius: R.xl, backgroundColor: C.teal,
            alignItems: "center", justifyContent: "center", opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text style={{ fontSize: T.base, fontWeight: T.bold, color: C.onAccent }}>{cta.label}</Text>
        </Pressable>
      ) : null}
      {secondary ? (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); secondary.onPress(); }}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontSize: T.base, fontWeight: T.semibold, color: C.tealText }}>{secondary.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The small, in-a-card version for a section with nothing in it yet (Home's itinerary and photos) */
export function EmptyNote({ icon, title, message, action, palette }: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
  /** The page's colours when it isn't the theme's, e.g. Home's photo page in light mode */
  palette?: ThemeColors;
}) {
  const theme = useTheme();
  const C = palette ?? theme.C;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.md, borderRadius: R.lg, backgroundColor: C.elevated }}>
      <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary }}>{title}</Text>
        <Text style={{ fontSize: T.sm, lineHeight: 18, color: C.textSecondary }}>{message}</Text>
      </View>
      {action ? (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); action.onPress(); }}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: S.md, borderRadius: R.md, backgroundColor: C.teal, justifyContent: "center", opacity: pressed ? 0.9 : 1 })}
        >
          <Text style={{ fontSize: T.sm, fontWeight: T.bold, color: C.onAccent }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
