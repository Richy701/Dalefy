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

const DEFAULT_PRESETS = [
  MONO_ACCENT,
  "#0bd2b5", "#0ea5e9", "#6366f1", "#8b5cf6",
  "#ec4899", "#f43f5e", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#3b82f6", "#a855f7",
];

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

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center gap-3 h-12 px-3 rounded-xl bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] hover:border-slate-300 dark:hover:border-[#333] transition-colors cursor-pointer w-full",
          className
        )}
      >
        {isMono ? (
          <div className="h-8 w-8 rounded-lg shrink-0 border border-slate-200 dark:border-[#333] overflow-hidden relative">
            <div className="absolute inset-0 bg-white" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
            <div className="absolute inset-0 bg-black" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
          </div>
        ) : (
          <div
            className="h-8 w-8 rounded-lg shrink-0 border border-slate-200 dark:border-[#333]"
            style={{ backgroundColor: displayValue }}
          />
        )}
        <span className="text-sm font-mono font-bold text-slate-700 dark:text-[#ccc] flex-1 text-left">
          {isMono ? "MONO" : displayValue.toUpperCase()}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 bg-white dark:bg-[#111] border-slate-200 dark:border-[#1f1f1f]">
        <div className="flex flex-col gap-3">
          {!isMono && (
            <>
              <HexColorPicker
                color={displayValue}
                onChange={onChange}
                style={{ width: "100%", height: "160px" }}
              />
              <Input
                value={displayValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.match(/^#[0-9a-fA-F]{0,6}$/)) onChange(v);
                }}
                maxLength={7}
                className="h-9 font-mono text-sm font-bold bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] rounded-lg"
              />
            </>
          )}
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const isMonoPreset = preset === MONO_ACCENT;
                const isActive = isMonoPreset ? isMono : displayValue.toLowerCase() === preset.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange(preset)}
                    className={cn(
                      "h-6 w-6 rounded-md border transition-all cursor-pointer hover:scale-110",
                      isActive
                        ? "border-white dark:border-white ring-2 ring-brand/40 scale-110"
                        : "border-slate-200 dark:border-[#333]"
                    )}
                    style={isMonoPreset ? undefined : { backgroundColor: preset }}
                  >
                    {isMonoPreset && (
                      <div className="h-full w-full rounded-[5px] overflow-hidden relative">
                        <div className="absolute inset-0 bg-white" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
                        <div className="absolute inset-0 bg-black" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
