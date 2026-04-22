import { logger } from "@/lib/logger";

export type ImageSource = "google" | "unsplash" | "pexels" | "local" | null;

export interface ImageSearchResult {
  urls: string[];
  source: ImageSource;
}

export async function searchImages(query: string, page = 1, perPage = 9, preferredSource?: ImageSource): Promise<ImageSearchResult> {
  if (!query.trim()) return { urls: [], source: null };

  try {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      per_page: String(perPage),
    });
    if (preferredSource) params.set("source", preferredSource);
    const res = await fetch(`/api/images?${params}`);
    if (!res.ok) {
      logger.warn("ImageSearch", `${res.status} ${res.statusText}`);
      return { urls: [], source: null };
    }
    const data = await res.json();
    return {
      urls: data.urls ?? [],
      source: data.source as ImageSource,
    };
  } catch (e) {
    logger.warn("ImageSearch", "fetch failed:", e);
    return { urls: [], source: null };
  }
}

/**
 * Try each candidate query in order; return the first that yields results.
 * Only page 1 is tried per candidate (progressive fallback is about *query*, not paging).
 */
export async function searchImagesProgressive(candidates: string[], perPage = 9, preferredSource?: ImageSource): Promise<ImageSearchResult & { matchedQuery?: string }> {
  for (const q of candidates) {
    if (!q.trim()) continue;
    const result = await searchImages(q, 1, perPage, preferredSource);
    if (result.urls.length) {
      return { ...result, matchedQuery: q };
    }
  }
  return { urls: [], source: null };
}
