import { useState, useRef, useEffect, useCallback, useId } from "react";
import { MapPin, SpinnerGap } from "@phosphor-icons/react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface Suggestion {
  place_name: string;
  text: string;
  center: [number, number];
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, coords?: [number, number]) => void;
  placeholder?: string;
  className?: string;
  /** Accessible name for the input (the visible label isn't always associated). */
  ariaLabel?: string;
  id?: string;
}

type Status = "idle" | "loading" | "results" | "empty" | "error";

export function LocationAutocomplete({ value, onChange, placeholder, className, ariaLabel, id }: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listId = `${reactId}-listbox`;
  const inputId = id ?? `${reactId}-input`;

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 3) { setSuggestions([]); setStatus("idle"); return; }
    if (!MAPBOX_TOKEN) { setStatus("error"); return; }
    const reqId = ++requestRef.current;
    setStatus("loading");
    setOpen(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,locality,neighborhood,address,poi`
      );
      if (reqId !== requestRef.current) return; // stale
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const list: Suggestion[] = json.features?.map((f: { place_name: string; text: string; center: [number, number] }) => ({
        place_name: f.place_name,
        text: f.text,
        center: f.center,
      })) ?? [];
      setSuggestions(list);
      setActiveIndex(-1);
      setStatus(list.length ? "results" : "empty");
    } catch {
      if (reqId !== requestRef.current) return;
      setSuggestions([]);
      setStatus("error");
    }
  }, []);

  const handleChange = (val: string) => {
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.place_name, s.center);
    setSuggestions([]);
    setOpen(false);
    setStatus("idle");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); handleSelect(suggestions[activeIndex]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const showPanel = open && (status === "loading" || status === "results" || status === "empty" || status === "error");
  const activeId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-[#888] pointer-events-none" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-label={ariaLabel}
          autoComplete="off"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => { /* closing is handled by outside-click so option clicks still register */ }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`pl-9 ${className ?? ""}`}
        />
        {status === "loading" && (
          <SpinnerGap className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand animate-spin" aria-hidden="true" />
        )}
      </div>
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-2xl overflow-hidden"
        >
          {status === "loading" && suggestions.length === 0 && (
            <p className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-[#888]">Searching...</p>
          )}
          {status === "empty" && (
            <p className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-[#888]">No places match. Try a city or a fuller address.</p>
          )}
          {status === "error" && (
            <p className="px-3 py-2.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">Couldn't look up places right now. You can still type the location.</p>
          )}
          {suggestions.map((s, i) => (
            <button
              key={`${s.place_name}-${i}`}
              id={`${listId}-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              tabIndex={-1}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors border-b border-slate-100 dark:border-[#1a1a1a] last:border-0 ${i === activeIndex ? "bg-slate-100 dark:bg-[#1a1a1a]" : "hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"}`}
            >
              <MapPin className="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{s.text}</p>
                <p className="text-[10px] text-slate-500 dark:text-[#888] truncate">{s.place_name}</p>
              </div>
            </button>
          ))}
          {suggestions.length > 0 && (
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#0a0a0a]">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888]">Powered by Mapbox</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
