export default async function handler(req: any, res: any) {
  const { q, page = "1", per_page = "9", source = "" } = req.query as Record<string, string>;

  if (!q) return res.status(400).json({ error: "Missing param: q" });

  const tryGoogle = async () => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return false;
    try {
      const params = new URLSearchParams({ query: q, num: per_page });
      const resp = await fetch(`https://real-time-image-search.p.rapidapi.com/search?${params}`, {
        headers: { "x-rapidapi-key": key, "x-rapidapi-host": "real-time-image-search.p.rapidapi.com" },
      });
      if (resp.ok) {
        const data = await resp.json();
        const urls = (data.data ?? []).map((i: any) => i.thumbnail_url).filter((u: string) => u && !u.includes('encrypted-tbn'));
        if (urls.length) { res.json({ urls, source: "google" }); return true; }
      }
    } catch {}
    return false;
  };

  const tryUnsplash = async () => {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return false;
    try {
      const params = new URLSearchParams({ query: q, per_page, page, orientation: "landscape", client_id: key });
      const resp = await fetch(`https://api.unsplash.com/search/photos?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        const urls = (data.results ?? []).map((r: any) => r.urls?.regular).filter(Boolean);
        if (urls.length) { res.json({ urls, source: "unsplash" }); return true; }
      }
    } catch {}
    return false;
  };

  const tryPexels = async () => {
    const key = process.env.PEXELS_API_KEY;
    if (!key) return false;
    try {
      const params = new URLSearchParams({ query: q, per_page, page, orientation: "landscape" });
      const resp = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key } });
      if (resp.ok) {
        const data = await resp.json();
        const urls = (data.photos ?? []).map((p: any) => p.src?.landscape || p.src?.large).filter(Boolean);
        if (urls.length) { res.json({ urls, source: "pexels" }); return true; }
      }
    } catch {}
    return false;
  };

  if (source === "google") { if (await tryGoogle()) return; }
  else if (source === "unsplash") { if (await tryUnsplash()) return; }
  else if (source === "pexels") { if (await tryPexels()) return; }
  else {
    if (await tryGoogle()) return;
    if (await tryUnsplash()) return;
    if (await tryPexels()) return;
  }

  res.json({ urls: [], source: null });
}
