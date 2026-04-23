import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { SFSymbol } from "sf-symbols-typescript";
import type { AndroidSymbol } from "expo-symbols";
import { useTheme } from "@/context/ThemeContext";

const TABS: {
  name: string;
  label: string;
  sf: SFSymbol;
  md: AndroidSymbol;
  hidden?: boolean;
}[] = [
  { name: "index",        label: "Home",    sf: "house.fill",           md: "home"          },
  { name: "destinations", label: "World",   sf: "map.fill",             md: "public"        },
  { name: "itinerary",    label: "Plan",    sf: "calendar",             md: "event",         hidden: true },
  { name: "media",        label: "Gallery", sf: "camera.fill",          md: "photo_camera"  },
  { name: "profile",      label: "Me",      sf: "person.crop.circle",   md: "person"        },
];

export default function TabLayout() {
  const { C, isDark } = useTheme();
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
    >
      {TABS.map(({ name, label, sf, md, hidden }) => (
        <NativeTabs.Trigger key={name} name={name} hidden={hidden}>
          <NativeTabs.Trigger.Icon sf={sf} md={md} />
          <NativeTabs.Trigger.Label>{label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
