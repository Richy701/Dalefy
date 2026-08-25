import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Link, DeviceMobile, AirplaneTilt, MapPin, CalendarDots, X, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/PreferencesContext";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { useTrips } from "@/context/TripsContext";
import { generateUniqueShortCode } from "@/services/firebaseTrips";

interface ShareTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
  /** Called when the user chooses to publish a draft from inside the dialog. */
  onPublish?: () => void | Promise<void>;
  publishing?: boolean;
}

export function ShareTripDialog({ open, onOpenChange, tripId, tripName, onPublish, publishing }: ShareTripDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { resolvedAccent: accentColor, accentFg } = usePreferences();
  const { brand } = useBrand();
  const { trips, updateTrip } = useTrips();

  const trip = trips.find((t) => t.id === tripId);
  const [shortCode, setShortCode] = useState<string | undefined>(trip?.shortCode);
  const [allocating, setAllocating] = useState(false);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    setShortCode(trip?.shortCode);
  }, [trip?.shortCode]);

  // Allocate a PIN if the trip doesn't have one yet. Never changes publish status:
  // publishing is an explicit action (see the draft banner below).
  useEffect(() => {
    if (!open || !trip) return;
    if (trip.shortCode && trip.shortCode.length >= 6) return;
    if (attemptedRef.current === trip.id) return;
    attemptedRef.current = trip.id;
    setAllocating(true);
    const code = generateUniqueShortCode();
    updateTrip(trip.id, { shortCode: code });
    setShortCode(code);
    setAllocating(false);
  }, [open, trip, updateTrip]);

  const isPublished = trip?.status === "Published";

  const webUrl =
    typeof window !== "undefined"
      ? `${import.meta.env.VITE_APP_URL || `${window.location.origin}${window.location.pathname}`}#/shared/${tripId}`
      : "";
  const deepLink = `dalefy://shared/${tripId}`;

  const copy = (key: string, value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const pinLength = shortCode?.length || 6;
  const pinCopied = copiedKey === "pin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-x-hidden overflow-y-auto grid-cols-[minmax(0,1fr)] w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-2rem)] rounded-xl bg-background border border-border"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Share trip - {tripName}</DialogTitle>
          <DialogDescription>Share the trip PIN, QR code or link with travelers</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Share Trip</p>
            <p className="mt-0.5 text-sm font-bold tracking-tight text-foreground truncate">{tripName}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95 transition-colors shrink-0"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {!isPublished && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
              <WarningCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" weight="fill" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground">This trip is still a draft</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Travelers can't open the link or PIN until it's published.</p>
                {onPublish && (
                  <button
                    type="button"
                    onClick={() => void onPublish()}
                    disabled={publishing}
                    className="mt-2 inline-flex items-center h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider disabled:opacity-60"
                  >
                    {publishing ? "Publishing..." : "Publish now"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Trip pass */}
          <div className="relative bg-card rounded-xl overflow-hidden border border-border shadow-sm">
            {/* Brand strip */}
            <div className="px-4 py-2.5 flex items-center gap-2 bg-brand/10 border-b border-brand/20">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt="" className="h-5 w-5 rounded-full object-contain shrink-0" />
              ) : (
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  <AirplaneTilt className="h-3 w-3" style={{ color: accentFg }} weight="bold" />
                </div>
              )}
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-brand truncate">
                {brand.name}
              </span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground shrink-0">
                Trip Pass
              </span>
            </div>

            {/* Hero: the PIN */}
            <div className="px-4 pt-5 pb-4 flex flex-col items-center gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                Trip PIN
              </p>
              <button
                type="button"
                onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
                disabled={!shortCode}
                className="group flex items-center gap-1.5 sm:gap-2 disabled:cursor-default"
                aria-label="Copy trip PIN"
              >
                {Array.from({ length: pinLength }).map((_, i) => {
                  const char = shortCode?.[i];
                  const filled = !!char;
                  return (
                    <span
                      key={i}
                      className={[
                        "w-11 h-14 sm:w-12 sm:h-16 rounded-lg border-2 flex items-center justify-center",
                        "font-mono font-black text-[26px] sm:text-[30px] leading-none tabular-nums transition-colors",
                        filled
                          ? "bg-brand/10 border-brand/40 text-brand group-hover:border-brand/70"
                          : "bg-secondary border-border text-muted-foreground/50",
                      ].join(" ")}
                    >
                      {filled ? char : allocating ? "·" : "·"}
                    </span>
                  );
                })}
              </button>
              <button
                type="button"
                onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
                disabled={!shortCode}
                className={[
                  "inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[11px] font-black uppercase tracking-[0.18em] transition-colors disabled:opacity-60",
                  pinCopied
                    ? "bg-brand"
                    : "bg-secondary text-foreground hover:bg-brand/15 hover:text-brand",
                ].join(" ")}
                style={pinCopied ? { color: accentFg } : undefined}
              >
                {pinCopied ? <Check className="h-3.5 w-3.5" weight="bold" /> : <Copy className="h-3.5 w-3.5" weight="bold" />}
                {pinCopied ? "Copied" : "Copy PIN"}
              </button>
              <p className="text-[11px] text-muted-foreground text-center">
                Travelers enter this in the app to join the trip.
              </p>
            </div>

            {/* Perforation with side notches */}
            <div className="relative h-6">
              <div className="absolute left-4 right-4 top-1/2 border-t-[1.5px] border-dashed border-border" />
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-r border-border" />
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-l border-border" />
            </div>

            {/* Stub: trip meta + QR */}
            <div className="px-4 pt-3 pb-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Or scan
                </p>
                <h3 className="mt-1 text-sm font-bold tracking-tight text-foreground leading-tight line-clamp-2">
                  {tripName}
                </h3>
                {trip?.destination && (
                  <div className="mt-2 flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0 text-brand" weight="bold" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/80 truncate">
                      {trip.destination}
                    </span>
                  </div>
                )}
                {trip && (
                  <div className="mt-1 flex items-center gap-1.5 min-w-0">
                    <CalendarDots className="h-3 w-3 shrink-0 text-muted-foreground" weight="bold" />
                    <span className="text-[11px] font-mono font-bold text-muted-foreground tracking-wide truncate">
                      {formatRange(trip.start, trip.end)}
                    </span>
                  </div>
                )}
              </div>
              <div className="shrink-0 p-2 rounded-lg bg-white border border-border">
                <QRCodeSVG
                  value={deepLink}
                  size={108}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                  marginSize={0}
                />
              </div>
            </div>
          </div>

          {/* Link rows */}
          <div className="space-y-2">
            <LinkRow
              icon={Link}
              label="Web Link"
              value={webUrl}
              copied={copiedKey === "web"}
              onCopy={() => copy("web", webUrl, "Web link")}
            />
            <LinkRow
              icon={DeviceMobile}
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
  return `${fmt(s)} - ${fmt(e)}, ${year}`;
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
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl pl-3 pr-2 py-2">
      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="text-[12px] font-mono text-foreground truncate">
          {value}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="h-8 w-8 p-0 rounded-lg hover:bg-secondary shrink-0"
      >
        {copied
          ? <Check className="h-3.5 w-3.5 text-brand" weight="bold" />
          : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </Button>
    </div>
  );
}
