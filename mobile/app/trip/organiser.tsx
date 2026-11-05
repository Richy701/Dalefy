import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
          title: "Your organiser",
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
          <Avatar size={112} uri={avatar} initials={initials} />
          <Text style={[styles.name, { color: C.textPrimary }]} accessibilityRole="header">{name}</Text>
          {org?.role || org?.company ? <Text style={[styles.role, { color: C.textSecondary }]}>{[org.role, org.company].filter(Boolean).join(", ")}</Text> : null}
        </View>
        {ways.length ? ways.map(({ Icon, label, value, url }) => (
          <Pressable
            key={label}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(url).catch(() => {}); }}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${name}, ${value}`}
            style={({ pressed }) => [styles.way, { backgroundColor: C.elevated, opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon size={22} color={C.tealText} weight="fill" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.wayLabel, { color: C.textPrimary }]}>{label}</Text>
              <Text style={[styles.wayValue, { color: C.textSecondary }]} numberOfLines={1}>{value}</Text>
            </View>
          </Pressable>
        )) : (
          <Text style={[styles.none, { color: C.textSecondary }]}>There's no phone number or email for {name.split(" ")[0] || "your organiser"} on this trip yet.</Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: S.md, paddingTop: (Platform.OS === "android" ? 0 : SHEET_BAR_H) + S.md, paddingBottom: S.xl, gap: S.sm },
  who: { alignItems: "center", gap: S.xs, marginBottom: S.md },
  name: { fontSize: 24, lineHeight: 30, fontWeight: T.semibold, textAlign: "center", marginTop: S.xs },
  role: { fontSize: T.base, lineHeight: 22, textAlign: "center" },
  way: { flexDirection: "row", alignItems: "center", gap: S.sm2, minHeight: 60, paddingHorizontal: S.md, paddingVertical: S.sm, borderRadius: R.xl },
  wayLabel: { fontSize: T.md, fontWeight: T.semibold },
  wayValue: { fontSize: T.sm, marginTop: 1 },
  none: { fontSize: T.base, lineHeight: 22, textAlign: "center" },
});
