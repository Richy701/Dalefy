import { View, Text, Image } from "react-native";
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
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: uri ? C.elevated : `${fill}22`,
        ...(ringColor ? { borderWidth: 2, borderColor: ringColor } : {}),
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontSize: Math.max(T["2xs"], Math.round(size * 0.38)), fontWeight: T.bold, color: fill }}>
          {initials ?? "?"}
        </Text>
      )}
    </View>
  );
}
