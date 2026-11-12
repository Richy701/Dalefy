import { useEffect, useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Copy, Check, ArrowSquareOut, DownloadSimple, X, WarningCircle, DeviceMobile, EnvelopeSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { useTrips } from "@/context/TripsContext";
import { generateUniqueShortCode } from "@/services/firebaseTrips";
import { tripDatesLine } from "@/lib/tripSummary";
import { objectPosition } from "@/lib/imagePosition";

interface ShareTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
  /** Called when the user chooses to publish a draft from inside the dialog. */
  onPublish?: () => void | Promise<void>;
  publishing?: boolean;
  /** Travellers on the trip who haven't been emailed the itinerary yet */
  notInvited?: number;
  /** Everyone on the trip, so the email row can say how many have it */
  travellerCount?: number;
  onEmailTravellers?: () => void;
}

/** Scheme registered by the Expo app (mobile/app.json). */
const APP_SCHEME = "dafadventures";

export function ShareTripDialog({ open, onOpenChange, tripId, tripName, onPublish, publishing, notInvited = 0, travellerCount = 0, onEmailTravellers }: ShareTripDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { brand } = useBrand();
  const { trips, updateTrip } = useTrips();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const trip = trips.find((t) => t.id === tripId);
  const [shortCode, setShortCode] = useState<string | undefined>(trip?.shortCode);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets or syncs state before async work; reviewed, not a render loop
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
      ? `${(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, "")}/shared/${tripId}`
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
        className="p-0 overflow-x-hidden overflow-y-auto grid-cols-[minmax(0,1fr)] w-[calc(100vw-2rem)] max-w-xl max-h-[calc(100vh-2rem)] rounded-xl bg-card border border-border shadow-2xl"
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

        {/* The invite itself, shaped like what travellers get: the trip on its photo, then the PIN and code to join */}
        <section className="px-6 pt-5">
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
            <div className="relative h-44 bg-secondary">
              {trip?.image && <img src={trip.image} alt="" style={{ objectPosition: objectPosition(trip.imagePosition) }} className="absolute inset-0 h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-4 bottom-3">
                <p className="truncate text-lg font-semibold tracking-tight text-white">{tripName}</p>
                <p className="truncate text-sm text-white/85">
                  {[trip ? tripDatesLine({ start: trip.start, end: trip.end }) : "", travellerCount ? `${travellerCount} traveller${travellerCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 border-t border-dashed border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Join in the {brand.platformName} app with PIN</p>
                <button
                  type="button"
                  onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
                  disabled={!shortCode}
                  aria-label={shortCode ? `Copy trip PIN ${shortCode}` : "No trip PIN yet"}
                  className="mt-1.5 block text-[32px] font-semibold leading-none tracking-[0.2em] tabular-nums text-foreground hover:opacity-80 disabled:cursor-default"
                >
                  {pinChars.length ? pinChars.join("") : "······"}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">Or scan the code to open it in any browser</p>
              </div>
              <div className="shrink-0 rounded-lg border border-border bg-white p-2">
                <QRCodeSVG value={webUrl} size={112} bgColor="#ffffff" fgColor="#111111" level="M" marginSize={0} />
              </div>
            </div>
          </div>

          {/* What you do with it */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ActionButton
              primary
              onClick={() => copy("web", webUrl, "Link")}
              icon={copiedKey === "web" ? Check : Copy}
              label={copiedKey === "web" ? "Copied" : "Copy link"}
            />
            <ActionButton
              onClick={() => shortCode && copy("pin", shortCode, "Trip PIN")}
              disabled={!shortCode}
              icon={copiedKey === "pin" ? Check : Copy}
              label={copiedKey === "pin" ? "Copied" : "Copy PIN"}
            />
            <ActionButton onClick={downloadQr} icon={DownloadSimple} label="Save QR" />
            <ActionButton onClick={() => window.open(webUrl, "_blank", "noopener")} icon={ArrowSquareOut} label="Open" />
          </div>
          <p className="mt-2 truncate text-xs text-muted-foreground" title={webUrl}>{displayUrl}, opens in any browser</p>
        </section>

        {/* Who's had it by email: the one step that actually reaches people who haven't joined */}
        {isPublished && travellerCount > 0 && (
          <section className="px-6 pt-5 pb-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary" aria-hidden="true">
                <EnvelopeSimple className="h-4 w-4 text-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground tabular-nums">Emailed to {travellerCount - notInvited} of {travellerCount}</p>
                <p className="text-xs text-muted-foreground">{notInvited ? `${notInvited} still to send` : "Everyone has the itinerary"}</p>
              </div>
              {notInvited > 0 && onEmailTravellers && (
                <ActionButton onClick={onEmailTravellers} icon={EnvelopeSimple} label={notInvited === 1 ? "Email 1" : `Email ${notInvited}`} />
              )}
            </div>
          </section>
        )}
        {!(isPublished && travellerCount > 0) && <div className="pb-5" />}

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
        "inline-flex items-center justify-center gap-1.5 h-9 px-3 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0",
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" weight="bold" />
      {label}
    </button>
  );
}
