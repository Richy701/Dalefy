import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
  runOnJS, Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "./ThemeContext";
import { T, R, S } from "@/constants/theme";

type ToastType = "success" | "error";

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hide = useCallback(() => {
    translateY.value = withTiming(-60, { duration: 250, easing: Easing.in(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 200 });
    scale.value = withTiming(0.8, { duration: 250 });
  }, []);

  const toast = useCallback((msg: string, t: ToastType = "success") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    setType(t);
    Haptics.notificationAsync(
      t === "success"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );
    translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSpring(1, { damping: 14, stiffness: 200 });
    timeoutRef.current = setTimeout(() => {
      hide();
    }, 2200);
  }, [hide]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Animated.View
        style={[
          styles.toast,
          { top: insets.top + 4 },
          animStyle,
        ]}
        pointerEvents="none"
      >
        <BlurView
          intensity={80}
          tint={isDark ? "dark" : "light"}
          style={[StyleSheet.absoluteFillObject, { borderRadius: 50 }]}
        />
        <Text style={[styles.text, { color: type === "error" ? "#ff453a" : C.textPrimary }]} numberOfLines={1}>
          {message}
        </Text>
      </Animated.View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    left: "auto" as any,
    right: "auto" as any,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 50,
    zIndex: 9999,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    fontSize: T.sm,
    fontWeight: "600",
    textAlign: "center",
  },
});
