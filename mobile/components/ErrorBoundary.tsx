import React from "react";
import { View, StyleSheet } from "react-native";
import { Appearance } from "react-native";
import { Warning } from "phosphor-react-native";
import { darkColors, lightColors, type ThemeColors } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";

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
      <View style={[styles.container, { backgroundColor: C.bg }]} accessibilityRole="alert">
        <EmptyState
          icon={<Warning size={28} color={C.red} weight="regular" />}
          title={this.props.fallbackTitle ?? "Something went wrong"}
          message={this.state.error?.message ?? "An unexpected error occurred"}
          cta={{ label: "Try again", onPress: this.reset }}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
