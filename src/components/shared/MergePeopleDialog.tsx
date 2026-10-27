import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { combinePersonDetails } from '@/lib/personChanges';
import type { User } from '@/types';

export function MergePeopleDialog({ people, onClose, onMerge }: { people: User[]; onClose: () => void; onMerge: (keep: User, other: User, patch: Partial<User>) => Promise<void> }) {
  const [keepId, setKeepId] = useState(people[0].id);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const keep = people.find(p => p.id === keepId)!, other = people.find(p => p.id !== keepId)!;
  const merged = combinePersonDetails(keep, other);
  const conflicts = ['name', 'email', 'avatar', ...Object.keys({ ...other.profile, ...keep.profile }).map(key => `profile.${key}`)].filter(key => {
    const get = (p: User) => key.startsWith('profile.') ? p.profile?.[key.slice(8) as keyof NonNullable<User['profile']>] : p[key as 'name' | 'email' | 'avatar'];
    return get(keep) && get(other) && get(keep) !== get(other);
  });
  const get = (p: User, key: string) => String(key.startsWith('profile.') ? p.profile?.[key.slice(8) as keyof NonNullable<User['profile']>] || '' : p[key as 'name' | 'email' | 'avatar'] || '');
  const labels: Record<string, string> = { name: 'Name', email: 'Email', avatar: 'Photo', 'profile.phone': 'Phone', 'profile.dateOfBirth': 'Date of birth', 'profile.nationality': 'Nationality', 'profile.dietary': 'Dietary needs', 'profile.emergencyName': 'Emergency contact', 'profile.emergencyPhone': 'Emergency phone', 'profile.notes': 'Notes' };
  const items = people.map((p, i) => ({ value: p.id, label: `${p.name} · ${p.email || 'No email'} · record ${i + 1}` }));
  return <Dialog open onOpenChange={() => { if (!busy) onClose(); }}><DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Merge duplicate people</DialogTitle><DialogDescription>Only merge records belonging to the same person. Trips, event assignments, documents and app links move to the kept record. App roles stay unchanged.</DialogDescription></DialogHeader>
    <label className="text-sm font-medium" id="merge-keep">Record to keep</label>
    <Select items={items} value={keepId} disabled={busy} onValueChange={id => { if (id) { setKeepId(id); setChoices({}); } }}><SelectTrigger aria-labelledby="merge-keep" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
    <p className="text-sm text-muted-foreground">Missing details are filled from the other record. Choose which value to keep wherever they differ. The duplicate record is removed after a successful merge.</p>
    {conflicts.map(key => <fieldset key={key} disabled={busy} className="space-y-2"><legend className="text-sm font-medium">{labels[key] || key}</legend>{people.map((p, i) => <label key={p.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm break-all"><input type="radio" name={key} checked={choices[key] === p.id} onChange={() => setChoices(prev => ({ ...prev, [key]: p.id }))} />{key === 'avatar' ? <img src={get(p, key)} alt={`Photo on record ${i + 1}`} className="h-12 w-12 rounded-full object-cover" /> : get(p, key)}</label>)}</fieldset>)}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || conflicts.some(key => !choices[key])} onClick={async () => {
      setBusy(true); setError('');
      const patch: Partial<User> = { name: merged.name, email: merged.email, avatar: merged.avatar, profile: { ...merged.profile } };
      for (const key of conflicts) { const value = get(people.find(p => p.id === choices[key])!, key); if (key.startsWith('profile.')) (patch.profile as Record<string, string>)[key.slice(8)] = value; else (patch as Record<string, unknown>)[key] = value; }
      try { await onMerge(keep, other, patch); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Merge failed. No records were merged.'); } finally { setBusy(false); }
    }}>{busy ? 'Merging…' : 'Merge people'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
