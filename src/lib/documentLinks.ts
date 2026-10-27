/**
 * Hyperlinks inside an uploaded itinerary. PDF link annotations and Word hyperlinks carry their URL out of
 * band, so plain text extraction (and the AI reading the page) only sees the blue words. These helpers pull
 * the URL back out with the words it sits under, so "Thailand travel advice on GOV.UK" reaches the trip
 * as a tappable link.
 */
export interface DocLink {
  text: string;
  url: string;
}

interface PdfTextItem { str?: string; transform?: number[]; width?: number; height?: number }
interface PdfAnnotation { subtype?: string; url?: string; unsafeUrl?: string; rect?: number[] }
/** The slice of pdfjs's document we read; typed loosely so the real PDFDocumentProxy fits */
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{ getAnnotations(): Promise<unknown[]>; getTextContent(): Promise<{ items: unknown[] }> }>;
}

const isHttp = (url: string) => /^https?:\/\//i.test(url) || /^mailto:/i.test(url);

function dedupe(links: DocLink[]): DocLink[] {
  const seen = new Set<string>();
  return links.filter(l => {
    const key = `${l.text.toLowerCase()}|${l.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every Link annotation on every page, with the text that lies inside its box */
export async function pdfLinks(doc: PdfDocLike): Promise<DocLink[]> {
  const links: DocLink[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const annotations = (await page.getAnnotations().catch(() => [])) as PdfAnnotation[];
    const targets = annotations.filter(a => a.subtype === "Link" && (a.url || a.unsafeUrl) && Array.isArray(a.rect) && a.rect.length === 4);
    if (!targets.length) continue;
    const items = (await page.getTextContent()).items as PdfTextItem[];
    for (const a of targets) {
      const url = (a.url || a.unsafeUrl) as string;
      if (!isHttp(url)) continue;
      const [x1, y1, x2, y2] = [Math.min(a.rect![0], a.rect![2]), Math.min(a.rect![1], a.rect![3]), Math.max(a.rect![0], a.rect![2]), Math.max(a.rect![1], a.rect![3])];
      const words: string[] = [];
      for (const it of items) {
        if (!it.str?.trim() || !it.transform) continue;
        const ix = it.transform[4], iy = it.transform[5];
        const iw = it.width ?? 0, ih = it.height ?? (Math.abs(it.transform[3]) || 10);
        const cy = iy + ih / 2;
        if (cy < y1 - 3 || cy > y2 + 3) continue;
        const overlap = Math.min(ix + iw, x2) - Math.max(ix, x1);
        if (overlap <= 0 || overlap < Math.min(iw, x2 - x1) * 0.5) continue;
        if (ix >= x1 - 2 && ix + iw <= x2 + 2) { words.push(it.str.trim()); continue; }
        // One run spanning past the box (the link words sharing a line with plain text): keep the part under it
        const perChar = iw / it.str.length;
        let from = Math.max(0, Math.round((x1 - ix) / perChar));
        let to = Math.min(it.str.length, Math.round((x2 - ix) / perChar));
        // Proportional fonts make the estimate a character or two off: widen to whole words
        while (from > 0 && it.str[from - 1] !== " ") from--;
        while (to < it.str.length && it.str[to] !== " ") to++;
        const part = it.str.slice(from, to).trim();
        if (part) words.push(part);
      }
      const text = words.join(" ").replace(/\s+/g, " ").trim();
      links.push({ text: text || url, url });
    }
  }
  return dedupe(links);
}

/** Word hyperlinks: the relationship file maps each r:id to its target URL */
export function docxLinks(documentXml: string, relsXml: string): DocLink[] {
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\/hyperlink"/.test(tag)) continue;
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target.replace(/&amp;/g, "&"));
  }
  const links: DocLink[] = [];
  for (const m of documentXml.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g)) {
    const id = m[1].match(/\br:id="([^"]+)"/)?.[1];
    const url = id ? targets.get(id) : undefined;
    if (!url || !isHttp(url)) continue;
    const text = [...m[2].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join("").replace(/\s+/g, " ").trim();
    links.push({ text: text || url, url });
  }
  return dedupe(links);
}

/** The block handed to the parser beside the document, so URLs land in the text it writes */
export function formatLinks(links: DocLink[]): string {
  if (!links.length) return "";
  return "Hyperlinks in the document (the words, then where they point):\n" + links.map(l => `- ${l.text}: ${l.url}`).join("\n");
}
