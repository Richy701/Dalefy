import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, AccessibilityInfo } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Compass, Globe, CalendarDays, Images, User } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TABS = [
  { name: "index",        Icon: Compass,      label: "Trips"   },
  { name: "destinations", Icon: Globe,        label: "World"   },
  { name: "itinerary",    Icon: CalendarDays, label: "Plan"    },
  { name: "media",        Icon: Images,       label: "Gallery" },
  { name: "profile",      Icon: User,         label: "Me"      },
] as const;

// Each icon button slot width + gap between items
const ITEM_W  = 62; // 58px slot + 4px gap
const BTN_W   = 58; // pressable width (wider to fit label)
const BLOB_W  = 52; // pill indicator width (Material 3 style)
const BLOB_H  = 32; // pill indicator height
const ROW_PAD = 8;

function FloatingTabBar({ state, navigation }: any) {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  // Shared values — animate the blob position & horizontal stretch
  const blobX      = useSharedValue(state.index * ITEM_W);
  const blobScaleX = useSharedValue(1);
  const blobScaleY = useSharedValue(1);

  useEffect(() => {
    const toX = state.index * ITEM_W;

    if (reduceMotion) {
      blobX.value = toX;
      blobScaleX.value = 1;
      blobScaleY.value = 1;
      return;
    }

    // Slide blob with a bouncy spring
    blobX.value = withSpring(toX, {
      damping: 16,
      stiffness: 180,
      mass: 0.6,
    });

    // Liquid squish: briefly stretch wide then snap back
    blobScaleX.value = withSequence(
      withTiming(1.5, { duration: 90 }),
      withSpring(1, { damping: 12, stiffness: 240, mass: 0.5 }),
    );

    // Slight vertical squeeze at the same time (liquid incompressibility)
    blobScaleY.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withSpring(1, { damping: 12, stiffness: 240, mass: 0.5 }),
    );
  }, [state.index, reduceMotion]);

  const blobAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: blobX.value },
      { scaleX: blobScaleX.value },
      { scaleY: blobScaleY.value },
    ],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outerWrap,
        { paddingBottom: insets.bottom > 0 ? insets.bottom - 6 : 16 },
      ]}
    >
      <View style={[styles.pillWrap, {
        backgroundColor: isDark ? "rgba(14,14,18,0.88)" : "rgba(255,255,255,0.92)",
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      }]}>

          <View style={styles.tabRowOuter}>

            {/* Liquid blob — slides & squishes behind icons */}
            <Animated.View style={[styles.blob, blobAnimStyle, {
              backgroundColor: isDark ? `${C.teal}18` : `${C.teal}12`,
              borderColor: isDark ? `${C.teal}30` : `${C.teal}20`,
            }]} />

            {/* Pressable icons (rendered on top of blob) */}
            <View style={styles.tabRow}>
              {state.routes.map((route: any, index: number) => {
                const focused = state.index === index;
                const { Icon } = TABS[index];

                const onPress = () => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    Haptics.selectionAsync();
                    navigation.navigate(route.name);
                  }
                };

                const inactiveColor = isDark
                  ? "rgba(170,170,180,0.55)"
                  : "rgba(80,80,90,0.55)";
                const iconColor = focused ? C.teal : inactiveColor;

                return (
                  <Pressable
                    key={route.key}
                    onPress={onPress}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={TABS[index].label}
                    accessibilityState={{ selected: focused }}
                  >
                    <Icon
                      size={20}
                      color={iconColor}
                      fill={focused ? `${C.teal}30` : "transparent"}
                      strokeWidth={focused ? 2.2 : 1.8}
                    />
                    <Text
                      style={[
                        styles.label,
                        { color: iconColor, fontWeight: focused ? "700" : "500" },
                      ]}
                      numberOfLines={1}
                    >
                      {TABS[index].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

          </View>

      </View>
    </View>
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
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {TABS.map(({ name, label }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarLabel: label,
            tabBarAccessibilityLabel: label,
          }}
        />
      ))}
    </Tabs>
  );
}

const PILL_R = 34;

const styles = StyleSheet.create({
  outerWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  },

  pillWrap: {
    borderRadius: PILL_R,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  // Container for blob + icons — sets the coordinate system
  tabRowOuter: {
    paddingHorizontal: ROW_PAD,
    paddingVertical: ROW_PAD,
  },

  // Animated pill indicator — slides behind icons (Material 3 style)
  blob: {
    position: "absolute",
    top: ROW_PAD,
    left: ROW_PAD + (BTN_W - BLOB_W) / 2,
    width: BLOB_W,
    height: BLOB_H,
    borderRadius: BLOB_H / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Icon row — same padding as tabRowOuter so icons align over blob
  tabRow: {
    flexDirection: "row",
    gap: ITEM_W - BTN_W, // gap between items
  },

  iconBtn: {
    width: BTN_W,
    paddingTop: (BLOB_H - 20) / 2, // center icon within pill height
    paddingBottom: 6,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },

  label: {
    fontSize: 11,
    letterSpacing: 0,
  },
});
