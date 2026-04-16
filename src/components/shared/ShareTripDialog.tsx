import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Link2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShareTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
}

export function ShareTripDialog({ open, onOpenChange, tripId, tripName }: ShareTripDialogProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
      <DialogContent className="max-w-md bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-[#1f1f1f]">
          <DialogTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">
            Share Trip
          </DialogTitle>
          <DialogDescription className="text-[11px] text-slate-500 dark:text-[#888888] mt-1">
            {tripName}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-6 flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200">
            <QRCodeSVG
              value={webUrl}
              size={180}
              bgColor="#ffffff"
              fgColor="#050505"
              level="M"
              marginSize={0}
            />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#666666] text-center max-w-[240px]">
            Travelers scan with their phone camera to open this itinerary
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
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
      </DialogContent>
    </Dialog>
  );
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
    <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-3 py-2.5">
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
