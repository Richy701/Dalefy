import {
  View, Text, ScrollView, Image, Pressable,
  StyleSheet, TextInput, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Search, Calendar, MapPin, ChevronRight } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, statusColor } from "@/constants/theme";
import type { Trip } from "@/shared/types";

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function UpcomingHero({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const start = new Date(trip.start);
  const end = new Date(trip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const days = daysUntil(trip.start);
  const isActive = days <= 0 && daysUntil(trip.end) >= 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.hero, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <Image source={{ uri: trip.image }} style={StyleSheet.absoluteFillObject} />
      <LinearGradient
        colors={["transparent", "rgba(6,6,8,0.3)", "rgba(6,6,8,0.95)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.heroTop}>
        <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
          <View style={[styles.countDot, { backgroundColor: isActive ? C.teal : C.amber }]} />
          <Text style={[styles.countText, { color: isActive ? C.teal : C.amber }]}>
            {isActive ? "On trip now" : days === 0 ? "Departs today" : `${days} days away`}
          </Text>
        </View>
      </View>

      <View style={styles.heroBottom}>
        {trip.destination && (
          <View style={styles.destRow}>
            <MapPin size={10} color={C.teal} strokeWidth={2} />
            <Text style={styles.heroDest}>{trip.destination}</Text>
          </View>
        )}
        <Text style={styles.heroName} numberOfLines={2}>{trip.name}</Text>
        <View style={styles.heroMeta}>
          <Text style={styles.heroMetaText}>
            {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
          <View style={styles.heroDot} />
          <Text style={styles.heroMetaText}>{nights} nights</Text>
          <View style={styles.heroDot} />
          <Text style={styles.heroMetaText}>{trip.events.length} events</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TripRow({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const start = new Date(trip.start);
  const end = new Date(trip.end);
  const days = daysUntil(trip.start);
  const isPast = daysUntil(trip.end) < 0;
  const sc = statusColor(trip.status);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
    >
      <Image source={{ uri: trip.image }} style={styles.rowThumb} />
      <View style={styles.rowBody}>
        {trip.destination && <Text style={styles.rowDest}>{trip.destination}</Text>}
        <Text style={styles.rowName} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.rowDate}>
          {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </Text>
      </View>
      {!isPast && days > 0 ? (
        <View style={styles.daysBadge}>
          <Text style={styles.daysBadgeNum}>{days}</Text>
          <Text style={styles.daysBadgeLbl}>days</Text>
        </View>
      ) : isPast ? (
        <Text style={styles.pastLabel}>Past</Text>
      ) : (
        <View style={[styles.activePip, { backgroundColor: sc }]} />
      )}
      <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} style={{ marginLeft: 2 }} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips } = useTrips();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const sorted = useMemo(() =>
    [...trips].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [trips]);

  const featured = useMemo(() => {
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    if (active) return active;
    return sorted.find(t => daysUntil(t.start) > 0) ?? sorted[sorted.length - 1];
  }, [sorted]);

  const rest = useMemo(() =>
    sorted.filter(t => t.id !== featured?.id).filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.destination ?? "").toLowerCase().includes(search.toLowerCase())
    ), [sorted, featured, search]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header — no border, integrated into scroll */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>DAF Adventures</Text>
            <Text style={styles.pageTitle}>My Trips</Text>
          </View>
        </View>

        {/* Featured hero */}
        {featured && (
          <>
            <Text style={styles.sectionEyebrow}>
              {daysUntil(featured.start) > 0 ? "Next trip" : daysUntil(featured.end) >= 0 ? "You're travelling now" : "Most recent"}
            </Text>
            <UpcomingHero trip={featured} onPress={() => router.push(`/trip/${featured.id}`)} />
          </>
        )}

        {/* Search */}
        <View style={styles.searchWrap}>
          <Search size={14} color={C.textTertiary} strokeWidth={1.5} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search trips…"
            placeholderTextColor={C.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Other trips */}
        {rest.length > 0 && (
          <View style={styles.listCard}>
            {rest.map((trip, i) => (
              <View key={trip.id}>
                <TripRow trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
                {i < rest.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: S.lg },

    header: {
      paddingHorizontal: S.md, paddingTop: Platform.OS === "android" ? S.md : S.xs, paddingBottom: S.sm,
    },
    brandName: { fontSize: T.xs, fontWeight: T.semibold, color: C.teal, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 },
    pageTitle: { fontSize: T["3xl"], fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.8 },

    sectionEyebrow: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 0.5, textTransform: "uppercase",
      paddingHorizontal: S.md, marginBottom: S.xs, marginTop: S.xs,
    },

    hero: {
      height: 320, marginHorizontal: S.md, borderRadius: R["2xl"], overflow: "hidden",
      backgroundColor: C.elevated,
    },
    heroTop: { padding: S.sm, position: "absolute", top: 0, left: 0 },
    countBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: S.xs, paddingVertical: 5,
      borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    },
    countBadgeActive: { backgroundColor: C.tealDim, borderColor: C.tealMid },
    countDot: { width: 6, height: 6, borderRadius: 3 },
    countText: { fontSize: T.xs, fontWeight: T.semibold, letterSpacing: 0.3 },
    heroBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md, paddingBottom: S.lg },
    destRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 5 },
    heroDest: { fontSize: T.xs, fontWeight: T.semibold, color: C.teal, letterSpacing: 1.2, textTransform: "uppercase" },
    heroName: { fontSize: 26, fontWeight: T.black, color: "#fff", letterSpacing: -0.6, marginBottom: 8, lineHeight: 30 },
    heroMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
    heroMetaText: { fontSize: T.xs + 1, color: "rgba(255,255,255,0.65)", fontWeight: T.medium },
    heroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)" },

    searchWrap: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      backgroundColor: C.card, borderRadius: R.lg,
      paddingHorizontal: S.sm, height: 44,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      marginHorizontal: S.md, marginTop: S.md, marginBottom: S.sm,
    },
    searchInput: { flex: 1, fontSize: T.base, fontWeight: T.regular, color: C.textPrimary },

    listCard: {
      marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.sm },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: S.sm + 48 + S.sm },
    rowThumb: { width: 48, height: 48, borderRadius: R.md },
    rowBody: { flex: 1 },
    rowDest: { fontSize: 10, fontWeight: T.semibold, color: C.teal, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
    rowName: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2, marginBottom: 2 },
    rowDate: { fontSize: T.xs, color: C.textTertiary, fontWeight: T.medium },
    daysBadge: { alignItems: "center", backgroundColor: C.tealDim, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm },
    daysBadgeNum: { fontSize: T.base, fontWeight: T.black, color: C.teal, letterSpacing: -0.3 },
    daysBadgeLbl: { fontSize: 8, fontWeight: T.semibold, color: `${C.teal}99`, letterSpacing: 0.3 },
    pastLabel: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary },
    activePip: { width: 8, height: 8, borderRadius: 4 },
  });
}
