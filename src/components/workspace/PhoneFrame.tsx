import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * iPhone 17 Pro style frame (unibody band, Camera Control, slimmer island). Geometry is authored in a 420 x 900 unit space and
 * scaled to the measured container width so radii, buttons and the island stay
 * in proportion at any panel size.
 */
const W = 420;
const H = 900;
const RIM = 5; // titanium band
const BEZEL = 10; // band + black bezel to the glass
const SCREEN_R = 56;

interface PhoneFrameProps {
  isDark: boolean;
  /** Screen background and status-bar ink, so the frame matches the previewed theme. */
  screenBg: string;
  statusInk: string;
  maxWidth?: number;
  children: ReactNode;
}

export function PhoneFrame({ isDark, screenBg, statusInk, maxWidth = 320, children }: PhoneFrameProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Math.min(maxWidth, 300));

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      const maxByHeight = (entry.contentRect.height * W) / H;
      setWidth(Math.max(200, Math.min(maxWidth, available, maxByHeight || Infinity)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  const s = width / W;
  const px = (n: number) => n * s;
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // Deep Blue in dark mode, Silver in light
  const band = isDark
    ? { a: "#3a4a6a", b: "#161d2c", c: "#24304a", edge: "rgba(255,255,255,0.2)" }
    : { a: "#f4f4f7", b: "#c2c3ca", c: "#e1e1e6", edge: "rgba(255,255,255,0.9)" };
  const buttonFill = isDark ? "#2f3b57" : "#cfcfd6";

  return (
    <div ref={hostRef} className="w-full h-full flex items-start justify-center">
      <div style={{ position: "relative", width, height: px(H), flexShrink: 0 }}>
        {/* Body */}
        <svg
          viewBox={`-6 0 ${W + 12} ${H}`}
          width={px(W + 12)}
          height={px(H)}
          style={{ position: "absolute", left: px(-6), top: 0, overflow: "visible" }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pf-band" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={band.a} />
              <stop offset="0.35" stopColor={band.b} />
              <stop offset="0.65" stopColor={band.c} />
              <stop offset="1" stopColor={band.b} />
            </linearGradient>
            <linearGradient id="pf-btn" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={buttonFill} />
              <stop offset="1" stopColor={band.b} />
            </linearGradient>
            <filter id="pf-shadow" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#000" floodOpacity={isDark ? 0.55 : 0.22} />
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity={isDark ? 0.4 : 0.12} />
            </filter>
          </defs>

          {/* Side buttons sit behind the body so only their edge shows */}
          <rect x={-4} y={172} width={8} height={34} rx={2} fill="url(#pf-btn)" />
          <rect x={-4} y={232} width={8} height={64} rx={2} fill="url(#pf-btn)" />
          <rect x={-4} y={312} width={8} height={64} rx={2} fill="url(#pf-btn)" />
          <rect x={W - 4} y={262} width={8} height={104} rx={2} fill="url(#pf-btn)" />
          {/* Camera Control */}
          <rect x={W - 3} y={548} width={6} height={58} rx={1.5} fill="url(#pf-btn)" />

          {/* Titanium band */}
          <rect x={0} y={0} width={W} height={H} rx={66} fill="url(#pf-band)" filter="url(#pf-shadow)" />
          <rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} rx={65.5} fill="none" stroke={band.edge} strokeWidth={1} />

          {/* Antenna breaks */}
          {[
            [0, 118, 0, 132], [0, 780, 0, 794],
            [W, 118, W, 132], [W, 780, W, 794],
            [96, 0, 110, 0], [310, 0, 324, 0],
            [96, H, 110, H], [310, H, 324, H],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isDark ? "#0c0c0d" : "#8e8e95"} strokeWidth={RIM * 2} strokeOpacity={0.9} />
          ))}

          {/* Black bezel */}
          <rect x={RIM} y={RIM} width={W - RIM * 2} height={H - RIM * 2} rx={61} fill="#050506" />
        </svg>

        {/* Glass */}
        <div
          style={{
            position: "absolute",
            left: px(BEZEL), top: px(BEZEL),
            width: px(W - BEZEL * 2), height: px(H - BEZEL * 2),
            borderRadius: px(SCREEN_R),
            overflow: "hidden",
            background: screenBg,
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Status bar */}
          <div style={{ position: "relative", height: px(54), flexShrink: 0, zIndex: 3, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: `0 ${px(30)}px ${px(10)}px` }}>
            <span style={{ fontSize: px(15), fontWeight: 600, color: statusInk, letterSpacing: -0.2, lineHeight: 1 }}>{time}</span>
            <div style={{ display: "flex", alignItems: "center", gap: px(6) }}>
              <svg width={px(18)} height={px(11)} viewBox="0 0 18 11" aria-hidden="true">
                {[0, 1, 2, 3].map(i => (
                  <rect key={i} x={i * 4.6} y={11 - (4 + i * 2.3)} width={3.2} height={4 + i * 2.3} rx={0.8} fill={statusInk} opacity={i < 3 ? 1 : 0.35} />
                ))}
              </svg>
              <svg width={px(16)} height={px(11)} viewBox="0 0 16 11" aria-hidden="true">
                <path d="M8 10.5 1.2 3.6a9.4 9.4 0 0 1 13.6 0Z" fill="none" />
                <path d="M2.6 4.9A7.8 7.8 0 0 1 13.4 4.9" stroke={statusInk} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <path d="M4.9 7.1A4.6 4.6 0 0 1 11.1 7.1" stroke={statusInk} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <circle cx="8" cy="9.4" r="1.2" fill={statusInk} />
              </svg>
              <svg width={px(27)} height={px(13)} viewBox="0 0 27 13" aria-hidden="true">
                <rect x="0.75" y="0.75" width="22.5" height="11.5" rx="3.2" stroke={statusInk} strokeOpacity="0.4" strokeWidth="1" fill="none" />
                <rect x="2.4" y="2.4" width="18" height="8.2" rx="1.8" fill={statusInk} />
                <path d="M25 4.5v4a2 2 0 0 0 0-4Z" fill={statusInk} fillOpacity="0.4" />
              </svg>
            </div>
            {/* Dynamic Island */}
            <div style={{ position: "absolute", left: "50%", top: px(11), transform: "translateX(-50%)", width: px(112), height: px(33), borderRadius: px(17), background: "#000" }}>
              <div style={{ position: "absolute", right: px(10), top: px(10), width: px(13), height: px(13), borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #2a2a33, #000 65%)" }} />
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>

          {/* Home indicator */}
          <div style={{ position: "absolute", left: "50%", bottom: px(8), transform: "translateX(-50%)", width: px(140), height: px(5), borderRadius: px(3), background: statusInk, opacity: 0.85, zIndex: 3, pointerEvents: "none" }} />
        </div>
      </div>
    </div>
  );
}
