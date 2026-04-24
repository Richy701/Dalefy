import { Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  padding,
  frame,
  background,
  opacity,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";

type LiveActivityEnvironment = {
  colorScheme: "light" | "dark";
  isLuminanceReduced?: boolean;
  isActivityFullscreen?: boolean;
};

export type FlightTrackerProps = {
  flightNum: string;
  airline: string;
  fromCode: string;
  toCode: string;
  departTime: string;
  arriveTime: string;
  status: string;
  gate: string;
  terminal: string;
};

function FlightTrackerActivity(
  props: FlightTrackerProps,
  environment: LiveActivityEnvironment
) {
  "widget";

  const isDark = environment.colorScheme === "dark";
  const teal = "#0bd2b5";
  const bg = isDark ? "#131316" : "#ffffff";
  const textPrimary = isDark ? "#ffffff" : "#000000";
  const textSecondary = isDark ? "#8e8e93" : "#6e6e73";
  const textDim = isDark ? "#48484a" : "#c7c7cc";

  const status = props.status?.toLowerCase() ?? "";
  const statusColor =
    status.includes("cancel") ? "#ef4444" :
    status.includes("delay") ? "#f59e0b" :
    status.includes("landed") || status.includes("arrived") ? "#22c55e" :
    status.includes("boarding") ? teal :
    textSecondary;

  const statusLabel =
    status.includes("cancel") ? "CANCELLED" :
    status.includes("delay") ? "DELAYED" :
    status.includes("landed") || status.includes("arrived") ? "LANDED" :
    status.includes("boarding") ? "BOARDING" :
    status.includes("scheduled") ? "ON TIME" :
    props.status?.toUpperCase() || "TRACKING";

  // ── Banner (Lock Screen / Notification Center) ──
  const banner = (
    <VStack
      modifiers={[
        padding({ all: 16 }),
        frame({ maxWidth: Infinity }),
        background(bg),
      ]}
    >
      {/* Top: flight number + status */}
      <HStack>
        <HStack>
          <Image systemName="airplane" size={12} color={teal} />
          <Text
            modifiers={[
              font({ size: 13, weight: "bold" }),
              foregroundStyle(textPrimary),
            ]}
          >
            {props.flightNum}
          </Text>
        </HStack>
        <Spacer />
        <HStack
          modifiers={[
            padding({ horizontal: 8, vertical: 3 }),
            background(statusColor + "20", shapes.capsule()),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle(statusColor),
            ]}
          >
            {statusLabel}
          </Text>
        </HStack>
      </HStack>

      {/* Route: FROM → TO */}
      <HStack
        modifiers={[
          padding({ top: 12 }),
          frame({ maxWidth: Infinity }),
        ]}
      >
        {/* Departure */}
        <VStack>
          <Text
            modifiers={[
              font({ size: 28, weight: "black", design: "rounded" }),
              foregroundStyle(textPrimary),
            ]}
          >
            {props.fromCode}
          </Text>
          <Text
            modifiers={[
              font({ size: 13, weight: "medium" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.departTime}
          </Text>
        </VStack>

        <Spacer />

        {/* Flight path */}
        <VStack>
          <Image systemName="airplane" size={16} color={teal} />
          <Text
            modifiers={[
              font({ size: 9, weight: "medium" }),
              foregroundStyle(textDim),
            ]}
          >
            {props.airline}
          </Text>
        </VStack>

        <Spacer />

        {/* Arrival */}
        <VStack>
          <Text
            modifiers={[
              font({ size: 28, weight: "black", design: "rounded" }),
              foregroundStyle(textPrimary),
            ]}
          >
            {props.toCode}
          </Text>
          <Text
            modifiers={[
              font({ size: 13, weight: "medium" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.arriveTime || "--:--"}
          </Text>
        </VStack>
      </HStack>

      {/* Bottom: gate + terminal */}
      {(props.gate || props.terminal) ? (
        <HStack modifiers={[padding({ top: 8 })]}>
          {props.terminal ? (
            <HStack>
              <Text
                modifiers={[
                  font({ size: 10, weight: "semibold" }),
                  foregroundStyle(textSecondary),
                ]}
              >
                {"T" + props.terminal}
              </Text>
            </HStack>
          ) : null}
          {props.gate ? (
            <HStack>
              <Text
                modifiers={[
                  font({ size: 10, weight: "bold" }),
                  foregroundStyle(teal),
                ]}
              >
                {"Gate " + props.gate}
              </Text>
            </HStack>
          ) : null}
          <Spacer />
        </HStack>
      ) : null}
    </VStack>
  );

  // ── Dynamic Island: compact leading ──
  const compactLeading = (
    <HStack>
      <Image systemName="airplane" size={10} color={teal} />
      <Text
        modifiers={[
          font({ size: 12, weight: "bold" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.fromCode}
      </Text>
    </HStack>
  );

  // ── Dynamic Island: compact trailing ──
  const compactTrailing = (
    <Text
      modifiers={[
        font({ size: 12, weight: "bold" }),
        foregroundStyle(textPrimary),
      ]}
    >
      {props.toCode}
    </Text>
  );

  // ── Dynamic Island: minimal ──
  const minimal = (
    <Image systemName="airplane" size={12} color={teal} />
  );

  // ── Dynamic Island: expanded ──
  const expandedLeading = (
    <VStack>
      <Text
        modifiers={[
          font({ size: 24, weight: "black", design: "rounded" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.fromCode}
      </Text>
      <Text
        modifiers={[
          font({ size: 12, weight: "medium" }),
          foregroundStyle(textSecondary),
        ]}
      >
        {props.departTime}
      </Text>
    </VStack>
  );

  const expandedTrailing = (
    <VStack>
      <Text
        modifiers={[
          font({ size: 24, weight: "black", design: "rounded" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.toCode}
      </Text>
      <Text
        modifiers={[
          font({ size: 12, weight: "medium" }),
          foregroundStyle(textSecondary),
        ]}
      >
        {props.arriveTime || "--:--"}
      </Text>
    </VStack>
  );

  const expandedCenter = (
    <VStack>
      <Image systemName="airplane" size={14} color={teal} />
      <Text
        modifiers={[
          font({ size: 10, weight: "bold" }),
          foregroundStyle(textSecondary),
        ]}
      >
        {props.flightNum}
      </Text>
    </VStack>
  );

  const expandedBottom = (
    <HStack modifiers={[frame({ maxWidth: Infinity })]}>
      <HStack
        modifiers={[
          padding({ horizontal: 8, vertical: 4 }),
          background(statusColor + "20", shapes.capsule()),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(statusColor),
          ]}
        >
          {statusLabel}
        </Text>
      </HStack>
      <Spacer />
      {props.gate ? (
        <Text
          modifiers={[
            font({ size: 11, weight: "bold" }),
            foregroundStyle(teal),
          ]}
        >
          {"Gate " + props.gate}
        </Text>
      ) : null}
      {props.terminal ? (
        <Text
          modifiers={[
            font({ size: 11, weight: "semibold" }),
            foregroundStyle(textSecondary),
          ]}
        >
          {"T" + props.terminal}
        </Text>
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

export default createLiveActivity("FlightTracker", FlightTrackerActivity);
