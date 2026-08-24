import { Platform, Text, Pressable } from "react-native";
import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";

const TABS: {
  name: string;
  label: string;
  materialIcon: keyof typeof MaterialIcons.glyphMap;
  hidden?: boolean;
}[] = [
  { name: "index",        label: "Home",         materialIcon: "home"         },
  { name: "destinations", label: "Today",        materialIcon: "today"        },
  { name: "itinerary",    label: "Schedule",     materialIcon: "event",        hidden: true },
  { name: "media",        label: "Gallery",      materialIcon: "photo-camera" },
  { name: "profile",      label: "Profile",      materialIcon: "person"       },
];

// iOS: use NativeTabs for liquid glass + SF Symbols
function IOSTabLayout() {
  const { NativeTabs } = require("expo-router/unstable-native-tabs");
  const { C } = useTheme();

  const sfIcons: Record<string, string> = {
    index: "house",
    destinations: "clock",
    itinerary: "calendar",
    media: "camera",
    profile: "person.crop.circle",
  };
  const mdIcons: Record<string, string> = {
    index: "home",
    destinations: "today",
    itinerary: "event",
    media: "photo_camera",
    profile: "person",
  };

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      tintColor={C.teal}
      iconColor={{
        default: C.textTertiary,
        selected: C.teal,
      }}
      labelStyle={{
        default: { color: C.textTertiary, fontWeight: "500" },
        selected: { color: C.teal, fontWeight: "700" },
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
function HapticTabButton(props: any) {
  return (
    <Pressable
      {...props}
      onPress={(e) => {
        Haptics.selectionAsync();
        props.onPress?.(e);
      }}
    />
  );
}

function AndroidTabLayout() {
  const { C } = useTheme();
  const insets = require("react-native-safe-area-context").useSafeAreaInsets();
  const inactiveColor = C.textTertiary;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.teal,
        tabBarInactiveTintColor: inactiveColor,
        tabBarButton: (props) => <HapticTabButton {...props} />,
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
        sceneStyle: { backgroundColor: C.bg },
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
            tabBarLabel: ({ focused, color }) => (
              <Text style={{ fontSize: 11, fontWeight: focused ? "700" : "500", color }}>{label}</Text>
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
