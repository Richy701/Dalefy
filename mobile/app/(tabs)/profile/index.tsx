import { View, Text, Pressable, StyleSheet, Switch, RefreshControl, Image, Platform, Alert } from "react-native";
import { daysUntil } from "@/shared/tripSummary";
import { CachedImage } from "@/components/CachedImage";
import { PhotoBackdrop, PhotoDissolve, photoPalette } from "@/components/ui/PhotoBackdrop";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

const GLASS = isLiquidGlassAvailable();
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBannerStretch } from "@/hooks/useBannerStretch";
import Animated from "react-native-reanimated";
import { useCollapsingHeader, CompactHeader, ScreenTitle } from "@/components/ui/CollapsingHeader";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import * as Application from "expo-application";
import { useHaptic } from "@/hooks/useHaptic";
import {
  User, Palette, Bell, LockSimple, UserCirclePlus,
  Vibrate, ArrowSquareOut,
  CalendarCheck, Pulse, ChatCircle, FileText as FileCheckIcon, Newspaper,
} from "phosphor-react-native";
import { T, R, S, SCROLL_BOTTOM_PAD, type ThemeColors } from "@/constants/theme";

import { useTheme } from "@/context/ThemeContext";
import { ScrollViewMarker } from "react-native-screens/src/components/gamma/scroll-view-marker";
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
  const { C: themeC, isDark: themeDark, mode, setMode } = useTheme();
  const { prefs, setPref } = usePreferences();
  const auth = useAuth();
  const { brand } = useBrand();
  const { trips, reload } = useTrips();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
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
  const avatarColor = useMemo(() => deriveAvatarColor(prefs.name || "?", themeC), [prefs.name, themeC]);

  // Next upcoming or active trip
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const heroTrip = useMemo(() => {
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    return active ?? sorted.find(t => daysUntil(t.start) > 0) ?? (sorted.length ? sorted[sorted.length - 1] : null);
  }, [trips]);
  // Like Home: the cover photo, blurred, runs down the whole page
  const photoPage = !!heroTrip?.image;
  const C = useMemo(() => (photoPage ? photoPalette(themeC, themeDark) : themeC), [photoPage, themeC, themeDark]);
  const isDark = photoPage || themeDark;
  const s = useMemo(() => makeStyles(C, isDark, photoPage), [C, isDark, photoPage]);






  const appVersion = `${Application.nativeApplicationVersion ?? "-"} (${Application.nativeBuildVersion ?? "-"})`;

  const { onScroll, barStyle, scrollY } = useCollapsingHeader();
  const { stretchStyle } = useBannerStretch(HERO_H + insets.top, scrollY);

  return (
    <View style={s.safe}>
      {photoPage && <PhotoBackdrop uri={heroTrip!.image} />}
      <ScrollViewMarker style={{ flex: 1 }} scrollEdgeEffects={{ top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >
        {/* A photo cover when a trip exists; a compact identity header before joining. */}
        {!heroTrip && <ScreenTitle>Profile</ScreenTitle>}
        <View style={heroTrip ? [s.hero, { height: HERO_H + insets.top }] : s.identityHeader}>
          {heroTrip ? (
            <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, stretchStyle]}>
              <CachedImage uri={heroTrip.image} style={StyleSheet.absoluteFill} accessible={false} />
              <PhotoDissolve uri={heroTrip.image} scrollY={scrollY} />
            </Animated.View>
          ) : null}
          <View style={heroTrip ? s.heroBody : s.identityRow}>
            {prefs.avatar || initials ? (
              <Avatar size={76} uri={prefs.avatar} initials={initials || undefined} color={avatarColor} ringColor={isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.9)"} />
            ) : (
              <View style={s.avatarFallback}>
                <User size={34} color={C.textTertiary} weight="light" />
              </View>
            )}
            <View style={heroTrip ? s.heroDetails : s.identityDetails}>
              <Text accessibilityRole="header" style={heroTrip ? [s.heroName, s.heroShadow] : s.identityName}>{heroTrip ? (firstName ? firstName[0].toUpperCase() + firstName.slice(1) : "Traveller") : (prefs.name.trim() || "Traveller")}</Text>
              <Pressable
                style={({ pressed }) => [heroTrip ? s.editBtn : s.identityEdit, { opacity: pressed ? 0.5 : 1 }]}
                onPress={() => { haptic.selection(); router.push("/edit-profile"); }}
                accessibilityRole="button"
                accessibilityLabel="Edit your profile"
                hitSlop={10}
              >
                {heroTrip && GLASS ? (
                  <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive style={s.editGlass}>
                    <Text style={s.editText}>Edit profile</Text>
                  </GlassView>
                ) : (
                  <Text style={heroTrip ? s.editText : s.identityEditText}>Edit profile</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        <View style={s.body}>

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
            <IconTile Icon={Palette} color={"#5E5CE6"} />
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
              style={{ width: 180 }}
              appearance={isDark ? "dark" : "light"}
            />
          </View>

          <View style={s.divider} />

          {/* Haptics */}
          <View style={s.row}>
            <IconTile Icon={Vibrate} color={"#FF2D55"} />
            <View style={s.rowLabelGroup}>
              <Text style={s.rowLabel}>Haptic feedback</Text>
              <Text style={s.rowSub}>Subtle vibrations on actions</Text>
            </View>
            <Switch
              value={prefs.haptics}
              onValueChange={(v) => { haptic.selection(); setPref("haptics", v); }}
              trackColor={{ false: C.toggleTrack, true: C.teal }}
            />
          </View>
        </View>
        </FadeIn>

        {/* ── Notifications ── */}
        <FadeIn delay={180}>
        <MicroLabel style={s.sectionLabel}>Notifications</MicroLabel>
        <View style={s.card}>
          <View style={s.row}>
            <IconTile Icon={Bell} color={"#FF3B30"} />
            <View style={s.rowLabelGroup}>
              <Text style={s.rowLabel}>Trip reminders</Text>
              <Text style={s.rowSub}>Push notifications before each event</Text>
            </View>
            <Switch
              value={prefs.tripReminders}
              onValueChange={(v) => { haptic.selection(); setPref("tripReminders", v); }}
              trackColor={{ false: C.toggleTrack, true: C.teal }}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <IconTile Icon={CalendarCheck} color={"#FF9500"} />
            <View style={s.rowLabelGroup}>
              <Text style={s.rowLabel}>Itinerary updates</Text>
              <Text style={s.rowSub}>When your organiser changes the plan</Text>
            </View>
            <Switch
              value={prefs.itineraryUpdates}
              onValueChange={(v) => { haptic.selection(); setPref("itineraryUpdates", v); }}
              trackColor={{ false: C.toggleTrack, true: C.teal }}
            />
          </View>
          {Platform.OS === "ios" && (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <IconTile Icon={Pulse} color={"#34C759"} />
                <View style={s.rowLabelGroup}>
                  <Text style={s.rowLabel}>Live Activity</Text>
                  <Text style={s.rowSub}>Flight progress on lock screen and Dynamic Island</Text>
                </View>
                <Switch
                  value={prefs.liveActivity !== false}
                  onValueChange={(v) => { haptic.selection(); setPref("liveActivity", v); }}
                  trackColor={{ false: C.toggleTrack, true: C.teal }}
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
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.app/support.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Help & support"
          >
            <IconTile Icon={ChatCircle} color={"#0A84FF"} />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Help & support</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="regular" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.app/changelog.html"); }}
            accessibilityRole="link"
            accessibilityLabel="What's new"
          >
            <IconTile Icon={Newspaper} color={"#30B0C7"} />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>What's new</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="regular" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.app/privacy.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
          >
            <IconTile Icon={LockSimple} color={"#8E8E93"} />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Privacy policy</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="regular" />
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => { haptic.selection(); WebBrowser.openBrowserAsync("https://dalefy.app/terms.html"); }}
            accessibilityRole="link"
            accessibilityLabel="Terms of service"
          >
            <IconTile Icon={FileCheckIcon} color={"#8E8E93"} />
            <View style={s.rowLabelGroup}><Text style={s.rowLabel}>Terms of service</Text></View>
            <ArrowSquareOut size={14} color={C.textTertiary} weight="regular" />
          </Pressable>
        </View>
        </FadeIn>


        {/* ── Sign Out ── */}
        {auth.isAuthenticated && (
          <FadeIn delay={240}>
            <View style={[s.card, { marginTop: S.lg }]}>
            <Pressable
              onPress={() => {
                haptic.medium();
                Alert.alert("Sign out?", "Your trips stay on this device. Sign in again any time to sync.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign out", style: "destructive", onPress: async () => { await auth.signOut(); router.replace("/auth"); } },
                ]);
              }}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.elevated }]}
              accessibilityRole="button"
            >
              <Text style={[s.rowLabel, { color: C.redText }]}>Sign out</Text>
            </Pressable>
            <View style={[s.divider, { marginLeft: S.md }]} />
            <Pressable
              onPress={() => {
                haptic.medium();
                Alert.alert(
                  "Delete your account?",
                  "This removes your profile, trip memberships and avatar from Dalefy. Trips on this device are cleared too. This can't be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        const error = await auth.deleteAccount();
                        if (error) { toast(error); return; }
                        toast("Account deleted");
                        router.replace("/auth");
                      },
                    },
                  ],
                );
              }}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.elevated }]}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
            >
              <Text style={[s.rowLabel, { color: C.redText }]}>Delete account</Text>
            </Pressable>
            </View>
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
        <Pressable
          onPress={async () => {
            haptic.selection();
            await Clipboard.setStringAsync(`Dalefy v${appVersion}`);
            toast("Version copied");
          }}
          accessibilityRole="button"
          accessibilityLabel={`Dalefy version ${appVersion}, copy`}
          style={({ pressed }) => ({ alignSelf: "center", paddingVertical: S.xs, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={s.footerText}>Dalefy {appVersion}</Text>
        </Pressable>
        </View>

      </Animated.ScrollView>
      </ScrollViewMarker>
      <CompactHeader title="Profile" barStyle={barStyle} />
    </View>
  );
}

/** Settings-app icon: a small coloured rounded square with a white glyph */
function IconTile({ Icon, color }: { Icon: React.ComponentType<any>; color: string }) {
  return (
    <View style={{ width: 29, height: 29, borderRadius: 7, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Icon size={18} color="#fff" weight="fill" />
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean, photoPage: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: SCROLL_BOTTOM_PAD },
    body: { paddingHorizontal: S.md },

    // ── Hero ──
    identityHeader: { paddingHorizontal: S.md + S.xs, paddingTop: S.lg, paddingBottom: S.lg },
    identityRow: { flexDirection: "row", alignItems: "center", gap: S.md },
    identityDetails: { flex: 1 },
    identityName: { fontSize: T["2xl"], lineHeight: 29, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.3 },
    identityEdit: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingVertical: S.xs },
    identityEditText: { fontSize: T.base, lineHeight: 22, fontWeight: T.semibold, color: C.tealText },
    heroDetails: { alignItems: "center", gap: 4, alignSelf: "stretch" },
    hero: { justifyContent: "flex-end" },
    heroBody: { alignItems: "center", gap: 4, paddingHorizontal: S.lg, paddingBottom: S.sm },
    heroShadow: {
      textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    },
    editBtn: GLASS
      ? { marginTop: S.sm }
      : { marginTop: S.sm, paddingVertical: 6, paddingHorizontal: S.md, borderRadius: 18, backgroundColor: isDark ? "rgba(255,255,255,0.16)" : C.card },
    editGlass: { paddingVertical: 8, paddingHorizontal: S.md, borderRadius: 18, overflow: "hidden" },
    flagsLine: {
      flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: S.xs2,
      marginTop: S.md, paddingTop: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    },
    flagChip: {
      flexDirection: "row", alignItems: "center", gap: S["2xs"],
      backgroundColor: C.elevated, borderRadius: R.sm, paddingHorizontal: S.xs, paddingVertical: 3,
    },
    flagEmoji: { fontSize: 18, lineHeight: 22 },
    upgradeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      padding: S.md,
      backgroundColor: C.card,
      borderRadius: R.xl,
      marginTop: S.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    upgradeIcon: {
      width: 40, height: 40, borderRadius: 20,
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
    editText: { fontSize: T.base, color: isDark ? "#fff" : C.textPrimary, fontWeight: T.semibold },
    heroSub: { fontSize: T.sm, fontWeight: T.medium, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 18 },
    statsCard: {
      marginTop: S.sm,
      paddingVertical: S.md,
    },
    statsRow: { flexDirection: "row" },
    statsCaption: { fontSize: T.sm, color: C.textTertiary, textAlign: "center", marginBottom: S.xs },
    stat: { flex: 1, alignItems: "center", gap: 2 },
    statNum: { fontSize: T["2xl"], fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
    statLabel: { fontSize: T.xs, color: C.textTertiary },
    heroName: {
      fontSize: 26,
      fontWeight: T.bold,
      color: "#fff",
      letterSpacing: -0.3, marginTop: S.xs,
    },

    // ── Sections ──
    sectionLabel: {
      marginBottom: S.sm,
      marginTop: S.xl,
      paddingLeft: S["2xs"],
      // MicroLabel reads the app theme; on the photo backdrop it must use the page's palette
      color: C.textPrimary,
    },
    // Settings is the one place iOS keeps boxes: inset grouped cards
    card: {
      borderRadius: R.lg, overflow: "hidden",
      backgroundColor: photoPage ? "rgba(255,255,255,0.1)" : C.card,
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
      marginLeft: S.md + 29 + S.sm,
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
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: S.xs,
      paddingVertical: S.sm,
    },
    deleteText: {
      fontSize: T.sm,
      fontWeight: T.medium,
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
