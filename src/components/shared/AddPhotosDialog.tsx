import { useEffect, useMemo, useRef, useState } from "react";
import { Images, FileArrowUp, Check } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { matchPhotoToPerson, uploadTravelerPhoto } from "@/lib/travelerPhotos";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Directory people a photo can belong to */
  people: User[];
  /** Whose Storage folder the photos go in: the signed-in user's */
  uid: string;
  /** Called once with every photo that uploaded, for the page to save on the person and their trips */
  onUploaded: (photos: Array<{ personId: string; url: string }>) => void | Promise<void>;
}

interface Row {
  key: number;
  file: File;
  preview: string;
  personId: string | null;
  candidates: User[];
  include: boolean;
}

type RowStatus = "new" | "replace" | "pick" | "none" | "twice";

const STATUS_LABEL: Record<RowStatus, string> = {
  new: "Matched",
  replace: "Replaces current photo",
  pick: "Pick who",
  none: "No one by that name",
  twice: "Same person twice",
};

const STATUS_TONE: Record<RowStatus, string> = {
  new: "text-emerald-700 dark:text-emerald-400",
  replace: "text-foreground",
  pick: "text-amber-700 dark:text-amber-400",
  none: "text-muted-foreground",
  twice: "text-amber-700 dark:text-amber-400",
};

const isImage = (f: File) => /^image\/(png|jpeg|webp|heic|heif|avif)$/.test(f.type) || /\.(png|jpe?g|webp|heic)$/i.test(f.name);

/** Files dropped from Finder, walking into any folder among them */
async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      if (!file.name.startsWith(".")) out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      for (const e of batch) await walk(e);
    }
  };
  const entries = [...items].map(i => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length) { for (const e of entries) await walk(e); return out; }
  return [...items].map(i => i.getAsFile()).filter((f): f is File => !!f);
}

/**
 * Drop a folder of headshots named after people ("Aaron.png", "Carly Singer.png"); each file is matched to a
 * directory person by name, checked in a list, shrunk to 512px and uploaded. The page then puts the photo on the
 * person and every trip they're on, which is how it reaches the phone.
 */
export function AddPhotosDialog({ open, onOpenChange, people, uid, onUploaded }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sortedPeople = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const personById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);

  // Object URLs for the thumbnails are released when the list changes or the dialog closes
  useEffect(() => () => { rows?.forEach(r => URL.revokeObjectURL(r.preview)); }, [rows]);

  const load = (files: File[]) => {
    const images = files.filter(isImage).sort((a, b) => a.name.localeCompare(b.name));
    if (!images.length) return;
    const next: Row[] = images.map((file, i) => {
      const m = matchPhotoToPerson(file.name, people);
      return { key: i, file, preview: URL.createObjectURL(file), personId: m.person?.id ?? null, candidates: m.candidates, include: !!m.person };
    });
    setRows(next);
  };

  const statusOf = (r: Row, i: number, all: Row[]): RowStatus => {
    if (!r.personId) return r.candidates.length ? "pick" : "none";
    if (all.slice(0, i).some(o => o.include && o.personId === r.personId)) return "twice";
    return personById.get(r.personId)?.avatar ? "replace" : "new";
  };

  const statuses = rows ? rows.map((r, i) => statusOf(r, i, rows)) : [];
  const ticked = rows ? rows.filter((r, i) => r.include && r.personId && statuses[i] !== "twice") : [];
  const unmatched = statuses.filter(s => s === "pick" || s === "none").length;

  const reset = () => { setRows(null); setProgress(null); setDragging(false); };

  const upload = async () => {
    if (!ticked.length) return;
    const failed: string[] = [];
    const done: Array<{ personId: string; url: string }> = [];
    setProgress({ done: 0, total: ticked.length, failed });
    // Four at a time: quick on a folder of 200, gentle on the connection
    const queue = [...ticked];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          const url = await uploadTravelerPhoto(uid, r.personId!, r.file);
          done.push({ personId: r.personId!, url });
        } catch {
          failed.push(r.file.name);
        }
        setProgress({ done: done.length + failed.length, total: ticked.length, failed: [...failed] });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (done.length) {
      setProgress({ done: 0, total: 1, failed: [] });
      try { await onUploaded(done); } catch (error) {
        setProgress({ done: 1, total: 1, failed: [error instanceof Error ? error.message : 'Could not save photo links. Please retry.'] });
        return;
      }
    }
    if (failed.length) setProgress({ done: ticked.length, total: ticked.length, failed });
    if (!failed.length) { reset(); onOpenChange(false); }
  };

  const pick = (key: number, personId: string) => setRows(prev => prev && prev.map(r => (r.key === key ? { ...r, personId, include: true } : r)));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && progress && progress.done < progress.total) return; if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex flex-col bg-card rounded-xl border border-border p-6 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">Add photos</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Drop a folder of headshots named after people, like Aaron.png or Carly Singer.png. Each one is matched by name for you to check, shrunk, and shown on the person everywhere, including their phone.
          </DialogDescription>
        </DialogHeader>

        {progress ? (
          <div className="mt-2 space-y-3">
            <Progress value={Math.round((progress.done / progress.total) * 100)} aria-label="Uploading photos" />
            <p className="text-sm text-muted-foreground">
              {progress.done < progress.total ? `Uploading ${progress.done + 1} of ${progress.total}` : `${progress.total - progress.failed.length} of ${progress.total} uploaded`}
            </p>
            {progress.failed.length > 0 && progress.done === progress.total && (
              <div className="rounded-xl border border-border bg-secondary p-3 text-sm">
                <p className="font-medium text-foreground">Couldn't upload {progress.failed.length}</p>
                <p className="text-muted-foreground mt-1 break-words">{progress.failed.join(", ")}</p>
              </div>
            )}
          </div>
        ) : !rows ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); void filesFromDrop(e.dataTransfer.items).then(load); }}
            className={cn(
              "mt-2 flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-brand bg-brand/5" : "border-border bg-background hover:border-brand/40",
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><Images className="h-5 w-5" /></span>
            <span className="text-sm font-semibold text-foreground">Drop the folder here, or click to choose files</span>
            <span className="text-xs text-muted-foreground">PNG, JPEG or WebP. Big originals are fine, they're shrunk before upload.</span>
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={e => { load([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </button>
        ) : (
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-14">Photo</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const s = statuses[i];
                  const blocked = !r.personId || s === "twice";
                  const options = r.candidates.length && !r.personId ? r.candidates : sortedPeople;
                  return (
                    <TableRow key={r.key} className={cn(blocked && "opacity-70")}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Include ${r.file.name}`}
                          checked={r.include && !blocked}
                          disabled={blocked}
                          onCheckedChange={c => setRows(prev => prev && prev.map(x => (x.key === r.key ? { ...x, include: !!c } : x)))}
                        />
                      </TableCell>
                      <TableCell><img src={r.preview} alt="" className="h-9 w-9 rounded-full object-cover" /></TableCell>
                      <TableCell className="text-sm text-foreground truncate max-w-40" title={r.file.name}>{r.file.name.replace(/\.[a-z0-9]+$/i, "")}</TableCell>
                      <TableCell>
                        <Select value={r.personId} items={options.map(p => ({ label: p.name, value: p.id }))} onValueChange={v => { if (v) pick(r.key, v); }}>
                          <SelectTrigger className="h-8 w-full min-w-40" aria-label={`Person for ${r.file.name}`}>
                            <SelectValue placeholder={r.candidates.length ? "Which one?" : "Choose a person"} />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={cn("text-xs font-medium whitespace-nowrap", STATUS_TONE[s])}>{STATUS_LABEL[s]}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row sm:items-center gap-3">
          {progress ? (
            <Button type="button" onClick={() => { reset(); onOpenChange(false); }} disabled={progress.done < progress.total} className="rounded-xl h-10 px-8 font-bold bg-primary text-primary-foreground hover:opacity-90 gap-1.5">
              <Check className="h-4 w-4" /> Done
            </Button>
          ) : rows ? (
            <>
              <span className="text-xs text-muted-foreground sm:mr-auto">
                {rows.length} photo{rows.length === 1 ? "" : "s"}, {ticked.length} matched{unmatched ? `, ${unmatched} to sort out or skip` : ""}.
              </span>
              <Button type="button" variant="ghost" onClick={() => setRows(null)} className="rounded-xl h-10 px-6 font-bold text-muted-foreground hover:bg-secondary">Back</Button>
              <Button type="button" onClick={() => void upload()} disabled={!ticked.length} className="rounded-xl h-10 px-8 font-bold bg-primary text-primary-foreground hover:opacity-90 gap-1.5">
                <FileArrowUp className="h-4 w-4" /> Upload {ticked.length}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-10 px-6 font-bold text-muted-foreground hover:bg-secondary">Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
