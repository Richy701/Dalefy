import { View, Text, Pressable, StyleSheet, Switch, RefreshControl, Image, Platform } from "react-native";
import Animated from "react-native-reanimated";
import { useCollapsingHeader, CompactHeader, ScreenTitle } from "@/components/ui/CollapsingHeader";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { useHaptic } from "@/hooks/useHaptic";
import {
  User, Palette, Bell, Shield, UserCirclePlus,
  Vibrate, Pencil, ArrowSquareOut, Info,
  FileText, CalendarCheck, Pulse, ChatCircle, FileText as FileCheckIcon,
  SignOut,
} from "phosphor-react-native";
import { T, R, S, shadow, SCROLL_BOTTOM_PAD, type ThemeColors } from "@/constants/theme";

import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
import { Logo } from "@/components/Logo";
import { useBrand } from "@/context/BrandContext";
import { useToast } from "@/context/ToastContext";
import { FadeIn } from "@/components/FadeIn";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import { useMemo, useState, useCallback } from "react";

/** Stable per-name accent for the initials avatar (hex so alpha suffixes work). */
function deriveAvatarColor(name: string, C: ThemeColors): string {
  const palette = [C.dining, C.activity, C.hotel, C.transfer, C.green, C.teal];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export default function ProfileScreen() {
  const { C, isDark, mode, setMode } = useTheme();
  const { prefs, setPref } = usePreferences();
  const auth = useAuth();
  const { brand } = useBrand();
  const { trips, reload } = useTrips();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const s = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
    toast("Trips synced");
  }, [reload, toast]);

  const firstName = (prefs.name || "").trim().split(/\s+/)[0] || "";
  const initials = firstName ? firstName[0].toUpperCase() : "";
  const avatarColor = useMemo(() => deriveAvatarColor(prefs.name || "?", C), [prefs.name, C]);

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




  const { onScroll, barStyle } = useCollapsingHeader();

  return (
    <View style={s.safe}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >
        <ScreenTitle>Profile</ScreenTitle>

        <View style={s.body}>
        {/* ── Profile hero ── */}
        <FadeIn delay={0}>
        <View style={s.heroCard}>
          {prefs.avatar || initials ? (
            <Avatar size={56} uri={prefs.avatar} initials={initials || undefined} color={avatarColor} />
          ) : (
            <View style={s.avatarFallback}>
              <User size={28} color={C.teal} weight="light" />
            </View>
          )}
          <View style={s.heroText}>
            <Text style={s.heroName}>{firstName || "Traveller"}</Text>
            {nextTrip && (
              <Pill label={nextTrip} tone="custom" bg={C.tealMid} color={C.tealText} style={s.statusPill} />
            )}
          </View>
          <Pressable
            style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { haptic.selection(); router.push("/welcome"); }}
            accessibilityRole="button"
            accessibilityLabel="Edit your profile"
            hitSlop={8}
          >
            <Pencil size={14} color={C.textSecondary} weight="light" />
          </Pressable>
        </View>
        </FadeIn>

        {/* ── Account upgrade CTA (anonymous users only) ── */}
        {auth.isAnonymous && (
          <FadeIn delay={60}>
            <Pressable
              onPress={() => { haptic.selection(); router.push("/auth?mode=upgrade"); }}
              style={({ pressed }) => [s.upgradeCard, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
              accessibilityRole="button"
              accessibilityLabel="Sign in to save your trips"
            >
              <View style={[s.upgradeIcon, { backgroundColor: C.tealDim }]}>
                <UserCirclePlus size={20} color={C.teal} weight="regular" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.upgradeTitle}>Sign in to save your trips</Text>
                <Text style={s.upgradeSub}>Access your trips on any device</Text>
              </View>
              <Text style={{ fontSize: T.xs, fontWeight: T.bold, color: C.tealText, letterSpacing: 0.5 }}>
                Sign in
              </Text>
            </Pressable>
          </FadeIn>
        )}

        {/* ── Appearance ── */}
        <FadeIn delay={120}>
        <MicroLabel style={s.sectionLabel}>Appearance</MicroLabel>
        <View style={s.card}>
          {/* Theme */}
          <View style={s.row}>
            <Palette size={18} color={C.textSecondary} weight="light" />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Theme</Text></View>
            <SegmentedControl
              values={["Light", "Dark", "Auto"]}
              selectedIndex={mode === "light" ? 0 : mode === "dark" ? 1 : 2}
              onChange={(e) => {
                const idx = e.nativeEvent.selectedSegmentIndex;
                const val = (["light", "dark", "system"] as const)[idx];
                haptic.selection();
                setMode(val);
              }}
              style={{ width: 180, ...shadow("card", isDark) }}
              appearance={isDark ? "dark" : "light"}
            />
          </View>

          <View style={s.divider} />

          {/* Haptics */}
          <View style={s.row}>
            <View style={s.rowIcon}>
              <Vibrate size={18} color={C.textSecondary} weight="light" />
            </View>
            <View style={s.rowLabelGroup}>
              <Text style={s.rowLabel}>Haptic feedback</Text>
              <Text style={s.rowSub}>Subtle vibrations on actions</Text>
            </View>
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
        <FadeIn delay={180}>
        <MicroLabel style={s.sectionLabel}>Notifications</MicroLabel>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowIcon}>
              <Bell size={18} color={C.textSecondary} weight="light" />
            </View>
            <View style={s.rowLabelGroup}>
              <Text style={s.rowLabel}>Trip reminders</Text>
              <Text style={s.rowSub}>Push notifications before each event</Text>
            </View>
            <Switch
              value={prefs.tripReminders}
              onValueChange={(v) => { haptic.selection(); setPref("tripReminders", v); }}
              trackColor={{ false: C.toggleTrack, true: C.tealMid }}
              thumbColor={prefs.tripReminders ? C.teal : C.textTertiary}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.rowIcon}>
              <CalendarCheck size={18} color={C.textSecondary} weight="light" />
            </View>
            <View style={s.rowLabelGroup}>
              <Text style={s.rowLabel}>Itinerary updates</Text>
              <Text style={s.rowSub}>When your organiser changes the plan</Text>
            </View>
            <Switch
              value={prefs.itineraryUpdates}
              onValueChange={(v) => { haptic.selection(); setPref("itineraryUpdates", v); }}
              trackColor={{ false: C.toggleTrack, true: C.tealMid }}
              thumbColor={prefs.itineraryUpdates ? C.teal : C.textTertiary}
            />
          </View>
          {Platform.OS === "ios" && (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <View style={s.rowIcon}>
                  <Pulse size={18} color={C.textSecondary} weight="light" />
                </View>
                <View style={s.rowLabelGroup}>
                  <Text style={s.rowLabel}>Live Activity</Text>
                  <Text style={s.rowSub}>Flight progress on lock screen and Dynamic Island</Text>
                </View>
                <Switch
                  value={prefs.liveActivity !== false}
                  onValueChange={(v) => { haptic.selection(); setPref("liveActivity", v); }}
                  trackColor={{ false: C.toggleTrack, true: C.tealMid }}
                  thumbColor={prefs.liveActivity !== false ? C.teal : C.textTertiary}
                />
              </View>
            </>
          )}
        </View>
        </FadeIn>

        {/* ── Documents ── */}
        <FadeIn delay={240}>
        <MicroLabel style={s.sectionLabel}>Documents</MicroLabel>
        <View style={s.card}>
          <EmptyState
            compact
            icon={<FileText size={28} color={C.teal} weight="light" />}
            title="No documents yet"
            message="Your travel agency will share documents here when they're ready."
          />
        </View>
        </FadeIn>

        {/* ── About ── */}
        <FadeIn delay={240}>
        <MicroLabel style={s.sectionLabel}>About</MicroLabel>
        <View style={s.card}>
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.vercel.app/support.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Help & support"
          >
            <ChatCircle size={18} color={C.textSecondary} weight="light" />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Help & support</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="light" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.vercel.app/privacy.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
          >
            <Shield size={18} color={C.textSecondary} weight="light" />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Privacy policy</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="light" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.vercel.app/terms.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Terms of service"
          >
            <FileCheckIcon size={18} color={C.textSecondary} weight="light" />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Terms of service</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="light" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={async () => {
              haptic.selection();
              await Clipboard.setStringAsync("Dalefy v1.0.0 (27)");
              toast("Version copied");
            }}
            accessibilityRole="button"
            accessibilityLabel="Copy version to clipboard"
          >
            <Info size={18} color={C.textSecondary} weight="light" />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Version</Text></View>
            <Text style={s.rowValue}>1.0.0 (27)</Text>
          </Pressable>
        </View>
        </FadeIn>


        {/* ── Sign Out ── */}
        {auth.isAuthenticated && (
          <FadeIn delay={240}>
            <Pressable
              onPress={async () => {
                haptic.medium();
                await auth.signOut();
                router.replace("/auth");
              }}
              style={({ pressed }) => [s.signOutBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <SignOut size={18} color={C.red} weight="regular" />
              <Text style={[s.signOutText, { color: C.redText }]}>Sign out</Text>
            </Pressable>
          </FadeIn>
        )}

        {/* ── Footer ── */}
        <View style={s.footer}>
          {brand.logoUrl ? (
            <Image source={{ uri: brand.logoUrl }} style={{ width: 14, height: 14, borderRadius: 3 }} />
          ) : (
            <Logo size={14} color={C.textTertiary} />
          )}
          <Text style={s.footerText}>Powered by {brand.name}</Text>
        </View>
        </View>

      </Animated.ScrollView>
      <CompactHeader title="Profile" barStyle={barStyle} />
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: SCROLL_BOTTOM_PAD },
    body: { paddingHorizontal: S.md },

    // ── Hero ──
    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      padding: S.lg,
      backgroundColor: C.card,
      borderRadius: R.xl,
      marginTop: S.md,
      ...shadow("card", isDark),
    },
    upgradeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      padding: S.md,
      backgroundColor: C.card,
      borderRadius: R.xl,
      marginTop: S.sm,
      borderWidth: 1,
      borderColor: C.tealMid,
    },
    upgradeIcon: {
      width: 40, height: 40, borderRadius: R.md,
      alignItems: "center", justifyContent: "center",
    },
    upgradeTitle: {
      fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary,
    },
    upgradeSub: {
      fontSize: T.xs, color: C.textTertiary, marginTop: 1,
    },
    avatarFallback: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    editBtn: {
      width: 36,
      height: 36,
      borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    statusPill: {
      marginTop: S["2xs"],
    },
    heroText: { flex: 1 },
    heroName: {
      fontSize: T.lg,
      fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.2,
    },

    // ── Sections ──
    sectionLabel: {
      marginBottom: S.sm,
      marginTop: S.xl,
      paddingLeft: S["2xs"],
    },
    card: {
      backgroundColor: C.card,
      borderRadius: R.xl,
      overflow: "hidden",
      ...shadow("card", isDark),
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
    rowIcon: {
      alignSelf: "flex-start",
      height: 18,
      justifyContent: "center",
    },
    rowLabelGroup: {
      flex: 1,
      minWidth: 0,
    },
    rowLabel: {
      fontSize: T.base,
      fontWeight: T.medium,
      color: C.textPrimary,
    },
    rowSub: {
      fontSize: T.xs,
      color: C.textTertiary,
      marginTop: 2,
    },
    rowValue: {
      fontSize: T.sm,
      color: C.textTertiary,
      fontWeight: T.medium,
    },

    // ── Sign Out ──
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: S.xs,
      paddingVertical: 14,
      marginTop: S.md,
    },
    signOutText: {
      fontSize: T.base,
      fontWeight: T.semibold,
    },

    // ── Footer ──
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: S.xs2,
      marginTop: S.xl,
    },
    footerText: {
      fontSize: T.xs,
      color: C.textTertiary,
      fontWeight: T.medium,
      letterSpacing: 0.3,
    },
  });
}
