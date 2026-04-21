import { useMemo, useState, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
  ActionSheetIOS, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowRight, ArrowLeft, Camera, User, Building2 } from "lucide-react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand } from "@/context/BrandContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { fetchOrgByCode } from "@/services/firebaseBranding";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";

type Step = "agency" | "profile";

export default function WelcomeScreen() {
  const { C } = useTheme();
  const { brand, refreshBranding } = useBrand();
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const isEdit = !!prefs.name;

  // Show agency step if no org is connected, regardless of name
  const [step, setStep] = useState<Step>(prefs.orgId ? "profile" : "agency");
  const [agencyCode, setAgencyCode] = useState(prefs.orgSlug || "");
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencyError, setAgencyError] = useState("");

  const [name, setName] = useState(prefs.name);
  const [avatar, setAvatar] = useState(prefs.avatar || "");
  const nameRef = useRef<TextInput>(null);
  const agencyRef = useRef<TextInput>(null);
  const styles = useMemo(() => makeStyles(C), [C]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

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
      setStep("profile");
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
        setAvatar(result.assets[0].uri);
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
  const submit = () => {
    if (!canSubmit) return;
    haptic.selection();
    setPref("name", trimmed);
    if (avatar) setPref("avatar", avatar);
    if (isEdit && router.canGoBack()) {
      toast("Profile updated");
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  if (step === "agency") {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Brand */}
            <Animated.View entering={FadeIn.duration(400)} style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Logo size={16} color={C.teal} />
              </View>
              <Text style={styles.brandName}>Dalefy</Text>
            </Animated.View>

            {/* Icon */}
            <Animated.View entering={FadeInUp.duration(500).delay(100)} style={styles.avatarSection}>
              <View style={[styles.avatarCircle, { backgroundColor: C.tealDim }]}>
                <Building2 size={36} color={C.teal} strokeWidth={1.2} />
              </View>
            </Animated.View>

            {/* Copy */}
            <Animated.View entering={FadeInUp.duration(500).delay(200)} style={styles.copy}>
              <Text style={styles.title}>Enter your agency code</Text>
              <Text style={styles.sub}>
                Your travel agent will have given you a code to connect to their agency.
              </Text>
            </Animated.View>

            {/* Agency code input */}
            <Animated.View entering={FadeInUp.duration(500).delay(300)} style={styles.field}>
              <TextInput
                ref={agencyRef}
                value={agencyCode}
                onChangeText={(t) => { setAgencyCode(t); setAgencyError(""); }}
                placeholder="e.g. dialaflight"
                placeholderTextColor={C.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={validateAgency}
                maxLength={60}
                style={styles.input}
              />
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
              accessibilityLabel="Continue"
              style={({ pressed }) => [
                styles.cta,
                (agencyLoading || !agencyCode.trim()) && styles.ctaDisabled,
                pressed && { opacity: 0.9 },
              ]}
            >
              {agencyLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Text style={[styles.ctaText, !agencyCode.trim() && { color: C.textTertiary }]}>
                    Connect
                  </Text>
                  <ArrowRight
                    size={16}
                    color={agencyCode.trim() ? "#000" : C.textTertiary}
                    strokeWidth={2.5}
                  />
                </>
              )}
            </Pressable>
            <Pressable onPress={skipAgency} style={styles.skipBtn}>
              <Text style={styles.skipText}>I don't have a code</Text>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.brandRow}>
            <View style={styles.logoBadge}>
              {brand.logoUrl ? (
                <Image source={{ uri: brand.logoUrl }} style={{ width: 16, height: 16, borderRadius: 3 }} />
              ) : (
                <Logo size={16} color={C.teal} />
              )}
            </View>
            <Text style={styles.brandName}>{brand.name}</Text>
          </Animated.View>

          {/* Avatar picker */}
          <Animated.View entering={FadeInUp.duration(500).delay(100)} style={styles.avatarSection}>
            <Pressable
              onPress={pickAvatar}
              style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel="Add profile photo"
            >
              <View style={styles.avatarCircle}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <User size={36} color={C.textTertiary} strokeWidth={1.2} />
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Camera size={12} color="#fff" strokeWidth={2} />
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>
              {avatar ? "Tap to change" : "Add a photo"}
            </Text>
          </Animated.View>

          {/* Copy */}
          <Animated.View entering={FadeInUp.duration(500).delay(200)} style={styles.copy}>
            <Text style={styles.title}>
              {isEdit ? "Edit your profile" : "What should we\ncall you?"}
            </Text>
            <Text style={styles.sub}>
              {isEdit
                ? "Update your name and photo."
                : "Your name appears on trips you share with others."}
            </Text>
          </Animated.View>

          {/* Name input */}
          <Animated.View entering={FadeInUp.duration(500).delay(300)} style={styles.field}>
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={C.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              maxLength={40}
              style={styles.input}
            />
          </Animated.View>
        </ScrollView>

        {/* CTA */}
        <Animated.View entering={FadeInUp.duration(400).delay(400)} style={styles.footer}>
          {!isEdit && prefs.orgId === "" && (
            <Pressable
              onPress={() => setStep("agency")}
              style={styles.backRow}
              accessibilityRole="button"
            >
              <ArrowLeft size={14} color={C.textTertiary} strokeWidth={2} />
              <Text style={styles.skipText}>Back to agency code</Text>
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
              pressed && canSubmit && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.ctaText, !canSubmit && { color: C.textTertiary }]}>
              {isEdit ? "Save" : "Get Started"}
            </Text>
            <ArrowRight
              size={16}
              color={canSubmit ? "#000" : C.textTertiary}
              strokeWidth={2.5}
            />
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: S.md, paddingTop: S.lg, flexGrow: 1 },

    // Brand
    brandRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      marginBottom: S.xl,
    },
    logoBadge: {
      width: 32, height: 32, borderRadius: R.md,
      backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
    },
    brandName: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase",
    },

    // Avatar
    avatarSection: {
      alignItems: "center",
      marginBottom: S.xl,
    },
    avatarWrap: {
      width: 100,
      height: 100,
    },
    avatarCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: C.card,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: 100,
      height: 100,
      borderRadius: 50,
    },
    cameraBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.teal,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: C.bg,
    },
    avatarHint: {
      fontSize: T.xs,
      fontWeight: T.medium,
      color: C.textTertiary,
      marginTop: S.xs,
    },

    // Copy
    copy: { marginBottom: S.lg },
    title: {
      fontSize: T["3xl"], fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.6, lineHeight: T["3xl"] + 6,
      marginBottom: S.xs,
    },
    sub: {
      fontSize: T.base, color: C.textSecondary, fontWeight: T.regular,
      lineHeight: T.base + 8,
    },

    // Input
    field: { marginBottom: S.lg },
    input: {
      height: 56,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: S.md,
      fontSize: T.lg,
      fontWeight: T.semibold,
      color: C.textPrimary,
    },

    // Error
    errorText: {
      fontSize: T.xs,
      color: "#ef4444",
      fontWeight: T.medium,
      marginTop: S.xs,
      paddingHorizontal: S.xs,
    },

    // Footer
    footer: {
      paddingHorizontal: S.md,
      paddingTop: S.sm,
      paddingBottom: S.md,
    },
    cta: {
      height: 54,
      borderRadius: R.lg,
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
      paddingVertical: S.sm,
      marginTop: S.xs,
    },
    skipText: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: C.textTertiary,
    },
    backRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: S.sm,
      marginBottom: S.xs,
    },
  });
}
