import { useMemo, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowRight } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { Logo } from "@/components/Logo";

export default function WelcomeScreen() {
  const { C } = useTheme();
  const { prefs, setPref } = usePreferences();
  const router = useRouter();
  const isEdit = !!prefs.name;
  const [value, setValue] = useState(prefs.name);
  const styles = useMemo(() => makeStyles(C), [C]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPref("name", trimmed);
    if (isEdit) router.back();
    else router.replace("/(tabs)");
  };

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
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Logo size={16} color={C.teal} />
            </View>
            <Text style={styles.brandName}>DAF Adventures</Text>
          </View>

          {!isEdit && (
            <View style={styles.illusWrap}>
              <Image
                source={require("@/assets/illustrations/illus-discussion.png")}
                style={styles.illus}
                resizeMode="contain"
              />
            </View>
          )}

          <View style={styles.copy}>
            <Text style={styles.eyebrow}>
              {isEdit ? "Your name" : "Welcome"}
            </Text>
            <Text style={styles.title}>
              {isEdit ? "Update your name" : "What should we call you?"}
            </Text>
            <Text style={styles.sub}>
              {isEdit
                ? "This is how the app greets you and appears on your trips."
                : "We'll use this to greet you and on trips you share."}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="First name"
              placeholderTextColor={C.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submit}
              maxLength={40}
              style={styles.input}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.cta,
              !canSubmit && styles.ctaDisabled,
              pressed && canSubmit && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.ctaText, !canSubmit && { color: C.textTertiary }]}>
              {isEdit ? "Save" : "Continue"}
            </Text>
            <ArrowRight
              size={16}
              color={canSubmit ? "#000" : C.textTertiary}
              strokeWidth={2.5}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: S.md, paddingTop: S.xl, flexGrow: 1 },

    brandRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      marginBottom: S.xl,
    },
    logoBadge: {
      width: 32, height: 32, borderRadius: R.md,
      backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    brandName: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase",
    },

    illusWrap: {
      alignItems: "center",
      marginTop: S.sm,
      marginBottom: S.md,
    },
    illus: {
      width: "100%",
      maxWidth: 320,
      height: 180,
    },

    copy: { marginBottom: S["2xl"] },
    eyebrow: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 1.2, textTransform: "uppercase", marginBottom: S.sm,
    },
    title: {
      fontSize: T["4xl"], fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.8, lineHeight: T["4xl"] + 4,
      marginBottom: S.sm,
    },
    sub: {
      fontSize: T.base, color: C.textSecondary, fontWeight: T.regular,
      lineHeight: T.base + 8,
    },

    field: { marginBottom: S.lg },
    label: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 0.8, textTransform: "uppercase", marginBottom: S.xs,
    },
    input: {
      height: 56,
      backgroundColor: C.card,
      borderRadius: R.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingHorizontal: S.md,
      fontSize: T.lg,
      fontWeight: T.semibold,
      color: C.textPrimary,
    },

    footer: {
      paddingHorizontal: S.md,
      paddingTop: S.sm,
      paddingBottom: S.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderLight,
      backgroundColor: C.bg,
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
  });
}
