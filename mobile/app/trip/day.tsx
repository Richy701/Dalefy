import { Redirect, useLocalSearchParams } from "expo-router";

/** Older App Store widgets retain this URL for the lifetime of the activity. */
export default function LegacyTripDay() {
  const { tripId, date } = useLocalSearchParams<{ tripId?: string; date?: string }>();
  if (!tripId) return <Redirect href="/(tabs)" />;
  return <Redirect href={{ pathname: "/trip/[id]", params: { id: tripId, ...(date ? { date } : {}) } }} />;
}
