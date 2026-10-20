import { Pressable, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { NotificationList } from "@/components/NotificationSheet";
import { useTheme } from "@/context/ThemeContext";
import { T } from "@/constants/theme";

export default function NotificationsScreen() {
  const router = useRouter();
  const { C } = useTheme();
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); };
  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerStyle: { backgroundColor: C.card },
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close notifications">
              <Text style={{ fontSize: T.lg, fontWeight: T.semibold, color: C.tealText }}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <NotificationList onClose={close} />
    </>
  );
}
