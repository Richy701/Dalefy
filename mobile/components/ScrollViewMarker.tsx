import { Platform, View } from "react-native";
import {
  ScrollViewMarker as NativeScrollViewMarker,
  type ScrollViewMarkerProps,
} from "react-native-screens/src/components/gamma/scroll-view-marker";

/** Scroll-edge effects belong to iOS native tabs; Android uses standard tabs. */
export function ScrollViewMarker({ children, style, ...props }: ScrollViewMarkerProps) {
  if (Platform.OS !== "ios") {
    // Android's native marker requires a direct ScrollView child. RefreshControl
    // and virtualized lists can add wrappers, causing a native mounting crash.
    return <View style={style}>{children}</View>;
  }

  return (
    <NativeScrollViewMarker style={style} {...props}>
      {children}
    </NativeScrollViewMarker>
  );
}
