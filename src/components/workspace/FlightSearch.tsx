import { useState } from "react";
import { Loader2, Plane, ArrowRight, CheckCircle2, Calendar as CalendarIcon } from "lucide-react";
import { searchFlights, type FlightResult } from "@/services/serpapi";
import type { TravelEvent } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";

interface Props {
  onSelect: (data: Partial<TravelEvent>) => void;
  defaultDate?: string;
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function FlightSearch({ onSelect, defaultDate }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(defaultDate ?? "");
  const [adults, setAdults] = useState(1);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FlightResult[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const search = async () => {
    if (!from || !to || !date) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const flights = await searchFlights(from.toUpperCase(), to.toUpperCase(), date, adults);
      setResults(flights);
      if (flights.length === 0) setError("No flights found — try different airports or date.");
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const pick = (f: FlightResult) => {
    setSelected(f.flightNum);
    onSelect({
      title: `${f.fromCode} → ${f.toCode}`,
      airline: f.airline,
      flightNum: f.flightNum,
      location: f.fromCode,
      time: f.departTime,
      endTime: f.arriveTime,
      duration: fmtDuration(f.durationMins),
      price: f.price ? `$${f.price}` : "",
      supplier: f.airline,
    });
  };

  const inputCls =
    "w-full h-11 sm:h-9 px-3 rounded-lg bg-white dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-base sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-[#0bd2b5] dark:focus:border-[#0bd2b5] transition-colors";

  return (
    <div className="border-b border-slate-200 dark:border-[#1f1f1f] bg-[#0bd2b5]/5 dark:bg-[#0bd2b5]/[0.04]">
      <div className="px-3 sm:px-4 pt-3 pb-2">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#0bd2b5] mb-2">Live Flight Search</p>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-end">
          <div className="sm:flex-1 sm:min-w-[70px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">From</label>
            <input value={from} onChange={e => setFrom(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="LHR" maxLength={4} autoCapitalize="characters" autoComplete="off" inputMode="text" className={inputCls} />
          </div>
          <div className="sm:flex-1 sm:min-w-[70px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">To</label>
            <input value={to} onChange={e => setTo(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="DXB" maxLength={4} autoCapitalize="characters" autoComplete="off" inputMode="text" className={inputCls} />
          </div>
          <div className="col-span-2 sm:flex-1 sm:min-w-[140px]">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Date</label>
            <Popover>
              <PopoverTrigger className={`${inputCls} flex items-center justify-between gap-2 text-left whitespace-nowrap overflow-hidden`}>
                <span className={`truncate ${date ? "" : "text-slate-400 dark:text-[#555]"}`}>
                  {date ? format(parse(date, "yyyy-MM-dd", new Date()), "d MMM yyyy") : "Select date"}
                </span>
                <CalendarIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-slate-400 dark:text-[#666] shrink-0" />
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto max-w-[calc(100vw-1rem)]">
                <Calendar
                  mode="single"
                  selected={date ? parse(date, "yyyy-MM-dd", new Date()) : undefined}
                  onSelect={d => d && setDate(format(d, "yyyy-MM-dd"))}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="sm:w-14">
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888] block mb-1">Pax</label>
            <input type="number" value={adults} onChange={e => setAdults(Number(e.target.value))} min={1} max={99} inputMode="numeric" className={inputCls} />
          </div>
          <button
            type="button"
            onClick={search}
            disabled={loading || !from || !to || !date}
            className="h-11 sm:h-9 px-4 rounded-lg bg-[#0bd2b5] hover:opacity-90 disabled:opacity-40 text-black text-[11px] sm:text-[10px] font-black uppercase tracking-wider transition-opacity flex items-center justify-center gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" /> : <Plane className="h-4 w-4 sm:h-3 sm:w-3" />}
            Search
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400 font-medium">{error}</p>}

      {results.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 mt-2 space-y-1.5 max-h-60 sm:max-h-44 overflow-y-auto">
          {results.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(f)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                selected === f.flightNum
                  ? "border-[#0bd2b5] bg-[#0bd2b5]/10 dark:bg-[#0bd2b5]/10"
                  : "border-slate-200 dark:border-[#252525] hover:border-[#0bd2b5]/50 bg-white dark:bg-[#0d0d0d]"
              }`}
            >
              {f.logo ? (
                <img src={f.logo} alt={f.airline} className="h-5 w-5 object-contain shrink-0" />
              ) : (
                <Plane className="h-4 w-4 text-[#0bd2b5] shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                  <span>{f.fromCode}</span>
                  <ArrowRight className="h-2.5 w-2.5 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>{f.toCode}</span>
                  <span className="text-slate-300 dark:text-[#444]">·</span>
                  <span className="font-medium text-slate-500 dark:text-[#888] text-[10px]">{f.flightNum}</span>
                  {f.stops > 0 && (
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{f.stops} stop{f.stops > 1 ? "s" : ""}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#888888] mt-0.5">
                  {f.departTime} → {f.arriveTime} · {fmtDuration(f.durationMins)}
                </p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                {f.price > 0 && <p className="text-sm font-black text-slate-900 dark:text-white">${f.price}</p>}
                {selected === f.flightNum && <CheckCircle2 className="h-3.5 w-3.5 text-[#0bd2b5]" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
