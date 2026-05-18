import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform, Share,
  Dimensions,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { Swipeable } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, withSpring, withDelay, withTiming,
  Easing, runOnJS, interpolate,
} from "react-native-reanimated";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import { TripCardSkeleton, SpotlightCardSkeleton, TripRowSkeleton } from "@/components/Skeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

let GlassView: any = null;
let HAS_LIQUID_GLASS = false;
try {
  const glass = require("expo-glass-effect");
  GlassView = glass.GlassView;
  HAS_LIQUID_GLASS = glass.isLiquidGlassAvailable();
} catch { /* native module unavailable on this device */ }
import { useRouter, Link } from "expo-router";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  MapPin, CaretRight, CalendarDots, Users,
  ArrowUpRight, Heart, ShareNetwork, Compass, Bed, ForkKnife, AirplaneTilt,
  Bell, Sun, Moon, Plus, X as XIcon, Scan, Link as LinkIcon, Hash,
  Check, Clock, WifiSlash, ClipboardText, WarningCircle, Question,
  Images, Info, Camera,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Illustration } from "@/components/Illustration";
import { Logo } from "@/components/Logo";
import { NotificationSheet } from "@/components/NotificationSheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTrips, TRIPS_CTX_VERSION } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { usePreferences } from "@/context/PreferencesContext";
import { type ThemeColors, T, R, S, TAB_BAR_HEIGHT } from "@/constants/theme";
import type { Trip, TravelEvent } from "@/shared/types";
import { fetchTripByShortCode, fetchTripById } from "@/services/firebaseTrips";
import { StatusIndicator } from "@/components/StatusIndicator";


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

function daysUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
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
    checkScale.value = withDelay(300, withSpring(1, { damping: 10, stiffness: 180 }));
    copyOpacity.value = withDelay(600, withTiming(1, { duration: 300 }));
    copyY.value = withDelay(600, withSpring(0, { damping: 14, stiffness: 100 }));
    pillsOpacity.value = withDelay(750, withTiming(1, { duration: 300 }));
    ctaOpacity.value = withDelay(1100, withTiming(1, { duration: 300 }));
    ctaY.value = withDelay(1100, withSpring(0, { damping: 14, stiffness: 100 }));
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

  const nights = Math.max(0, Math.ceil((new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000));
  const startDate = new Date(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = new Date(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
              shadowColor: C.teal, shadowOpacity: 0.4, shadowRadius: 20,
              shadowOffset: { width: 0, height: 0 }, elevation: 8,
            }}>
              <Check size={32} color="#000" weight="bold" />
            </View>
          </Animated.View>

          {/* Bottom overlay — trip name + destination */}
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md }}>
            {trip.destination && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <MapPin size={10} color={C.teal} weight="fill" />
                <Text style={{
                  fontSize: T.xs, fontWeight: "700", color: "rgba(255,255,255,0.7)",
                  letterSpacing: 1.5, textTransform: "uppercase",
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
            <Text style={{ fontSize: T.sm, fontWeight: "600", color: C.teal }}>
              {welcomeText}
            </Text>
          </Animated.View>

          <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap" }, pillsStyle]}>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: C.elevated, borderRadius: R.full,
              paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <CalendarDots size={11} color={C.textTertiary} weight="regular" />
              <Text style={{ fontSize: T.xs, color: C.textSecondary, fontWeight: "600" }}>
                {startDate} - {endDate}
              </Text>
            </View>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: C.elevated, borderRadius: R.full,
              paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <Clock size={11} color={C.textTertiary} weight="regular" />
              <Text style={{ fontSize: T.xs, color: C.textSecondary, fontWeight: "600" }}>
                {nights} night{nights !== 1 ? "s" : ""}
              </Text>
            </View>
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
          <Text style={{
            fontSize: T.sm, fontWeight: "700", color: "#000",
            letterSpacing: 1.2, textTransform: "uppercase",
          }}>See itinerary</Text>
          <CaretRight size={14} color="#000" weight="bold" />
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
            QR scanning needs a rebuild.
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
          <Text style={[styles.codeSubmitText, { color: "#000" }]}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.modeContent}>
      <View style={styles.qrFrame}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
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

// ── Live Countdown ────────────────────────────────────────────────────────────

/** Get the actual departure timestamp from the chronologically earliest event */
function getFirstEventTime(trip: Trip): string {
  let earliest: Date | null = null;

  for (const ev of trip.events ?? []) {
    if (!ev.date || !ev.time) continue;
    const match = ev.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) continue;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = new Date(ev.date);
    d.setHours(hours, mins, 0, 0);
    if (!earliest || d < earliest) earliest = d;
  }

  return earliest ? earliest.toISOString() : trip.start;
}

function useLiveCountdown(trip: Trip | undefined) {
  const target = trip ? getFirstEventTime(trip) : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    // On Android, update less frequently to reduce re-renders
    const interval = Platform.OS === "android" ? 10000 : 1000;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s, total: diff };
}

function LiveCountdownDisplay({ countdown, C }: {
  countdown: { d: number; h: number; m: number; s: number };
  C: ThemeColors;
}) {
  const units = [
    { value: countdown.d, label: "DAYS" },
    { value: countdown.h, label: "HRS" },
    { value: countdown.m, label: "MIN" },
    { value: countdown.s, label: "SEC" },
  ];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {units.map((u, i) => (
        <View key={u.label} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ alignItems: "center", minWidth: 40 }}>
            <Text style={{
              fontSize: 34,
              fontWeight: "700",
              color: C.textPrimary,
              letterSpacing: -1,
              lineHeight: 38,
              fontVariant: ["tabular-nums"],
            }}>
              {String(u.value).padStart(2, "0")}
            </Text>
            <Text style={{
              fontSize: 8,
              fontWeight: "700",
              color: C.textTertiary,
              letterSpacing: 2,
              marginTop: 1,
            }}>
              {u.label}
            </Text>
          </View>
          {i < 3 && (
            <Text style={{
              fontSize: 22,
              fontWeight: "800",
              color: C.teal,
              marginHorizontal: 1,
              lineHeight: 38,
              marginBottom: 12,
              opacity: 0.6,
            }}>
              :
            </Text>
          )}
        </View>
      ))}
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifOpen, setNotifOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [linkValue, setLinkValue] = useState("");
  const [entryMode, setEntryMode] = useState<"pin" | "qr" | "link">("pin");
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
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
  const styles = useMemo(() => makeGreetingStyles(C), [C]);
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = (prefs.name || "").trim().split(/\s+/)[0] || "";
  const greetingPrefix = firstName ? `${timeOfDay}, ` : timeOfDay;
  const greetingLen = (greetingPrefix + firstName).length;
  const greetingFontSize = greetingLen > 26 ? 13 : greetingLen > 22 ? 14 : T.base;
  const days = nextTrip ? Math.max(0, daysUntil(nextTrip.start)) : 0;
  const totalDays = nextTrip ? Math.max(1, Math.round((new Date(nextTrip.end + "T00:00:00").getTime() - new Date(nextTrip.start + "T00:00:00").getTime()) / 86400000) + 1) : 0;
  const dayOfTrip = (() => {
    if (!nextTrip || !isActive) return 0;
    const s = new Date(nextTrip.start + "T00:00:00");
    const n = new Date(); n.setHours(0, 0, 0, 0);
    return Math.max(1, Math.min(totalDays, Math.floor((n.getTime() - s.getTime()) / 86400000) + 1));
  })();

  const closeSheet = () => {
    setCodeOpen(false);
    setDigits(["", "", "", "", "", ""]);
    setLinkValue("");
    setEntryMode("pin");
    setCodeError(null);
    setFoundTrip(null);
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
      revealAndNavigate(trip);
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
      revealAndNavigate(trip);
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

  const handleDigitChange = (idx: number, val: string) => {
    const clean = val.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase();
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    if (codeError) setCodeError(null);

    if (clean) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (idx < 5) pinRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => d.length === 1)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      submitPin(next.join(""));
    }
  };

  const handleDigitKeyPress = (idx: number, key: string) => {
    if (key === "Backspace" && !digits[idx] && idx > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pinRefs.current[idx - 1]?.focus();
      const next = [...digits];
      next[idx - 1] = "";
      setDigits(next);
    }
  };

  return (
    <View style={[styles.outer, { paddingTop: Platform.OS === "ios" ? 56 : insets.top + S.xs }]}>
      {/* Top bar — avatar (left) · logo (center) · + and bell (right) */}
      <View style={styles.topBar}>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [styles.avatarBtn, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityLabel="Profile"
            hitSlop={6}
          >
            {prefs.avatar ? (
              <CachedImage uri={prefs.avatar} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>
                {(prefs.name || "").trim().charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </Pressable>
        </View>
        <Logo size={24} color={C.teal} />
        <View style={[styles.headerActions, { justifyContent: "flex-end" }]}>
          <Pressable
            onPress={() => setCodeOpen(true)}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityLabel="Enter trip code"
            hitSlop={6}
          >
            <Plus size={22} color={C.textSecondary} weight="regular" />
          </Pressable>
          <Pressable
            onPress={() => setNotifOpen(true)}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            hitSlop={6}
          >
            <Bell size={22} color={C.textSecondary} weight="regular" />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Greeting + countdown chip */}
      <View style={styles.greetingRow}>
        <Text
          style={[styles.greeting, { fontSize: greetingFontSize }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          <Text style={{ color: C.textSecondary }}>{greetingPrefix}</Text>
          {firstName ? <Text style={{ color: C.textPrimary }}>{firstName}</Text> : null}
        </Text>
        {nextTrip ? (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(nextTrip); }}
            style={({ pressed }) => [styles.countdownChip, pressed && { opacity: 0.7 }]}
            accessibilityLabel={
              isActive
                ? dayOfTrip <= 1 ? "On your way" : `Day ${dayOfTrip} in ${nextTrip.destination || nextTrip.name}`
                : days === 0 ? "Departs today"
                : days === 1 ? "Departs tomorrow"
                : `Departs in ${days} days`
            }
            hitSlop={6}
          >
            <Text style={styles.countdownChipText} numberOfLines={1}>
              {isActive
                ? dayOfTrip <= 1
                  ? "On your way"
                  : `Day ${dayOfTrip} in ${nextTrip.destination || nextTrip.name}`
                : days === 0 ? "Departs today"
                : days === 1 ? "Departs tomorrow"
                : days <= 7 ? `In ${days} days`
                : `Departs ${new Date(nextTrip.start + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}`}
            </Text>
          </Pressable>
        ) : null}
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
              <View style={styles.sheetGrabber} />

              {/* Success reveal */}
              {foundTrip ? (
                <TripFoundReveal trip={foundTrip} C={C} onContinue={handleRevealContinue} />
              ) : (
              <>
              {/* Header */}
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }} />
                <Pressable onPress={closeSheet} style={styles.codeClose} hitSlop={8}>
                  <XIcon size={13} color={C.textSecondary} weight="bold" />
                </Pressable>
              </View>

              {/* Hero — Fix 4: unified "PIN" terminology */}
              <View style={styles.bpHero}>
                <View style={styles.bpIconWrap}>
                  <AirplaneTilt size={28} color={C.teal} weight="light" />
                </View>
                <Text style={styles.bpTitle}>Join a Trip</Text>
                <Text style={styles.bpSub}>Enter the 6-digit PIN from your organiser</Text>
              </View>

              {/* Mode tabs — Fix 7: consistent active/inactive treatment */}
              <View style={styles.modeTabs}>
                {([
                  { key: "pin" as const, icon: Hash, label: "PIN" },
                  { key: "qr" as const, icon: Scan, label: "Scan" },
                  { key: "link" as const, icon: LinkIcon, label: "Link" },
                ]).map(({ key, icon: Ic, label }) => {
                  const active = entryMode === key;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.modeTab, active && styles.modeTabActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setCodeError(null);
                        setDigits(["", "", "", "", "", ""]);
                        setLinkValue("");
                        setEntryMode(key);
                      }}
                    >
                      <Ic size={14} color={active ? C.teal : C.textDim} weight="regular" />
                      <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* PIN entry — Fixes 1-6 */}
              {entryMode === "pin" && (
                <View style={styles.modeContent}>
                  {/* Fix 3: paste button */}
                  <View style={styles.pasteRow}>
                    <Pressable
                      onPress={handlePaste}
                      style={({ pressed }) => [styles.pasteBtn, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <ClipboardText size={14} color={C.teal} weight="regular" />
                      <Text style={styles.pasteBtnText}>Paste</Text>
                    </Pressable>
                  </View>

                  {/* Fix 1+2: focus-aware cells, tighter layout with shake */}
                  <Animated.View style={[styles.pinRow, shakeStyle]}>
                    <View style={styles.pinGroup}>
                      {digits.slice(0, 3).map((d, i) => (
                        <TextInput
                          key={i}
                          ref={(r) => { pinRefs.current[i] = r; }}
                          value={d}
                          onChangeText={(v) => handleDigitChange(i, v)}
                          onKeyPress={(e) => handleDigitKeyPress(i, e.nativeEvent.key)}
                          onFocus={() => setFocusedIdx(i)}
                          onBlur={() => setFocusedIdx(-1)}
                          keyboardType="default"
                          autoCapitalize="characters"
                          textContentType="oneTimeCode"
                          maxLength={1}
                          autoFocus={i === 0}
                          selectTextOnFocus
                          editable={!resolving}
                          accessibilityLabel={`Character ${i + 1} of 6`}
                          style={[
                            styles.pinCell,
                            d ? styles.pinCellFilled : null,
                            focusedIdx === i ? styles.pinCellFocused : null,
                            codeError ? styles.pinCellError : null,
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.pinSeparator}>·</Text>
                    <View style={styles.pinGroup}>
                      {digits.slice(3, 6).map((d, i) => (
                        <TextInput
                          key={i + 3}
                          ref={(r) => { pinRefs.current[i + 3] = r; }}
                          value={d}
                          onChangeText={(v) => handleDigitChange(i + 3, v)}
                          onKeyPress={(e) => handleDigitKeyPress(i + 3, e.nativeEvent.key)}
                          onFocus={() => setFocusedIdx(i + 3)}
                          onBlur={() => setFocusedIdx(-1)}
                          keyboardType="default"
                          autoCapitalize="characters"
                          textContentType="oneTimeCode"
                          maxLength={1}
                          selectTextOnFocus
                          editable={!resolving}
                          accessibilityLabel={`Character ${i + 4} of 6`}
                          style={[
                            styles.pinCell,
                            d ? styles.pinCellFilled : null,
                            focusedIdx === (i + 3) ? styles.pinCellFocused : null,
                            codeError ? styles.pinCellError : null,
                          ]}
                        />
                      ))}
                    </View>
                  </Animated.View>

                  {/* Fix 5: CTA with loading state */}
                  <Pressable
                    onPress={() => { if (digits.every(d => d)) submitPin(digits.join("")); }}
                    disabled={!digits.every(d => d) || resolving}
                    style={({ pressed }) => [
                      styles.codeSubmit,
                      {
                        width: "100%",
                        marginTop: S.md,
                        backgroundColor: digits.every(d => d) && !resolving ? C.teal : C.elevated,
                        opacity: pressed && digits.every(d => d) && !resolving ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.codeSubmitText, { color: digits.every(d => d) && !resolving ? "#000" : C.textTertiary }]}>
                      {resolving ? "Joining trip…" : "Join Trip"}
                    </Text>
                  </Pressable>

                  {/* Fix 6: error callout */}
                  {codeError ? (
                    <View style={styles.errorCallout}>
                      <WarningCircle size={14} color={C.red} weight="fill" />
                      <Text style={styles.errorCalloutText}>{codeError}</Text>
                    </View>
                  ) : !resolving ? (
                    <Text style={styles.pinHint}>Don't have a PIN? Ask your organiser.</Text>
                  ) : null}
                </View>
              )}

              {/* QR scanner */}
              {entryMode === "qr" && (
                <QRScanPane
                  C={C}
                  styles={styles}
                  onScanned={(data) => {
                    const match = data.match(/shared\/([A-Za-z0-9_-]+)/);
                    const id = match ? match[1] : null;
                    if (id) {
                      submitTripId(id);
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      setCodeError("QR code doesn't contain a valid trip link");
                      setEntryMode("pin");
                    }
                  }}
                />
              )}

              {/* Link paste — Fix 8: improved with paste + CTA */}
              {entryMode === "link" && (
                <View style={[styles.modeContent, { width: "100%" }]}>
                  <View style={{ width: "100%", position: "relative" as const }}>
                    <TextInput
                      value={linkValue}
                      onChangeText={(t) => { setLinkValue(t); if (codeError) setCodeError(null); }}
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="dalefy.app/trip/..."
                      placeholderTextColor={C.textTertiary}
                      style={[styles.codeInput, { width: "100%", paddingRight: 72 }]}
                      onSubmitEditing={submitLink}
                      returnKeyType="go"
                    />
                    <Pressable
                      onPress={async () => {
                        try {
                          const text = await Clipboard.getStringAsync();
                          if (text) { setLinkValue(text.trim()); setCodeError(null); }
                        } catch {}
                      }}
                      style={({ pressed }) => [styles.linkPasteBtn, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <Text style={styles.linkPasteBtnText}>Paste</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.pinHint}>Paste an invite link from your organiser</Text>
                  {codeError ? (
                    <View style={styles.errorCallout}>
                      <WarningCircle size={14} color={C.red} weight="fill" />
                      <Text style={styles.errorCalloutText}>{codeError}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={submitLink}
                    disabled={!linkValue.trim() || resolving}
                    style={({ pressed }) => [
                      styles.codeSubmit,
                      {
                        width: "100%",
                        backgroundColor: linkValue.trim() && !resolving ? C.teal : C.elevated,
                        opacity: pressed && linkValue.trim() && !resolving ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.codeSubmitText, { color: linkValue.trim() && !resolving ? "#000" : C.textTertiary }]}>
                      {resolving ? "Joining trip…" : "Join Trip"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Fix 9: help link at bottom */}
              <View style={styles.helpRow}>
                <Question size={14} color={C.textTertiary} weight="regular" />
                <Text style={styles.helpText}>Don't have a PIN? Get help</Text>
              </View>
              </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function makeGreetingStyles(C: ThemeColors) {
  return StyleSheet.create({
    outer: {
      marginBottom: S.xs,
      backgroundColor: C.card,
      overflow: "hidden",
      paddingHorizontal: S.md, paddingBottom: S.sm,
    },
    topBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginBottom: S.xs, zIndex: 2,
    },
    greetingRow: {
      flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
      gap: 8, marginBottom: S.xs,
    },
    greeting: {
      fontWeight: T.regular,
      color: C.textPrimary,
      letterSpacing: -0.2,
      flexShrink: 1,
    },
    countdownChip: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: `${C.teal}08`,
      paddingHorizontal: 6, paddingVertical: 4,
      borderRadius: R.full,
    },
    countdownChipText: {
      fontSize: 12, fontWeight: T.semibold,
      color: C.teal,
    },
    headerActions: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: 4,
    },
    headerBtn: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: "center", justifyContent: "center",
    },
    avatarBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    },
    avatarImg: {
      width: 32, height: 32, borderRadius: 16,
    },
    avatarInitial: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary,
    },
    unreadBadge: {
      position: "absolute", top: 0, right: -2,
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: "#ff3b30",
      borderWidth: 1.5, borderColor: C.card,
      alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    },
    unreadBadgeText: {
      fontSize: 10, fontWeight: "700", color: "#fff",
      lineHeight: 12,
    },
    codeBackdrop: {
      backgroundColor: "rgba(0,0,0,0.12)",
    },
    codeCenter: {
      flex: 1, justifyContent: "flex-end",
    },
    codeSheet: {
      backgroundColor: HAS_LIQUID_GLASS ? "transparent" : C.card,
      paddingHorizontal: S.lg, paddingTop: S.xs, paddingBottom: S.xl,
    },
    sheetGrabber: {
      alignSelf: "center",
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: S.xs,
    },
    sheetHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
      marginBottom: S.xs,
    },
    codeClose: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: "center", justifyContent: "center",
      backgroundColor: C.elevated,
    },
    // ── Boarding pass hero ──
    bpHero: {
      alignItems: "center", paddingTop: S.md, paddingBottom: S.lg,
    },
    bpIconWrap: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
      marginBottom: S.md,
    },
    bpTitle: {
      fontSize: T["3xl"], fontWeight: "700",
      color: C.textPrimary, letterSpacing: -0.5,
      marginBottom: 6,
    },
    bpSub: {
      fontSize: T.sm, color: C.textTertiary,
      textAlign: "center", lineHeight: 20, maxWidth: 260,
    },
    // ── Mode tabs ──
    modeTabs: {
      flexDirection: "row", backgroundColor: C.elevated,
      borderRadius: R.lg, padding: 3, marginBottom: S.lg,
    },
    modeTab: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 5, paddingVertical: 9, borderRadius: R.md,
    },
    modeTabActive: {
      backgroundColor: C.card,
      ...Platform.select({
        ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
        android: { elevation: 2 },
      }),
    },
    modeTabText: {
      fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary,
    },
    modeTabTextActive: {
      fontWeight: T.bold, color: C.textPrimary,
    },
    // ── PIN entry ──
    modeContent: {
      alignItems: "center",
      paddingHorizontal: S.xs,
    },
    pasteRow: {
      flexDirection: "row", justifyContent: "flex-end",
      width: "100%", marginBottom: S.sm,
    },
    pasteBtn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingVertical: 4, paddingHorizontal: 8,
    },
    pasteBtnText: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.teal,
    },
    pinRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6,
    },
    pinGroup: {
      flexDirection: "row", gap: 6,
    },
    pinSeparator: {
      fontSize: 20, color: C.textTertiary, fontWeight: "300",
      marginHorizontal: 2,
    },
    pinCell: {
      width: 44, height: 52, borderRadius: R.md,
      borderWidth: 2, borderColor: C.border,
      backgroundColor: C.elevated,
      textAlign: "center",
      fontSize: 20, fontWeight: T.bold,
      color: C.textPrimary,
    },
    pinCellFilled: {
      borderColor: `${C.teal}60`, backgroundColor: C.tealDim,
    },
    pinCellFocused: {
      borderColor: C.teal, backgroundColor: C.card,
      ...Platform.select({
        ios: { shadowColor: C.teal, shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
        android: { elevation: 2 },
      }),
    },
    pinCellError: {
      borderColor: C.red, backgroundColor: C.redDim,
    },
    pinHint: {
      fontSize: T.xs, color: C.textTertiary,
      textAlign: "center", marginTop: S.sm,
    },
    checkingText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 1.5, textTransform: "uppercase",
      textAlign: "center", marginTop: S.xs,
    },
    errorCallout: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      marginTop: S.sm, padding: S.sm,
      borderRadius: R.md,
      backgroundColor: C.redDim,
      borderWidth: 1, borderColor: `${C.red}30`,
      width: "100%",
    },
    errorCalloutText: {
      flex: 1, fontSize: T.xs, fontWeight: T.medium,
      color: C.red, lineHeight: 17,
    },
    helpRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, marginTop: "auto" as any, paddingTop: S.xl,
    },
    helpText: {
      fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary,
    },
    qrFrame: {
      width: Dimensions.get("window").width - 80,
      height: Dimensions.get("window").width - 80,
      borderRadius: R["2xl"], overflow: "hidden",
      backgroundColor: "#000",
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
      paddingHorizontal: 10, paddingVertical: 6,
    },
    linkPasteBtnText: {
      fontSize: T.xs, fontWeight: T.semibold,
      color: C.textSecondary,
      backgroundColor: C.bg,
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: R.sm, overflow: "hidden",
    },
    codeSubmit: {
      height: 48, borderRadius: R.lg,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    codeSubmitText: {
      fontSize: T.sm, fontWeight: T.bold,
      letterSpacing: 1.5, textTransform: "uppercase",
    },
  });
}

// ── Hero Trip Card (16:9 banner for first upcoming) ──────────────────────────
function HeroTripCard({ trip }: { trip: Trip }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeHeroCardStyles(C), [C]);
  const start = new Date(trip.start);
  const end = new Date(trip.end);

  return (
    <ContextMenu
      actions={[{ title: "Share Trip", systemIcon: "square.and.arrow.up" }]}
      onPress={() => { Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` }); }}
    >
    <Link href={`/trip/${trip.id}`} asChild>
    <ScalePress style={styles.heroCard} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
      <View style={styles.heroImageWrap}>
        {Platform.OS === "ios" && Link.AppleZoom ? (
          <Link.AppleZoom><CachedImage uri={trip.image} style={styles.heroImage} /></Link.AppleZoom>
        ) : (
          <CachedImage uri={trip.image} style={styles.heroImage} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.65)"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.heroOverlay}>
          {trip.destination ? (
            <View style={styles.heroDestRow}>
              <MapPin size={10} color={C.teal} weight="fill" />
              <Text style={styles.heroDestText}>{trip.destination.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={styles.heroTripName} numberOfLines={2}>{trip.name}</Text>
          <View style={styles.heroMeta}>
            <CalendarDots size={10} color="rgba(255,255,255,0.7)" weight="regular" />
            <Text style={styles.heroMetaText}>
              {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" – "}
              {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
            {trip.paxCount ? (
              <>
                <Text style={styles.heroMetaDot}>·</Text>
                <Users size={10} color="rgba(255,255,255,0.7)" weight="regular" />
                <Text style={styles.heroMetaText}>{trip.paxCount}</Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </ScalePress>
    </Link>
    </ContextMenu>
  );
}

function makeHeroCardStyles(C: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      marginHorizontal: S.md, borderRadius: R["2xl"], overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15, shadowRadius: 20, elevation: 5,
    },
    heroImageWrap: { aspectRatio: 16 / 9, backgroundColor: C.elevated },
    heroImage: { width: "100%", height: "100%" },
    heroOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md },
    heroDestRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
    heroDestText: {
      fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.8)",
      letterSpacing: 1.5, textTransform: "uppercase",
    },
    heroTripName: {
      fontSize: T.xl, fontWeight: T.bold, color: "#fff",
      letterSpacing: -0.3, marginBottom: 6,
    },
    heroMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
    heroMetaText: { fontSize: T.xs, fontWeight: T.semibold, color: "rgba(255,255,255,0.7)" },
    heroMetaDot: { fontSize: T.xs, color: "rgba(255,255,255,0.4)" },
  });
}

// ── Compact Event Row (spotlight remaining) ──────────────────────────────────
function CompactEventRow({ ev, tripId }: { ev: TravelEvent; tripId?: string }) {
  const { C } = useTheme();
  const router = useRouter();
  const Icon = ev.type === "hotel" ? Bed : ev.type === "dining" ? ForkKnife : ev.type === "flight" ? AirplaneTilt : Compass;

  return (
    <Pressable
      onPress={() => { if (tripId) router.push(`/trip/event?tripId=${tripId}&eventId=${ev.id}`); }}
      style={({ pressed }) => [{
        flexDirection: "row" as const, alignItems: "center" as const, gap: S.sm,
        backgroundColor: C.card, borderRadius: R.xl,
        padding: S.sm, paddingRight: S.md,
        opacity: pressed ? 0.85 : 1,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
      }]}
    >
      <View style={{
        width: 42, height: 42, borderRadius: R.lg,
        backgroundColor: C.tealDim,
        alignItems: "center" as const, justifyContent: "center" as const,
      }}>
        <Icon size={18} color={C.teal} weight="regular" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary, lineHeight: 18 }} numberOfLines={2}>{normaliseTitle(ev.title, ev.type, ev.transferType)}</Text>
        {ev.location ? <Text style={{ fontSize: T.xs, color: C.textTertiary, marginTop: 1 }} numberOfLines={1}>{ev.location}</Text> : null}
      </View>
      {ev.time ? <Text style={{ fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary }}>{ev.time}</Text> : null}
      <CaretRight size={12} color={C.textTertiary} weight="light" />
    </Pressable>
  );
}

// ── Upcoming Card (compact horizontal, matches web) ───────────────────────────
function UpcomingCard({ trip }: { trip: Trip }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeUpcomingCardStyles(C), [C]);
  const days  = daysUntil(trip.start);
  const start = new Date(trip.start);
  const end   = new Date(trip.end);

  return (
    <ContextMenu
      actions={[
        { title: "Share Trip", systemIcon: "square.and.arrow.up" },
      ]}
      onPress={() => {
        Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` });
      }}
    >
    <Link href={`/trip/${trip.id}`} asChild>
    <ScalePress
      style={styles.card}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, ${trip.destination || ""}, ${days <= 0 ? "departing today" : `${days} days away`}`}
    >
      {Platform.OS === "ios" && Link.AppleZoom ? (
        <Link.AppleZoom>
          <CachedImage uri={trip.image} style={styles.thumb} accessible={false} />
        </Link.AppleZoom>
      ) : (
        <CachedImage uri={trip.image} style={styles.thumb} accessible={false} />
      )}
      <View style={styles.body}>
        {trip.destination ? (
          <Text style={styles.dest}>{trip.destination.toUpperCase()}</Text>
        ) : null}
        <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        <View style={styles.meta}>
          <CalendarDots size={9} color={C.textTertiary} weight="regular" />
          <Text style={styles.metaText}>
            {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
          {trip.paxCount ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Users size={9} color={C.textTertiary} weight="regular" />
              <Text style={styles.metaText}>{trip.paxCount}</Text>
            </>
          ) : null}
        </View>
      </View>
      <CaretRight size={14} color={C.textTertiary} weight="light" />
    </ScalePress>
    </Link>
    </ContextMenu>
  );
}

function makeUpcomingCardStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row", alignItems: "center", gap: S.md,
      backgroundColor: C.card, borderRadius: R["2xl"],
      padding: S.lg, marginHorizontal: S.md,
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
    },
    thumb: { width: 72, height: 72, borderRadius: R.xl, backgroundColor: C.elevated },
    body: { flex: 1 },
    dest: {
      fontSize: 9, fontWeight: T.bold, letterSpacing: 1,
      color: C.teal, marginBottom: 2,
    },
    name: {
      fontSize: T.base, fontWeight: T.bold,
      color: C.textPrimary, marginBottom: 4,
    },
    meta: { flexDirection: "row", alignItems: "center", gap: 5 },
    metaText: {
      fontSize: T.xs, fontWeight: T.bold,
      color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.5,
    },
    metaDot: { fontSize: T.xs, color: C.textTertiary },
    daysPill: {
      backgroundColor: C.teal, borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    daysText: { fontSize: T.xs, fontWeight: T.bold, color: "#000", letterSpacing: 0.5 },
  });
}

// ── Spotlight Event Card ───────────────────────────────────────────────────────
function SpotlightEventCard({ ev, tripId }: { ev: TravelEvent; tripId?: string }) {
  const { C } = useTheme();
  const router = useRouter();
  const Icon  = ev.type === "hotel" ? Bed
    : ev.type === "dining" ? ForkKnife
    : ev.type === "flight" ? AirplaneTilt
    : Compass;

  const styles = useMemo(() => makeSpotlightCardStyles(C), [C]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    if (!ev.date || !ev.time) return null;
    const match = ev.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = new Date(ev.date);
    d.setHours(hours, mins, 0, 0);
    const ms = d.getTime() - now;
    if (ms < 0) return "Now";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `Starts in ${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return `Starts in ${h}h ${rm}m`;
    return `Starts in ${Math.round(h / 24)}d`;
  }, [ev.date, ev.time, now]);

  const handlePress = () => {
    if (tripId) router.push(`/trip/event?tripId=${tripId}&eventId=${ev.id}`);
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      {ev.image ? (
        <CachedImage uri={ev.image} style={styles.img} />
      ) : (
        <View style={styles.imgPlaceholder}>
          <Icon size={22} color={C.teal} weight="light" style={{ opacity: 0.5 }} />
        </View>
      )}

      <View style={styles.content}>
        {countdown && (
          <View style={styles.countdownRow}>
            <StatusIndicator state={countdown === "Now" ? "live" : "upcoming"} size={10} color={C.teal} />
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>{normaliseTitle(ev.title, ev.type, ev.transferType)}</Text>
        {(ev.location || ev.notes) ? (
          <Text style={styles.sub} numberOfLines={2}>{ev.location || ev.notes}</Text>
        ) : null}

        <View style={styles.infoRow}>
          {ev.time ? (
            <View style={styles.infoChip}>
              <Clock size={11} color={C.textTertiary} weight="regular" />
              <Text style={styles.infoText}>{ev.time}</Text>
            </View>
          ) : null}
          {ev.location ? (
            <View style={styles.infoChip}>
              <MapPin size={11} color={C.textTertiary} weight="regular" />
              <Text style={styles.infoText} numberOfLines={1}>{ev.location}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function makeSpotlightCardStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      backgroundColor: C.card, borderRadius: R["2xl"],
      overflow: "hidden", minHeight: 120,
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
    },
    img: { width: 120, ...Platform.select({ ios: { alignSelf: "stretch" as const }, android: { height: "100%" as any, minHeight: 120 } }) },
    imgPlaceholder: {
      width: 120, ...Platform.select({ ios: { alignSelf: "stretch" as const }, android: { height: "100%" as any, minHeight: 120 } }),
      backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
    },
    content: { flex: 1, padding: S.md, justifyContent: "space-between" },
    countdownRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
    countdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.teal },
    countdownText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 0.5, fontVariant: ["tabular-nums"],
    },
    title: {
      fontSize: T.lg, fontWeight: T.bold,
      color: C.textPrimary, marginBottom: 3,
    },
    sub: { fontSize: T.sm, color: C.textSecondary, lineHeight: 20 },
    infoRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 },
    infoChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: C.elevated, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    infoText: { fontSize: 11, fontWeight: "500" as const, color: C.textTertiary, maxWidth: 120 },
  });
}

// ── Past Trip Tile (horizontal scroll) ────────────────────────────────────────
function PastTripTile({ trip }: { trip: Trip }) {
  const { C } = useTheme();
  const end = new Date(trip.end);
  const monthYear = end.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return (
    <Link href={`/trip/${trip.id}`} asChild>
    <ScalePress
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      style={{
        width: 130, gap: 8,
      }}
    >
      <View style={{
        width: 130, height: 130, borderRadius: R["2xl"], overflow: "hidden",
        backgroundColor: C.elevated,
      }}>
        {Platform.OS === "ios" && Link.AppleZoom ? (
          <Link.AppleZoom><CachedImage uri={trip.image} style={{ width: "100%", height: "100%" }} /></Link.AppleZoom>
        ) : (
          <CachedImage uri={trip.image} style={{ width: "100%", height: "100%" }} />
        )}
      </View>
      <View style={{ paddingHorizontal: 2 }}>
        <Text
          style={{ fontSize: T.sm, fontWeight: T.semibold, color: C.textPrimary, lineHeight: 16 }}
          numberOfLines={1}
        >{trip.destination || trip.name}</Text>
        <Text
          style={{ fontSize: T.xs, color: C.textTertiary, marginTop: 2 }}
          numberOfLines={1}
        >{monthYear}</Text>
      </View>
    </ScalePress>
    </Link>
  );
}

// ── Trip Row (All Trips list) ──────────────────────────────────────────────────
function TripRow({ trip }: { trip: Trip }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const swipeRef = useRef<Swipeable>(null);
  const start   = new Date(trip.start);
  const end     = new Date(trip.end);
  const days    = daysUntil(trip.start);
  const isPast  = daysUntil(trip.end) < 0;
  const isActive = days <= 0 && !isPast;

  const renderRightActions = useCallback(() => (
    <View style={{ flexDirection: "row" }}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Share.share({ message: `Check out ${trip.name}${trip.destination ? ` in ${trip.destination}` : ""}` });
          swipeRef.current?.close();
        }}
        style={{
          backgroundColor: C.teal,
          justifyContent: "center",
          alignItems: "center",
          width: 72,
        }}
      >
        <ShareNetwork size={18} color="#000" weight="regular" />
        <Text style={{ color: "#000", fontSize: 11, fontWeight: "700", marginTop: 4 }}>Share</Text>
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
      onPress={(e) => {
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
        {trip.destination ? (
          <Text style={styles.rowDest}>{trip.destination.toUpperCase()}</Text>
        ) : null}
        <Text style={styles.rowName} numberOfLines={2}>{trip.name}</Text>
        <View style={styles.rowDateRow}>
          <CalendarDots size={9} color={C.teal} weight="regular" />
          <Text style={styles.rowDate}>
            {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </View>
      </View>
      {!isPast && days > 0 ? (
        <View style={styles.daysBadge}>
          <Text style={styles.daysBadgeNum}>{`${days}d`}</Text>
        </View>
      ) : isPast ? (
        <View style={styles.pastChip}>
          <Text style={styles.pastLabel}>PAST</Text>
        </View>
      ) : (
        <View style={[styles.statusBadgeRow, isActive ? styles.statusBadgeRowActive : styles.statusBadgeRowDraft]}>
          {isActive && <StatusIndicator state="live" size={5} color="#000" />}
          <Text style={[styles.statusRowText, { color: isActive ? "#000" : C.textTertiary }]}>
            {isActive ? "Active" : trip.status}
          </Text>
        </View>
      )}
      <CaretRight size={14} color={C.textTertiary} weight="light" style={{ marginLeft: 2 }} />
    </ScalePress>
    </Link>
    </ContextMenu>
    </Swipeable>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, ready, offline, _debug, reload } = useTrips();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem("daf-trips-cache").then(raw => {
      if (raw) {
        try { setCacheCount(JSON.parse(raw).length); } catch { setCacheCount(-1); }
      } else { setCacheCount(0); }
    }).catch(() => setCacheCount(-1));
  }, [trips.length]);
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

  // Up to 2 upcoming trips for compact cards
  const upcomingCards = useMemo(() =>
    sorted.filter(t => new Date(t.end) >= new Date()).slice(0, 2),
    [sorted]);

  // Spotlight trip for "For your X Trip"
  const spotlightTrip = useMemo(() =>
    sorted.filter(t => t.status !== "Draft").find(t => new Date(t.end) >= new Date()) ??
    sorted.find(t => new Date(t.end) >= new Date()) ??
    null,
    [sorted]);

  // Place events (activity, hotel, dining) for spotlight, up to 3
  const spotlightPlaces = useMemo(() => {
    if (!spotlightTrip) return [];
    return spotlightTrip.events
      .filter(e => e.type === "activity" || e.type === "hotel" || e.type === "dining")
      .slice(0, 3);
  }, [spotlightTrip]);

  const upcomingIds = useMemo(() => new Set(upcomingCards.map(t => t.id)), [upcomingCards]);

  // All Trips: excludes upcoming cards
  const allTrips = useMemo(() =>
    sorted.filter(t => !upcomingIds.has(t.id)),
    [sorted, upcomingIds]);

  // Past trips for horizontal scroll row
  const pastTrips = useMemo(() =>
    sorted.filter(t => daysUntil(t.end) < 0).reverse(),
    [sorted]);

  // Latest photos — diversify across uploaders, then fill chronologically
  const latestPhotos = useMemo(() => {
    if (!spotlightTrip?.media?.length) return [];
    const all = [...spotlightTrip.media]
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
  }, [spotlightTrip]);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {/* ── Greeting Hero (fixed, doesn't scroll) ── */}
      <GreetingHero
        nextTrip={nextUpcoming}
        isActive={isNextActive}
        onPress={(t) => router.push(`/trip/${t.id}`)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >

        {/* ── Offline banner ── */}
        {offline && trips.length > 0 && (
          <View style={styles.offlineBanner}>
            <WifiSlash size={14} color={C.textTertiary} weight="regular" />
            <Text style={styles.offlineText}>You're offline. Showing saved trips.</Text>
          </View>
        )}

        {/* ── Upcoming Trip ── */}
        {!ready ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionTitle}>Upcoming</Text>
              </View>
            </View>
            <View style={styles.upcomingList}>
              <TripCardSkeleton />
              <TripCardSkeleton />
            </View>
          </View>
        ) : upcomingCards.length > 0 ? (
          <View style={styles.section}>
            <FadeIn delay={0}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionTitle}>Upcoming</Text>
                </View>
              </View>
            </FadeIn>
            <View style={styles.upcomingList}>
              {upcomingCards.map((trip, i) => (
                <FadeIn key={trip.id} delay={80 + i * 100}>
                  {i === 0 ? <HeroTripCard trip={trip} /> : <UpcomingCard trip={trip} />}
                </FadeIn>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── For your X Trip ── */}
        {!ready ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionTitle}>For your Trip</Text>
                <Text style={styles.sectionSub}>Key events on your itinerary</Text>
              </View>
            </View>
            <View style={styles.spotList}>
              <SpotlightCardSkeleton />
              <SpotlightCardSkeleton />
            </View>
          </View>
        ) : spotlightTrip ? (
          <View style={styles.section}>
            <FadeIn delay={200}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionTitle}>
                    {"For your "}
                    <Text style={styles.spotlightDest}>
                      {spotlightTrip.destination || spotlightTrip.name.split(" ")[0]}
                    </Text>
                    {" Trip"}
                  </Text>
                  <Text style={styles.sectionSub}>Key events on your itinerary</Text>
                </View>
                <View style={styles.sectionChevron}>
                  <CaretRight size={16} color={C.textTertiary} weight="bold" />
                </View>
              </View>
            </FadeIn>

            {spotlightPlaces.length > 0 ? (
              <View style={styles.spotList}>
                {spotlightPlaces.map((ev, i) => (
                  <FadeIn key={ev.id} delay={280 + i * 100}>
                    {i === 0
                      ? <SpotlightEventCard ev={ev} tripId={spotlightTrip.id} />
                      : <CompactEventRow ev={ev} tripId={spotlightTrip.id} />}
                  </FadeIn>
                ))}
              </View>
            ) : (
              <FadeIn delay={280}>
                <Pressable
                  style={styles.spotEmpty}
                  onPress={() => router.push(`/trip/${spotlightTrip.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Open trip to add events"
                >
                  <Compass size={22} color={C.textTertiary} weight="light" />
                  <Text style={styles.spotEmptyText}>Open trip to add events</Text>
                </Pressable>
              </FadeIn>
            )}

            {/* Quick actions */}
            <FadeIn delay={450}>
              <View style={styles.quickActions}>
                <ScalePress
                  style={styles.quickCard}
                  onPress={() => { Haptics.selectionAsync(); router.push(`/trip/${spotlightTrip.id}`); }}
                >
                  <View style={styles.quickIconWrap}>
                    <CalendarDots size={20} color={C.teal} weight="regular" />
                  </View>
                  <Text style={styles.quickTitle}>Schedule</Text>
                </ScalePress>
                <ScalePress
                  style={styles.quickCard}
                  onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/media"); }}
                >
                  <View style={styles.quickIconWrap}>
                    <Images size={20} color={C.teal} weight="regular" />
                  </View>
                  <Text style={styles.quickTitle}>Gallery</Text>
                </ScalePress>
                <ScalePress
                  style={styles.quickCard}
                  onPress={() => { Haptics.selectionAsync(); router.push(`/trip/info?tripId=${spotlightTrip.id}`); }}
                >
                  <View style={styles.quickIconWrap}>
                    <Info size={20} color={C.teal} weight="regular" />
                  </View>
                  <Text style={styles.quickTitle}>Info</Text>
                </ScalePress>
              </View>
            </FadeIn>

            {/* Latest photos */}
            <FadeIn delay={600}>
              <View style={styles.latestSection}>
                {latestPhotos.length > 0 ? (
                  <>
                    <View style={styles.latestHeader}>
                      <Text style={styles.stripLabel}>Latest</Text>
                      <Pressable
                        onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/media"); }}
                        hitSlop={8}
                      >
                        <Text style={styles.seeAll}>See all</Text>
                      </Pressable>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 10, paddingHorizontal: S.md }}
                    >
                      {latestPhotos.map((photo) => {
                        const firstName = (photo.uploadedBy || "").split(/\s+/)[0];
                        const initial = firstName ? firstName[0].toUpperCase() : "";
                        return (
                          <Pressable
                            key={photo.id}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/media"); }}
                            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                          >
                            <CachedImage
                              uri={photo.url}
                              style={styles.latestPhoto}
                            />
                            {firstName ? (
                              <View style={styles.photoCaption}>
                                <View style={styles.photoCaptionAvatar}>
                                  <Text style={styles.photoCaptionInitial}>{initial}</Text>
                                </View>
                                <Text style={styles.photoCaptionText} numberOfLines={1}>
                                  {firstName} · {relativeTime(photo.uploadedAt)}
                                </Text>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : (
                  <View style={styles.latestEmpty}>
                    <Camera size={24} color={C.textTertiary} weight="light" />
                    <Text style={styles.latestEmptyTitle}>No photos yet</Text>
                    <Text style={styles.latestEmptySub}>Be the first to share a moment from this trip.</Text>
                    <Pressable
                      onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/media"); }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <Text style={styles.latestEmptyCta}>Add a photo</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </FadeIn>
          </View>
        ) : null}

        {/* ── Past Trips (horizontal scroll) ── */}
        {pastTrips.length > 0 && (
          <FadeIn delay={350}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionTitle}>Past Trips</Text>
                </View>
                <View style={styles.sectionChevron}>
                  <CaretRight size={16} color={C.textTertiary} weight="bold" />
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: S.md, gap: S.sm }}
              >
                {pastTrips.map(trip => (
                  <PastTripTile key={trip.id} trip={trip} />
                ))}
              </ScrollView>
            </View>
          </FadeIn>
        )}

        {/* ── All Trips ── */}
        {allTrips.length > 0 && (
          <FadeIn delay={400}>
            <View style={styles.section}>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrowLeft}>
                  <Text style={styles.eyebrow}>All Trips</Text>
                  <Text style={styles.countChip}>{allTrips.length}</Text>
                </View>
                <CaretRight size={16} color={C.textTertiary} weight="bold" />
              </View>
              <View style={styles.listCard}>
                {allTrips.map((trip, i) => (
                  <View key={trip.id}>
                    <TripRow trip={trip} />
                    {i < allTrips.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>
        )}


        {/* ── Empty state ── */}
        {ready && trips.length === 0 && (
          offline ? (
            <View style={styles.emptyState}>
              <WifiSlash size={48} color={C.textTertiary} weight="thin" />
              <Text style={styles.emptyTitle}>You're offline</Text>
              <Text style={styles.emptyText}>
                Your trips will appear here once you're back online.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Illustration name="riding" width={260} height={160} />
              <Text style={styles.emptyTitle}>Ready for takeoff</Text>
              <Text style={styles.emptyText}>
                Paste the trip code or scan the QR your agent shared to unlock your itinerary.
              </Text>
            </View>
          )
        )}


      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: {},

    section: { marginTop: 20 },

    sectionHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, marginBottom: S.sm,
    },
    sectionHeaderLeft: { flex: 1 },
    sectionTitle: {
      fontSize: T["2xl"], fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.5,
    },
    sectionSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 3, lineHeight: 20, fontWeight: T.medium },
    sectionChevron: {
      flexDirection: "row", alignItems: "center", gap: 2,
      paddingLeft: S.sm,
    },
    sectionChevronText: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.textTertiary,
    },
    spotlightDest: { color: C.teal },

    upcomingList: { gap: S.md },

    eyebrowRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, marginBottom: S.sm,
    },
    eyebrowLeft: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
    },
    eyebrow: {
      fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: -0.2,
    },
    countChip: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      backgroundColor: C.tealDim, paddingHorizontal: 7, paddingVertical: 2,
      borderRadius: R.full,
    },

    // ── Spotlight ──
    spotList: { paddingHorizontal: S.md, gap: S.sm },
    spotEmpty: {
      marginHorizontal: S.md, backgroundColor: C.card,
      borderRadius: R.xl,
      alignItems: "center", justifyContent: "center",
      paddingVertical: 32, gap: S.xs,
    },
    spotEmptyText: {
      fontSize: T.xs, fontWeight: T.bold,
      color: C.textTertiary, textTransform: "uppercase", letterSpacing: 1,
    },

    // ── Trip rows ──
    listCard: {
      marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R["2xl"],
      overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
    },
    row: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md, paddingVertical: 14 },
    rowDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.md + 72 + S.md,
    },
    rowThumb: { width: 72, height: 72, borderRadius: R.xl, backgroundColor: C.elevated },
    rowBody: { flex: 1 },
    rowDest: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
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
    },
    rowActiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#000" },
    statusRowText: { fontSize: T.xs, fontWeight: T.bold, letterSpacing: 0.8, textTransform: "uppercase" },

    daysBadge: {
      alignItems: "center", justifyContent: "center",
      backgroundColor: C.tealDim,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.full,
    },
    daysBadgeNum: { fontSize: T.sm, fontWeight: "700", color: C.teal },

    pastChip: {
      backgroundColor: C.elevated, paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: R.full,
    },
    pastLabel: { fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.8 },

    // ── Quick Actions ──
    quickActions: {
      flexDirection: "row", gap: S.sm, paddingHorizontal: S.md, marginTop: S.md,
    },
    quickCard: {
      flex: 1, backgroundColor: C.card, borderRadius: R.xl,
      padding: S.md, alignItems: "center", gap: S.xs,
    },
    quickIconWrap: {
      width: 40, height: 40, borderRadius: R.full,
      backgroundColor: C.tealDim, alignItems: "center", justifyContent: "center",
    },
    quickTitle: {
      fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary,
      marginTop: 2,
    },
    quickSub: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary },

    // ── Section strips ──
    stripLabel: {
      fontSize: T.xs, fontWeight: T.semibold,
      color: C.textTertiary, marginBottom: S.sm,
    },

    // ── Latest photos ──
    latestSection: {
      marginTop: 28,
    },
    latestHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, marginBottom: S.sm,
    },
    seeAll: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.teal,
    },
    latestPhoto: {
      width: 120, height: 160, borderRadius: R.lg,
      backgroundColor: C.elevated,
    },
    photoCaption: {
      flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6,
    },
    photoCaptionAvatar: {
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    photoCaptionInitial: {
      fontSize: 8, fontWeight: T.semibold, color: C.textSecondary,
    },
    photoCaptionText: {
      fontSize: T.xs, color: C.textTertiary, maxWidth: 100,
    },
    latestEmpty: {
      alignItems: "center", paddingVertical: S.xl, paddingHorizontal: S.md, gap: 6,
    },
    latestEmptyTitle: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.textSecondary, marginTop: 4,
    },
    latestEmptySub: {
      fontSize: T.xs, color: C.textTertiary, textAlign: "center", lineHeight: 18, maxWidth: 240,
    },
    latestEmptyCta: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.teal, marginTop: 4,
    },

    // ── Offline banner ──
    offlineBanner: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 10, paddingHorizontal: S.md,
      backgroundColor: C.elevated, borderRadius: R.lg,
      marginHorizontal: S.md, marginBottom: S.sm,
    },
    offlineText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary,
    },

    // ── Empty ──
    emptyState: {
      alignItems: "center", paddingTop: 80,
      paddingHorizontal: S.xl, paddingBottom: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T.xl, fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.3,
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
      fontSize: T.sm, fontWeight: T.bold,
      color: "#000", letterSpacing: 0.5, textTransform: "uppercase",
    },
  });
}
