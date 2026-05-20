import { useState, useMemo, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Envelope, Lock, User, ArrowRight, CaretLeft, GoogleLogo, AppleLogo } from "phosphor-react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useHaptic } from "@/hooks/useHaptic";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";

WebBrowser.maybeCompleteAuthSession();

type Mode = "signin" | "signup" | "magic" | "forgot";

export default function AuthScreen() {
  const { C, isDark } = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const { mode: paramMode } = useLocalSearchParams<{ mode?: string }>();
  const haptic = useHaptic();

  const isUpgrade = paramMode === "upgrade";

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  const googleEnabled = Platform.select({
    ios: !!iosClientId,
    android: !!androidClientId,
    default: true,
  });

  const googleConfig = useMemo(() => {
    const cfg: Google.GoogleAuthRequestConfig = { webClientId };
    if (iosClientId) cfg.iosClientId = iosClientId;
    if (androidClientId) cfg.androidClientId = androidClientId;
    return cfg;
  }, [webClientId, iosClientId, androidClientId]);

  const [, googleResponse, promptGoogle] = Google.useAuthRequest(googleConfig);

  const [mode, setMode] = useState<Mode>(isUpgrade ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    if (googleResponse?.type !== "success") return;
    const idToken = googleResponse.authentication?.idToken;
    if (!idToken) { setError("Google Sign-In failed - no token"); return; }
    setLoading(true);
    auth.signInWithGoogle(idToken).then((err) => {
      setLoading(false);
      if (err) { haptic.warning(); setError(err); }
      else { haptic.light(); router.replace("/welcome"); }
    });
  }, [googleResponse]);

  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  const clearError = useCallback(() => setError(""), []);

  const handleEmailAuth = useCallback(async () => {
    if (!email.trim()) { setError("Enter your email"); return; }
    if (mode !== "magic" && !password) { setError("Enter your password"); return; }
    if (mode === "signup" && !name.trim()) { setError("Enter your name"); return; }

    setLoading(true);
    setError("");

    let err: string | null = null;

    if (mode === "signup") {
      if (isUpgrade) {
        err = await auth.upgradeWithEmail(email.trim(), password, name.trim());
      } else {
        err = await auth.signUp(name.trim(), email.trim(), password);
      }
    } else if (mode === "signin") {
      err = await auth.signIn(email.trim(), password);
    } else if (mode === "magic") {
      err = await auth.sendMagicLink(email.trim());
      if (!err) {
        haptic.light();
        setMagicSent(true);
        setLoading(false);
        return;
      }
    } else if (mode === "forgot") {
      err = await auth.resetPassword(email.trim());
      if (!err) {
        haptic.light();
        setError("");
        setMode("signin");
        setLoading(false);
        return;
      }
    }

    setLoading(false);

    if (err) {
      haptic.warning();
      setError(err);
    } else {
      haptic.light();
      router.replace("/welcome");
    }
  }, [email, password, name, mode, isUpgrade, auth, haptic, router]);

  const handleGoogleSignIn = useCallback(async () => {
    if (Platform.OS === "ios" && !iosClientId) {
      setError("Google Sign-In is not configured for this build");
      return;
    }
    if (Platform.OS === "android" && !androidClientId) {
      setError("Google Sign-In is not configured for this build");
      return;
    }
    setError("");
    try {
      await promptGoogle();
    } catch (e: any) {
      setError(e?.message ?? "Google Sign-In failed");
    }
  }, [promptGoogle, iosClientId, androidClientId]);

  const handleAppleSignIn = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    setLoading(true);
    setError("");
    try {
      const rawNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        setError("Apple Sign-In failed - no token received");
        setLoading(false);
        return;
      }

      const err = await auth.signInWithApple(credential.identityToken, rawNonce);
      setLoading(false);
      if (err) {
        haptic.warning();
        setError(err);
      } else {
        haptic.light();
        router.replace("/welcome");
      }
    } catch (e: any) {
      setLoading(false);
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      haptic.warning();
      setError(e?.message ?? "Apple Sign-In failed");
    }
  }, [auth, haptic, router]);

  const handleGuest = useCallback(() => {
    haptic.selection();
    router.replace("/welcome");
  }, [haptic, router]);

  const switchMode = useCallback((m: Mode) => {
    haptic.selection();
    setMode(m);
    setError("");
    setMagicSent(false);
  }, [haptic]);

  // ── Magic link sent confirmation ──
  if (magicSent) {
    return (
      <View style={styles.safe}>
        <LinearGradient
          colors={[`${C.teal}12`, "transparent"]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={{ flex: 1, justifyContent: "center", paddingHorizontal: S.xl }}>
          <Animated.View entering={FadeIn.duration(500)} style={{ alignItems: "center" }}>
            <Envelope size={56} color={C.teal} weight="thin" />
            <Text style={[styles.stepTitle, { textAlign: "center", marginTop: S.lg }]}>
              Check your{"\n"}inbox
            </Text>
            <Text style={[styles.stepSub, { textAlign: "center" }]}>
              We sent a sign-in link to {email}
            </Text>
            <Pressable
              onPress={() => { setMagicSent(false); setMode("signin"); }}
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>Back to sign in</Text>
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  const title = mode === "signup" ? (isUpgrade ? "Create your\naccount" : "Get started")
    : mode === "signin" ? "Welcome\nback"
    : mode === "magic" ? "Sign in with\nemail link"
    : "Reset your\npassword";

  const subtitle = mode === "signup" ? "Sign up to save trips across devices."
    : mode === "signin" ? "Sign in to pick up where you left off."
    : mode === "magic" ? "We'll email you a link - no password needed."
    : "Enter your email and we'll send a reset link.";

  const ctaLabel = mode === "signup" ? "Create Account"
    : mode === "signin" ? "Sign In"
    : mode === "magic" ? "Send Link"
    : "Send Reset Link";

  const canSubmit = mode === "magic" || mode === "forgot"
    ? !!email.trim()
    : mode === "signup"
      ? !!(email.trim() && password && name.trim())
      : !!(email.trim() && password);

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
          {/* Back button for sub-modes */}
          {(mode === "magic" || mode === "forgot") && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.topNav}>
              <Pressable
                onPress={() => switchMode("signin")}
                style={({ pressed }) => [styles.topNavBtn, pressed && { opacity: 0.7 }]}
              >
                <CaretLeft size={18} color={C.textPrimary} weight="regular" />
              </Pressable>
            </Animated.View>
          )}

          <ScrollView
            contentContainerStyle={styles.stepScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo */}
            <Animated.View entering={FadeIn.duration(600)} style={{ marginBottom: S.xl }}>
              <Logo size={24} color={C.teal} />
            </Animated.View>

            {/* Heading */}
            <Animated.Text entering={FadeInUp.duration(400).delay(100)} style={styles.stepTitle}>
              {title}
            </Animated.Text>
            <Animated.Text entering={FadeInUp.duration(400).delay(200)} style={styles.stepSub}>
              {subtitle}
            </Animated.Text>

            {/* Name (signup only) */}
            {mode === "signup" && (
              <Animated.View entering={FadeInUp.duration(400).delay(250)} style={styles.inputWrap}>
                <View style={styles.inputRow}>
                  <User size={18} color={C.textTertiary} weight="light" />
                  <TextInput
                    value={name}
                    onChangeText={(t) => { setName(t); clearError(); }}
                    placeholder="Your name"
                    placeholderTextColor={C.textDim}
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="name"
                    returnKeyType="next"
                    style={styles.input}
                  />
                </View>
              </Animated.View>
            )}

            {/* Email */}
            <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.inputWrap}>
              <View style={[styles.inputRow, error ? { borderColor: C.red } : undefined]}>
                <Envelope size={18} color={C.textTertiary} weight="light" />
                <TextInput
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearError(); }}
                  placeholder="Email"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType={mode === "magic" || mode === "forgot" ? "go" : "next"}
                  onSubmitEditing={mode === "magic" || mode === "forgot" ? handleEmailAuth : undefined}
                  style={styles.input}
                />
              </View>
            </Animated.View>

            {/* Password (signin/signup only) */}
            {(mode === "signin" || mode === "signup") && (
              <Animated.View entering={FadeInUp.duration(400).delay(350)} style={styles.inputWrap}>
                <View style={[styles.inputRow, error ? { borderColor: C.red } : undefined]}>
                  <Lock size={18} color={C.textTertiary} weight="light" />
                  <TextInput
                    value={password}
                    onChangeText={(t) => { setPassword(t); clearError(); }}
                    placeholder="Password"
                    placeholderTextColor={C.textDim}
                    secureTextEntry
                    autoCapitalize="none"
                    textContentType={mode === "signup" ? "newPassword" : "password"}
                    returnKeyType="go"
                    onSubmitEditing={handleEmailAuth}
                    style={styles.input}
                  />
                </View>
              </Animated.View>
            )}

            {/* Error */}
            {error ? (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.errorText}>
                {error}
              </Animated.Text>
            ) : null}

            {/* Forgot password link */}
            {mode === "signin" && (
              <Pressable onPress={() => switchMode("forgot")} style={{ marginTop: S.xs }}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Footer */}
          <Animated.View entering={FadeInUp.duration(400).delay(500)} style={styles.footer}>
            {/* Main CTA */}
            <Pressable
              onPress={handleEmailAuth}
              disabled={!canSubmit || loading}
              style={({ pressed }) => [
                styles.cta,
                (!canSubmit || loading) && styles.ctaDisabled,
                pressed && canSubmit && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Text style={[styles.ctaText, (!canSubmit) && { color: C.textTertiary }]}>
                    {ctaLabel}
                  </Text>
                  <ArrowRight size={16} color={canSubmit ? "#000" : C.textTertiary} weight="bold" />
                </>
              )}
            </Pressable>

            {/* Social auth (only on signin/signup) */}
            {(mode === "signin" || mode === "signup") && (googleEnabled || Platform.OS === "ios") && (
              <>
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: C.border }]} />
                </View>

                <View style={styles.socialRow}>
                  {googleEnabled && (
                    <Pressable
                      onPress={handleGoogleSignIn}
                      style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.8 }]}
                    >
                      <GoogleLogo size={18} color={C.textPrimary} weight="bold" />
                      <Text style={styles.socialText}>Google</Text>
                    </Pressable>
                  )}

                  {Platform.OS === "ios" && (
                    <Pressable
                      onPress={handleAppleSignIn}
                      style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.8 }]}
                    >
                      <AppleLogo size={18} color={C.textPrimary} weight="fill" />
                      <Text style={styles.socialText}>Apple</Text>
                    </Pressable>
                  )}
                </View>

                {/* Magic link option */}
                <Pressable onPress={() => switchMode("magic")} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Sign in with email link</Text>
                </Pressable>
              </>
            )}

            {/* Toggle sign in / sign up */}
            <Pressable
              onPress={() => switchMode(mode === "signup" ? "signin" : "signup")}
              style={styles.toggleBtn}
            >
              <Text style={styles.toggleText}>
                {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
                <Text style={{ color: C.teal, fontWeight: T.bold }}>
                  {mode === "signup" ? "Sign in" : "Sign up"}
                </Text>
              </Text>
            </Pressable>

            {/* Guest mode */}
            {!isUpgrade && (
              <Pressable onPress={handleGuest} style={styles.skipBtn}>
                <Text style={styles.skipText}>Continue without an account</Text>
              </Pressable>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    topNav: {
      paddingHorizontal: S.lg, paddingTop: S.xs,
    },
    topNavBtn: {
      width: 36, height: 36, borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },

    stepScroll: {
      paddingHorizontal: S.xl, paddingTop: S.xl, flexGrow: 1,
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

    inputWrap: { marginBottom: S.sm },
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

    errorText: {
      fontSize: T.xs, color: C.red,
      fontWeight: T.medium, marginTop: S.xs,
      paddingHorizontal: S.xs,
    },

    footer: {
      paddingHorizontal: S.xl,
      paddingTop: S.sm, paddingBottom: S.md,
    },
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

    dividerRow: {
      flexDirection: "row", alignItems: "center",
      marginVertical: S.md, gap: S.sm,
    },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
    dividerText: {
      fontSize: T.xs, color: C.textTertiary, fontWeight: T.medium,
    },

    socialRow: {
      flexDirection: "row", gap: S.sm,
    },
    socialBtn: {
      flex: 1, height: 50, borderRadius: R.xl,
      backgroundColor: C.card,
      borderWidth: 1, borderColor: C.borderLight,
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S.xs,
    },
    socialText: {
      fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary,
    },

    linkBtn: {
      alignItems: "center", paddingVertical: S.sm, marginTop: S.xs,
    },
    linkText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.teal,
    },

    toggleBtn: {
      alignItems: "center", paddingVertical: S.sm,
    },
    toggleText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textSecondary,
    },

    skipBtn: {
      alignItems: "center", paddingVertical: S.xs,
    },
    skipText: {
      fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary,
    },
  });
}
