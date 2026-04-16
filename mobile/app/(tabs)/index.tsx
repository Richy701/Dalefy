import {
  View, Text, ScrollView, Image, Pressable,
  StyleSheet, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState, useMemo, useCallback, useRef } from "react";
import {
  Search, MapPin, ChevronRight, CalendarDays, Users,
  ArrowUpRight, Heart, Share2, Compass, Hotel, Utensils, Plane,
  Bell, Sun, Moon, Plus, X as XIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Illustration } from "@/components/Illustration";
import { NotificationSheet } from "@/components/NotificationSheet";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { usePreferences } from "@/context/PreferencesContext";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import type { Trip, TravelEvent } from "@/shared/types";
import { fetchTripByShortCode } from "@/services/supabaseTrips";

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

const EVENT_TAGS: Record<string, string[]> = {
  activity: ["Experience", "Adventure", "Culture"],
  hotel:    ["Luxury", "Stay", "Comfort"],
  dining:   ["Food", "Local Cuisine", "Dining"],
  flight:   ["Transfer", "Flight", "Transit"],
};

// ── Greeting Hero ─────────────────────────────────────────────────────────────
function GreetingHero({ nextTrip, isActive, onPress }: {
  nextTrip: Trip | undefined;
  isActive: boolean;
  onPress: (t: Trip) => void;
}) {
  const { C, isDark, toggle } = useTheme();
  const { unreadCount } = useNotifications();
  const { prefs } = usePreferences();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifOpen, setNotifOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [linkValue, setLinkValue] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const pinRefs = useRef<Array<TextInput | null>>([]);
  const styles = useMemo(() => makeGreetingStyles(C), [C]);
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = (prefs.name || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `${timeOfDay}, ${firstName}` : timeOfDay;
  const greetingFontSize = greeting.length > 22 ? 18 : greeting.length > 18 ? 20 : T["3xl"] - 2;
  const days = nextTrip ? Math.max(0, daysUntil(nextTrip.start)) : 0;

  const closeSheet = () => {
    setCodeOpen(false);
    setDigits(["", "", "", ""]);
    setLinkValue("");
    setLinkMode(false);
    setCodeError(null);
  };

  const submitPin = async (pin: string) => {
    if (resolving) return;
    setResolving(true);
    setCodeError(null);
    try {
      const trip = await fetchTripByShortCode(pin);
      if (!trip) {
        setCodeError("No trip found for that PIN");
        setDigits(["", "", "", ""]);
        pinRefs.current[0]?.focus();
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCodeOpen(false);
      setDigits(["", "", "", ""]);
      router.push(`/shared/${trip.id}`);
    } catch {
      setCodeError("Couldn't look up PIN. Try again.");
    } finally {
      setResolving(false);
    }
  };

  const submitLink = () => {
    const raw = linkValue.trim();
    if (!raw || resolving) return;
    const match = raw.match(/shared\/([A-Za-z0-9_-]+)/);
    const id = match ? match[1] : raw;
    setCodeOpen(false);
    setLinkValue("");
    setLinkMode(false);
    router.push(`/shared/${id}`);
  };

  const handleDigitChange = (idx: number, val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    if (codeError) setCodeError(null);

    if (clean && idx < 3) {
      pinRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => d.length === 1)) {
      submitPin(next.join(""));
    }
  };

  const handleDigitKeyPress = (idx: number, key: string) => {
    if (key === "Backspace" && !digits[idx] && idx > 0) {
      pinRefs.current[idx - 1]?.focus();
      const next = [...digits];
      next[idx - 1] = "";
      setDigits(next);
    }
  };

  return (
    <View style={[styles.outer, { paddingTop: insets.top + S.md }]}>
      <LinearGradient
        colors={[`${C.teal}18`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.illustrationWrap} pointerEvents="none">
        <Illustration name="together" width={170} height={140} />
      </View>
      <View style={styles.greetingRow}>
        <Text
          style={[styles.greeting, { fontSize: greetingFontSize }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {greeting} 👋
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={toggle}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDark ? C.elevated : "#f1f5f9" }]}
            accessibilityLabel="Toggle theme"
          >
            {isDark ? <Sun size={16} color={C.textSecondary} strokeWidth={2} /> : <Moon size={16} color={C.textSecondary} strokeWidth={2} />}
          </Pressable>
          {nextTrip && (
            <Pressable
              onPress={() => setCodeOpen(true)}
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDark ? C.elevated : "#f1f5f9" }]}
              accessibilityLabel="Enter trip code"
            >
              <Plus size={16} color={C.textSecondary} strokeWidth={2} />
            </Pressable>
          )}
          <Pressable
            onPress={() => setNotifOpen(true)}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDark ? C.elevated : "#f1f5f9" }]}
            accessibilityLabel="Notifications"
          >
            <Bell size={16} color={C.textSecondary} strokeWidth={2} />
            {unreadCount > 0 && <View style={styles.unreadDot} />}
          </Pressable>
        </View>
      </View>
      <NotificationSheet visible={notifOpen} onClose={() => setNotifOpen(false)} />

      <Modal visible={codeOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={{ flex: 1 }}>
          <BlurView
            intensity={Platform.OS === "ios" ? 18 : 30}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFillObject}
          />
          <Pressable
            style={[StyleSheet.absoluteFillObject, styles.codeBackdrop]}
            onPress={closeSheet}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.codeCenter}
            pointerEvents="box-none"
          >
            <Pressable style={styles.codeSheet} onPress={() => {}}>
              <View style={styles.sheetGrabber} />

              <View style={styles.sheetCloseRow}>
                <Pressable onPress={closeSheet} style={styles.codeClose}>
                  <XIcon size={16} color={C.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>

              <Text style={styles.codeTitle}>Join a trip</Text>
              <Text style={styles.sheetSub}>
                {linkMode
                  ? "Paste the share link your organiser sent you."
                  : "Enter the 4-digit code your organiser shared."}
              </Text>

              {linkMode ? (
                <>
                  <TextInput
                    value={linkValue}
                    onChangeText={(t) => { setLinkValue(t); if (codeError) setCodeError(null); }}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://…/shared/…"
                    placeholderTextColor={C.textTertiary}
                    style={styles.codeInput}
                    onSubmitEditing={submitLink}
                    returnKeyType="go"
                  />
                  {codeError ? <Text style={styles.codeErrorText}>{codeError}</Text> : null}
                  <Pressable
                    onPress={submitLink}
                    disabled={!linkValue.trim() || resolving}
                    style={({ pressed }) => [
                      styles.codeSubmit,
                      {
                        backgroundColor: linkValue.trim() && !resolving ? C.teal : C.elevated,
                        opacity: pressed && linkValue.trim() && !resolving ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.codeSubmitText, { color: linkValue.trim() && !resolving ? "#000" : C.textTertiary }]}>
                      {resolving ? "Checking…" : "Open Trip"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.pinRow}>
                    {digits.map((d, i) => (
                      <TextInput
                        key={i}
                        ref={(r) => { pinRefs.current[i] = r; }}
                        value={d}
                        onChangeText={(v) => handleDigitChange(i, v)}
                        onKeyPress={(e) => handleDigitKeyPress(i, e.nativeEvent.key)}
                        keyboardType="number-pad"
                        maxLength={1}
                        autoFocus={i === 0}
                        selectTextOnFocus
                        editable={!resolving}
                        style={[
                          styles.pinCell,
                          d ? styles.pinCellFilled : null,
                          codeError ? styles.pinCellError : null,
                        ]}
                      />
                    ))}
                  </View>
                  {codeError ? (
                    <Text style={[styles.codeErrorText, { textAlign: "center" }]}>{codeError}</Text>
                  ) : resolving ? (
                    <Text style={styles.checkingText}>Checking…</Text>
                  ) : null}
                </>
              )}

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setCodeError(null);
                  setDigits(["", "", "", ""]);
                  setLinkValue("");
                  setLinkMode(!linkMode);
                }}
                style={styles.modeToggle}
              >
                <Text style={styles.modeToggleText}>
                  {linkMode ? "Have a code instead?" : "Or paste a share link"}
                </Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {nextTrip ? (
        <Pressable
          style={({ pressed }) => [styles.countdownWrap, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(nextTrip); }}
        >
          <Text style={styles.countdownEyebrow}>
            {isActive
              ? "Currently Travelling"
              : days === 0 ? "Departing Today"
              : days === 1 ? "Day to Departure"
              : "Days to Departure"}
          </Text>
          <Text style={styles.countdownNumber}>{isActive ? "NOW" : `${days}`}</Text>
          <View style={styles.countdownMeta}>
            <MapPin size={11} color={C.teal} strokeWidth={2} />
            <Text style={styles.countdownDest} numberOfLines={1}>
              {(nextTrip.destination || nextTrip.name).toUpperCase()}
            </Text>
            <ArrowUpRight size={11} color={C.textSecondary} strokeWidth={2} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.countdownWrap, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => { Haptics.selectionAsync(); setCodeOpen(true); }}
        >
          <Text style={styles.countdownEyebrow}>Awaiting Boarding</Text>
          <Text style={styles.countdownNumber}>0</Text>
          <View style={styles.countdownMeta}>
            <Plus size={11} color={C.teal} strokeWidth={2} />
            <Text style={styles.countdownDest} numberOfLines={1}>
              Tap to paste a trip code
            </Text>
            <ArrowUpRight size={11} color={C.textSecondary} strokeWidth={2} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function makeGreetingStyles(C: ThemeColors) {
  return StyleSheet.create({
    outer: {
      marginBottom: S.md,
      backgroundColor: C.card,
      borderBottomLeftRadius: R["2xl"], borderBottomRightRadius: R["2xl"],
      borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden",
      paddingHorizontal: S.md, paddingTop: S.xs, paddingBottom: S.lg,
    },
    illustrationWrap: {
      position: "absolute", right: -10, bottom: -6,
      opacity: 0.55,
    },
    greetingRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginBottom: S.md, zIndex: 2,
    },
    greeting: {
      fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5, flex: 1,
    },
    headerActions: {
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    headerBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    unreadDot: {
      position: "absolute", top: 8, right: 8,
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: C.teal,
      borderWidth: 1.5, borderColor: C.card,
    },
    codeBackdrop: {
      backgroundColor: "rgba(0,0,0,0.12)",
    },
    codeCenter: {
      flex: 1, justifyContent: "flex-end",
    },
    codeSheet: {
      backgroundColor: C.card,
      borderTopLeftRadius: R["2xl"], borderTopRightRadius: R["2xl"],
      borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      paddingHorizontal: S.md, paddingTop: S.xs, paddingBottom: S.xl,
      gap: S.xs,
    },
    sheetGrabber: {
      alignSelf: "center",
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: S.sm,
    },
    sheetCloseRow: {
      flexDirection: "row", justifyContent: "flex-end",
      marginBottom: S.xs,
    },
    sheetSub: {
      fontSize: T.sm, color: C.textSecondary, lineHeight: 20,
      marginTop: 4, marginBottom: S.md,
    },
    codeTitle: {
      fontSize: T["2xl"], fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
    },
    codeClose: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: "center", justifyContent: "center",
      backgroundColor: C.elevated,
    },
    pinRow: {
      flexDirection: "row", justifyContent: "center",
      gap: 10, marginVertical: S.xs,
    },
    pinCell: {
      width: 60, height: 68, borderRadius: 14,
      borderWidth: 1.5, borderColor: C.border,
      backgroundColor: C.elevated,
      textAlign: "center",
      fontSize: 28, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
    },
    pinCellFilled: { borderColor: C.teal, backgroundColor: C.tealDim },
    pinCellError: { borderColor: "#ff6b6b" },
    checkingText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 1.5, textTransform: "uppercase",
      textAlign: "center", marginTop: S.sm,
    },
    modeToggle: {
      alignItems: "center", paddingVertical: S.sm, marginTop: S.xs,
    },
    modeToggleText: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.textSecondary,
    },
    codeInput: {
      height: 54, borderRadius: R.md,
      backgroundColor: C.elevated,
      paddingHorizontal: S.sm,
      fontSize: T.base, color: C.textPrimary,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      marginBottom: S.sm,
    },
    codeErrorText: {
      fontSize: T.xs, fontWeight: T.bold, color: "#ff6b6b",
      letterSpacing: 0.5, marginTop: S.xs, marginBottom: S.xs,
    },
    codeSubmit: {
      height: 48, borderRadius: R.md,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    codeSubmitText: {
      fontSize: T.sm, fontWeight: T.black,
      letterSpacing: 1.5, textTransform: "uppercase",
    },
    countdownWrap: { alignSelf: "flex-start" },
    countdownEyebrow: {
      fontSize: T.xs, fontWeight: T.black, color: C.textSecondary,
      letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 6,
    },
    countdownNumber: {
      fontSize: 72, fontFamily: F.black, fontWeight: T.black, color: C.textPrimary,
      letterSpacing: -2, lineHeight: 72,
    },
    countdownMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
    countdownDest: {
      fontSize: T.xs, fontWeight: T.black, color: C.textSecondary,
      letterSpacing: 1.5, maxWidth: 220,
    },
    emptyWrap: { alignSelf: "flex-start" },
    emptyTitle: {
      fontSize: T["3xl"], fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -1, lineHeight: T["3xl"] + 4,
      maxWidth: 220,
    },
  });
}

// ── Upcoming Card (compact horizontal, matches web) ───────────────────────────
function UpcomingCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeUpcomingCardStyles(C), [C]);
  const days  = daysUntil(trip.start);
  const start = new Date(trip.start);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <Image source={{ uri: trip.image }} style={styles.thumb} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        <View style={styles.meta}>
          {trip.destination ? (
            <>
              <MapPin size={9} color={C.teal} strokeWidth={1.8} />
              <Text style={styles.metaText}>{trip.destination}</Text>
              <Text style={styles.metaDot}>·</Text>
            </>
          ) : null}
          <CalendarDays size={9} color={C.textTertiary} strokeWidth={1.8} />
          <Text style={styles.metaText}>
            {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
          {trip.paxCount ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Users size={9} color={C.textTertiary} strokeWidth={1.8} />
              <Text style={styles.metaText}>{trip.paxCount}</Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.daysPill}>
        <Text style={styles.daysText}>{days <= 0 ? "Today" : `${days}d`}</Text>
      </View>
      <ArrowUpRight size={14} color={C.textTertiary} strokeWidth={1.5} />
    </Pressable>
  );
}

function makeUpcomingCardStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      padding: S.sm, marginHorizontal: S.md,
    },
    thumb: { width: 48, height: 48, borderRadius: R.md, backgroundColor: C.elevated },
    body: { flex: 1 },
    name: {
      fontSize: T.base, fontWeight: T.black,
      color: C.textPrimary, marginBottom: 4,
    },
    meta: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    metaText: {
      fontSize: T.xs, fontWeight: T.bold,
      color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.5,
    },
    metaDot: { fontSize: T.xs, color: C.textTertiary },
    daysPill: {
      backgroundColor: C.teal, borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    daysText: { fontSize: T.xs, fontWeight: T.black, color: "#000", letterSpacing: 0.5 },
  });
}

// ── Spotlight Event Card ───────────────────────────────────────────────────────
function SpotlightEventCard({ ev }: { ev: TravelEvent }) {
  const { C } = useTheme();
  const color = (C as Record<string, string>)[ev.type] ?? C.teal;
  const tags  = (EVENT_TAGS[ev.type] ?? []).slice(0, 3);
  const Icon  = ev.type === "hotel" ? Hotel
    : ev.type === "dining" ? Utensils
    : ev.type === "flight" ? Plane
    : Compass;

  const styles = useMemo(() => makeSpotlightCardStyles(C, color), [C, color]);

  return (
    <View style={styles.card}>
      {/* Left image */}
      {ev.image ? (
        <Image source={{ uri: ev.image }} style={styles.img} />
      ) : (
        <View style={styles.imgPlaceholder}>
          <Icon size={22} color={color} strokeWidth={1.5} style={{ opacity: 0.5 }} />
        </View>
      )}

      {/* Right content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>{ev.title}</Text>
            {(ev.notes || ev.location) ? (
              <Text style={styles.sub} numberOfLines={2}>{ev.notes || ev.location}</Text>
            ) : null}
          </View>
          <View style={styles.actions} />
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function makeSpotlightCardStyles(C: ThemeColors, _color: string) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden", minHeight: 110,
    },
    img: { width: 110, alignSelf: "stretch" },
    imgPlaceholder: {
      width: 110, alignSelf: "stretch",
      backgroundColor: `${_color}15`,
      alignItems: "center", justifyContent: "center",
      borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border,
    },
    content: { flex: 1, padding: S.sm, justifyContent: "space-between" },
    topRow: { flexDirection: "row", gap: S.xs, alignItems: "flex-start" },
    textWrap: { flex: 1 },
    title: {
      fontSize: T.base, fontWeight: T.black,
      color: C.textPrimary, marginBottom: 3,
    },
    sub: { fontSize: T.sm, color: C.textSecondary, lineHeight: 20 },
    actions: { flexDirection: "row", gap: S["2xs"] },
    heartBtn: {
      width: 28, height: 28, borderRadius: R.full,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      alignItems: "center", justifyContent: "center",
    },
    shareBtn: {
      width: 28, height: 28, borderRadius: R.full,
      alignItems: "center", justifyContent: "center",
    },
    tagsRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 6 },
    tag: {
      backgroundColor: C.elevated, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    tagText: { fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.5 },
  });
}

// ── Trip Row (All Trips list) ──────────────────────────────────────────────────
function TripRow({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const start   = new Date(trip.start);
  const end     = new Date(trip.end);
  const days    = daysUntil(trip.start);
  const isPast  = daysUntil(trip.end) < 0;
  const isActive = days <= 0 && !isPast;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
    >
      <Image source={{ uri: trip.image }} style={styles.rowThumb} />
      <View style={styles.rowBody}>
        {trip.destination ? (
          <Text style={styles.rowDest}>{trip.destination.toUpperCase()}</Text>
        ) : null}
        <Text style={styles.rowName} numberOfLines={1}>{trip.name}</Text>
        <View style={styles.rowDateRow}>
          <CalendarDays size={9} color={C.teal} strokeWidth={1.8} />
          <Text style={styles.rowDate}>
            {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </View>
      </View>
      {!isPast && days > 0 ? (
        <View style={styles.daysBadge}>
          <Text style={styles.daysBadgeNum}>{days}</Text>
          <Text style={styles.daysBadgeLbl}>DAYS</Text>
        </View>
      ) : isPast ? (
        <View style={styles.pastChip}>
          <Text style={styles.pastLabel}>PAST</Text>
        </View>
      ) : (
        <View style={[styles.statusBadgeRow, isActive ? styles.statusBadgeRowActive : styles.statusBadgeRowDraft]}>
          {isActive && <View style={styles.rowActiveDot} />}
          <Text style={[styles.statusRowText, { color: isActive ? "#000" : C.textTertiary }]}>
            {isActive ? "Active" : trip.status}
          </Text>
        </View>
      )}
      <ChevronRight size={14} color={C.textTertiary} strokeWidth={1.5} style={{ marginLeft: 2 }} />
    </Pressable>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { C } = useTheme();
  const { prefs } = usePreferences();
  const compact = prefs.compactMode;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, compact), [C, compact]);
  const { trips } = useTrips();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const sorted = useMemo(() =>
    [...trips].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [trips]);

  // Next trip for greeting hero countdown
  const nextUpcoming = useMemo(() => {
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    return active ?? sorted.find(t => daysUntil(t.start) > 0);
  }, [sorted]);

  const isNextActive = useMemo(() =>
    !!nextUpcoming && daysUntil(nextUpcoming.start) <= 0 && daysUntil(nextUpcoming.end) >= 0,
    [nextUpcoming]);

  // Up to 2 upcoming trips for compact cards
  const upcomingCards = useMemo(() =>
    sorted.filter(t => new Date(t.end) >= new Date()).slice(0, 2),
    [sorted]);

  // Spotlight trip for "For your X Trip"
  const spotlightTrip = useMemo(() =>
    sorted.filter(t => t.status !== "Draft").find(t => new Date(t.end) >= new Date()) ??
    sorted.find(t => new Date(t.end) >= new Date()) ??
    trips[0] ?? null,
    [sorted, trips]);

  // Place events (activity, hotel, dining) for spotlight, up to 3
  const spotlightPlaces = useMemo(() => {
    if (!spotlightTrip) return [];
    return spotlightTrip.events
      .filter(e => e.type === "activity" || e.type === "hotel" || e.type === "dining")
      .slice(0, 3);
  }, [spotlightTrip]);

  const upcomingIds = useMemo(() => new Set(upcomingCards.map(t => t.id)), [upcomingCards]);

  // All Trips: excludes upcoming cards, filtered by search
  const allTrips = useMemo(() =>
    sorted.filter(t =>
      !upcomingIds.has(t.id) &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
       (t.destination ?? "").toLowerCase().includes(search.toLowerCase()))
    ),
    [sorted, upcomingIds, search]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
        scrollIndicatorInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── Greeting Hero — wraps around Dynamic Island ── */}
        <GreetingHero
          nextTrip={nextUpcoming}
          isActive={isNextActive}
          onPress={(t) => router.push(`/trip/${t.id}`)}
        />

        {/* ── Search ── */}
        {trips.length > 0 && (
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
        )}

        {/* ── Upcoming Trip ── */}
        {upcomingCards.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Trip</Text>
              <Text style={styles.sectionSub}>Departing within 30 days</Text>
            </View>
            <View style={styles.upcomingList}>
              {upcomingCards.map(trip => (
                <UpcomingCard
                  key={trip.id}
                  trip={trip}
                  onPress={() => router.push(`/trip/${trip.id}`)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── For your X Trip ── */}
        {spotlightTrip && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {"For your "}
                <Text style={styles.spotlightDest}>
                  {spotlightTrip.destination || spotlightTrip.name.split(" ")[0]}
                </Text>
                {" Trip"}
              </Text>
              <Text style={styles.sectionSub}>Key events on your itinerary</Text>
            </View>

            {spotlightPlaces.length > 0 ? (
              <View style={styles.spotList}>
                {spotlightPlaces.map(ev => (
                  <SpotlightEventCard key={ev.id} ev={ev} />
                ))}
              </View>
            ) : (
              <Pressable
                style={styles.spotEmpty}
                onPress={() => router.push(`/trip/${spotlightTrip.id}`)}
              >
                <Compass size={22} color={C.textTertiary} strokeWidth={1.5} />
                <Text style={styles.spotEmptyText}>Open trip to add events</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── All Trips ── */}
        {allTrips.length > 0 && (
          <View style={styles.section}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>ALL TRIPS</Text>
              <Text style={styles.countChip}>{allTrips.length}</Text>
            </View>
            <View style={styles.listCard}>
              {allTrips.map((trip, i) => (
                <View key={trip.id}>
                  <TripRow trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
                  {i < allTrips.length - 1 && <View style={styles.rowDivider} />}
                </View>
              ))}
            </View>
          </View>
        )}


        {/* ── Empty state ── */}
        {trips.length === 0 && (
          <View style={styles.emptyState}>
            <Illustration name="riding" width={260} height={160} />
            <Text style={styles.emptyTitle}>Ready for takeoff</Text>
            <Text style={styles.emptyText}>
              Paste the trip code or scan the QR your agent shared to unlock your itinerary.
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors, compact: boolean = false) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: compact ? 72 : 100 },

    section: { marginTop: compact ? S.xs : S.md },

    sectionHeader: { paddingHorizontal: S.md, marginBottom: compact ? S["2xs"] : S.sm },
    sectionTitle: {
      fontSize: T.xl, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.3,
    },
    sectionSub: { fontSize: T.sm, color: C.textSecondary, marginTop: 3, lineHeight: 20 },
    spotlightDest: { color: C.teal, fontStyle: "italic" },

    upcomingList: { gap: S.xs },

    eyebrowRow: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: S.md, marginBottom: S.xs, gap: S.xs,
    },
    eyebrow: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 1.5, textTransform: "uppercase",
    },
    countChip: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      backgroundColor: C.tealDim, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: R.full,
    },

    // ── Spotlight ──
    spotList: { paddingHorizontal: S.md, gap: S.sm },
    spotEmpty: {
      marginHorizontal: S.md, backgroundColor: C.card,
      borderRadius: R.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      alignItems: "center", justifyContent: "center",
      paddingVertical: 32, gap: S.xs,
    },
    spotEmptyText: {
      fontSize: T.xs, fontWeight: T.bold,
      color: C.textTertiary, textTransform: "uppercase", letterSpacing: 1,
    },

    // ── Search ──
    searchWrap: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      backgroundColor: C.card, borderRadius: R.lg,
      paddingHorizontal: S.sm, height: 44,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      marginHorizontal: S.md,
    },
    searchInput: { flex: 1, fontSize: T.base, color: C.textPrimary },

    // ── Trip rows ──
    listCard: {
      marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.sm },
    rowDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.sm + 52 + S.sm,
    },
    rowThumb: { width: 52, height: 52, borderRadius: R.md, backgroundColor: C.elevated },
    rowBody: { flex: 1 },
    rowDest: {
      fontSize: T.xs, fontWeight: T.black, color: C.teal,
      letterSpacing: 1.2, marginBottom: 2,
    },
    rowName: {
      fontSize: T.base, fontWeight: T.bold,
      color: C.textPrimary, marginBottom: 3,
    },
    rowDateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    rowDate: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },
    statusBadgeRow: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4,
    },
    statusBadgeRowActive: { backgroundColor: C.teal },
    statusBadgeRowDraft:  {
      backgroundColor: C.elevated,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    rowActiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#000" },
    statusRowText: { fontSize: T.xs, fontWeight: T.black, letterSpacing: 0.8, textTransform: "uppercase" },

    daysBadge: {
      alignItems: "center", backgroundColor: C.tealDim,
      paddingHorizontal: 8, paddingVertical: 5, borderRadius: R.sm,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid, minWidth: 38,
    },
    daysBadgeNum: { fontSize: T.lg, fontFamily: F.black, fontWeight: T.black, color: C.teal, letterSpacing: -0.5 },
    daysBadgeLbl: { fontSize: T.xs, fontWeight: T.black, color: `${C.teal}99`, letterSpacing: 0.8 },

    pastChip: {
      backgroundColor: C.elevated, paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    pastLabel: { fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.8 },

    // ── Quick Actions ──
    quickActions: {
      flexDirection: "row", gap: S.sm, paddingHorizontal: S.md, marginTop: S.md,
    },
    quickCard: {
      flex: 1, backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      padding: S.md, alignItems: "center", gap: S.xs,
    },
    quickIconWrap: {
      width: 40, height: 40, borderRadius: R.full,
      backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    quickTitle: {
      fontSize: T.sm, fontWeight: T.black, color: C.textPrimary,
      marginTop: 2,
    },
    quickSub: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary },

    // ── Empty ──
    emptyState: {
      alignItems: "center", paddingTop: 80,
      paddingHorizontal: S.xl, paddingBottom: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T.xl, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
    },
    emptyText: {
      fontSize: T.base, color: C.textTertiary,
      textAlign: "center", lineHeight: 24, maxWidth: 280,
    },
    emptyBtn: {
      marginTop: S.xs, backgroundColor: C.teal,
      borderRadius: R.full, paddingHorizontal: S.lg, paddingVertical: 11,
    },
    emptyBtnText: {
      fontSize: T.sm, fontWeight: T.black,
      color: "#000", letterSpacing: 0.5, textTransform: "uppercase",
    },
  });
}
