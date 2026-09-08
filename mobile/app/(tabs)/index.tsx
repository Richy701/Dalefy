import {
  View, Text, ScrollView, Pressable,
  StyleSheet, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform, Share,
  Dimensions,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { Swipeable } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
  Easing, FadeInDown,
} from "react-native-reanimated";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import { Pill } from "@/components/ui/Pill";
import { Avatar } from "@/components/ui/Avatar";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { DragHandle } from "@/components/ui/DragHandle";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "expo-haptics";
import { useRouter, Link, useLocalSearchParams } from "expo-router";
import { parseTripDate } from "@/shared/dates";
import { daysUntil, tripFactLine, tripLengthDays, shortDay, destinationFlag } from "@/shared/tripSummary";
import { useToast } from "@/context/ToastContext";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  MapPin, CaretRight, CalendarDots,
  ShareNetwork, Bell, Plus, Scan,
  Check, Clock, WifiSlash,
  Camera, MapTrifold, Info,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/components/Logo";
import { NotificationSheet } from "@/components/NotificationSheet";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { usePreferences } from "@/context/PreferencesContext";
import { type ThemeColors, T, R, S, F, TAB_BAR_HEIGHT, shadow } from "@/constants/theme";
import type { Trip, TravelEvent } from "@/shared/types";
import { fetchTripByShortCode, fetchTripById } from "@/services/firebaseTrips";

const ON_RED = "#fff";
const HERO_H = 300;

let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch { /* native module not in this build */ }

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity",
  dining: "Dining", transfer: "Transfer",
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
};

function cleanTitle(title: string, type: string, transferType?: string): string {
  const labels = [TYPE_LABELS[transferType || ""] || "", TYPE_LABELS[type] || ""];
  for (const l of labels) {
    if (!l) continue;
    const re = new RegExp(`^${l}\\s*[-–·:]\\s*`, "i");
    title = title.replace(re, "");
  }
  return title;
}

function normaliseTitle(title: string, type: string, transferType?: string): string {
  let t = cleanTitle(title, type, transferType);
  t = t.replace(/\s+[-–·:]\s+/g, " — ").replace(/\s+/g, " ").trim();
  return t;
}


function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


// ── Trip Found Reveal ────────────────────────────────────────────────────────
function TripFoundReveal({ trip, C, onContinue }: { trip: Trip; C: ThemeColors; onContinue: () => void }) {
  const imgOpacity = useSharedValue(0);
  const imgScale = useSharedValue(1.08);
  const checkScale = useSharedValue(0);
  const copyOpacity = useSharedValue(0);
  const copyY = useSharedValue(14);
  const pillsOpacity = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const ctaY = useSharedValue(10);

  useEffect(() => {
    imgOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    imgScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    checkScale.value = withDelay(200, withSpring(1, { damping: 10, stiffness: 180 }));
    copyOpacity.value = withDelay(350, withTiming(1, { duration: 300 }));
    copyY.value = withDelay(350, withSpring(0, { damping: 14, stiffness: 100 }));
    pillsOpacity.value = withDelay(450, withTiming(1, { duration: 300 }));
    ctaOpacity.value = withDelay(500, withTiming(1, { duration: 300 }));
    ctaY.value = withDelay(500, withSpring(0, { damping: 14, stiffness: 100 }));
  }, []);

  const imgStyle = useAnimatedStyle(() => ({
    opacity: imgOpacity.value,
    transform: [{ scale: imgScale.value }],
  }));
  const checkAnim = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyOpacity.value,
    transform: [{ translateY: copyY.value }],
  }));
  const pillsStyle = useAnimatedStyle(() => ({ opacity: pillsOpacity.value }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaY.value }],
  }));

  const nights = Math.max(0, Math.ceil((parseTripDate(trip.end).getTime() - parseTripDate(trip.start).getTime()) / 86400000));
  const startDate = parseTripDate(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = parseTripDate(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const welcomeText = trip.destination
    ? `Welcome to ${trip.destination}`
    : "You're in.";

  return (
    <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: S.md, paddingVertical: S.lg }}>
      <View style={{
        width: "100%", borderRadius: R["2xl"], overflow: "hidden",
        backgroundColor: C.card,
      }}>
        {/* Hero image — fades up from blur (opacity + scale) */}
        <View style={{ height: 240, overflow: "hidden", backgroundColor: C.elevated }}>
          <Animated.View style={[{ width: "100%", height: "100%" }, imgStyle]}>
            <CachedImage uri={trip.image} style={{ width: "100%", height: "100%" }} />
          </Animated.View>
          <LinearGradient
            colors={["#00000008", "#00000040", "#000000e8"]}
            locations={[0, 0.4, 1]}
            style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
          />

          {/* Centered checkmark — scales in with bounce */}
          <Animated.View style={[{
            position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
            alignItems: "center", justifyContent: "center",
          }, checkAnim]}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: C.teal,
              alignItems: "center", justifyContent: "center",
            }}>
              <Check size={32} color={C.onAccent} weight="bold" />
            </View>
          </Animated.View>

          {/* Bottom overlay — trip name + destination */}
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md }}>
            {trip.destination && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <MapPin size={10} color={C.teal} weight="fill" />
                <Text style={{
                  fontSize: T.xs, fontFamily: F.bold, lineHeight: 14, includeFontPadding: false, color: "rgba(255,255,255,0.7)",
                  letterSpacing: 1, textTransform: "uppercase",
                }}>{trip.destination}</Text>
              </View>
            )}
            <Text style={{
              fontSize: T["2xl"], fontWeight: "800", color: "#fff",
              letterSpacing: -0.3,
            }} numberOfLines={2}>{trip.name}</Text>
          </View>
        </View>

        {/* Copy + metadata pills */}
        <View style={{ padding: S.md, gap: S.sm }}>
          <Animated.View style={copyStyle}>
            <Text style={{ fontSize: T.sm, fontWeight: "600", color: C.tealText }}>
              {welcomeText}
            </Text>
          </Animated.View>

          <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap" }, pillsStyle]}>
            <Pill
              tone="neutral"
              icon={<CalendarDots size={11} color={C.textTertiary} weight="regular" />}
              label={`${startDate} – ${endDate}`}
            />
            <Pill
              tone="neutral"
              icon={<Clock size={11} color={C.textTertiary} weight="regular" />}
              label={`${nights} night${nights !== 1 ? "s" : ""}`}
            />
          </Animated.View>
        </View>
      </View>

      {/* CTA — appears after animation settles */}
      <Animated.View style={[{ marginTop: S.lg }, ctaStyle]}>
        <ScalePress
          onPress={onContinue}
          style={{
            height: 52, borderRadius: R.xl,
            backgroundColor: C.teal,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Text style={{ fontSize: T.md, fontWeight: T.bold, color: C.onAccent }}>See itinerary</Text>
          <CaretRight size={14} color={C.onAccent} weight="bold" />
        </ScalePress>
      </Animated.View>
    </View>
  );
}

// ── QR Scanner Pane ──────────────────────────────────────────────────────────
function QRScanPane({ C, styles, onScanned }: {
  C: ThemeColors; styles: any; onScanned: (data: string) => void;
}) {
  const [permission, setPermission] = useState<{ granted: boolean } | null>(null);
  const scannedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (!useCameraPermissions) return;
    // Use Camera.requestCameraPermissionsAsync directly
    try {
      const cam = require("expo-camera");
      const { status } = await cam.Camera.requestCameraPermissionsAsync();
      setPermission({ granted: status === "granted" });
    } catch {}
  }, []);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    onScanned(data);
  }, [onScanned]);

  if (!CameraView) {
    return (
      <View style={styles.modeContent}>
        <View style={[styles.qrFrame, { alignItems: "center", justifyContent: "center" }]}>
          <Scan size={32} color={C.textTertiary} weight="thin" />
          <Text style={{ color: C.textTertiary, fontSize: T.sm, fontWeight: T.medium, marginTop: S.sm, textAlign: "center" }}>
            QR scanning isn't available in this version
          </Text>
        </View>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={[styles.modeContent, { justifyContent: "center", paddingVertical: S.xl, paddingHorizontal: S.md }]}>
        <Scan size={28} color={C.textTertiary} weight="thin" />
        <Text style={{ color: C.textSecondary, fontSize: T.sm, fontWeight: T.medium, textAlign: "center", marginTop: S.sm, marginBottom: S.md }}>
          Camera access is needed to scan QR codes
        </Text>
        <Pressable
          onPress={requestPermission}
          style={[styles.codeSubmit, { backgroundColor: C.teal, width: "100%" }]}
        >
          <Text style={[styles.codeSubmitText, { color: C.onAccent }]}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.modeContent}>
      <View style={styles.qrFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcode}
        />
        {/* Corner markers */}
        <View style={[styles.qrCorner, { top: 12, left: 12 }]} />
        <View style={[styles.qrCorner, { top: 12, right: 12, transform: [{ rotate: "90deg" }] }]} />
        <View style={[styles.qrCorner, { bottom: 12, left: 12, transform: [{ rotate: "-90deg" }] }]} />
        <View style={[styles.qrCorner, { bottom: 12, right: 12, transform: [{ rotate: "180deg" }] }]} />
      </View>
      <Text style={[styles.checkingText, { marginTop: S.sm }]}>Point at a trip QR code</Text>
    </View>
  );
}

// ── Greeting Hero ─────────────────────────────────────────────────────────────
function GreetingHero({ nextTrip, isActive, onPress }: {
  nextTrip: Trip | undefined;
  isActive: boolean;
  onPress: (t: Trip) => void;
}) {
  const { C, isDark } = useTheme();
  const { unreadCount } = useNotifications();
  const { prefs } = usePreferences();
  const { trips: joinedTrips } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ join?: string }>();
  const [notifOpen, setNotifOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  useEffect(() => {
    if (params.join === "1") setCodeOpen(true);
  }, [params.join]);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [linkValue, setLinkValue] = useState("");
  const [entryMode, setEntryMode] = useState<"pin" | "qr" | "link">("pin");
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const pinRefs = useRef<Array<TextInput | null>>([]);
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const triggerShake = useCallback(() => {
    shakeX.value = withSpring(0, { damping: 8, stiffness: 600 }, () => {});
    shakeX.value = withTiming(-6, { duration: 50 }, () => {
      shakeX.value = withTiming(6, { duration: 50 }, () => {
        shakeX.value = withTiming(-4, { duration: 50 }, () => {
          shakeX.value = withTiming(4, { duration: 50 }, () => {
            shakeX.value = withTiming(0, { duration: 50 });
          });
        });
      });
    });
  }, [shakeX]);

  const handlePasteRef = useRef<() => void>(() => {});
  handlePasteRef.current = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const clean = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
      if (!clean) return;
      const next = ["", "", "", "", "", ""];
      for (let i = 0; i < clean.length; i++) next[i] = clean[i];
      setDigits(next);
      setCodeError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (clean.length === 6) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        submitPin(clean);
      } else {
        pinRefs.current[clean.length]?.focus();
      }
    } catch {}
  };
  const handlePaste = useCallback(() => { handlePasteRef.current(); }, []);
  const styles = useMemo(() => makeGreetingStyles(C, isDark), [C, isDark]);
  // Bar sits over the cover photo when there is one, over the page ground when there is not.
  const overPhoto = !!nextTrip;
  // Glass circles are dark in dark mode and white in light mode; the glyph takes the opposite.
  const barIcon = isDark ? "#fff" : C.textPrimary;

  const closeSheet = () => {
    setCodeOpen(false);
    setDigits(["", "", "", "", "", ""]);
    setLinkValue("");
    setEntryMode("pin");
    setCodeError(null);
    setFoundTrip(null);
    setPreviewTrip(null);
  };

  // Shared reveal → navigate flow for all entry modes
  const revealAndNavigate = useCallback((trip: Trip) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFoundTrip(trip);
  }, []);

  const handleRevealContinue = useCallback(() => {
    if (!foundTrip) return;
    router.push(`/shared/${foundTrip.id}`);
    setTimeout(() => {
      setCodeOpen(false);
      setFoundTrip(null);
      setDigits(["", "", "", "", "", ""]);
      setLinkValue("");
    }, 300);
  }, [foundTrip, router]);

  const submitPin = async (pin: string) => {
    if (resolving) return;
    setResolving(true);
    setCodeError(null);
    try {
      const trip = await fetchTripByShortCode(pin);
      if (!trip) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCodeError("That PIN doesn't match any trip. Check with your organiser.");
        triggerShake();
        setDigits(["", "", "", "", "", ""]);
        pinRefs.current[0]?.focus();
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewTrip(trip);
    } catch (err: any) {
      triggerShake();
      setCodeError(err?.message || "Couldn't reach the server. Try again.");
    } finally {
      setResolving(false);
    }
  };

  const submitTripId = async (id: string) => {
    if (resolving) return;
    setResolving(true);
    setCodeError(null);
    try {
      const trip = await fetchTripById(id);
      if (!trip) {
        // Fallback — navigate directly if fetch fails (trip might still load on the page)
        setCodeOpen(false);
        router.push(`/shared/${id}`);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewTrip(trip);
    } catch {
      setCodeOpen(false);
      router.push(`/shared/${id}`);
    } finally {
      setResolving(false);
    }
  };

  const submitLink = () => {
    const raw = linkValue.trim();
    if (!raw || resolving) return;
    const match = raw.match(/shared\/([A-Za-z0-9_-]+)/);
    const id = match ? match[1] : raw;
    submitTripId(id);
  };

  const handlePinChange = (val: string) => {
    const clean = val.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < clean.length; i++) next[i] = clean[i];
    setDigits(next);
    if (codeError) setCodeError(null);
    if (previewTrip) setPreviewTrip(null);
    if (clean.length === 6) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      submitPin(clean);
    }
  };

  const pinValue = digits.join("");
  const pinComplete = pinValue.length === 6;
  const MODES = ["pin", "qr", "link"] as const;
  const fmtDay = (d: string) => parseTripDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const tripDates = (t: Trip) => `${fmtDay(t.start)} – ${fmtDay(t.end)}`;
  const recentTrips = [...joinedTrips].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const canJoin = !!previewTrip && !resolving;

  return (
    <View style={[styles.outer, { paddingTop: insets.top + S.xs }]} pointerEvents="box-none">
      {/* Top bar — avatar (left) · logo (center) · + and bell (right) */}
      <View style={styles.topBar}>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [styles.avatarRing, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            hitSlop={6}
          >
            <Avatar
              size={30}
              uri={prefs.avatar}
              initials={(prefs.name || "").trim().charAt(0).toUpperCase() || "?"}
            />
          </Pressable>
        </View>
        <Logo size={24} color={overPhoto ? "#fff" : C.textPrimary} />
        <View style={[styles.headerActions, { justifyContent: "flex-end" }]}>
          <IconCircleButton variant="glass" size={36}
            onPress={() => setCodeOpen(true)}
            accessibilityLabel="Join a trip"
          >
            <Plus size={18} color={barIcon} weight="bold" />
          </IconCircleButton>
          <IconCircleButton variant="glass" size={36}
            onPress={() => setNotifOpen(true)}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Bell size={18} color={barIcon} weight="fill" />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </IconCircleButton>
        </View>
      </View>

      <NotificationSheet visible={notifOpen} onClose={() => setNotifOpen(false)} />

      <Modal
        visible={codeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSheet}
      >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: C.card, overflow: "hidden" as const }}
          >
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.codeSheet, { paddingBottom: insets.bottom + S.md, flexGrow: 1 }]}
              showsVerticalScrollIndicator={false}
            >
              <DragHandle />

              {/* Success reveal */}
              {foundTrip ? (
                <TripFoundReveal trip={foundTrip} C={C} onContinue={handleRevealContinue} />
              ) : (
              <>
              {/* Nav row: Cancel · title */}
              <View style={styles.navBar}>
                <Pressable onPress={closeSheet} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel" style={({ pressed }) => [styles.navSide, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={styles.navAction}>Cancel</Text>
                </Pressable>
                <Text style={styles.navTitle}>Join a trip</Text>
                <View style={styles.navSide} />
              </View>

              <SegmentedControl
                values={["PIN", "Scan", "Link"]}
                selectedIndex={MODES.indexOf(entryMode)}
                appearance={isDark ? "dark" : "light"}
                onChange={(e) => {
                  Haptics.selectionAsync();
                  setCodeError(null);
                  setDigits(["", "", "", "", "", ""]);
                  setLinkValue("");
                  setPreviewTrip(null);
                  setEntryMode(MODES[e.nativeEvent.selectedSegmentIndex]);
                }}
                style={styles.segment}
              />

              {/* PIN */}
              {entryMode === "pin" && (
                <>
                  <Animated.View style={[styles.group, shakeStyle]}>
                    <View style={styles.groupRow}>
                      <Text style={styles.rowLabel}>Trip PIN</Text>
                      <TextInput
                        ref={(r) => { for (let i = 0; i < 6; i++) pinRefs.current[i] = r; }}
                        value={pinValue}
                        onChangeText={handlePinChange}
                        placeholder="ABC123"
                        placeholderTextColor={C.textTertiary}
                        keyboardType="default"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        textContentType="oneTimeCode"
                        maxLength={6}
                        autoFocus
                        editable={!resolving}
                        returnKeyType="go"
                        onSubmitEditing={() => { if (pinComplete) submitPin(pinValue); }}
                        accessibilityLabel="Trip PIN"
                        style={[styles.rowInput, styles.rowInputPin]}
                      />
                      <Pressable onPress={handlePaste} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste PIN from clipboard" style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                        <Text style={styles.rowAction}>Paste</Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                  <Text style={[styles.groupFooter, codeError ? { color: C.redText } : null]}>
                    {codeError ?? (resolving ? "Finding your trip…" : previewTrip ? "Check this is the right trip, then join." : "Six letters and numbers. Your organiser will have sent it to you.")}
                  </Text>

                  {previewTrip && (
                    <Animated.View entering={FadeInDown.duration(260)}>
                      <Text style={styles.groupHeader}>Trip found</Text>
                      <View style={styles.group}>
                        <View style={styles.previewRow}>
                          <CachedImage uri={previewTrip.image} style={styles.previewThumb} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.previewName} numberOfLines={2}>{previewTrip.name}</Text>
                            <Text style={styles.previewSub} numberOfLines={1}>
                              {[previewTrip.destination, tripDates(previewTrip)].filter(Boolean).join(" · ")}
                            </Text>
                            {previewTrip.organizer?.name ? (
                              <Text style={styles.previewSub} numberOfLines={1}>Organised by {previewTrip.organizer.name}</Text>
                            ) : null}
                          </View>
                        </View>
                      </View>
                      <View style={{ height: S.lg }} />
                    </Animated.View>
                  )}

                  <Pressable
                    onPress={() => { if (previewTrip) revealAndNavigate(previewTrip); else if (pinComplete) submitPin(pinValue); }}
                    disabled={resolving || (!previewTrip && !pinComplete)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.codeSubmit,
                      {
                        backgroundColor: canJoin ? C.teal : C.elevated,
                        opacity: pressed && canJoin ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.codeSubmitText, { color: canJoin ? C.onAccent : C.textTertiary }]} numberOfLines={1}>
                      {resolving ? "Finding trip…" : previewTrip ? `Join ${previewTrip.name}` : "Join Trip"}
                    </Text>
                  </Pressable>

                  {!previewTrip && recentTrips.length > 0 && (
                    <View style={{ marginTop: S.xl }}>
                      <Text style={styles.groupHeader}>Your trips</Text>
                      <View style={styles.group}>
                        {recentTrips.map((t, i) => (
                          <Pressable
                            key={t.id}
                            onPress={() => { Haptics.selectionAsync(); closeSheet(); router.push(`/trip/${t.id}`); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${t.name}`}
                            style={({ pressed }) => [styles.tripRow, i > 0 && styles.tripRowBorder, { backgroundColor: pressed ? C.card : "transparent" }]}
                          >
                            <CachedImage uri={t.image} style={styles.tripThumb} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.tripName} numberOfLines={1}>{t.name}</Text>
                              <Text style={styles.previewSub} numberOfLines={1}>{tripDates(t)}</Text>
                            </View>
                            <CaretRight size={14} color={C.textTertiary} weight="regular" />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* QR scanner */}
              {entryMode === "qr" && (
                <View style={styles.group}>
                <QRScanPane
                  C={C}
                  styles={styles}
                  onScanned={(data) => {
                    const match = data.match(/shared\/([A-Za-z0-9_-]+)/);
                    const id = match ? match[1] : null;
                    if (id) {
                      setEntryMode("pin");
                      submitTripId(id);
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      setCodeError("QR code doesn't contain a valid trip link");
                      setEntryMode("pin");
                    }
                  }}
                />
                </View>
              )}

              {/* Link paste */}
              {entryMode === "link" && (
                <>
                  <View style={styles.group}>
                    <View style={styles.groupRow}>
                      <Text style={styles.rowLabel}>Link</Text>
                      <TextInput
                        value={linkValue}
                        onChangeText={(t) => { setLinkValue(t); if (codeError) setCodeError(null); }}
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        placeholder="dalefy.app/trip/…"
                        placeholderTextColor={C.textTertiary}
                        style={styles.rowInput}
                        onSubmitEditing={submitLink}
                        returnKeyType="go"
                        accessibilityLabel="Invite link"
                      />
                      <Pressable
                        onPress={async () => {
                          try {
                            const text = await Clipboard.getStringAsync();
                            if (text) { setLinkValue(text.trim()); setCodeError(null); }
                          } catch {}
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Paste link from clipboard"
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      >
                        <Text style={styles.rowAction}>Paste</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={[styles.groupFooter, codeError ? { color: C.redText } : null]}>
                    {codeError ?? (previewTrip ? "Check this is the right trip, then join." : "Paste the invite link your organiser shared.")}
                  </Text>
                  {previewTrip && (
                    <Animated.View entering={FadeInDown.duration(260)}>
                      <Text style={styles.groupHeader}>Trip found</Text>
                      <View style={styles.group}>
                        <View style={styles.previewRow}>
                          <CachedImage uri={previewTrip.image} style={styles.previewThumb} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.previewName} numberOfLines={2}>{previewTrip.name}</Text>
                            <Text style={styles.previewSub} numberOfLines={1}>
                              {[previewTrip.destination, tripDates(previewTrip)].filter(Boolean).join(" · ")}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ height: S.lg }} />
                    </Animated.View>
                  )}
                  <Pressable
                    onPress={() => { if (previewTrip) revealAndNavigate(previewTrip); else submitLink(); }}
                    disabled={resolving || (!previewTrip && !linkValue.trim())}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.codeSubmit,
                      {
                        backgroundColor: canJoin ? C.teal : C.elevated,
                        opacity: pressed && canJoin ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.codeSubmitText, { color: canJoin ? C.onAccent : C.textTertiary }]} numberOfLines={1}>
                      {resolving ? "Finding trip…" : previewTrip ? `Join ${previewTrip.name}` : "Join Trip"}
                    </Text>
                  </Pressable>
                </>
              )}

              </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function makeGreetingStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    outer: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      paddingHorizontal: S.md,
    },
    topBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      height: 44,
    },
    avatarRing: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)",
      alignItems: "center", justifyContent: "center",
    },
    headerActions: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: S["2xs"],
    },
    unreadBadge: {
      position: "absolute", top: 8, right: 6,
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: C.red,
      borderWidth: 1.5, borderColor: C.card,
      alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    },
    unreadBadgeText: {
      fontSize: T["2xs"], fontWeight: "700", color: ON_RED,
      lineHeight: 12,
    },
    codeSheet: {
      backgroundColor: C.card,
      paddingHorizontal: S.lg, paddingTop: S.xs, paddingBottom: S.xl,
    },
    sheetHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
      marginBottom: S.xs,
    },
    // ── Native grouped form ──
    navBar: {
      flexDirection: "row", alignItems: "center", height: 44, marginBottom: S.sm,
    },
    navSide: { width: 72, justifyContent: "center" },
    navAction: { fontSize: T.lg, color: C.tealText },
    navTitle: {
      flex: 1, textAlign: "center", fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary,
    },
    segment: { marginBottom: S.lg },
    group: {
      backgroundColor: C.elevated, borderRadius: R.sm, overflow: "hidden",
    },
    groupRow: {
      flexDirection: "row", alignItems: "center", minHeight: 48,
      paddingHorizontal: S.md, gap: S.sm,
    },
    rowLabel: { fontSize: T.lg, color: C.textPrimary, width: 84 },
    rowInput: {
      flex: 1, fontSize: T.lg, color: C.textPrimary, paddingVertical: S.sm,
    },
    rowInputPin: {
      letterSpacing: 3, fontVariant: ["tabular-nums"], fontWeight: T.semibold,
    },
    rowAction: { fontSize: T.lg, color: C.tealText },
    groupFooter: {
      fontSize: 13, lineHeight: 18, color: C.textTertiary,
      paddingHorizontal: S.md, marginTop: S.xs, marginBottom: S.lg,
    },
    groupHeader: {
      fontSize: 13, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.3,
      paddingHorizontal: S.md, marginBottom: S.xs,
    },
    previewRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm2, padding: S.sm2,
    },
    previewThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.card },
    previewName: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary },
    previewSub: { fontSize: T.sm, color: C.textTertiary },
    tripRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm2,
      paddingHorizontal: S.sm2, paddingVertical: S.xs2, minHeight: 56,
    },
    tripRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    tripThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.card },
    tripName: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    modeContent: {
      alignItems: "center",
      paddingHorizontal: S.xs,
    },
    checkingText: {
      fontSize: T.xs, fontFamily: F.bold, lineHeight: 14, includeFontPadding: false, color: C.tealText,
      letterSpacing: 1, textTransform: "uppercase",
      textAlign: "center", marginTop: S.xs,
    },
    errorCallout: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      marginTop: S.sm, padding: S.sm,
      borderRadius: R.md,
      backgroundColor: C.redDim,
      borderWidth: 1, borderColor: C.redMid,
      width: "100%",
    },
    errorCalloutText: {
      flex: 1, fontSize: T.xs, fontWeight: T.medium,
      color: C.redText, lineHeight: 17,
    },
    qrFrame: {
      width: Dimensions.get("window").width - 80,
      height: Dimensions.get("window").width - 80,
      borderRadius: R["2xl"], overflow: "hidden",
      backgroundColor: C.bg,
      alignSelf: "center",
    },
    qrCorner: {
      position: "absolute", width: 36, height: 36,
      borderTopWidth: 3, borderLeftWidth: 3,
      borderColor: C.teal, borderTopLeftRadius: 10,
    },
    codeInput: {
      height: 50, borderRadius: R.md,
      backgroundColor: C.elevated,
      paddingHorizontal: S.sm,
      fontSize: T.sm, color: C.textPrimary,
      borderWidth: 1.5, borderColor: C.border,
      marginBottom: S.xs,
    },
    linkPasteBtn: {
      position: "absolute", right: 8, top: 0, bottom: 0,
      justifyContent: "center",
      paddingHorizontal: S.sm2, paddingVertical: S.xs2,
    },
    linkPasteBtnText: {
      fontSize: T.xs, fontWeight: T.semibold,
      color: C.textSecondary,
      backgroundColor: C.bg,
      paddingHorizontal: S.sm2, paddingVertical: 5,
      borderRadius: R.sm, overflow: "hidden",
    },
    codeSubmit: {
      height: 50, borderRadius: R.sm, width: "100%",
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
    },
    codeSubmitText: {
      fontSize: T.md, fontWeight: T.bold,
    },
  });
}

// ── Trip Row (All Trips list) ──────────────────────────────────────────────────
function TripRow({ trip }: { trip: Trip }) {
  const { C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const swipeRef = useRef<Swipeable>(null);
  const start   = parseTripDate(trip.start);
  const end     = parseTripDate(trip.end);
  const days    = daysUntil(trip.start);
  const isPast  = daysUntil(trip.end) < 0;
  const isActive = days <= 0 && !isPast;
  const flag = destinationFlag(trip.destination);
  const dateRange = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const renderRightActions = useCallback(() => (
    <View style={{ flexDirection: "row" }}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` });
          swipeRef.current?.close();
        }}
        accessibilityRole="button"
        accessibilityLabel="Share trip"
        style={{
          backgroundColor: C.teal,
          justifyContent: "center",
          alignItems: "center",
          width: 72,
        }}
      >
        <ShareNetwork size={18} color={C.onAccent} weight="regular" />
        <Text style={{ color: C.onAccent, fontSize: T.xs, fontWeight: "700", marginTop: 4 }}>Share</Text>
      </Pressable>
    </View>
  ), [C, trip]);

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
    <ContextMenu
      actions={[
        { title: "Share Trip", systemIcon: "square.and.arrow.up" },
        { title: "Copy Link", systemIcon: "link" },
      ]}
      onPress={(e: { nativeEvent: { index: number } }) => {
        if (e.nativeEvent.index === 0) {
          Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` });
        }
      }}
    >
    <Link href={`/trip/${trip.id}`} asChild>
    <ScalePress
      style={styles.row}
      onPress={() => { Haptics.selectionAsync(); }}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, ${trip.destination || ""}, ${isPast ? "past trip" : isActive ? "active now" : `${days} days away`}`}
    >
      {Platform.OS === "ios" && Link.AppleZoom ? (
        <Link.AppleZoom>
          <CachedImage uri={trip.image} style={styles.rowThumb} accessible={false} />
        </Link.AppleZoom>
      ) : (
        <CachedImage uri={trip.image} style={styles.rowThumb} accessible={false} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{trip.name}</Text>
        {trip.destination ? (
          <Text style={styles.rowDest} numberOfLines={1}>
            {flag ? `${flag}  ` : ""}{trip.destination}
          </Text>
        ) : null}
        <Text style={[styles.rowFact, isActive && { color: C.tealText }]} numberOfLines={1}>
          {isPast ? `${dateRange} · ${tripLengthDays(trip)} days` : tripFactLine(trip)}
        </Text>
      </View>
      <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center", marginLeft: 2 }} />
    </ScalePress>
    </Link>
    </ContextMenu>
    </Swipeable>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const { trips, ready, offline, reload } = useTrips();
  const router = useRouter();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    const ok = await reload();
    setRefreshing(false);
    toast(ok ? "You're all up to date" : "You're offline");
  }, [reload, toast]);

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

  // The trip on the cover: the next one that is not a draft, else the most recent.
  const heroTrip = useMemo(() =>
    sorted.filter(t => t.status !== "Draft").find(t => parseTripDate(t.end) >= new Date()) ??
    sorted.find(t => parseTripDate(t.end) >= new Date()) ??
    (sorted.length ? sorted[sorted.length - 1] : null),
    [sorted]);

  const otherTrips = useMemo(() => sorted.filter(t => t.id !== heroTrip?.id), [sorted, heroTrip]);

  // The day the Itinerary card shows: today while travelling, otherwise the first day.
  const todayStr = new Date().toISOString().slice(0, 10);
  const heroDay = useMemo(() => {
    if (!heroTrip) return { date: null as string | null, events: [] as TravelEvent[], dayCount: 0 };
    const dates = [...new Set(heroTrip.events.map(e => e.date))].sort();
    const date = dates.includes(todayStr) ? todayStr : (dates.find(d => d >= todayStr) ?? dates[0] ?? null);
    const events = date ? heroTrip.events.filter(e => e.date === date) : [];
    return { date, events, dayCount: dates.length };
  }, [heroTrip, todayStr]);

  // Latest photos — diversify across uploaders, then fill chronologically
  const latestPhotos = useMemo(() => {
    if (!heroTrip?.media?.length) return [];
    const all = [...heroTrip.media]
      .filter(m => m.type === "image" && m.url?.startsWith("https://"))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    const seen = new Set<string>();
    const picks: typeof all = [];
    for (const m of all) {
      const key = m.uploadedBy || m.uploaderId || "";
      if (!seen.has(key)) { seen.add(key); picks.push(m); }
      if (picks.length >= 8) break;
    }
    if (picks.length < 8) {
      for (const m of all) {
        if (!picks.includes(m)) picks.push(m);
        if (picks.length >= 8) break;
      }
    }
    return picks;
  }, [heroTrip]);

  const fmtDay = shortDay;
  const factLine = tripFactLine;

  // Ground the photo fades into: the page colour, thinner in light mode so the photo keeps
  // showing through instead of washing out to white.
  const onGround = isDark ? "#fff" : C.textPrimary;
  const heroActions = heroTrip ? [
    { label: "Itinerary", Icon: CalendarDots, go: () => router.push(`/trip/${heroTrip.id}`) },
    { label: "Today", Icon: MapTrifold, go: () => router.push("/(tabs)/destinations") },
    { label: "Photos", Icon: Camera, go: () => router.push("/(tabs)/media") },
    { label: "Info", Icon: Info, go: () => router.push(`/trip/info?tripId=${heroTrip.id}`) },
  ] : [];

  return (
    <View style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + S.xs }]}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >
        {/* ── The photo, blurred, sits behind the whole page; a scrim rises to the page colour ── */}
        {ready && heroTrip ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <CachedImage uri={heroTrip.image} blurRadius={90} style={[StyleSheet.absoluteFill, { opacity: 0.95 }]} transition={0} />
            <View style={StyleSheet.absoluteFill}>
              {/* Barely there where the sharp photo dissolves, then solid page colour under the content */}
              <LinearGradient
                colors={[`${C.bg}1a`, `${C.bg}b3`, C.bg]}
                locations={[0, 0.55, 1]}
                style={{ height: HERO_H + insets.top + 300 }}
              />
              <View style={{ flex: 1, backgroundColor: C.bg }} />
            </View>
          </View>
        ) : null}

        {/* Top bar scrolls away with the cover; it also owns the join sheet */}
        <GreetingHero
          nextTrip={heroTrip ?? undefined}
          isActive={isNextActive}
          onPress={(t) => router.push(`/trip/${t.id}`)}
        />

        {/* ── Cover ── */}
        {!ready ? (
          <View style={[styles.hero, { height: HERO_H + insets.top, backgroundColor: C.elevated }]} />
        ) : heroTrip ? (
          <>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${heroTrip.id}`); }}
              accessibilityRole="button"
              accessibilityLabel={`${heroTrip.name}. ${factLine(heroTrip)}`}
            >
              <View style={[styles.hero, { height: HERO_H + insets.top }]}>
                {/* Sharp photo dissolves into the blurred wash beneath it, so there is no edge */}
                <MaskedView
                  style={StyleSheet.absoluteFill}
                  maskElement={
                    <LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.45, 1]} style={{ flex: 1 }} />
                  }
                >
                  <CachedImage uri={heroTrip.image} style={StyleSheet.absoluteFill} />
                </MaskedView>
                <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} locations={[0, 0.35]} style={StyleSheet.absoluteFill} />
                <View style={styles.heroBody}>
                  {heroTrip.destination ? <Text style={[styles.heroDest, styles.heroShadow]} numberOfLines={1}>{heroTrip.destination}</Text> : null}
                  <Text style={[styles.heroName, styles.heroShadow]} numberOfLines={2}>{heroTrip.name}</Text>
                  <Text style={[styles.heroFact, styles.heroShadow]} numberOfLines={1}>{factLine(heroTrip)}</Text>
                  <Text style={[styles.heroDates, styles.heroShadow]}>{fmtDay(heroTrip.start)} → {fmtDay(heroTrip.end)}</Text>
                </View>
              </View>
            </Pressable>

            {/* ── Actions ── */}
            <View style={styles.actions}>
              {heroActions.map(a => (
                <Pressable
                  key={a.label}
                  onPress={() => { Haptics.selectionAsync(); a.go(); }}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={styles.actionCircle}>
                    <a.Icon size={22} color={onGround} weight="fill" />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Offline banner ── */}
            {offline && (
              <View style={styles.offlineBanner}>
                <WifiSlash size={14} color={C.textTertiary} weight="regular" />
                <Text style={styles.offlineText}>You're offline. Showing saved trips.</Text>
              </View>
            )}

            {/* ── Itinerary ── */}
            <FadeIn delay={60}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Itinerary</Text>
                  {heroDay.date ? (
                    <Text style={styles.cardMeta}>
                      {parseTripDate(heroDay.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </Text>
                  ) : null}
                </View>
                {heroDay.events.length === 0 ? (
                  <Text style={styles.cardEmpty}>Nothing on the itinerary yet. Your organiser is still adding to it.</Text>
                ) : heroDay.events.slice(0, 4).map((ev, i) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => { Haptics.selectionAsync(); router.push(`/trip/event?tripId=${heroTrip.id}&eventId=${ev.id}`); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${normaliseTitle(ev.title, ev.type, ev.transferType)}${ev.time ? `, ${ev.time}` : ""}`}
                    style={({ pressed }) => [styles.evRow, i > 0 && styles.evRowBorder, { backgroundColor: pressed ? C.elevated : "transparent" }]}
                  >
                    <CategoryDot type={ev.type} transferType={ev.transferType} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.evTitle} numberOfLines={1}>{normaliseTitle(ev.title, ev.type, ev.transferType)}</Text>
                      {ev.location ? <Text style={styles.evSub} numberOfLines={1}>{ev.location}</Text> : null}
                    </View>
                    {ev.time ? (
                      <Text style={[styles.evTime, /^tb[acd]$/i.test(ev.time) && { color: C.textTertiary }]}>{ev.time}</Text>
                    ) : null}
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); router.push(`/trip/${heroTrip.id}`); }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cardFooter, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={styles.cardLink}>
                    {heroDay.dayCount > 1 ? `See all ${heroDay.dayCount} days` : "Open itinerary"}
                  </Text>
                </Pressable>
              </View>
            </FadeIn>

            {/* ── Photos ── */}
            <FadeIn delay={120}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Photos</Text>
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/media"); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={latestPhotos.length > 0 ? "See all photos" : "Add a photo"}
                  >
                    <Text style={styles.cardLink}>{latestPhotos.length > 0 ? "See all" : "Add"}</Text>
                  </Pressable>
                </View>
                {latestPhotos.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoStrip}
                  >
                    {latestPhotos.map((photo) => {
                      const firstName = (photo.uploadedBy || "").split(/\s+/)[0];
                      const initial = firstName ? firstName[0].toUpperCase() : "";
                      return (
                        <Pressable
                          key={photo.id}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/media"); }}
                          accessibilityRole="button"
                          accessibilityLabel={firstName ? `Photo by ${firstName}` : "Trip photo"}
                          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                        >
                          <CachedImage uri={photo.url} style={styles.latestPhoto} />
                          {firstName ? (
                            <View style={styles.photoCaption}>
                              <Avatar size={16} initials={initial} />
                              <Text style={styles.photoCaptionText} numberOfLines={1}>
                                {firstName} · {relativeTime(photo.uploadedAt)}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.cardEmpty}>No photos yet. Be the first to share a moment from this trip.</Text>
                )}
              </View>
            </FadeIn>
          </>
        ) : null}

        {/* ── Other trips ── */}
        {ready && otherTrips.length > 0 && (
          <FadeIn delay={180}>
            <View style={styles.section}>
              <Text style={styles.groupHeader}>Trips</Text>
              <View style={styles.listCard}>
                {otherTrips.map((trip, i) => (
                  <View key={trip.id}>
                    <TripRow trip={trip} />
                    {i < otherTrips.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>
        )}

        {/* ── Empty state ── */}
        {ready && trips.length === 0 && (
          <View style={[styles.emptyState, { paddingTop: insets.top + 96 }]}>
            {offline ? (
              <EmptyState
                icon={<WifiSlash size={30} color={C.textTertiary} weight="light" />}
                title="You're offline"
                message="Your trips will appear here once you're back online."
              />
            ) : (
              <EmptyState
                title="No trips yet"
                message="Tap + and enter the PIN your organiser sent to open your itinerary."
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: {},

    section: { marginTop: S.lg },

    // ── Cover ──
    hero: { overflow: "hidden", justifyContent: "flex-end" },
    heroBody: { paddingHorizontal: S.lg, paddingBottom: S.sm, gap: 3, alignItems: "center" },
    heroShadow: isDark ? {
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    } : {},
    heroDest: {
      fontSize: T.sm, fontWeight: T.bold, color: isDark ? "rgba(255,255,255,0.9)" : C.textPrimary,
      textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center",
    },
    heroName: {
      fontSize: 30, lineHeight: 34, fontWeight: T.bold, color: isDark ? "#fff" : C.textPrimary, letterSpacing: -0.4, textAlign: "center",
    },
    heroFact: { fontSize: T.base, fontWeight: T.semibold, color: isDark ? "rgba(255,255,255,0.92)" : C.textPrimary, marginTop: 2, textAlign: "center" },
    heroDates: { fontSize: T.sm, color: isDark ? "rgba(255,255,255,0.72)" : C.textSecondary, textAlign: "center" },

    // ── Actions ──
    actions: {
      flexDirection: "row", justifyContent: "space-between",
      paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.md,
    },
    action: { alignItems: "center", gap: S.xs2, minWidth: 64 },
    actionCircle: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.09)",
      alignItems: "center", justifyContent: "center",
    },
    actionLabel: { fontSize: T.xs, fontWeight: T.medium, color: C.textPrimary },

    // ── Inset cards ──
    card: {
      marginHorizontal: S.md, marginTop: S.sm,
      backgroundColor: C.card, borderRadius: R.lg, overflow: "hidden",
      ...shadow("card", isDark),
    },
    cardHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, paddingTop: S.sm2, paddingBottom: S.xs2,
    },
    cardTitle: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary },
    cardMeta: { fontSize: T.sm, color: C.textTertiary },
    cardEmpty: { fontSize: T.sm, color: C.textTertiary, lineHeight: 19, paddingHorizontal: S.md, paddingBottom: S.md },
    cardFooter: { paddingHorizontal: S.md, paddingVertical: S.sm2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    cardLink: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },
    groupHeader: {
      fontSize: T.sm, color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.3,
      paddingHorizontal: S.md + S.sm, marginBottom: S.xs,
    },

    // ── Itinerary rows ──
    evRow: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 48 },
    evRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    evTitle: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    evSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 1 },
    evTime: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText, fontVariant: ["tabular-nums"] },

    // ── Trip rows ──
    listCard: {
      marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R.xl,
      overflow: "hidden",
      ...shadow("card", isDark),
    },
    row: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md, paddingVertical: S.sm },
    rowDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.md + 60 + S.md,
    },
    rowThumb: { width: 60, height: 60, borderRadius: R.lg, backgroundColor: C.elevated },
    rowBody: { flex: 1, gap: 2 },
    rowName: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    rowDest: { fontSize: T.sm, color: C.textSecondary },
    rowFact: { fontSize: T.sm, color: C.textTertiary },
    photoStrip: { gap: S.sm2, paddingHorizontal: S.md, paddingBottom: S.md },
    latestPhoto: {
      width: 104, height: 138, borderRadius: R.sm,
      backgroundColor: C.elevated,
    },
    photoCaption: {
      flexDirection: "row", alignItems: "center", gap: S["2xs"], marginTop: S.xs2,
    },
    photoCaptionText: {
      fontSize: T.xs, color: C.textTertiary, maxWidth: 100,
    },

    // ── Offline banner ──
    offlineBanner: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S.xs, paddingVertical: S.sm2, paddingHorizontal: S.md,
      backgroundColor: C.elevated, borderRadius: R.lg,
      marginHorizontal: S.md, marginTop: S.sm,
    },
    offlineText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary,
    },

    // ── Empty ──
    emptyState: {
      alignItems: "center",
    },
  });
}
