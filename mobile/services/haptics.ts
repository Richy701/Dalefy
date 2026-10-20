import * as ExpoHaptics from "expo-haptics";

/**
 * Drop-in for `expo-haptics` that respects the Haptic feedback switch in Profile.
 * PreferencesProvider keeps `enabled` in sync; screens import this instead of expo-haptics.
 */
let enabled = true;

export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

export function selectionAsync(): Promise<void> {
  return enabled ? ExpoHaptics.selectionAsync() : Promise.resolve();
}

export function impactAsync(style?: ExpoHaptics.ImpactFeedbackStyle): Promise<void> {
  return enabled ? ExpoHaptics.impactAsync(style) : Promise.resolve();
}

export function notificationAsync(type?: ExpoHaptics.NotificationFeedbackType): Promise<void> {
  return enabled ? ExpoHaptics.notificationAsync(type) : Promise.resolve();
}
