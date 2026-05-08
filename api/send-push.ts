import { listCollection, decodeValue } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  const { deviceId, title, body } = req.body ?? {};
  if (!deviceId || !title || !body) {
    return res.status(400).json({ error: "deviceId, title, and body required" });
  }

  try {
    const allTokens = await listCollection("push_tokens");
    let pushToken: string | null = null;

    for (const doc of allTokens) {
      const fields = doc.fields ?? {};
      if (decodeValue(fields.device_id) === deviceId) {
        pushToken = decodeValue(fields.token);
        break;
      }
    }

    if (!pushToken) {
      return res.json({ sent: 0, reason: "No push token found for this device" });
    }

    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify([{ to: pushToken, title, body, sound: "default" }]),
    });
    const result = await resp.json();

    res.json({ sent: 1, result });
  } catch (err: any) {
    console.error("[send-push] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
