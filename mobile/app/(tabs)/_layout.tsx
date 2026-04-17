import { Tabs } from "expo-router";
import { Text, StyleSheet, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { Compass, Globe, CalendarDays, Images, User } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from "react-native-reanimated";
import { useEffect } from "react";

const ALL_TABS = [
  { name: "index",        Icon: Compass,      label: "Trips",   visible: true  },
  { name: "destinations", Icon: Globe,         label: "World",   visible: true  },
  { name: "itinerary",    Icon: CalendarDays,  label: "Plan",    visible: false },
  { name: "media",        Icon: Images,        label: "Gallery", visible: false },
  { name: "profile",      Icon: User,          label: "Me",      visible: true  },
] as const;

const TABS = ALL_TABS.filter(t => t.visible);

const EASE = { duration: 250, easing: Easing.out(Easing.cubic) };

function AnimatedTab({ Icon, focused, teal, isDark, label }: {
  Icon: React.ComponentType<any>; focused: boolean; teal: string;
  isDark: boolean; label: string;
}) {
  const lift = useSharedValue(focused ? -3 : 0);
  const opacity = useSharedValue(focused ? 1 : 0.45);

  useEffect(() => {
    lift.value = withTiming(focused ? -3 : 0, EASE);
    opacity.value = withTiming(focused ? 1 : 0.45, EASE);
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
    opacity: opacity.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  const color = focused ? teal : (isDark ? "rgba(170,170,180,1)" : "rgba(80,80,90,1)");

  return (
    <>
      <Animated.View style={iconStyle}>
        <Icon
          size={21}
          color={color}
          fill={focused ? `${teal}30` : "transparent"}
          strokeWidth={focused ? 2.2 : 1.5}
        />
      </Animated.View>
      <Animated.Text
        style={[
          styles.label,
          { color, fontWeight: focused ? "700" : "500" },
          labelStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </>
  );
}

function BottomTabBar({ state, navigation }: any) {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();

  const activeRouteName = state.routes[state.index]?.name;

  return (
    <BlurView
      intensity={60}
      tint={isDark ? "dark" : "light"}
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom || 4,
          backgroundColor: isDark ? "rgba(9,9,11,0.65)" : "rgba(255,255,255,0.7)",
        },
      ]}
    >
      {TABS.map((tab) => {
        const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
        const focused = activeRouteName === tab.name;

        const onPress = () => {
          const route = state.routes[routeIndex];
          if (!route) return;
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            haptic.selection();
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={tab.name}
            onPress={onPress}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
          >
            <AnimatedTab
              Icon={tab.Icon}
              focused={focused}
              teal={C.teal}
              isDark={isDark}
              label={tab.label}
            />
          </Pressable>
        );
      })}
    </BlurView>
  );
}

export default function TabLayout() {
  const { C } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: C.bg },
      }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      {ALL_TABS.map(({ name, label, visible }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarLabel: label,
            tabBarAccessibilityLabel: label,
            href: visible ? undefined : null,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    paddingTop: 6,
  },

  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    gap: 3,
  },

  label: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
});
