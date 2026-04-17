import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay,
  runOnJS, Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, AlertCircle } from "lucide-react-native";
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
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hide = useCallback(() => {
    translateY.value = withTiming(-100, { duration: 250, easing: Easing.in(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 250 });
  }, []);

  const toast = useCallback((msg: string, t: ToastType = "success") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    setType(t);
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 300 });
    timeoutRef.current = setTimeout(() => {
      hide();
    }, 2500);
  }, [hide]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const Icon = type === "success" ? Check : AlertCircle;
  const iconColor = type === "success" ? C.teal : "#ef4444";

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Animated.View
        style={[
          styles.toast,
          {
            top: insets.top + 8,
            backgroundColor: C.card,
          },
          animStyle,
        ]}
        pointerEvents="none"
      >
        <Icon size={16} color={iconColor} strokeWidth={2} />
        <Text style={[styles.text, { color: C.textPrimary }]} numberOfLines={1}>
          {message}
        </Text>
      </Animated.View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: S.lg,
    right: S.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    borderRadius: R.xl,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    fontSize: T.sm,
    fontWeight: "600",
    flex: 1,
  },
});
