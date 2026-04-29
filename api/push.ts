import { verifyFirebaseToken } from "./_verifyToken.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const cronOk = auth === `Bearer ${process.env.CRON_SECRET}`;

  if (!cronOk) {
    const token = auth.replace("Bearer ", "");
    const payload = await verifyFirebaseToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { tokens, title, body, data } = req.body ?? {};

  if (!Array.isArray(tokens) || !tokens.length || tokens.length > 500 || !title || !body) {
    return res.status(400).json({ error: "Invalid params: tokens (max 500), title, body required" });
  }
  if (typeof title !== "string" || title.length > 200 || typeof body !== "string" || body.length > 1000) {
    return res.status(400).json({ error: "Title max 200 chars, body max 1000 chars" });
  }

  const messages = tokens.map((token: string) => ({
    to: token,
    title,
    body,
    data: data ?? {},
    sound: "default",
  }));

  // Expo Push API supports batches of up to 100
  const results: any[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      const data = await resp.json();
      results.push(data);
    } catch (err) {
      results.push({ error: "Failed to send chunk" });
    }
  }

  res.json({ sent: messages.length, results });
}
