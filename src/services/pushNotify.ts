import { supabase } from "./supabase";
import { isSupabaseConfigured } from "./supabase";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: string;
}

export async function notifyTripUpdate(tripId: string, tripName: string, action: "published" | "updated") {
  if (!isSupabaseConfigured()) return;

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token");

  if (!tokens?.length) return;

  const title = action === "published" ? "Trip Published" : "Trip Updated";
  const body = action === "published"
    ? `"${tripName}" is now live — check your itinerary!`
    : `"${tripName}" has been updated.`;

  const messages: PushMessage[] = tokens.map(({ token }) => ({
    to: token,
    title,
    body,
    data: { tripId },
    sound: "default",
  }));

  // Expo Push API supports batches of up to 100
  const chunks: PushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(chunk),
    }).catch(() => {});
  }
}
