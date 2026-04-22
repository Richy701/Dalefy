import { useState } from "react";
import { Loader2, Compass, Star, CheckCircle2 } from "lucide-react";
import { searchActivities, type ActivityResult } from "@/services/serpapi";
import type { TravelEvent } from "@/types";

interface Props {
  onSelect: (data: Partial<TravelEvent>) => void;
}

export function ActivitySearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ActivityResult[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const search = async () => {
    if (!query) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const activities = await searchActivities(query);
      setResults(activities);
      if (activities.length === 0) setError("No activities found — try a different location.");
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const pick = (a: ActivityResult) => {
    setSelected(a.name);
    onSelect({
      title: a.name,
      location: a.address || query,
      supplier: a.type || undefined,
      image: a.image || undefined,
      notes: [a.type, a.openStatus].filter(Boolean).join(" · ") || undefined,
    });
  };

  const inputCls =
    "w-full h-11 sm:h-9 px-3 rounded-lg bg-white dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-base sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors";

  return (
    <div className="border-b border-slate-200 dark:border-[#1f1f1f]">
      <div className="px-3 sm:px-4 pt-3 pb-2">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-brand mb-2">Activity Search</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Location</label>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Dubai" autoComplete="off" className={inputCls} />
          </div>
          <button
            type="button"
            onClick={search}
            disabled={loading || !query}
            className="h-11 sm:h-9 px-4 rounded-lg bg-brand hover:opacity-90 disabled:opacity-40 text-black text-[11px] sm:text-[10px] font-black uppercase tracking-wider transition-opacity flex items-center justify-center gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" /> : <Compass className="h-4 w-4 sm:h-3 sm:w-3" />}
            Search
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400 font-medium">{error}</p>}

      {results.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 mt-2 space-y-1.5 max-h-60 sm:max-h-44 overflow-y-auto">
          {results.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(a)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                selected === a.name
                  ? "border-brand bg-brand/10 dark:bg-brand/10"
                  : "border-slate-200 dark:border-[#252525] hover:border-brand/50 bg-white dark:bg-[#0d0d0d]"
              }`}
            >
              {a.image ? (
                <img src={a.image} alt={a.name} className="h-10 w-14 object-cover rounded-lg shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="h-10 w-14 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Compass className="h-4 w-4 text-brand" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">{a.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {a.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-brand">
                      <Star className="h-2.5 w-2.5 fill-brand" />{a.rating}
                    </span>
                  )}
                  {a.reviews > 0 && <span className="text-[10px] text-slate-500 dark:text-slate-400">({a.reviews.toLocaleString()})</span>}
                  {a.type && <span className="text-[10px] text-slate-500 dark:text-[#888888]">{a.type}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {selected === a.name && <CheckCircle2 className="h-3.5 w-3.5 text-brand" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
