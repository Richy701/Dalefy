import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", onConfirm, destructive }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-8 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{title}</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-[#888888] text-sm">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4 flex gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-2xl h-12 px-6 font-bold text-slate-500 dark:text-[#888888] hover:bg-slate-100 dark:hover:bg-[#1f1f1f]">
            CANCEL
          </Button>
          <Button
            onClick={() => { onConfirm(); onOpenChange(false); }}
            className={`rounded-2xl h-12 px-8 font-bold uppercase tracking-wider shadow-xl ${destructive ? 'bg-destructive hover:bg-destructive/90 text-white' : 'bg-brand hover:opacity-90 text-black shadow-brand/20'}`}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
