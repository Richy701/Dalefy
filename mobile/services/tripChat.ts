import { firebaseAuth, waitForAuth } from "./firebase";

const API_BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app").replace(/\/$/, "");

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /** Events the answer is about, shown as tappable cards under it */
  eventIds?: string[];
  error?: boolean;
}

/** The traveller's own clock, so "tomorrow" and "next" mean their tomorrow */
function localNow(): string {
  const d = new Date();
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${date}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Asks Dale, the trip concierge. The server reads the trip itself; only the conversation is sent. */
export async function askTrip(tripId: string, turns: ChatTurn[]): Promise<{ reply: string; eventIds: string[] }> {
  await waitForAuth();
  const token = await firebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to ask about your trip");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE}/api/trip-chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        now: localNow(),
        messages: turns.filter(t => !t.error).map(t => ({ role: t.role, content: t.content })),
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.error === "string" && response.status < 500 ? data.error : "Couldn't reach Dale. Try again in a moment.");
    return { reply: String(data?.reply ?? ""), eventIds: Array.isArray(data?.eventIds) ? data.eventIds : [] };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("That took too long. Try again in a moment.");
    // fetch rejects with a TypeError when offline
    throw e instanceof Error && !(e instanceof TypeError) ? e : new Error("Couldn't reach Dale. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

/** A traveller's own photo goes onto the trips they're linked to where the organiser hasn't attached one */
export async function shareMyPhoto(avatar: string): Promise<void> {
  if (!/^https:\/\//.test(avatar)) return;
  const token = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!token) return;
  await fetch(`${API_BASE}/api/my-photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ avatar }),
  }).catch(() => {});
}
