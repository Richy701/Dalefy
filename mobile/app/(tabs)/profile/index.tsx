import { View, Text, Pressable, StyleSheet, Switch, RefreshControl, Image, Platform, Alert } from "react-native";
import { tripFactLine, tripLengthDays, daysUntil, destinationCountry, destinationFlag } from "@/shared/tripSummary";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { distanceKm } from "@/shared/coordinates";
import Animated from "react-native-reanimated";
import { useCollapsingHeader, CompactHeader } from "@/components/ui/CollapsingHeader";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { useHaptic } from "@/hooks/useHaptic";
import {
  User, Palette, Bell, Shield, UserCirclePlus,
  Vibrate, ArrowSquareOut, Info,
  CalendarCheck, Pulse, ChatCircle, FileText as FileCheckIcon,
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
import { MicroLabel } from "@/components/ui/MicroLabel";
import { useMemo, useState, useCallback } from "react";

/** Stable per-name accent for the initials avatar (hex so alpha suffixes work). */
const HERO_H = 250;

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
  const insets = useSafeAreaInsets();
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
  const heroTrip = useMemo(() => {
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    return active ?? sorted.find(t => daysUntil(t.start) > 0) ?? (sorted.length ? sorted[sorted.length - 1] : null);
  }, [trips]);
  const nextTrip = useMemo(() => {
    if (!heroTrip || daysUntil(heroTrip.end) < 0) return null;
    return `${heroTrip.destination || heroTrip.name} · ${tripFactLine(heroTrip).split(" · ")[0]}`;
  }, [heroTrip]);
  const flags = useMemo(() => {
    const seen = new Set<string>();
    const been: string[] = [];
    for (const t of [...trips].sort((a, b) => a.start.localeCompare(b.start))) {
      if (daysUntil(t.start) > 0) continue;
      const f = destinationFlag(t.destination);
      if (f && !seen.has(f)) { seen.add(f); been.push(f); }
    }
    const next = heroTrip && daysUntil(heroTrip.start) > 0 ? destinationFlag(heroTrip.destination) : null;
    return { been, next };
  }, [trips, heroTrip]);

  // Travel stats: what this traveller has done with us so far, or what is booked if nothing has started
  const stats = useMemo(() => {
    const started = trips.filter(t => daysUntil(t.start) <= 0);
    const pool = started.length ? started : trips;
    const countries = new Set(pool.map(t => destinationCountry(t.destination)).filter(Boolean));
    const flights = pool.flatMap(t => t.events.filter(e => e.type === "flight"));
    let km = 0;
    for (const f of flights) if (f.depCoords && f.arrCoords) km += distanceKm([f.depCoords[1], f.depCoords[0]], [f.arrCoords[1], f.arrCoords[0]]);
    return {
      label: started.length ? "So far" : "Coming up",
      trips: pool.length,
      countries: countries.size,
      days: pool.reduce((n, t) => n + tripLengthDays(t), 0),
      flights: flights.length,
      km: Math.round(km),
    };
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
        {heroTrip ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <CachedImage uri={heroTrip.image} blurRadius={90} style={[StyleSheet.absoluteFill, { opacity: 0.95 }]} transition={0} />
            <View style={StyleSheet.absoluteFill}>
              <LinearGradient colors={[`${C.bg}1a`, `${C.bg}b3`, C.bg]} locations={[0, 0.5, 1]} style={{ height: HERO_H + insets.top + 260 }} />
              <View style={{ flex: 1, backgroundColor: C.bg }} />
            </View>
          </View>
        ) : null}

        {/* ── Hero: you, on your next trip's photo ── */}
        <View style={[s.hero, { height: HERO_H + insets.top }]}>
          {heroTrip ? (
            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.3, 1]} style={{ flex: 1 }} />}
            >
              <CachedImage uri={heroTrip.image} style={StyleSheet.absoluteFill} accessible={false} />
            </MaskedView>
          ) : null}
          <View style={s.heroBody}>
            {prefs.avatar || initials ? (
              <Avatar size={76} uri={prefs.avatar} initials={initials || undefined} color={avatarColor} ringColor={isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.9)"} />
            ) : (
              <View style={s.avatarFallback}>
                <User size={34} color={C.textTertiary} weight="light" />
              </View>
            )}
            <Text style={[s.heroName, s.heroShadow]}>{firstName || "Traveller"}</Text>
            {nextTrip ? <Text style={[s.heroSub, s.heroShadow]} numberOfLines={2}>{nextTrip}</Text> : null}
            <Pressable
              style={({ pressed }) => [s.editBtn, { opacity: pressed ? 0.5 : 1 }]}
              onPress={() => { haptic.selection(); router.push("/welcome"); }}
              accessibilityRole="button"
              accessibilityLabel="Edit your profile"
              hitSlop={8}
            >
              <Text style={s.editText}>Edit profile</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.body}>

        {/* ── Travel stats ── */}
        {trips.length > 0 && (
          <FadeIn delay={40}>
            <View style={s.statsCard}>
              {(flags.been.length > 0 || flags.next) && (
                <View style={s.flagsRow}>
                  {flags.been.length > 0 && (
                    <View style={s.flagsGroup}>
                      <Text style={s.flagsLabel}>Been to</Text>
                      <Text style={s.flags}>{flags.been.join(" ")}</Text>
                    </View>
                  )}
                  {flags.next && (
                    <View style={[s.flagsGroup, flags.been.length > 0 && s.flagsGroupEnd]}>
                      <Text style={s.flagsLabel}>Next</Text>
                      <Text style={s.flags}>{flags.next}</Text>
                    </View>
                  )}
                </View>
              )}
              <View style={s.statsRow}>
                {[
                  { n: stats.trips, l: stats.trips === 1 ? "Trip" : "Trips" },
                  { n: stats.days, l: "Days" },
                  { n: stats.km >= 1000 ? `${(stats.km / 1000).toFixed(stats.km >= 10000 ? 0 : 1)}k` : stats.flights, l: stats.km >= 1000 ? "km flown" : stats.flights === 1 ? "Flight" : "Flights" },
                ].map(st => (
                  <View key={st.l} style={s.stat}>
                    <Text style={s.statNum}>{st.n}</Text>
                    <Text style={s.statLabel}>{st.l}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>
        )}

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
              onPress={() => {
                haptic.medium();
                Alert.alert("Sign out?", "Your trips stay on this device. Sign in again any time to sync.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign out", style: "destructive", onPress: async () => { await auth.signOut(); router.replace("/auth"); } },
                ]);
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
    hero: { overflow: "hidden", justifyContent: "flex-end" },
    heroBody: { alignItems: "center", gap: 4, paddingHorizontal: S.lg, paddingBottom: S.sm },
    heroShadow: isDark ? {
      textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    } : {},
    editBtn: { marginTop: S.xs2, paddingVertical: 4, paddingHorizontal: S.sm2, borderRadius: R.sm, backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)" },
    flagsRow: { flexDirection: "row", alignItems: "flex-end", gap: S.lg, marginBottom: S.md },
    flagsGroup: { gap: 2 },
    flagsGroupEnd: { marginLeft: "auto", alignItems: "flex-end" },
    flagsLabel: { fontSize: T.xs, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 },
    flags: { fontSize: 26, lineHeight: 32 },
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
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    editText: { fontSize: T.sm, color: isDark ? "#fff" : C.textPrimary, fontWeight: T.semibold },
    heroSub: { fontSize: T.sm, color: isDark ? "rgba(255,255,255,0.85)" : C.textSecondary, textAlign: "center", lineHeight: 18 },
    statsCard: {
      backgroundColor: C.card, borderRadius: R.xl, marginTop: S.sm,
      paddingVertical: S.md, paddingHorizontal: S.md,
      ...shadow("card", isDark),
    },
    statsRow: { flexDirection: "row" },
    stat: { flex: 1, alignItems: "center", gap: 2 },
    statNum: { fontSize: T["2xl"], fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
    statLabel: { fontSize: T.xs, color: C.textTertiary },
    heroName: {
      fontSize: 26,
      fontWeight: T.bold,
      color: isDark ? "#fff" : C.textPrimary,
      letterSpacing: -0.3, marginTop: S.xs,
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
