import {
  View, Text, ScrollView, Pressable,
  StyleSheet, TextInput, KeyboardAvoidingView, Platform,
  Dimensions, Keyboard, Linking,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
  withRepeat, withSequence, cancelAnimation, interpolateColor,
  Easing, FadeIn, FadeInDown, FadeOut,
} from "react-native-reanimated";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { TripPreviewCard } from "@/components/TripPreviewCard";
import { Avatar } from "@/components/ui/Avatar";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "@/services/haptics";
import { useRouter, Stack } from "expo-router";
import { parseTripDate } from "@/shared/dates";
import { destinationFlag } from "@/shared/tripSummary";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { X,
  CaretRight, Scan, Check, ClipboardText,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, F, SHEET_BAR_H } from "@/constants/theme";
import type { Trip } from "@/shared/types";
import { fetchTripByShortCode, fetchTripById } from "@/services/firebaseTrips";


let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch { /* native module not in this build */ }

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
  const startDate = parseTripDate(trip.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endDate = parseTripDate(trip.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const flag = destinationFlag(trip.destination);
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: S.md, paddingVertical: S.lg }}>
      <View style={{ width: "100%", borderRadius: R.xl, overflow: "hidden", backgroundColor: C.card }}>
        {/* Photo dissolves into the card, same treatment as the Home hero */}
        <View style={{ height: 220, backgroundColor: C.elevated }}>
          <Animated.View style={[StyleSheet.absoluteFill, imgStyle]}>
            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, 0.55, 1]} style={{ flex: 1 }} />}
            >
              <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} />
            </MaskedView>
          </Animated.View>
        </View>

        <View style={{ paddingHorizontal: S.md, paddingBottom: S.md, marginTop: -S.lg, gap: S.sm }}>
          <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: S.xs }, checkAnim]}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" }}>
              <Check size={13} color={C.onAccent} weight="bold" />
            </View>
            <Text style={{ fontSize: T.sm, fontWeight: T.semibold, color: C.tealText }}>You're in</Text>
          </Animated.View>

          <Animated.View style={[{ gap: 3 }, copyStyle]}>
            <Text style={{ fontSize: T["2xl"], fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.3 }} numberOfLines={2}>{trip.name}</Text>
            {trip.destination ? (
              <Text style={{ fontSize: T.base, color: C.textSecondary }} numberOfLines={1}>{flag ? `${flag}  ` : ""}{trip.destination}</Text>
            ) : null}
            <Text style={{ fontSize: T.sm, color: C.textTertiary }} numberOfLines={1}>
              {startDate} – {endDate}, {nights} night{nights !== 1 ? "s" : ""}
            </Text>
          </Animated.View>

          {trip.organizer?.name ? (
            <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: S.xs, paddingTop: S.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }, pillsStyle]}>
              <Avatar size={24} uri={trip.organizer.avatar} initials={trip.organizer.name.trim().charAt(0).toUpperCase()} />
              <Text style={{ fontSize: T.sm, color: C.textSecondary }} numberOfLines={1}>Hosted by {trip.organizer.name}</Text>
            </Animated.View>
          ) : null}
        </View>
      </View>

      {/* CTA — appears after animation settles */}
      <Animated.View style={[{ marginTop: S.md }, ctaStyle]}>
        <ScalePress
          onPress={onContinue}
          accessibilityRole="button"
          style={{
            height: 50, borderRadius: R.lg,
            backgroundColor: C.teal,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Text style={{ fontSize: T.md, fontWeight: T.semibold, color: C.onAccent }}>See itinerary</Text>
          <CaretRight size={14} color={C.onAccent} weight="bold" />
        </ScalePress>
      </Animated.View>
    </View>
  );
}

// ── PIN cell ─────────────────────────────────────────────────────────────────
const PIN_LEN = 6;
const PIN_GAP = S.xs;
const PIN_W = Math.min(54, Math.floor((Dimensions.get("window").width - S.lg * 2 - PIN_GAP * (PIN_LEN - 1)) / PIN_LEN));
const EMPTY_PIN = ["", "", "", "", "", ""];
// Reanimated 4.5.1 never starts withDelay(0), so the first cell runs undelayed
const after = (ms: number, anim: any) => (ms > 0 ? withDelay(ms, anim) : anim);
const INVITE_LINK = /shared\/([A-Za-z0-9_-]+)/;

function PinCell({ ch, index, active, resolving, lit, C, styles, onPress }: {
  ch: string; index: number; active: boolean; resolving: boolean; lit: boolean;
  C: ThemeColors; styles: any; onPress: () => void;
}) {
  const pop = useSharedValue(ch ? 1 : 0);
  const caret = useSharedValue(0);
  const lift = useSharedValue(0);
  const glow = useSharedValue(0);

  // Each character springs into its cell as it's typed
  useEffect(() => {
    pop.value = ch ? withSequence(withTiming(0, { duration: 0 }), withSpring(1, { damping: 13, stiffness: 280, mass: 0.5 })) : 0;
  }, [ch]);

  // A soft breathing caret in the cell you're typing into
  useEffect(() => {
    if (active) caret.value = withRepeat(withTiming(1, { duration: 560, easing: Easing.inOut(Easing.ease) }), -1, true);
    else { cancelAnimation(caret); caret.value = 0; }
  }, [active]);

  // While we look the PIN up, the cells ripple left to right
  useEffect(() => {
    if (resolving) {
      lift.value = after(index * 70, withRepeat(withSequence(
        withTiming(-5, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      ), -1));
    } else {
      cancelAnimation(lift);
      lift.value = withTiming(0, { duration: 160 });
    }
  }, [resolving]);

  // Trip found: the cells light up one after another
  useEffect(() => {
    glow.value = lit ? after(index * 45, withTiming(1, { duration: 220 })) : withTiming(0, { duration: 160 });
  }, [lit]);

  const restBorder = active ? C.teal : C.border;
  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
    backgroundColor: interpolateColor(glow.value, [0, 1], [C.elevated, C.tealDim]),
    borderColor: interpolateColor(glow.value, [0, 1], [restBorder, C.teal]),
  }));
  const charStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ translateY: (1 - pop.value) * 6 }, { scale: 0.6 + 0.4 * pop.value }],
  }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * caret.value }));

  return (
    <Pressable onPress={onPress} accessible={false}>
      <Animated.View style={[styles.pinCell, cellStyle]}>
        {ch ? (
          <Animated.Text style={[styles.pinCellText, charStyle]}>{ch}</Animated.Text>
        ) : active ? (
          <Animated.View style={[styles.pinCaret, caretStyle]} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// ── QR Scanner Pane ──────────────────────────────────────────────────────────
function QRScanPane({ C, styles, onScanned }: {
  C: ThemeColors; styles: any; onScanned: (data: string) => void;
}) {
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const scannedRef = useRef(false);

  // Read the current state first so a granted camera opens straight away
  useEffect(() => {
    if (!CameraView) return;
    try {
      require("expo-camera").Camera.getCameraPermissionsAsync()
        .then((r: any) => setPermission({ granted: r.granted, canAskAgain: r.canAskAgain }))
        .catch(() => setPermission({ granted: false, canAskAgain: true }));
    } catch {}
  }, []);

  const requestPermission = useCallback(async () => {
    Haptics.selectionAsync();
    if (permission && !permission.canAskAgain) { Linking.openSettings(); return; }
    try {
      const r = await require("expo-camera").Camera.requestCameraPermissionsAsync();
      setPermission({ granted: r.status === "granted", canAskAgain: r.canAskAgain });
    } catch {}
  }, [permission]);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    onScanned(data);
  }, [onScanned]);

  const granted = !!CameraView && !!permission?.granted;
  const blocked = !!permission && !permission.granted && !permission.canAskAgain;

  return (
    <View style={styles.modeContent}>
      {/* The viewfinder is always there, so granting access doesn't move anything */}
      <View style={[styles.qrFrame, !granted && { backgroundColor: C.elevated, alignItems: "center", justifyContent: "center" }]}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcode}
          />
        ) : (
          <>
            <Scan size={36} color={C.textTertiary} weight="light" />
            <Text style={styles.qrNote}>
              {!CameraView ? "QR scanning isn't available in this version" : blocked ? "Camera is off for Dalefy" : "The camera opens here"}
            </Text>
          </>
        )}
        <View style={[styles.qrCorner, { top: 12, left: 12 }]} />
        <View style={[styles.qrCorner, { top: 12, right: 12, transform: [{ rotate: "90deg" }] }]} />
        <View style={[styles.qrCorner, { bottom: 12, left: 12, transform: [{ rotate: "-90deg" }] }]} />
        <View style={[styles.qrCorner, { bottom: 12, right: 12, transform: [{ rotate: "180deg" }] }]} />
      </View>
      <Text style={styles.qrHint}>Point at the QR code from your organiser</Text>
      {!!CameraView && permission && !granted && (
        <ScalePress onPress={requestPermission} accessibilityRole="button" style={[styles.codeSubmit, { backgroundColor: C.tealDim, marginTop: S.md }]}>
          <Text style={[styles.codeSubmitText, { color: C.tealText }]}>{blocked ? "Open Settings" : "Allow camera"}</Text>
        </ScalePress>
      )}
    </View>
  );
}

// ── Greeting Hero ─────────────────────────────────────────────────────────────

export default function JoinScreen() {
  const { C, isDark } = useTheme();
  const { trips: joinedTrips } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState<string[]>(EMPTY_PIN);
  const [entryMode, setEntryMode] = useState<"pin" | "qr">("pin");
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [pinLit, setPinLit] = useState(false);
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

  // Found: light the cells, then let the trip card rise once they've lit
  const showFound = (trip: Trip, fromPin: boolean) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Keyboard.dismiss();
    if (!fromPin) { setPreviewTrip(trip); return; }
    setPinLit(true);
    setTimeout(() => setPreviewTrip(trip), 480);
  };

  const handlePasteRef = useRef<() => void>(() => {});
  handlePasteRef.current = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // An invite link works here too, so there's no separate link screen
      const linkId = text.match(INVITE_LINK)?.[1];
      if (linkId) { setDigits(EMPTY_PIN); submitTripId(linkId); return; }
      const clean = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
      if (!clean) return;
      const next = [...EMPTY_PIN];
      for (let i = 0; i < clean.length; i++) next[i] = clean[i];
      setDigits(next);
      setCodeError(null);
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

  // Opened by a link there may be nothing underneath, so fall back to Home
  const closeSheet = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); };

  // Shared reveal → navigate flow for all entry modes
  const revealAndNavigate = useCallback((trip: Trip) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFoundTrip(trip);
  }, []);

  const handleRevealContinue = useCallback(() => {
    if (!foundTrip) return;
    if (router.canGoBack()) router.back();
    router.push(`/shared/${foundTrip.id}`);
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
        setDigits(EMPTY_PIN);
        pinRefs.current[0]?.focus();
        return;
      }
      showFound(trip, true);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        if (router.canGoBack()) router.back();
        router.push(`/shared/${id}`);
        return;
      }
      showFound(trip, false);
    } catch {
      if (router.canGoBack()) router.back();
      router.push(`/shared/${id}`);
    } finally {
      setResolving(false);
    }
  };

  const handlePinChange = (val: string) => {
    // Keyboard paste of a whole invite link lands here too
    const linkId = val.match(INVITE_LINK)?.[1];
    if (linkId) { setDigits(EMPTY_PIN); submitTripId(linkId); return; }
    const clean = val.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
    const next = [...EMPTY_PIN];
    for (let i = 0; i < clean.length; i++) next[i] = clean[i];
    if (clean.length > pinValue.length) Haptics.selectionAsync();
    setDigits(next);
    if (codeError) setCodeError(null);
    if (clean.length === 6) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      submitPin(clean);
    }
  };

  const startOver = () => {
    Haptics.selectionAsync();
    setPreviewTrip(null);
    setPinLit(false);
    setDigits(EMPTY_PIN);
    setCodeError(null);
    setEntryMode("pin");
    setTimeout(() => pinRefs.current[0]?.focus(), 350);
  };

  const pinValue = digits.join("");
  const pinComplete = pinValue.length === 6;
  const fmtDay = (d: string) => parseTripDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const tripDates = (t: Trip) => `${fmtDay(t.start)} – ${fmtDay(t.end)}`;
  const recentTrips = [...joinedTrips].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const focusPin = () => pinRefs.current[0]?.focus();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: !foundTrip,
          title: "Join a trip",
          headerTransparent: true,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          // Newer iOS defaults sheets to a hard edge with a divider under the bar
          scrollEdgeEffects: { top: "soft", bottom: "hidden", left: "hidden", right: "hidden" },
          headerLeft: () => (
            <Pressable onPress={closeSheet} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <X size={20} color={C.textPrimary} weight="bold" />
            </Pressable>
          ),
        }}
      />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, overflow: "hidden" as const }}
          >
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.codeSheet, { paddingTop: Platform.OS === "ios" ? SHEET_BAR_H : 0, paddingBottom: insets.bottom + S.md, flexGrow: 1 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Success reveal */}
              {foundTrip ? (
                <TripFoundReveal trip={foundTrip} C={C} onContinue={handleRevealContinue} />
              ) : previewTrip ? (
                // Trip found: the card rises in, the join button follows a beat later
                <View key="preview">
                  <Animated.View entering={FadeInDown.delay(140).springify().damping(18).stiffness(170)}>
                    <TripPreviewCard trip={previewTrip} dates={tripDates(previewTrip)} />
                  </Animated.View>
                  <Animated.View entering={FadeInDown.delay(260).springify().damping(18).stiffness(170)}>
                    <ScalePress
                      onPress={() => revealAndNavigate(previewTrip)}
                      accessibilityRole="button"
                      style={[styles.codeSubmit, { backgroundColor: C.teal, marginTop: S.md }]}
                    >
                      <Text style={[styles.codeSubmitText, { color: C.onAccent }]} numberOfLines={1}>Join {previewTrip.name}</Text>
                    </ScalePress>
                    <Pressable onPress={startOver} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.startOver, { opacity: pressed ? 0.5 : 1 }]}>
                      <Text style={styles.altLink}>Not this trip? Try another PIN</Text>
                    </Pressable>
                  </Animated.View>
                </View>
              ) : (
              <Animated.View key="entry" exiting={FadeOut.duration(120)}>
                <SegmentedControl
                  accessibilityLabel="How to join"
                  values={["PIN", "Scan QR"]}
                  selectedIndex={entryMode === "pin" ? 0 : 1}
                  onChange={(e) => {
                    Haptics.selectionAsync();
                    setCodeError(null);
                    const mode = e.nativeEvent.selectedSegmentIndex === 0 ? "pin" : "qr";
                    if (mode === "qr") Keyboard.dismiss();
                    setEntryMode(mode);
                  }}
                  appearance={isDark ? "dark" : "light"}
                  style={styles.modeTabs}
                />

              {/* PIN */}
              {entryMode === "pin" && (
                <Animated.View entering={FadeIn.duration(180)}>
                  <Text style={styles.pinTitle}>Enter the 6-character PIN from your organiser</Text>
                  <Animated.View style={[styles.pinBoxes, shakeStyle]}>
                    {Array.from({ length: PIN_LEN }).map((_, i) => (
                      <PinCell
                        key={i}
                        index={i}
                        ch={pinValue[i] ?? ""}
                        active={!resolving && !pinLit && i === Math.min(pinValue.length, 5) && !pinComplete}
                        resolving={resolving}
                        lit={pinLit}
                        C={C}
                        styles={styles}
                        onPress={focusPin}
                      />
                    ))}
                    <TextInput
                      ref={(r) => { for (let i = 0; i < 6; i++) pinRefs.current[i] = r; }}
                      value={pinValue}
                      onChangeText={handlePinChange}
                      keyboardType="default"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      textContentType="oneTimeCode"
                      editable={!resolving && !pinLit}
                      returnKeyType="go"
                      onSubmitEditing={() => { if (pinComplete) submitPin(pinValue); }}
                      accessibilityLabel="Trip PIN"
                      caretHidden
                      style={styles.pinHiddenInput}
                    />
                  </Animated.View>
                  <View style={styles.pinHintRow}>
                    <Text style={[styles.groupFooter, styles.pinHint, codeError ? { color: C.redText } : null]}>
                      {codeError ?? (resolving ? "Finding your trip…" : "Not case-sensitive. Links work too.")}
                    </Text>
                    {codeError && pinComplete && !resolving ? (
                      <Pressable onPress={() => submitPin(pinValue)} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.pasteChip, { opacity: pressed ? 0.6 : 1 }]}>
                        <Text style={styles.pasteChipText}>Try again</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={handlePaste} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste PIN or invite link" style={({ pressed }) => [styles.pasteChip, { opacity: pressed ? 0.6 : 1 }]}>
                        <ClipboardText size={14} color={C.tealText} weight="bold" />
                        <Text style={styles.pasteChipText}>Paste</Text>
                      </Pressable>
                    )}
                  </View>

                  {recentTrips.length > 0 && (
                    <View style={{ marginTop: S.xl }}>
                      <Text style={styles.groupHeader}>Already joined</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginHorizontal: -S.lg }}
                        contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm }}
                      >
                        {recentTrips.map(t => (
                          <ScalePress
                            key={t.id}
                            onPress={() => { closeSheet(); setTimeout(() => router.push(`/trip/${t.id}`), 320); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${t.name}`}
                            style={styles.joinedCard}
                          >
                            <CachedImage uri={t.image} style={styles.joinedThumb} />
                            <Text style={styles.tripName} numberOfLines={2}>{t.name}</Text>
                            <Text style={styles.previewSub} numberOfLines={1}>{tripDates(t)}</Text>
                          </ScalePress>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </Animated.View>
              )}

              {/* QR scanner */}
              {entryMode === "qr" && (
                <Animated.View entering={FadeIn.duration(180)}>
                  <QRScanPane
                    C={C}
                    styles={styles}
                    onScanned={(data) => {
                      const id = data.match(INVITE_LINK)?.[1] ?? null;
                      if (id) {
                        submitTripId(id);
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        setCodeError("That QR code isn't a trip invite.");
                        setEntryMode("pin");
                      }
                    }}
                  />
                </Animated.View>
              )}
              </Animated.View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
    </>
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
      position: "absolute", top: -4, right: -4,
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: C.textPrimary,
      borderWidth: 2, borderColor: C.card,
      alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    },
    unreadBadgeText: {
      fontSize: T["2xs"], fontWeight: "700", color: C.bg,
      lineHeight: 12,
    },
    codeSheet: {
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
    backLink: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginBottom: S.md },
    pinTitle: { fontSize: T.base, color: C.textSecondary, textAlign: "center", marginTop: S.xs, marginBottom: S.md },
    pinBoxes: { flexDirection: "row", justifyContent: "center", gap: S.xs },
    pinBox: {
      width: 46, height: 58, borderRadius: R.lg, backgroundColor: C.elevated,
      borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center",
    },
    pinBoxActive: { borderColor: C.teal },
    pinBoxFilled: { backgroundColor: C.card, borderColor: C.border },
    pinBoxText: { fontSize: T["2xl"], fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"] },
    modeTabs: { marginTop: S.xs, marginBottom: S.lg },
    pinCell: {
      width: PIN_W, height: Math.round(PIN_W * 1.25), borderRadius: R.lg,
      borderWidth: 1.5, alignItems: "center", justifyContent: "center",
    },
    pinCellText: { fontSize: T["3xl"], fontWeight: T.bold, color: C.textPrimary, fontVariant: ["tabular-nums"] },
    pinCaret: { width: 2, height: Math.round(PIN_W * 0.5), borderRadius: 1, backgroundColor: C.teal },
    pasteChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: S.sm, paddingVertical: 6, borderRadius: R.sm, backgroundColor: C.tealDim,
    },
    pasteChipText: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },
    joinedCard: { width: 140, gap: 2 },
    joinedThumb: { width: 140, height: 96, borderRadius: R.md, backgroundColor: C.card, marginBottom: S.xs },
    startOver: { alignSelf: "center", paddingVertical: S.md },
    qrNote: { fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary, marginTop: S.sm, textAlign: "center", paddingHorizontal: S.lg },
    qrHint: { fontSize: T.base, color: C.textSecondary, textAlign: "center", marginTop: S.md },
    pinHiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
    pinHintRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.xs, marginTop: S.sm, marginBottom: S.lg },
    pinHint: { flex: 1, paddingHorizontal: 0, marginTop: 0, marginBottom: 0 },
    altGroup: { marginTop: S.xl },
    altRowItem: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 50 },
    altItemText: { flex: 1, fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    altBtn: { flexDirection: "row", alignItems: "center", gap: S.xs2, paddingVertical: S.xs },
    altDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: C.border },
    altLink: { fontSize: T.md, fontWeight: T.medium, color: C.tealText },
    // Boxless: groups sit on the sheet at its own gutter; inputs keep a hairline underline
    group: {
      overflow: "hidden", borderRadius: R.sm,
    },
    groupRow: {
      flexDirection: "row", alignItems: "center", minHeight: 48,
      gap: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
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
      fontSize: 13, lineHeight: 18, color: C.textSecondary,
      paddingHorizontal: S.md, marginTop: S.xs, marginBottom: S.lg,
    },
    groupHeader: {
      fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2,
      marginBottom: S.xs,
    },
    previewRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm2, paddingVertical: S.sm2,
    },
    previewThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.card },
    previewName: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary },
    previewSub: { fontSize: T.sm, color: C.textSecondary },
    tripRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm2,
      paddingVertical: S.xs2, minHeight: 56,
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