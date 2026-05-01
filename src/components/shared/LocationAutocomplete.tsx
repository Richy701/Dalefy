import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin } from "lucide-react";

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
}

export function LocationAutocomplete({ value, onChange, placeholder, className }: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) { setSuggestions([]); return; }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,locality,neighborhood,address,poi`
      );
      const json = await res.json();
      setSuggestions(json.features?.map((f: { place_name: string; text: string; center: [number, number] }) => ({
        place_name: f.place_name,
        text: f.text,
        center: f.center,
      })) ?? []);
      setOpen(true);
    } catch {
      setSuggestions([]);
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

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#555] pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { setFocused(true); if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className={`pl-9 ${className}`}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors border-b border-slate-100 dark:border-[#1a1a1a] last:border-0"
            >
              <MapPin className="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{s.text}</p>
                <p className="text-[10px] text-slate-400 dark:text-[#666] truncate">{s.place_name}</p>
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#0a0a0a]">
            <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-slate-300 dark:text-[#333]">Powered by Mapbox</p>
          </div>
        </div>
      )}
    </div>
  );
}
