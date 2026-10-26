import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

const QuickLook = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ preview(path: string, title?: string): Promise<void> }>("DalefyQuickLook")
  : null;

/** True when this build has the in-app viewer; builds before it fall back to opening the link */
export const canQuickLook = !!QuickLook;

export function quickLook(path: string, title?: string): Promise<void> {
  if (!QuickLook) return Promise.reject(new Error("Quick Look unavailable"));
  return QuickLook.preview(path, title);
}
