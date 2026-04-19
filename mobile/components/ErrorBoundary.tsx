import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { darkColors, lightColors, T, R, S, type ThemeColors } from "@/constants/theme";
import { Appearance } from "react-native";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDark = Appearance.getColorScheme() !== "light";
    const C: ThemeColors = isDark ? darkColors : lightColors;

    return (
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${C.red}15` }]}>
          <Text style={styles.iconText}>!</Text>
        </View>
        <Text style={[styles.title, { color: C.textPrimary }]}>
          {this.props.fallbackTitle ?? "Something went wrong"}
        </Text>
        <Text style={[styles.message, { color: C.textTertiary }]}>
          {this.state.error?.message ?? "An unexpected error occurred"}
        </Text>
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: C.teal, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: S.xl,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: R.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: S.md,
  },
  iconText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ef4444",
  },
  title: {
    fontSize: T.lg,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginBottom: S.xs,
    textAlign: "center",
  },
  message: {
    fontSize: T.sm,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: S.lg,
    maxWidth: 280,
  },
  button: {
    height: 44,
    paddingHorizontal: S.xl,
    borderRadius: R.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: T.sm,
    fontWeight: "700",
    color: "#000",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
