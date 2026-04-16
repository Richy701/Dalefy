export type ImageSource = "unsplash" | "pexels" | "local" | null;

export interface ImageSearchResult {
  urls: string[];
  source: ImageSource;
}

async function searchUnsplash(query: string, page: number, perPage: number): Promise<string[] | null> {
  const key = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=landscape&client_id=${key}`
    );
    if (!res.ok) {
      console.warn(`[Unsplash] ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    if (!data.results?.length) {
      console.warn(`[Unsplash] 0 results for "${query}"`);
      return null;
    }
    return data.results.map((r: { urls: { regular: string } }) => r.urls.regular);
  } catch (e) {
    console.warn("[Unsplash] fetch failed:", e);
    return null;
  }
}

async function searchPexels(query: string, page: number, perPage: number): Promise<string[] | null> {
  const key = import.meta.env.VITE_PEXELS_API_KEY as string | undefined;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) {
      console.warn(`[Pexels] ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    if (!data.photos?.length) {
      console.warn(`[Pexels] 0 results for "${query}"`);
      return null;
    }
    return data.photos.map((p: { src: { large: string; landscape?: string } }) => p.src.landscape || p.src.large);
  } catch (e) {
    console.warn("[Pexels] fetch failed:", e);
    return null;
  }
}

export async function searchImages(query: string, page = 1, perPage = 9): Promise<ImageSearchResult> {
  if (!query.trim()) return { urls: [], source: null };
  const unsplash = await searchUnsplash(query, page, perPage);
  if (unsplash) return { urls: unsplash, source: "unsplash" };
  const pexels = await searchPexels(query, page, perPage);
  if (pexels) return { urls: pexels, source: "pexels" };
  return { urls: [], source: null };
}

/**
 * Try each candidate query in order; return the first that yields results.
 * Only page 1 is tried per candidate (progressive fallback is about *query*, not paging).
 */
export async function searchImagesProgressive(candidates: string[], perPage = 9): Promise<ImageSearchResult & { matchedQuery?: string }> {
  for (const q of candidates) {
    if (!q.trim()) continue;
    const result = await searchImages(q, 1, perPage);
    if (result.urls.length) {
      return { ...result, matchedQuery: q };
    }
  }
  return { urls: [], source: null };
}
