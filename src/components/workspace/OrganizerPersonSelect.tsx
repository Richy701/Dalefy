import { useId } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { TripOrganizer, User } from '@/types';

type TeamPerson = { userId: string; name: string; email: string; avatar?: string };

export function OrganizerPersonSelect({ people, team = [], value, onChange }: {
  people: User[];
  /** Colleagues who aren't on the trip, such as someone overseeing it from home. Their details stay editable. */
  team?: TeamPerson[];
  value: Partial<TripOrganizer>;
  onChange: (value: Partial<TripOrganizer>) => void;
}) {
  const labelId = useId();
  const items = [{ value: 'manual', label: 'Enter organiser details manually' }, ...people.map(person => ({ value: person.id, label: `${person.name}${person.email ? ` · ${person.email}` : ''}` }))];
  const sameEmail = (a?: string, b?: string) => !!a && a.trim().toLowerCase() === b?.trim().toLowerCase();
  const colleagues = team.filter(member => !people.some(person => sameEmail(person.email, member.email)));
  items.push(...colleagues.map(member => ({ value: `team:${member.userId}`, label: `${member.name}${member.email ? ` · ${member.email}` : ''} (your team)` })));
  if (value.travelerId && !people.some(person => person.id === value.travelerId)) items.push({ value: value.travelerId, label: `${value.name || 'Linked person'} (no longer on trip)` });
  const selectedColleague = value.travelerId ? undefined : colleagues.find(member => sameEmail(member.email, value.email) && member.name === value.name);
  return <div className="min-w-0 space-y-2 mb-4">
    <label id={labelId} className="text-xs font-medium text-muted-foreground">{colleagues.length ? 'Choose someone on this trip or your team' : 'Choose someone on this trip'}</label>
    <Select items={items} value={value.travelerId || (selectedColleague ? `team:${selectedColleague.userId}` : 'manual')} onValueChange={id => {
      if (!id || id === 'manual') { const { travelerId: _, ...details } = value; onChange(details); return; }
      const member = colleagues.find(item => `team:${item.userId}` === id);
      if (member) { onChange({ name: member.name, email: member.email, avatar: member.avatar || '', role: '', company: '', phone: '' }); return; }
      const person = people.find(person => person.id === id);
      if (person) onChange({ travelerId: person.id, name: person.name, email: person.email || '', avatar: person.avatar || '', role: '', company: '', phone: '' });
    }}>
      <SelectTrigger aria-labelledby={labelId} className="w-full min-w-0"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
    {value.travelerId && <div className="flex items-center gap-2 text-xs text-muted-foreground">{value.avatar && <img src={value.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />}<span>Linked to {value.name}. Name, email and photo stay in sync with their trip profile. Edit those details in People, or choose manual entry to unlink. App permissions stay unchanged.</span></div>}
    {!people.length && !colleagues.length && <p className="text-xs text-muted-foreground">Add someone to the trip to select them here.</p>}
  </div>;
}
