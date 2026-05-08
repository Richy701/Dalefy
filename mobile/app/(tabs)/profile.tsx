import { View, Text, ScrollView, Pressable, StyleSheet, Switch, RefreshControl, Alert, Linking, Image, Platform, useWindowDimensions } from "react-native";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useHaptic } from "@/hooks/useHaptic";
import {
  User, Moon, Sun, DeviceMobile, Palette, Bell, Shield, CaretRight,
  Vibrate, Pencil, ArrowSquareOut, Info,
  FileText, CalendarCheck, Pulse, ChatCircle, ShareNetwork, FileText as FileCheckIcon,
} from "phosphor-react-native";
import { T, R, S, type ThemeColors } from "@/constants/theme";

import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTrips } from "@/context/TripsContext";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import { useToast } from "@/context/ToastContext";
import { FadeIn } from "@/components/FadeIn";
import { CachedImage } from "@/components/CachedImage";
import { useMemo, useState, useCallback } from "react";

export default function ProfileScreen() {
  const { C, isDark, mode, setMode } = useTheme();
  const { prefs, setPref } = usePreferences();
  const { brand } = useBrand();
  const { trips, reload } = useTrips();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const s = useMemo(() => makeStyles(C), [C]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
    toast("Trips synced");
  }, [reload, toast]);

  const firstName = (prefs.name || "").trim().split(/\s+/)[0] || "";
  const initials = firstName ? firstName[0].toUpperCase() : "";

  // Next upcoming or active trip
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextTrip = useMemo(() => {
    // Check for currently active trip first
    const active = trips.find(t => {
      const start = new Date(t.start + "T00:00:00");
      const end = new Date(t.end + "T00:00:00");
      return start <= today && end >= today;
    });
    if (active) {
      const dest = active.destination || active.name;
      const short = dest.length > 18 ? dest.slice(0, 18).trimEnd() + "…" : dest;
      return `Travelling · ${short}`;
    }
    // Then check upcoming
    const upcoming = trips
      .filter(t => new Date(t.start + "T00:00:00") > today)
      .sort((a, b) => a.start.localeCompare(b.start));
    if (upcoming.length === 0) return null;
    const t = upcoming[0];
    const diff = Math.ceil((new Date(t.start + "T00:00:00").getTime() - today.getTime()) / 86400000);
    const dest = t.destination || t.name;
    const short = dest.length > 18 ? dest.slice(0, 18).trimEnd() + "…" : dest;
    if (diff === 1) return `${short} tomorrow`;
    return `${short} in ${diff} days`;
  }, [trips]);



  const insets = useSafeAreaInsets();

  return (
    <View style={s.safe}>
      {/* ── Sticky blur header ── */}
      <View style={[s.stickyHeader, { paddingTop: insets.top }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)" }]} />
        )}
        <Text style={s.screenTitle}>Profile</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 52 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── Profile hero ── */}
        <FadeIn delay={0}>
        <Pressable
          style={({ pressed }) => [s.heroCard, pressed && { opacity: 0.8 }]}
          onPress={() => { haptic.selection(); router.push("/welcome"); }}
          accessibilityLabel="Edit your name"
        >
          <View style={s.avatar}>
            {prefs.avatar ? (
              <CachedImage uri={prefs.avatar} style={s.avatarImg} blurhash={null} />
            ) : initials ? (
              <Text style={s.avatarText}>{initials}</Text>
            ) : (
              <User size={28} color={C.teal} weight="light" />
            )}
          </View>
          <View style={s.heroText}>
            <Text style={s.heroName}>{firstName || "Traveller"}</Text>
            {nextTrip && <Text style={s.heroSub}>{nextTrip}</Text>}
          </View>
          <Pencil size={16} color={C.textTertiary} weight="light" />
        </Pressable>
        </FadeIn>

        {/* ── Appearance ── */}
        <FadeIn delay={80}>
        <Text style={s.sectionLabel}>Appearance</Text>
        <View style={s.card}>
          {/* Theme */}
          <View style={s.row}>
            <Palette size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Theme</Text>
            <SegmentedControl
              values={["Light", "Dark", "Auto"]}
              selectedIndex={mode === "light" ? 0 : mode === "dark" ? 1 : 2}
              onChange={(e) => {
                const idx = e.nativeEvent.selectedSegmentIndex;
                const val = (["light", "dark", "system"] as const)[idx];
                haptic.selection();
                setMode(val);
              }}
              style={{
                width: 180,
                ...Platform.select({
                  ios: {
                    shadowColor: "#000",
                    shadowOpacity: 0.08,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                  },
                  android: {
                    elevation: 2,
                  },
                }),
              }}
              appearance={isDark ? "dark" : "light"}
            />
          </View>

          <View style={s.divider} />

          {/* Haptics */}
          <View style={s.row}>
            <Vibrate size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Haptic feedback</Text>
            <Switch
              value={prefs.haptics}
              onValueChange={(v) => { haptic.selection(); setPref("haptics", v); }}
              trackColor={{ false: C.toggleTrack, true: C.tealMid }}
              thumbColor={prefs.haptics ? C.teal : C.textTertiary}
            />
          </View>
        </View>
        </FadeIn>

        {/* ── Notifications ── */}
        <FadeIn delay={160}>
        <Text style={s.sectionLabel}>Notifications</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Bell size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Trip reminders</Text>
            <Switch
              value={prefs.tripReminders}
              onValueChange={(v) => { haptic.selection(); setPref("tripReminders", v); }}
              trackColor={{ false: C.toggleTrack, true: C.tealMid }}
              thumbColor={prefs.tripReminders ? C.teal : C.textTertiary}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <CalendarCheck size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Itinerary updates</Text>
            <Switch
              value={prefs.itineraryUpdates}
              onValueChange={(v) => { haptic.selection(); setPref("itineraryUpdates", v); }}
              trackColor={{ false: C.toggleTrack, true: C.tealMid }}
              thumbColor={prefs.itineraryUpdates ? C.teal : C.textTertiary}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Pulse size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Live Activity</Text>
            <Switch
              value={prefs.liveActivity !== false}
              onValueChange={(v) => { haptic.selection(); setPref("liveActivity", v); }}
              trackColor={{ false: C.toggleTrack, true: C.tealMid }}
              thumbColor={prefs.liveActivity !== false ? C.teal : C.textTertiary}
            />
          </View>
        </View>
        </FadeIn>

        {/* ── My Documents ── */}
        <FadeIn delay={240}>
        <Text style={s.sectionLabel}>My Documents</Text>
        <View style={s.card}>
          <View style={s.docsEmpty}>
            <FileText size={24} color={C.textTertiary} weight="light" />
            <Text style={s.docsEmptyTitle}>No documents yet</Text>
            <Text style={s.docsEmptyText}>
              Your travel agency will share documents here when they're ready.
            </Text>
          </View>
        </View>
        </FadeIn>

        {/* ── About ── */}
        <FadeIn delay={320}>
        <Text style={s.sectionLabel}>About</Text>
        <View style={s.card}>
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); Linking.openURL("https://dalefy.vercel.app/support.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Help & support"
          >
            <ChatCircle size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Help & support</Text>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="light" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); Linking.openURL("https://dalefy.vercel.app/privacy.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
          >
            <Shield size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Privacy policy</Text>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="light" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); Linking.openURL("https://dalefy.vercel.app/terms.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Terms of service"
          >
            <FileCheckIcon size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Terms of service</Text>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="light" />
          </Pressable>
          <View style={s.divider} />
          <View style={s.row}>
            <Info size={18} color={C.textSecondary} weight="light" />
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>
        </FadeIn>


        {/* ── Footer ── */}
        <View style={s.footer}>
          {brand.logoUrl ? (
            <Image source={{ uri: brand.logoUrl }} style={{ width: 14, height: 14, borderRadius: 3 }} />
          ) : (
            <Logo size={14} color={C.textDim} />
          )}
          <Text style={s.footerText}>Powered by {brand.name}</Text>
        </View>

      </ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100, paddingHorizontal: S.md },
    stickyHeader: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      overflow: "hidden",
    },
    screenTitle: {
      fontSize: 22, fontWeight: "700",
      color: C.textPrimary,
      paddingHorizontal: S.md, paddingVertical: 10,
    },

    // ── Hero ──
    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      padding: S.lg,
      backgroundColor: C.card,
      borderRadius: R["2xl"],
      marginTop: S.md,
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImg: {
      width: 56,
      height: 56,
      borderRadius: R.full,
    },
    avatarText: {
      fontSize: T.xl,
      fontWeight: T.bold,
      color: C.teal,
    },
    heroText: { flex: 1 },
    heroName: {
      fontSize: T.lg,
      fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.2,
    },
    heroSub: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: C.teal,
      marginTop: 3,
    },

    // ── Sections ──
    sectionLabel: {
      fontSize: T.xs,
      fontWeight: T.semibold,
      color: C.textTertiary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: S.sm,
      marginTop: S.xl,
      paddingLeft: S["2xs"],
    },
    card: {
      backgroundColor: C.card,
      borderRadius: R["2xl"],
      overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
    },

    // ── Rows ──
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: S.md,
      paddingVertical: 14,
      gap: S.sm,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
      marginLeft: S.md + 18 + S.sm,
    },
    rowLabel: {
      flex: 1,
      fontSize: T.base,
      fontWeight: T.medium,
      color: C.textPrimary,
    },
    rowValue: {
      fontSize: T.sm,
      color: C.textTertiary,
      fontWeight: T.medium,
    },

    // ── Theme toggle ──
    themeToggle: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.elevated,
      borderRadius: R.full,
      padding: 3,
      gap: 2,
    },
    themeBtn: {
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 28,
      borderRadius: R.full,
    },
    themeBtnActive: { backgroundColor: C.card },

    // ── Documents empty ──
    docsEmpty: {
      alignItems: "center",
      paddingVertical: S.xl,
      paddingHorizontal: S.md,
      gap: 6,
    },
    docsEmptyTitle: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textSecondary,
      marginTop: 4,
    },
    docsEmptyText: {
      fontSize: T.xs,
      color: C.textTertiary,
      textAlign: "center",
      lineHeight: 17,
    },

    // ── Danger zone ──
    dangerSection: {
      marginTop: S.xl,
      alignItems: "center",
    },
    demoBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: S.md,
      paddingVertical: S.sm,
    },
    demoBtnText: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: C.teal,
    },
    dangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: S.md,
      paddingVertical: S.sm,
    },
    dangerText: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: "#ef4444",
    },

    // ── Footer ──
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: S.xl,
    },
    footerText: {
      fontSize: T.xs,
      color: C.textDim,
      fontWeight: T.medium,
      letterSpacing: 0.3,
    },
  });
}
