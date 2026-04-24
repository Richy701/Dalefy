import { Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  padding,
  frame,
  background,
  shapes,
  opacity,
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

  const isDark = environment.colorScheme === "dark";
  const teal = "#0bd2b5";
  const textPrimary = isDark ? "#ffffff" : "#000000";
  const textSecondary = isDark ? "#8e8e93" : "#6e6e73";
  const textDim = isDark ? "#48484a" : "#aeaeb2";

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
        padding({ horizontal: 16, vertical: 12 }),
        frame({ maxWidth: Infinity }),
      ]}
    >
      <HStack>
        <HStack>
          <Image systemName="airplane" size={11} color={teal} />
          <Text
            modifiers={[
              font({ size: 12, weight: "semibold" }),
              foregroundStyle(textSecondary),
            ]}
          >
            {props.airline ? props.airline + " " : ""}{props.flightNum}
          </Text>
        </HStack>
        <Spacer />
        <HStack
          modifiers={[
            padding({ horizontal: 7, vertical: 2 }),
            background(statusColor + "22", shapes.capsule()),
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

      <HStack
        modifiers={[
          padding({ top: 8 }),
          frame({ maxWidth: Infinity }),
        ]}
      >
        <VStack>
          <Text
            modifiers={[
              font({ size: 26, weight: "black", design: "rounded" }),
              foregroundStyle(textPrimary),
            ]}
          >
            {props.from}
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

        <Spacer />
        <VStack>
          <Image systemName="airplane" size={13} color={teal} />
          {props.duration ? (
            <Text
              modifiers={[
                font({ size: 9, weight: "medium" }),
                foregroundStyle(textDim),
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
              font({ size: 26, weight: "black", design: "rounded" }),
              foregroundStyle(textPrimary),
            ]}
          >
            {props.to}
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
      </HStack>

      {props.gate ? (
        <HStack modifiers={[padding({ top: 6 })]}>
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
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

  // ── Compact: leading ──
  const compactLeading = (
    <HStack>
      <Image systemName="airplane" size={9} color={teal} />
      <Text
        modifiers={[
          font({ size: 11, weight: "bold" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.from}
      </Text>
    </HStack>
  );

  // ── Compact: trailing ──
  const compactTrailing = (
    <Text
      modifiers={[
        font({ size: 11, weight: "bold" }),
        foregroundStyle(textPrimary),
      ]}
    >
      {props.to}
    </Text>
  );

  // ── Minimal ──
  const minimal = (
    <Image systemName="airplane" size={11} color={teal} />
  );

  // ── Expanded: leading — city/code + time, kept tight ──
  const expandedLeading = (
    <VStack modifiers={[frame({ maxHeight: 40 })]}>
      <Text
        modifiers={[
          font({ size: 18, weight: "black", design: "rounded" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.from}
      </Text>
      <Text
        modifiers={[
          font({ size: 10, weight: "medium" }),
          foregroundStyle(textSecondary),
        ]}
      >
        {props.departTime}
      </Text>
    </VStack>
  );

  // ── Expanded: trailing ──
  const expandedTrailing = (
    <VStack modifiers={[frame({ maxHeight: 40 })]}>
      <Text
        modifiers={[
          font({ size: 18, weight: "black", design: "rounded" }),
          foregroundStyle(textPrimary),
        ]}
      >
        {props.to}
      </Text>
      <Text
        modifiers={[
          font({ size: 10, weight: "medium" }),
          foregroundStyle(textSecondary),
        ]}
      >
        {props.arriveTime || "--:--"}
      </Text>
    </VStack>
  );

  // ── Expanded: center — just the icon + flight number ──
  const expandedCenter = (
    <VStack modifiers={[frame({ maxHeight: 40 })]}>
      <Image systemName="airplane" size={11} color={teal} />
      <Text
        modifiers={[
          font({ size: 8, weight: "bold" }),
          foregroundStyle(textDim),
        ]}
      >
        {props.flightNum}
      </Text>
    </VStack>
  );

  // ── Expanded: bottom — status centered ──
  const expandedBottom = (
    <HStack modifiers={[frame({ maxWidth: Infinity, maxHeight: 20 })]}>
      <Spacer />
      <HStack
        modifiers={[
          padding({ horizontal: 8, vertical: 2 }),
          background(statusColor + "22", shapes.capsule()),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 9, weight: "bold" }),
            foregroundStyle(statusColor),
          ]}
        >
          {statusLabel}
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

export default createLiveActivity("FlightTracker", FlightTrackerActivity);
