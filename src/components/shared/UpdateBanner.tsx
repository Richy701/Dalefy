import { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window { __dafUpdateReady?: boolean }
}

/** A new version was deployed while this tab was open (public/registerSW.js): offer the refresh instead of forcing it */
export function UpdateBanner() {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.__dafUpdateReady);
  useEffect(() => {
    const on = () => setReady(true);
    window.addEventListener("daf-update-ready", on);
    return () => window.removeEventListener("daf-update-ready", on);
  }, []);
  if (!ready) return null;
  return (
    <div role="status" aria-live="polite" className="bg-secondary border-b border-border px-4 py-2 flex items-center gap-3">
      <ArrowClockwise className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className="flex-1 min-w-0 text-xs text-foreground truncate">
        <span className="font-semibold">A new version of Dalefy is ready.</span>{" "}
        <span className="text-muted-foreground">Refresh to get it. Your saved work stays.</span>
      </p>
      <Button size="sm" onClick={() => window.location.reload()} className="shrink-0 text-xs font-semibold">Refresh</Button>
    </div>
  );
}
