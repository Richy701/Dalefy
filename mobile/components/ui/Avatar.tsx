import { View, Text, Image } from "react-native";
import { useState } from "react";
import { T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

/** Circle avatar: photo if available, else initials on a tinted fill. */
export function Avatar({ size = 32, uri, initials, color, ringColor }: {
  size?: number;
  uri?: string | null;
  initials?: string;
  color?: string;
  ringColor?: string;
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
        backgroundColor: showPhoto ? C.elevated : `${fill}22`,
        ...(ringColor ? { borderWidth: 2, borderColor: ringColor } : {}),
      }}
    >
      {showPhoto ? (
        <Image source={{ uri: uri! }} style={{ width: size, height: size }} onError={() => setFailedUri(uri!)} />
      ) : (
        <Text style={{ fontSize: Math.max(T["2xs"], Math.round(size * 0.38)), fontWeight: T.bold, color: fill }}>
          {initials ?? "?"}
        </Text>
      )}
    </View>
  );
}
