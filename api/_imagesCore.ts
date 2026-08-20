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

/** The subsets of each image provider's response this module reads. */
interface SerpApiResponse { images_results?: { original?: string }[] }
interface UnsplashResponse { results?: { urls?: { regular?: string } }[] }
interface PexelsResponse { photos?: { src?: { landscape?: string; large?: string } }[] }

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
        const data = await resp.json() as SerpApiResponse;
        const urls = (data.images_results ?? []).slice(0, parseInt(perPage)).map(i => i.original).filter((u): u is string => !!u);
        if (urls.length) return { urls, source: "google" };
      }
    } catch { /* fall through to the next provider */ }
    return null;
  };

  const tryUnsplash = async () => {
    if (!keys.unsplash) return null;
    try {
      const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape", client_id: keys.unsplash });
      const resp = await fetchWithTimeout(`https://api.unsplash.com/search/photos?${params}`);
      if (resp.ok) {
        const data = await resp.json() as UnsplashResponse;
        const urls = (data.results ?? []).map(r => r.urls?.regular).filter((u): u is string => !!u);
        if (urls.length) return { urls, source: "unsplash" };
      }
    } catch { /* fall through to the next provider */ }
    return null;
  };

  const tryPexels = async () => {
    if (!keys.pexels) return null;
    try {
      const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape" });
      const resp = await fetchWithTimeout(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: keys.pexels } });
      if (resp.ok) {
        const data = await resp.json() as PexelsResponse;
        const urls = (data.photos ?? []).map(p => p.src?.landscape || p.src?.large).filter((u): u is string => !!u);
        if (urls.length) return { urls, source: "pexels" };
      }
    } catch { /* fall through to the next provider */ }
    return null;
  };

  let result: { urls: string[]; source: string | null } | null = null;
  if (source === "google") result = await tryGoogle();
  else if (source === "unsplash") result = await tryUnsplash();
  else if (source === "pexels") result = await tryPexels();
  else result = (await tryGoogle()) ?? (await tryUnsplash()) ?? (await tryPexels());

  return result ?? { urls: [], source: null };
}
