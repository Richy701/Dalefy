import { useRef, useState, type ReactNode } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/shared/PersonAvatar";

/** What the action touches, so the question is answered by looking: a trip's photo, a person's face */
export interface ConfirmSubject {
  title: string;
  subtitle?: string;
  image?: string;
  person?: { avatar?: string | null; initials: string };
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  /** May be async: the dialog shows a pending state and only closes once it resolves. */
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  subject?: ConfirmSubject;
  /** More to read before deciding, such as the list of what will change */
  details?: ReactNode;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", onConfirm, destructive, subject, details }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popup = useRef<HTMLDivElement>(null);

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
      {/* Focus starts on the box itself, so no button looks selected; Tab goes to Cancel first */}
      <DialogContent
        ref={popup}
        initialFocus={popup}
        className="max-w-sm bg-card rounded-xl border border-border p-5 gap-4 outline-none"
      >
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        {subject && (
          <div className="flex items-center gap-3 rounded-xl bg-secondary p-2.5 min-w-0">
            {subject.person ? (
              <PersonAvatar avatar={subject.person.avatar} initials={subject.person.initials} name={subject.title} className="h-10 w-10 shrink-0" fallbackClassName="text-xs font-semibold" />
            ) : subject.image ? (
              <img src={subject.image} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{subject.title}</p>
              {subject.subtitle && <p className="text-xs text-muted-foreground truncate">{subject.subtitle}</p>}
            </div>
          </div>
        )}
        {details}
        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <DialogFooter className="flex gap-2 pt-1">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)} className="rounded-xl h-9 px-4">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className={`rounded-xl h-9 px-4 ${destructive ? "bg-red-700 hover:bg-red-800 text-white" : "bg-primary hover:opacity-90 text-primary-foreground"}`}
          >
            {busy ? <SpinnerGap className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
