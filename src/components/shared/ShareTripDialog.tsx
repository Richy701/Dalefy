import { useEffect, useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Copy, Check, ArrowSquareOut, DownloadSimple, X, WarningCircle, DeviceMobile } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { usePreferences } from "@/context/PreferencesContext";
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

/** Scheme registered by the Expo app (mobile/app.json). */
const APP_SCHEME = "dafadventures";

export function ShareTripDialog({ open, onOpenChange, tripId, tripName, onPublish, publishing }: ShareTripDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { brand } = useBrand();
  const { resolvedAccent, accentFg } = usePreferences();
  const { trips, updateTrip } = useTrips();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const trip = trips.find((t) => t.id === tripId);
  const [shortCode, setShortCode] = useState<string | undefined>(trip?.shortCode);
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
    const code = generateUniqueShortCode();
    updateTrip(trip.id, { shortCode: code });
    setShortCode(code);
  }, [open, trip, updateTrip]);

  const isPublished = trip?.status === "Published";

  const webUrl =
    typeof window !== "undefined"
      ? `${import.meta.env.VITE_APP_URL || `${window.location.origin}${window.location.pathname}`}#/shared/${tripId}`
      : "";
  const displayUrl = webUrl.replace(/^https?:\/\//, "");
  const appLink = `${APP_SCHEME}://shared/${tripId}`;

  const copy = (key: string, value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => toast.error("Couldn't access the clipboard"));
  };

  const downloadQr = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${tripName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "itinerary"}-qr.png`;
    a.click();
  };

  const pinChars = (shortCode ?? "").toUpperCase().split("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-x-hidden overflow-y-auto grid-cols-[minmax(0,1fr)] w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-2rem)] rounded-xl bg-card border border-border shadow-2xl"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Share itinerary - {tripName}</DialogTitle>
          <DialogDescription>Share the link, QR code or trip PIN with travellers</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-foreground">Share itinerary</p>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{tripName}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="h-8 w-8 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        {!isPublished && (
          <div className="mx-6 mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
            <WarningCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" weight="fill" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">This trip is still a draft</p>
              <p className="text-sm text-muted-foreground mt-0.5">Travellers can't open the link or PIN until it's published.</p>
              {onPublish && (
                <button
                  type="button"
                  onClick={() => void onPublish()}
                  disabled={publishing}
                  className="mt-2.5 inline-flex items-center h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-60"
                >
                  {publishing ? "Publishing" : "Publish now"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Link and QR: works for everyone, no app needed */}
        <section className="px-6 pt-5 pb-5">
          <p className="text-sm font-medium text-foreground">Link</p>
          <p className="text-sm text-muted-foreground mt-0.5">Opens the itinerary in any browser. No app needed.</p>

          <div className="mt-4 flex gap-4 items-start">
            <div className="shrink-0 flex flex-col items-center gap-1.5">
              <div className="rounded-xl border border-border bg-white p-2.5">
                <QRCodeSVG value={webUrl} size={112} bgColor="#ffffff" fgColor="#111111" level="M" marginSize={0} />
              </div>
              <button type="button" onClick={downloadQr} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <DownloadSimple className="h-3.5 w-3.5" weight="bold" />Save QR
              </button>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="rounded-lg border border-border bg-secondary px-3 py-2 min-w-0">
                <p className="text-xs text-muted-foreground">Web link</p>
                <p className="text-sm font-mono text-foreground truncate" title={webUrl}>{displayUrl}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  primary
                  style={{ background: resolvedAccent, color: accentFg }}
                  onClick={() => copy("web", webUrl, "Link")}
                  icon={copiedKey === "web" ? Check : Copy}
                  label={copiedKey === "web" ? "Copied" : "Copy link"}
                />
                <ActionButton onClick={() => window.open(webUrl, "_blank", "noopener")} icon={ArrowSquareOut} label="Open" />
              </div>
            </div>
          </div>
        </section>

        <div className="mx-6 border-t border-border" />

        {/* PIN: for travellers who have the app */}
        <section className="px-6 pt-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Trip PIN</p>
              <p className="text-sm text-muted-foreground mt-0.5">Travellers with the {brand.platformName} app enter this to join.</p>
            </div>
            <ActionButton
              onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
              disabled={!shortCode}
              icon={copiedKey === "pin" ? Check : Copy}
              label={copiedKey === "pin" ? "Copied" : "Copy PIN"}
            />
          </div>
          <button
            type="button"
            onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
            disabled={!shortCode}
            aria-label="Copy trip PIN"
            className="mt-4 w-full rounded-xl border border-border bg-secondary py-5 text-center font-mono text-4xl font-semibold tracking-[0.3em] text-foreground tabular-nums disabled:cursor-default hover:border-brand/40 transition-colors"
          >
            {pinChars.length > 0 ? (
              <span className="inline-block pl-[0.3em]">{pinChars.join("")}</span>
            ) : (
              <span className="text-muted-foreground">••••••</span>
            )}
          </button>
        </section>

        <div className="mx-6 border-t border-border" />

        <div className="px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {brand.logoUrl && <img src={brand.logoUrl} alt="" className="h-5 w-5 rounded object-contain shrink-0" />}
            <p className="text-xs text-muted-foreground truncate">Shared as {brand.name}</p>
          </div>
          <button
            type="button"
            onClick={() => copy("app", appLink, "App link")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <DeviceMobile className="h-3.5 w-3.5" />
            {copiedKey === "app" ? "Copied" : "Copy app link"}
          </button>
        </div>

        {/* Hidden raster QR for download */}
        <div className="hidden" aria-hidden>
          <QRCodeCanvas ref={qrCanvasRef} value={webUrl} size={1024} bgColor="#ffffff" fgColor="#111111" level="M" marginSize={4} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionButton({ onClick, icon: Icon, label, primary, disabled, style }: {
  onClick: () => void;
  style?: React.CSSProperties;
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "bold" }>;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={[
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0",
        primary
          ? "hover:opacity-90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" weight="bold" />
      {label}
    </button>
  );
}
