import { validateQuery } from "./_validate.js";
import { rateLimit } from "./_rateLimit.js";
import { searchImages } from "./_imagesCore.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "images", limit: 60, windowMs: 60_000 })) return;

  const { q, page = "1", per_page = "9", source = "" } = req.query as Record<string, string>;

  const err = validateQuery(q);
  if (err) return res.status(400).json({ error: err });

  const payload = await searchImages(
    { q, page, perPage: per_page, source },
    {
      serpapi: process.env.SERPAPI_KEY,
      unsplash: process.env.UNSPLASH_ACCESS_KEY,
      pexels: process.env.PEXELS_API_KEY,
    },
  );
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
  res.json(payload);
}
