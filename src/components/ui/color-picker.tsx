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

export const nameFor = (hex: string) => PRESET_NAMES[hex.toLowerCase()] ?? hex.toUpperCase();

/** Presets grouped by hue family so the popover reads as a palette rather than
 *  a random grid. Order matches a rough rainbow walk starting at neutral. */
const PRESET_GROUPS: Array<{ label: string; hexes: string[] }> = [
  { label: "Neutral", hexes: [MONO_ACCENT] },
  { label: "Teal", hexes: ["#0bd2b5", "#14b8a6"] },
  { label: "Blue", hexes: ["#0ea5e9", "#3b82f6"] },
  { label: "Purple", hexes: ["#6366f1", "#8b5cf6", "#a855f7"] },
  { label: "Pink", hexes: ["#ec4899", "#f43f5e"] },
  { label: "Warm", hexes: ["#f97316", "#eab308"] },
  { label: "Green", hexes: ["#22c55e"] },
];

/** Dalefy teal — the brand default surfaced by the reset link. */
const DEFAULT_ACCENT = "#0bd2b5";

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

const MonoSwatch = ({ radius }: { radius: string }) => (
  <div className={cn("h-full w-full overflow-hidden relative", radius)}>
    <div className="absolute inset-0 bg-white" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
    <div className="absolute inset-0 bg-black" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
  </div>
);

export function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
}: ColorPickerProps) {
  const { theme } = useTheme();
  const isMono = value === MONO_ACCENT;
  const displayValue = useMemo(() => {
    if (isMono) return theme !== "light" ? "#ffffff" : "#000000";
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

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Accent colour: ${isMono ? "Monochrome" : nameFor(displayValue)}. Change it`}
        className={cn(
          "flex items-center gap-2.5 h-10 pl-2 pr-3 rounded-lg bg-card border border-border hover:border-slate-300 dark:hover:border-input transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1",
          className
        )}
      >
        <span className="h-6 w-6 rounded-md shrink-0 border border-border overflow-hidden">
          {isMono
            ? <MonoSwatch radius="rounded-md" />
            : <span className="block h-full w-full" style={{ backgroundColor: displayValue }} />}
        </span>
        <span className="text-[13px] font-medium text-foreground/80">
          {isMono ? "Monochrome" : nameFor(displayValue)}
        </span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[248px] p-3 bg-card border-border">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {PRESET_GROUPS
              .map(group => ({ ...group, hexes: group.hexes.filter(h => presets.includes(h)) }))
              .filter(group => group.hexes.length > 0)
              .map(group => (
                <div key={group.label} className="flex items-center gap-2">
                  <p className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {group.hexes.map(preset => {
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
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                        >
                          <span
                            className={cn(
                              "h-5 w-5 rounded-md overflow-hidden border transition-transform",
                              isActive
                                ? "border-foreground ring-2 ring-foreground/30 scale-110"
                                : "border-border",
                            )}
                            style={isMonoPreset ? undefined : { backgroundColor: preset }}
                          >
                            {isMonoPreset && <MonoSwatch radius="rounded-[3px]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>

          {!isMono && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">
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
                    legibility.ok ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {legibility.ok
                    ? `Readable with ${legibility.label} label text (${legibility.ratio.toFixed(1)}:1).`
                    : `Low contrast — ${legibility.ratio.toFixed(1)}:1 at best. Buttons using this accent may be hard to read.`}
                </p>
              )}
            </div>
          )}

          {displayValue.toLowerCase() !== DEFAULT_ACCENT && presets.includes(DEFAULT_ACCENT) && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_ACCENT)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded"
            >
              Reset to Dalefy teal
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
