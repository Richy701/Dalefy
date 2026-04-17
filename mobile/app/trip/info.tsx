import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Platform, LayoutAnimation,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { useMemo, useCallback, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function InfoScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const trip = trips.find(t => t.id === tripId);
  const infoItems = trip?.info ?? [];

  // Start with first item expanded
  const [expandedId, setExpandedId] = useState<string | null>(infoItems[0]?.id ?? null);

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found</Text>
          <Pressable onPress={safeBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            style={({ pressed }) => [styles.backCircle, { opacity: pressed ? 0.7 : 1 }]}
            onPress={safeBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={15} color={C.textPrimary} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{trip.name}</Text>
          </View>
        </View>

        {/* Accordion sections */}
        <View style={styles.content}>
          {infoItems.map((item, idx) => {
            const isOpen = expandedId === item.id;
            return (
              <View key={item.id} style={[styles.section, idx === 0 && styles.sectionFirst]}>
                <Pressable
                  onPress={() => toggle(item.id)}
                  style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={item.title || "Untitled"}
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityHint={isOpen ? "Double tap to collapse" : "Double tap to expand"}
                >
                  <Text style={[styles.sectionTitle, isOpen && { color: C.teal }]}>
                    {item.title || "Untitled"}
                  </Text>
                  <View style={[styles.chevronWrap, isOpen && styles.chevronOpen]}>
                    <ChevronDown size={16} color={isOpen ? C.teal : C.textTertiary} strokeWidth={2} />
                  </View>
                </Pressable>

                {isOpen && item.body ? (
                  <View style={styles.sectionBody}>
                    <Text style={styles.bodyText}>{item.body}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 80 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    backBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    backBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      paddingHorizontal: S.md,
      paddingBottom: S.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    backCircle: {
      width: 44, height: 44, borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    headerText: { flex: 1 },
    headerTitle: {
      fontSize: T.sm,
      fontWeight: T.bold,
      color: C.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    content: {
      marginTop: S.sm,
    },

    section: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    sectionFirst: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: S.lg,
      paddingVertical: S.md,
    },
    sectionTitle: {
      flex: 1,
      fontSize: T.base,
      fontWeight: T.semibold,
      color: C.textPrimary,
      paddingRight: S.sm,
    },
    chevronWrap: {
      width: 28,
      height: 28,
      borderRadius: R.full,
      alignItems: "center",
      justifyContent: "center",
    },
    chevronOpen: {
      transform: [{ rotate: "180deg" }],
    },

    sectionBody: {
      paddingHorizontal: S.lg,
      paddingBottom: S.lg,
    },
    bodyText: {
      fontSize: T.sm,
      color: C.textSecondary,
      lineHeight: 22,
      fontWeight: T.regular,
    },
  });
}
