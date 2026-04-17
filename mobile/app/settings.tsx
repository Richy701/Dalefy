import { Redirect } from "expo-router";

// Settings lives in the profile tab now — redirect any deep links
export default function SettingsRedirect() {
  return <Redirect href="/(tabs)/profile" />;
}
