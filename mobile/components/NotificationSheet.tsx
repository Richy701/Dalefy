import { useMemo } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Bell, CheckCheck, Trash2 } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NotificationSheet({ visible, onClose }: Props) {
  const { C, isDark } = useTheme();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Bell size={16} color={C.teal} strokeWidth={2} />
            <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
              >
                <CheckCheck size={14} color={C.teal} strokeWidth={2} />
              </Pressable>
            )}
            {notifications.length > 0 && (
              <Pressable
                onPress={clearAll}
                style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Clear all notifications"
              >
                <Trash2 size={14} color={C.textTertiary} strokeWidth={2} />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
            >
              <X size={18} color={C.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        {/* List */}
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {notifications.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Bell size={40} color={C.border} strokeWidth={1.2} />
              <Text style={styles.emptyTitle}>All quiet for now</Text>
              <Text style={styles.emptyDesc}>
                Trip updates, itinerary changes, and alerts will land here.
              </Text>
            </View>
          ) : (
            notifications.map(n => (
              <Pressable
                key={n.id}
                onPress={() => markRead(n.id)}
                style={({ pressed }) => [
                  styles.item,
                  !n.read && styles.itemUnread,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <View style={styles.itemRow}>
                  {!n.read && <View style={styles.dot} />}
                  <View style={[styles.itemContent, n.read && { marginLeft: 14 }]}>
                    <Text style={styles.itemMessage}>{n.message}</Text>
                    <Text style={styles.itemDetail} numberOfLines={2}>{n.detail}</Text>
                  </View>
                  <Text style={styles.itemTime}>{n.time}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, paddingVertical: S.sm,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: {
      fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: 1.5, textTransform: "uppercase",
    },
    badge: {
      backgroundColor: C.teal, borderRadius: R.full,
      paddingHorizontal: 7, paddingVertical: 2,
    },
    badgeText: { fontSize: 10, fontWeight: T.bold, color: "#000" },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    headerAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    closeBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: isDark ? C.elevated : "#f1f5f9",
      alignItems: "center", justifyContent: "center",
    },

    list: { padding: S.sm, paddingBottom: 40 },

    item: {
      paddingHorizontal: S.sm, paddingVertical: S.sm,
      borderRadius: R.lg, marginBottom: 4,
    },
    itemUnread: {
      backgroundColor: `${C.teal}08`,
    },
    itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    dot: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: C.teal, marginTop: 4,
    },
    itemContent: { flex: 1, minWidth: 0 },
    itemMessage: {
      fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary,
      marginBottom: 2,
    },
    itemDetail: {
      fontSize: T.xs, color: C.textTertiary, lineHeight: 16,
    },
    itemTime: {
      fontSize: 10, fontWeight: T.bold, color: C.textTertiary,
      letterSpacing: 0.8, textTransform: "uppercase",
    },

    emptyWrap: {
      alignItems: "center", justifyContent: "center",
      paddingTop: 80, gap: 12,
    },
    emptyTitle: {
      fontSize: T.lg, fontWeight: T.bold, color: C.textSecondary,
      letterSpacing: -0.3,
    },
    emptyDesc: {
      fontSize: T.sm, color: C.textTertiary, textAlign: "center",
      maxWidth: 240,
    },
  });
}
