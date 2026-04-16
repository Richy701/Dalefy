import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  User, Moon, Sun, Palette, Bell, BellRing, Shield, Info, ChevronRight,
  Globe, HelpCircle, Droplet, Rows3, Trash2, Pencil,
} from "lucide-react-native";
import { Alert } from "react-native";
import { T, R, S, F, ACCENT_PALETTE, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTrips } from "@/context/TripsContext";
import { Logo } from "@/components/Logo";
import { useMemo } from "react";
import { buildNotifCopy, type NotifEvent } from "@/services/notificationCopy";

export default function ProfileScreen() {
  const { C, isDark, toggle } = useTheme();
  const { prefs, setPref } = usePreferences();
  const { trips, clearTrips } = useTrips();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(C), [C]);

  const firstName = (prefs.name || "").trim().split(/\s+/)[0] || "";
  const initials = firstName ? firstName[0].toUpperCase() : "";

  const firstTripName = trips[0]?.name;
  const firstEventTitle = trips[0]?.events?.[0]?.title;

  const handlePreviewNotification = async (event: NotifEvent) => {
    Haptics.selectionAsync();
    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        if (req.status !== "granted") {
          Alert.alert("Notifications disabled", "Allow notifications in system settings to see alerts.");
          return;
        }
      }
      const copy = buildNotifCopy(event, {
        tripName: firstTripName ?? "Kenya & Tanzania",
        eventTitle: firstEventTitle ?? "Governors Camp check-in",
      });
      await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          data: { category: copy.category, event },
          sound: "default",
        },
        trigger: null,
      });
    } catch (e) {
      Alert.alert("Couldn't send", (e as Error).message);
    }
  };

  const handleClearTrips = () => {
    if (trips.length === 0) return;
    Alert.alert(
      "Clear all trips?",
      `This will remove ${trips.length} trip${trips.length === 1 ? "" : "s"} from this device. You can re-add them via a shared link.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearTrips();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Logo size={11} color={C.teal} />
            <Text style={[styles.brandName, { marginBottom: 0 }]}>DAF Adventures</Text>
          </View>
          <Text style={styles.pageTitle}>Account</Text>
        </View>

        {/* ── Identity strip (inline, no hero) ── */}
        <Pressable
          style={({ pressed }) => [styles.identityRow, pressed && { opacity: 0.7 }]}
          onPress={() => { Haptics.selectionAsync(); router.push("/welcome"); }}
          accessibilityLabel="Edit your name"
        >
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarText}>{initials}</Text>
            ) : (
              <User size={22} color={C.teal} strokeWidth={1.6} />
            )}
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityName}>{firstName || "Traveller"}</Text>
          </View>
          <View style={styles.identityEdit}>
            <Pencil size={13} color={C.textTertiary} strokeWidth={1.8} />
          </View>
        </Pressable>

        {/* ── Appearance ── */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Palette size={16} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={styles.themeToggle}>
              <Pressable
                style={[styles.themeBtn, !isDark && styles.themeBtnActive]}
                onPress={() => { if (isDark) { Haptics.selectionAsync(); toggle(); } }}
              >
                <Sun size={12} color={!isDark ? C.amber : C.textTertiary} strokeWidth={2} />
                <Text style={[styles.themeBtnText, { color: !isDark ? C.textPrimary : C.textTertiary }]}>Light</Text>
              </Pressable>
              <Pressable
                style={[styles.themeBtn, isDark && styles.themeBtnActive]}
                onPress={() => { if (!isDark) { Haptics.selectionAsync(); toggle(); } }}
              >
                <Moon size={12} color={isDark ? C.teal : C.textTertiary} strokeWidth={2} />
                <Text style={[styles.themeBtnText, { color: isDark ? C.textPrimary : C.textTertiary }]}>Dark</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.accentRow}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Droplet size={16} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Accent</Text>
          </View>
          <View style={styles.swatches}>
            {ACCENT_PALETTE.map((p) => {
              const selected = prefs.accent === p.id;
              const hex = isDark ? p.dark : p.light;
              return (
                <Pressable
                  key={p.id}
                  accessibilityLabel={p.label}
                  onPress={() => { Haptics.selectionAsync(); setPref("accent", p.id); }}
                  style={[
                    styles.swatchWrap,
                    selected && { borderColor: `${hex}66` },
                  ]}
                >
                  <View style={[styles.swatchInner, { backgroundColor: hex }]} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Rows3 size={16} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Compact mode</Text>
            <Switch
              value={prefs.compactMode}
              onValueChange={(v) => { Haptics.selectionAsync(); setPref("compactMode", v); }}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.compactMode ? C.teal : C.textTertiary}
            />
          </View>
        </View>

        {/* ── Notifications ── */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.amberDim }]}>
              <Bell size={16} color={C.amber} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Trip reminders</Text>
            <Switch
              value={prefs.tripReminders}
              onValueChange={(v) => { Haptics.selectionAsync(); setPref("tripReminders", v); }}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.tripReminders ? C.teal : C.textTertiary}
            />
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Bell size={16} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Itinerary updates</Text>
            <Switch
              value={prefs.itineraryUpdates}
              onValueChange={(v) => { Haptics.selectionAsync(); setPref("itineraryUpdates", v); }}
              trackColor={{ false: C.elevated, true: C.tealMid }}
              thumbColor={prefs.itineraryUpdates ? C.teal : C.textTertiary}
            />
          </View>
        </View>

        {/* ── Preview notifications (fires a local notification on this device) ── */}
        <Text style={styles.sectionLabel}>Preview notifications</Text>
        <View style={styles.previewGrid}>
          {([
            ["trip_published", "Trip published"],
            ["trip_updated", "Trip details updated"],
            ["event_added", "Event added"],
            ["event_updated", "Event updated"],
            ["event_deleted", "Event deleted"],
            ["itinerary_imported", "Itinerary imported"],
            ["reminder_tomorrow", "Reminder · tomorrow"],
          ] as [NotifEvent, string][]).map(([key, label]) => (
            <Pressable
              key={key}
              style={({ pressed }) => [styles.previewChip, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => handlePreviewNotification(key)}
            >
              <BellRing size={13} color={C.teal} strokeWidth={2} />
              <Text style={styles.previewChipText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Support ── */}
        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.card}>
          <Pressable style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]} onPress={() => Haptics.selectionAsync()}>
            <View style={[styles.iconBox, { backgroundColor: C.elevated }]}>
              <HelpCircle size={16} color={C.textSecondary} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Help & support</Text>
            <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]} onPress={() => Haptics.selectionAsync()}>
            <View style={[styles.iconBox, { backgroundColor: C.elevated }]}>
              <Globe size={16} color={C.textSecondary} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Language & region</Text>
            <Text style={styles.rowValue}>English</Text>
            <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
          </Pressable>
        </View>

        {/* ── Data ── */}
        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleClearTrips}
            disabled={trips.length === 0}
          >
            <View style={[styles.iconBox, { backgroundColor: C.elevated }]}>
              <Trash2 size={16} color={trips.length === 0 ? C.textTertiary : "#ef4444"} strokeWidth={1.8} />
            </View>
            <Text style={[styles.rowLabel, { color: trips.length === 0 ? C.textTertiary : C.textPrimary }]}>
              Clear all trips
            </Text>
            <Text style={styles.rowValue}>
              {trips.length} saved
            </Text>
          </Pressable>
        </View>

        {/* ── About ── */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <Pressable style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]} onPress={() => Haptics.selectionAsync()}>
            <View style={[styles.iconBox, { backgroundColor: C.tealDim }]}>
              <Shield size={16} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowLabel}>Privacy policy</Text>
            <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} />
          </Pressable>
          <View style={styles.rowDivider} />
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: C.elevated }]}>
              <Info size={16} color={C.textSecondary} strokeWidth={1.8} />
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

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },

    header: {
      paddingHorizontal: S.md,
      paddingTop: Platform.OS === "android" ? S.md : S.xs,
      paddingBottom: S.sm,
    },
    brandName: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 2,
    },
    brandRow: {
      flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2,
    },
    versionRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, marginTop: S.xl,
    },
    pageTitle: {
      fontSize: T["3xl"] + 2, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
    },

    identityRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.md, paddingTop: S.xs, paddingBottom: S.sm,
    },
    avatar: {
      width: 48, height: 48, borderRadius: R.full,
      backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    avatarText: {
      fontSize: T.lg, fontFamily: F.black, fontWeight: T.black,
      color: C.teal, letterSpacing: -0.3,
    },
    identityEdit: {
      width: 30, height: 30, borderRadius: R.full,
      backgroundColor: C.elevated, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    identityText: { flex: 1 },
    identityName: {
      fontSize: T.lg, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.2, marginBottom: 2,
    },
    identitySub: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },

    sectionLabel: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 0.8, textTransform: "uppercase",
      marginBottom: S.xs, marginTop: S.md,
      paddingHorizontal: S.md + S["2xs"],
    },
    card: {
      marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden",
    },

    row: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: S.sm, paddingVertical: 14, gap: S.sm,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.sm + 34 + S.sm,
    },
    iconBox: {
      width: 34, height: 34, borderRadius: R.md,
      alignItems: "center", justifyContent: "center",
    },
    rowLabel: { flex: 1, fontSize: T.base, fontWeight: T.medium, color: C.textPrimary },
    rowValue: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },

    previewGrid: {
      flexDirection: "row", flexWrap: "wrap", gap: S.xs,
      marginHorizontal: S.md, marginBottom: S.xs,
    },
    previewChip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 9, borderRadius: R.full,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    previewChipText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textPrimary,
    },

    themeToggle: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: C.elevated, borderRadius: R.full,
      padding: 3, gap: 2,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    themeBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full,
    },
    themeBtnActive: { backgroundColor: C.card },
    themeBtnText: { fontSize: T.xs, fontWeight: T.semibold },

    accentRow: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: S.sm, paddingTop: 14, paddingBottom: 6, gap: S.sm,
    },
    swatches: {
      flexDirection: "row", alignItems: "center", flexWrap: "wrap",
      gap: 10, paddingHorizontal: S.sm + 34 + S.sm, paddingBottom: 14,
    },
    swatchWrap: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: "transparent",
    },
    swatchInner: {
      width: 26, height: 26, borderRadius: 13,
    },

    versionText: {
      fontSize: T.sm, color: C.textTertiary, textAlign: "center",
      fontWeight: T.medium,
    },
  });
}
