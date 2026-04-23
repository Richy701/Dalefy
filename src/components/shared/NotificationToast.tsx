import { CircleCheck, CircleAlert } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";

export function NotificationToast() {
  const { toast } = useNotifications();

  if (!toast) return null;

  return (
    <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border border-slate-200 dark:border-[#1f1f1f] backdrop-blur-xl bg-white dark:bg-[#111111]">
        {toast.type === 'success' ? <CircleCheck className="h-5 w-5 text-emerald-500" /> : <CircleAlert className="h-5 w-5 text-destructive" />}
        <span className="text-sm font-semibold">{toast.message}</span>
      </div>
    </div>
  );
}
