import { View, Text, ScrollView, Pressable, StyleSheet, Switch, RefreshControl, Alert, Linking, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useHaptic } from "@/hooks/useHaptic";
import {
  User, Moon, Sun, Smartphone, Palette, Bell, Shield, ChevronRight,
  Droplet, Vibrate, Trash2, Pencil, ExternalLink, Info,
  FileText, Download,
} from "lucide-react-native";
import { T, R, S, ACCENT_PALETTE, type ThemeColors } from "@/constants/theme";
import { INITIAL_TRIPS } from "@/shared/trips";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTrips } from "@/context/TripsContext";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import { useToast } from "@/context/ToastContext";
import { FadeIn } from "@/components/FadeIn";
import { useMemo, useState, useCallback } from "react";

export default function ProfileScreen() {
  const { C, isDark, mode, setMode } = useTheme();
  const { prefs, setPref } = usePreferences();
  const { brand } = useBrand();
  const { trips, clearTrips, addTrip, reload } = useTrips();
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

  // Next upcoming trip
  const now = new Date();
  const nextTrip = useMemo(() => {
    const upcoming = trips
      .filter(t => new Date(t.start + "T00:00:00") >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort((a, b) => a.start.localeCompare(b.start));
    if (upcoming.length === 0) return null;
    const t = upcoming[0];
    const diff = Math.ceil((new Date(t.start + "T00:00:00").getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
    const dest = t.destination || t.name;
    const short = dest.length > 18 ? dest.slice(0, 18).trimEnd() + "…" : dest;
    if (diff === 0) return `${short} is today`;
    if (diff === 1) return `${short} tomorrow`;
    return `${short} in ${diff} days`;
  }, [trips]);

  const handleClearTrips = () => {
    if (trips.length === 0) return;
    Alert.alert(
      "Clear all trips?",
      `This will remove ${trips.length} trip${trips.length === 1 ? "" : "s"} from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            haptic.warning();
            clearTrips();
            toast("All trips cleared");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
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
              <Image source={{ uri: prefs.avatar }} style={s.avatarImg} />
            ) : initials ? (
              <Text style={s.avatarText}>{initials}</Text>
            ) : (
              <User size={28} color={C.teal} strokeWidth={1.5} />
            )}
          </View>
          <View style={s.heroText}>
            <Text style={s.heroName}>{firstName || "Traveller"}</Text>
            {nextTrip && <Text style={s.heroSub}>{nextTrip}</Text>}
          </View>
          <Pencil size={16} color={C.textTertiary} strokeWidth={1.5} />
        </Pressable>
        </FadeIn>

        {/* ── Appearance ── */}
        <FadeIn delay={80}>
        <Text style={s.sectionLabel}>Appearance</Text>
        <View style={s.card}>
          {/* Theme */}
          <View style={s.row}>
            <Palette size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Theme</Text>
            <View style={s.themeToggle}>
              {([
                { key: "light" as const, icon: Sun, label: "Light" },
                { key: "dark" as const, icon: Moon, label: "Dark" },
                { key: "system" as const, icon: Smartphone, label: "Auto" },
              ]).map(({ key, icon: Ic, label }) => {
                const active = mode === key;
                return (
                  <Pressable
                    key={key}
                    style={[s.themeBtn, active && s.themeBtnActive]}
                    onPress={() => { if (!active) { haptic.selection(); setMode(key); } }}
                    accessibilityRole="radio"
                    accessibilityLabel={`${label} theme`}
                    accessibilityState={{ checked: active }}
                  >
                    <Ic size={14} color={active ? C.teal : C.textTertiary} strokeWidth={1.8} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={s.divider} />

          {/* Accent color */}
          <View style={s.row}>
            <Droplet size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Accent</Text>
            <View style={s.swatches}>
              {ACCENT_PALETTE.map((p) => {
                const selected = prefs.accent === p.id;
                const hex = isDark ? p.dark : p.light;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityLabel={p.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => { haptic.selection(); setPref("accent", p.id); }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={[s.swatchBtn, selected && { borderColor: hex }]}
                  >
                    <View style={[s.swatchDot, { backgroundColor: hex }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={s.divider} />

          {/* Haptics */}
          <View style={s.row}>
            <Vibrate size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Haptic feedback</Text>
            <Switch
              value={prefs.haptics}
              onValueChange={(v) => { haptic.selection(); setPref("haptics", v); }}
              trackColor={{ false: C.elevated, true: C.tealMid }}
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
            <Bell size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Trip reminders</Text>
            <Switch
              value={prefs.tripReminders}
              onValueChange={(v) => { haptic.selection(); setPref("tripReminders", v); }}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.tripReminders ? C.teal : C.textTertiary}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Bell size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Itinerary updates</Text>
            <Switch
              value={prefs.itineraryUpdates}
              onValueChange={(v) => { haptic.selection(); setPref("itineraryUpdates", v); }}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.itineraryUpdates ? C.teal : C.textTertiary}
            />
          </View>
        </View>
        </FadeIn>

        {/* ── My Documents ── */}
        <FadeIn delay={240}>
        <Text style={s.sectionLabel}>My Documents</Text>
        <View style={s.card}>
          <View style={s.docsEmpty}>
            <FileText size={24} color={C.textTertiary} strokeWidth={1.5} />
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
            onPress={() => { haptic.selection(); Linking.openURL("https://dafadventures.com/privacy"); }}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
          >
            <Shield size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Privacy policy</Text>
            <ExternalLink size={14} color={C.textTertiary} strokeWidth={1.5} />
          </Pressable>
          <View style={s.divider} />
          <View style={s.row}>
            <Info size={18} color={C.textSecondary} strokeWidth={1.5} />
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>
        </FadeIn>

        {/* ── Danger zone ── */}
        <View style={s.dangerSection}>
          <Pressable
            style={({ pressed }) => [s.demoBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              haptic.selection();
              // Clear org branding so demo screenshots show default Dalefy brand
              setPref("orgId", "");
              setPref("orgSlug", "");
              let added = 0;
              for (const trip of INITIAL_TRIPS) {
                if (!trips.some(t => t.id === trip.id)) {
                  addTrip(trip);
                  added++;
                }
              }
              toast(added > 0 ? `${added} demo trips loaded` : "Demo trips already loaded");
            }}
          >
            <Download size={15} color={C.teal} strokeWidth={1.5} />
            <Text style={s.demoBtnText}>Load demo trips</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.dangerBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleClearTrips}
            disabled={trips.length === 0}
          >
            <Trash2 size={15} color={trips.length === 0 ? C.textDim : "#ef4444"} strokeWidth={1.5} />
            <Text style={[s.dangerText, trips.length === 0 && { color: C.textDim }]}>
              Clear all trips ({trips.length})
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.dangerBtn, { opacity: pressed ? 0.7 : 1, marginTop: 8 }]}
            onPress={() => {
              Alert.alert("Reset App?", "This will clear all data and return to the setup screen.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: async () => {
                    haptic.warning();
                    await AsyncStorage.clear();
                    router.replace("/welcome");
                  },
                },
              ]);
            }}
          >
            <Trash2 size={15} color="#ef4444" strokeWidth={1.5} />
            <Text style={s.dangerText}>Reset app</Text>
          </Pressable>
        </View>

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
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 120, paddingHorizontal: S.md },

    // ── Hero ──
    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      padding: S.lg,
      backgroundColor: C.card,
      borderRadius: R["2xl"],
      marginTop: S.md,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImg: {
      width: 52,
      height: 52,
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
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
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

    // ── Accent swatches ──
    swatches: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    swatchBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2.5,
      borderColor: "transparent",
    },
    swatchDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },

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
