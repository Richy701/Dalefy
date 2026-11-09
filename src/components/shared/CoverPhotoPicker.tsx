import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, MagnifyingGlass, SpinnerGap, Upload, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COVER_IMAGES } from "@/data/images";
import { searchImages } from "@/services/imageSearch";

const PER_PAGE = 9;

/** Reopening a trip shouldn't spend another search on the same destination */
const searchCache = new Map<string, string[]>();

/** Previous, the page number and Next, under a set of photo results */
export function ImagePager({ page, busy, atEnd, onPage }: { page: number; busy: boolean; atEnd: boolean; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        <CaretLeft className="h-3.5 w-3.5" /> Previous
      </Button>
      <span className="text-xs font-medium tabular-nums text-muted-foreground" aria-live="polite">Page {page}</span>
      <Button type="button" variant="secondary" size="sm" disabled={busy || atEnd} onClick={() => onPage(page + 1)}>
        Next <CaretRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Finds a trip's banner: starts on the destination's photos, with stock covers when a search comes back empty */
export function CoverPhotoPicker({ value, onChange, destination, source, onUploadClick }: {
  value?: string;
  onChange: (url: string) => void;
  destination?: string;
  source?: Parameters<typeof searchImages>[3];
  onUploadClick?: () => void;
}) {
  // "Thailand (Bangkok, Phuket)" searches better as "Thailand"
  const suggested = (destination ?? "").split("(")[0].trim();
  const [typed, setTyped] = useState<string | null>(null);
  const query = typed ?? suggested;
  const [results, setResults] = useState<string[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [page, setPage] = useState(1);
  const [atEnd, setAtEnd] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const search = async (text: string, nextPage = 1) => {
    const q = text.trim();
    if (!q) return;
    const request = ++latestRequest.current;
    setSearching(true);
    setNotice(null);
    try {
      const key = `${q}|${nextPage}|${source ?? "auto"}`;
      const urls = searchCache.get(key) ?? (await searchImages(q, nextPage, PER_PAGE, source)).urls;
      if (request !== latestRequest.current) return;
      if (urls.length) {
        searchCache.set(key, urls);
        setResults(urls);
        setLastQuery(q);
        setPage(nextPage);
        setAtEnd(false);
      } else if (nextPage > 1) {
        setAtEnd(true);
        setNotice(`That's all the photos for "${q}".`);
      } else {
        setResults([]);
        setLastQuery("");
        setPage(1);
        setNotice(`No photos found for "${q}". Here are our stock covers instead.`);
      }
    } finally {
      if (request === latestRequest.current) setSearching(false);
    }
  };

  const searchOnOpen = useRef(search);
  useEffect(() => {
    if (suggested) void searchOnOpen.current(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the destination known when the picker opens searches by itself, so typing one doesn't spend a search per pause
  }, []);

  const clear = () => {
    latestRequest.current++;
    setTyped("");
    setResults([]);
    setLastQuery("");
    setPage(1);
    setAtEnd(false);
    setNotice(null);
    setSearching(false);
  };

  const tile = (selected: boolean) =>
    `relative aspect-video rounded-xl overflow-hidden border-2 transition-colors ${selected ? "border-brand" : "border-transparent hover:border-border"}`;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void search(query); } }}
            placeholder="Search photos, e.g. Maasai Mara"
            aria-label="Search cover photos"
            className="w-full pl-9 pr-9"
          />
          {query && (
            <button type="button" onClick={clear} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button type="button" onClick={() => void search(query)} disabled={searching || !query.trim()}>
          {searching ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : <MagnifyingGlass className="h-3.5 w-3.5" />}
          Search
        </Button>
        {onUploadClick && (
          <Button type="button" variant="secondary" onClick={onUploadClick}>
            <Upload className="h-3.5 w-3.5" /> Upload your own
          </Button>
        )}
      </div>

      {notice && <p className="text-xs text-muted-foreground" role="status">{notice}</p>}

      {results.length > 0 ? (
        <>
          <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 transition-opacity ${searching ? "opacity-50" : ""}`}>
            {results.map(url => (
              <button key={url} type="button" onClick={() => onChange(url)} aria-label={`Use this photo${lastQuery ? ` of ${lastQuery}` : ""}`} aria-pressed={value === url} className={tile(value === url)}>
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
              </button>
            ))}
          </div>
          <ImagePager page={page} busy={searching} atEnd={atEnd} onPage={next => void search(lastQuery, next)} />
        </>
      ) : searching ? (
        <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
          <SpinnerGap className="h-4 w-4 animate-spin text-brand" />
          <span className="text-xs font-medium">Searching…</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COVER_IMAGES.map(({ url, label }) => (
            <button key={url} type="button" onClick={() => onChange(url)} aria-pressed={value === url} className={tile(value === url)}>
              <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 to-black/10" />
              <span className="absolute bottom-1.5 left-0 right-0 text-center text-[11px] font-medium text-white">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
