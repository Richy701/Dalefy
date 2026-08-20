import { useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  /** May be async: the dialog shows a pending state and only closes once it resolves. */
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", onConfirm, destructive }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setError(null); onOpenChange(o); } }}>
      <DialogContent className="max-w-md bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-border p-6 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-muted-foreground text-sm">{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
        <DialogFooter className="pt-4 flex gap-3">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)} className="rounded-xl h-10 px-6 font-bold text-slate-500 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-secondary">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className={`rounded-xl h-10 px-8 font-bold shadow-xl ${destructive ? 'bg-destructive hover:bg-destructive/90 text-white' : 'bg-brand hover:opacity-90 text-black shadow-brand/20'}`}
          >
            {busy ? <SpinnerGap className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
