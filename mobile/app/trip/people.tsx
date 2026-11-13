import { useMemo } from "react";
import { FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Phone, EnvelopeSimple, CaretRight } from "phosphor-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
import * as Haptics from "@/services/haptics";
import { R, S, SHEET_BAR_H, T } from "@/constants/theme";

const PHOTO = 84;

/** Who's on the trip: the organiser first, with ways to reach them, then everyone's photo and name. The server only sends those to the app. */
export default function TripPeopleScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { C } = useTheme();
  const { trips } = useTrips();
  const insets = useSafeAreaInsets();
  const me = useLinkedTravelerId(tripId);
  const trip = trips.find(t => t.id === tripId);
  const travellers = trip?.travelers;
  const orgName = trip?.organizer?.name?.trim() ?? "";
  const sameName = (name: string) => !!orgName && name.trim().toLowerCase() === orgName.toLowerCase();
  // The organiser is usually on the trip too; their traveller photo stands in when they have none of their own
  const organiser = orgName ? {
    ...trip!.organizer!,
    avatar: trip!.organizer!.avatar || travellers?.find(t => sameName(t.name))?.avatar,
  } : null;
  // You first, then faces, as on the trip page, then by name so someone can be found. The organiser has their own card above.
  const people = useMemo(() => [...(travellers ?? [])].filter(t => !sameName(t.name)).sort((a, b) =>
    Number(b.id === me) - Number(a.id === me)
    || Number(!!b.avatar) - Number(!!a.avatar)
    || a.name.localeCompare(b.name)),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sameName only reads orgName
  [travellers, me, orgName]);
  const phone = organiser?.phone?.trim() ?? "";
  const email = organiser?.email?.trim() ?? "";
  const initials = orgName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); };

  const header = organiser ? (
    <View style={styles.header}>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); router.push({ pathname: "/trip/organiser", params: { tripId } }); }}
        accessibilityRole="button"
        accessibilityLabel={`${orgName}, your organiser`}
        accessibilityHint="Shows their details"
        style={({ pressed }) => [styles.orgCard, { backgroundColor: C.elevated, opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={styles.orgTop}>
          <Avatar size={64} uri={organiser.avatar} initials={initials} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[styles.orgLabel, { color: C.tealText }]}>Your organiser</Text>
            <Text style={[styles.orgName, { color: C.textPrimary }]} numberOfLines={1}>{orgName}</Text>
            {organiser.company?.trim() || organiser.role?.trim() ? (
              <Text style={{ fontSize: T.sm, color: C.textSecondary }} numberOfLines={1}>{[organiser.role?.trim(), organiser.company?.trim()].filter(Boolean).join(", ")}</Text>
            ) : null}
          </View>
          <CaretRight size={14} color={C.textTertiary} weight="regular" />
        </View>
        {phone || email ? (
          <View style={styles.actions}>
            {phone ? (
              <Pressable
                onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => {}); }}
                accessibilityRole="button"
                accessibilityLabel={`Call ${orgName}`}
                style={({ pressed }) => [styles.action, { backgroundColor: C.card, opacity: pressed ? 0.7 : 1 }]}
              >
                <Phone size={16} color={C.textPrimary} weight="fill" />
                <Text style={[styles.actionText, { color: C.textPrimary }]}>Call</Text>
              </Pressable>
            ) : null}
            {email ? (
              <Pressable
                onPress={() => { Haptics.selectionAsync(); Linking.openURL(`mailto:${email}`).catch(() => {}); }}
                accessibilityRole="button"
                accessibilityLabel={`Email ${orgName}`}
                style={({ pressed }) => [styles.action, { backgroundColor: C.card, opacity: pressed ? 0.7 : 1 }]}
              >
                <EnvelopeSimple size={16} color={C.textPrimary} weight="fill" />
                <Text style={[styles.actionText, { color: C.textPrimary }]}>Email</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Pressable>
      {people.length > 0 ? (
        <Text style={[styles.section, { color: C.textPrimary }]}>
          Travellers <Text style={{ color: C.textTertiary, fontWeight: T.regular }}>{people.length}</Text>
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: organiser ? "Who's going" : `${people.length} traveller${people.length === 1 ? "" : "s"}`,
          headerTransparent: true,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close travellers" style={{ padding: S.xs2 }}>
              <X size={20} color={C.textPrimary} weight="bold" />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={people}
        keyExtractor={person => person.id}
        numColumns={3}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header ?? undefined}
        contentContainerStyle={[styles.grid, { paddingTop: (Platform.OS === "android" ? 0 : SHEET_BAR_H) + S.md, paddingBottom: insets.bottom + S.lg }]}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <View style={styles.person} accessible accessibilityLabel={item.id === me ? `${item.name}, you` : item.name}>
            <Avatar size={PHOTO} uri={item.avatar} initials={item.initials} />
            <Text style={[styles.name, { color: C.textPrimary }]} numberOfLines={2}>{item.name}</Text>
            {item.id === me ? <Text style={[styles.you, { color: C.textSecondary }]}>You</Text> : null}
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: S.md, gap: S.lg },
  row: { gap: S.sm },
  person: { flex: 1 / 3, alignItems: "center", gap: S.xs },
  name: { fontSize: T.sm, fontWeight: T.medium, lineHeight: 18, textAlign: "center" },
  you: { fontSize: T.xs, marginTop: -4 },
  header: { gap: S.lg },
  orgCard: { borderRadius: R.xl, padding: S.md, gap: S.md },
  orgTop: { flexDirection: "row", alignItems: "center", gap: S.sm2 },
  orgLabel: { fontSize: T.xs, fontWeight: T.semibold },
  orgName: { fontSize: T.lg, fontWeight: T.semibold, letterSpacing: -0.2 },
  actions: { flexDirection: "row", gap: S.sm },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs, paddingVertical: S.sm2, borderRadius: R.lg },
  actionText: { fontSize: T.base, fontWeight: T.semibold },
  section: { fontSize: T.lg, fontWeight: T.semibold, letterSpacing: -0.2 },
});
