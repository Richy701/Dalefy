import { Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  padding,
  frame,
  background,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

type TripCountdownProps = {
  state: string;
  tripName: string;
  destination: string;
  daysLeft: number;
  startDate: string;
  currentDay: number;
  totalDays: number;
  accentColor: string;
  event1: string;
  event2: string;
};

function TripCountdownWidget(
  props: TripCountdownProps,
  environment: WidgetEnvironment
) {
  "widget";

  const isDark = environment.colorScheme === "dark";
  const accent = props.accentColor || "#0bd2b5";
  const bg = isDark ? "#131316" : "#ffffff";
  const textPrimary = isDark ? "#ffffff" : "#000000";
  const textSecondary = isDark ? "#8e8e93" : "#6e6e73";
  const isSmall = environment.widgetFamily === "systemSmall";

  const state =
    props.state ||
    (props.daysLeft > 0 ? "upcoming" : props.tripName ? "active" : "empty");

  // ── Small: Empty ──
  if (isSmall && state === "empty") {
    return (
      <VStack
        modifiers={[
          padding({ all: 14 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(bg),
        ]}
      >
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Image systemName="airplane" size={10} color={accent} />
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(accent),
            ]}
          >
            DALEFY
          </Text>
          <Spacer />
        </HStack>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 16, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          No trips
        </Text>
        <Text
          modifiers={[
            font({ size: 16, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          planned
        </Text>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 11, weight: "medium" }),
            foregroundStyle(textSecondary),
          ]}
        >
          Tap to plan one
        </Text>
      </VStack>
    );
  }

  // ── Small: Active ──
  if (isSmall && state === "active") {
    return (
      <VStack
        modifiers={[
          padding({ all: 14 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(bg),
        ]}
      >
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Image systemName="airplane" size={10} color={accent} />
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(accent),
            ]}
          >
            ON TRIP
          </Text>
          <Spacer />
        </HStack>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 36, weight: "black", design: "rounded" }),
            foregroundStyle(accent),
          ]}
        >
          {`Day ${props.currentDay}`}
        </Text>
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {`of ${props.totalDays}`}
        </Text>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 13, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          {props.destination}
        </Text>
      </VStack>
    );
  }

  // ── Small: Upcoming ──
  if (isSmall) {
    return (
      <VStack
        modifiers={[
          padding({ all: 14 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(bg),
        ]}
      >
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Image systemName="airplane" size={10} color={accent} />
          <Text
            modifiers={[
              font({ size: 9, weight: "bold" }),
              foregroundStyle(accent),
            ]}
          >
            NEXT TRIP
          </Text>
          <Spacer />
        </HStack>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 48, weight: "black", design: "rounded" }),
            foregroundStyle(accent),
          ]}
        >
          {String(props.daysLeft)}
        </Text>
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {props.daysLeft === 1 ? "day" : "days"}
        </Text>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 13, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          {props.destination || props.tripName}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: "medium" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {props.startDate}
        </Text>
      </VStack>
    );
  }

  // ── Medium: Empty ──
  if (state === "empty") {
    return (
      <VStack
        modifiers={[
          padding({ all: 16 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(bg),
        ]}
      >
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Image systemName="airplane" size={12} color={accent} />
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle(accent),
            ]}
          >
            DALEFY
          </Text>
          <Spacer />
        </HStack>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 18, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          No trips planned
        </Text>
        <Text
          modifiers={[
            font({ size: 12, weight: "medium" }),
            foregroundStyle(textSecondary),
          ]}
        >
          Tap to plan one
        </Text>

        <Spacer />
      </VStack>
    );
  }

  // ── Medium: Active ──
  if (state === "active") {
    return (
      <HStack
        modifiers={[
          padding({ all: 16 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          background(bg),
        ]}
      >
        <VStack modifiers={[frame({ width: 90 })]}>
          <Image systemName="airplane" size={12} color={accent} />
          <Spacer />
          <Text
            modifiers={[
              font({ size: 36, weight: "black", design: "rounded" }),
              foregroundStyle(accent),
            ]}
          >
            {`Day ${props.currentDay}`}
          </Text>
          <Text
            modifiers={[
              font({ size: 11, weight: "semibold" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {`of ${props.totalDays}`}
          </Text>
        </VStack>

        <Spacer />

        <VStack>
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle(accent),
            ]}
          >
            ON TRIP
          </Text>

          <Spacer />

          <Text
            modifiers={[
              font({ size: 15, weight: "bold" }),
              foregroundStyle(textPrimary),
            ]}
          >
            {props.destination}
          </Text>

          {props.event1 ? (
            <Text
              modifiers={[
                font({ size: 11, weight: "medium" }),
                foregroundStyle(textSecondary),
              ]}
            >
              {props.event1}
            </Text>
          ) : null}
          {props.event2 ? (
            <Text
              modifiers={[
                font({ size: 11, weight: "medium" }),
                foregroundStyle(textSecondary),
              ]}
            >
              {props.event2}
            </Text>
          ) : null}
        </VStack>
      </HStack>
    );
  }

  // ── Medium: Upcoming ──
  return (
    <HStack
      modifiers={[
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(bg),
      ]}
    >
      <VStack modifiers={[frame({ width: 80 })]}>
        <Image systemName="airplane" size={12} color={accent} />
        <Spacer />
        <Text
          modifiers={[
            font({ size: 48, weight: "black", design: "rounded" }),
            foregroundStyle(accent),
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
          {props.daysLeft === 1 ? "day" : "days"}
        </Text>
      </VStack>

      <Spacer />

      <VStack>
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(accent),
          ]}
        >
          NEXT TRIP
        </Text>

        <Spacer />

        <Text
          modifiers={[
            font({ size: 15, weight: "bold" }),
            foregroundStyle(textPrimary),
          ]}
        >
          {props.destination || props.tripName}
        </Text>
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

        {props.event1 ? (
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.event1}
          </Text>
        ) : null}
        {props.event2 ? (
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.event2}
          </Text>
        ) : null}
      </VStack>
    </HStack>
  );
}

export default createWidget("TripCountdown", TripCountdownWidget);
