import { useMemo, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import ContextMenu from "@/components/ContextMenu";
import { Bell, Trash2, Plane, PlaneLanding, PlaneTakeoff, AlertTriangle, Hotel, Utensils, CalendarDays, Car } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { useHaptic } from "@/hooks/useHaptic";
import { T, R, S, type ThemeColors } from "@/constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NotificationSheet({ visible, onClose }: Props) {
  const { C, isDark } = useTheme();
  const { notifications, unreadCount, markRead, markAllRead, removeNotification, clearAll } = useNotifications();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const haptic = useHaptic();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Native drag indicator */}
        <View style={styles.dragBar} />

        {/* Header */}
        <View style={styles.header}>
          {/* Left actions */}
          <View style={styles.headerSide}>
            {unreadCount > 0 && (
              <Pressable
                onPress={() => { haptic.light(); markAllRead(); }}
                style={({ pressed }) => [styles.headerTextBtn, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
              >
                <Text style={styles.headerTextBtnLabel}>Read All</Text>
              </Pressable>
            )}
            {notifications.length > 0 && unreadCount === 0 && (
              <Pressable
                onPress={() => { haptic.light(); clearAll(); }}
                style={({ pressed }) => [styles.headerTextBtn, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Clear all"
              >
                <Text style={[styles.headerTextBtnLabel, { color: C.textTertiary }]}>Clear</Text>
              </Pressable>
            )}
          </View>

          {/* Centered title */}
          <Text style={styles.headerTitle}>Notifications</Text>

          {/* Done button */}
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

        {/* List */}
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {notifications.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Bell size={32} color={C.textDim} strokeWidth={1.2} />
              </View>
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptyDesc}>
                Trip updates and alerts will appear here.
              </Text>
            </View>
          ) : (
            notifications.map(n => (
              <NotificationRow
                key={n.id}
                notification={n}
                C={C}
                styles={styles}
                onMarkRead={() => { haptic.light(); markRead(n.id); }}
                onRemove={() => { haptic.medium(); removeNotification(n.id); }}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ── Icon picker — uses type first, falls back to message content for old notifications ── */

function NotificationIcon({ n, C }: { n: { type: string; message: string }; C: ThemeColors }) {
  const msg = n.message.toLowerCase();
  if (n.type === "warning" || msg.includes("cancelled") || msg.includes("delayed")) return <AlertTriangle size={16} color={C.amber} strokeWidth={1.8} />;
  if (n.type === "landed" || msg.includes("landed")) return <PlaneLanding size={16} color={C.teal} strokeWidth={1.8} />;
  if (n.type === "boarding" || msg.includes("boarding")) return <PlaneTakeoff size={16} color={C.teal} strokeWidth={1.8} />;
  if (n.type === "flight" || msg.includes("flight") || msg.includes("gate") || msg.includes("terminal")) return <Plane size={16} color={C.teal} strokeWidth={1.8} />;
  if (n.type === "hotel" || msg.includes("hotel") || msg.includes("check-in")) return <Hotel size={16} color={C.teal} strokeWidth={1.8} />;
  if (n.type === "dining" || msg.includes("dining") || msg.includes("restaurant")) return <Utensils size={16} color={C.teal} strokeWidth={1.8} />;
  if (n.type === "transfer" || msg.includes("transfer") || msg.includes("pickup")) return <Car size={16} color={C.teal} strokeWidth={1.8} />;
  if (n.type === "activity") return <CalendarDays size={16} color={C.teal} strokeWidth={1.8} />;
  if (msg.includes("update") || msg.includes("vs") || msg.includes("ba") || msg.includes("depart")) return <Plane size={16} color={C.teal} strokeWidth={1.8} />;
  return <Bell size={16} color={C.teal} strokeWidth={1.8} />;
}

/* ── Swipeable notification row ── */

interface RowProps {
  notification: { id: string; message: string; detail: string; time: string; read: boolean; type: string };
  C: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onMarkRead: () => void;
  onRemove: () => void;
}

function NotificationRow({ notification: n, C, styles, onMarkRead, onRemove }: RowProps) {
  const swipeRef = useRef<Swipeable>(null);

  const actionWidth = n.read ? 56 : 112;
  const renderRightActions = useCallback(() => {
    return (
      <View style={[styles.swipeActions, { width: actionWidth }]}>
        {!n.read && (
          <Pressable
            style={[styles.swipeBtn, { backgroundColor: C.teal }]}
            onPress={() => { swipeRef.current?.close(); onMarkRead(); }}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#000", textTransform: "uppercase", letterSpacing: 0.5 }}>Read</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.swipeBtn, { backgroundColor: C.red }]}
          onPress={() => { swipeRef.current?.close(); onRemove(); }}
        >
          <Trash2 size={16} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
    );
  }, [n.read, C, styles, onMarkRead, onRemove, actionWidth]);

  const contextActions = [
    ...(!n.read ? [{ title: "Mark as Read", systemIcon: "checkmark.circle" }] : []),
    { title: "Delete", systemIcon: "trash", destructive: true },
  ];

  const handleContextAction = useCallback((e: any) => {
    const action = e.nativeEvent.name;
    if (action === "Mark as Read") onMarkRead();
    if (action === "Delete") onRemove();
  }, [onMarkRead, onRemove]);

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      friction={2}
    >
      <ContextMenu
        actions={contextActions}
        onPress={handleContextAction}
        previewBackgroundColor="transparent"
      >
        <Pressable
          onPress={!n.read ? onMarkRead : undefined}
          style={({ pressed }) => [
            styles.item,
            !n.read && styles.itemUnread,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={styles.itemRow}>
            <View style={styles.iconWrap}>
              <NotificationIcon n={n} C={C} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemMessage, n.read && styles.itemMessageRead]}>{n.message}</Text>
              <Text style={styles.itemDetail} numberOfLines={2}>{n.detail}</Text>
            </View>
            <Text style={styles.itemTime}>{n.time}</Text>
          </View>
        </Pressable>
      </ContextMenu>
    </Swipeable>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    // Native drag indicator
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
      color: C.teal,
      letterSpacing: -0.2,
      textAlign: "center",
      flex: 1,
    },
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 20,
    },
    headerTextBtn: {
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    headerTextBtnLabel: {
      fontSize: T.xs,
      fontWeight: "600",
      color: C.teal,
    },
    doneText: {
      fontSize: T.base,
      fontWeight: "600",
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

    // List
    list: { paddingHorizontal: S.xs, paddingBottom: 40 },

    // Notification item
    item: {
      paddingHorizontal: S.md,
      paddingVertical: 14,
      borderRadius: R.lg,
      backgroundColor: C.bg,
    },
    itemUnread: {
      backgroundColor: `${C.teal}08`,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    iconWrap: { width: 20, alignItems: "center" as const, marginTop: 2 },
    itemContent: { flex: 1, minWidth: 0 },
    itemMessage: {
      fontSize: T.sm,
      fontWeight: "600",
      color: C.textPrimary,
      marginBottom: 3,
    },
    itemMessageRead: {
      fontWeight: "400",
      color: C.textSecondary,
    },
    itemDetail: {
      fontSize: T.xs,
      color: C.textTertiary,
      lineHeight: 17,
    },
    itemTime: {
      fontSize: 10,
      fontWeight: "600",
      color: C.textTertiary,
      marginTop: 2,
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
    },

    // Empty state
    emptyWrap: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 100,
      gap: 12,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: C.elevated,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: {
      fontSize: T.lg,
      fontWeight: "700",
      color: C.textSecondary,
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
