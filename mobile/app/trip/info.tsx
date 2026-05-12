import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Platform, LayoutAnimation, Share, Linking,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  CaretDown, CaretRight, Calendar, Clock, Check,
  Warning, WarningCircle, ArrowSquareOut, Paperclip,
} from "phosphor-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { useMemo, useCallback, useState } from "react";
import type { TripInfo } from "@/shared/types";
import { openDocument } from "@/services/openDocument";

const URL_RE = /(https?:\/\/[^\s),]+)/g;

function LinkedText({ text, style, linkColor, stripUrls }: { text: string; style: any; linkColor: string; stripUrls?: string[] }) {
  let cleaned = text;
  if (stripUrls) {
    for (const u of stripUrls) cleaned = cleaned.replace(u, "").trim();
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return null;

  const parts = cleaned.split(URL_RE);
  return (
    <Text style={style} selectable>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <Text
            key={i}
            style={{ color: linkColor, textDecorationLine: "underline" }}
            onPress={() => Linking.openURL(part)}
          >
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

type InfoStatus = "overdue" | "urgent" | "upcoming" | "done" | null;

function getStatus(item: TripInfo, now = new Date()): InfoStatus {
  if (item.completed) return "done";
  if (!item.deadline) return null;
  const deadline = new Date(item.deadline + "T23:59:59");
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 3) return "urgent";
  return "upcoming";
}

function formatDeadlineShort(d: string): string {
  const date = new Date(d + "T12:00:00");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function statusConfig(status: InfoStatus, deadline: string | undefined, C: ThemeColors, isDark: boolean) {
  const dl = deadline ? formatDeadlineShort(deadline) : "";
  switch (status) {
    case "overdue": return {
      Icon: WarningCircle, label: `Overdue - was due ${dl}`,
      color: C.red, bg: isDark ? C.redDim : "#fef2f2", border: isDark ? "rgba(239,68,68,0.25)" : "#fecaca",
    };
    case "urgent": {
      const days = Math.ceil((new Date(deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
      return {
        Icon: Clock, label: `Due in ${days} day${days !== 1 ? "s" : ""} - ${dl}`,
        color: C.amber, bg: isDark ? C.amberDim : "#fffbeb", border: isDark ? "rgba(245,158,11,0.25)" : "#fde68a",
      };
    }
    case "upcoming": return {
      Icon: Calendar, label: `Due ${dl}`,
      color: isDark ? C.textTertiary : "#52525b",
      bg: isDark ? C.elevated : "#f4f4f5", border: isDark ? C.border : "#e4e4e7",
    };
    case "done": return {
      Icon: Check, label: "Completed",
      color: isDark ? C.teal : "#047857",
      bg: isDark ? C.tealDim : "#ecfdf5", border: isDark ? C.tealMid : "#a7f3d0",
    };
    default: return null;
  }
}

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export default function InfoScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const { isLeader } = useTripRole(tripId);
  const trip = trips.find(t => t.id === tripId);
  const infoItems = useMemo(() => {
    const all = trip?.info ?? [];
    return isLeader ? all : all.filter(i => !i.leaderOnly);
  }, [trip?.info, isLeader]);

  const [expandedId, setExpandedId] = useState<string | null>(infoItems[0]?.id ?? null);

  const toggle = useCallback((id: string) => {
    Haptics.selectionAsync();
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
    <View style={styles.safe}>
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} contentInsetAdjustmentBehavior="automatic">

        <View style={styles.content}>
          {infoItems.map((item, idx) => {
            const isOpen = expandedId === item.id;
            const status = getStatus(item);
            const sc = statusConfig(status, item.deadline, C, isDark);
            return (
              <ContextMenu
                key={item.id}
                actions={[
                  { title: "Share", systemIcon: "square.and.arrow.up" },
                  { title: "Copy Text", systemIcon: "doc.on.doc" },
                ]}
                onPress={(e: any) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const text = `${item.title}\n\n${item.body ?? ""}`;
                  if (e.nativeEvent.index === 0) Share.share({ message: text });
                  else if (e.nativeEvent.index === 1) {
                    import("expo-clipboard").then(Clipboard => Clipboard.setStringAsync(text)).catch(() => {});
                  }
                }}
              >
                <View style={[styles.section, idx === 0 && styles.sectionFirst]}>
                  {/* Collapsed header row */}
                  <Pressable
                    onPress={() => toggle(item.id)}
                    style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={item.title || "Untitled"}
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <Text style={styles.sectionTitle} numberOfLines={isOpen ? undefined : 2}>
                      {item.title || "Untitled"}
                    </Text>
                    {item.source && (
                      <View style={styles.sourceTag}>
                        <Text style={styles.sourceTagText}>{item.source}</Text>
                      </View>
                    )}
                    <View style={[styles.chevronWrap, isOpen && styles.chevronOpen]}>
                      <CaretDown size={16} color={isOpen ? C.textPrimary : C.textTertiary} weight="regular" />
                    </View>
                  </Pressable>

                  {/* Expanded content */}
                  {isOpen && (
                    <View style={styles.sectionBody}>

                      {/* 1. Status badge */}
                      {sc && (
                        <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                          <sc.Icon size={14} color={sc.color} weight="bold" />
                          <Text style={[styles.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      )}

                      {/* 2. Action button */}
                      {item.actionUrl && (
                        <Pressable
                          onPress={() => Linking.openURL(item.actionUrl!)}
                          style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.85 : 1 }]}
                        >
                          <View style={styles.actionBtnIcon}>
                            <ArrowSquareOut size={16} color={C.teal} weight="regular" />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.actionBtnLabel}>{item.actionLabel ?? "Open link"}</Text>
                            <Text style={styles.actionBtnHost} numberOfLines={1}>{hostname(item.actionUrl)}</Text>
                          </View>
                          <CaretRight size={16} color={C.textDim} weight="regular" />
                        </Pressable>
                      )}

                      {/* 3. Notes callouts */}
                      {item.notes?.map((note, i) => (
                        <View key={i} style={styles.noteCallout}>
                          <Warning size={14} color={isDark ? C.amber : "#d97706"} weight="fill" style={{ marginTop: 1 }} />
                          <Text style={styles.noteCalloutText}>{note}</Text>
                        </View>
                      ))}

                      {/* 4. Body text */}
                      {item.body ? (
                        <LinkedText
                          text={item.body}
                          style={styles.bodyText}
                          linkColor={C.teal}
                          stripUrls={item.actionUrl ? [item.actionUrl] : undefined}
                        />
                      ) : null}

                      {/* 5. Attachments */}
                      {item.documents && item.documents.length > 0 && (
                        <View style={styles.attachments}>
                          {item.documents.map(d => (
                            <Pressable
                              key={d.id}
                              onPress={() => openDocument(d.url, d.name).catch(() => {})}
                              style={({ pressed }) => [styles.attachmentRow, { opacity: pressed ? 0.7 : 1 }]}
                            >
                              <Paperclip size={14} color={C.teal} weight="bold" />
                              <Text style={styles.attachmentName} numberOfLines={1}>{d.name}</Text>
                              <CaretRight size={14} color={C.textDim} weight="regular" />
                            </Pressable>
                          ))}
                        </View>
                      )}

                    </View>
                  )}
                </View>
              </ContextMenu>
            );
          })}
        </View>

      </ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: {},
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
    backBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    backBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

    content: { marginTop: S.sm },

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
      paddingHorizontal: S.lg,
      paddingVertical: S.lg,
    },
    sectionTitle: {
      flex: 1,
      fontSize: T.base,
      fontWeight: T.semibold,
      color: C.textPrimary,
      paddingRight: S.xs,
    },
    sourceTag: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: R.sm,
      backgroundColor: isDark ? C.elevated : "#f4f4f5",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? C.border : "#e4e4e7",
      marginRight: S.xs,
    },
    sourceTagText: {
      fontSize: 10,
      fontWeight: T.medium,
      color: isDark ? C.textTertiary : "#52525b",
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    chevronWrap: {
      width: 28, height: 28, borderRadius: R.full,
      alignItems: "center", justifyContent: "center",
    },
    chevronOpen: { transform: [{ rotate: "180deg" }] },

    sectionBody: {
      paddingHorizontal: S.lg,
      paddingBottom: S.lg,
    },

    statusBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: R.full,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: S.sm,
    },
    statusBadgeText: {
      fontSize: T.xs, fontWeight: T.semibold,
    },

    actionBtn: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      padding: S.md, borderRadius: R.xl,
      backgroundColor: isDark ? C.card : "#f4f4f5",
      marginBottom: S.sm,
    },
    actionBtnIcon: {
      width: 36, height: 36, borderRadius: R.md,
      backgroundColor: C.tealDim,
      alignItems: "center", justifyContent: "center",
    },
    actionBtnLabel: {
      fontSize: T.sm, fontWeight: T.semibold,
      color: C.textPrimary,
    },
    actionBtnHost: {
      fontSize: T.xs, color: C.textTertiary,
      marginTop: 1,
    },

    noteCallout: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      padding: S.sm,
      borderRadius: R.lg,
      backgroundColor: isDark ? C.amberDim : "#fffbeb",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(245,158,11,0.25)" : "#fde68a",
      marginBottom: S.sm,
    },
    noteCalloutText: {
      flex: 1,
      fontSize: T.sm,
      color: isDark ? C.amber : "#92400e",
      lineHeight: 20,
    },

    bodyText: {
      fontSize: T.sm,
      color: C.textSecondary,
      lineHeight: 22,
      fontWeight: T.regular,
      marginBottom: S.sm,
    },

    attachments: {
      gap: 6,
      marginTop: S.xs,
    },
    attachmentRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: S.md,
      borderRadius: R.lg,
      backgroundColor: isDark ? C.card : "#f4f4f5",
    },
    attachmentName: {
      flex: 1,
      fontSize: T.sm,
      fontWeight: T.medium as any,
      color: C.textPrimary,
    },

  });
}
