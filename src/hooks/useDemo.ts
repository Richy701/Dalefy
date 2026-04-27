import { useCallback, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Provides demo-mode state and a gate function that intercepts
 * write actions for demo users and opens an upgrade prompt instead.
 */
export function useDemo() {
  const { user } = useAuth();
  const isDemo = user?.id === "demo";
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /** Call before any write action. Returns `true` if blocked (demo user). */
  const demoGate = useCallback(() => {
    if (isDemo) {
      setUpgradeOpen(true);
      return true; // blocked
    }
    return false;
  }, [isDemo]);

  return { isDemo, demoGate, upgradeOpen, setUpgradeOpen };
}
