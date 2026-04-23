import { Text, VStack, HStack, Spacer } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  padding,
  frame,
  cornerRadius,
  background,
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
  const isSmall = environment.widgetFamily === "systemSmall";

  const daysLabel =
    props.daysLeft === 0
      ? "TODAY"
      : props.daysLeft === 1
        ? "TOMORROW"
        : `${props.daysLeft} DAYS`;

  if (isSmall) {
    return (
      <VStack
        modifiers={[
          padding({ all: 14 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(teal),
          ]}
        >
          NEXT TRIP
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 36, weight: "black", design: "rounded" }),
            foregroundStyle(isDark ? "#ffffff" : "#0d0f14"),
          ]}
        >
          {String(props.daysLeft)}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(isDark ? "#9a9a9a" : "#4b5263"),
          ]}
        >
          {daysLabel}
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 11, weight: "semibold" }),
            foregroundStyle(isDark ? "#EDEDEF" : "#0d0f14"),
          ]}
        >
          {props.destination || props.tripName}
        </Text>
      </VStack>
    );
  }

  // systemMedium
  return (
    <HStack
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
      ]}
    >
      <VStack>
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(teal),
          ]}
        >
          COUNTDOWN
        </Text>
        <Text
          modifiers={[
            font({ size: 44, weight: "black", design: "rounded" }),
            foregroundStyle(isDark ? "#ffffff" : "#0d0f14"),
          ]}
        >
          {String(props.daysLeft)}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(isDark ? "#9a9a9a" : "#4b5263"),
          ]}
        >
          {daysLabel}
        </Text>
      </VStack>
      <Spacer />
      <VStack>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 14, weight: "bold" }),
            foregroundStyle(isDark ? "#EDEDEF" : "#0d0f14"),
          ]}
        >
          {props.tripName}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: "medium" }),
            foregroundStyle(teal),
          ]}
        >
          {props.destination}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "medium" }),
            foregroundStyle(isDark ? "#8a8a8a" : "#606878"),
          ]}
        >
          {props.startDate}
        </Text>
        <Spacer />
      </VStack>
    </HStack>
  );
}

export default createWidget("TripCountdown", TripCountdownWidget);
