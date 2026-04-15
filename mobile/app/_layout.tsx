import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { TripsProvider } from "@/context/TripsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";

function AppStack() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <TripsProvider>
        <AppStack />
      </TripsProvider>
    </ThemeProvider>
  );
}
