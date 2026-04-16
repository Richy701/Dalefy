import { View, Text, ScrollView, Pressable, StyleSheet, SafeAreaView, Switch } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Moon, Sun, Bell, Shield, Info, ChevronRight, Palette } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";
import { useMemo } from "react";

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: S.md, paddingBottom: 100 },

    header: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.md,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: R.full,
      backgroundColor: C.card, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    headerTitle: { fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.3 },

    sectionLabel: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 0.8, textTransform: "uppercase",
      marginBottom: S.xs, marginTop: S.md, paddingHorizontal: S["2xs"],
    },
    card: {
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden",
    },

    row: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: S.sm, paddingVertical: 14, gap: S.sm,
    },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: S.sm + 36 + S.sm },
    iconBox: {
      width: 34, height: 34, borderRadius: R.md,
      alignItems: "center", justifyContent: "center",
    },
    rowLabel: { flex: 1, fontSize: T.base, fontWeight: T.medium, color: C.textPrimary },
    rowValue: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },

    themeToggle: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: C.elevated, borderRadius: R.full,
      padding: 3, gap: 2,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    themeBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.full,
    },
    themeBtnActive: { backgroundColor: C.card },
    themeBtnText: { fontSize: T.sm, fontWeight: T.semibold },

    versionText: {
      fontSize: T.sm, color: C.textTertiary, textAlign: "center",
      fontWeight: T.medium,
    },
    versionRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, marginTop: S.xl,
    },
  });
}

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, toggle, C } = useTheme();
  const { prefs, setPref } = usePreferences();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={17} color={C.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Palette size={17} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={styles.themeToggle}>
              <Pressable
                style={[styles.themeBtn, !isDark && styles.themeBtnActive]}
                onPress={() => isDark && toggle()}
              >
                <Sun size={13} color={!isDark ? C.amber : C.textTertiary} strokeWidth={2} />
                <Text style={[styles.themeBtnText, { color: !isDark ? C.textPrimary : C.textTertiary }]}>Light</Text>
              </Pressable>
              <Pressable
                style={[styles.themeBtn, isDark && styles.themeBtnActive]}
                onPress={() => !isDark && toggle()}
              >
                <Moon size={13} color={isDark ? C.teal : C.textTertiary} strokeWidth={2} />
                <Text style={[styles.themeBtnText, { color: isDark ? C.textPrimary : C.textTertiary }]}>Dark</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.amberDim }]}>
              <Bell size={17} color={C.amber} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Trip reminders</Text>
            <Switch
              value={prefs.tripReminders}
              onValueChange={(v) => setPref("tripReminders", v)}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.tripReminders ? C.teal : C.textTertiary}
            />
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Bell size={17} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Itinerary updates</Text>
            <Switch
              value={prefs.itineraryUpdates}
              onValueChange={(v) => setPref("itineraryUpdates", v)}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.itineraryUpdates ? C.teal : C.textTertiary}
            />
          </View>
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Shield size={17} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <ChevronRight size={15} color={C.textTertiary} strokeWidth={1.5} />
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.elevated }]}>
              <Info size={17} color={C.textSecondary} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>App version</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
        </View>

        <View style={styles.versionRow}>
          <Logo size={10} color={C.textTertiary} />
          <Text style={styles.versionText}>DAF Adventures · Traveller App</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
