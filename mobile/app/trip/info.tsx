import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Platform, LayoutAnimation, Share,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { useMemo, useCallback, useState } from "react";

export default function InfoScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const { isLeader } = useTripRole(tripId);
  const trip = trips.find(t => t.id === tripId);
  const SENSITIVE = /price|cost|budget|pnr|supplier|booking\s*ref|payment|invoice|conf|rate|tariff|margin|commission/i;
  const infoItems = (() => {
    const all = trip?.info ?? [];
    return isLeader ? all : all.filter(i => !SENSITIVE.test(i.title) && !SENSITIVE.test(i.body));
  })();

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
      <Stack.Screen options={{
        headerShown: true,
        title: "Information",
        headerBackTitle: " ",
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: Platform.OS === "ios",
        headerBlurEffect: isDark ? "dark" : "light",
        headerTintColor: C.textPrimary,
        headerTitleStyle: { color: C.textPrimary, fontWeight: "700" },
        headerShadowVisible: false,
        ...(Platform.OS === "android" ? { headerStyle: { backgroundColor: C.bg } } : {}),
      }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} contentInsetAdjustmentBehavior="automatic">

        {/* Accordion sections */}
        <View style={styles.content}>
          {infoItems.map((item, idx) => {
            const isOpen = expandedId === item.id;
            return (
              <ContextMenu
                key={item.id}
                actions={[
                  { title: "Share", systemIcon: "square.and.arrow.up" },
                  { title: "Copy Text", systemIcon: "doc.on.doc" },
                ]}
                onPress={(e: any) => {
                  const text = `${item.title}\n\n${item.body ?? ""}`;
                  if (e.nativeEvent.index === 0) Share.share({ message: text });
                  else if (e.nativeEvent.index === 1) {
                    import("expo-clipboard").then(Clipboard => Clipboard.setStringAsync(text)).catch(() => {});
                  }
                }}
              >
                <View style={[styles.section, idx === 0 && styles.sectionFirst]}>
                  <Pressable
                    onPress={() => toggle(item.id)}
                    style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={item.title || "Untitled"}
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityHint={isOpen ? "Double tap to collapse" : "Double tap to expand"}
                  >
                    <Text style={styles.sectionTitle}>
                      {item.title || "Untitled"}
                    </Text>
                    <View style={[styles.chevronWrap, isOpen && styles.chevronOpen]}>
                      <ChevronDown size={16} color={isOpen ? C.textPrimary : C.textTertiary} strokeWidth={2} />
                    </View>
                  </Pressable>

                  {isOpen && item.body ? (
                    <View style={styles.sectionBody}>
                      <Text style={styles.bodyText} selectable>{item.body}</Text>
                    </View>
                  ) : null}
                </View>
              </ContextMenu>
            );
          })}
        </View>

        {/* Terminal element clearance */}
        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: {},
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    backBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    backBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

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
      paddingVertical: S.lg,
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
