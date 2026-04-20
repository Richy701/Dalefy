import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Link2, Smartphone, Plane, MapPin, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePreferences, ACCENT_PALETTE } from "@/context/PreferencesContext";
import { BRAND } from "@/config/brand";
import { useTrips } from "@/context/TripsContext";
import { generateUniqueShortCode } from "@/services/supabaseTrips";

interface ShareTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
}

export function ShareTripDialog({ open, onOpenChange, tripId, tripName }: ShareTripDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { accent } = usePreferences();
  const { trips, updateTrip } = useTrips();
  const activeAccent = ACCENT_PALETTE.find((p) => p.id === accent) ?? ACCENT_PALETTE[0];

  const trip = trips.find((t) => t.id === tripId);
  const [shortCode, setShortCode] = useState<string | undefined>(trip?.shortCode);
  const [allocating, setAllocating] = useState(false);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    setShortCode(trip?.shortCode);
  }, [trip?.shortCode]);

  useEffect(() => {
    if (!open || !trip || trip.shortCode) return;
    if (attemptedRef.current === trip.id) return;
    attemptedRef.current = trip.id;
    setAllocating(true);
    generateUniqueShortCode()
      .then((code) => {
        updateTrip(trip.id, { shortCode: code });
        setShortCode(code);
      })
      .catch((err) => {
        const msg = err?.message?.includes("short_code")
          ? "Run the short_code migration on Supabase first"
          : "Couldn't generate trip code";
        toast.error(msg);
      })
      .finally(() => setAllocating(false));
  }, [open, trip, updateTrip]);

  const webUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#/shared/${tripId}`
      : "";
  const deepLink = `dafadventures://shared/${tripId}`;

  const copy = (key: string, value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md bg-slate-100 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Share trip — {tripName}</DialogTitle>
          <DialogDescription>Scan QR to open itinerary</DialogDescription>
        </DialogHeader>

        <div className="p-5">
          {/* Boarding pass ticket */}
          <div className="relative bg-white dark:bg-[#0f0f0f] rounded-2xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f] shadow-lg">
            {/* Top accent bar */}
            <div
              className="px-4 py-3 flex items-center justify-center gap-2 border-b"
              style={{
                backgroundColor: `${activeAccent.hex}14`,
                borderColor: `${activeAccent.hex}30`,
              }}
            >
              <div
                className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: activeAccent.hex }}
              >
                <Plane className="h-3 w-3 text-black" strokeWidth={2.5} />
              </div>
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em] truncate"
                style={{ color: activeAccent.hex }}
              >
                {BRAND.name} · Trip Pass
              </span>
            </div>

            {/* Top: trip info + compact QR */}
            <div className="px-4 pt-4 pb-4 min-w-0 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#555555]">
                  Itinerary
                </p>
                <h3 className="mt-1 text-base font-black uppercase tracking-tight text-slate-900 dark:text-white leading-tight line-clamp-2">
                  {tripName}
                </h3>
                {trip?.destination && (
                  <div className="mt-2 flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-2.5 w-2.5 shrink-0" style={{ color: activeAccent.hex }} strokeWidth={2.5} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-[#cccccc] truncate">
                      {trip.destination}
                    </span>
                  </div>
                )}
                {trip && (
                  <div className="mt-1 flex items-center gap-1.5 min-w-0">
                    <CalendarDays className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-[#666666]" strokeWidth={2.5} />
                    <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-[#888888] tracking-wide truncate">
                      {formatRange(trip.start, trip.end)}
                    </span>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#555555]">
                    Gate
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-900 dark:text-white tracking-wider">
                    DAF
                  </span>
                </div>
              </div>
              <div
                className="shrink-0 p-1.5 rounded-lg bg-white border"
                style={{ borderColor: `${activeAccent.hex}40` }}
              >
                <QRCodeSVG
                  value={deepLink}
                  size={72}
                  bgColor="#ffffff"
                  fgColor={activeAccent.hex}
                  level="M"
                  marginSize={0}
                />
                <p
                  className="mt-1 text-center text-[7px] font-black uppercase tracking-[0.15em]"
                  style={{ color: activeAccent.hex }}
                >
                  Scan
                </p>
              </div>
            </div>

            {/* Perforation with side notches */}
            <div className="relative h-6">
              <div className="absolute left-3 right-3 top-1/2 border-t-[1.5px] border-dashed border-slate-300 dark:border-[#2a2a2a]" />
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-[#050505]" />
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-[#050505]" />
            </div>

            {/* Stub: OTP-style PIN */}
            <div className="px-4 pt-4 pb-6 flex flex-col items-center gap-3">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-[#555555]">
                Trip PIN
              </p>
              <button
                type="button"
                onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
                disabled={!shortCode}
                className="flex items-center gap-2 group disabled:cursor-default"
                aria-label="Copy trip PIN"
              >
                {[0, 1, 2, 3].map((i) => {
                  const digit = shortCode?.[i];
                  const filled = !!digit;
                  return (
                    <span
                      key={i}
                      className="w-12 h-14 rounded-lg border-2 flex items-center justify-center font-mono font-black tabular-nums text-[32px] leading-none transition-colors"
                      style={{
                        borderColor: filled ? `${activeAccent.hex}50` : "rgba(148,163,184,0.25)",
                        backgroundColor: filled ? `${activeAccent.hex}10` : "transparent",
                        color: filled ? activeAccent.hex : "rgba(148,163,184,0.4)",
                      }}
                    >
                      {filled ? digit : allocating ? "·" : "·"}
                    </span>
                  );
                })}
              </button>
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-[#888888]">
                {copiedKey === "pin" ? (
                  <>
                    <Check className="h-2.5 w-2.5" style={{ color: activeAccent.hex }} strokeWidth={3} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: activeAccent.hex }}>
                      Copied
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="h-2.5 w-2.5" strokeWidth={2.5} />
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                      Tap to copy · Type on mobile
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Link rows */}
          <div className="mt-4 space-y-2">
            <LinkRow
              icon={Link2}
              label="Web Link"
              value={webUrl}
              copied={copiedKey === "web"}
              onCopy={() => copy("web", webUrl, "Web link")}
            />
            <LinkRow
              icon={Smartphone}
              label="Mobile Deep Link"
              value={deepLink}
              copied={copiedKey === "deep"}
              onCopy={() => copy("deep", deepLink, "Deep link")}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const year = e.getFullYear();
  return `${fmt(s)} – ${fmt(e)}, ${year}`;
}

interface LinkRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}

function LinkRow({ icon: Icon, label, value, copied, onCopy }: LinkRowProps) {
  return (
    <div className="flex items-center gap-2 bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-3 py-2.5">
      <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-[#888888]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#666666]">
          {label}
        </p>
        <p className="text-[11px] font-mono text-slate-900 dark:text-white truncate">
          {value}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCopy}
        className="h-8 w-8 p-0 rounded-lg hover:bg-slate-200 dark:hover:bg-[#2a2a2a] shrink-0"
      >
        {copied
          ? <Check className="h-3.5 w-3.5 text-brand" />
          : <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-[#888888]" />}
      </Button>
    </div>
  );
}
