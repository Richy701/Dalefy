import { Tabs } from "expo-router";
import { View, StyleSheet, Platform } from "react-native"; // StyleSheet used for absoluteFill
import { Compass, Globe, CalendarDays, Images, User } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";

function TabBarBg() {
  const { C, isDark } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />
      {/* Border only in light mode — dark mode shares same bg, no separator needed */}
      {!isDark && (
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: C.border,
        }} />
      )}
    </View>
  );
}

const TABS = [
  { name: "index",        Icon: Compass,      label: "Home",  hint: "Explore your trips"        },
  { name: "destinations", Icon: Globe,        label: "World", hint: "Browse destinations"        },
  { name: "itinerary",    Icon: CalendarDays, label: "Plan",  hint: "View your itinerary"        },
  { name: "media",        Icon: Images,       label: "Media", hint: "Browse photos and videos"   },
  { name: "profile",      Icon: User,         label: "Me",    hint: "Your profile and settings"  },
] as const;

export default function TabLayout() {
  const { C } = useTheme();

  // Inactive uses textSecondary (not textTertiary) to meet 3:1 contrast on dark bg
  const inactive = C.textSecondary;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.teal,
        tabBarInactiveTintColor: inactive,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.1,
          marginTop: -3,
        },
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 82 : 62,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => <TabBarBg />,
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map(({ name, Icon, label, hint }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarLabel: label,
            tabBarAccessibilityLabel: label,
            tabBarIcon: ({ focused, color }) => (
              <View
                style={styles.iconWrap}
                accessible={false}
              >
                {/* Stable pill — always present, transparent when inactive → no layout shift */}
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: focused ? C.tealDim : "transparent" },
                  ]}
                >
                  <Icon
                    size={21}
                    color={color}
                    strokeWidth={focused ? 2 : 1.5}
                  />
                </View>
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44,
    height: 44,   // meets Apple HIG 44×44pt touch target minimum
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    width: 40,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
