import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { photoPalette } from "@/components/ui/PhotoBackdrop";
import { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { CachedImage } from "@/components/CachedImage";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "@/context/ThemeContext";
import { destinationFlag } from "@/shared/tripSummary";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { Trip } from "@/shared/types";

/** The trip a code or PIN found: cover photo, name, where and when, who's organising. Used by Join and onboarding. */
const LIQUID_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

/** glass: for onboarding's photo screens, a see-through glass card with the photo palette instead of a solid one */
export function TripPreviewCard({ trip, dates, eyebrow = "Trip found", glass = false }: { trip: Trip; dates: string; eyebrow?: string; glass?: boolean }) {
  const { C: themeC, isDark } = useTheme();
  const C = useMemo(() => (glass ? photoPalette(themeC, isDark) : themeC), [glass, themeC, isDark]);
  const styles = useMemo(() => makeStyles(C, glass), [C, glass]);
  // The photo settles into place as the card rises
  const imgScale = useSharedValue(1.1);
  useEffect(() => { imgScale.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }); }, []);
  const imgStyle = useAnimatedStyle(() => ({ transform: [{ scale: imgScale.value }] }));
  const flag = destinationFlag(trip.destination);
  return (
    <View style={styles.card}>
      {glass ? (
        LIQUID_GLASS
          ? <GlassView glassEffectStyle="regular" colorScheme="dark" style={StyleSheet.absoluteFill} />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.12)" }]} />
      ) : null}
      <View style={styles.photo}>
        <Animated.View style={[StyleSheet.absoluteFill, imgStyle]}>
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.55, 1]} style={{ flex: 1 }} />}
          >
            <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} />
          </MaskedView>
        </Animated.View>
      </View>
      <View style={styles.body}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={2}>{trip.name}</Text>
        {trip.destination ? (
          <Text style={styles.line} numberOfLines={1}>{flag ? `${flag}  ` : ""}{trip.destination}</Text>
        ) : null}
        <Text style={styles.sub} numberOfLines={1}>{dates}</Text>
        {trip.organizer?.name ? (
          <View style={styles.host}>
            <Avatar size={24} uri={trip.organizer.avatar} initials={trip.organizer.name.trim().charAt(0).toUpperCase()} />
            <Text style={styles.sub} numberOfLines={1}>Organised by {trip.organizer.name}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors, glass: boolean) {
  return StyleSheet.create({
    card: glass
      ? { borderRadius: R.xl, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.22)" }
      : { borderRadius: R.xl, overflow: "hidden", backgroundColor: C.card },
    photo: { height: 200, backgroundColor: glass ? "transparent" : C.elevated, overflow: "hidden" },
    body: { paddingHorizontal: S.md, paddingBottom: S.md, marginTop: -S.lg, gap: 3 },
    eyebrow: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText, marginBottom: 2 },
    title: { fontSize: T["2xl"], fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.3 },
    line: { fontSize: T.base, color: C.textSecondary },
    sub: { fontSize: T.sm, color: C.textSecondary },
    host: {
      flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.xs, paddingTop: S.sm,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    },
  });
}
