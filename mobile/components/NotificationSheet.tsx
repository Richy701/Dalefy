import { useMemo, useRef, useCallback } from "react";
import {
  View, Text, SectionList, Pressable, StyleSheet, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { Animated } from "react-native";
import { useRouter } from "expo-router";
import ContextMenu from "@/components/ContextMenu";
import {
  Bell, Trash, AirplaneLanding, AirplaneTakeoff,
  Warning, Bed, ForkKnife, CalendarDots, Car, Check,
  CheckCircle,
} from "phosphor-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { useHaptic } from "@/hooks/useHaptic";
import { T, R, S, SHEET_BAR_H, categoryTone, type ThemeColors } from "@/constants/theme";
import { SymbolView } from "expo-symbols";
import { PlaneIcon } from "@/components/ui/PlaneIcon";
import type { Notification } from "@/shared/types";

const ON_RED = "#fff";

interface Props {
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

function getNotifIcon(n: { type: string; message: string }) {
  const msg = n.message.toLowerCase();

  if (n.type === "warning" || msg.includes("cancelled") || msg.includes("delayed"))
    return Warning;
  if (n.type === "landed" || msg.includes("landed"))
    return AirplaneLanding;
  if (n.type === "boarding" || msg.includes("boarding"))
    return AirplaneTakeoff;
  if (n.type === "flight" || msg.includes("flight") || msg.includes("gate") || msg.includes("terminal"))
    return PlaneIcon;
  if (n.type === "hotel" || msg.includes("hotel") || msg.includes("check-in"))
    return Bed;
  if (n.type === "dining" || msg.includes("dining") || msg.includes("restaurant"))
    return ForkKnife;
  if (n.type === "transfer" || msg.includes("transfer") || msg.includes("pickup"))
    return Car;
  if (n.type === "activity")
    return CalendarDots;
  if (n.type === "success")
    return CheckCircle;
  if (msg.includes("update") || msg.includes("vs") || msg.includes("ba") || msg.includes("depart"))
    return PlaneIcon;
  return Bell;
}

/** Circle colours: the itinerary's category tones, red for problems, teal for everything else */
function getNotifTone(n: { type: string; message: string }, Icon: React.ComponentType<any>, C: ThemeColors) {
  if (Icon === Warning) return { fg: C.redText, bg: C.redDim };
  if (Icon === PlaneIcon || Icon === AirplaneLanding || Icon === AirplaneTakeoff) return categoryTone("flight", C);
  if (Icon === Bed) return categoryTone("hotel", C);
  if (Icon === ForkKnife) return categoryTone("dining", C);
  if (Icon === Car) return categoryTone("transfer", C);
  if (Icon === CalendarDots) return categoryTone("activity", C);
  return { fg: C.tealText, bg: C.tealDim };
}

/* ── Main sheet ── */

/** Notification centre body; app/notifications.tsx presents it in a native sheet with a Done button. */
export function NotificationList({ onClose }: Props) {
  const { C } = useTheme();
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead, removeNotification, clearAll } = useNotifications();
  const styles = useMemo(() => makeStyles(C), [C]);
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
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safe, { paddingTop: Platform.OS === "ios" ? SHEET_BAR_H : 0 }]} edges={["bottom"]}>
        {notifications.length > 0 && (
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </Text>
            <Pressable
              onPress={() => { haptic.light(); unreadCount > 0 ? markAllRead() : clearAll(); }}
              style={({ pressed }) => [styles.headerTextBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? "Mark all read" : "Clear all notifications"}
            >
              <Text style={styles.readAllLabel}>{unreadCount > 0 ? "Mark all read" : "Clear all"}</Text>
            </Pressable>
          </View>
        )}

        {/* Grouped list */}
        {notifications.length === 0 ? (
          <View style={styles.emptyWrap}>
            {/* Apple's empty-screen shape: one large grey symbol, a plain title, one line */}
            {Platform.OS === "ios"
              ? <SymbolView name="bell" size={52} tintColor={C.textTertiary} weight="regular" style={{ width: 52, height: 52 }} />
              : <Bell size={52} color={C.textTertiary} weight="regular" />}
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyText}>Updates from your organiser and trip reminders will show up here.</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={n => n.id}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{section.label}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <NotificationRow
                notification={item}
                C={C}
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
  );
}

/* ── Swipeable notification row ── */

interface RowProps {
  notification: Notification;
  C: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  onMarkRead: () => void;
  onRemove: () => void;
}

function NotificationRow({ notification: n, C, styles, onPress, onMarkRead, onRemove }: RowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const Icon = getNotifIcon(n);
  const tone = getNotifTone(n, Icon, C);
  const navigable = n.tripId != null;

  const actionWidth = n.read ? 56 : 112;
  // Rows are see-through on the glass sheet, so the actions only appear once a swipe starts
  const renderRightActions = useCallback((progress: Animated.AnimatedInterpolation<number>) => {
    const opacity = progress.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 1, 1] });
    return (
      <Animated.View style={[styles.swipeActions, { width: actionWidth, opacity }]}>
        {!n.read && (
          <Pressable
            style={[styles.swipeBtn, { backgroundColor: C.toggleTrack }]}
            onPress={() => { swipeRef.current?.close(); onMarkRead(); }}
            accessibilityRole="button"
            accessibilityLabel="Mark read"
          >
            <Check size={16} color={C.textPrimary} weight="bold" />
            <Text style={[styles.swipeBtnLabel, { color: C.textPrimary }]}>Mark read</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.swipeBtn, { backgroundColor: C.red }]}
          onPress={() => { swipeRef.current?.close(); onRemove(); }}
          accessibilityRole="button"
          accessibilityLabel="Delete notification"
        >
          <Trash size={16} color={ON_RED} weight="regular" />
          <Text style={[styles.swipeBtnLabel, { color: ON_RED }]}>Delete</Text>
        </Pressable>
      </Animated.View>
    );
  }, [n.read, C, styles, onMarkRead, onRemove, actionWidth]);

  const contextActions = [
    ...(!n.read ? [{ title: "Mark read", systemIcon: "checkmark.circle" }] : []),
    ...(navigable ? [{ title: "View Trip", systemIcon: "airplane" }] : []),
    { title: "Delete", systemIcon: "trash", destructive: true },
  ];

  const handleContextAction = useCallback((e: any) => {
    const action = e.nativeEvent.name;
    if (action === "Mark read") onMarkRead();
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
            accessibilityRole="button"
            accessibilityLabel={`${n.read ? "" : "Unread, "}${n.detail ? `${n.message}. ${n.detail}` : n.message}`}
            // Swipe and long-press have VoiceOver equivalents
            accessibilityActions={[
              ...(!n.read ? [{ name: "markRead", label: "Mark read" }] : []),
              { name: "delete", label: "Delete" },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "markRead") onMarkRead();
              if (e.nativeEvent.actionName === "delete") onRemove();
            }}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.itemPressed,
            ]}
          >
            {/* iOS notification shape: coloured circle, title with the time on the right, detail underneath */}
            <View style={styles.itemRow}>
              <View style={[styles.iconWrap, { backgroundColor: tone.bg }, n.read && { opacity: 0.6 }]}>
                <Icon size={18} color={tone.fg} weight="fill" />
              </View>

              <View style={styles.itemContent}>
                <View style={styles.itemTitleRow}>
                  <Text
                    style={[styles.itemMessage, n.read && styles.itemMessageRead]}
                    numberOfLines={2}
                  >
                    {n.message}
                  </Text>
                  {!!n.time && <Text style={styles.itemTime}>{n.time}</Text>}
                </View>
                {!!n.detail && (
                  <Text style={[styles.itemDetail, n.read && styles.itemDetailRead]} numberOfLines={3}>
                    {n.detail}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        </ContextMenu>
      </View>
    </Swipeable>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: "transparent", overflow: "hidden" as const },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: S.lg,
      paddingTop: S.md,
      paddingBottom: S.xs,
    },
    headerTitle: {
      fontSize: T["3xl"],
      fontWeight: T.bold,
      color: C.textPrimary,
      letterSpacing: -0.7,
      flex: 1,
    },
    headerTextBtn: {
      minHeight: 44,
      minWidth: 44,
      justifyContent: "center",
      alignItems: "flex-end",
    },
    readAllLabel: {
      fontSize: 14,
      fontWeight: T.medium,
      color: C.textPrimary,
    },
    doneText: {
      fontSize: T.base,
      fontWeight: T.bold,
      color: C.tealText,
    },

    // Count subtitle
    countRow: {
      paddingHorizontal: S.lg,
      paddingBottom: S.xs,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    countText: {
      fontSize: 14,
      fontWeight: T.regular,
      color: C.textSecondary,
    },

    // Section headers
    sectionTitle: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2 },
    sectionHeader: {
      paddingHorizontal: 0,
      paddingTop: S.md,
      paddingBottom: S.xs2,
    },

    // List
    list: { paddingHorizontal: S.lg, paddingBottom: S["2xl"] },

    // Swipe container
    swipeContainer: {
      overflow: "hidden" as const,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },

    // Row base, see-through on the glass sheet
    itemOpaqueBase: {
      overflow: "hidden" as const,
    },

    // Notification item
    item: {
      position: "relative" as const,
      paddingHorizontal: 0,
      paddingVertical: S.md,
    },
    itemPressed: {
      backgroundColor: C.elevated,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: S.sm2,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    itemContent: { flex: 1, minWidth: 0, gap: 3 },
    itemTitleRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: S.sm,
    },
    itemMessage: {
      fontSize: T.base,
      lineHeight: 21,
      fontWeight: T.semibold,
      color: C.textPrimary,
      flex: 1,
    },
    itemMessageRead: {
      fontWeight: T.regular,
      color: C.textSecondary,
    },
    itemDetail: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 20,
    },
    itemDetailRead: {
      color: C.textTertiary,
    },
    itemTime: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: C.textTertiary,
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
      marginLeft: S["2xs"],
      gap: 3,
    },
    swipeBtnLabel: {
      fontSize: T["2xs"],
      fontWeight: T.semibold,
    },

    // Empty state
    emptyTitle: { fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary, textAlign: "center", marginTop: S.sm },
    emptyText: { fontSize: T.base, color: C.textSecondary, textAlign: "center", lineHeight: 21 },
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: S.xs,
      paddingHorizontal: S.xl,
      // A little above centre so it doesn't drift on the tall sheet
      paddingBottom: "18%",
    },
  });
}
