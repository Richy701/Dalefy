import { Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  padding,
  frame,
  background,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

type TripCountdownProps = {
  tripName: string;
  destination: string;
  daysLeft: number;
  startDate: string;
};

function TripCountdownWidget(
  props: TripCountdownProps,
  environment: WidgetEnvironment
) {
  "widget";

  const isDark = environment.colorScheme === "dark";
  const teal = "#0bd2b5";
  const bg = isDark ? "#131316" : "#ffffff";
  const cardBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textPrimary = isDark ? "#ffffff" : "#000000";
  const textSecondary = isDark ? "#8e8e93" : "#6e6e73";
  const isSmall = environment.widgetFamily === "systemSmall";

  const daysText =
    props.daysLeft === 0
      ? "Today"
      : props.daysLeft === 1
        ? "Tomorrow"
        : `${props.daysLeft}d`;

  const statusLabel =
    props.daysLeft === 0
      ? "IN PROGRESS"
      : props.daysLeft <= 7
        ? "COMING UP"
        : "UPCOMING";

  if (isSmall) {
    return (
      <VStack
        modifiers={[
          padding({ all: 14 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(bg),
        ]}
      >
        {/* Status label */}
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Image systemName="airplane" size={10} color={teal} />
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            {statusLabel}
          </Text>
          <Spacer />
        </HStack>

        <Spacer />

        {/* Big number */}
        <Text
          modifiers={[
            font({ size: 42, weight: "black", design: "rounded" }),
            foregroundStyle(props.daysLeft === 0 ? teal : textPrimary),
          ]}
        >
          {String(props.daysLeft)}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "semibold" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {props.daysLeft === 0 ? "days" : props.daysLeft === 1 ? "day left" : "days left"}
        </Text>

        <Spacer />

        {/* Destination */}
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          {props.destination || props.tripName}
        </Text>
      </VStack>
    );
  }

  // ── systemMedium ──
  return (
    <HStack
      modifiers={[
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(bg),
      ]}
    >
      {/* Left: countdown */}
      <VStack
        modifiers={[
          frame({ width: 80 }),
        ]}
      >
        <Image systemName="airplane" size={12} color={teal} />
        <Spacer />
        <Text
          modifiers={[
            font({ size: 48, weight: "black", design: "rounded" }),
            foregroundStyle(props.daysLeft === 0 ? teal : textPrimary),
          ]}
        >
          {String(props.daysLeft)}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: "semibold" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {props.daysLeft === 0 ? "days" : props.daysLeft === 1 ? "day left" : "days left"}
        </Text>
      </VStack>

      <Spacer />

      {/* Right: trip info */}
      <VStack>
        {/* Status pill */}
        <HStack
          modifiers={[
            padding({ horizontal: 8, vertical: 4 }),
            background(isDark ? "#0bd2b518" : "#0bd2b515", shapes.capsule()),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            {statusLabel}
          </Text>
        </HStack>

        <Spacer />

        {/* Trip name */}
        <Text
          modifiers={[
            font({ size: 15, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          {props.tripName}
        </Text>

        {/* Destination */}
        {props.destination ? (
          <HStack>
            <Image systemName="mappin" size={10} color={teal} />
            <Text
              modifiers={[
                font({ size: 12, weight: "medium" }),
                foregroundStyle(teal),
              ]}
            >
              {props.destination}
            </Text>
          </HStack>
        ) : null}

        {/* Date */}
        <HStack>
          <Image systemName="calendar" size={10} color={textSecondary} />
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.startDate}
          </Text>
        </HStack>
      </VStack>
    </HStack>
  );
}

export default createWidget("TripCountdown", TripCountdownWidget);
