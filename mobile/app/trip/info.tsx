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
import { T, R, S, F, statusTone, type ThemeColors } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
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

function statusConfig(status: InfoStatus, deadline: string | undefined, C: ThemeColors) {
  const dl = deadline ? formatDeadlineShort(deadline) : "";
  switch (status) {
    case "overdue":
      return { Icon: WarningCircle, label: `Overdue · was due ${dl}`, tone: statusTone("expired", C) };
    case "urgent": {
      const days = Math.ceil((new Date(deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
      return { Icon: Clock, label: `Due in ${days} day${days !== 1 ? "s" : ""} · ${dl}`, tone: statusTone("expiring", C) };
    }
    case "upcoming":
      return { Icon: Calendar, label: `Due ${dl}`, tone: statusTone("upcoming", C) };
    case "done":
      return { Icon: Check, label: "Completed", tone: statusTone("done", C) };
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
  const styles = useMemo(() => makeStyles(C), [C]);

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
          <EmptyState
            title="Trip not found"
            cta={{ label: "Go back", onPress: safeBack }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{
        headerShown: true,
        headerLargeTitle: true,
        headerLargeTitleShadowVisible: false,
        headerLargeTitleStyle: { color: C.textPrimary },
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
            const sc = statusConfig(status, item.deadline, C);
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
                    accessibilityLabel={item.title || "Information"}
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <Text style={styles.sectionTitle} numberOfLines={isOpen ? undefined : 2}>
                      {item.title || "Information"}
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
                        <Pill
                          tone="custom"
                          bg={sc.tone.bg}
                          color={sc.tone.text}
                          icon={<sc.Icon size={14} color={sc.tone.color} weight="bold" />}
                          label={sc.label}
                          style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: sc.tone.border, marginBottom: S.sm }}
                        />
                      )}

                      {/* 2. Action button */}
                      {item.actionUrl && (
                        <Pressable
                          onPress={() => Linking.openURL(item.actionUrl!)}
                          accessibilityRole="button"
                          accessibilityLabel={item.actionLabel ?? "Open link"}
                          style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.85 : 1 }]}
                        >
                          <View style={styles.actionBtnIcon}>
                            <ArrowSquareOut size={16} color={C.teal} weight="regular" />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.actionBtnLabel}>{item.actionLabel ?? "Open link"}</Text>
                            <Text style={styles.actionBtnHost} numberOfLines={1}>{hostname(item.actionUrl)}</Text>
                          </View>
                          <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center" }} />
                        </Pressable>
                      )}

                      {/* 3. Notes callouts */}
                      {item.notes?.map((note, i) => (
                        <View key={i} style={styles.noteCallout}>
                          <Warning size={14} color={C.amberText} weight="fill" style={{ marginTop: 2 }} />
                          <Text style={styles.noteCalloutText}>{note}</Text>
                        </View>
                      ))}

                      {/* 4. Body text */}
                      {item.body ? (
                        <LinkedText
                          text={item.body}
                          style={styles.bodyText}
                          linkColor={C.tealText}
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
                              accessibilityRole="button"
                              accessibilityLabel={`Open attachment ${d.name}`}
                              style={({ pressed }) => [styles.attachmentRow, { opacity: pressed ? 0.7 : 1 }]}
                            >
                              <Paperclip size={14} color={C.textTertiary} weight="regular" />
                              <Text style={styles.attachmentName} numberOfLines={1}>{d.name}</Text>
                              <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center" }} />
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

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: {},
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

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
      paddingHorizontal: S.md,
      paddingVertical: S.md,
    },
    sectionTitle: {
      flex: 1,
      fontSize: T.base,
      fontWeight: T.semibold,
      color: C.textPrimary,
      paddingRight: S.xs,
    },
    sourceTag: {
      paddingHorizontal: S.xs2,
      paddingVertical: 2,
      borderRadius: R.sm,
      backgroundColor: C.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      marginRight: S.xs,
    },
    sourceTagText: {
      fontFamily: F.bold,
      lineHeight: 14, includeFontPadding: false,
      fontSize: T["2xs"],
      color: C.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    chevronWrap: {
      width: 28, height: 28, borderRadius: R.full,
      alignItems: "center", justifyContent: "center",
    },
    chevronOpen: { transform: [{ rotate: "180deg" }] },

    sectionBody: {
      paddingHorizontal: S.md,
      paddingBottom: S.md,
    },

    actionBtn: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      padding: S.md, borderRadius: R.xl,
      backgroundColor: C.elevated,
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
      flexDirection: "row", alignItems: "flex-start", gap: S.xs,
      padding: S.sm,
      borderRadius: R.lg,
      backgroundColor: C.amberDim,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.amberMid,
      marginBottom: S.sm,
    },
    noteCalloutText: {
      flex: 1,
      fontSize: T.sm,
      color: C.amberText,
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
      gap: S.xs2,
      marginTop: S.xs,
    },
    attachmentRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: S.xs,
      paddingVertical: S.sm2,
      paddingHorizontal: S.md,
      borderRadius: R.lg,
      backgroundColor: C.elevated,
    },
    attachmentName: {
      flex: 1,
      fontSize: T.sm,
      fontWeight: T.medium as any,
      color: C.textPrimary,
    },
  });
}
