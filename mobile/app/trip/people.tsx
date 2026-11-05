import { useMemo } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "phosphor-react-native";
import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
import { S, SHEET_BAR_H, T } from "@/constants/theme";

const PHOTO = 84;

/** Who's on the trip: everyone's photo and name, nothing else. The server only sends those to the app. */
export default function TripPeopleScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { C } = useTheme();
  const { trips } = useTrips();
  const insets = useSafeAreaInsets();
  const me = useLinkedTravelerId(tripId);
  const travellers = trips.find(t => t.id === tripId)?.travelers;
  // You first, then faces, as on the trip page, then by name so someone can be found
  const people = useMemo(() => [...(travellers ?? [])].sort((a, b) =>
    Number(b.id === me) - Number(a.id === me)
    || Number(!!b.avatar) - Number(!!a.avatar)
    || a.name.localeCompare(b.name)), [travellers, me]);
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); };
  return (
    <>
      <Stack.Screen
        options={{
          title: `${people.length} traveller${people.length === 1 ? "" : "s"}`,
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
});
