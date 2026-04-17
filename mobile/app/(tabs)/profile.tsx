import { View, Text, ScrollView, Pressable, StyleSheet, Switch, RefreshControl, Alert, Linking, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useHaptic } from "@/hooks/useHaptic";
import {
  User, Moon, Sun, Smartphone, Palette, Bell, Shield, ChevronRight,
  Droplet, Vibrate, Trash2, Pencil, ExternalLink, Info,
  FileCheck, FileClock, FileText,
} from "lucide-react-native";
import { T, R, S, ACCENT_PALETTE, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTrips } from "@/context/TripsContext";
import { Logo } from "@/components/Logo";
import { useToast } from "@/context/ToastContext";
import { useCompliance } from "@/context/ComplianceContext";
import { useMemo, useState, useCallback } from "react";

export default function ProfileScreen() {
  const { C, isDark, mode, setMode } = useTheme();
  const { prefs, setPref } = usePreferences();
  const { trips, clearTrips, reload } = useTrips();
  const { docs, pendingCount } = useCompliance();
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

        {/* ── Appearance ── */}
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

        {/* ── Notifications ── */}
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

        {/* ── My Documents ── */}
        <Text style={s.sectionLabel}>
          My Documents{pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
        </Text>
        <View style={s.card}>
          {docs.map((doc, i) => {
            const isSigned = doc.status === "Signed";
            const isExpired = doc.status === "Expired";
            const DocIcon = isSigned ? FileCheck : isExpired ? FileText : FileClock;
            const iconColor = isSigned ? C.green : isExpired ? C.red : C.amber;
            return (
              <View key={doc.name}>
                {i > 0 && <View style={s.divider} />}
                <Pressable
                  style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => {
                    haptic.selection();
                    router.push({ pathname: "/document", params: { name: doc.name } });
                  }}
                >
                  <DocIcon size={18} color={iconColor} strokeWidth={1.5} />
                  <Text style={s.rowLabel}>{doc.name}</Text>
                  <View style={[s.docBadge, {
                    backgroundColor: isSigned ? C.greenDim : isExpired ? C.redDim : C.amberDim,
                  }]}>
                    <Text style={[s.docBadgeText, {
                      color: isSigned ? C.green : isExpired ? C.red : C.amber,
                    }]}>
                      {doc.status}
                    </Text>
                  </View>
                  <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* ── About ── */}
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

        {/* ── Danger zone ── */}
        <View style={s.dangerSection}>
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
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Logo size={10} color={C.textDim} />
          <Text style={s.footerText}>DAF Adventures</Text>
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
      padding: S.md,
      backgroundColor: C.card,
      borderRadius: R.xl,
      marginTop: S.md,
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
      marginBottom: S.xs,
      marginTop: S.lg,
      paddingLeft: S["2xs"],
    },
    card: {
      backgroundColor: C.card,
      borderRadius: R.xl,
      overflow: "hidden",
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

    // ── Document badges ──
    docBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: R.full,
    },
    docBadgeText: {
      fontSize: T.xs,
      fontWeight: T.bold,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },

    // ── Danger zone ──
    dangerSection: {
      marginTop: S.xl,
      alignItems: "center",
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
