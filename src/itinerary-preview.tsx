import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { SharedTripView } from "@/pages/SharedTripPage";
import "./index.css";

export type ItineraryPreviewPayload = Pick<ComponentProps<typeof SharedTripView>, "trip" | "brand"> & { theme: "light" | "dim" };

/**
 * The traveller page at a real phone width, for the organiser's preview. It runs in its own frame because the page's
 * layout follows the screen width, which a narrow box inside the Workspace can't change. It only ever shows what the
 * parent window sends, and has no login, database or write access.
 */
function ItineraryPreview() {
  const [data, setData] = useState<ItineraryPreviewPayload | null>(null);
  const [theme, setTheme] = useState<"light" | "dim">("dim");
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("light", "dim");
    html.classList.add(theme);
    html.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme]);
  const toggle = useCallback(() => setTheme(current => (current === "light" ? "dim" : "light")), []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== "dalefy:itinerary-preview") return;
      const next = event.data.payload as ItineraryPreviewPayload;
      if (!next?.trip?.id || !Array.isArray(next.trip.events) || !next.brand) return;
      setTheme(next.theme);
      setData(next);
    };
    window.addEventListener("message", receive);
    parent.postMessage({ type: "dalefy:itinerary-preview-ready" }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  return data && <SharedTripView trip={data.trip} brand={data.brand} preview themeControl={{ theme, toggle }} />;
}

createRoot(document.getElementById("root")!).render(<ItineraryPreview />);
