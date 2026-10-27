import { useMemo, useRef, useState } from "react";
import { FileArrowUp, UsersThree } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { parsePeople } from "@/lib/parsePeople";
import { initialsFrom } from "@/lib/names";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everyone already in the directory, so pasted people can be matched instead of duplicated */
  existing: User[];
  /** When adding to a trip: its name, and who is already on it */
  tripName?: string;
  onTripIds?: ReadonlySet<string>;
  /** Called once with everyone ticked: directory people matched by email or name, and the new ones to create */
  onAdd: (people: { matched: User[]; created: User[] }) => void;
}

type RowStatus = "new" | "matched" | "onTrip" | "duplicate" | "noName";

interface Row {
  key: number;
  name: string;
  email: string;
  include: boolean;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  new: "New",
  matched: "In directory",
  onTrip: "Already on trip",
  duplicate: "Duplicate",
  noName: "Needs a name",
};

const STATUS_TONE: Record<RowStatus, string> = {
  new: "text-emerald-700 dark:text-emerald-400",
  matched: "text-foreground",
  onTrip: "text-muted-foreground",
  duplicate: "text-amber-700 dark:text-amber-400",
  noName: "text-amber-700 dark:text-amber-400",
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Paste a list or drop a CSV, check the preview, add everyone in one go. Matches people already in the
 * directory by email first, then by exact name, so re-pasting a list never creates copies.
 */
export function BulkAddPeopleDialog({ open, onOpenChange, existing, tripName, onTripIds, onAdd }: Props) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const byEmail = useMemo(() => new Map(existing.filter(u => u.email).map(u => [norm(u.email), u])), [existing]);
  const byName = useMemo(() => new Map(existing.map(u => [norm(u.name), u])), [existing]);

  const match = (r: Row): User | undefined => (r.email && byEmail.get(norm(r.email))) || (r.name ? byName.get(norm(r.name)) : undefined);

  const statusOf = (r: Row, i: number, all: Row[]): RowStatus => {
    if (!r.name.trim()) return "noName";
    const earlier = all.slice(0, i).some(o => (r.email && norm(o.email) === norm(r.email)) || norm(o.name) === norm(r.name));
    if (earlier) return "duplicate";
    const m = match(r);
    if (m && onTripIds?.has(m.id)) return "onTrip";
    return m ? "matched" : "new";
  };

  const preview = (source: string) => {
    const parsed = parsePeople(source);
    const next: Row[] = parsed.map((p, i) => ({ key: i, name: p.name, email: p.email, include: true }));
    // Rows that can't or shouldn't be added start unticked
    next.forEach((r, i) => { const s = statusOf(r, i, next); r.include = s === "new" || s === "matched"; });
    setRows(next);
  };

  const readFile = async (file: File) => {
    setFileName(file.name);
    const source = await file.text();
    setText(source);
    preview(source);
  };

  const reset = () => { setText(""); setRows(null); setFileName(null); };

  const statuses = rows ? rows.map((r, i) => statusOf(r, i, rows)) : [];
  const ticked = rows ? rows.filter((r, i) => r.include && statuses[i] !== "noName" && statuses[i] !== "onTrip") : [];
  const target = tripName ? `to ${tripName}` : "to the directory";

  const add = () => {
    if (!rows) return;
    const matched: User[] = [];
    const created: User[] = [];
    const seen = new Set<string>();
    const stamp = Date.now();
    rows.forEach((r, i) => {
      if (!r.include || statuses[i] === "noName" || statuses[i] === "onTrip" || statuses[i] === "duplicate") return;
      const m = match(r);
      if (m) { if (!seen.has(m.id)) { seen.add(m.id); matched.push(m); } return; }
      const name = r.name.trim().replace(/\s+/g, " ");
      created.push({ id: `custom-${stamp}-${i}`, name, email: r.email.trim(), role: "Traveler", avatar: "", initials: initialsFrom(name), status: "Active" });
    });
    onAdd({ matched, created });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex flex-col bg-card rounded-xl border border-border p-6 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">Add many people</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Paste from a spreadsheet or an email, one person per line, or choose a CSV. Names and emails are picked out for you to check before anything is added {target}.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3 mt-2">
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"Ama Mensah, ama@example.com\nKofi Boateng <kofi@example.com>\nYaw Darko"}
              className="min-h-40 font-mono text-sm"
              aria-label="People to add"
            />
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
              <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => fileInput.current?.click()}>
                <FileArrowUp className="h-4 w-4" /> Choose a CSV
              </Button>
              <span className="text-xs text-muted-foreground sm:ml-auto">A header row like Name, Email is fine.</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const s = statuses[i];
                  const blocked = s === "noName" || s === "onTrip";
                  return (
                    <TableRow key={r.key} className={cn(blocked && "opacity-60")}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Include ${r.name || r.email}`}
                          checked={r.include && !blocked}
                          disabled={blocked}
                          onCheckedChange={c => setRows(prev => prev && prev.map(x => x.key === r.key ? { ...x, include: !!c } : x))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={r.name} aria-label="Name" placeholder="Name" className="h-8" onChange={e => setRows(prev => prev && prev.map(x => x.key === r.key ? { ...x, name: e.target.value, include: true } : x))} />
                      </TableCell>
                      <TableCell>
                        <Input value={r.email} aria-label="Email" placeholder="Email" className="h-8" onChange={e => setRows(prev => prev && prev.map(x => x.key === r.key ? { ...x, email: e.target.value } : x))} />
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
          {rows ? (
            <>
              <span className="text-xs text-muted-foreground sm:mr-auto">
                {rows.length} found{fileName ? ` in ${fileName}` : ""}. {ticked.length} will be added.
              </span>
              <Button type="button" variant="ghost" onClick={() => setRows(null)} className="rounded-xl h-10 px-6 font-bold text-muted-foreground hover:bg-secondary">Back</Button>
              <Button type="button" onClick={add} disabled={!ticked.length} className="rounded-xl h-10 px-8 font-bold bg-primary text-primary-foreground hover:opacity-90 gap-1.5">
                <UsersThree className="h-4 w-4" /> Add {ticked.length} {target}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-10 px-6 font-bold text-muted-foreground hover:bg-secondary">Cancel</Button>
              <Button type="button" onClick={() => preview(text)} disabled={!text.trim()} className="rounded-xl h-10 px-8 font-bold bg-primary text-primary-foreground hover:opacity-90">Preview</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
