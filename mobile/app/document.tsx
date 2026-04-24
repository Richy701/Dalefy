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
  FileCheck, FileClock, FileX, ShieldCheck, Info,
} from "lucide-react-native";
import { T, R, S, type ThemeColors } from "@/constants/theme";

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
        <Text style={s.emptyText}>Document not found</Text>
      </SafeAreaView>
    );
  }

  const StatusIcon = isSigned ? FileCheck : doc.status === "Expired" ? FileX : FileClock;
  const statusColor = isSigned ? C.green : doc.status === "Expired" ? C.red : C.amber;
  const statusBg = isSigned ? C.greenDim : doc.status === "Expired" ? C.redDim : C.amberDim;

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
          <View style={[s.statusPill, { backgroundColor: statusBg }]}>
            <StatusIcon size={12} color={statusColor} strokeWidth={2} />
            <Text style={[s.statusText, { color: statusColor }]}>{doc.status}</Text>
          </View>
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
                <Text style={[s.sectionNumberText, { color: C.teal }]}>{i + 1}</Text>
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
              <ShieldCheck size={20} color={C.teal} strokeWidth={1.5} />
            </View>
            <View style={s.signedTextWrap}>
              <Text style={[s.signedLabel, { color: C.teal }]}>Signed & Verified</Text>
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

        {/* Spacer for sign button */}
        {!isSigned && <View style={{ height: 100 }} />}
      </ScrollView>

      {/* Sign button (fixed at bottom) */}
      {!isSigned && (
        <SafeAreaView edges={["bottom"]} style={s.footerSafe}>
          <View style={s.footer}>
            <View style={s.disclaimerRow}>
              <Info size={12} color={C.textTertiary} strokeWidth={1.5} />
              <Text style={s.disclaimer}>
                By signing, you confirm you have read and accept all terms above.
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                s.signBtn,
                { backgroundColor: C.teal, opacity: pressed || signing ? 0.8 : 1 },
              ]}
              onPress={handleSign}
              disabled={signing}
            >
              {signing ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={s.signBtnText}>Sign Document</Text>
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
    emptyText: { color: C.textTertiary, textAlign: "center", marginTop: 60, fontSize: T.base },

    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: R.full,
    },
    statusText: {
      fontSize: T.xs,
      fontWeight: T.bold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    // Body
    body: { flex: 1 },
    bodyContent: { padding: S.lg, paddingBottom: 100 },

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
      borderRadius: R.sm,
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
      marginBottom: 6,
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
      borderRadius: R.lg,
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
      alignItems: "center",
      gap: 6,
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
      fontSize: T.base,
      fontWeight: T.bold,
      color: "#000",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
  });
}
