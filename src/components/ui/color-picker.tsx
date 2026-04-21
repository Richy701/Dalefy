import { useMemo } from "react";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
  className?: string;
}

const DEFAULT_PRESETS = [
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
  const displayValue = useMemo(() => value || "#ffffff", [value]);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center gap-3 h-12 px-3 rounded-xl bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] hover:border-slate-300 dark:hover:border-[#333] transition-colors cursor-pointer w-full",
          className
        )}
      >
        <div
          className="h-8 w-8 rounded-lg shrink-0 border border-slate-200 dark:border-[#333]"
          style={{ backgroundColor: displayValue }}
        />
        <span className="text-sm font-mono font-bold text-slate-700 dark:text-[#ccc] flex-1 text-left">
          {displayValue.toUpperCase()}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 bg-white dark:bg-[#111] border-slate-200 dark:border-[#1f1f1f]">
        <div className="flex flex-col gap-3">
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
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange(preset)}
                  className={cn(
                    "h-6 w-6 rounded-md border transition-all cursor-pointer hover:scale-110",
                    displayValue.toLowerCase() === preset.toLowerCase()
                      ? "border-white dark:border-white ring-2 ring-brand/40 scale-110"
                      : "border-slate-200 dark:border-[#333]"
                  )}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
