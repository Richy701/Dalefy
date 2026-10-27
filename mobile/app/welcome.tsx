import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { heroPosition } from "@/shared/imagePosition";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
  ActionSheetIOS, Alert, ActivityIndicator, Keyboard, useWindowDimensions,
} from "react-native";
import type { HostInstance, TextInputInstance } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { uploadAvatar } from "@/services/avatarUpload";
import { updateMemberProfile } from "@/services/firebaseTrips";
import { CaretLeft, Camera, User, Ticket, Check, X, ClipboardText } from "phosphor-react-native";
import { TripPreviewCard } from "@/components/TripPreviewCard";
import Animated, {
  FadeIn, FadeInUp, FadeInDown, useSharedValue, useAnimatedStyle, withSequence, withTiming,
  Easing, Extrapolation, interpolate, runOnJS,
} from "react-native-reanimated";
import { photoPalette, PhotoBackdrop, PhotoDissolve } from "@/components/ui/PhotoBackdrop";
import { handOffTrip } from "@/services/joinHandoff";
import { waitForAuth } from "@/services/firebase";
import { PinCell, PIN_LEN, PIN_W } from "@/components/ui/PinCell";
import { BlurredHero } from "@/components/ui/HeroSlideshow";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand } from "@/context/BrandContext";
import { useAuth } from "@/context/AuthContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { fetchOrgByCode, type OrgBranding } from "@/services/firebaseBranding";
import { fetchTripByShortCode, fetchTripById, fetchMyTrips } from "@/services/firebaseTrips";
import { parseTripDate } from "@/shared/dates";
import type { ImageFocalPoint, Trip } from "@/shared/types";
import { T, R, S, SHEET_BAR_H, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";

type Step = "code" | "profile";

const INVITE_LINK = /shared\/([A-Za-z0-9_-]+)/;

/** iOS's own small bordered Paste button (with the clipboard symbol), sitting inside the code box; a glass pill elsewhere */
function PasteButton({ onPress, plain = false }: { onPress: () => void; plain?: boolean }) {
  if (Platform.OS === "ios" && !plain) {
    const { Host, Button } = require("@expo/ui/swift-ui");
    const { buttonStyle, controlSize, tint } = require("@expo/ui/swift-ui/modifiers");
    return (
      <Host matchContents colorScheme="dark">
        <Button label="Paste" systemImage="doc.on.clipboard" onPress={onPress} modifiers={[buttonStyle("bordered"), controlSize("small"), tint("#ffffff")]} />
      </Host>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste code or invite link"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: S.sm, paddingVertical: 6, borderRadius: R.sm, backgroundColor: "rgba(255,255,255,0.14)", opacity: pressed ? 0.6 : 1 })}>
      <ClipboardText size={14} color="#fff" weight="bold" />
      <Text style={{ fontSize: T.sm, fontWeight: T.semibold, color: "#fff" }}>Paste</Text>
    </Pressable>
  );
}

type LaunchFrame = { x: number; y: number; w: number; h: number };
// The trip page's hero height (app/trip/[id].tsx, and the joining screen in app/shared/[tripId].tsx)
const TRIP_HERO_H = 380;

/**
 * The card's photo leaves the card and grows into the top of the screen, exactly where the trip page shows it,
 * while the blurred cover fills in behind. The joining screen then fades in over an identical frame.
 */
function JoinLaunch({ uri, position, from, onDone }: { uri: string; position?: ImageFocalPoint; from: LaunchFrame; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 620, easing: Easing.bezier(0.22, 1, 0.36, 1) }, done => {
      if (done) runOnJS(onDone)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    left: interpolate(p.value, [0, 1], [from.x, 0]),
    top: interpolate(p.value, [0, 1], [from.y, 0]),
    width: interpolate(p.value, [0, 1], [from.w, width]),
    height: interpolate(p.value, [0, 1], [from.h, TRIP_HERO_H]),
    borderRadius: interpolate(p.value, [0, 1], [R.xl, 0]),
    // Takes over from the card's own photo in the first few frames, so their different edges never show
    opacity: interpolate(p.value, [0, 0.12], [0, 1], Extrapolation.CLAMP),
  }));
  const wash = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.7], [0, 1], Extrapolation.CLAMP) }));
  const settle = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.55, 1], [0, 1], Extrapolation.CLAMP) }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, wash]}>
        <PhotoBackdrop uri={uri} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", overflow: "hidden" }, box]}>
        <CachedImage uri={uri} transition={0} style={StyleSheet.absoluteFill} contentPosition={heroPosition(position)} accessible={false} />
        {/* As it lands: the same top shade and melt into the blur as the trip page's hero */}
        <Animated.View style={[StyleSheet.absoluteFill, settle]} pointerEvents="none">
          <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]} locations={[0, 0.3]} style={StyleSheet.absoluteFill} />
          <PhotoDissolve uri={uri} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const fmtDay = (d: string) => parseTripDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function WelcomeScreen() {
  const { C: themeC, isDark: isDarkTheme } = useTheme();
  const { brand, refreshBranding } = useBrand();
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const haptic = useHaptic();
  const { toast } = useToast();
  const auth = useAuth();
  const isEdit = !!(prefs.name) && !preview;
  // Onboarding sits on the holiday photo, so its colours come from the photo palette; Edit profile keeps the app's own
  const C = useMemo(() => (isEdit ? themeC : photoPalette(themeC, isDarkTheme)), [isEdit, themeC, isDarkTheme]);

  // Name is only asked for when neither the profile nor the sign-in provider gave us one.
  const rawProviderName = (auth.user?.name || "").trim();
  const emailLocalPart = (auth.user?.email || "").split("@")[0];
  const providerName = rawProviderName && rawProviderName !== emailLocalPart && rawProviderName !== "Traveler"
    ? rawProviderName
    : "";
  const needsName = !prefs.name && !providerName;
  const firstName = (() => {
    const w = providerName.split(/\s+/)[0] || "";
    return w ? w.charAt(0).toUpperCase() + w.slice(1) : "";
  })();

  const [step, setStep] = useState<Step>(isEdit ? "profile" : "code");
  const [code, setCode] = useState(prefs.orgSlug || "");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [matchedOrg, setMatchedOrg] = useState<string | null>(null);
  const [matchedTrip, setMatchedTrip] = useState<Trip | null>(null);

  const [name, setName] = useState(prefs.name || providerName);
  const [avatar, setAvatar] = useState(prefs.avatar || auth.user?.avatar || "");
  const uploadedUrlRef = useRef<string | null>(null);
  // Save awaits this, so a half-uploaded photo never reaches the trip roster as a phone-local path
  const uploadPromiseRef = useRef<Promise<string | null> | null>(null);
  const [, setUploading] = useState(false);
  const nameRef = useRef<TextInputInstance>(null);
  const styles = useMemo(() => makeStyles(C, !isEdit), [C, isEdit]);
  const [nameFocused, setNameFocused] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;
  // Edit mode: the save tick lights up only once something has changed
  const canSave = canSubmit && (!isEdit || trimmed !== (prefs.name || "").trim() || avatar !== (prefs.avatar || auth.user?.avatar || ""));

  const goBackToCode = useCallback(() => {
    haptic.selection();
    setStep("code");
  }, [haptic]);

  // ── Finish ──
  const finishOnboarding = useCallback((finalName: string, finalAvatar: string, trip: Trip | null, travelerId: string | null = null) => {
    setPref("name", finalName);
    if (finalAvatar) setPref("avatar", finalAvatar);
    haptic.medium();
    if (trip) handOffTrip(trip);
    if (trip) router.replace(`/shared/${trip.id}?join=1${travelerId ? `&traveler=${encodeURIComponent(travelerId)}` : ""}`);
    else router.replace("/(tabs)");
  }, [setPref, haptic, router]);

  // Trips the organiser listed this person's sign-in email on, found by the server (it never sends emails to the
  // app). Looked up once on arrival: the soonest one is offered straight away, no code needed.
  const [mine, setMine] = useState<Record<string, { id: string | null; name: string | null }>>({});
  const [lookingUp, setLookingUp] = useState(false);
  const lookedUp = useRef(false);
  useEffect(() => {
    if (lookedUp.current || isEdit || !auth.isAuthenticated) return;
    lookedUp.current = true;
    setLookingUp(true);
    fetchMyTrips().then(({ trips }) => {
      setMine(Object.fromEntries(trips.map(t => [t.trip.id, { id: t.travelerId, name: t.travelerName }])));
      const now = new Date();
      const next = trips.find(t => parseTripDate(t.trip.end) >= now) ?? trips[0];
      if (next) {
        if (next.trip.organizationId) { setPref("orgId", next.trip.organizationId); refreshBranding(); }
        setMatchedTrip(next.trip);
      }
    }).finally(() => setLookingUp(false));
  }, [isEdit, auth.isAuthenticated, setPref, refreshBranding]);

  // Who this person is on a trip, if the organiser listed their email on it
  const travellerFor = useCallback((trip: Trip | null) => (trip ? mine[trip.id] ?? null : null), [mine]);

  const asksName = useCallback((trip: Trip | null) => needsName && !travellerFor(trip)?.name?.trim(), [needsName, travellerFor]);

  const afterCode = useCallback((trip: Trip | null) => {
    // The organiser already has their name: use it rather than asking. But an account that has picked
    // a name keeps it; a listed name only fills in on the first sign-in. Otherwise adding yourself to a
    // trip under another name for a test renames your account on every trip you have joined.
    const keptName = prefs.name?.trim() || "";
    const listedName = travellerFor(trip)?.name?.trim() || "";
    if (asksName(trip)) {
      setStep("profile");
      return;
    }
    finishOnboarding(keptName || listedName || providerName, auth.user?.avatar || "", trip, travellerFor(trip)?.id ?? null);
  }, [asksName, finishOnboarding, prefs.name, providerName, auth.user?.avatar, travellerFor]);

  // "Join this trip": the card's photo grows into the trip page's hero, then the joining screen takes over in place
  const cardPhotoRef = useRef<HostInstance>(null);
  const [launchFrom, setLaunchFrom] = useState<LaunchFrame | null>(null);
  const joinMatched = useCallback(() => {
    if (!matchedTrip || launchFrom) return;
    haptic.medium();
    // Without a name on the trip, the profile step comes first, so there's nothing to grow into yet
    if (asksName(matchedTrip) || !matchedTrip.image || !cardPhotoRef.current) { afterCode(matchedTrip); return; }
    cardPhotoRef.current.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setLaunchFrom({ x, y, w, h });
      else afterCode(matchedTrip);
    });
  }, [matchedTrip, launchFrom, haptic, asksName, afterCode]);

  // A new phone signs in as a guest before its first lookup; start that now so the PIN doesn't wait on it
  useEffect(() => {
    if (isEdit) return;
    waitForAuth().catch(() => {});
  }, [isEdit]);

  // ── One box for whatever the organiser sent: a trip PIN, an organisation code or an invite link ──
  const codeInputRef = useRef<TextInputInstance>(null);
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-6, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(-4, { duration: 50 }),
      withTiming(4, { duration: 50 }), withTiming(0, { duration: 50 }),
    );
  };

  // Typing: a soft pulse per character, a teal edge while focused, and a live guess at what's being entered
  const [codeFocused, setCodeFocused] = useState(false);
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const ready = useSharedValue(code.trim() ? 1 : 0);
  useEffect(() => { ready.value = withTiming(code.trim() ? 1 : 0, { duration: 220 }); }, [code, ready]);
  const readyStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * ready.value }));
  const onCodeChange = (t: string) => {
    if (t.length > code.length) {
      haptic.selection();
      pulse.value = withSequence(withTiming(1.015, { duration: 70 }), withTiming(1, { duration: 140 }));
    }
    setCode(t);
    if (codeError) setCodeError("");
  };
  // Bring the keyboard up as soon as the PIN boxes appear (autoFocus doesn't fire when a field swaps in)
  useEffect(() => {
    if (!matchedOrg || matchedTrip) return;
    const t = setTimeout(() => codeInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [matchedOrg, matchedTrip]);

  const pinValue = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, PIN_LEN);
  const onPinChange = (val: string) => {
    if (INVITE_LINK.test(val)) { setCode(val); lookupCode(val); return; }
    // Keep exactly what was typed in the field (rewriting it, e.g. to capitals, makes iOS drop the field's focus);
    // the boxes show it in capitals and the lookup uses capitals
    const clean = val.replace(/[^A-Za-z0-9]/g, "").slice(0, PIN_LEN);
    if (clean.length > pinValue.length) haptic.selection();
    setCode(clean);
    if (codeError) setCodeError("");
    if (clean.length === PIN_LEN) lookupCode(clean.toUpperCase());
  };

  const tripFound = (trip: Trip) => {
    haptic.medium();
    Keyboard.dismiss();
    if (trip.organizationId) {
      setPref("orgId", trip.organizationId);
      refreshBranding();
    }
    setMatchedTrip(trip);
  };

  const orgFound = (branding: OrgBranding, slug: string) => {
    haptic.medium();
    setPref("orgId", branding.organizationId);
    setPref("orgSlug", slug);
    refreshBranding();
    setMatchedOrg(branding.companyName || slug);
    // Ready for a trip PIN next, if they have one
    setCode("");
  };

  const lookupCode = async (input?: string) => {
    const raw = (input ?? code).trim();
    if (!raw) return;
    setCodeLoading(true);
    setCodeError("");
    try {
      const { waitForAuth } = require("@/services/firebase");
      await waitForAuth();

      // An invite link names its trip outright
      const linkId = raw.match(INVITE_LINK)?.[1];
      if (linkId) {
        const trip = await fetchTripById(linkId);
        if (trip) { tripFound(trip); return; }
        throw new Error("That invite link didn't open a trip. Ask your organiser to send it again.");
      }

      // Six letters or numbers is most likely a trip PIN; otherwise (or if no trip matches) an organisation code
      const pinLike = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (pinLike.length === 6) {
        const trip = await fetchTripByShortCode(pinLike);
        if (trip) { tripFound(trip); return; }
      }
      if (!matchedOrg) {
        const slug = raw.toLowerCase();
        const branding = await fetchOrgByCode(slug);
        if (branding?.organizationId) { orgFound(branding, slug); return; }
      }
      throw new Error(matchedOrg
        ? "That PIN doesn't match a trip. Check it with your organiser."
        : "That code doesn't match a trip or a travel company. Check it with your organiser.");
    } catch (e: any) {
      haptic.warning();
      shake();
      if (matchedOrg) setCode("");
      setCodeError(e?.message?.startsWith("That") ? e.message : "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setCodeLoading(false);
    }
  };

  const pasteCode = async () => {
    haptic.light();
    const text = (await Clipboard.getStringAsync().catch(() => "")).trim();
    if (!text) { setCodeError("Nothing to paste. Copy the code or invite link from your organiser's message first."); return; }
    setCode(text.match(INVITE_LINK) ? text : text.slice(0, 60));
    lookupCode(text);
  };

  const startOver = () => {
    haptic.selection();
    setMatchedTrip(null);
    setCode("");
    setCodeError("");
    setTimeout(() => codeInputRef.current?.focus(), 300);
  };

  const skipCode = () => {
    haptic.selection();
    afterCode(null);
  };

  // ── Avatar picker ──
  const pickAvatar = async () => {
    haptic.selection();

    const pick = async (source: "camera" | "library") => {
      const launchFn = source === "camera"
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

      const result = await launchFn({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const tempUri = result.assets[0].uri;
        setAvatar(tempUri);
        setUploading(true);

        const ext = tempUri.split(".").pop()?.toLowerCase() || "jpg";
        const localPath = `${FileSystem.documentDirectory}avatar.${ext}`;

        FileSystem.copyAsync({ from: tempUri, to: localPath })
          .then(() => {
            if (!uploadedUrlRef.current) {
              setPref("avatar", localPath);
              setAvatar(localPath);
            }
          })
          .catch(() => {});

        uploadPromiseRef.current = uploadAvatar(tempUri).then((url) => {
          if (url) {
            uploadedUrlRef.current = url;
            setAvatar(url);
            setPref("avatar", url);
          }
          return url;
        }).finally(() => setUploading(false));
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Take Photo", "Choose from Library", "Cancel"],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) pick("camera");
          if (idx === 1) pick("library");
        },
      );
    } else {
      Alert.alert("Profile photo", undefined, [
        { text: "Take Photo", onPress: () => pick("camera") },
        { text: "Choose from Library", onPress: () => pick("library") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  // ── Submit (profile step) ──
  const submit = async () => {
    if (!canSubmit) return;
    haptic.selection();
    if (uploadPromiseRef.current) await uploadPromiseRef.current;
    const finalAvatar = uploadedUrlRef.current || avatar;

    if (isEdit) {
      setPref("name", trimmed);
      if (finalAvatar) setPref("avatar", finalAvatar);
      updateMemberProfile(trimmed, finalAvatar || null);
      if (router.canGoBack()) {
        toast("Profile updated");
        router.back();
      } else {
        router.replace("/(tabs)");
      }
      return;
    }

    finishOnboarding(trimmed, finalAvatar, matchedTrip);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Agency code or trip PIN
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "code") {
    // The sign-in photos carry on, blurred, so this reads as the next step of the same screen
    const P = C;
    const title = lookingUp && !matchedTrip
      ? "Finding your trips…"
      : matchedTrip
      ? (() => {
          const first = travellerFor(matchedTrip)?.name?.trim().split(/\s+/)[0];
          return first ? `Welcome, ${first}` : "We found your trip";
        })()
      : matchedOrg
        ? `Connected to ${matchedOrg}`
        : firstName ? `Hi ${firstName}, got a code?` : "Got a code?";
    const sub = lookingUp && !matchedTrip
      ? "Checking which trips your organiser has added you to."
      : matchedTrip
      ? (travellerFor(matchedTrip) ? "Your organiser has you down for this trip. Join to see your plan." : "Check it's the right one, then join to see the full plan.")
      : matchedOrg
        ? "Now enter the 6-character PIN from your trip invite."
        : "Enter or paste whatever your organiser sent you: a trip PIN, an organisation code or an invite link.";
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <BlurredHero />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.stepScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: S.xl }}>
                {matchedOrg && brand.logoUrl ? (
                  <View style={styles.orgLogo}><Image source={{ uri: brand.logoUrl }} style={{ width: 46, height: 46 }} resizeMode="contain" /></View>
                ) : <Logo size={24} color="#fff" />}
              </Animated.View>

              <Animated.Text key={title} entering={FadeInUp.duration(350)} style={[styles.stepTitle, { color: "#fff" }]}>{title}</Animated.Text>
              <Animated.Text key={sub} entering={FadeInUp.duration(350).delay(60)} style={[styles.stepSub, { color: P.textSecondary }]}>{sub}</Animated.Text>

              {matchedTrip ? (
                <Animated.View entering={FadeInDown.duration(380)}>
                  <TripPreviewCard glass trip={matchedTrip} photoRef={cardPhotoRef} dates={`${fmtDay(matchedTrip.start)} – ${fmtDay(matchedTrip.end)}`} />
                </Animated.View>
              ) : lookingUp ? (
                <ActivityIndicator size="large" color="#fff" style={{ alignSelf: "flex-start", marginTop: S.md }} />
              ) : matchedOrg ? (
                // Connected to their company: now the six PIN boxes, which find the trip on the sixth character
                <Animated.View entering={FadeInUp.duration(350).delay(120)}>
                  <Animated.View style={[styles.pinRow, shakeStyle]}>
                    {Array.from({ length: PIN_LEN }).map((_, i) => (
                      <PinCell
                        key={i}
                        index={i}
                        ch={pinValue[i] ?? ""}
                        active={!codeLoading && i === Math.min(pinValue.length, PIN_LEN - 1) && pinValue.length < PIN_LEN}
                        resolving={codeLoading}
                        lit={false}
                        C={C}
                        styles={styles}
                        onPress={() => codeInputRef.current?.focus()}
                      />
                    ))}
                    <TextInput
                      ref={codeInputRef}
                      value={code}
                      onChangeText={onPinChange}
                      autoFocus
                      autoCapitalize="characters"
                      autoCorrect={false}
                      textContentType="oneTimeCode"
                      editable={!codeLoading}
                      accessibilityLabel="Trip PIN"
                      caretHidden
                      style={styles.pinHiddenInput}
                    />
                  </Animated.View>
                  {codeError ? (
                    <Animated.Text entering={FadeInDown.duration(220)} style={[styles.pinHint, { color: "#ff8a80", textAlign: "center" }]}>{codeError}</Animated.Text>
                  ) : null}
                  <View style={{ alignSelf: "center", marginTop: S.lg }}>
                    {/* The plain button here: the native one takes the keyboard's focus when the boxes redraw */}
                    <PasteButton onPress={pasteCode} plain />
                  </View>
                </Animated.View>
              ) : (
                <Animated.View entering={FadeInUp.duration(350).delay(120)}>
                  <Animated.View style={[styles.glassInput, codeFocused && !codeError ? { borderColor: C.teal } : null, codeError ? { borderColor: "#ff8a80" } : null, shakeStyle, pulseStyle]}>
                    <Ticket size={20} color={P.textTertiary} weight="regular" />
                    <TextInput
                      ref={codeInputRef}
                      value={code}
                      onChangeText={onCodeChange}
                      onFocus={() => setCodeFocused(true)}
                      onBlur={() => setCodeFocused(false)}
                      placeholder="Your code"
                      placeholderTextColor={P.textTertiary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                      returnKeyType="go"
                      onSubmitEditing={() => lookupCode()}
                      editable={!codeLoading}
                      style={[styles.input, styles.codeInput]}
                    />
                    {/* Paste lives in the box while it's empty, so nothing gets pushed under the buttons */}
                    {codeLoading ? <ActivityIndicator size="small" color="#fff" /> : !code ? <PasteButton onPress={pasteCode} /> : null}
                  </Animated.View>
                  {codeError ? (
                    <Animated.Text entering={FadeInDown.duration(220)} style={[styles.pinHint, { color: "#ff8a80" }]}>{codeError}</Animated.Text>
                  ) : null}
                </Animated.View>
              )}
            </ScrollView>

            <Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.footer}>
              {matchedTrip ? (
                <>
                  <Pressable onPress={joinMatched} accessibilityRole="button" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}>
                    <Text style={styles.ctaText}>Join this trip</Text>
                  </Pressable>
                  <Pressable onPress={startOver} accessibilityRole="button" style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}>
                    <Text style={[styles.skipText, { color: P.textSecondary }]}>Not your trip? Try another code</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {!matchedOrg && <Animated.View style={readyStyle}>
                    <Pressable onPress={() => lookupCode()} disabled={codeLoading || !code.trim()} accessibilityRole="button" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}>
                      {codeLoading ? <ActivityIndicator size="small" color={C.onAccent} /> : <Text style={styles.ctaText}>Continue</Text>}
                    </Pressable>
                  </Animated.View>}
                  {matchedOrg ? (
                    <Pressable
                      onPress={() => { haptic.selection(); setMatchedOrg(null); setCode(""); setCodeError(""); setTimeout(() => codeInputRef.current?.focus(), 300); }}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[styles.skipText, { color: "rgba(255,255,255,0.9)" }]}>Use a different code</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={matchedOrg ? () => { haptic.selection(); afterCode(null); } : skipCode} disabled={codeLoading} accessibilityRole="button" accessibilityLabel="Skip for now" style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}>
                    <Text style={[styles.skipText, { color: P.textSecondary }]}>{matchedOrg ? "Carry on without a trip" : "I don't have a code yet"}</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
        {launchFrom && matchedTrip ? <JoinLaunch uri={matchedTrip.image} position={matchedTrip.imagePosition} from={launchFrom} onDone={() => afterCode(matchedTrip)} /> : null}
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Profile (name + avatar)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={[styles.safe, isEdit && { backgroundColor: "transparent" }]}>
      {!isEdit && <StatusBar style="light" />}
      {!isEdit && <BlurredHero />}
      {isEdit && (
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Edit profile",
            // Glass sheet like Join: the bar sits on the system material
            headerTransparent: true,
            headerTitleStyle: { color: C.textPrimary },
            headerShadowVisible: false,
            scrollEdgeEffects: { top: "soft", bottom: "hidden", left: "hidden", right: "hidden" },
            headerLeft: () => (
              // iOS 26 sheets: an X to close and a filled tick to save, instead of Cancel and Save
              <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel" style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <X size={20} color={C.textPrimary} weight="bold" />
              </Pressable>
            ),
            headerRight: () => (
              <Pressable onPress={submit} disabled={!canSave} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save" accessibilityState={{ disabled: !canSave }}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: canSave ? C.teal : "transparent" }}
              >
                <Check size={20} color={canSave ? C.onAccent : C.textTertiary} weight="bold" />
              </Pressable>
            ),
          }}
        />
      )}
      <SafeAreaView style={{ flex: 1, paddingTop: isEdit && Platform.OS === "ios" ? SHEET_BAR_H : 0 }} edges={isEdit ? ["bottom"] : ["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          {/* Top-left nav button */}
          {!isEdit ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.topNav}>
              <Pressable
                onPress={goBackToCode}
                style={({ pressed }) => [styles.topNavBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
              >
                <CaretLeft size={18} color={C.textPrimary} weight="regular" />
              </Pressable>
            </Animated.View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.stepScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar */}
            <Animated.View entering={FadeInUp.duration(400).delay(100)} style={[styles.avatarSection, isEdit && { alignItems: "center", marginTop: S["2xl"] + S.lg }, !isEdit && { marginTop: S.md }]}>
              <Pressable
                onPress={pickAvatar}
                style={({ pressed }) => [styles.avatarWrap, isEdit && styles.avatarLarge, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]}
                accessibilityRole="button"
                accessibilityLabel={avatar ? "Change profile photo" : "Add profile photo"}
              >
                <View style={[styles.avatarCircle, isEdit && styles.avatarLarge]}>
                  {avatar ? (
                    <CachedImage uri={avatar} style={[styles.avatarImage, isEdit && styles.avatarLarge]} blurhash={null} />
                  ) : isEdit && name.trim() ? (
                    <Text style={styles.avatarInitial}>{name.trim()[0].toUpperCase()}</Text>
                  ) : (
                    <User size={36} color={C.textTertiary} weight="thin" />
                  )}
                </View>
                {!isEdit && (
                  <View style={[styles.cameraBadge, { backgroundColor: C.teal }]}>
                    <Camera size={11} color={C.onAccent} weight="bold" />
                  </View>
                )}
              </Pressable>
              {(!avatar || isEdit) && (
                <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel={avatar ? "Change profile photo" : "Add profile photo"} style={({ pressed }) => [{ marginTop: S.xs }, pressed && { opacity: 0.7 }]}>
                  <Text style={{ fontSize: T.base, fontWeight: T.semibold, color: C.tealText }}>{avatar ? "Change photo" : "Add photo"}</Text>
                </Pressable>
              )}
              {isEdit && !!avatar && (
                <Pressable onPress={() => setAvatar("")} accessibilityRole="button" accessibilityLabel="Remove profile photo" hitSlop={6} style={({ pressed }) => [{ marginTop: S.xs }, pressed && { opacity: 0.7 }]}>
                  <Text style={{ fontSize: T.sm, color: C.textSecondary }}>Remove photo</Text>
                </Pressable>
              )}
            </Animated.View>

            {!isEdit && (
              <>
                <Animated.Text entering={FadeInUp.duration(400).delay(200)} style={styles.stepTitle}>
                  {"What should\nwe call you?"}
                </Animated.Text>
                <Animated.Text entering={FadeInUp.duration(400).delay(300)} style={styles.stepSub}>
                  This is how you'll appear to your organiser and the other travellers.
                </Animated.Text>
              </>
            )}

            {/* Name input */}
            <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.inputWrap}>
              <View style={isEdit ? styles.groupRow : [styles.inputRow, nameFocused && { borderColor: C.teal }]}>
                {isEdit ? <Text style={styles.groupLabel}>Name</Text> : <User size={18} color={C.textTertiary} weight="regular" />}
                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  placeholder="Your name"
                  placeholderTextColor={C.textTertiary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="name"
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  maxLength={40}
                  accessibilityLabel="Name"
                  style={[styles.input, isEdit && styles.nameInput]}
                />
              </View>
              {isEdit && <Text style={styles.groupFooter}>This is how you appear to your organiser and the other travellers.</Text>}
            </Animated.View>
          </ScrollView>

          {/* CTA (onboarding only; edit mode saves from the nav row) */}
          {!isEdit && (
          <Animated.View entering={FadeInUp.duration(300).delay(350)} style={styles.footer}>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? "Save" : "Continue"}
              style={({ pressed }) => [
                styles.cta,
                !canSubmit && styles.ctaDisabled,
                pressed && canSubmit && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={[styles.ctaText, !canSubmit && { color: isEdit ? C.textTertiary : "rgba(255,255,255,0.6)" }]}>
                Let's go
              </Text>
            </Pressable>
          </Animated.View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** onPhoto: the onboarding steps, on the blurred holiday photo, with glass surfaces instead of solid cards */
function makeStyles(C: ThemeColors, onPhoto = false) {
  const glass = "rgba(255,255,255,0.12)";
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: onPhoto ? "#000" : C.bg },

    // ── Top nav ──
    topNav: {
      paddingHorizontal: S.lg, paddingTop: S.xs,
    },
    topNavBtn: {
      width: 36, height: 36, borderRadius: R.full,
      backgroundColor: onPhoto ? glass : C.elevated,
      alignItems: "center", justifyContent: "center",
    },

    // ── Step screens ──
    stepScroll: {
      paddingHorizontal: S.lg, paddingTop: S.lg, flexGrow: 1,
    },
    stepTitle: {
      fontSize: 30, fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.5, lineHeight: 35,
      marginBottom: S.xs,
    },
    stepSub: {
      fontSize: T.base, color: C.textSecondary,
      fontWeight: T.regular, lineHeight: T.base + 8,
      marginBottom: S.xl,
    },

    // ── Match card ──
    matchCard: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      backgroundColor: C.card, borderRadius: R.lg,
      borderWidth: 1, borderColor: C.border,
      paddingHorizontal: S.md, paddingVertical: S.sm,
    },
    matchIcon: {
      width: 36, height: 36, borderRadius: R.sm,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    matchTitle: { fontSize: T.md, fontWeight: T.semibold, color: C.textPrimary },
    matchSub: { fontSize: T.sm, color: C.textSecondary, marginTop: 2 },

    // ── Edit mode nav + grouped row ──
    editNav: { flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: S.md },
    editNavSide: { width: 72, justifyContent: "center" },
    editNavAction: { fontSize: T.lg, color: C.tealText },
    editNavTitle: { flex: 1, textAlign: "center", fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary },
    // Contacts-style: one large centred name in a soft see-through field on the glass sheet
    groupRow: {
      minHeight: 52, flexDirection: "row", alignItems: "center",
      backgroundColor: C.card, borderRadius: R.lg, paddingHorizontal: S.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    nameInput: { flex: 1, textAlign: "left", fontSize: T.lg },
    groupLabel: { fontSize: T.lg, color: C.textPrimary, width: 84 },
    groupFooter: { fontSize: 13, lineHeight: 18, color: C.textTertiary, paddingHorizontal: S.md, marginTop: S.xs },

    // ── Input ──
    inputWrap: { marginBottom: S.md },
    inputRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      height: 54,
      backgroundColor: onPhoto ? "rgba(255,255,255,0.1)" : C.card,
      borderRadius: R.lg,
      paddingHorizontal: S.md,
      borderWidth: onPhoto ? 1.5 : 1, borderColor: onPhoto ? "rgba(255,255,255,0.2)" : C.border,
    },
    input: {
      flex: 1, height: 54,
      fontSize: T.lg,
      color: C.textPrimary,
      fontWeight: onPhoto ? T.semibold : T.regular,
    },
    checkBadge: {
      width: 22, height: 22, borderRadius: 11,
      alignItems: "center", justifyContent: "center",
    },

    // ── Avatar ──
    avatarSection: {
      alignItems: "flex-start",
      marginBottom: S.xl,
    },
    avatarWrap: {
      width: 88, height: 88,
    },
    avatarCircle: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: onPhoto ? glass : C.elevated,
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: 88, height: 88, borderRadius: 44,
    },
    avatarLarge: { width: 112, height: 112, borderRadius: 56 },
    avatarInitial: { fontSize: 44, fontWeight: T.semibold, color: C.textSecondary },
    cameraBadge: {
      position: "absolute", bottom: 0, right: -2,
      width: 28, height: 28, borderRadius: 14,
      alignItems: "center", justifyContent: "center",
      borderWidth: onPhoto ? 0 : 3, borderColor: C.bg,
    },

    // ── Error / helper ──
    // ── The code box on the photo ──
    codeInput: { color: "#fff", fontSize: T.lg, fontWeight: T.semibold },
    pinRow: { flexDirection: "row", justifyContent: "center", gap: S.xs, marginTop: S.xs },
    pinCell: {
      width: PIN_W, height: Math.round(PIN_W * 1.25), borderRadius: R.lg,
      borderWidth: 1.5, alignItems: "center", justifyContent: "center",
    },
    pinCellText: { fontSize: T["3xl"], fontWeight: T.bold, color: "#fff", fontVariant: ["tabular-nums"] },
    pinCaret: { width: 2, height: Math.round(PIN_W * 0.5), borderRadius: 1, backgroundColor: C.teal },
    // Covers all six boxes, so a tap anywhere on them lands in the field itself (nearly invisible, still focusable)
    pinHiddenInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: "transparent" },
    pinHint: { fontSize: T.sm, lineHeight: 19, textAlign: "center", marginTop: S.md },
    // Company logos are made for white, so they sit on a white tile rather than the glass
    orgLogo: {
      width: 60, height: 60, borderRadius: R.lg, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden",
      shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    glassInput: {
      flexDirection: "row", alignItems: "center", gap: S.sm, height: 56, paddingHorizontal: S.md,
      borderRadius: R.lg, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)",
    },
    errorText: {
      fontSize: T.sm, color: C.redText,
      fontWeight: T.medium, marginTop: S.sm,
      paddingHorizontal: S["2xs"],
    },

    // ── Footer / CTA ──
    footer: {
      paddingHorizontal: S.lg,
      paddingTop: S.sm, paddingBottom: S.md,
    },
    cta: {
      height: 52, borderRadius: R.xl,
      backgroundColor: C.teal,
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S.xs,
    },
    ctaDisabled: {
      backgroundColor: onPhoto ? glass : C.tealDim,
    },
    ctaText: {
      fontSize: T.md, fontWeight: T.bold, color: C.onAccent,
    },
    skipBtn: {
      alignItems: "center",
      paddingVertical: S.sm, marginTop: S.xs,
    },
    skipText: {
      fontSize: T.sm, fontWeight: T.medium,
      color: C.textTertiary,
    },
  });
}
