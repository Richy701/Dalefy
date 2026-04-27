import { useState, useMemo, useCallback } from "react";
import { Copy, Check, ChevronDown, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { EMAIL_TEMPLATES, type EmailTemplate } from "@/data/emailTemplates";
import type { Trip, User as UserType } from "@/types";

interface SendInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  travelers: UserType[];
}

function replaceVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function formatDates(start: string, end: string) {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    return `${format(s, "MMM d")} - ${format(e, "MMM d, yyyy")}`;
  } catch {
    return `${start} - ${end}`;
  }
}

export function SendInviteModal({ open, onOpenChange, trip, travelers }: SendInviteModalProps) {
  const { brand } = useBrand();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<EmailTemplate>(EMAIL_TEMPLATES[0]);
  const [subject, setSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState(EMAIL_TEMPLATES[0].body);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const vars = useMemo(() => ({
    tripName: trip.name,
    dates: formatDates(trip.start, trip.end),
    destination: trip.destination || "TBD",
    brandName: brand.name,
    organizerName: trip.organizer?.name || "",
    organizerRole: trip.organizer?.role || "",
    organizerCompany: trip.organizer?.company || "",
    organizerEmail: trip.organizer?.email || "",
    organizerPhone: trip.organizer?.phone || "",
  }), [trip, brand]);

  const resolvedSubject = useMemo(() => replaceVars(subject, vars), [subject, vars]);
  const resolvedBody = useMemo(() => replaceVars(body, vars), [body, vars]);

  const shareUrl = `${window.location.origin}${window.location.pathname}#/shared/${trip.id}`;
  const accentColor = brand.accentColor || "#0bd2b5";

  const toggleTraveler = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === travelers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(travelers.map(t => t.id)));
  };

  const selectedEmails = travelers
    .filter(t => selectedIds.has(t.id) && t.email)
    .map(t => t.email);

  const handleTemplateChange = (t: EmailTemplate) => {
    setTemplate(t);
    setSubject(t.subject);
    setBody(t.body);
  };

  const copyEmails = useCallback(async () => {
    if (selectedEmails.length === 0) {
      toast.error("No travelers selected");
      return;
    }
    await navigator.clipboard.writeText(selectedEmails.join("; "));
    setCopiedEmail(true);
    toast.success(`${selectedEmails.length} email${selectedEmails.length !== 1 ? "s" : ""} copied`);
    setTimeout(() => setCopiedEmail(false), 2000);
  }, [selectedEmails]);

  const copySubject = useCallback(async () => {
    await navigator.clipboard.writeText(resolvedSubject);
    setCopiedSubject(true);
    toast.success("Subject copied");
    setTimeout(() => setCopiedSubject(false), 2000);
  }, [resolvedSubject]);

  const buildEmailHtml = useCallback(() => {
    const bodyHtml = resolvedBody
      .split("\n\n")
      .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="text-align:center;padding:24px 24px 16px;border-bottom:1px solid #e5e7eb;">
    ${brand.logoUrl
      ? `<img src="${brand.logoUrl}" alt="${brand.name}" style="height:36px;width:auto;max-width:180px;" />`
      : `<span style="font-size:18px;font-weight:800;letter-spacing:0.05em;color:${accentColor};">${brand.nameUpper}</span>`
    }
  </div>
  ${trip.image ? `
  <div style="padding:0;">
    <img src="${trip.image}" alt="${trip.name}" style="width:100%;max-height:240px;object-fit:cover;display:block;" />
  </div>` : ""}
  <div style="padding:32px 32px 24px;">
    <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#111827;text-align:center;">${trip.name}</h1>
    ${bodyHtml}
  </div>
  <div style="padding:0 32px 32px;text-align:center;">
    <a href="${shareUrl}" style="display:inline-block;padding:14px 48px;background:${accentColor};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">
      View Itinerary
    </a>
  </div>
  ${trip.shortCode ? `
  <div style="padding:0 32px 24px;text-align:center;">
    <span style="font-size:13px;color:#6b7280;">Trip PIN: <strong style="color:#111827;">${trip.shortCode}</strong></span>
  </div>` : ""}
  <div style="border-top:1px solid #e5e7eb;margin:0 32px;"></div>
  ${trip.organizer ? `
  <div style="padding:24px 32px;">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;padding-right:16px;">
        ${trip.organizer.avatar
          ? `<img src="${trip.organizer.avatar}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" />`
          : `<div style="width:48px;height:48px;border-radius:50%;background:${accentColor};color:#fff;text-align:center;line-height:48px;font-weight:700;font-size:16px;">${(trip.organizer.name || "?").charAt(0)}</div>`
        }
      </td>
      <td style="vertical-align:middle;font-size:13px;color:#6b7280;line-height:1.5;">
        <div style="font-weight:700;color:#111827;">${trip.organizer.name || ""}</div>
        ${trip.organizer.role ? `<div>${trip.organizer.role}</div>` : ""}
        ${trip.organizer.company ? `<div>${trip.organizer.company}</div>` : ""}
        ${trip.organizer.phone ? `<div>${trip.organizer.phone}</div>` : ""}
      </td>
    </tr></table>
  </div>` : ""}
</div>`;
  }, [resolvedBody, trip, brand, accentColor, shareUrl]);

  const copyContent = useCallback(async () => {
    const html = buildEmailHtml();
    try {
      const blob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([resolvedBody], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blob,
          "text/plain": textBlob,
        }),
      ]);
      setCopiedContent(true);
      toast.success("Email content copied - paste into your email client");
      setTimeout(() => setCopiedContent(false), 2000);
    } catch {
      await navigator.clipboard.writeText(resolvedBody);
      setCopiedContent(true);
      toast.success("Content copied as plain text");
      setTimeout(() => setCopiedContent(false), 2000);
    }
  }, [buildEmailHtml, resolvedBody]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl sm:rounded-[2rem] p-0 gap-0 shadow-2xl"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        {/* Header */}
        <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-200 dark:border-[#1f1f1f]">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Send Itinerary Email
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 dark:text-[#888] mt-1">
            Compose your email, then copy and paste into your email client.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-[#1f1f1f]">
          {/* Left: Compose */}
          <div className="flex-1 p-5 sm:p-8 space-y-5 min-w-0">
            {/* To */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888]">To</label>
                {travelers.length > 0 && (
                  <button
                    onClick={selectAll}
                    className="text-[10px] font-bold uppercase tracking-widest hover:underline cursor-pointer transition-colors"
                    style={{ color: accentColor }}
                  >
                    {selectedIds.size === travelers.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 p-3 min-h-[44px] rounded-xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] items-center">
                {travelers.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-[#666]">No travelers assigned to this trip</span>
                ) : travelers.map(t => {
                  const selected = selectedIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTraveler(t.id)}
                      aria-label={`${selected ? "Deselect" : "Select"} ${t.name}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border",
                        selected
                          ? "text-white border-transparent shadow-sm"
                          : "bg-white dark:bg-[#161616] text-slate-600 dark:text-[#999] border-slate-200 dark:border-[#222] hover:border-slate-300 dark:hover:border-[#333]"
                      )}
                      style={selected ? { background: accentColor } : undefined}
                    >
                      <span className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0",
                        selected ? "bg-white/20" : "bg-slate-100 dark:bg-[#222] text-slate-500 dark:text-[#777]"
                      )}>
                        {selected ? <Check className="h-3 w-3" /> : t.initials}
                      </span>
                      {t.name}
                    </button>
                  );
                })}
              </div>
              {selectedIds.size > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-[#666] mt-1.5">
                  {selectedIds.size} of {travelers.length} selected
                </p>
              )}
            </div>

            {/* Template Selector */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888] mb-2 block">Template</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#ccc] cursor-pointer hover:border-slate-300 dark:hover:border-[#333] transition-colors">
                    {template.label}
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-[#666]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[200px] rounded-xl border border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] shadow-xl">
                  {EMAIL_TEMPLATES.map(t => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => handleTemplateChange(t)}
                      className={cn(
                        "text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer",
                        t.id === template.id && "text-brand"
                      )}
                      style={t.id === template.id ? { color: accentColor } : undefined}
                    >
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Subject */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888] mb-2 block">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#666] outline-none focus-visible:ring-2 focus-visible:ring-brand/30 transition-shadow"
                placeholder="Email subject..."
              />
            </div>

            {/* Message Body */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888] mb-2 block">Message</label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={8}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#666] resize-none outline-none focus-visible:ring-2 focus-visible:ring-brand/30 transition-shadow"
                placeholder="Write your message here..."
              />
              <p className="text-[10px] text-slate-400 dark:text-[#666] mt-1.5">
                Variables: {"{{tripName}}"}, {"{{dates}}"}, {"{{destination}}"}, {"{{brandName}}"}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={copyEmails}
                variant="outline"
                className="rounded-xl text-xs font-bold uppercase tracking-widest h-10 px-4 border-slate-200 dark:border-[#1f1f1f] gap-2 transition-all duration-150"
              >
                {copiedEmail ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Users className="h-3.5 w-3.5" />}
                {copiedEmail ? "Copied!" : "1. Copy Emails"}
              </Button>
              <Button
                onClick={copySubject}
                variant="outline"
                className="rounded-xl text-xs font-bold uppercase tracking-widest h-10 px-4 border-slate-200 dark:border-[#1f1f1f] gap-2 transition-all duration-150"
              >
                {copiedSubject ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <FileText className="h-3.5 w-3.5" />}
                {copiedSubject ? "Copied!" : "2. Copy Subject"}
              </Button>
              <Button
                onClick={copyContent}
                className="rounded-xl text-xs font-bold uppercase tracking-widest h-10 px-6 gap-2 text-white transition-all duration-150 hover:opacity-90"
                style={{ background: accentColor }}
              >
                {copiedContent ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedContent ? "Copied!" : "3. Copy Content"}
              </Button>
            </div>

            <div className="text-[10px] text-slate-400 dark:text-[#666] leading-relaxed bg-slate-50 dark:bg-[#0a0a0a] rounded-xl p-3 border border-slate-100 dark:border-[#1a1a1a]">
              <strong className="text-slate-500 dark:text-[#888]">How to use:</strong> Copy each item above and paste into a new email in your email client. The branded formatting carries over into Outlook, Gmail, and most clients.
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="flex-1 p-5 sm:p-8 bg-slate-50 dark:bg-[#0a0a0a] min-w-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4 gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888] shrink-0">Preview</span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-[#555] truncate max-w-[240px]">
                {resolvedSubject}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#1f1f1f] overflow-hidden bg-white shadow-sm">
              {/* Email Header */}
              <div className="text-center py-5 px-6 border-b border-slate-100">
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt={brand.name} className="h-8 w-auto max-w-[160px] mx-auto object-contain" />
                ) : (
                  <span className="text-sm font-black tracking-[0.08em]" style={{ color: accentColor }}>
                    {brand.nameUpper}
                  </span>
                )}
              </div>

              {/* Hero Image */}
              {trip.image && (
                <img src={trip.image} alt={trip.name} className="w-full h-[160px] object-cover" />
              )}

              {/* Body */}
              <div className="px-6 pt-6 pb-4">
                <h2 className="text-lg font-extrabold text-slate-900 text-center mb-5">{trip.name}</h2>
                <div className="text-[13px] leading-relaxed text-slate-600 space-y-3">
                  {resolvedBody.split("\n\n").map((p, i) => (
                    <p key={i} className="whitespace-pre-line">{p}</p>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="px-6 pb-6 text-center">
                <span
                  className="inline-block px-10 py-3 text-white text-sm font-bold rounded-lg"
                  style={{ background: accentColor }}
                >
                  View Itinerary
                </span>
              </div>

              {trip.shortCode && (
                <div className="px-6 pb-4 text-center">
                  <span className="text-xs text-slate-400">Trip PIN: <strong className="text-slate-700">{trip.shortCode}</strong></span>
                </div>
              )}

              {/* Organizer Signature */}
              {trip.organizer && (
                <div className="border-t border-slate-100 px-6 py-4 flex items-center gap-3">
                  {trip.organizer.avatar ? (
                    <img src={trip.organizer.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: accentColor }}
                    >
                      {(trip.organizer.name || "?").charAt(0)}
                    </div>
                  )}
                  <div className="text-[11px] leading-snug text-slate-500 min-w-0">
                    <div className="font-bold text-slate-800">{trip.organizer.name}</div>
                    {trip.organizer.role && <div>{trip.organizer.role}</div>}
                    {trip.organizer.company && <div>{trip.organizer.company}</div>}
                    {trip.organizer.phone && <div>{trip.organizer.phone}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
