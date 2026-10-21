import { useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
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
export function TripPreviewCard({ trip, dates, eyebrow = "Trip found" }: { trip: Trip; dates: string; eyebrow?: string }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  // The photo settles into place as the card rises
  const imgScale = useSharedValue(1.1);
  useEffect(() => { imgScale.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }); }, []);
  const imgStyle = useAnimatedStyle(() => ({ transform: [{ scale: imgScale.value }] }));
  const flag = destinationFlag(trip.destination);
  return (
    <View style={styles.card}>
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

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: { borderRadius: R.xl, overflow: "hidden", backgroundColor: C.card },
    photo: { height: 200, backgroundColor: C.elevated, overflow: "hidden" },
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
