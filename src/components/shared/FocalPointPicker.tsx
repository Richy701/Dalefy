import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { ImageFocalPoint } from "@/types";
import { objectPosition } from "@/lib/imagePosition";
import { cn } from "@/lib/utils";

interface Props {
  src: string;
  alt?: string;
  value?: ImageFocalPoint;
  onChange: (value: ImageFocalPoint | undefined) => void;
  /** Frame size and shape; the photo fills it exactly as it will on the hero */
  className?: string;
  /** Overlays (gradients, badges, buttons) drawn on top of the photo; buttons stay clickable */
  children?: ReactNode;
}

/**
 * Shows a photo cropped the way the app will show it and lets the user drag to choose
 * which part stays in view. The point under the pointer becomes the focal point.
 */
export function FocalPointPicker({ src, alt = "", value, onChange, className, children }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pos = value ?? { x: 50, y: 50 };

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
    onChange({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
  };

  return (
    <div
      ref={frame}
      className={cn("relative overflow-hidden select-none touch-none", dragging ? "cursor-grabbing" : "cursor-grab", className)}
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest("button, a, input")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        pick(e);
      }}
      onPointerMove={e => { if (dragging) pick(e); }}
      onPointerUp={e => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => setDragging(false)}
    >
      <img src={src} alt={alt} draggable={false} className="w-full h-full object-cover" style={{ objectPosition: objectPosition(pos) }} />
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand/70 shadow-md"
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      />
      <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] font-medium uppercase tracking-[0.2em] text-white/90 drop-shadow">
        Drag to reposition
      </span>
    </div>
  );
}
