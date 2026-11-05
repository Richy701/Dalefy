import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S } from "@/constants/theme";

export default function AuthCallbackScreen() {
  const { C } = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  // Read the link from the route itself, so it works whether the app was closed or already open.
  // It arrives either whole as ?link=… or as the sign-in link's own fields (apiKey, oobCode, mode).
  const params = useLocalSearchParams<Record<string, string>>();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (handled) return;
    // The router decodes ?link=… and splits the sign-in link's own fields (oobCode, mode…) into separate params,
    // so put every field back together on whichever base arrived
    const fields = Object.entries(params).filter(([k, v]) => k !== "link" && typeof v === "string") as [string, string][];
    const base = params.link ? String(params.link) : "https://dalefy.app/auth-callback";
    const url = params.link || params.oobCode
      ? `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(fields).toString()}`
      : null;
    if (!url) {
      // Give the route a moment to fill in before saying there's nothing
      const t = setTimeout(() => setError("No link detected"), 2500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- handled is the once-only guard at the top of this effect, so a magic link is redeemed a single time
    setHandled(true);
    setError("");
    auth.handleMagicLinkReturn(url).then((err) => {
      if (err) setError(err);
      else router.replace("/(tabs)");
    });
  }, [auth, router, params, handled]);

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <SafeAreaView style={styles.center}>
        {error ? (
          <>
            <Text style={[styles.title, { color: C.textPrimary }]}>That link didn't work</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{error}</Text>
            <Pressable
              onPress={() => router.replace(auth.isAuthenticated ? "/(tabs)" : "/auth")}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, { backgroundColor: C.teal }, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.buttonText, { color: C.onAccent }]}>{auth.isAuthenticated ? "Back to the app" : "Back to sign in"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={C.teal} />
            <Text style={[styles.sub, { color: C.textSecondary, marginTop: S.lg }]}>
              Signing you in...
            </Text>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: S.xl },
  title: { fontSize: T.xl, fontWeight: "700", marginBottom: S.sm },
  sub: { fontSize: T.base, textAlign: "center" },
  button: { height: 52, alignSelf: "stretch", marginTop: S.xl, borderRadius: R.xl, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: T.md, fontWeight: T.bold },
});
