import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Check, CaretDown, PaperPlaneTilt, Copy, ArrowSquareOut, SpinnerGap, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { usePreferences } from "@/context/PreferencesContext";
import { apiFetch, ApiError } from "@/lib/api";
import { firebaseAuth, isFirebaseConfigured } from "@/services/firebase";
import { renderItineraryEmail } from "@/lib/itineraryEmail";
import { EMAIL_TEMPLATES, type EmailTemplate } from "@/data/emailTemplates";
import type { Trip, User as UserType } from "@/types";

interface SendInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  travelers: UserType[];
}

type SendResult = { email: string; ok: boolean; error?: string };

function replaceVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function formatDates(start: string, end: string) {
  const parse = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  };
  try {
    const s = parse(start);
    const e = parse(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new Error();
    return `${s.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  } catch {
    return `${start} - ${end}`;
  }
}

export function SendInviteModal({ open, onOpenChange, trip, travelers }: SendInviteModalProps) {
  const { brand } = useBrand();
  const { resolvedAccent } = usePreferences();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<EmailTemplate>(EMAIL_TEMPLATES[0]);
  const [subject, setSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState(EMAIL_TEMPLATES[0].body);
  const [sendingEnabled, setSendingEnabled] = useState<boolean | null>(() => (isFirebaseConfigured() ? null : false));
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [copied, setCopied] = useState(false);

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
  const shareUrl = `${import.meta.env.VITE_APP_URL || `${window.location.origin}${window.location.pathname}`}#/shared/${trip.id}`;

  const email = useMemo(() => renderItineraryEmail({
    brandName: brand.name,
    logoUrl: brand.logoUrl,
    accentColor: resolvedAccent,
    platformName: brand.platformName,
    tripName: trip.name,
    destination: trip.destination,
    start: trip.start,
    end: trip.end,
    image: trip.image,
    message: resolvedBody,
    shareUrl,
    shortCode: trip.shortCode,
    organizer: trip.organizer,
  }), [brand, resolvedAccent, trip, resolvedBody, shareUrl]);

  // Is a verified sender configured? Decides whether the primary action sends or hands off to the mail app.
  useEffect(() => {
    if (!open || !isFirebaseConfigured()) return;
    let cancelled = false;
    apiFetch<{ enabled: boolean }>("/api/send-itinerary")
      .then(r => { if (!cancelled) setSendingEnabled(!!r.enabled); })
      .catch(() => { if (!cancelled) setSendingEnabled(false); });
    return () => { cancelled = true; };
  }, [open]);

  const withEmail = useMemo(() => travelers.filter(t => t.email), [travelers]);
  const recipients = useMemo(
    () => withEmail.filter(t => selectedIds.has(t.id)).map(t => ({ name: t.name, email: t.email })),
    [withEmail, selectedIds],
  );

  const toggleTraveler = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = withEmail.length > 0 && withEmail.every(t => selectedIds.has(t.id));
  const selectAll = () => setSelectedIds(allSelected ? new Set() : new Set(withEmail.map(t => t.id)));

  const handleTemplateChange = (t: EmailTemplate) => {
    setTemplate(t);
    setSubject(t.subject);
    setBody(t.body);
  };

  const copyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([email.html], { type: "text/html" }),
          "text/plain": new Blob([email.text], { type: "text/plain" }),
        }),
      ]);
      toast.success("Email copied. Paste it into a new message.");
    } catch {
      try {
        await navigator.clipboard.writeText(email.text);
        toast.success("Copied as plain text.");
      } catch {
        toast.error("Couldn't access the clipboard.");
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [email]);

  const openInMailApp = useCallback(async () => {
    if (recipients.length === 0) { toast.error("Choose at least one traveller"); return; }
    await copyEmail();
    const emails = recipients.map(r => r.email);
    const to = emails.length === 1
      ? `mailto:${encodeURIComponent(emails[0])}?`
      : `mailto:?bcc=${encodeURIComponent(emails.join(","))}&`;
    window.location.href = `${to}subject=${encodeURIComponent(resolvedSubject)}&body=${encodeURIComponent(email.text)}`;
  }, [recipients, resolvedSubject, email.text, copyEmail]);

  const sendNow = useCallback(async () => {
    if (recipients.length === 0) { toast.error("Choose at least one traveller"); return; }
    if (!resolvedSubject.trim()) { toast.error("Add a subject"); return; }
    setSending(true);
    setResults(null);
    try {
      const idToken = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
      if (!idToken) throw new ApiError(401, "You need to be signed in to send");
      const r = await apiFetch<{ sent: number; failed: number; results: SendResult[] }>("/api/send-itinerary", {
        method: "POST",
        auth: idToken,
        timeoutMs: 30000,
        body: { tripId: trip.id, subject: resolvedSubject, message: resolvedBody, recipients },
      });
      setResults(r.results);
      if (r.failed === 0) toast.success(`Sent to ${r.sent} traveller${r.sent === 1 ? "" : "s"}`);
      else toast.warning(`Sent to ${r.sent}, ${r.failed} failed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email");
    } finally {
      setSending(false);
    }
  }, [recipients, resolvedSubject, resolvedBody, trip.id]);

  const primaryLabel = sending
    ? "Sending"
    : sendingEnabled
      ? `Send to ${recipients.length || ""} traveller${recipients.length === 1 ? "" : "s"}`.replace("  ", " ")
      : "Open in mail app";

  // Size the preview to the email so the panel scrolls as one page instead of a box inside a box.
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [previewHeight, setPreviewHeight] = useState(600);
  const fitPreview = useCallback(() => {
    const doc = previewRef.current?.contentDocument;
    if (!doc?.documentElement) return;
    setPreviewHeight(Math.max(320, doc.documentElement.scrollHeight));
  }, []);
  useEffect(() => {
    const doc = previewRef.current?.contentDocument;
    if (!open || !doc?.documentElement || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fitPreview);
    ro.observe(doc.documentElement);
    return () => ro.disconnect();
  }, [open, email.html, fitPreview]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setResults(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-5xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col p-0 gap-0 bg-card border border-border rounded-xl shadow-2xl"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground">Send itinerary</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {sendingEnabled
                ? `Sent from ${brand.name}, replies go to ${trip.organizer?.email || "you"}.`
                : "Opens your mail app with the email ready to send."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-border flex-1 min-h-0 overflow-y-auto lg:overflow-hidden *:lg:overflow-y-auto">
          {/* Compose */}
          <div className="lg:w-[46%] p-5 sm:p-6 space-y-5 min-w-0 shrink-0">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">To</label>
                {withEmail.length > 0 && (
                  <button type="button" onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground">
                    {allSelected ? "Clear" : "Select all"}
                  </button>
                )}
              </div>
              {travelers.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-3">No travellers on this trip yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {travelers.map(t => {
                    const selected = selectedIds.has(t.id);
                    const disabled = !t.email;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleTraveler(t.id)}
                        title={disabled ? "No email address" : t.email}
                        aria-pressed={selected}
                        className={cn(
                          "inline-flex items-center gap-1.5 h-8 pl-1.5 pr-2.5 rounded-lg text-sm border transition-colors",
                          selected ? "border-brand/40 bg-brand/10 text-foreground" : "border-border bg-card text-foreground hover:bg-secondary",
                          disabled && "opacity-50 cursor-not-allowed hover:bg-card",
                        )}
                      >
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold",
                          selected ? "bg-brand text-black" : "bg-secondary text-muted-foreground",
                        )}>
                          {selected ? <Check className="h-3 w-3" weight="bold" /> : t.initials}
                        </span>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {travelers.some(t => !t.email) && (
                <p className="text-xs text-muted-foreground mt-2">Greyed out travellers have no email address on file.</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Template</label>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center justify-between w-full h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-secondary transition-colors">
                  {template.label}
                  <CaretDown className="h-3.5 w-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[240px] rounded-xl border border-border bg-card shadow-xl p-1">
                  {EMAIL_TEMPLATES.map(t => (
                    <DropdownMenuItem key={t.id} onClick={() => handleTemplateChange(t)} className="text-sm rounded-lg gap-2">
                      <span className="flex-1">{t.label}</span>
                      {t.id === template.id && <Check className="h-4 w-4 text-brand" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <label htmlFor="itinerary-email-subject" className="text-sm font-medium text-foreground mb-2 block">Subject</label>
              <Input id="itinerary-email-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
            </div>

            <div>
              <label htmlFor="itinerary-email-message" className="text-sm font-medium text-foreground mb-2 block">Message</label>
              <Textarea
                id="itinerary-email-message"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={9}
                className="resize-none text-sm leading-relaxed"
                placeholder="Write a short note to your travellers"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                The itinerary link, key dates and your signature are added automatically. You can use {"{{tripName}}"}, {"{{dates}}"} and {"{{destination}}"}.
              </p>
            </div>

            {results && (
              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                {results.map(r => (
                  <div key={r.email} className="flex items-center gap-2 px-3 py-2">
                    {r.ok
                      ? <Check className="h-4 w-4 text-emerald-500 shrink-0" weight="bold" />
                      : <Warning className="h-4 w-4 text-amber-500 shrink-0" weight="fill" />}
                    <span className="truncate flex-1 text-foreground">{r.email}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{r.ok ? "Sent" : r.error || "Failed"}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                onClick={sendingEnabled ? sendNow : openInMailApp}
                disabled={sending || sendingEnabled === null || recipients.length === 0}
                className="h-9 px-4 rounded-lg gap-2"
              >
                {sending
                  ? <SpinnerGap className="h-4 w-4 animate-spin" />
                  : sendingEnabled ? <PaperPlaneTilt className="h-4 w-4" weight="fill" /> : <ArrowSquareOut className="h-4 w-4" />}
                {primaryLabel}
              </Button>
              <Button variant="outline" onClick={copyEmail} className="h-9 px-3 rounded-lg gap-2">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                Copy email
              </Button>
              {sendingEnabled && (
                <button type="button" onClick={openInMailApp} className="text-xs text-muted-foreground hover:text-foreground ml-auto">
                  Use my mail app instead
                </button>
              )}
            </div>
            {sendingEnabled === false && isFirebaseConfigured() && (
              <p className="text-xs text-muted-foreground">
                Direct sending isn't set up yet. The designed email is copied to your clipboard when you open your mail app, paste it over the plain text.
              </p>
            )}
          </div>

          {/* Preview: the exact HTML that goes out */}
          <div className="flex-1 min-w-0 bg-background p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="text-xs font-medium text-muted-foreground">Preview</span>
              <span className="text-xs text-muted-foreground truncate">{resolvedSubject}</span>
            </div>
            <iframe
              ref={previewRef}
              title="Email preview"
              srcDoc={email.html}
              sandbox="allow-same-origin"
              scrolling="no"
              onLoad={fitPreview}
              className="w-full shrink-0 rounded-xl border border-border bg-white overflow-hidden"
              style={{ height: previewHeight }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
