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

// 80x80 Dalefy icon embedded as data URI (2.7KB) for Live Activity branding
const DALEFY_ICON = "data:image/png;base64,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";

function FlightTrackerActivity(
  props: FlightTrackerProps,
  environment: LiveActivityEnvironment
) {
  "widget";

  const teal = "#0bd2b5";
  // Live Activities always render on dark/translucent backgrounds — force light text
  const textPrimary = "#ffffff";
  const textSecondary = "#a0a0a5";
  const textDim = "#68686d";

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

      <HStack modifiers={[padding({ top: 6 })]}>
        {props.gate ? (
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle(teal),
            ]}
          >
            {"Gate " + props.gate}
          </Text>
        ) : null}
        <Spacer />
        <Image
          uiImage={DALEFY_ICON}
          modifiers={[
            frame({ width: 18, height: 18 }),
          ]}
        />
      </HStack>
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

  // ── Expanded: leading — departure code (white like airport boards) ──
  const expandedLeading = (
    <Text modifiers={[padding({ all: 12 }), font({ weight: "bold", size: 16 }), foregroundStyle("#ffffff")]}>
      {props.from || "---"}
    </Text>
  );

  // ── Expanded: trailing — arrival code (white like airport boards) ──
  const expandedTrailing = (
    <Text modifiers={[padding({ all: 12 }), font({ weight: "bold", size: 16 }), foregroundStyle("#ffffff")]}>
      {props.to || "---"}
    </Text>
  );

  // ── Expanded: center — airplane + flight number ──
  const expandedCenter = (
    <HStack modifiers={[padding({ all: 8 })]}>
      <Image systemName="airplane" size={12} color={teal} />
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(textDim)]}>
        {props.flightNum}
      </Text>
    </HStack>
  );

  // ── Expanded: bottom — times + status + gate ──
  const expandedBottom = (
    <HStack modifiers={[padding({ all: 8 })]}>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(textSecondary)]}>
        {props.departTime}
      </Text>
      <Spacer />
      <HStack
        modifiers={[
          padding({ horizontal: 8, vertical: 2 }),
          background(statusColor + "22", shapes.capsule()),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 10, weight: "bold" }),
            foregroundStyle(statusColor),
          ]}
        >
          {statusLabel + (props.gate ? " · Gate " + props.gate : "")}
        </Text>
      </HStack>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(textSecondary)]}>
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
