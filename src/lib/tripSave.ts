// Field order is not a change: the same cards written by another tool can list their fields differently
const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));

// Lists merged card by card, so two people editing different events (or travellers) on one trip both save
const ITEM_LISTS: Record<string, string> = { events: 'event', travelers: 'traveller', info: 'info card', documents: 'document', tasks: 'task', media: 'photo' };

type Item = Record<string, unknown> & { id: string };
const isItemList = (v: unknown): v is Item[] => Array.isArray(v) && v.every(x => !!x && typeof x === 'object' && typeof (x as Item).id === 'string');
const itemName = (item: Item | undefined, kind: string) => {
  const label = item && [item.title, item.name, item.label].find(v => typeof v === 'string' && v.trim());
  return label ? `"${label}"` : `A ${kind}`;
};
const conflict = (what: string) => new Error(`${what} was changed in another session. Refresh and review before saving again.`);

/** Three-way merge of one list: my edits since `before` land on `current`, unless the same card changed there too. */
function mergeItems(before: Item[], mine: Item[], theirs: Item[], kind: string): Item[] {
  const base = new Map(before.map(i => [i.id, i]));
  const mineById = new Map(mine.map(i => [i.id, i]));
  const theirsById = new Map(theirs.map(i => [i.id, i]));
  const result = new Map<string, Item>();
  const ids = new Set([...base.keys(), ...mineById.keys(), ...theirsById.keys()]);
  for (const id of ids) {
    const b = base.get(id), m = mineById.get(id), t = theirsById.get(id);
    const iChanged = !same(b, m), theyChanged = !same(b, t);
    if (!iChanged) { if (t) result.set(id, t); continue; }
    if (!theyChanged || same(m, t)) { if (m) result.set(id, m); continue; }
    throw conflict(itemName(m ?? t ?? b, kind));
  }
  // Keep the order of whoever reordered; otherwise the stored order, with new cards where they were added
  const sharedOrder = (list: Item[]) => list.map(i => i.id).filter(id => base.has(id));
  const iReordered = sharedOrder(mine).join() !== sharedOrder(before).filter(id => mineById.has(id)).join();
  const order = iReordered ? [...mine, ...theirs] : [...theirs, ...mine];
  return [...new Set(order.map(i => i.id))].filter(id => result.has(id)).map(id => result.get(id)!);
}

/** A stale editor may change untouched fields, but must never overwrite a newer edit to the same field. */
export function tripPatch(before: Record<string, unknown>, desired: Record<string, unknown>, current: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (same(before[key], value)) continue;
    if (key === 'history') { patch.history = [...new Map([...(current.history as any[] || []), ...(value as any[] || [])].map(entry => [entry.id, entry])).values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60); continue; }
    // Derived summaries are recalculated from the committed traveller list.
    if (['attendees', 'pax_count', 'traveler_emails'].includes(key)) continue;
    if (same(before[key], current[key]) || same(value, current[key])) { patch[key] = value; continue; }
    const lists = [before[key] ?? [], value ?? [], current[key] ?? []];
    if (key in ITEM_LISTS && lists.every(isItemList)) {
      patch[key] = mergeItems(lists[0] as Item[], lists[1] as Item[], lists[2] as Item[], ITEM_LISTS[key]);
      continue;
    }
    throw conflict(`This trip's ${key.replaceAll('_', ' ')}`);
  }
  return patch;
}

export function syncLinkedOrganizer<T extends { organizer?: any; travelers?: any[]; published_snapshot?: any }>(data: T): T {
  const sync = (organizer: any, travelers: any[]) => {
    if (!organizer?.travelerId) return organizer;
    const person = travelers.find(person => person.id === organizer.travelerId);
    return person ? { ...organizer, name: person.name, email: person.email || '', avatar: person.avatar || '' } : null;
  };
  const result = { ...data, organizer: sync(data.organizer, data.travelers || []) ?? null };
  if (data.published_snapshot) result.published_snapshot = { ...data.published_snapshot, organizer: sync(data.published_snapshot.organizer, data.published_snapshot.travelers || []) ?? null };
  return result;
}
