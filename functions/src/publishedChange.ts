/** Rotating a Firebase download token does not change the published itinerary. */
function contentWithoutDownloadTokens(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/https:\/\/firebasestorage\.googleapis\.com\/[^\s<>"')]+/g, match => {
      try {
        const url = new URL(match);
        url.searchParams.delete("token");
        return url.toString();
      } catch { return match; }
    });
  }
  if (Array.isArray(value)) return value.map(contentWithoutDownloadTokens);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, contentWithoutDownloadTokens(item)]));
  }
  return value;
}

export function hasPublishedContentChanged(before: unknown, after: unknown): boolean {
  return !!after && JSON.stringify(contentWithoutDownloadTokens(before)) !== JSON.stringify(contentWithoutDownloadTokens(after));
}
