import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { usePreferences } from "@/context/PreferencesContext";

const DEFAULT_ACCENT = "#0bd2b5";
const cache = new Map<string, string>();

interface BrandIllustrationProps {
  src: string;
  className?: string;
  draggable?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
}

export function BrandIllustration({ src, className, draggable, ...rest }: BrandIllustrationProps) {
  const { accentColor } = usePreferences();
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(src);
    if (cached) {
      setSvg(cached);
      return;
    }
    fetch(src)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          cache.set(src, text);
          setSvg(text);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [src]);

  if (!svg) {
    // Fallback while loading
    return <img src={src} alt="" className={className} draggable={draggable} {...rest} />;
  }

  // Replace the default accent with the current brand color
  let tinted = accentColor && accentColor.toLowerCase() !== DEFAULT_ACCENT
    ? svg.replaceAll(DEFAULT_ACCENT, accentColor)
    : svg;

  // Make SVG responsive: remove fixed width/height, ensure viewBox exists
  tinted = tinted
    .replace(/<svg([^>]*)>/, (_match, attrs: string) => {
      const cleaned = attrs
        .replace(/\s+width="[^"]*"/, "")
        .replace(/\s+height="[^"]*"/, "");
      return `<svg${cleaned} style="width:100%;height:100%">`;
    });

  const sanitized = DOMPurify.sanitize(tinted, { USE_PROFILES: { svg: true, svgFilters: true } });

  return (
    <div
      className={className}
      draggable={draggable}
      {...rest}
      dangerouslySetInnerHTML={{ __html: sanitized }}
      style={{ lineHeight: 0 }}
    />
  );
}
