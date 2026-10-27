import { useId } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { TripOrganizer, User } from '@/types';

export function OrganizerPersonSelect({ people, value, onChange }: {
  people: User[];
  value: Partial<TripOrganizer>;
  onChange: (value: Partial<TripOrganizer>) => void;
}) {
  const labelId = useId();
  const items = [{ value: 'manual', label: 'Enter organiser details manually' }, ...people.map(person => ({ value: person.id, label: `${person.name}${person.email ? ` · ${person.email}` : ''}` }))];
  if (value.travelerId && !people.some(person => person.id === value.travelerId)) items.push({ value: value.travelerId, label: `${value.name || 'Linked person'} (no longer on trip)` });
  return <div className="space-y-2 mb-4">
    <label id={labelId} className="text-xs font-medium text-muted-foreground">Choose someone on this trip</label>
    <Select items={items} value={value.travelerId || 'manual'} onValueChange={id => {
      if (!id || id === 'manual') { const { travelerId: _, ...details } = value; onChange(details); return; }
      const person = people.find(person => person.id === id);
      if (person) onChange({ travelerId: person.id, name: person.name, email: person.email || '', avatar: person.avatar || '', role: '', company: '', phone: '' });
    }}>
      <SelectTrigger aria-labelledby={labelId} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
    {value.travelerId && <div className="flex items-center gap-2 text-xs text-muted-foreground">{value.avatar && <img src={value.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />}<span>Linked to {value.name}. Name, email and photo stay in sync with their trip profile. Edit those details in People, or choose manual entry to unlink. App permissions stay unchanged.</span></div>}
    {!people.length && <p className="text-xs text-muted-foreground">Add someone to the trip to select them here.</p>}
  </div>;
}
