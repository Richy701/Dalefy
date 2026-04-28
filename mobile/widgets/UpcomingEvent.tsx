import { Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  padding,
  frame,
  background,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";

type LiveActivityEnvironment = {
  colorScheme: "light" | "dark";
  isLuminanceReduced?: boolean;
  isActivityFullscreen?: boolean;
  activityFamily?: "small" | "medium";
};

export type UpcomingEventProps = {
  title: string;
  type: "dining" | "activity" | "transfer" | "hotel" | "flight";
  time: string;
  location: string;
  icon: string; // SF Symbol name
};

const TYPE_ICONS: Record<string, string> = {
  dining: "fork.knife",
  activity: "safari",
  transfer: "car.fill",
  hotel: "building.2",
  flight: "airplane",
};

function UpcomingEventActivity(
  props: UpcomingEventProps,
  environment: LiveActivityEnvironment
) {
  "widget";

  const teal = "#0bd2b5";
  const hierarchicalPrimary = { type: "hierarchical" as const, style: "primary" as const };
  const hierarchicalSecondary = { type: "hierarchical" as const, style: "secondary" as const };

  const typeLabel = props.type.charAt(0).toUpperCase() + props.type.slice(1);
  const icon = props.icon || TYPE_ICONS[props.type] || "calendar";

  // ── Banner (Lock Screen) — this is the main view, give it room ──
  const banner = (
    <VStack
      modifiers={[
        padding({ horizontal: 20, vertical: 14 }),
        frame({ maxWidth: Infinity }),
      ]}
    >
      {/* Top: time left, type badge right */}
      <HStack>
        <Text
          modifiers={[
            font({ size: 13, weight: "bold", design: "rounded" }),
            foregroundStyle(teal),
          ]}
        >
          {props.time}
        </Text>
        <Spacer />
        <HStack
          modifiers={[
            padding({ horizontal: 8, vertical: 3 }),
            background(teal + "18", shapes.capsule()),
          ]}
        >
          <Image systemName={icon} size={10} color={teal} />
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            {typeLabel.toUpperCase()}
          </Text>
        </HStack>
      </HStack>

      {/* Title — big, bold, let it breathe */}
      <Text
        modifiers={[
          font({ size: 22, weight: "bold" }),
          foregroundStyle(hierarchicalPrimary),
          padding({ top: 8 }),
        ]}
      >
        {props.title}
      </Text>

      {/* Location — subtle, with pin */}
      {props.location ? (
        <HStack modifiers={[padding({ top: 6 })]}>
          <Image systemName="mappin" size={10} color={teal} />
          <Text
            modifiers={[
              font({ size: 12, weight: "medium" }),
              foregroundStyle(hierarchicalSecondary),
            ]}
          >
            {props.location}
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );

  // ── Compact: leading — icon + time ──
  const compactLeading = (
    <HStack>
      <Image systemName={icon} size={9} color={teal} />
      <Text
        modifiers={[
          font({ size: 11, weight: "bold" }),
          foregroundStyle(hierarchicalPrimary),
        ]}
      >
        {props.time}
      </Text>
    </HStack>
  );

  // ── Compact: trailing — short title ──
  const compactTrailing = (
    <Text
      modifiers={[
        font({ size: 11, weight: "semibold" }),
        foregroundStyle(hierarchicalSecondary),
      ]}
    >
      {(() => { const s = props.title.split(/\s*[—–\-:]\s*/)[0].trim(); return s.length > 16 ? s.slice(0, 14) + "..." : s; })()}
    </Text>
  );

  // ── Minimal — just the icon ──
  const minimal = (
    <Image systemName={icon} size={11} color={teal} />
  );

  // ── Expanded: leading — empty ──
  const expandedLeading = (
    <Spacer />
  );

  // ── Expanded: trailing — empty ──
  const expandedTrailing = (
    <Spacer />
  );

  // ── Expanded: center — short title (strip after dash/colon) ──
  const shortTitle = props.title.split(/\s*[—–\-:]\s*/)[0].trim();
  const expandedCenter = (
    <Text modifiers={[padding({ all: 4 }), font({ size: 14, weight: "bold" }), foregroundStyle(hierarchicalPrimary)]}>
      {shortTitle.length > 24 ? shortTitle.slice(0, 22) + "..." : shortTitle}
    </Text>
  );

  // ── Expanded: bottom — time + location ──
  const expandedBottom = (
    <HStack modifiers={[padding({ horizontal: 12, vertical: 4 })]}>
      <Text modifiers={[font({ size: 10, weight: "bold" }), foregroundStyle(teal)]}>
        {props.time}
      </Text>
      <Spacer />
      {props.location ? (
        <HStack>
          <Image systemName="mappin" size={8} color={teal} />
          <Text modifiers={[font({ size: 10 }), foregroundStyle(hierarchicalSecondary)]}>
            {props.location.length > 24 ? props.location.slice(0, 22) + "..." : props.location}
          </Text>
        </HStack>
      ) : null}
    </HStack>
  );

  return {
    banner,
    compactLeading,
    compactTrailing,
    minimal,
    expandedLeading,
    expandedTrailing,
    expandedCenter,
    expandedBottom,
  };
}

export default createLiveActivity("UpcomingEvent", UpcomingEventActivity);
