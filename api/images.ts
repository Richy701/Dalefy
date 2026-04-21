export default async function handler(req: any, res: any) {
  const { q, page = "1", per_page = "9" } = req.query as Record<string, string>;

  if (!q) return res.status(400).json({ error: "Missing param: q" });

  // Try Unsplash first, then Pexels
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (unsplashKey) {
    try {
      const params = new URLSearchParams({
        query: q,
        per_page,
        page,
        orientation: "landscape",
        client_id: unsplashKey,
      });
      const resp = await fetch(`https://api.unsplash.com/search/photos?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        const urls = (data.results ?? []).map((r: any) => r.urls?.regular).filter(Boolean);
        if (urls.length) return res.json({ urls, source: "unsplash" });
      }
    } catch {}
  }

  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    try {
      const params = new URLSearchParams({
        query: q,
        per_page,
        page,
        orientation: "landscape",
      });
      const resp = await fetch(`https://api.pexels.com/v1/search?${params}`, {
        headers: { Authorization: pexelsKey },
      });
      if (resp.ok) {
        const data = await resp.json();
        const urls = (data.photos ?? []).map((p: any) => p.src?.landscape || p.src?.large).filter(Boolean);
        if (urls.length) return res.json({ urls, source: "pexels" });
      }
    } catch {}
  }

  res.json({ urls: [], source: null });
}
