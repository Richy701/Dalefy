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
import { ArrowRight, CaretLeft, Camera, User, Buildings, Check } from "phosphor-react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand } from "@/context/BrandContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { fetchOrgByCode } from "@/services/firebaseBranding";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";

type Step = "welcome" | "agency" | "profile";


export default function WelcomeScreen() {
  const { C } = useTheme();
  const { brand, refreshBranding } = useBrand();
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const haptic = useHaptic();
  const { toast } = useToast();
  const isEdit = !!(prefs.name) && !preview;

  const initialStep: Step = isEdit
    ? "profile"
    : preview
      ? "welcome"
      : prefs.orgId
        ? "profile"
        : "welcome";

  const [step, setStep] = useState<Step>(initialStep);
  const [agencyCode, setAgencyCode] = useState(prefs.orgSlug || "");
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencyError, setAgencyError] = useState("");
  const [agencySuccess, setAgencySuccess] = useState(false);

  const [name, setName] = useState(prefs.name);
  const [avatar, setAvatar] = useState(prefs.avatar || "");
  const uploadedUrlRef = useRef<string | null>(null);
  const [, setUploading] = useState(false);
  const agencyRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const styles = useMemo(() => makeStyles(C), [C]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  const goToAgency = useCallback(() => {
    haptic.selection();
    setStep("agency");
  }, [haptic]);

  const goBackToAgency = useCallback(() => {
    haptic.selection();
    setStep("agency");
  }, [haptic]);

  // ── Agency code ──
  const validateAgency = async () => {
    const code = agencyCode.trim().toLowerCase();
    if (!code) {
      setAgencyError("Enter your agency code");
      return;
    }
    setAgencyLoading(true);
    setAgencyError("");
    try {
      const { waitForAuth } = require("@/services/firebase");
      await waitForAuth();
      const branding = await fetchOrgByCode(code);
      if (!branding || !branding.organizationId) {
        setAgencyError("Agency not found. Check the code and try again.");
        setAgencyLoading(false);
        return;
      }
      haptic.medium();
      setPref("orgId", branding.organizationId);
      setPref("orgSlug", code);
      refreshBranding();
      setAgencySuccess(true);
      setTimeout(() => setStep("profile"), 800);
    } catch {
      setAgencyError("Something went wrong. Try again.");
    } finally {
      setAgencyLoading(false);
    }
  };

  const skipAgency = () => {
    haptic.selection();
    setStep("profile");
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

  // ── Submit ──
  const submit = async () => {
    if (!canSubmit) return;
    haptic.selection();
    setPref("name", trimmed);
    const finalAvatar = uploadedUrlRef.current || avatar;
    if (finalAvatar) setPref("avatar", finalAvatar);

    if (isEdit) updateMemberProfile(trimmed, finalAvatar || null);

    if (isEdit && router.canGoBack()) {
      toast("Profile updated");
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 0 — Welcome splash
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "welcome") {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.welcomeContainer}>
            {/* Top — brand mark */}
            <Animated.View entering={FadeIn.duration(600)} style={styles.welcomeTop}>
              <Logo size={24} color={C.teal} />
            </Animated.View>

            <View style={styles.welcomeCenter} />

            {/* Bottom — big type + CTA */}
            <View style={styles.welcomeBottom}>
              <Animated.Text
                entering={FadeInUp.duration(300).delay(250)}
                style={styles.heroTitle}
              >
                Your trips,{"\n"}organised
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.duration(300).delay(300)}
                style={styles.heroSub}
              >
                Flights, hotels, activities — everything in one place.
              </Animated.Text>

              <Animated.View entering={FadeInUp.duration(300).delay(350)}>
                <Pressable
                  onPress={goToAgency}
                  accessibilityRole="button"
                  accessibilityLabel="Get started"
                  style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                >
                  <Text style={styles.ctaText}>Get started</Text>
                  <ArrowRight size={16} color={C.onAccent} weight="bold" />
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Agency code
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "agency") {
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
              {/* Progress */}
              <Animated.View entering={FadeIn.duration(300)} style={styles.progressRow}>
                <View style={styles.progressBars}>
                  <View style={[styles.progressBar, { backgroundColor: C.teal }]} />
                  <View style={[styles.progressBar, { backgroundColor: C.elevated }]} />
                  <View style={[styles.progressBar, { backgroundColor: C.elevated }]} />
                </View>
                <Text style={styles.progressCount}>1 / 3</Text>
              </Animated.View>

              {/* Big heading */}
              <Animated.Text
                entering={FadeInUp.duration(400).delay(100)}
                style={styles.stepTitle}
              >
                Connect to{"\n"}your agency
              </Animated.Text>

              <Animated.Text
                entering={FadeInUp.duration(400).delay(200)}
                style={styles.stepSub}
              >
                Your travel agent will have given you a code.
              </Animated.Text>

              {/* Input */}
              <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.inputWrap}>
                <View style={[styles.inputRow, agencyError ? { borderColor: C.red } : agencySuccess ? { borderColor: C.teal } : undefined]}>
                  <Buildings size={18} color={C.textTertiary} weight="light" />
                  <TextInput
                    ref={agencyRef}
                    value={agencyCode}
                    onChangeText={(t) => { setAgencyCode(t); setAgencyError(""); setAgencySuccess(false); }}
                    placeholder="e.g. dalefy"
                    placeholderTextColor={C.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={validateAgency}
                    maxLength={60}
                    style={styles.input}
                  />
                  {agencyLoading && <ActivityIndicator size="small" color={C.teal} />}
                  {agencySuccess && (
                    <View style={[styles.checkBadge, { backgroundColor: C.teal }]}>
                      <Check size={12} color={C.onAccent} weight="bold" />
                    </View>
                  )}
                </View>
                {agencyError ? (
                  <Text style={styles.errorText}>{agencyError}</Text>
                ) : null}
              </Animated.View>
            </ScrollView>

            {/* Footer */}
            <Animated.View entering={FadeInUp.duration(300).delay(350)} style={styles.footer}>
              <Pressable
                onPress={validateAgency}
                disabled={agencyLoading || !agencyCode.trim()}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.cta,
                  (agencyLoading || !agencyCode.trim()) && styles.ctaDisabled,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={[styles.ctaText, !agencyCode.trim() && { color: C.textTertiary }]}>
                  {agencyLoading ? "Connecting…" : "Connect"}
                </Text>
                {!agencyLoading && (
                  <ArrowRight
                    size={16}
                    color={agencyCode.trim() ? C.onAccent : C.textTertiary}
                    weight="bold"
                  />
                )}
              </Pressable>
              <Pressable onPress={skipAgency} accessibilityRole="button" accessibilityLabel="Skip agency code" style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}>
                <Text style={styles.skipText}>I don't have a code</Text>
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
                onPress={goBackToAgency}
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
            {/* Progress */}
            {!isEdit && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.progressRow}>
                <View style={styles.progressBars}>
                  <View style={[styles.progressBar, { backgroundColor: C.teal }]} />
                  <View style={[styles.progressBar, { backgroundColor: C.teal }]} />
                  <View style={[styles.progressBar, { backgroundColor: C.elevated }]} />
                </View>
                <Text style={styles.progressCount}>2 / 3</Text>
              </Animated.View>
            )}

            {/* Brand badge */}
            {prefs.orgId && !isEdit ? (
              <Animated.View entering={FadeIn.duration(400)} style={styles.brandBadge}>
                <View style={styles.brandBadgeIcon}>
                  {brand.logoUrl ? (
                    <Image source={{ uri: brand.logoUrl }} style={{ width: 14, height: 14, borderRadius: 3 }} />
                  ) : (
                    <Logo size={14} color={C.teal} />
                  )}
                </View>
                <Text style={styles.brandBadgeText}>{brand.name}</Text>
                <Check size={10} color={C.teal} weight="bold" />
              </Animated.View>
            ) : null}

            {/* Avatar */}
            <Animated.View entering={FadeInUp.duration(400).delay(100)} style={[styles.avatarSection, isEdit && { alignItems: "center", marginTop: S.md }]}>
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
                  This is how you'll appear on shared trips.
                </Animated.Text>
              </>
            )}

            {/* Name input */}
            <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.inputWrap}>
              <View style={isEdit ? styles.groupRow : styles.inputRow}>
                {isEdit ? <Text style={styles.groupLabel}>Name</Text> : <User size={18} color={C.textTertiary} weight="light" />}
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

    // ── Welcome splash ──
    welcomeContainer: { flex: 1, justifyContent: "space-between" },
    welcomeTop: {
      paddingHorizontal: S.xl, paddingTop: S.lg,
    },
    welcomeCenter: {
      alignItems: "center", justifyContent: "center",
      flex: 1,
    },
    welcomeBottom: {
      paddingHorizontal: S.xl, paddingBottom: S.md,
    },
    heroTitle: {
      fontSize: 38, fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.5, lineHeight: 42,
      marginBottom: S.sm,
    },
    heroSub: {
      fontSize: T.base, color: C.textSecondary,
      fontWeight: T.regular, lineHeight: T.base + 8,
      marginBottom: S.xl,
    },

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
    progressRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.xl,
    },
    progressBars: {
      flexDirection: "row", flex: 1, gap: 4,
    },
    progressBar: {
      flex: 1, height: 3, borderRadius: 1.5,
    },
    progressCount: {
      fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary,
      fontVariant: ["tabular-nums"],
      letterSpacing: 0.5,
    },
    stepTitle: {
      fontSize: 32, fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.4, lineHeight: 37,
      marginBottom: S.sm,
    },
    stepSub: {
      fontSize: T.base, color: C.textSecondary,
      fontWeight: T.regular, lineHeight: T.base + 8,
      marginBottom: S.xl,
    },

    // ── Brand badge ──
    brandBadge: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      alignSelf: "flex-start",
      backgroundColor: C.tealDim,
      borderRadius: R.full,
      paddingHorizontal: S.sm, paddingVertical: S.xs2,
      marginBottom: S.lg,
    },
    brandBadgeIcon: {
      width: 22, height: 22, borderRadius: R.sm,
      backgroundColor: C.borderLight,
      alignItems: "center", justifyContent: "center",
    },
    brandBadgeText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.tealText,
      letterSpacing: 1, textTransform: "uppercase",
    },

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
      height: 56,
      backgroundColor: C.card,
      borderRadius: R.xl,
      paddingHorizontal: S.md,
      borderWidth: 1, borderColor: C.borderLight,
    },
    input: {
      flex: 1, height: 56,
      fontSize: T.lg, fontWeight: T.medium,
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
      fontSize: T.xs, color: C.redText,
      fontWeight: T.medium, marginTop: S.xs,
      paddingHorizontal: S.xs,
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
