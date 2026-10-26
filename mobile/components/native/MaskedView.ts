import type { ComponentType, ReactElement } from "react";
import type { ViewProps } from "react-native";
import RawMaskedView from "@react-native-masked-view/masked-view";

// Its published class types predate React 19.3's; same component, typed so JSX accepts it
export const MaskedView = RawMaskedView as unknown as ComponentType<ViewProps & { maskElement: ReactElement; androidRenderingMode?: "software" | "hardware" }>;
