import { useMemo, useRef, useCallback } from "react";
import {
  View, Text, SectionList, Pressable, StyleSheet, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import ContextMenu from "@/components/ContextMenu";
import {
  Bell, Trash, AirplaneTilt, AirplaneLanding, AirplaneTakeoff,
  Warning, Bed, ForkKnife, CalendarDots, Car, Check, CaretRight,
  CheckCircle,
} from "phosphor-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { useHaptic } from "@/hooks/useHaptic";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import type { Notification } from "@/shared/types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

/* ── Date grouping helpers ── */

function getNotifEpoch(id: string): number {
  const epoch = parseInt(id.split("-")[0], 10);
  return isNaN(epoch) || epoch < 1e12 ? Date.now() : epoch;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

type Section = { label: string; data: Notification[] };

function groupNotifications(notifs: Notification[]): Section[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Section[] = [
    { label: "Today", data: [] },
    { label: "Yesterday", data: [] },
    { label: "Earlier", data: [] },
  ];

  for (const n of notifs) {
    const d = new Date(getNotifEpoch(n.id));
    if (isSameDay(d, today)) groups[0].data.push(n);
    else if (isSameDay(d, yesterday)) groups[1].data.push(n);
    else groups[2].data.push(n);
  }

  return groups.filter(g => g.data.length > 0);
}

/* ── Icon config by notification type ── */

const NAVIGABLE_TYPES = new Set(["flight", "landed", "boarding", "hotel", "dining", "activity", "transfer", "warning"]);

function getNotifIcon(n: { type: string; message: string }, C: ThemeColors) {
  const msg = n.message.toLowerCase();

  if (n.type === "warning" || msg.includes("cancelled") || msg.includes("delayed"))
    return { Icon: Warning, color: C.red, bg: C.redDim };
  if (n.type === "landed" || msg.includes("landed"))
    return { Icon: AirplaneLanding, color: C.flight, bg: `${C.flight}18` };
  if (n.type === "boarding" || msg.includes("boarding"))
    return { Icon: AirplaneTakeoff, color: C.flight, bg: `${C.flight}18` };
  if (n.type === "flight" || msg.includes("flight") || msg.includes("gate") || msg.includes("terminal"))
    return { Icon: AirplaneTilt, color: C.flight, bg: `${C.flight}18` };
  if (n.type === "hotel" || msg.includes("hotel") || msg.includes("check-in"))
    return { Icon: Bed, color: C.hotel, bg: `${C.hotel}18` };
  if (n.type === "dining" || msg.includes("dining") || msg.includes("restaurant"))
    return { Icon: ForkKnife, color: C.dining, bg: `${C.dining}18` };
  if (n.type === "transfer" || msg.includes("transfer") || msg.includes("pickup"))
    return { Icon: Car, color: C.transfer, bg: `${C.transfer}18` };
  if (n.type === "activity")
    return { Icon: CalendarDots, color: C.activity, bg: C.amberDim };
  if (n.type === "success")
    return { Icon: CheckCircle, color: C.green, bg: C.greenDim };
  if (msg.includes("update") || msg.includes("vs") || msg.includes("ba") || msg.includes("depart"))
    return { Icon: AirplaneTilt, color: C.flight, bg: `${C.flight}18` };
  return { Icon: Bell, color: C.teal, bg: `${C.teal}18` };
}

/* ── Main sheet ── */

export function NotificationSheet({ visible, onClose }: Props) {
  const { C, isDark } = useTheme();
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead, removeNotification, clearAll } = useNotifications();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const haptic = useHaptic();
  const sections = useMemo(() => groupNotifications(notifications), [notifications]);

  const handleNavigate = useCallback((n: Notification) => {
    if (!n.read) markRead(n.id);
    if (n.tripId) {
      onClose();
      setTimeout(() => router.push(`/trip/${n.tripId}`), 300);
    }
  }, [markRead, onClose, router]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Native drag indicator */}
        <View style={styles.dragBar} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {unreadCount > 0 && (
              <Pressable
                onPress={() => { haptic.light(); markAllRead(); }}
                style={({ pressed }) => [styles.headerTextBtn, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
              >
                <Text style={styles.readAllLabel}>Read all</Text>
              </Pressable>
            )}
            {notifications.length > 0 && unreadCount === 0 && (
              <Pressable
                onPress={() => { haptic.light(); clearAll(); }}
                style={({ pressed }) => [styles.headerTextBtn, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Clear all"
              >
                <Text style={styles.readAllLabel}>Clear</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.headerTitle}>Notifications</Text>

          <View style={[styles.headerSide, { justifyContent: "flex-end" }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 4, paddingLeft: 8 })}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>

        {/* Count subtitle */}
        {notifications.length > 0 && (
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </Text>
          </View>
        )}

        {/* Grouped list */}
        {notifications.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Check size={26} color={C.teal} weight="regular" />
            </View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyDesc}>
              New trip updates, reminders, and alerts will appear here.
            </Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={n => n.id}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <NotificationRow
                notification={item}
                C={C}
                isDark={isDark}
                styles={styles}
                onPress={() => { haptic.light(); handleNavigate(item); }}
                onMarkRead={() => { haptic.light(); markRead(item.id); }}
                onRemove={() => { haptic.medium(); removeNotification(item.id); }}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/* ── Swipeable notification row ── */

interface RowProps {
  notification: Notification;
  C: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  onMarkRead: () => void;
  onRemove: () => void;
}

function NotificationRow({ notification: n, C, isDark, styles, onPress, onMarkRead, onRemove }: RowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const { Icon, color, bg } = getNotifIcon(n, C);
  const navigable = n.tripId != null;

  const actionWidth = n.read ? 56 : 112;
  const renderRightActions = useCallback(() => {
    return (
      <View style={[styles.swipeActions, { width: actionWidth }]}>
        {!n.read && (
          <Pressable
            style={[styles.swipeBtn, { backgroundColor: isDark ? "#3f3f46" : "#d4d4d8" }]}
            onPress={() => { swipeRef.current?.close(); onMarkRead(); }}
          >
            <Check size={16} color={isDark ? "#e4e4e7" : "#3f3f46"} weight="bold" />
            <Text style={[styles.swipeBtnLabel, { color: isDark ? "#e4e4e7" : "#3f3f46" }]}>Read</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.swipeBtn, { backgroundColor: C.red }]}
          onPress={() => { swipeRef.current?.close(); onRemove(); }}
        >
          <Trash size={16} color="#fff" weight="regular" />
          <Text style={[styles.swipeBtnLabel, { color: "#fff" }]}>Delete</Text>
        </Pressable>
      </View>
    );
  }, [n.read, C, isDark, styles, onMarkRead, onRemove, actionWidth]);

  const contextActions = [
    ...(!n.read ? [{ title: "Mark as Read", systemIcon: "checkmark.circle" }] : []),
    ...(navigable ? [{ title: "View Trip", systemIcon: "airplane" }] : []),
    { title: "Delete", systemIcon: "trash", destructive: true },
  ];

  const handleContextAction = useCallback((e: any) => {
    const action = e.nativeEvent.name;
    if (action === "Mark as Read") onMarkRead();
    if (action === "View Trip") onPress();
    if (action === "Delete") onRemove();
  }, [onMarkRead, onPress, onRemove]);

  return (
    <Swipeable
      ref={swipeRef}
      containerStyle={styles.swipeContainer}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      friction={2}
    >
      <View style={styles.itemOpaqueBase}>
        <ContextMenu
          actions={contextActions}
          onPress={handleContextAction}
          previewBackgroundColor="transparent"
        >
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.item,
              !n.read && styles.itemUnread,
              pressed && styles.itemPressed,
            ]}
          >
            <View style={styles.itemRow}>
              {/* Left color accent bar for unread */}
              {!n.read && <View style={[styles.accentBar, { backgroundColor: color }]} />}

              {/* Type icon */}
              <View style={[styles.iconWrap, { backgroundColor: bg }]}>
                <Icon size={18} color={color} weight="duotone" />
              </View>

              <View style={styles.itemContent}>
                <View style={styles.itemTitleRow}>
                  <Text
                    style={[styles.itemMessage, n.read && styles.itemMessageRead]}
                    numberOfLines={1}
                  >
                    {n.message}
                  </Text>
                  {n.time ? (
                    <Text style={styles.itemTime}>{n.time}</Text>
                  ) : null}
                </View>
                <Text style={[styles.itemDetail, n.read && styles.itemDetailRead]} numberOfLines={2}>
                  {n.detail}
                </Text>
              </View>

              {navigable && (
                <View style={styles.chevronWrap}>
                  <CaretRight size={14} color={C.textDim} weight="bold" />
                </View>
              )}
            </View>
          </Pressable>
        </ContextMenu>
      </View>
    </Swipeable>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg, overflow: "hidden" as const },

    dragBar: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.border,
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 4,
    },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: S.md,
      paddingVertical: S.xs,
    },
    headerSide: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      minWidth: 44,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: C.textPrimary,
      letterSpacing: -0.2,
      textAlign: "center",
      flex: 1,
    },
    headerTextBtn: {
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    readAllLabel: {
      fontSize: T.xs,
      fontWeight: "500",
      color: C.textSecondary,
    },
    doneText: {
      fontSize: T.base,
      fontWeight: "700",
      color: C.teal,
    },

    // Count subtitle
    countRow: {
      paddingHorizontal: S.md,
      paddingBottom: S.sm,
    },
    countText: {
      fontSize: T.xs,
      fontWeight: "500",
      color: C.textTertiary,
    },

    // Section headers
    sectionHeader: {
      paddingHorizontal: S.md,
      paddingTop: 14,
      paddingBottom: 6,
      backgroundColor: C.bg,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: C.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },

    // List
    list: { paddingHorizontal: S.xs, paddingBottom: 40 },

    // Swipe container
    swipeContainer: {
      borderRadius: R.lg,
      overflow: "hidden" as const,
      marginBottom: 6,
    },

    // Opaque base
    itemOpaqueBase: {
      backgroundColor: isDark ? C.card : C.card,
      borderRadius: R.lg,
      overflow: "hidden" as const,
    },

    // Notification item
    item: {
      position: "relative" as const,
      paddingLeft: S.md,
      paddingRight: S.sm,
      paddingVertical: 14,
    },
    itemUnread: {
      backgroundColor: isDark ? `${C.teal}14` : `${C.teal}18`,
    },
    itemPressed: {
      backgroundColor: isDark ? C.elevated : C.elevated,
    },
    accentBar: {
      position: "absolute" as const,
      left: 0,
      top: 10,
      bottom: 10,
      width: 3,
      borderRadius: 2,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    itemContent: { flex: 1, minWidth: 0, gap: 3 },
    itemTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    itemMessage: {
      fontSize: T.sm + 1,
      fontWeight: "600",
      color: C.textPrimary,
      flex: 1,
    },
    itemMessageRead: {
      fontWeight: "400",
      color: C.textSecondary,
    },
    itemDetail: {
      fontSize: T.xs,
      color: C.textSecondary,
      lineHeight: 17,
    },
    itemDetailRead: {
      color: C.textTertiary,
    },
    itemTime: {
      fontSize: 10,
      fontWeight: "500",
      color: C.textTertiary,
    },
    chevronWrap: {
      paddingLeft: 2,
    },

    // Swipe actions
    swipeActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    swipeBtn: {
      width: 52,
      height: "100%" as any,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: R.lg,
      marginLeft: 4,
      gap: 3,
    },
    swipeBtnLabel: {
      fontSize: 9,
      fontWeight: "600",
    },

    // Empty state
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 60,
      gap: 8,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? `${C.teal}14` : `${C.teal}12`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    emptyTitle: {
      fontSize: T.base,
      fontWeight: "700",
      color: C.textPrimary,
      letterSpacing: -0.3,
    },
    emptyDesc: {
      fontSize: T.sm,
      color: C.textTertiary,
      textAlign: "center",
      maxWidth: 240,
      lineHeight: 20,
    },
  });
}
