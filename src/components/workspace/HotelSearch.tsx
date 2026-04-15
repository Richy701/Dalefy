import { useState } from "react";
import { Loader2, Hotel, Star, CheckCircle2 } from "lucide-react";
import { searchHotels, type HotelResult } from "@/services/serpapi";
import type { TravelEvent } from "@/types";

interface Props {
  onSelect: (data: Partial<TravelEvent>) => void;
  defaultCheckin?: string;
  defaultCheckout?: string;
}

export function HotelSearch({ onSelect, defaultCheckin, defaultCheckout }: Props) {
  const [query, setQuery] = useState("");
  const [checkin, setCheckin] = useState(defaultCheckin ?? "");
  const [checkout, setCheckout] = useState(defaultCheckout ?? "");
  const [adults, setAdults] = useState(2);
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
      const hotels = await searchHotels(query, checkin, checkout, adults);
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
      price: h.pricePerNight ? `${h.pricePerNight}/night` : "",
      checkin: h.checkin,
      checkout: h.checkout,
      image: h.image || undefined,
      notes: h.amenities?.length ? h.amenities.join(" · ") : undefined,
    });
  };

  const inputCls =
    "w-full h-9 px-3 rounded-lg bg-white dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors";

  return (
    <div className="border-b border-slate-200 dark:border-[#1f1f1f] bg-amber-50/40 dark:bg-amber-950/10">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-500 mb-2">Live Hotel Search</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-[2] min-w-[140px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Location</label>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Hotels in Dubai" className={inputCls} />
          </div>
          <div className="flex-1 min-w-[110px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Check-in</label>
            <input type="date" value={checkin} onChange={e => setCheckin(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1 min-w-[110px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Check-out</label>
            <input type="date" value={checkout} onChange={e => setCheckout(e.target.value)} className={inputCls} />
          </div>
          <div className="w-14">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Pax</label>
            <input type="number" value={adults} onChange={e => setAdults(Number(e.target.value))} min={1} max={99} className={inputCls} />
          </div>
          <button
            type="button"
            onClick={search}
            disabled={loading || !query || !checkin || !checkout}
            className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hotel className="h-3 w-3" />}
            Search
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400 font-medium">{error}</p>}

      {results.length > 0 && (
        <div className="px-4 pb-3 mt-2 space-y-1.5 max-h-44 overflow-y-auto">
          {results.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(h)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                selected === h.name
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40"
                  : "border-slate-200 dark:border-[#252525] hover:border-amber-300 dark:hover:border-amber-800 bg-white dark:bg-[#0d0d0d]"
              }`}
            >
              {h.image ? (
                <img src={h.image} alt={h.name} className="h-10 w-14 object-cover rounded-lg shrink-0" />
              ) : (
                <div className="h-10 w-14 rounded-lg bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                  <Hotel className="h-4 w-4 text-amber-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">{h.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {h.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500">
                      <Star className="h-2.5 w-2.5 fill-amber-500" />{h.rating}
                    </span>
                  )}
                  {h.reviews > 0 && <span className="text-[10px] text-slate-500 dark:text-slate-400">({h.reviews.toLocaleString()})</span>}
                  {h.stars && <span className="text-[10px] text-slate-500 dark:text-[#888888]">· {h.stars}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                {h.pricePerNight && (
                  <>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{h.pricePerNight}</p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">/night</p>
                  </>
                )}
                {selected === h.name && <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
