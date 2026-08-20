import { useNavigate } from "react-router-dom";
import { Lock } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DemoUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoUpgradeDialog({ open, onOpenChange }: DemoUpgradeDialogProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleSignUp = () => {
    onOpenChange(false);
    logout();
    navigate("/login");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-white dark:bg-[#111111] rounded-xl border border-slate-200 dark:border-[#1f1f1f] p-6 shadow-2xl">
        <DialogHeader className="space-y-4 text-center items-center">
          <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto">
            <Lock className="h-6 w-6 text-brand" />
          </div>
          <DialogTitle className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
            Demo Mode
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-[#888888] text-sm leading-relaxed">
            You're exploring the demo. This action needs a real team account. Sign in with your invited account to continue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4 flex flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleSignUp}
            className="w-full rounded-xl h-10 px-8 font-bold uppercase tracking-wider bg-brand hover:opacity-90 text-black shadow-xl shadow-brand/20"
          >
            Sign In
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-xl h-10 px-6 font-bold text-slate-500 dark:text-[#888888] hover:bg-slate-100 dark:hover:bg-[#1f1f1f]"
          >
            Keep Exploring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
