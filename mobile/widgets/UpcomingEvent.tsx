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
  // Use system-adaptive hierarchical styles for liquid glass compatibility
  const hierarchicalPrimary = { type: "hierarchical" as const, style: "primary" as const };
  const hierarchicalSecondary = { type: "hierarchical" as const, style: "secondary" as const };
  const hierarchicalTertiary = { type: "hierarchical" as const, style: "tertiary" as const };

  const typeLabel = props.type.charAt(0).toUpperCase() + props.type.slice(1);
  const icon = props.icon || TYPE_ICONS[props.type] || "calendar";

  // ── Banner (Lock Screen) ──
  const banner = (
    <VStack
      modifiers={[
        padding({ horizontal: 16, vertical: 12 }),
        frame({ maxWidth: Infinity }),
      ]}
    >
      <HStack>
        <HStack>
          <Image systemName={icon} size={11} color={teal} />
          <Text
            modifiers={[
              font({ size: 11, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            {typeLabel.toUpperCase()}
          </Text>
        </HStack>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(hierarchicalSecondary),
          ]}
        >
          {props.time}
        </Text>
      </HStack>

      <Text
        modifiers={[
          font({ size: 20, weight: "bold" }),
          foregroundStyle(hierarchicalPrimary),
          padding({ top: 4 }),
        ]}
      >
        {props.title}
      </Text>

      {props.location ? (
        <HStack modifiers={[padding({ top: 4 })]}>
          <Image systemName="mappin" size={9} color={teal} />
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(hierarchicalSecondary),
            ]}
          >
            {props.location}
          </Text>
        </HStack>
      ) : null}

    </VStack>
  );

  // ── Compact: leading ──
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

  // ── Compact: trailing ──
  const compactTrailing = (
    <Text
      modifiers={[
        font({ size: 11, weight: "semibold" }),
        foregroundStyle(hierarchicalSecondary),
      ]}
    >
      {props.title.length > 22 ? props.title.slice(0, 20) + "..." : props.title}
    </Text>
  );

  // ── Minimal ──
  const minimal = (
    <Image systemName={icon} size={11} color={teal} />
  );

  // ── Expanded: leading — type icon + time ──
  const expandedLeading = (
    <VStack modifiers={[padding({ all: 12 })]}>
      <Image systemName={icon} size={14} color={teal} />
      <Text
        modifiers={[
          font({ size: 11, weight: "bold" }),
          foregroundStyle(teal),
        ]}
      >
        {props.time}
      </Text>
    </VStack>
  );

  // ── Expanded: trailing — type icon ──
  const expandedTrailing = (
    <VStack modifiers={[padding({ all: 12 })]}>
      <Image systemName={icon} size={14} color={teal} />
    </VStack>
  );

  // ── Expanded: center — title ──
  const expandedCenter = (
    <VStack modifiers={[padding({ all: 8 })]}>
      <Text
        modifiers={[
          font({ size: 14, weight: "bold" }),
          foregroundStyle(hierarchicalPrimary),
        ]}
      >
        {props.title.length > 34 ? props.title.slice(0, 32) + "..." : props.title}
      </Text>
    </VStack>
  );

  // ── Expanded: bottom — time + location summary ──
  const expandedBottom = (
    <HStack modifiers={[padding({ all: 8 })]}>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(hierarchicalSecondary)]}>
        {props.time}
      </Text>
      <Spacer />
      {props.location ? (
        <HStack>
          <Image systemName="mappin" size={9} color={teal} />
          <Text modifiers={[font({ size: 11 }), foregroundStyle(hierarchicalSecondary)]}>
            {props.location.length > 20 ? props.location.slice(0, 18) + "..." : props.location}
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
