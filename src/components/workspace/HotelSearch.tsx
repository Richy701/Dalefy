import { useState } from "react";
import { Loader2, Hotel, Flame, CircleCheck, Calendar as CalendarIcon } from "lucide-react";
import { searchHotels, type HotelResult } from "@/services/serpapi";
import type { TravelEvent } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";

interface Props {
  onSelect: (data: Partial<TravelEvent>) => void;
  defaultCheckin?: string;
  defaultCheckout?: string;
}

export function HotelSearch({ onSelect, defaultCheckin, defaultCheckout }: Props) {
  const [query, setQuery] = useState("");
  const [checkin, setCheckin] = useState(defaultCheckin ?? "");
  const [checkout, setCheckout] = useState(defaultCheckout ?? "");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<HotelResult[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const search = async () => {
    if (!query || !checkin || !checkout) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const hotels = await searchHotels(query, checkin, checkout);
      setResults(hotels);
      if (hotels.length === 0) setError("No hotels found — try a different location.");
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const pick = (h: HotelResult) => {
    setSelected(h.name);
    onSelect({
      title: h.name,
      location: query,
      supplier: h.name,
      checkin: h.checkin,
      checkout: h.checkout,
      image: h.image || undefined,
      notes: h.amenities?.length ? h.amenities.join(" · ") : undefined,
    });
  };

  const inputCls =
    "w-full h-11 sm:h-9 px-3 rounded-lg bg-white dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-base sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors";

  return (
    <div className="border-b border-slate-200 dark:border-[#1f1f1f]">
      <div className="px-3 sm:px-4 pt-3 pb-2">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-brand mb-2">Live Hotel Search</p>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-end">
          <div className="col-span-2 sm:flex-[1.5] sm:min-w-[120px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Location</label>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Hotels in Dubai" autoComplete="off" className={inputCls} />
          </div>
          <div className="sm:flex-1 sm:min-w-[115px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Check-in</label>
            <Popover>
              <PopoverTrigger className={`${inputCls} flex items-center justify-between gap-2 text-left whitespace-nowrap overflow-hidden`}>
                <span className={`truncate ${checkin ? "" : "text-slate-400 dark:text-[#555]"}`}>
                  {checkin ? format(parse(checkin, "yyyy-MM-dd", new Date()), "d MMM") : "Select date"}
                </span>
                <CalendarIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-slate-400 dark:text-[#666] shrink-0" />
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto max-w-[calc(100vw-1rem)]">
                <Calendar mode="single" selected={checkin ? parse(checkin, "yyyy-MM-dd", new Date()) : undefined} onSelect={d => d && setCheckin(format(d, "yyyy-MM-dd"))} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="sm:flex-1 sm:min-w-[115px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Check-out</label>
            <Popover>
              <PopoverTrigger className={`${inputCls} flex items-center justify-between gap-2 text-left whitespace-nowrap overflow-hidden`}>
                <span className={`truncate ${checkout ? "" : "text-slate-400 dark:text-[#555]"}`}>
                  {checkout ? format(parse(checkout, "yyyy-MM-dd", new Date()), "d MMM") : "Select date"}
                </span>
                <CalendarIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-slate-400 dark:text-[#666] shrink-0" />
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto max-w-[calc(100vw-1rem)]">
                <Calendar mode="single" selected={checkout ? parse(checkout, "yyyy-MM-dd", new Date()) : undefined} onSelect={d => d && setCheckout(format(d, "yyyy-MM-dd"))} />
              </PopoverContent>
            </Popover>
          </div>
          <button
            type="button"
            onClick={search}
            disabled={loading || !query || !checkin || !checkout}
            className="h-11 sm:h-9 px-4 rounded-lg bg-brand hover:bg-brand/80 disabled:opacity-40 text-black text-[11px] sm:text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" /> : <Hotel className="h-4 w-4 sm:h-3 sm:w-3" />}
            Search
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400 font-medium">{error}</p>}

      {results.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 mt-2 space-y-1.5 max-h-60 sm:max-h-44 overflow-y-auto">
          {results.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(h)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                selected === h.name
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 dark:border-[#252525] hover:border-brand/40 bg-white dark:bg-[#0d0d0d]"
              }`}
            >
              {h.image ? (
                <img src={h.image} alt={h.name} className="h-10 w-14 object-cover rounded-lg shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="h-10 w-14 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Hotel className="h-4 w-4 text-brand" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">{h.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {h.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-brand">
                      <Flame className="h-2.5 w-2.5 fill-brand" />{h.rating}
                    </span>
                  )}
                  {h.reviews > 0 && <span className="text-[10px] text-slate-500 dark:text-slate-400">({h.reviews.toLocaleString()})</span>}
                  {h.stars && <span className="text-[10px] text-slate-500 dark:text-[#888888]">· {h.stars}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                {selected === h.name && <CircleCheck className="h-3.5 w-3.5 text-brand" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
