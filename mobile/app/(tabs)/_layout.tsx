import { Tabs } from "expo-router";
import { useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Compass, Globe, CalendarDays, Images, User } from "lucide-react-native";
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
const ITEM_W  = 54; // 50px icon + 4px gap
const BLOB_SZ = 50; // blob width & height
const ROW_PAD = 8;  // paddingHorizontal of the tab row

function FloatingTabBar({ state, navigation }: any) {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Shared values — animate the blob position & horizontal stretch
  const blobX      = useSharedValue(state.index * ITEM_W);
  const blobScaleX = useSharedValue(1);
  const blobScaleY = useSharedValue(1);

  useEffect(() => {
    const toX = state.index * ITEM_W;

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
  }, [state.index]);

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
                    navigation.navigate(route.name);
                  }
                };

                return (
                  <Pressable
                    key={route.key}
                    onPress={onPress}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={TABS[index].label}
                  >
                    <Icon
                      size={20}
                      color={
                        focused
                          ? C.teal
                          : isDark
                          ? "rgba(170,170,180,0.45)"
                          : "rgba(80,80,90,0.40)"
                      }
                      strokeWidth={focused ? 2.2 : 1.6}
                    />
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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
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

  // Animated blob — absolutely positioned, slides behind icons
  blob: {
    position: "absolute",
    top: ROW_PAD,
    left: ROW_PAD,
    width: BLOB_SZ,
    height: BLOB_SZ,
    borderRadius: BLOB_SZ / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Icon row — same padding as tabRowOuter so icons align over blob
  tabRow: {
    flexDirection: "row",
    gap: ITEM_W - BLOB_SZ, // = 4px gap between items
  },

  iconBtn: {
    width: BLOB_SZ,
    height: BLOB_SZ,
    alignItems: "center",
    justifyContent: "center",
  },
});
