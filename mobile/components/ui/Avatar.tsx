import { View, Text, Image } from "react-native";
import { useState } from "react";
import { T, type ThemeColors } from "@/constants/theme";

/** The signed-in traveller's avatar colour: the app's accent, the same on Home and Profile */
export function avatarColor(_name: string, C: ThemeColors): string {
  return C.teal;
}
import { useTheme } from "@/context/ThemeContext";

/** Circle avatar: photo if available, else initials on a tinted fill. */
export function Avatar({ size = 32, uri, initials, color, ringColor, solid = false }: {
  size?: number;
  uri?: string | null;
  initials?: string;
  color?: string;
  ringColor?: string;
  /** A solid circle (for over photos, where the soft tint turns see-through) */
  solid?: boolean;
}) {
  const { C } = useTheme();
  const fill = color ?? C.teal;
  // A photo that fails to load falls back to the initials instead of an empty circle
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showPhoto = !!uri && uri !== failedUri;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: showPhoto ? C.elevated : solid ? fill : `${fill}22`,
        ...(ringColor ? { borderWidth: 2, borderColor: ringColor } : {}),
      }}
    >
      {showPhoto ? (
        <Image source={{ uri: uri! }} style={{ width: size, height: size }} onError={() => setFailedUri(uri!)} />
      ) : (
        <Text style={{ fontSize: Math.max(T["2xs"], Math.round(size * 0.38)), fontWeight: T.bold, color: solid ? "rgba(0,0,0,0.82)" : fill }}>
          {initials ?? "?"}
        </Text>
      )}
    </View>
  );
}
