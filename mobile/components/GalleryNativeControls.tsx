import React from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Host, Button, Picker } from "@expo/ui";
import { useTheme } from "@/context/ThemeContext";

/** SwiftUI controls on iOS and Material Compose controls on Android. */
export function GalleryAction({ label, onPress, disabled = false, primary = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  const { C, isDark } = useTheme();
  const height = primary ? 52 : 44;
  if (Platform.OS === "ios") {
    const { Host: SwiftHost, Button: SwiftButton, Text: SwiftText } = require("@expo/ui/swift-ui");
    const { buttonStyle, controlSize, tint, disabled: disabledModifier, frame, foregroundStyle } = require("@expo/ui/swift-ui/modifiers");
    return <SwiftHost colorScheme={isDark ? "dark" : "light"} style={{ height, width: "100%" }}>
      <SwiftButton onPress={onPress} modifiers={[buttonStyle(primary ? "borderedProminent" : "borderless"), controlSize(primary ? "large" : "regular"), tint(C.teal), disabledModifier(disabled)]}>
        <SwiftText modifiers={[frame({ maxWidth: Infinity, minHeight: primary ? 26 : 24 }), foregroundStyle(primary ? C.onAccent : C.tealText)]}>{label}</SwiftText>
      </SwiftButton>
    </SwiftHost>;
  }
  return <Host colorScheme={isDark ? "dark" : "light"} seedColor={C.teal} style={{ height, width: "100%" }}>
    <Button label={label} onPress={onPress} disabled={disabled} variant={primary ? "filled" : "text"}
      style={{ width: "100%", height }} />
  </Host>;
}

export function GalleryTripPicker({ value, options, onChange, disabled }: {
  value: string; options: { id: string; name: string }[]; onChange: (value: string) => void; disabled: boolean;
}) {
  const { C, isDark } = useTheme();
  return <Host colorScheme={isDark ? "dark" : "light"} seedColor={C.teal} style={{ height: 56, width: "100%" }}>
    <Picker selectedValue={value} onValueChange={onChange} enabled={!disabled} appearance="menu" testID="gallery-trip-picker">
      {!value && <Picker.Item value="" label="Choose a trip" />}
      {options.map(option => <Picker.Item key={option.id} value={option.id} label={option.name} />)}
    </Picker>
  </Host>;
}

export function GalleryProgress({ value, saving }: { value: number; saving: boolean }) {
  const { C, isDark } = useTheme();
  if (saving) return <ActivityIndicator color={C.tealText} accessibilityLabel="Saving photos to the album" />;
  if (Platform.OS === "ios") {
    const { Host: SwiftHost, ProgressView } = require("@expo/ui/swift-ui");
    const { progressViewStyle, tint, frame } = require("@expo/ui/swift-ui/modifiers");
    return <SwiftHost colorScheme={isDark ? "dark" : "light"} style={{ height: 16, width: "100%" }}>
      <ProgressView value={value} modifiers={[progressViewStyle("linear"), tint(C.teal), frame({ maxWidth: Infinity })]} />
    </SwiftHost>;
  }
  if (Platform.OS === "android") {
    const { Host: ComposeHost, LinearProgressIndicator } = require("@expo/ui/jetpack-compose");
    const { fillMaxWidth } = require("@expo/ui/jetpack-compose/modifiers");
    return <ComposeHost colorScheme={isDark ? "dark" : "light"} style={{ height: 16, width: "100%" }}>
      <LinearProgressIndicator progress={value} color={C.teal} modifiers={[fillMaxWidth()]} />
    </ComposeHost>;
  }
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}><ActivityIndicator color={C.tealText} /></View>;
}
