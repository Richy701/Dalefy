import { useRef, useState } from "react";
import { Paperclip, PencilSimple, Plus, SpinnerGap, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { useTrips } from "@/context/TripsContext";
import { useSavedInfo } from "@/hooks/useSavedInfo";
import { deleteSavedInfo, saveSavedInfo, uploadSavedInfoFile, type SavedInfoItem } from "@/services/savedInfo";
import type { EventDocument, Trip } from "@/types";

const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,.csv,.ppt,.pptx,image/*";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SUGGESTIONS = ["24/7 contact", "Travel insurance", "Behavioural standards form"];

interface Draft {
  id?: string;
  createdAt?: string;
  title: string;
  body: string;
  documents: EventDocument[];
  automatic: boolean;
}

const sameContent = (a: { title: string; body: string; documents?: EventDocument[] }, b: Draft) =>
  a.title === b.title && a.body === b.body
  && (a.documents ?? []).map(d => d.url).join() === b.documents.map(d => d.url).join();

export function SavedInfoManager() {
  const { user } = useAuth();
  const { currentOrg, orgRole } = useOrg();
  const { trips, updateTrip } = useTrips();
  const { items, loading, failed, reload } = useSavedInfo();
  const canEdit = orgRole === "owner" || orgRole === "admin" || orgRole === "agent";

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<SavedInfoItem | null>(null);
  const [propagate, setPropagate] = useState<{ draft: Draft & { id: string }; trips: Trip[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!currentOrg || !user) return null;

  const open = (next: Draft) => setDraft(next);
  const blank = (title = ""): Draft => ({ title, body: "", documents: [], automatic: true });

  const addFiles = async (files: File[]) => {
    const accepted = files.filter(f => f.size <= MAX_FILE_BYTES);
    if (files.length > accepted.length) toast.error(`${files.length - accepted.length} file(s) over 50MB were skipped`);
    if (!accepted.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(accepted.map(f => uploadSavedInfoFile(currentOrg.id, user.id, f)));
      setDraft(prev => (prev ? { ...prev, documents: [...prev.documents, ...uploaded] } : prev));
    } catch {
      toast.error("Couldn't upload that file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    const clean = { ...draft, title: draft.title.trim(), body: draft.body.trim() };
    try {
      const id = await saveSavedInfo(currentOrg.id, user.id, clean);
      await reload();
      setDraft(null);
      toast.success("Saved");
      if (clean.id) {
        const today = new Date().toISOString().slice(0, 10);
        const affected = trips.filter(t => t.end >= today && t.info?.some(p => p.savedInfoId === id && !sameContent(p, clean)));
        if (affected.length) setPropagate({ draft: { ...clean, id }, trips: affected });
      }
    } catch {
      toast.error("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const applyToTrips = () => {
    if (!propagate) return;
    const { draft: next, trips: affected } = propagate;
    for (const trip of affected) {
      updateTrip(trip.id, {
        info: trip.info?.map(page => {
          if (page.savedInfoId !== next.id) return page;
          const { documents: _old, ...rest } = page;
          return { ...rest, title: next.title, body: next.body, ...(next.documents.length ? { documents: next.documents } : {}) };
        }),
      });
    }
    toast.success(`Updated ${affected.length} ${affected.length === 1 ? "trip" : "trips"}`);
    setPropagate(null);
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await deleteSavedInfo(removing.id);
      await reload();
      toast.success("Removed");
    } catch {
      toast.error("Couldn't remove that. Please try again.");
    }
    setRemoving(null);
  };

  return (
    <div className="space-y-3">
      {failed ? (
        <p className="text-sm text-muted-foreground" role="alert">Saved info couldn't be loaded. Please refresh and try again.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 h-16 text-muted-foreground">
          <SpinnerGap className="h-4 w-4 animate-spin text-brand" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm text-foreground font-medium">Nothing saved yet</p>
          <p className="text-sm text-muted-foreground mt-0.5">{canEdit ? "Start with one of these, or add your own." : "Ask an admin or agent to add your team's info."}</p>
          {canEdit && (
            <div className="flex flex-wrap gap-2 mt-3">
              {SUGGESTIONS.map(title => (
                <Button key={title} type="button" variant="secondary" size="sm" onClick={() => open(blank(title))}>
                  <Plus className="h-3.5 w-3.5" /> {title}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 bg-card">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {[
                    item.automatic ? "On every new trip" : "Add when needed",
                    item.documents.length ? `${item.documents.length} ${item.documents.length === 1 ? "file" : "files"}` : "",
                    item.body.split("\n")[0],
                  ].filter(Boolean).join(", ")}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${item.title}`}
                    onClick={() => open({ id: item.id, createdAt: item.createdAt, title: item.title, body: item.body, documents: item.documents, automatic: item.automatic })}>
                    <PencilSimple className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.title}`} onClick={() => setRemoving(item)}>
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !failed && !loading && items.length > 0 && (
        <Button type="button" variant="outline" onClick={() => open(blank())}><Plus className="h-4 w-4" /> Add info</Button>
      )}
      {canEdit && !failed && !loading && items.length === 0 && (
        <Button type="button" variant="outline" onClick={() => open(blank())}><Plus className="h-4 w-4" /> Add your own</Button>
      )}

      <Dialog open={!!draft} onOpenChange={next => { if (!next) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          {draft && (
            <form onSubmit={save} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit saved info" : "Add saved info"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="saved-info-title">Title</Label>
                <Input id="saved-info-title" spellCheck value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Travel insurance" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saved-info-body">What travellers should know</Label>
                <Textarea id="saved-info-body" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={6} placeholder="Phone numbers, policy details, links…" />
              </div>
              <div className="space-y-1.5">
                {draft.documents.map(file => (
                  <div key={file.id} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 pl-3 pr-1 h-9">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`}
                      onClick={() => setDraft({ ...draft, documents: draft.documents.filter(d => d.id !== file.id) })}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} className="hidden"
                  onChange={e => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} Attach a form or file
                </Button>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
                <div>
                  <Label htmlFor="saved-info-auto">Add to every new trip</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Turn off for info only some trips need. You can still add it to a trip yourself.</p>
                </div>
                <Switch id="saved-info-auto" checked={draft.automatic} onCheckedChange={checked => setDraft({ ...draft, automatic: !!checked })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button type="submit" disabled={saving || uploading || !draft.title.trim()}>
                  {saving ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : null} Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!propagate}
        onOpenChange={next => { if (!next) setPropagate(null); }}
        title="Update upcoming trips too?"
        description={propagate
          ? `${propagate.trips.length} upcoming ${propagate.trips.length === 1 ? "trip uses" : "trips use"} "${propagate.draft.title}". Trips you don't update keep their current version, and travellers see the change once a trip is published.`
          : ""}
        confirmLabel={propagate ? `Update ${propagate.trips.length} ${propagate.trips.length === 1 ? "trip" : "trips"}` : "Update"}
        onConfirm={applyToTrips}
        details={propagate ? <p className="text-sm text-muted-foreground">{propagate.trips.map(t => t.name).join(", ")}</p> : undefined}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={next => { if (!next) setRemoving(null); }}
        title="Remove this saved info?"
        description={removing ? `"${removing.title}" won't be added to new trips any more. Trips that already have it keep their copy.` : ""}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
