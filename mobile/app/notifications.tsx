import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { NotificationList } from "@/components/NotificationSheet";
import { useTheme } from "@/context/ThemeContext";

export default function NotificationsScreen() {
  const router = useRouter();
  const { C } = useTheme();
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); };
  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          // Glass sheet like Join: the bar and list sit straight on the system material
          headerTransparent: true,
          headerTitleStyle: { color: C.textPrimary },
          headerShadowVisible: false,
          scrollEdgeEffects: { top: "soft", bottom: "hidden", left: "hidden", right: "hidden" },
          headerLeft: () => (
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close notifications" style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <X size={20} color={C.textPrimary} weight="bold" />
            </Pressable>
          ),
        }}
      />
      <NotificationList onClose={close} />
    </>
  );
}
