import { collection, getDocs } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "./firebase";

export async function notifyTripUpdate(tripId: string, tripName: string, action: "published" | "updated") {
  if (!isFirebaseConfigured()) return;

  let snap;
  try {
    snap = await getDocs(collection(firebaseDb(), "push_tokens"));
  } catch {
    return; // push_tokens not accessible — skip silently
  }
  const tokens = snap.docs.map(d => d.data().token as string).filter(Boolean);

  if (!tokens.length) return;

  const title = action === "published" ? "Trip Published" : "Trip Updated";
  const body = action === "published"
    ? `"${tripName}" is now live — check your itinerary!`
    : `"${tripName}" has been updated.`;

  // Send via server-side proxy to avoid exposing push tokens
  fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, title, body, data: { tripId } }),
  }).catch(() => {});
}
