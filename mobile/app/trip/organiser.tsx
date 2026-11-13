import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChatText, Envelope, Phone, X, type Icon as PhosphorIcon } from "phosphor-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import * as Haptics from "@/services/haptics";
import { R, S, SHEET_BAR_H, T } from "@/constants/theme";

/** Who's looking after this trip, and every way the organiser left of reaching them. */
export default function TripOrganiserScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { C } = useTheme();
  const { trips } = useTrips();
  const trip = trips.find(t => t.id === tripId);
  const org = trip?.organizer;
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); };
  // The organiser is usually on the trip too, so their traveller photo stands in when they have none of their own
  const name = org?.name.trim() ?? "";
  const avatar = org?.avatar || trip?.travelers?.find(t => t.name.trim().toLowerCase() === name.toLowerCase())?.avatar;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  const phone = org?.phone?.trim();
  const email = org?.email?.trim();
  // UK mobiles read better in their usual groups: 07834 338781
  const shownPhone = phone && /^0\d{10}$/.test(phone.replace(/\s+/g, "")) ? phone.replace(/\s+/g, "").replace(/^(\d{5})(\d{6})$/, "$1 $2") : phone;
  const copy = (value: string) => { Clipboard.setStringAsync(value).then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch(() => {}); };
  const details = [
    ...(phone ? [{ label: "Mobile", value: shownPhone!, url: `tel:${phone.replace(/[^\d+]/g, "")}` }] : []),
    ...(email ? [{ label: "Email", value: email, url: `mailto:${email}` }] : []),
  ];
  const ways: { Icon: PhosphorIcon; label: string; value: string; url: string }[] = [
    ...(phone ? [
      { Icon: Phone, label: "Call", value: phone, url: `tel:${phone.replace(/[^\d+]/g, "")}` },
      { Icon: ChatText, label: "Message", value: phone, url: `sms:${phone.replace(/[^\d+]/g, "")}` },
    ] : []),
    ...(email ? [{ Icon: Envelope, label: "Email", value: email, url: `mailto:${email}` }] : []),
  ];
  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerTransparent: true,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close organiser" style={{ padding: S.xs2 }}>
              <X size={20} color={C.textPrimary} weight="bold" />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.who}>
          <Avatar size={88} uri={avatar} initials={initials} />
          <Text style={[styles.name, { color: C.textPrimary }]} accessibilityRole="header">{name}</Text>
          <Text style={[styles.role, { color: C.textSecondary }]}>{["Your organiser", org?.role, org?.company].filter(Boolean).join(", ")}</Text>
        </View>
        {ways.length ? (
          <>
            {/* The quick actions, like a contact card */}
            <View style={styles.actions}>
              {ways.map(({ Icon, label, value, url }) => (
                <Pressable
                  key={label}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(url).catch(() => {}); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} ${name}, ${value}`}
                  style={({ pressed }) => [styles.action, { backgroundColor: C.elevated, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon size={22} color={C.tealText} weight="fill" />
                  <Text style={[styles.actionLabel, { color: C.textPrimary }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {/* The details themselves, to read out or copy into another app */}
            <View style={[styles.card, { backgroundColor: C.elevated }]}>
              {details.map((d, i) => (
                <Pressable
                  key={d.label}
                  onPress={() => { Haptics.selectionAsync(); Linking.openURL(d.url).catch(() => {}); }}
                  onLongPress={() => copy(d.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.label}, ${d.value}`}
                  accessibilityHint="Long press to copy"
                  style={({ pressed }) => [styles.detail, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.detailLabel, { color: C.textSecondary }]}>{d.label}</Text>
                  <Text style={[styles.detailValue, { color: C.tealText }]} numberOfLines={1}>{d.value}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={[styles.none, { color: C.textSecondary }]}>There's no phone number or email for {name.split(" ")[0] || "your organiser"} on this trip yet.</Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: S.md, paddingTop: (Platform.OS === "android" ? 0 : SHEET_BAR_H) + S.md, paddingBottom: S.xl, gap: S.sm },
  who: { alignItems: "center", gap: S["2xs"], marginBottom: S.sm },
  name: { fontSize: 24, lineHeight: 30, fontWeight: T.semibold, textAlign: "center", marginTop: S.xs },
  role: { fontSize: T.base, lineHeight: 22, textAlign: "center" },
  actions: { flexDirection: "row", gap: S.sm },
  action: { flex: 1, alignItems: "center", gap: S.xs, paddingVertical: S.sm2, borderRadius: R.lg },
  actionLabel: { fontSize: T.sm, fontWeight: T.semibold },
  card: { borderRadius: R.xl, marginTop: S.sm },
  detail: { paddingHorizontal: S.md, paddingVertical: S.sm2, gap: 2 },
  detailLabel: { fontSize: T.sm },
  detailValue: { fontSize: T.md, fontWeight: T.medium },
  none: { fontSize: T.base, lineHeight: 22, textAlign: "center" },
});
