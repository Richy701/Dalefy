/**
 * Shared core for destination image search: SerpAPI → Unsplash → Pexels
 * fallback chain. Imported by BOTH api/images.ts (Vercel) and vite.config.ts
 * (local dev) so response shapes can never drift.
 */

export interface ImageSearchParams {
  q: string;
  page: string;
  perPage: string;
  source: string;
}

export interface ImageKeys {
  serpapi?: string;
  unsplash?: string;
  pexels?: string;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchImages(
  { q, page, perPage, source }: ImageSearchParams,
  keys: ImageKeys,
): Promise<{ urls: string[]; source: string | null }> {
  const tryGoogle = async () => {
    if (!keys.serpapi) return null;
    try {
      const start = (parseInt(page) - 1) * parseInt(perPage);
      const params = new URLSearchParams({ engine: "google_images", q, num: perPage, ijn: String(Math.floor(start / 100)), api_key: keys.serpapi });
      const resp = await fetchWithTimeout(`https://serpapi.com/search.json?${params}`);
      if (resp.ok) {
        const data: any = await resp.json();
        const urls = (data.images_results ?? []).slice(0, parseInt(perPage)).map((i: any) => i.original).filter(Boolean);
        if (urls.length) return { urls, source: "google" };
      }
    } catch {}
    return null;
  };

  const tryUnsplash = async () => {
    if (!keys.unsplash) return null;
    try {
      const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape", client_id: keys.unsplash });
      const resp = await fetchWithTimeout(`https://api.unsplash.com/search/photos?${params}`);
      if (resp.ok) {
        const data: any = await resp.json();
        const urls = (data.results ?? []).map((r: any) => r.urls?.regular).filter(Boolean);
        if (urls.length) return { urls, source: "unsplash" };
      }
    } catch {}
    return null;
  };

  const tryPexels = async () => {
    if (!keys.pexels) return null;
    try {
      const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape" });
      const resp = await fetchWithTimeout(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: keys.pexels } });
      if (resp.ok) {
        const data: any = await resp.json();
        const urls = (data.photos ?? []).map((p: any) => p.src?.landscape || p.src?.large).filter(Boolean);
        if (urls.length) return { urls, source: "pexels" };
      }
    } catch {}
    return null;
  };

  let result: { urls: string[]; source: string | null } | null = null;
  if (source === "google") result = await tryGoogle();
  else if (source === "unsplash") result = await tryUnsplash();
  else if (source === "pexels") result = await tryPexels();
  else result = (await tryGoogle()) ?? (await tryUnsplash()) ?? (await tryPexels());

  return result ?? { urls: [], source: null };
}
