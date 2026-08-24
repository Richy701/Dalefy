import { useState, useMemo, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useCompliance } from "@/context/ComplianceContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/context/ToastContext";
import { COMPLIANCE_DOC_CONTENT } from "@/shared/compliance-docs";
import {
  FileText as FileCheckIcon, FileDashed, FileX, ShieldCheck, Info,
} from "phosphor-react-native";
import { T, R, S, SCROLL_BOTTOM_PAD, statusTone, type ThemeColors } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";

export default function DocumentScreen() {
  const { C, isDark } = useTheme();
  const { docs, signDoc } = useCompliance();
  const router = useRouter();
  const haptic = useHaptic();
  const { toast } = useToast();
  const { name } = useLocalSearchParams<{ name: string }>();
  const s = useMemo(() => makeStyles(C), [C]);

  const doc = docs.find((d) => d.name === name);
  const content = name ? COMPLIANCE_DOC_CONTENT[name] : null;
  const isSigned = doc?.status === "Signed";
  const [signing, setSigning] = useState(false);

  const handleSign = useCallback(async () => {
    if (!name || signing) return;
    setSigning(true);
    haptic.medium();
    await new Promise((r) => setTimeout(r, 600));
    signDoc(name);
    toast(`${name} signed`);
    setSigning(false);
    router.back();
  }, [name, signing, signDoc, haptic, toast, router]);

  if (!doc || !content) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon={<FileX size={28} color={C.teal} weight="light" />}
            title="Document not found"
            cta={{ label: "Go back", onPress: () => router.back() }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const StatusIcon = isSigned ? FileCheckIcon : doc.status === "Expired" ? FileX : FileDashed;
  const tone = statusTone(doc.status, C);

  return (
    <SafeAreaView style={s.safe} edges={Platform.OS === "android" ? ["top"] : []}>
      <Stack.Screen options={{
        headerShown: true,
        title: doc.name,
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: Platform.OS === "ios",
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: C.teal,
        headerTitleStyle: { color: C.teal, fontWeight: "700", fontSize: 16 },
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? { headerStyle: { backgroundColor: C.bg } } : {}),
        headerRight: () => (
          <Pill
            tone="custom"
            bg={tone.bg}
            color={tone.text}
            icon={<StatusIcon size={12} color={tone.color} weight="regular" />}
            label={doc.status}
          />
        ),
      }} />

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Title block */}
        <Text style={s.docTitle}>{content.title}</Text>

        {/* Preamble */}
        <View style={s.preambleWrap}>
          <View style={[s.preambleBar, { backgroundColor: C.teal }]} />
          <Text style={s.preamble}>{content.preamble}</Text>
        </View>

        {/* Sections */}
        {content.sections.map((section, i) => (
          <View key={i} style={s.section}>
            <View style={s.sectionNumberWrap}>
              <View style={[s.sectionNumber, { backgroundColor: C.elevated, borderColor: C.border }]}>
                <Text style={[s.sectionNumberText, { color: C.tealText }]}>{i + 1}</Text>
              </View>
            </View>
            <View style={s.sectionBody}>
              <Text style={s.sectionHeading}>
                {section.heading.split(". ")[1] || section.heading}
              </Text>
              <Text style={s.sectionText}>{section.body}</Text>
            </View>
          </View>
        ))}

        {/* Signed confirmation */}
        {isSigned && doc.date && (
          <View style={[s.signedCard, { backgroundColor: C.tealDim, borderColor: C.tealMid }]}>
            <View style={[s.signedIcon, { backgroundColor: C.tealDim }]}>
              <ShieldCheck size={20} color={C.teal} weight="light" />
            </View>
            <View style={s.signedTextWrap}>
              <Text style={[s.signedLabel, { color: C.tealText }]}>Signed & verified</Text>
              <Text style={s.signedDate}>
                {new Date(doc.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sign button (fixed at bottom) */}
      {!isSigned && (
        <SafeAreaView edges={["bottom"]} style={s.footerSafe}>
          <View style={s.footer}>
            <View style={s.disclaimerRow}>
              <Info size={12} color={C.textTertiary} weight="light" style={{ marginTop: 2 }} />
              <Text style={s.disclaimer}>
                By signing, you confirm you have read and accept all terms above.
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                s.signBtn,
                { backgroundColor: signing ? C.elevated : C.teal, opacity: pressed && !signing ? 0.8 : 1 },
              ]}
              onPress={handleSign}
              disabled={signing}
              accessibilityRole="button"
              accessibilityLabel="Sign document"
              accessibilityState={{ busy: signing, disabled: signing }}
            >
              {signing ? (
                <ActivityIndicator size="small" color={C.textTertiary} />
              ) : (
                <Text style={s.signBtnText}>Sign document</Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    // Body
    body: { flex: 1 },
    bodyContent: { padding: S.lg, paddingBottom: SCROLL_BOTTOM_PAD },

    docTitle: {
      fontSize: T["2xl"],
      fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.3,
      marginBottom: S.lg,
    },

    // Preamble
    preambleWrap: {
      flexDirection: "row",
      gap: S.sm,
      marginBottom: S.xl,
    },
    preambleBar: {
      width: 3,
      borderRadius: 2,
    },
    preamble: {
      flex: 1,
      fontSize: T.sm,
      color: C.textSecondary,
      lineHeight: 20,
      fontWeight: T.medium,
    },

    // Sections
    section: {
      flexDirection: "row",
      gap: S.sm,
      marginBottom: S.lg,
    },
    sectionNumberWrap: {
      paddingTop: 2,
    },
    sectionNumber: {
      width: 24,
      height: 24,
      borderRadius: R.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionNumberText: {
      fontSize: T.xs,
      fontWeight: T.bold,
    },
    sectionBody: { flex: 1 },
    sectionHeading: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textPrimary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: S.xs2,
    },
    sectionText: {
      fontSize: T.sm,
      color: C.textTertiary,
      lineHeight: 20,
    },

    // Signed card
    signedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      padding: S.md,
      borderRadius: R.xl,
      borderWidth: 1,
      marginTop: S.md,
    },
    signedIcon: {
      width: 40,
      height: 40,
      borderRadius: R.md,
      alignItems: "center",
      justifyContent: "center",
    },
    signedTextWrap: { flex: 1 },
    signedLabel: {
      fontSize: T.xs,
      fontWeight: T.bold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    signedDate: {
      fontSize: T.xs,
      color: C.textTertiary,
      fontWeight: T.medium,
      marginTop: 2,
    },

    // Footer
    footerSafe: {
      backgroundColor: C.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    footer: {
      padding: S.md,
    },
    disclaimerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: S.xs2,
      marginBottom: S.sm,
    },
    disclaimer: {
      flex: 1,
      fontSize: T.xs,
      color: C.textTertiary,
      fontWeight: T.medium,
    },
    signBtn: {
      height: 52,
      borderRadius: R.xl,
      alignItems: "center",
      justifyContent: "center",
    },
    signBtnText: {
      fontSize: T.md,
      fontWeight: T.bold,
      color: C.onAccent,
    },
  });
}
