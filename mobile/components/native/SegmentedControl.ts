import type { ComponentType } from "react";
import RawSegmentedControl, { type SegmentedControlProps } from "@react-native-segmented-control/segmented-control";

// Its published class types predate React 19.3's; same component, typed so JSX accepts it
export const SegmentedControl = RawSegmentedControl as unknown as ComponentType<SegmentedControlProps>;
