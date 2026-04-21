import { useState } from "react";
import { Zap, BarChart3, Lightbulb, Sparkles, FileText, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useNotifications } from "@/context/NotificationContext";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function simulateAiAction(action: string): Promise<string> {
  await delay(1500);
  const responses: Record<string, string> = {
    optimize: "Itinerary optimized! Reduced transit time by 2 hours.",
    suggest: "Added 3 suggested activities based on destination and season.",
    budget: "Budget estimate generated: $12,450 per person (flights + accommodation + activities).",
    summary: "Executive summary generated with key highlights and logistics overview.",
  };
  return responses[action] || "AI action completed successfully.";
}

interface AiZapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AI_ACTIONS = [
  { id: "optimize", label: "Tighten the Schedule", description: "Cut travel gaps and make the itinerary flow better", icon: Sparkles },
  { id: "suggest", label: "Suggest Things to Do", description: "Find activities and experiences at each stop", icon: Lightbulb },
  { id: "budget", label: "Estimate the Cost", description: "Get a rough cost breakdown per person for this trip", icon: BarChart3 },
  { id: "summary", label: "Write a Trip Summary", description: "Create a short overview you can share with the group", icon: FileText },
];

export function AiZapDialog({ open, onOpenChange }: AiZapDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const { showToast } = useNotifications();

  const handleAction = async (actionId: string) => {
    setLoading(actionId);
    try {
      const result = await simulateAiAction(actionId);
      setResults(prev => ({ ...prev, [actionId]: result }));
      showToast(result);
    } catch {
      showToast("AI action failed", "error");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) setResults({}); onOpenChange(o); }}>
      <SheetContent className="w-[400px] sm:w-[480px] p-0 border-l border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] shadow-2xl">
        <SheetHeader className="p-6 border-b border-slate-200 dark:border-[#1f1f1f] text-left">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
              <Zap className="h-5 w-5 text-black" />
            </div>
            <div>
              <SheetTitle className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">AI Assistant</SheetTitle>
              <SheetDescription className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] mt-0.5">What would you like help with?</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="p-6 space-y-4">
          {AI_ACTIONS.map(action => {
            const Icon = action.icon;
            const result = results[action.id];
            const isLoading = loading === action.id;
            return (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                disabled={!!loading}
                className="w-full text-left p-5 rounded-2xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#050505] hover:border-brand/40 transition-[border-color,opacity] duration-150 group disabled:opacity-50 active:scale-[0.99]"
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-black transition-colors">
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">{action.label}</p>
                    <p className="text-xs text-slate-500 dark:text-[#888] mt-1">{action.description}</p>
                    {result && (
                      <p className="text-xs text-brand font-semibold mt-3 bg-brand/5 px-3 py-2 rounded-lg border border-brand/10">{result}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
