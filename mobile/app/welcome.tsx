import { useMemo, useState, useRef, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
  ActionSheetIOS, Alert, ActivityIndicator,
} from "react-native";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { uploadAvatar } from "@/services/avatarUpload";
import { updateMemberProfile } from "@/services/firebaseTrips";
import { ArrowRight, CaretLeft, Camera, User, Ticket, Check, CalendarBlank } from "phosphor-react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand } from "@/context/BrandContext";
import { useAuth } from "@/context/AuthContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { fetchOrgByCode } from "@/services/firebaseBranding";
import { fetchTripByShortCode } from "@/services/firebaseTrips";
import { parseTripDate } from "@/shared/dates";
import type { Trip } from "@/shared/types";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";

type Step = "code" | "profile";

const fmtDay = (d: string) => parseTripDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });


export default function WelcomeScreen() {
  const { C } = useTheme();
  const { brand, refreshBranding } = useBrand();
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const haptic = useHaptic();
  const { toast } = useToast();
  const auth = useAuth();
  const isEdit = !!(prefs.name) && !preview;

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
  const [, setUploading] = useState(false);
  const codeRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const styles = useMemo(() => makeStyles(C), [C]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  const goBackToCode = useCallback(() => {
    haptic.selection();
    setStep("code");
  }, [haptic]);

  // ── Finish ──
  const finishOnboarding = useCallback((finalName: string, finalAvatar: string, trip: Trip | null) => {
    setPref("name", finalName);
    if (finalAvatar) setPref("avatar", finalAvatar);
    haptic.medium();
    if (trip) router.replace(`/shared/${trip.id}`);
    else router.replace("/(tabs)");
  }, [setPref, haptic, router]);

  const afterCode = useCallback((trip: Trip | null) => {
    if (needsName) {
      setStep("profile");
      return;
    }
    finishOnboarding(providerName, auth.user?.avatar || "", trip);
  }, [needsName, finishOnboarding, providerName, auth.user?.avatar]);

  // ── Agency code or trip PIN ──
  const lookupCode = async () => {
    const raw = code.trim();
    if (!raw) {
      setCodeError("Enter the code your agent gave you.");
      return;
    }
    setCodeLoading(true);
    setCodeError("");
    setMatchedOrg(null);
    setMatchedTrip(null);
    try {
      const { waitForAuth } = require("@/services/firebase");
      await waitForAuth();

      const branding = await fetchOrgByCode(raw.toLowerCase());
      if (branding?.organizationId) {
        haptic.medium();
        setPref("orgId", branding.organizationId);
        setPref("orgSlug", raw.toLowerCase());
        refreshBranding();
        setMatchedOrg(branding.companyName || raw);
        setTimeout(() => afterCode(null), 700);
        return;
      }

      const pin = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const trip = pin.length === 6 ? await fetchTripByShortCode(pin) : null;
      if (trip) {
        haptic.medium();
        if (trip.organizationId) {
          setPref("orgId", trip.organizationId);
          refreshBranding();
        }
        setMatchedTrip(trip);
        setTimeout(() => afterCode(trip), 900);
        return;
      }

      haptic.warning();
      setCodeError("That code doesn't match an agency or a trip. Check it with your organiser.");
    } catch {
      setCodeError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setCodeLoading(false);
    }
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

        uploadAvatar(tempUri).then((url) => {
          if (url) {
            uploadedUrlRef.current = url;
            setAvatar(url);
            setPref("avatar", url);
          }
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
    const matched = !!(matchedOrg || matchedTrip);
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={styles.stepScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: S.xl }}>
                <Logo size={22} color={C.textPrimary} />
              </Animated.View>

              <Animated.Text entering={FadeInUp.duration(350).delay(100)} style={styles.stepTitle}>
                Got a code from{"\n"}your agent?
              </Animated.Text>

              <Animated.Text entering={FadeInUp.duration(350).delay(160)} style={styles.stepSub}>
                {firstName ? `Hi ${firstName}. ` : ""}Enter your agency code or a six-character trip PIN. You can also add trips later from Home.
              </Animated.Text>

              <Animated.View entering={FadeInUp.duration(350).delay(220)} style={styles.inputWrap}>
                <View style={[styles.inputRow, codeError ? { borderColor: C.red } : matched ? { borderColor: C.teal } : undefined]}>
                  <Ticket size={18} color={C.textTertiary} weight="regular" />
                  <TextInput
                    ref={codeRef}
                    value={code}
                    onChangeText={(t) => { setCode(t); setCodeError(""); setMatchedOrg(null); setMatchedTrip(null); }}
                    placeholder="Agency code or trip PIN"
                    placeholderTextColor={C.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="go"
                    onSubmitEditing={lookupCode}
                    maxLength={60}
                    editable={!codeLoading && !matched}
                    style={styles.input}
                  />
                  {codeLoading && <ActivityIndicator size="small" color={C.teal} />}
                  {matched && (
                    <View style={[styles.checkBadge, { backgroundColor: C.teal }]}>
                      <Check size={12} color={C.onAccent} weight="bold" />
                    </View>
                  )}
                </View>
                {codeError ? (
                  <Text style={styles.errorText}>{codeError}</Text>
                ) : null}
              </Animated.View>

              {matchedOrg ? (
                <Animated.View entering={FadeInUp.duration(300)} style={styles.matchCard}>
                  <View style={styles.matchIcon}>
                    {brand.logoUrl ? (
                      <Image source={{ uri: brand.logoUrl }} style={{ width: 20, height: 20, borderRadius: 4 }} />
                    ) : (
                      <Logo size={16} color={C.textPrimary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchTitle} numberOfLines={1}>{matchedOrg}</Text>
                    <Text style={styles.matchSub}>Connected to your agency</Text>
                  </View>
                </Animated.View>
              ) : null}

              {matchedTrip ? (
                <Animated.View entering={FadeInUp.duration(300)} style={styles.matchCard}>
                  <View style={styles.matchIcon}>
                    <CalendarBlank size={18} color={C.textPrimary} weight="regular" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchTitle} numberOfLines={1}>{matchedTrip.name}</Text>
                    <Text style={styles.matchSub}>
                      {fmtDay(matchedTrip.start)} – {fmtDay(matchedTrip.end)}
                      {matchedTrip.destination ? ` · ${matchedTrip.destination}` : ""}
                    </Text>
                  </View>
                </Animated.View>
              ) : null}
            </ScrollView>

            <Animated.View entering={FadeInUp.duration(300).delay(280)} style={styles.footer}>
              <Pressable
                onPress={lookupCode}
                disabled={codeLoading || matched || !code.trim()}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                style={({ pressed }) => [
                  styles.cta,
                  !code.trim() && styles.ctaDisabled,
                  pressed && !!code.trim() && { opacity: 0.9, transform: [{ scale: 0.985 }] },
                ]}
              >
                {codeLoading ? (
                  <ActivityIndicator size="small" color={C.onAccent} />
                ) : (
                  <>
                    <Text style={[styles.ctaText, !code.trim() && { color: C.textTertiary }]}>Continue</Text>
                    <ArrowRight size={16} color={code.trim() ? C.onAccent : C.textTertiary} weight="bold" />
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={skipCode}
                disabled={codeLoading || matched}
                accessibilityRole="button"
                accessibilityLabel="Skip for now"
                style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.skipText}>I don't have a code yet</Text>
              </Pressable>
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Profile (name + avatar)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
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
          ) : (
            <View style={styles.editNav}>
              <Pressable
                onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
                style={({ pressed }) => [styles.editNavSide, { opacity: pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                hitSlop={8}
              >
                <Text style={styles.editNavAction}>Cancel</Text>
              </Pressable>
              <Text style={styles.editNavTitle}>Edit Profile</Text>
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={({ pressed }) => [styles.editNavSide, { alignItems: "flex-end", opacity: !canSubmit ? 0.35 : pressed ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Save"
                hitSlop={8}
              >
                <Text style={[styles.editNavAction, { fontWeight: T.semibold }]}>Save</Text>
              </Pressable>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.stepScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar */}
            <Animated.View entering={FadeInUp.duration(400).delay(100)} style={[styles.avatarSection, isEdit && { alignItems: "center", marginTop: S.md }, !isEdit && { marginTop: S.md }]}>
              <Pressable
                onPress={pickAvatar}
                style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]}
                accessibilityRole="button"
                accessibilityLabel="Add profile photo"
              >
                <View style={styles.avatarCircle}>
                  {avatar ? (
                    <CachedImage uri={avatar} style={styles.avatarImage} blurhash={null} />
                  ) : (
                    <User size={36} color={C.textTertiary} weight="thin" />
                  )}
                </View>
                <View style={[styles.cameraBadge, { backgroundColor: C.teal }]}>
                  <Camera size={11} color={C.onAccent} weight="bold" />
                </View>
              </Pressable>
              {(!avatar || isEdit) && (
                <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel={avatar ? "Change profile photo" : "Add profile photo"} style={({ pressed }) => [{ marginTop: S.xs }, pressed && { opacity: 0.7 }]}>
                  <Text style={{ fontSize: T.sm, fontWeight: T.semibold, color: C.tealText }}>{avatar ? "Change photo" : "Add photo"}</Text>
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
              <View style={isEdit ? styles.groupRow : styles.inputRow}>
                {isEdit ? <Text style={styles.groupLabel}>Name</Text> : <User size={18} color={C.textTertiary} weight="regular" />}
                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={C.textTertiary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="name"
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  maxLength={40}
                  style={styles.input}
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
              <Text style={[styles.ctaText, !canSubmit && { color: C.textTertiary }]}>
                Let's go
              </Text>
              <ArrowRight size={16} color={canSubmit ? C.onAccent : C.textTertiary} weight="bold" />
            </Pressable>
          </Animated.View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    // ── Top nav ──
    topNav: {
      paddingHorizontal: S.lg, paddingTop: S.xs,
    },
    topNavBtn: {
      width: 36, height: 36, borderRadius: R.full,
      backgroundColor: C.elevated,
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
    groupRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 48,
      backgroundColor: C.elevated, borderRadius: R.sm, paddingHorizontal: S.md,
    },
    groupLabel: { fontSize: T.lg, color: C.textPrimary, width: 84 },
    groupFooter: { fontSize: 13, lineHeight: 18, color: C.textTertiary, paddingHorizontal: S.md, marginTop: S.xs },

    // ── Input ──
    inputWrap: { marginBottom: S.md },
    inputRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      height: 54,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: S.md,
      borderWidth: 1, borderColor: C.border,
    },
    input: {
      flex: 1, height: 54,
      fontSize: T.lg,
      color: C.textPrimary,
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
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: 88, height: 88, borderRadius: 44,
    },
    cameraBadge: {
      position: "absolute", bottom: 0, right: -2,
      width: 28, height: 28, borderRadius: 14,
      alignItems: "center", justifyContent: "center",
      borderWidth: 3, borderColor: C.bg,
    },

    // ── Error / helper ──
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
      backgroundColor: C.elevated,
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
