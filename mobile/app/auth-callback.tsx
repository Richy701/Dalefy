import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { T, S } from "@/constants/theme";

export default function AuthCallbackScreen() {
  const { C } = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = async () => {
      const url = await Linking.getInitialURL();
      if (!url) {
        setError("No link detected");
        return;
      }

      const err = await auth.handleMagicLinkReturn(url);
      if (err) {
        setError(err);
      } else {
        router.replace("/(tabs)");
      }
    };

    handle();
  }, [auth, router]);

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <SafeAreaView style={styles.center}>
        {error ? (
          <>
            <Text style={[styles.title, { color: C.textPrimary }]}>Something went wrong</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{error}</Text>
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
});
