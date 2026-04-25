import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

const TABS: {
  name: string;
  label: string;
  materialIcon: keyof typeof MaterialIcons.glyphMap;
  hidden?: boolean;
}[] = [
  { name: "index",        label: "Home",    materialIcon: "home"         },
  { name: "destinations", label: "World",   materialIcon: "public"       },
  { name: "itinerary",    label: "Plan",    materialIcon: "event",        hidden: true },
  { name: "media",        label: "Gallery", materialIcon: "photo-camera" },
  { name: "profile",      label: "Me",      materialIcon: "person"       },
];

// iOS: use NativeTabs for liquid glass + SF Symbols
function IOSTabLayout() {
  const { NativeTabs } = require("expo-router/unstable-native-tabs");
  const { C, isDark } = useTheme();

  const sfIcons: Record<string, string> = {
    index: "house.fill",
    destinations: "map.fill",
    itinerary: "calendar",
    media: "camera.fill",
    profile: "person.crop.circle",
  };
  const mdIcons: Record<string, string> = {
    index: "home",
    destinations: "public",
    itinerary: "event",
    media: "photo_camera",
    profile: "person",
  };

  return (
    <NativeTabs
      tintColor={C.teal}
      iconColor={{
        default: isDark ? "rgba(170,170,180,0.6)" : "rgba(80,80,90,0.6)",
        selected: C.teal,
      }}
      labelStyle={{
        default: { color: isDark ? "rgba(170,170,180,0.6)" : "rgba(80,80,90,0.6)" },
        selected: { color: C.teal },
      }}
      sceneContainerStyle={{ backgroundColor: C.bg }}
      screenOptions={{
        contentStyle: { backgroundColor: C.bg },
        headerShown: false,
      }}
    >
      {TABS.map(({ name, label, hidden }) => (
        <NativeTabs.Trigger key={name} name={name} hidden={hidden}>
          <NativeTabs.Trigger.Icon sf={sfIcons[name]} md={mdIcons[name]} />
          <NativeTabs.Trigger.Label>{label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

// Android: standard Tabs with solid Material-style bar
function AndroidTabLayout() {
  const { C, isDark } = useTheme();
  const insets = require("react-native-safe-area-context").useSafeAreaInsets();
  const inactiveColor = isDark ? "rgba(170,170,180,0.6)" : "rgba(80,80,90,0.6)";
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.teal,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: 1,
          elevation: 8,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        sceneStyle: { backgroundColor: C.card },
      }}
    >
      {TABS.map(({ name, label, materialIcon, hidden }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: label,
            href: hidden ? null : undefined,
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name={materialIcon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  return Platform.OS === "ios" ? <IOSTabLayout /> : <AndroidTabLayout />;
}
