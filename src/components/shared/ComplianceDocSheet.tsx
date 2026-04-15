import { useState } from "react";
import { FileCheck, FileClock, FileX, Loader2, CheckCircle2, ShieldCheck, ArrowRight, Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ComplianceDoc } from "@/types";
import { COMPLIANCE_DOC_CONTENT } from "@/data/compliance-docs";

interface ComplianceDocSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: ComplianceDoc | null;
  travelerName: string;
  onSign: (docName: string) => void;
}

const STATUS_STYLE: Record<string, { color: string; bg: string; icon: typeof FileCheck }> = {
  Signed: { color: "text-emerald-400", bg: "bg-emerald-500/10", icon: FileCheck },
  Pending: { color: "text-amber-500", bg: "bg-amber-500/10", icon: FileClock },
  Expired: { color: "text-red-400", bg: "bg-red-500/10", icon: FileX },
};

export function ComplianceDocSheet({ open, onOpenChange, doc, travelerName, onSign }: ComplianceDocSheetProps) {
  const [signing, setSigning] = useState(false);

  if (!doc) return null;

  const content = COMPLIANCE_DOC_CONTENT[doc.name];
  const isSigned = doc.status === "Signed";
  const statusCfg = STATUS_STYLE[doc.status] || STATUS_STYLE.Pending;
  const StatusIcon = statusCfg.icon;

  const handleSign = async () => {
    setSigning(true);
    await new Promise(r => setTimeout(r, 800));
    onSign(doc.name);
    setSigning(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px] p-0 bg-white dark:bg-[#080808] border-l border-slate-200 dark:border-[#1a1a1a] shadow-2xl" showCloseButton>
        <div className="flex flex-col h-full">
          {/* Refined Header */}
          <div className="p-10 pb-8 bg-slate-50/50 dark:bg-[#0c0c0c] border-b border-slate-200 dark:border-[#1a1a1a]">
            <div className="flex items-center gap-4 mb-6">
              <div className={`h-14 w-14 rounded-2xl ${statusCfg.bg} ${statusCfg.color} flex items-center justify-center shadow-inner`}>
                <StatusIcon className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <Badge className={`text-xs font-black px-2.5 py-0.5 rounded-full border-none uppercase tracking-widest mb-2 ${statusCfg.bg} ${statusCfg.color}`}>
                  {doc.status}
                </Badge>
                <h2 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-none">
                  {doc.name}
                </h2>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-white dark:bg-[#050505] border border-slate-200 dark:border-[#1a1a1a]">
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-0.5">For</span>
                <span className="text-xs font-black italic text-slate-900 dark:text-white uppercase tracking-tight">{travelerName}</span>
              </div>
              <div className="h-8 w-px bg-slate-100 dark:bg-[#1a1a1a]" />
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-0.5">Reference</span>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-[#888]">DF-{Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Document Content */}
          <ScrollArea className="flex-1 px-10 min-h-0">
            <div className="py-10 space-y-10">
              {content ? (
                <div className="space-y-10">
                  <div className="relative">
                    <div className="absolute -left-4 top-0 bottom-0 w-1 bg-[#0bd2b5]/20 rounded-full" />
                    <p className="text-sm text-slate-500 dark:text-[#888] leading-relaxed font-medium pl-2">
                      {content.preamble}
                    </p>
                  </div>

                  <div className="space-y-8">
                    {content.sections.slice(0, 4).map((section, i) => (
                      <div key={i} className="relative pl-8 group">
                        <div className="absolute left-0 top-0 h-6 w-6 rounded-lg bg-slate-100 dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center text-xs font-black text-[#0bd2b5] group-hover:bg-[#0bd2b5] group-hover:text-black transition-[background-color,color] duration-150">
                          {i + 1}
                        </div>
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white mb-2 pt-1">
                          {section.heading.split(". ")[1] || section.heading}
                        </h4>
                        <p className="text-[12px] text-slate-600 dark:text-[#777] leading-relaxed">
                          {section.body}
                        </p>
                      </div>
                    ))}
                    {content.sections.length > 4 && (
                      <div className="flex items-center gap-3 pl-8">
                        <div className="h-px flex-1 bg-slate-100 dark:bg-[#1a1a1a]" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest italic">
                          + {content.sections.length - 4} more sections
                        </span>
                        <div className="h-px flex-1 bg-slate-100 dark:bg-[#1a1a1a]" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Info className="h-10 w-10 text-slate-200 dark:text-[#1a1a1a] mb-4" />
                  <p className="text-xs text-slate-500 dark:text-[#888] font-bold uppercase tracking-widest">No content available</p>
                </div>
              )}

              {isSigned && doc.date && (
                <div className="bg-[#0bd2b5]/5 border border-[#0bd2b5]/20 rounded-2xl p-6 flex items-center gap-5">
                  <div className="h-12 w-12 rounded-xl bg-[#0bd2b5]/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-6 w-6 text-[#0bd2b5]" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[#0bd2b5]">Signed & Verified</p>
                    <p className="text-xs text-slate-500 dark:text-[#888888] mt-1 font-bold uppercase tracking-tighter">
                      Signed on {new Date(doc.date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Action Footer */}
          {!isSigned && (
            <div className="p-10 border-t border-slate-200 dark:border-[#1a1a1a] bg-slate-50/50 dark:bg-[#0c0c0c]">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-5 w-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Info className="h-3 w-3 text-amber-500" />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888888] leading-tight">
                  By confirming, you agree you've read and accept all the terms above.
                </p>
              </div>
              <Button
                onClick={handleSign}
                disabled={signing}
                className="w-full h-16 rounded-2xl bg-[#0bd2b5] hover:opacity-90 text-black font-black text-xs uppercase tracking-[0.25em] shadow-[0_15px_40px_rgba(11,210,181,0.25)] disabled:opacity-50 transition-[transform,opacity] duration-150 group relative overflow-hidden active:scale-[0.98]"
              >
                {signing ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-3" /> Signing...</>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    Sign Document
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-150" />
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
