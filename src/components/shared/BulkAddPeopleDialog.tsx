import { useMemo, useRef, useState } from 'react';
import { FileArrowUp, UsersThree, SpinnerGap, CheckCircle } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { parsePeople } from '@/lib/parsePeople';
import { assessPeople, type PeopleRow, type PeopleRowStatus } from '@/lib/bulkPeople';
import { initialsFrom } from '@/lib/names';
import type { BulkPeopleSelection } from '@/hooks/useBulkPeopleImport';
import type { Trip, User } from '@/types';

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; existing: User[];
  tripName?: string; onTripIds?: ReadonlySet<string>;
  trips?: Trip[]; initialTripId?: string;
  onAdd: (people: BulkPeopleSelection) => Promise<void> | void;
}
const LABELS: Record<PeopleRowStatus, string> = {
  sync: 'Refresh trip email', new: 'New person', matched: 'Existing person', update: 'Add missing email', onTrip: 'Already on trip',
  duplicate: 'Duplicate — skipped', noName: 'Enter a name', invalidEmail: 'Check email', conflict: 'Match needs review',
};
const MAX_PEOPLE = 250;

export function BulkAddPeopleDialog({ open, onOpenChange, existing, tripName, onTripIds, trips, initialTripId, onAdd }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PeopleRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'reading' | 'parsing' | 'saving'>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ count: number; target: string } | null>(null);
  const [destination, setDestination] = useState(initialTripId || 'directory');
  const busy = phase !== 'idle';
  const busyRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const createdIds = useRef(new Map<number, string>());
  const chosenTrip = trips?.find(trip => trip.id === destination);
  const idsOnTrip = useMemo(() => chosenTrip ? new Set([...(chosenTrip.travelerIds || []), ...(chosenTrip.travelers || []).map(person => person.id)]) : onTripIds, [chosenTrip, onTripIds]);
  const assessments = useMemo(() => assessPeople(rows || [], existing, idsOnTrip), [rows, existing, idsOnTrip]);
  const selected = (rows || []).filter((row, i) => row.include && assessments[i].eligible);
  const updates = selected.filter(row => assessments[rows!.indexOf(row)].status === 'update').length;
  const target = tripName || chosenTrip?.name || 'the directory';
  const destinationItems = [{ value: 'directory', label: 'Directory only' }, ...(trips || []).map(trip => ({ value: trip.id, label: trip.name }))];
  const reset = () => { setSaved(null); setText(''); setRows(null); setFileName(null); setError(''); setDestination(initialTripId || 'directory'); createdIds.current.clear(); };
  const close = (next: boolean) => { if (busyRef.current) return; if (!next) reset(); onOpenChange(next); };
  const nextPaint = () => new Promise<void>(resolve => setTimeout(resolve, 30));
  const parse = (source: string) => {
    const parsed = parsePeople(source);
    if (!parsed.length) throw new Error('No people found. Paste a name and email per line, or choose a CSV.');
    if (parsed.length > MAX_PEOPLE) throw new Error(`Please import up to ${MAX_PEOPLE} people at a time.`);
    createdIds.current.clear();
    const next = parsed.map((person, key) => ({ key, name: person.name, email: person.email, include: true }));
    const results = assessPeople(next, existing, idsOnTrip);
    setRows(next.map((row, i) => ({ ...row, include: results[i].eligible })));
  };
  const preview = async (file?: File) => {
    if (busyRef.current) return;
    busyRef.current = true; setError(''); setFileName(file?.name || null); setPhase(file ? 'reading' : 'parsing');
    try {
      await nextPaint();
      if (file && !/\.(csv|txt)$/i.test(file.name)) throw new Error('Choose a CSV or text file. For Excel, save as CSV or copy and paste the cells.');
      if ((file?.size || text.length) > 2 * 1024 * 1024) throw new Error('Choose a file smaller than 2 MB.');
      const source = file ? await file.text() : text;
      if (file) { setText(source); setFileName(file.name); }
      setPhase('parsing'); await nextPaint(); parse(source);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read this list. Please try again.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  };
  const add = async () => {
    if (!rows || busyRef.current || !selected.length) return;
    busyRef.current = true; setPhase('saving'); setError('');
    try {
      const matched: User[] = [], created: User[] = [];
      rows.forEach((row, i) => {
        const assessment = assessments[i];
        if (!row.include || !assessment.eligible) return;
        if (assessment.matched) {
          matched.push({ ...assessment.matched, email: row.email.trim().toLowerCase() || assessment.matched.email });
        } else {
          const name = row.name.trim().replace(/\s+/g, ' ');
          if (!createdIds.current.has(row.key)) createdIds.current.set(row.key, `custom-${crypto.randomUUID()}`);
          created.push({ id: createdIds.current.get(row.key)!, name, email: row.email.trim().toLowerCase(), role: 'Traveler', avatar: '', initials: initialsFrom(name), status: 'Active' });
        }
      });
      await nextPaint();
      await onAdd({ matched, created, tripId: chosenTrip?.id });
      setSaved({ count: selected.length, target });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save these people. Your list is still here; please try again.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  };
  if (saved) return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-md"><DialogHeader><CheckCircle className="h-10 w-10 text-emerald-600" weight="fill" /><DialogTitle>People saved</DialogTitle><DialogDescription role="status">{saved.count} {saved.count === 1 ? 'person has' : 'people have'} been saved to {saved.target}. Existing profile photos and details have been kept.</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => close(false)}>Done</Button></DialogFooter></DialogContent></Dialog>;
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex flex-col bg-card rounded-xl border border-border p-6 shadow-2xl" aria-busy={busy}>
      <DialogHeader className="space-y-2 text-left">
        <DialogTitle className="text-2xl font-semibold tracking-tight">Add or update people</DialogTitle>
        <DialogDescription>Paste names and emails from Excel or Outlook, or upload a CSV. Review the matches before saving. Missing emails are added to existing people and their trips.</DialogDescription>
      </DialogHeader>
      {trips && <div className="space-y-1.5"><label className="text-xs font-medium" id="bulk-destination">Add people to</label>
        <Select value={destination} onValueChange={value => setDestination(value || 'directory')} items={destinationItems} disabled={busy}>
          <SelectTrigger className="w-full" aria-labelledby="bulk-destination"><SelectValue /></SelectTrigger>
          <SelectContent>{destinationItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      {tripName && <p className="text-sm text-muted-foreground">Adding to <strong className="text-foreground">{tripName}</strong></p>}
      {fileName && <div role="status" className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-3"><FileArrowUp className="h-5 w-5 shrink-0 mt-0.5" /><div className="min-w-0"><p className="text-sm font-medium break-all">{fileName}</p><p className="text-xs text-muted-foreground mt-1">{busy ? 'Processing your file…' : rows ? `${rows.length} rows loaded. Review below, then save. Nothing has been saved yet.` : 'File selected. Check any error below.'}</p></div></div>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {busy && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerGap className="h-4 w-4 animate-spin" />{phase === 'reading' ? 'Reading your file…' : phase === 'parsing' ? 'Finding names and emails…' : 'Saving people and trip details… Keep this window open.'}</p>}
      {!rows ? <div className="space-y-3 mt-2">
        <Textarea value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder={'Name, Email\nAma Mensah, ama@example.com\nKofi Boateng <kofi@example.com>'} className="min-h-40 font-mono text-sm" aria-label="People to add" />
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void preview(file); event.target.value = ''; }} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()} className="gap-1.5"><FileArrowUp className="h-4 w-4" /> Choose CSV or text</Button>
          <span className="text-xs text-muted-foreground">Up to 250 people · 2 MB</span>
        </div>
        <p className="text-xs text-muted-foreground">CSV headers can include Name, Email, First name and Last name in any order. Other columns are ignored. Email is optional for new people.</p>
      </div> : <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{rows.length} found{fileName ? ` in ${fileName}` : ''} · {selected.length} selected · {updates} missing {updates === 1 ? "email" : "emails"} to add</span>
          <div className="flex gap-3"><button type="button" disabled={busy} className="underline" onClick={() => setRows(prev => prev?.map(row => ({ ...row, include: true })) || null)}>Select all valid</button><button type="button" disabled={busy} className="underline" onClick={() => setRows(prev => prev?.map(row => ({ ...row, include: false })) || null)}>Clear selection</button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border"><Table>
          <TableHeader><TableRow><TableHead className="w-10" /><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row, i) => { const assessment = assessments[i]; return <TableRow key={row.key}>
            <TableCell><Checkbox aria-label={`Include ${row.name || row.email}`} checked={row.include && assessment.eligible} disabled={busy || !assessment.eligible} onCheckedChange={checked => setRows(prev => prev?.map(value => value.key === row.key ? { ...value, include: !!checked } : value) || null)} /></TableCell>
            <TableCell><Input value={row.name} disabled={busy} aria-label={`Name on row ${i + 1}`} placeholder={assessment.matched?.name || 'Name'} className="h-9 min-w-36" onChange={event => setRows(prev => prev?.map(value => value.key === row.key ? { ...value, name: event.target.value, include: true } : value) || null)} /></TableCell>
            <TableCell><Input value={row.email} disabled={busy} aria-label={`Email on row ${i + 1}`} aria-invalid={assessment.status === 'invalidEmail' || assessment.status === 'conflict'} placeholder="Email (optional)" className="h-9 min-w-48" onChange={event => setRows(prev => prev?.map(value => value.key === row.key ? { ...value, email: event.target.value, include: true } : value) || null)} /></TableCell>
            <TableCell className="text-xs min-w-36"><span className={assessment.eligible ? 'text-foreground' : 'text-muted-foreground'}>{LABELS[assessment.status]}</span>{assessment.status === 'conflict' && <p className="mt-1 text-muted-foreground">A different email or more than one matching person exists. Review their details before importing.</p>}</TableCell>
          </TableRow>; })}</TableBody>
        </Table></div>
        <p className="text-xs text-muted-foreground">Only selected, valid rows are saved. Existing emails are never replaced automatically. This does not send invitations or messages.</p>
      </>}
      <DialogFooter className="pt-3 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => rows ? setRows(null) : close(false)}>{rows ? 'Back' : 'Cancel'}</Button>
        <Button type="button" disabled={busy || (rows ? !selected.length : !text.trim())} onClick={() => rows ? void add() : void preview()} className="gap-1.5 max-w-full h-auto min-h-10 whitespace-normal py-2">
          {busy ? <SpinnerGap className="h-4 w-4 animate-spin" /> : rows ? <UsersThree className="h-4 w-4" /> : null}
          {phase === 'saving' ? 'Saving…' : rows ? `Save ${selected.length} to ${target}` : 'Review people'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
