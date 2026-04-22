import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
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
import { useRouter } from "expo-router";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Search, MapPin, ChevronRight, CalendarDays, Users,
  ArrowUpRight, Heart, Share2, Compass, Hotel, Utensils, Plane,
  Bell, Sun, Moon, Plus, X as XIcon, ScanLine, Link2, Hash,
  Check,
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
import { fetchTripByShortCode, fetchTripById } from "@/services/firebaseTrips";
import { useBrand } from "@/context/BrandContext";
import { Logo } from "@/components/Logo";
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch { /* native module not in this build */ }

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

const EVENT_TAGS: Record<string, string[]> = {
  activity: ["Experience", "Adventure", "Culture"],
  hotel:    ["Luxury", "Stay", "Comfort"],
  dining:   ["Food", "Local Cuisine", "Dining"],
  flight:   ["Transfer", "Flight", "Transit"],
};

// ── Trip Found Reveal ────────────────────────────────────────────────────────
function TripFoundReveal({ trip, C }: { trip: Trip; C: ThemeColors }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const checkRotate = useSharedValue(-45);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    // Card scales in
    scale.value = withSpring(1, { damping: 14, stiffness: 100, mass: 0.8 });
    opacity.value = withTiming(1, { duration: 300 });
    // Checkmark pops after card settles
    checkScale.value = withDelay(400, withSpring(1, { damping: 12, stiffness: 200 }));
    checkRotate.value = withDelay(400, withSpring(0, { damping: 14, stiffness: 120 }));
    // Shimmer sweep across card
    shimmer.value = withDelay(200, withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: checkScale.value },
      { rotate: `${checkRotate.value}deg` },
    ],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0, 0.4, 0]),
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-200, 300]) }],
  }));

  const days = Math.max(0, Math.ceil((new Date(trip.start).getTime() - Date.now()) / 86400000));
  const startDate = new Date(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <View style={{ alignItems: "center", paddingVertical: S.lg, paddingHorizontal: S.md }}>
      <Animated.View style={[{
        width: "100%", borderRadius: R["2xl"], overflow: "hidden",
        backgroundColor: C.elevated,
      }, cardStyle]}>
        {/* Trip image */}
        <View style={{ height: 160, overflow: "hidden" }}>
          <CachedImage uri={trip.image} style={{ width: "100%", height: "100%" }} />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80 }}
          />
          {/* Shimmer sweep */}
          <Animated.View style={[{
            position: "absolute", top: 0, bottom: 0, width: 120,
            backgroundColor: "rgba(255,255,255,0.3)",
            transform: [{ skewX: "-20deg" }],
          }, shimmerStyle]} />
          {/* Checkmark badge */}
          <Animated.View style={[{
            position: "absolute", top: 14, right: 14,
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: C.teal,
            alignItems: "center", justifyContent: "center",
            shadowColor: C.teal, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4, shadowRadius: 8,
          }, checkStyle]}>
            <Check size={20} color="#000" strokeWidth={3} />
          </Animated.View>
        </View>

        {/* Trip info */}
        <View style={{ padding: S.md, gap: 6 }}>
          {trip.destination && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <MapPin size={11} color={C.teal} strokeWidth={2} />
              <Text style={{
                fontSize: T.xs, fontWeight: T.bold, color: C.teal,
                letterSpacing: 1.5, textTransform: "uppercase",
              }}>{trip.destination}</Text>
            </View>
          )}
          <Text style={{
            fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary,
            letterSpacing: -0.3,
          }} numberOfLines={1}>{trip.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CalendarDays size={11} color={C.textTertiary} strokeWidth={1.8} />
              <Text style={{ fontSize: T.sm, color: C.textSecondary, fontWeight: T.medium }}>{startDate}</Text>
            </View>
            {days > 0 && (
              <View style={{
                backgroundColor: C.tealDim, borderRadius: R.full,
                paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: T.xs, fontWeight: T.bold, color: C.teal }}>
                  {days === 1 ? "Tomorrow" : `${days} days`}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      <Text style={{
        fontSize: T.sm, fontWeight: T.bold, color: C.teal,
        letterSpacing: 1.5, textTransform: "uppercase",
        marginTop: S.lg,
      }}>Trip Found</Text>
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
          <ScanLine size={32} color={C.textTertiary} strokeWidth={1.2} />
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
        <ScanLine size={28} color={C.textTertiary} strokeWidth={1.2} />
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
        <View style={[styles.qrCorner, { top: 8, left: 8 }]} />
        <View style={[styles.qrCorner, { top: 8, right: 8, transform: [{ rotate: "90deg" }] }]} />
        <View style={[styles.qrCorner, { bottom: 8, left: 8, transform: [{ rotate: "-90deg" }] }]} />
        <View style={[styles.qrCorner, { bottom: 8, right: 8, transform: [{ rotate: "180deg" }] }]} />
      </View>
      <Text style={[styles.checkingText, { marginTop: S.sm }]}>Point at a trip QR code</Text>
    </View>
  );
}

// ── Live Countdown ────────────────────────────────────────────────────────────
function useLiveCountdown(targetDate: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;
  const diff = Math.max(0, new Date(targetDate).getTime() - now);
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
              fontFamily: F.black,
              fontWeight: "900",
              color: C.textPrimary,
              letterSpacing: -1.5,
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
              lineHeight: 30,
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
  const { C, isDark, toggle } = useTheme();
  const { brand } = useBrand();
  const { unreadCount } = useNotifications();
  const { prefs } = usePreferences();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifOpen, setNotifOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [linkValue, setLinkValue] = useState("");
  const [entryMode, setEntryMode] = useState<"pin" | "qr" | "link">("pin");
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const pinRefs = useRef<Array<TextInput | null>>([]);
  const styles = useMemo(() => makeGreetingStyles(C), [C]);
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = (prefs.name || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `${timeOfDay}, ${firstName}` : timeOfDay;
  const greetingFontSize = greeting.length > 22 ? 18 : greeting.length > 18 ? 20 : T["3xl"] - 2;
  const days = nextTrip ? Math.max(0, daysUntil(nextTrip.start)) : 0;
  const countdown = useLiveCountdown(nextTrip?.start);

  const closeSheet = () => {
    setCodeOpen(false);
    setDigits(["", "", "", ""]);
    setLinkValue("");
    setEntryMode("pin");
    setCodeError(null);
    setFoundTrip(null);
  };

  // Shared reveal → navigate flow for all entry modes
  const revealAndNavigate = useCallback((trip: Trip) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFoundTrip(trip);
    setTimeout(() => {
      router.push(`/shared/${trip.id}`);
      setTimeout(() => {
        setCodeOpen(false);
        setFoundTrip(null);
        setDigits(["", "", "", ""]);
        setLinkValue("");
      }, 300);
    }, 1800);
  }, [router]);

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
      revealAndNavigate(trip);
    } catch (err: any) {
      setCodeError(err?.message || "Couldn't look up PIN. Try again.");
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
    <View style={[styles.outer, { paddingTop: 600 + insets.top + S.md, marginTop: -600 }]}>
      <LinearGradient
        colors={[`${C.teal}18`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { top: 600 }]}
      />
      <View style={styles.illustrationWrap} pointerEvents="none">
        <Illustration name="together" width={170} height={140} />
      </View>
      {/* Top bar — brand + actions */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          {brand.logoUrl ? (
            <Image source={{ uri: brand.logoUrl }} style={{ width: 24, height: 24, borderRadius: 5 }} />
          ) : (
            <Logo size={20} color={C.teal} />
          )}
          <Text style={styles.brandLabel}>{brand.name}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={toggle}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDark ? C.elevated : "#f1f5f9" }]}
            accessibilityLabel="Toggle theme"
          >
            {isDark ? <Sun size={16} color={C.textSecondary} strokeWidth={2} /> : <Moon size={16} color={C.textSecondary} strokeWidth={2} />}
          </Pressable>
          <Pressable
            onPress={() => setCodeOpen(true)}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDark ? C.elevated : "#f1f5f9" }]}
            accessibilityLabel="Enter trip code"
          >
            <Plus size={16} color={C.textSecondary} strokeWidth={2} />
          </Pressable>
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

      {/* Greeting */}
      <Text
        style={[styles.greeting, { fontSize: greetingFontSize }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {greeting} 👋
      </Text>
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

              {/* Header row */}
              {!foundTrip && (
              <View style={styles.sheetHeader}>
                <Text style={styles.codeTitle}>Join a Trip</Text>
                <Pressable onPress={closeSheet} style={styles.codeClose}>
                  <XIcon size={14} color={C.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>
              )}

              {/* Success reveal */}
              {foundTrip ? (
                <TripFoundReveal trip={foundTrip} C={C} />
              ) : (
              <>
              {/* Mode tabs */}
              <View style={styles.modeTabs}>
                {([
                  { key: "pin" as const, icon: Hash, label: "PIN" },
                  { key: "qr" as const, icon: ScanLine, label: "Scan" },
                  { key: "link" as const, icon: Link2, label: "Link" },
                ]).map(({ key, icon: Ic, label }) => {
                  const active = entryMode === key;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.modeTab, active && styles.modeTabActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setCodeError(null);
                        setDigits(["", "", "", ""]);
                        setLinkValue("");
                        setEntryMode(key);
                      }}
                    >
                      <Ic size={14} color={active ? C.teal : C.textTertiary} strokeWidth={1.8} />
                      <Text style={[styles.modeTabText, active && { color: C.textPrimary }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* PIN entry */}
              {entryMode === "pin" && (
                <View style={styles.modeContent}>
                  <Text style={styles.sheetSub}>Enter the 4-digit code from your organiser.</Text>
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
                        accessibilityLabel={`Digit ${i + 1} of 4`}
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
                    <Text style={styles.checkingText}>Looking up…</Text>
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
                      setCodeError("QR code doesn't contain a valid trip link");
                      setEntryMode("pin");
                    }
                  }}
                />
              )}

              {/* Link paste */}
              {entryMode === "link" && (
                <View style={[styles.modeContent, { width: "100%" }]}>
                  <Text style={styles.sheetSub}>Paste the share link your organiser sent you.</Text>
                  <TextInput
                    value={linkValue}
                    onChangeText={(t) => { setLinkValue(t); if (codeError) setCodeError(null); }}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://…/shared/…"
                    placeholderTextColor={C.textTertiary}
                    style={[styles.codeInput, { width: "100%" }]}
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
                        width: "100%",
                        backgroundColor: linkValue.trim() && !resolving ? C.teal : C.elevated,
                        opacity: pressed && linkValue.trim() && !resolving ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.codeSubmitText, { color: linkValue.trim() && !resolving ? "#000" : C.textTertiary }]}>
                      {resolving ? "Checking…" : "Open Trip"}
                    </Text>
                  </Pressable>
                </View>
              )}
              </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {nextTrip ? (
        <ScalePress
          style={styles.countdownWrap}
          activeScale={0.98}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(nextTrip); }}
        >
          <Text style={styles.countdownEyebrow}>
            {isActive
              ? "Currently Travelling"
              : days === 0 ? "Departing Today"
              : "Countdown to Departure"}
          </Text>
          {isActive ? (
            <Text style={styles.countdownNumber}>NOW</Text>
          ) : countdown ? (
            <LiveCountdownDisplay countdown={countdown} C={C} />
          ) : (
            <Text style={styles.countdownNumber}>{days}</Text>
          )}
          <View style={styles.countdownMeta}>
            <MapPin size={11} color={C.teal} strokeWidth={2} />
            <Text style={styles.countdownDest} numberOfLines={1}>
              {(nextTrip.destination || nextTrip.name).toUpperCase()}
            </Text>
            <ArrowUpRight size={11} color={C.textSecondary} strokeWidth={2} />
          </View>
        </ScalePress>
      ) : (
        <ScalePress
          style={styles.countdownWrap}
          activeScale={0.98}
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
        </ScalePress>
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
      overflow: "hidden",
      paddingHorizontal: S.md, paddingTop: S.xs, paddingBottom: S.lg,
    },
    illustrationWrap: {
      position: "absolute", right: -10, bottom: -6,
      opacity: 0.55,
    },
    topBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginBottom: S.md, zIndex: 2,
    },
    brandRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    brandLabel: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase",
    },
    greeting: {
      fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
      marginBottom: S.md,
    },
    headerActions: {
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    headerBtn: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: "center", justifyContent: "center",
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
      paddingHorizontal: S.md, paddingTop: S.xs, paddingBottom: S.xl,
      gap: S.xs,
    },
    sheetGrabber: {
      alignSelf: "center",
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: S.sm,
    },
    sheetHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginBottom: S.sm,
    },
    sheetSub: {
      fontSize: T.sm, color: C.textSecondary, lineHeight: 20,
      marginBottom: S.md,
    },
    codeTitle: {
      fontSize: T.xl, fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.3,
    },
    codeClose: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: "center", justifyContent: "center",
      backgroundColor: C.elevated,
    },
    modeTabs: {
      flexDirection: "row", backgroundColor: C.elevated,
      borderRadius: R.lg, padding: 3, marginBottom: S.md,
    },
    modeTab: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 5, paddingVertical: 8, borderRadius: R.md,
    },
    modeTabActive: {
      backgroundColor: C.card,
    },
    modeTabText: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
    },
    modeContent: {
      minHeight: 140,
      alignItems: "center",
      paddingHorizontal: S.sm,
    },
    pinRow: {
      flexDirection: "row", justifyContent: "center",
      gap: 10, marginVertical: S.xs,
    },
    pinCell: {
      width: 52, height: 60, borderRadius: 12,
      borderWidth: 1.5, borderColor: C.border,
      backgroundColor: C.elevated,
      textAlign: "center",
      fontSize: 24, fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.3,
    },
    pinCellFilled: { borderColor: C.teal, backgroundColor: C.tealDim },
    pinCellError: { borderColor: "#ff6b6b" },
    checkingText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 1.5, textTransform: "uppercase",
      textAlign: "center", marginTop: S.sm,
    },
    qrFrame: {
      width: 220, height: 220,
      borderRadius: R.xl, overflow: "hidden",
      backgroundColor: "#000",
      alignSelf: "center",
    },
    qrCorner: {
      position: "absolute", width: 28, height: 28,
      borderTopWidth: 2.5, borderLeftWidth: 2.5,
      borderColor: C.teal, borderTopLeftRadius: 8,
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
      fontSize: T.sm, fontWeight: T.bold,
      letterSpacing: 1.5, textTransform: "uppercase",
    },
    countdownWrap: { alignSelf: "flex-start" },
    countdownEyebrow: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary,
      letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 6,
    },
    countdownNumber: {
      fontSize: 56, fontFamily: F.black, fontWeight: T.black, color: C.textPrimary,
      letterSpacing: -2, lineHeight: 56,
    },
    countdownMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
    countdownDest: {
      fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary,
      letterSpacing: 1.5, maxWidth: 220,
    },
    emptyWrap: { alignSelf: "flex-start" },
    emptyTitle: {
      fontSize: T["3xl"], fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.5, lineHeight: T["3xl"] + 4,
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
    <ScalePress
      style={styles.card}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, ${trip.destination || ""}, ${days <= 0 ? "departing today" : `${days} days away`}`}
    >
      <CachedImage uri={trip.image} style={styles.thumb} accessible={false} />
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
    </ScalePress>
  );
}

function makeUpcomingCardStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row", alignItems: "center", gap: S.md,
      backgroundColor: C.card, borderRadius: R["2xl"],
      padding: S.md, marginHorizontal: S.md,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    thumb: { width: 52, height: 52, borderRadius: R.lg, backgroundColor: C.elevated },
    body: { flex: 1 },
    name: {
      fontSize: T.base, fontWeight: T.bold,
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
    daysText: { fontSize: T.xs, fontWeight: T.bold, color: "#000", letterSpacing: 0.5 },
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
        <CachedImage uri={ev.image} style={styles.img} />
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
      backgroundColor: C.card, borderRadius: R["2xl"],
      overflow: "hidden", minHeight: 110,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    img: { width: 110, alignSelf: "stretch" },
    imgPlaceholder: {
      width: 110, alignSelf: "stretch",
      backgroundColor: `${_color}15`,
      alignItems: "center", justifyContent: "center",
    },
    content: { flex: 1, padding: S.md, justifyContent: "space-between" },
    topRow: { flexDirection: "row", gap: S.xs, alignItems: "flex-start" },
    textWrap: { flex: 1 },
    title: {
      fontSize: T.base, fontWeight: T.bold,
      color: C.textPrimary, marginBottom: 3,
    },
    sub: { fontSize: T.sm, color: C.textSecondary, lineHeight: 20 },
    actions: { flexDirection: "row", gap: S["2xs"] },
    heartBtn: {
      width: 28, height: 28, borderRadius: R.full,
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
    <ScalePress
      style={styles.row}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, ${trip.destination || ""}, ${isPast ? "past trip" : isActive ? "active now" : `${days} days away`}`}
    >
      <CachedImage uri={trip.image} style={styles.rowThumb} accessible={false} />
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
    </ScalePress>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, ready, reload } = useTrips();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
    toast("Trips synced");
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >

        {/* ── Greeting Hero ── */}
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
        {!ready ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Trip</Text>
              <Text style={styles.sectionSub}>Loading your trips…</Text>
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
                <Text style={styles.sectionTitle}>Upcoming Trip</Text>
                <Text style={styles.sectionSub}>Departing within 30 days</Text>
              </View>
            </FadeIn>
            <View style={styles.upcomingList}>
              {upcomingCards.map((trip, i) => (
                <FadeIn key={trip.id} delay={80 + i * 100}>
                  <UpcomingCard
                    trip={trip}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                  />
                </FadeIn>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── For your X Trip ── */}
        {!ready ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>For your Trip</Text>
              <Text style={styles.sectionSub}>Key events on your itinerary</Text>
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
                <Text style={styles.sectionTitle}>
                  {"For your "}
                  <Text style={styles.spotlightDest}>
                    {spotlightTrip.destination || spotlightTrip.name.split(" ")[0]}
                  </Text>
                  {" Trip"}
                </Text>
                <Text style={styles.sectionSub}>Key events on your itinerary</Text>
              </View>
            </FadeIn>

            {spotlightPlaces.length > 0 ? (
              <View style={styles.spotList}>
                {spotlightPlaces.map((ev, i) => (
                  <FadeIn key={ev.id} delay={280 + i * 100}>
                    <SpotlightEventCard ev={ev} />
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
                  <Compass size={22} color={C.textTertiary} strokeWidth={1.5} />
                  <Text style={styles.spotEmptyText}>Open trip to add events</Text>
                </Pressable>
              </FadeIn>
            )}
          </View>
        ) : null}

        {/* ── All Trips ── */}
        {allTrips.length > 0 && (
          <FadeIn delay={400}>
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
          </FadeIn>
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

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 90 },

    section: { marginTop: S.xl },

    sectionHeader: { paddingHorizontal: S.md, marginBottom: S.md },
    sectionTitle: {
      fontSize: T.xl, fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.2,
    },
    sectionSub: { fontSize: T.sm, color: C.textSecondary, marginTop: 3, lineHeight: 20 },
    spotlightDest: { color: C.teal, fontStyle: "italic" },

    upcomingList: { gap: S.sm },

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
    spotList: { paddingHorizontal: S.md, gap: S.md },
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

    // ── Search ──
    searchWrap: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      backgroundColor: C.card, borderRadius: R.lg,
      paddingHorizontal: S.sm, height: 44,
      marginHorizontal: S.md,
    },
    searchInput: { flex: 1, fontSize: T.base, color: C.textPrimary },

    // ── Trip rows ──
    listCard: {
      marginHorizontal: S.md,
      backgroundColor: C.card, borderRadius: R["2xl"],
      overflow: "hidden",
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    row: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md },
    rowDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: C.border,
      marginLeft: S.sm + 52 + S.sm,
    },
    rowThumb: { width: 52, height: 52, borderRadius: R.md, backgroundColor: C.elevated },
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
      alignItems: "center", backgroundColor: C.tealDim,
      paddingHorizontal: 8, paddingVertical: 5, borderRadius: R.sm,
      minWidth: 38,
    },
    daysBadgeNum: { fontSize: T.lg, fontWeight: T.bold, color: C.teal, letterSpacing: -0.3 },
    daysBadgeLbl: { fontSize: T.xs, fontWeight: T.bold, color: `${C.teal}99`, letterSpacing: 0.8 },

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
