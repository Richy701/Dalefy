import { Stack } from "expo-router";
import { useTheme } from "@/context/ThemeContext";

export default function TabStackLayout() {
  const { C } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
