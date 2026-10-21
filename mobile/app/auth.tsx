import { useState, useMemo, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Envelope, LockKey, ArrowRight, CaretLeft, Check,
} from "phosphor-react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useHaptic } from "@/hooks/useHaptic";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";
import { GoogleG, AppleMark } from "@/components/BrandLogos";

WebBrowser.maybeCompleteAuthSession();

type Step = "splash" | "options" | "email" | "sent" | "password";

export default function AuthScreen() {
  const { C } = useTheme();
  const auth = useAuth();
  const { prefs } = usePreferences();
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
    const cfg = { webClientId } as Google.GoogleAuthRequestConfig;
    if (iosClientId) cfg.iosClientId = iosClientId;
    if (androidClientId) cfg.androidClientId = androidClientId;
    return cfg;
  }, [webClientId, iosClientId, androidClientId]);

  const [, googleResponse, promptGoogle] = Google.useAuthRequest(googleConfig);

  const [step, setStep] = useState<Step>(isUpgrade ? "options" : "splash");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyProvider, setBusyProvider] = useState<"google" | "apple" | null>(null);

  const styles = useMemo(() => makeStyles(C), [C]);

  const finish = useCallback(() => {
    haptic.light();
    router.replace("/welcome");
  }, [haptic, router]);

  const go = useCallback((next: Step) => {
    haptic.selection();
    setError("");
    setNotice("");
    setStep(next);
  }, [haptic]);

  useEffect(() => {
    if (googleResponse?.type !== "success") return;
    const idToken = googleResponse.authentication?.idToken;
    if (!idToken) { setBusyProvider(null); setError("Google sign-in didn't complete. Try again."); return; }
    auth.signInWithGoogle(idToken).then((err) => {
      setBusyProvider(null);
      if (err) { haptic.warning(); setError(err); }
      else finish();
    });
  }, [googleResponse]);

  // ── Providers ──
  const handleGoogle = useCallback(async () => {
    if ((Platform.OS === "ios" && !iosClientId) || (Platform.OS === "android" && !androidClientId)) {
      setError("Google sign-in isn't available in this build.");
      return;
    }
    setError("");
    setBusyProvider("google");
    try {
      const res = await promptGoogle();
      if (res?.type !== "success") setBusyProvider(null);
    } catch (e: any) {
      setBusyProvider(null);
      setError(e?.message ?? "Google sign-in failed.");
    }
  }, [promptGoogle, iosClientId, androidClientId]);

  const handleApple = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    setError("");
    setBusyProvider("apple");
    try {
      const rawNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        setBusyProvider(null);
        setError("Apple sign-in didn't complete. Try again.");
        return;
      }
      const err = await auth.signInWithApple(credential.identityToken, rawNonce);
      setBusyProvider(null);
      if (err) { haptic.warning(); setError(err); }
      else finish();
    } catch (e: any) {
      setBusyProvider(null);
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      haptic.warning();
      setError(e?.message ?? "Apple sign-in failed.");
    }
  }, [auth, haptic, finish]);

  // ── Email link ──
  const trimmedEmail = email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  const sendLink = useCallback(async () => {
    if (!emailValid) { setError("Enter a valid email address."); return; }
    setLoading(true);
    setError("");
    const err = await auth.sendMagicLink(trimmedEmail);
    setLoading(false);
    if (err) { haptic.warning(); setError(err); return; }
    haptic.light();
    setStep("sent");
  }, [auth, emailValid, trimmedEmail, haptic]);

  // ── Password ──
  const signInWithPassword = useCallback(async () => {
    if (!emailValid) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Enter your password."); return; }
    setLoading(true);
    setError("");
    setNotice("");
    const err = isUpgrade
      ? await auth.upgradeWithEmail(trimmedEmail, password, prefs.name || trimmedEmail.split("@")[0])
      : await auth.signIn(trimmedEmail, password);
    setLoading(false);
    if (err) { haptic.warning(); setError(err); return; }
    finish();
  }, [auth, emailValid, trimmedEmail, password, isUpgrade, prefs.name, haptic, finish]);

  const forgotPassword = useCallback(async () => {
    if (!emailValid) { setError("Enter your email above first."); return; }
    setLoading(true);
    setError("");
    const err = await auth.resetPassword(trimmedEmail);
    setLoading(false);
    if (err) { haptic.warning(); setError(err); return; }
    haptic.light();
    setNotice(`Reset link sent to ${trimmedEmail}.`);
  }, [auth, emailValid, trimmedEmail, haptic]);

  const handleGuest = useCallback(() => {
    haptic.selection();
    router.replace("/welcome");
  }, [haptic, router]);

  const providerBusy = busyProvider !== null;

  // Resend waits 30 seconds so a second tap doesn't fire another email straight away
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  useEffect(() => { if (step === "sent") setResendIn(30); }, [step]);

  const providers = (onPhoto: boolean) => (
    <View style={styles.stack}>
      {Platform.OS === "ios" && (
        <Pressable
          onPress={handleApple}
          disabled={providerBusy}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          style={({ pressed }) => [styles.providerBtn, onPhoto ? styles.providerOnPhotoPrimary : styles.providerPrimary, pressed && styles.pressed]}
        >
          {busyProvider === "apple"
            ? <ActivityIndicator size="small" color={onPhoto ? "#000" : C.bg} />
            : <>
                <AppleMark size={20} color={onPhoto ? "#000" : C.bg} />
                <Text style={[styles.providerText, { color: onPhoto ? "#000" : C.bg }]}>Continue with Apple</Text>
              </>}
        </Pressable>
      )}
      {googleEnabled && (
        <Pressable
          onPress={handleGoogle}
          disabled={providerBusy}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          style={({ pressed }) => [styles.providerBtn, onPhoto && styles.providerOnPhoto, pressed && styles.pressed]}
        >
          {busyProvider === "google"
            ? <ActivityIndicator size="small" color={onPhoto ? "#fff" : C.textPrimary} />
            : <>
                <GoogleG size={20} />
                <Text style={[styles.providerText, onPhoto && { color: "#fff" }]}>Continue with Google</Text>
              </>}
        </Pressable>
      )}
      <Pressable
        onPress={() => go("email")}
        disabled={providerBusy}
        accessibilityRole="button"
        accessibilityLabel="Continue with email"
        style={({ pressed }) => [styles.providerBtn, onPhoto && styles.providerOnPhoto, pressed && styles.pressed]}
      >
        <Envelope size={20} color={onPhoto ? "#fff" : C.textPrimary} weight="regular" />
        <Text style={[styles.providerText, onPhoto && { color: "#fff" }]}>Continue with email</Text>
      </Pressable>
    </View>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Splash
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "splash") {
    return (
      <View style={[styles.safe, { backgroundColor: "#000" }]}>
        <StatusBar style="light" />
        <Image
          source={require("@/assets/images/welcome-hero.jpg")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          accessibilityIgnoresInvertColors
        />
        {/* Dark only where the text sits, so white type holds over any part of the photo */}
        <LinearGradient
          colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.88)"]}
          locations={[0, 0.22, 0.5, 0.78]}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.splash} pointerEvents="box-none">
            <Animated.View entering={FadeIn.duration(500)} style={styles.splashTop}>
              <Logo size={34} color="#FFFFFF" />
            </Animated.View>

            <View style={styles.splashBottom}>
              <Animated.Text entering={FadeInUp.duration(350).delay(150)} style={styles.heroTitle}>
                Welcome aboard
              </Animated.Text>
              <Animated.Text entering={FadeInUp.duration(350).delay(220)} style={styles.heroSub}>
                Sign in to find the trip your organiser has planned for you.
              </Animated.Text>

              <Animated.View entering={FadeInUp.duration(350).delay(300)}>
                {providers(true)}
                {error ? <Text style={[styles.errorText, styles.errorOnPhoto]}>{error}</Text> : null}
                <Pressable onPress={handleGuest} disabled={providerBusy} accessibilityRole="button" style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}>
                  <Text style={[styles.mutedLinkText, { color: "rgba(255,255,255,0.78)" }]}>Continue without an account</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Link sent
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === "sent") {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.centered}>
            <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center" }}>
              <View style={styles.sentIcon}>
                <Envelope size={26} color={C.textPrimary} weight="regular" />
              </View>
              <Text style={[styles.stepTitle, { textAlign: "center", marginTop: S.lg }]}>
                Check your inbox
              </Text>
              <Text style={[styles.stepSub, { textAlign: "center" }]}>
                We sent a sign-in link to{"\n"}
                <Text style={{ color: C.textPrimary, fontWeight: T.semibold }}>{trimmedEmail}</Text>
              </Text>
              <Text style={[styles.hint, { textAlign: "center" }]}>
                Open it on this phone and you'll be signed in.
              </Text>
            </Animated.View>
          </View>
          <Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.footer}>
            {error ? <Text style={[styles.errorText, { textAlign: "center", marginBottom: S.sm }]}>{error}</Text> : null}
            <Pressable
              onPress={() => { sendLink(); setResendIn(30); }}
              disabled={loading || resendIn > 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || resendIn > 0 }}
              style={({ pressed }) => [styles.secondaryBtn, pressed && resendIn <= 0 && styles.pressed]}
            >
              {loading
                ? <ActivityIndicator size="small" color={C.textPrimary} />
                : <Text style={[styles.secondaryText, resendIn > 0 && { color: C.textTertiary }]}>
                    {resendIn > 0 ? `Resend link in 0:${String(resendIn).padStart(2, "0")}` : "Resend link"}
                  </Text>}
            </Pressable>
            <Pressable onPress={() => go("email")} accessibilityRole="button" style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}>
              <Text style={styles.linkText}>Use a different email</Text>
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Options / Email / Password
  // ═══════════════════════════════════════════════════════════════════════════
  const backTarget: Step | null =
    step === "options" ? (isUpgrade ? null : "splash")
    : step === "email" ? (isUpgrade ? "options" : "splash")
    : step === "password" ? "email"
    : null;

  const title =
    step === "options" ? (isUpgrade ? "Save your trips" : "Sign in")
    : step === "email" ? "What's your email?"
    : "Sign in with a password";

  const subtitle =
    step === "options"
      ? (isUpgrade
        ? "Add an account so your trips follow you to a new phone."
        : "Use the email your organiser has for you, so your trips find you.")
    : step === "email"
      ? "We'll send you a sign-in link. No password to remember."
      : "For accounts that were set up with a password.";

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.topNav}>
            {backTarget ? (
              <Pressable
                onPress={() => go(backTarget)}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
                style={({ pressed }) => [styles.topNavBtn, pressed && { opacity: 0.6 }]}
              >
                <CaretLeft size={18} color={C.textPrimary} weight="regular" />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={({ pressed }) => [styles.topNavBtn, pressed && { opacity: 0.6 }]}
              >
                <CaretLeft size={18} color={C.textPrimary} weight="regular" />
              </Pressable>
            )}
          </View>

          <ScrollView
            contentContainerStyle={styles.stepScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.Text key={`t-${step}`} entering={FadeInUp.duration(300)} style={styles.stepTitle}>
              {title}
            </Animated.Text>
            <Animated.Text key={`s-${step}`} entering={FadeInUp.duration(300).delay(60)} style={styles.stepSub}>
              {subtitle}
            </Animated.Text>

            {step === "options" && (
              <Animated.View entering={FadeInUp.duration(300).delay(120)}>
                {providers(false)}
              </Animated.View>
            )}

            {(step === "email" || step === "password") && (
              <Animated.View entering={FadeInUp.duration(300).delay(120)} style={styles.stack}>
                <View style={[styles.inputRow, error ? { borderColor: C.red } : undefined]}>
                  <Envelope size={18} color={C.textTertiary} weight="regular" />
                  <TextInput
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(""); }}
                    placeholder="you@example.com"
                    placeholderTextColor={C.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType={step === "email" ? "send" : "next"}
                    onSubmitEditing={step === "email" ? sendLink : undefined}
                    style={styles.input}
                  />
                  {step === "email" && emailValid && (
                    <Check size={16} color={C.tealText} weight="bold" />
                  )}
                </View>
                {step === "password" && (
                  <View style={[styles.inputRow, error ? { borderColor: C.red } : undefined]}>
                    <LockKey size={18} color={C.textTertiary} weight="regular" />
                    <TextInput
                      value={password}
                      onChangeText={(t) => { setPassword(t); setError(""); }}
                      placeholder="Password"
                      placeholderTextColor={C.textTertiary}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={signInWithPassword}
                      style={styles.input}
                    />
                  </View>
                )}
              </Animated.View>
            )}

            {error ? (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.errorText}>{error}</Animated.Text>
            ) : notice ? (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.noticeText}>{notice}</Animated.Text>
            ) : null}

            {step === "password" && (
              <Pressable onPress={forgotPassword} disabled={loading} accessibilityRole="button" style={({ pressed }) => [{ marginTop: S.sm, alignSelf: "flex-start" }, pressed && { opacity: 0.6 }]}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            )}
          </ScrollView>

          <Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.footer}>
            {step === "email" && (
              <>
                <Pressable
                  onPress={sendLink}
                  disabled={!emailValid || loading}
                  accessibilityRole="button"
                  accessibilityLabel="Send sign-in link"
                  style={({ pressed }) => [styles.cta, !emailValid && styles.ctaDisabled, pressed && emailValid && styles.pressed]}
                >
                  {loading
                    ? <ActivityIndicator size="small" color={C.onAccent} />
                    : <>
                        <Text style={[styles.ctaText, !emailValid && { color: C.tealText }]}>Send link</Text>
                        <ArrowRight size={16} color={emailValid ? C.onAccent : C.tealText} weight="bold" />
                      </>}
                </Pressable>
                <Pressable onPress={() => go("password")} accessibilityRole="button" style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}>
                  <Text style={styles.mutedLinkText}>Use a password instead</Text>
                </Pressable>
              </>
            )}

            {step === "password" && (
              <Pressable
                onPress={signInWithPassword}
                disabled={!emailValid || !password || loading}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                style={({ pressed }) => [styles.cta, (!emailValid || !password) && styles.ctaDisabled, pressed && emailValid && !!password && styles.pressed]}
              >
                {loading
                  ? <ActivityIndicator size="small" color={C.onAccent} />
                  : <>
                      <Text style={[styles.ctaText, (!emailValid || !password) && { color: C.tealText }]}>Sign in</Text>
                      <ArrowRight size={16} color={emailValid && password ? C.onAccent : C.tealText} weight="bold" />
                    </>}
              </Pressable>
            )}

            {step === "options" && !isUpgrade && (
              <Pressable onPress={handleGuest} disabled={providerBusy} accessibilityRole="button" style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}>
                <Text style={styles.mutedLinkText}>Continue without an account</Text>
              </Pressable>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },

    // ── Splash ──
    splash: { flex: 1, justifyContent: "space-between" },
    splashTop: { paddingHorizontal: S.lg, paddingTop: S.md },
    splashBottom: { paddingHorizontal: S.lg, paddingBottom: S.sm },
    heroTitle: {
      fontSize: 42, fontWeight: T.bold, color: "#fff",
      letterSpacing: -0.8, lineHeight: 46, marginBottom: S.sm,
    },
    heroSub: {
      fontSize: T.md, color: "rgba(255,255,255,0.86)", lineHeight: T.md + 8,
      marginBottom: S.lg, maxWidth: 330,
    },
    // On the photo: Apple's white style, the others frosted
    providerOnPhotoPrimary: { backgroundColor: "#fff", borderColor: "#fff" },
    providerOnPhoto: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.28)" },
    errorOnPhoto: { color: "#ffb4b4", textAlign: "center" },

    // ── Nav ──
    topNav: { height: 44, paddingHorizontal: S.md, justifyContent: "center" },
    topNavBtn: {
      width: 36, height: 36, borderRadius: R.full,
      backgroundColor: C.elevated, alignItems: "center", justifyContent: "center",
    },

    // ── Step ──
    stepScroll: { paddingHorizontal: S.lg, paddingTop: S.sm, flexGrow: 1 },
    centered: { flex: 1, justifyContent: "center", paddingHorizontal: S.xl },
    stepTitle: {
      fontSize: 30, fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: -0.5, lineHeight: 35, marginBottom: S.xs,
    },
    stepSub: {
      fontSize: T.base, color: C.textSecondary, lineHeight: T.base + 7,
      marginBottom: S.xl,
    },
    hint: { fontSize: T.sm, color: C.textTertiary, lineHeight: 18 },
    stack: { gap: S.sm2 },

    // ── Provider buttons ──
    providerBtn: {
      height: 52, borderRadius: R.xl,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs2,
    },
    providerPrimary: { backgroundColor: C.textPrimary, borderColor: C.textPrimary },
    providerText: { fontSize: T.md, fontWeight: T.semibold, color: C.textPrimary },

    // ── Inputs ──
    inputRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm, height: 54,
      backgroundColor: C.card, borderRadius: R.lg, paddingHorizontal: S.md,
      borderWidth: 1, borderColor: C.border,
    },
    input: { flex: 1, height: 54, fontSize: T.lg, color: C.textPrimary },

    errorText: { fontSize: T.sm, color: C.redText, fontWeight: T.medium, marginTop: S.sm, paddingHorizontal: S["2xs"] },
    noticeText: { fontSize: T.sm, color: C.tealText, fontWeight: T.medium, marginTop: S.sm, paddingHorizontal: S["2xs"] },

    // ── Sent ──
    sentIcon: {
      width: 56, height: 56, borderRadius: R.full,
      backgroundColor: C.elevated, alignItems: "center", justifyContent: "center",
    },

    // ── Footer ──
    footer: { paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.md, gap: S["2xs"] },
    cta: {
      height: 52, borderRadius: R.xl, backgroundColor: C.teal,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
    },
    ctaDisabled: { backgroundColor: C.tealDim },
    ctaText: { fontSize: T.md, fontWeight: T.bold, color: C.onAccent },
    secondaryBtn: {
      height: 52, borderRadius: R.xl,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      alignItems: "center", justifyContent: "center",
    },
    secondaryText: { fontSize: T.md, fontWeight: T.semibold, color: C.textPrimary },
    linkBtn: { alignItems: "center", paddingVertical: S.sm },
    linkText: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText },
    mutedLinkText: { fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary },
  });
}
