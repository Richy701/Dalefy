import {
  View, Text, ScrollView, Pressable,
  StyleSheet, TextInput, KeyboardAvoidingView, Platform,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
  Easing, FadeInDown,
} from "react-native-reanimated";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { Avatar } from "@/components/ui/Avatar";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "@/services/haptics";
import { useRouter, Stack } from "expo-router";
import { parseTripDate } from "@/shared/dates";
import { destinationFlag } from "@/shared/tripSummary";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  CaretRight, CaretLeft, LinkSimple, Scan, Check,
} from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";
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
  const startDate = parseTripDate(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = parseTripDate(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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
              <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} />
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

export default function JoinScreen() {
  const { C, isDark } = useTheme();
  const { trips: joinedTrips } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        if (router.canGoBack()) router.back();
        router.push(`/shared/${id}`);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewTrip(trip);
    } catch {
      if (router.canGoBack()) router.back();
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
  const fmtDay = (d: string) => parseTripDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const tripDates = (t: Trip) => `${fmtDay(t.start)} – ${fmtDay(t.end)}`;
  const recentTrips = [...joinedTrips].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  const canJoin = !!previewTrip && !resolving;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: !foundTrip,
          title: "Join a trip",
          headerStyle: { backgroundColor: C.card },
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={closeSheet} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={{ fontSize: T.lg, color: C.tealText }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: C.card, overflow: "hidden" as const }}
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
              ) : (
              <>

              {entryMode !== "pin" && (
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setCodeError(null); setLinkValue(""); setPreviewTrip(null); setEntryMode("pin"); }}
                  hitSlop={8} accessibilityRole="button" accessibilityLabel="Enter a PIN instead"
                  style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <CaretLeft size={14} color={C.tealText} weight="bold" />
                  <Text style={styles.altLink}>Enter a PIN instead</Text>
                </Pressable>
              )}

              {/* PIN */}
              {entryMode === "pin" && (
                <>
                  <Text style={styles.pinTitle}>Enter the 6-character PIN from your organiser</Text>
                  <Animated.View style={[styles.pinBoxes, shakeStyle]}>
                    {Array.from({ length: 6 }).map((_, i) => {
                      const ch = pinValue[i] ?? "";
                      const active = !resolving && i === Math.min(pinValue.length, 5) && !pinComplete;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => pinRefs.current[0]?.focus()}
                          style={[styles.pinBox, active && styles.pinBoxActive, ch ? styles.pinBoxFilled : null]}
                          accessible={false}
                        >
                          <Text style={styles.pinBoxText}>{ch}</Text>
                        </Pressable>
                      );
                    })}
                    <TextInput
                      ref={(r) => { for (let i = 0; i < 6; i++) pinRefs.current[i] = r; }}
                      value={pinValue}
                      onChangeText={handlePinChange}
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
                      caretHidden
                      style={styles.pinHiddenInput}
                    />
                  </Animated.View>
                  <View style={styles.pinHintRow}>
                    <Text style={[styles.groupFooter, styles.pinHint, codeError ? { color: C.redText } : null]}>
                      {codeError ?? (resolving ? "Finding your trip…" : previewTrip ? "Check this is the right trip, then join." : "Letters and numbers, not case-sensitive.")}
                    </Text>
                    <Pressable onPress={handlePaste} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste PIN from clipboard" style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                      <Text style={styles.altLink}>Paste</Text>
                    </Pressable>
                  </View>

                  {previewTrip && (
                    <Animated.View entering={FadeInDown.duration(260)}>
                      <Text style={styles.groupHeader}>Trip found</Text>
                      <View style={styles.group}>
                        <View style={styles.previewRow}>
                          <CachedImage uri={previewTrip.image} style={styles.previewThumb} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.previewName} numberOfLines={2}>{previewTrip.name}</Text>
                            <Text style={styles.previewSub} numberOfLines={1}>
                              {[previewTrip.destination, tripDates(previewTrip)].filter(Boolean).join(", ")}
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
                      {resolving ? "Finding trip…" : previewTrip ? `Join ${previewTrip.name}` : "Join trip"}
                    </Text>
                  </Pressable>

                  {!previewTrip && (
                    <View style={styles.altGroup}>
                      <Text style={styles.groupHeader}>Other ways to join</Text>
                      <Pressable onPress={() => { Haptics.selectionAsync(); setCodeError(null); setEntryMode("qr"); }} accessibilityRole="button" accessibilityLabel="Scan a QR code" style={({ pressed }) => [styles.altRowItem, pressed && { opacity: 0.6 }]}>
                        <Scan size={20} color={C.textSecondary} weight="regular" />
                        <Text style={styles.altItemText}>Scan a QR code</Text>
                        <CaretRight size={14} color={C.textTertiary} weight="regular" />
                      </Pressable>
                      <Pressable onPress={() => { Haptics.selectionAsync(); setCodeError(null); setEntryMode("link"); }} accessibilityRole="button" accessibilityLabel="Paste an invite link" style={({ pressed }) => [styles.altRowItem, styles.tripRowBorder, pressed && { opacity: 0.6 }]}>
                        <LinkSimple size={20} color={C.textSecondary} weight="regular" />
                        <Text style={styles.altItemText}>Paste an invite link</Text>
                        <CaretRight size={14} color={C.textTertiary} weight="regular" />
                      </Pressable>
                    </View>
                  )}

                  {!previewTrip && recentTrips.length > 0 && (
                    <View style={{ marginTop: S.xl }}>
                      <Text style={styles.groupHeader}>Already joined</Text>
                      <View style={styles.group}>
                        {recentTrips.map((t, i) => (
                          <Pressable
                            key={t.id}
                            onPress={() => { closeSheet(); router.push(`/trip/${t.id}`); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${t.name}`}
                            style={({ pressed }) => [styles.tripRow, i > 0 && styles.tripRowBorder, { backgroundColor: pressed ? C.elevated : "transparent" }]}
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
                              {[previewTrip.destination, tripDates(previewTrip)].filter(Boolean).join(", ")}
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
                      {resolving ? "Finding trip…" : previewTrip ? `Join ${previewTrip.name}` : "Join trip"}
                    </Text>
                  </Pressable>
                </>
              )}

              </>
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
    backLink: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginBottom: S.md },
    pinTitle: { fontSize: T.base, color: C.textSecondary, textAlign: "center", marginTop: S.xs, marginBottom: S.md },
    pinBoxes: { flexDirection: "row", justifyContent: "center", gap: S.xs },
    pinBox: {
      width: 46, height: 58, borderRadius: R.lg, backgroundColor: C.elevated,
      borderWidth: 1.5, borderColor: "transparent", alignItems: "center", justifyContent: "center",
    },
    pinBoxActive: { borderColor: C.teal },
    pinBoxFilled: { backgroundColor: C.card, borderColor: C.border },
    pinBoxText: { fontSize: T["2xl"], fontWeight: T.semibold, color: C.textPrimary, fontVariant: ["tabular-nums"] },
    pinHiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
    pinHintRow: { flexDirection: "row", alignItems: "flex-start", gap: S.sm, paddingHorizontal: S.xs, marginTop: S.sm, marginBottom: S.lg },
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
      fontSize: 13, lineHeight: 18, color: C.textTertiary,
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
    previewSub: { fontSize: T.sm, color: C.textTertiary },
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