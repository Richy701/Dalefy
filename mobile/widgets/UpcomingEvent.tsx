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
  // Live Activities always render on dark/translucent backgrounds — force light text
  const textPrimary = "#ffffff";
  const textSecondary = "#a0a0a5";
  const textDim = "#68686d";

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
            foregroundStyle(textSecondary),
          ]}
        >
          {props.time}
        </Text>
      </HStack>

      <Text
        modifiers={[
          font({ size: 18, weight: "bold" }),
          foregroundStyle(textPrimary),
          padding({ top: 4 }),
        ]}
      >
        {props.title}
      </Text>

      {props.location ? (
        <HStack modifiers={[padding({ top: 4 })]}>
          <Image systemName="mappin" size={9} color={textDim} />
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.location}
          </Text>
        </HStack>
      ) : null}

      <HStack modifiers={[padding({ top: 6 })]}>
        <HStack>
          <Image systemName="d.circle.fill" size={11} color={teal} />
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(textDim),
            ]}
          >
            Dalefy
          </Text>
        </HStack>
        <Spacer />
        <HStack
          modifiers={[
            padding({ horizontal: 7, vertical: 2 }),
            background(teal + "22", shapes.capsule()),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            UP NEXT
          </Text>
        </HStack>
      </HStack>
    </VStack>
  );

  // ── Compact: leading ──
  const compactLeading = (
    <HStack>
      <Image systemName={icon} size={9} color={teal} />
      <Text
        modifiers={[
          font({ size: 11, weight: "bold" }),
          foregroundStyle(textPrimary),
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
        foregroundStyle(textSecondary),
      ]}
    >
      {props.title.length > 18 ? props.title.slice(0, 16) + "..." : props.title}
    </Text>
  );

  // ── Minimal ──
  const minimal = (
    <Image systemName={icon} size={11} color={teal} />
  );

  // ── Expanded: leading — type icon + time ──
  const expandedLeading = (
    <VStack modifiers={[frame({ maxHeight: 40 })]}>
      <Image systemName={icon} size={14} color={teal} />
      <Text
        modifiers={[
          font({ size: 10, weight: "bold" }),
          foregroundStyle(teal),
        ]}
      >
        {props.time}
      </Text>
    </VStack>
  );

  // ── Expanded: trailing — location ──
  const expandedTrailing = (
    <VStack modifiers={[frame({ maxHeight: 40 })]}>
      {props.location ? (
        <Text
          modifiers={[
            font({ size: 10, weight: "medium" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {props.location.length > 14 ? props.location.slice(0, 12) + "..." : props.location}
        </Text>
      ) : null}
    </VStack>
  );

  // ── Expanded: center — title ──
  const expandedCenter = (
    <VStack modifiers={[frame({ maxHeight: 40 })]}>
      <Text
        modifiers={[
          font({ size: 13, weight: "bold" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.title.length > 20 ? props.title.slice(0, 18) + "..." : props.title}
      </Text>
    </VStack>
  );

  // ── Expanded: bottom — "UP NEXT" badge ──
  const expandedBottom = (
    <HStack modifiers={[frame({ maxWidth: Infinity, maxHeight: 20 })]}>
      <Spacer />
      <HStack
        modifiers={[
          padding({ horizontal: 8, vertical: 2 }),
          background(teal + "22", shapes.capsule()),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 9, weight: "bold" }),
            foregroundStyle(teal),
          ]}
        >
          UP NEXT
        </Text>
      </HStack>
      <Spacer />
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
