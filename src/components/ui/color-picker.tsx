import { useMemo } from "react";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MONO_ACCENT } from "@/context/PreferencesContext";
import { useTheme } from "@/context/ThemeContext";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
  className?: string;
}

/** Named so each swatch has an accessible label rather than being an unlabelled square. */
const PRESET_NAMES: Record<string, string> = {
  [MONO_ACCENT]: "Monochrome",
  "#0bd2b5": "Teal",
  "#0ea5e9": "Sky",
  "#6366f1": "Indigo",
  "#8b5cf6": "Violet",
  "#ec4899": "Pink",
  "#f43f5e": "Rose",
  "#f97316": "Orange",
  "#eab308": "Amber",
  "#22c55e": "Green",
  "#14b8a6": "Aqua",
  "#3b82f6": "Blue",
  "#a855f7": "Purple",
};

const DEFAULT_PRESETS = Object.keys(PRESET_NAMES);

const nameFor = (hex: string) => PRESET_NAMES[hex.toLowerCase()] ?? hex.toUpperCase();

/** WCAG relative luminance and contrast, so we can say whether the accent is
 *  actually legible rather than leaving the user to find out on a live screen. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

export function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: ColorPickerProps) {
  const { theme } = useTheme();
  const isMono = value === MONO_ACCENT;
  const displayValue = useMemo(() => {
    if (isMono) return theme === "dark" ? "#ffffff" : "#000000";
    return value || "#ffffff";
  }, [value, isMono, theme]);

  /** The accent carries black label text on buttons and chips, so that pairing
   *  is what decides whether a colour is usable. */
  const legibility = useMemo(() => {
    if (isMono) return null;
    const onBlack = contrast(displayValue, "#000000");
    const onWhite = contrast(displayValue, "#ffffff");
    const best = Math.max(onBlack, onWhite);
    return {
      ratio: best,
      label: onBlack >= onWhite ? "black" : "white",
      ok: best >= 4.5,
    };
  }, [displayValue, isMono]);

  const MonoSwatch = ({ radius }: { radius: string }) => (
    <div className={cn("h-full w-full overflow-hidden relative", radius)}>
      <div className="absolute inset-0 bg-white" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
      <div className="absolute inset-0 bg-black" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Accent colour: ${isMono ? "Monochrome" : nameFor(displayValue)}. Change it`}
        className={cn(
          "flex items-center gap-2.5 h-10 pl-2 pr-3 rounded-lg bg-white dark:bg-background border border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-input transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1",
          className
        )}
      >
        <span className="h-6 w-6 rounded-md shrink-0 border border-slate-200 dark:border-border overflow-hidden">
          {isMono
            ? <MonoSwatch radius="rounded-md" />
            : <span className="block h-full w-full" style={{ backgroundColor: displayValue }} />}
        </span>
        <span className="text-[13px] font-medium text-slate-700 dark:text-foreground/80">
          {isMono ? "Monochrome" : nameFor(displayValue)}
        </span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[248px] p-3 bg-white dark:bg-card border-slate-200 dark:border-border">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-muted-foreground mb-2">
              Presets
            </p>
            <div className="grid grid-cols-5 gap-1">
              {presets.map((preset) => {
                const isMonoPreset = preset === MONO_ACCENT;
                const isActive = isMonoPreset ? isMono : displayValue.toLowerCase() === preset.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange(preset)}
                    aria-label={nameFor(preset)}
                    aria-pressed={isActive}
                    title={nameFor(preset)}
                    // 40px hit area around a 24px swatch keeps the target reachable
                    className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-secondary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    <span
                      className={cn(
                        "h-6 w-6 rounded-md overflow-hidden border transition-transform",
                        // a neutral ring stays visible even when the accent itself is mono
                        isActive
                          ? "border-foreground ring-2 ring-foreground/30 scale-105"
                          : "border-slate-200 dark:border-border",
                      )}
                      style={isMonoPreset ? undefined : { backgroundColor: preset }}
                    >
                      {isMonoPreset && <MonoSwatch radius="rounded-[4px]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {!isMono && (
            <div className="flex flex-col gap-2 border-t border-slate-100 dark:border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-muted-foreground">
                Custom
              </p>
              <HexColorPicker
                color={displayValue}
                onChange={onChange}
                style={{ width: "100%", height: "120px" }}
              />
              <Input
                value={displayValue}
                aria-label="Accent colour hex value"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.match(/^#[0-9a-fA-F]{0,6}$/)) onChange(v);
                }}
                maxLength={7}
                className="w-full font-mono text-[13px]"
              />
              {legibility && (
                <p
                  className={cn(
                    "text-[11px] leading-snug",
                    legibility.ok ? "text-slate-500 dark:text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {legibility.ok
                    ? `Readable with ${legibility.label} label text (${legibility.ratio.toFixed(1)}:1).`
                    : `Low contrast — ${legibility.ratio.toFixed(1)}:1 at best. Buttons using this accent may be hard to read.`}
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
