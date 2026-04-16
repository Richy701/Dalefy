import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Settings, MapPin, CalendarDays, Compass, Globe, User,
  ChevronRight, Moon, Sun,
} from "lucide-react-native";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { useMemo } from "react";

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function ProfileScreen() {
  const router = useRouter();
  const { C, isDark, toggle } = useTheme();
  const { trips } = useTrips();
  const styles = useMemo(() => makeStyles(C), [C]);

  const stats = useMemo(() => {
    const destinations = new Set(trips.map(t => t.destination ?? t.name)).size;
    const upcoming = trips.filter(t => daysUntil(t.start) > 0).length;
    const totalDays = trips.reduce((s, t) => {
      const d = Math.ceil((new Date(t.end).getTime() - new Date(t.start).getTime()) / 86400000);
      return s + Math.max(1, d);
    }, 0);
    return { destinations, upcoming, totalDays };
  }, [trips]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>DAF Adventures</Text>
            <Text style={styles.pageTitle}>My Profile</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.settingsBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { Haptics.selectionAsync(); router.push("/settings"); }}
          >
            <Settings size={16} color={C.textSecondary} strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* ── Avatar card ── */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <User size={32} color={C.teal} strokeWidth={1.5} />
          </View>
          <Text style={styles.avatarName}>Traveller</Text>
          <Text style={styles.avatarSub}>DAF Adventures Member</Text>
        </View>

        {/* ── Stats grid ── */}
        <View style={styles.statsGrid}>
          {[
            { value: trips.length, label: "TRIPS", Icon: Compass },
            { value: stats.destinations, label: "DESTINATIONS", Icon: Globe },
            { value: stats.totalDays, label: "TRAVEL DAYS", Icon: CalendarDays },
            { value: stats.upcoming, label: "UPCOMING", Icon: MapPin },
          ].map(item => (
            <View key={item.label} style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <item.Icon size={15} color={C.teal} strokeWidth={1.8} />
              </View>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick settings ── */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.menuCard}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { Haptics.selectionAsync(); toggle(); }}
          >
            <View style={[styles.menuIcon, { backgroundColor: C.tealDim }]}>
              {isDark
                ? <Moon size={15} color={C.teal} strokeWidth={1.8} />
                : <Sun size={15} color={C.teal} strokeWidth={1.8} />}
            </View>
            <Text style={styles.menuLabel}>Appearance</Text>
            <Text style={styles.menuValue}>{isDark ? "Dark" : "Light"}</Text>
            <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { Haptics.selectionAsync(); router.push("/settings"); }}
          >
            <View style={[styles.menuIcon, { backgroundColor: C.elevated }]}>
              <Settings size={15} color={C.textSecondary} strokeWidth={1.8} />
            </View>
            <Text style={styles.menuLabel}>Settings</Text>
            <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
          </Pressable>
        </View>

        <Text style={styles.version}>DAF Adventures · v1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },

    header: {
      flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
      paddingHorizontal: S.md,
      paddingTop: Platform.OS === "android" ? S.md : S.xs,
      paddingBottom: S.sm,
    },
    brandName: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 2,
    },
    pageTitle: {
      fontSize: T["3xl"] + 2, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
    },
    settingsBtn: {
      width: 38, height: 38, borderRadius: R.full,
      backgroundColor: C.card, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginTop: 4,
    },

    avatarCard: {
      alignItems: "center", marginHorizontal: S.md, marginTop: S.sm,
      backgroundColor: C.card, borderRadius: R["2xl"],
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      paddingVertical: S.xl, paddingHorizontal: S.md,
    },
    avatarCircle: {
      width: 72, height: 72, borderRadius: R.full,
      backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: C.tealMid, marginBottom: S.sm,
    },
    avatarName: {
      fontSize: T.xl, fontFamily: F.black, fontWeight: T.black, color: C.textPrimary,
      letterSpacing: -0.3, marginBottom: 4,
    },
    avatarSub: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary,
    },

    statsGrid: {
      flexDirection: "row", flexWrap: "wrap", gap: S.sm,
      paddingHorizontal: S.md, marginTop: S.md,
    },
    statCard: {
      width: "47%", backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      padding: S.md, alignItems: "flex-start", flexGrow: 1,
    },
    statIconWrap: {
      width: 32, height: 32, borderRadius: R.md,
      backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
      marginBottom: S.xs,
    },
    statValue: {
      fontSize: T["2xl"] + 2, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5, marginBottom: 2,
    },
    statLabel: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 1, textTransform: "uppercase",
    },

    sectionLabel: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 1, textTransform: "uppercase",
      paddingHorizontal: S.md, marginTop: S.lg, marginBottom: S.xs,
    },
    menuCard: {
      marginHorizontal: S.md, backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden",
    },
    menuRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.sm, paddingVertical: 14,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.sm + 34 + S.sm,
    },
    menuIcon: {
      width: 34, height: 34, borderRadius: R.md,
      alignItems: "center", justifyContent: "center",
    },
    menuLabel: {
      flex: 1, fontSize: T.base, fontWeight: T.medium, color: C.textPrimary,
    },
    menuValue: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary,
    },

    version: {
      fontSize: T.sm, color: C.textTertiary, textAlign: "center",
      marginTop: S.xl, fontWeight: T.medium,
    },
  });
}
