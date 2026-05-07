import { useMemo, useState, useRef, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
  ActionSheetIOS, Alert, Dimensions,
} from "react-native";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { uploadAvatar } from "@/services/avatarUpload";
import { updateMemberProfile } from "@/services/firebaseTrips";
import { ArrowRight, ArrowLeft, Camera, User, Buildings, Check, AirplaneTilt } from "phosphor-react-native";
import Animated, {
  FadeIn, FadeInUp, FadeInDown,
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand } from "@/context/BrandContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { fetchOrgByCode } from "@/services/firebaseBranding";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";
import { Illustration } from "@/components/Illustration";

type Step = "welcome" | "agency" | "profile";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function WelcomeScreen() {
  const { C, isDark } = useTheme();
  const { brand, refreshBranding } = useBrand();
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const isEdit = !!(prefs.name);

  const initialStep: Step = isEdit
    ? "profile"
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
  const [uploading, setUploading] = useState(false);
  const agencyRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

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
      Alert.alert("Profile Photo", "", [
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
        {/* Background glow */}
        <LinearGradient
          colors={[`${C.teal}12`, "transparent"]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />

        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.welcomeContainer}>
            {/* Top — brand mark */}
            <Animated.View entering={FadeIn.duration(600)} style={styles.welcomeTop}>
              <Logo size={24} color={C.teal} />
            </Animated.View>

            {/* Center — illustration */}
            <Animated.View entering={FadeIn.duration(800).delay(200)} style={styles.welcomeCenter}>
              <Illustration name="together" width={SCREEN_W * 0.65} height={SCREEN_W * 0.5} />
            </Animated.View>

            {/* Bottom — big type + CTA */}
            <View style={styles.welcomeBottom}>
              <Animated.Text
                entering={FadeInUp.duration(500).delay(400)}
                style={styles.heroTitle}
              >
                Your trips,{"\n"}organised
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.duration(500).delay(550)}
                style={styles.heroSub}
              >
                Flights, hotels, activities - everything in one place.
              </Animated.Text>

              <Animated.View entering={FadeInUp.duration(400).delay(700)} style={styles.ctaWrap}>
                <Pressable
                  onPress={goToAgency}
                  accessibilityRole="button"
                  accessibilityLabel="Get started"
                  style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                >
                  <Text style={styles.ctaText}>Get Started</Text>
                  <ArrowRight size={16} color="#000" weight="bold" />
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
        <LinearGradient
          colors={[`${C.teal}08`, "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
        />
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
              {/* Step label */}
              <Animated.View entering={FadeIn.duration(300)} style={styles.stepLabel}>
                <View style={[styles.stepDot, { backgroundColor: C.teal }]} />
                <View style={[styles.stepDot, { backgroundColor: C.elevated }]} />
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
                <View style={styles.inputRow}>
                  <Buildings size={18} color={C.textTertiary} weight="light" />
                  <TextInput
                    ref={agencyRef}
                    value={agencyCode}
                    onChangeText={(t) => { setAgencyCode(t); setAgencyError(""); setAgencySuccess(false); }}
                    placeholder="Agency code"
                    placeholderTextColor={C.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={validateAgency}
                    maxLength={60}
                    style={styles.input}
                  />
                  {agencySuccess && (
                    <View style={[styles.checkBadge, { backgroundColor: C.teal }]}>
                      <Check size={12} color="#000" weight="bold" />
                    </View>
                  )}
                </View>
                {agencyError ? (
                  <Text style={styles.errorText}>{agencyError}</Text>
                ) : null}
              </Animated.View>
            </ScrollView>

            {/* Footer */}
            <Animated.View entering={FadeInUp.duration(400).delay(400)} style={styles.footer}>
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
                  {agencyLoading ? "Connecting..." : "Connect"}
                </Text>
                {!agencyLoading && (
                  <ArrowRight
                    size={16}
                    color={agencyCode.trim() ? "#000" : C.textTertiary}
                    weight="bold"
                  />
                )}
              </Pressable>
              <Pressable onPress={skipAgency} style={styles.skipBtn}>
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
      <LinearGradient
        colors={[`${C.teal}08`, "transparent"]}
        start={{ x: 1, y: 0 }} end={{ x: 0, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
      />
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
            {/* Step label */}
            {!isEdit && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.stepLabel}>
                <View style={[styles.stepDot, { backgroundColor: C.teal }]} />
                <View style={[styles.stepDot, { backgroundColor: C.teal }]} />
              </Animated.View>
            )}

            {/* Brand badge */}
            {prefs.orgId ? (
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
            <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.avatarSection}>
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
                    <User size={32} color={C.textDim} weight="thin" />
                  )}
                </View>
                <View style={styles.cameraBadge}>
                  <Camera size={11} color="#000" weight="bold" />
                </View>
              </Pressable>
            </Animated.View>

            {/* Big heading */}
            <Animated.Text
              entering={FadeInUp.duration(400).delay(200)}
              style={styles.stepTitle}
            >
              {isEdit ? "Edit your\nprofile" : "What should\nwe call you?"}
            </Animated.Text>

            <Animated.Text
              entering={FadeInUp.duration(400).delay(300)}
              style={styles.stepSub}
            >
              {isEdit
                ? "Update your name and photo."
                : "This is how you'll appear on shared trips."}
            </Animated.Text>

            {/* Name input */}
            <Animated.View entering={FadeInUp.duration(400).delay(400)} style={styles.inputWrap}>
              <View style={styles.inputRow}>
                <User size={18} color={C.textTertiary} weight="light" />
                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  maxLength={40}
                  style={styles.input}
                />
              </View>
            </Animated.View>
          </ScrollView>

          {/* CTA */}
          <Animated.View entering={FadeInUp.duration(400).delay(500)} style={styles.footer}>
            {!isEdit && (
              <Pressable
                onPress={goBackToAgency}
                style={styles.backRow}
                accessibilityRole="button"
              >
                <ArrowLeft size={14} color={C.textTertiary} weight="regular" />
                <Text style={styles.skipText}>Back</Text>
              </Pressable>
            )}
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
                {isEdit ? "Save" : "Let's Go"}
              </Text>
              {!isEdit && (
                <AirplaneTilt size={16} color={canSubmit ? "#000" : C.textTertiary} weight="bold" />
              )}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
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
      fontSize: 42, fontWeight: "800",
      color: C.textPrimary,
      letterSpacing: -1, lineHeight: 46,
      marginBottom: S.sm,
    },
    heroSub: {
      fontSize: T.base, color: C.textSecondary,
      fontWeight: T.regular, lineHeight: T.base + 8,
      marginBottom: S.xl,
    },

    // ── Step screens ──
    stepScroll: {
      paddingHorizontal: S.xl, paddingTop: S.lg, flexGrow: 1,
    },
    stepLabel: {
      flexDirection: "row", gap: 6, marginBottom: S.xl,
    },
    stepDot: {
      width: 20, height: 3, borderRadius: 1.5,
    },
    stepTitle: {
      fontSize: 36, fontWeight: "800",
      color: C.textPrimary,
      letterSpacing: -0.8, lineHeight: 40,
      marginBottom: S.sm,
    },
    stepSub: {
      fontSize: T.base, color: C.textSecondary,
      fontWeight: T.regular, lineHeight: T.base + 8,
      marginBottom: S.xl,
    },

    // ── Brand badge ──
    brandBadge: {
      flexDirection: "row", alignItems: "center", gap: 8,
      alignSelf: "flex-start",
      backgroundColor: C.tealDim,
      borderRadius: R.full,
      paddingHorizontal: S.sm, paddingVertical: 6,
      marginBottom: S.lg,
    },
    brandBadgeIcon: {
      width: 22, height: 22, borderRadius: 6,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      alignItems: "center", justifyContent: "center",
    },
    brandBadgeText: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 1, textTransform: "uppercase",
    },

    // ── Input ──
    inputWrap: { marginBottom: S.lg },
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
      backgroundColor: C.card,
      borderWidth: 1, borderColor: C.borderLight,
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: 88, height: 88, borderRadius: 44,
    },
    cameraBadge: {
      position: "absolute", bottom: 0, right: -2,
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: C.teal,
      alignItems: "center", justifyContent: "center",
      borderWidth: 3, borderColor: C.bg,
    },

    // ── Error ──
    errorText: {
      fontSize: T.xs, color: "#ef4444",
      fontWeight: T.medium, marginTop: S.xs,
      paddingHorizontal: S.xs,
    },

    // ── Footer / CTA ──
    footer: {
      paddingHorizontal: S.xl,
      paddingTop: S.sm, paddingBottom: S.md,
    },
    ctaWrap: {},
    cta: {
      height: 54, borderRadius: R.full,
      backgroundColor: C.teal,
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S.xs,
    },
    ctaDisabled: {
      backgroundColor: C.elevated,
    },
    ctaText: {
      fontSize: T.base, fontWeight: T.bold, color: "#000",
      letterSpacing: 0.2,
    },
    skipBtn: {
      alignItems: "center",
      paddingVertical: S.sm, marginTop: S.xs,
    },
    skipText: {
      fontSize: T.sm, fontWeight: T.medium,
      color: C.textTertiary,
    },
    backRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: S.sm, marginBottom: S.xs,
    },
  });
}
