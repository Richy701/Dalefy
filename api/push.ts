export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { tokens, title, body, data } = req.body ?? {};

  if (!tokens?.length || !title || !body) {
    return res.status(400).json({ error: "Missing params: tokens, title, body" });
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
