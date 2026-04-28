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

export type FlightTrackerProps = {
  flightNum: string;
  airline: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  status: string;
  gate: string;
  duration?: string;
};

function FlightTrackerActivity(
  props: FlightTrackerProps,
  environment: LiveActivityEnvironment
) {
  "widget";

  const teal = "#0bd2b5";
  const hierarchicalPrimary = { type: "hierarchical" as const, style: "primary" as const };
  const hierarchicalSecondary = { type: "hierarchical" as const, style: "secondary" as const };
  const hierarchicalTertiary = { type: "hierarchical" as const, style: "tertiary" as const };

  const status = props.status?.toLowerCase() ?? "";
  const statusColor =
    status.includes("cancel") ? "#ef4444" :
    status.includes("delay") ? "#f59e0b" :
    status.includes("landed") || status.includes("arrived") ? "#22c55e" :
    status.includes("boarding") ? teal :
    "#22c55e";

  const statusLabel =
    status.includes("cancel") ? "CANCELLED" :
    status.includes("delay") ? "DELAYED" :
    status.includes("landed") || status.includes("arrived") ? "LANDED" :
    status.includes("boarding") ? "BOARDING" :
    "ON TIME";

  // ── Banner (Lock Screen) ──
  const banner = (
    <VStack
      modifiers={[
        padding({ horizontal: 20, vertical: 14 }),
        frame({ maxWidth: Infinity }),
      ]}
    >
      {/* Top: flight number left, status right */}
      <HStack>
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(hierarchicalSecondary),
          ]}
        >
          {props.airline ? props.airline + " " : ""}{props.flightNum}
        </Text>
        <Spacer />
        <HStack
          modifiers={[
            padding({ horizontal: 8, vertical: 3 }),
            background(statusColor + "18", shapes.capsule()),
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

      {/* Middle: airport codes with plane between */}
      <HStack
        modifiers={[
          padding({ top: 10 }),
          frame({ maxWidth: Infinity }),
        ]}
      >
        <VStack>
          <Text
            modifiers={[
              font({ size: 30, weight: "black", design: "rounded" }),
              foregroundStyle(hierarchicalPrimary),
            ]}
          >
            {props.from}
          </Text>
          <Text
            modifiers={[
              font({ size: 12, weight: "medium" }),
              foregroundStyle(hierarchicalSecondary),
            ]}
          >
            {props.departTime}
          </Text>
        </VStack>

        <Spacer />
        <VStack>
          <Text
            modifiers={[
              font({ size: 8, weight: "medium", design: "monospaced" }),
              foregroundStyle(hierarchicalTertiary),
            ]}
          >
            {"- - - -"}
          </Text>
          <Image systemName="airplane" size={14} color={teal} />
          {props.duration ? (
            <Text
              modifiers={[
                font({ size: 10, weight: "medium" }),
                foregroundStyle(hierarchicalTertiary),
              ]}
            >
              {props.duration}
            </Text>
          ) : null}
        </VStack>
        <Spacer />

        <VStack>
          <Text
            modifiers={[
              font({ size: 30, weight: "black", design: "rounded" }),
              foregroundStyle(hierarchicalPrimary),
            ]}
          >
            {props.to}
          </Text>
          <Text
            modifiers={[
              font({ size: 12, weight: "medium" }),
              foregroundStyle(hierarchicalSecondary),
            ]}
          >
            {props.arriveTime || "--:--"}
          </Text>
        </VStack>
      </HStack>

      {/* Bottom: gate info */}
      {props.gate ? (
        <HStack modifiers={[padding({ top: 8 })]}>
          <Text
            modifiers={[
              font({ size: 11, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            {"Gate " + props.gate}
          </Text>
          <Spacer />
        </HStack>
      ) : null}
    </VStack>
  );

  // ── Compact: leading — plane + departure code ──
  const compactLeading = (
    <HStack>
      <Image systemName="airplane" size={9} color={teal} />
      <Text
        modifiers={[
          font({ size: 11, weight: "bold" }),
          foregroundStyle(hierarchicalPrimary),
        ]}
      >
        {props.from}
      </Text>
    </HStack>
  );

  // ── Compact: trailing — arrival code ──
  const compactTrailing = (
    <Text
      modifiers={[
        font({ size: 11, weight: "bold" }),
        foregroundStyle(hierarchicalPrimary),
      ]}
    >
      {props.to}
    </Text>
  );

  // ── Minimal — just the plane ──
  const minimal = (
    <Image systemName="airplane" size={11} color={teal} />
  );

  // ── Expanded: leading — departure code ──
  const expandedLeading = (
    <Text modifiers={[padding({ all: 12 }), font({ weight: "bold", size: 16 }), foregroundStyle("#ffffff")]}>
      {props.from || "---"}
    </Text>
  );

  // ── Expanded: trailing — arrival code ──
  const expandedTrailing = (
    <Text modifiers={[padding({ all: 12 }), font({ weight: "bold", size: 16 }), foregroundStyle("#ffffff")]}>
      {props.to || "---"}
    </Text>
  );

  // ── Expanded: center — plane + flight number ──
  const expandedCenter = (
    <HStack modifiers={[padding({ all: 4 })]}>
      <Image systemName="airplane" size={11} color={teal} />
      <Text modifiers={[font({ size: 10, weight: "semibold" }), foregroundStyle(hierarchicalTertiary)]}>
        {props.flightNum}
      </Text>
    </HStack>
  );

  // ── Expanded: bottom — times + status ──
  const expandedBottom = (
    <HStack modifiers={[padding({ horizontal: 12, vertical: 4 })]}>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(hierarchicalSecondary)]}>
        {props.departTime}
      </Text>
      <Spacer />
      <HStack
        modifiers={[
          padding({ horizontal: 6, vertical: 2 }),
          background(statusColor + "22", shapes.capsule()),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 9, weight: "bold" }),
            foregroundStyle(statusColor),
          ]}
        >
          {statusLabel + (props.gate ? " · " + props.gate : "")}
        </Text>
      </HStack>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(hierarchicalSecondary)]}>
        {props.arriveTime || "--:--"}
      </Text>
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
