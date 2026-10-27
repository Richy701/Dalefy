/** A stale editor may change untouched fields, but must never overwrite a newer edit to the same field. */
export function tripPatch(before: Record<string, unknown>, desired: Record<string, unknown>, current: Record<string, unknown>) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (same(before[key], value)) continue;
    if (key === 'history') { patch.history = [...new Map([...(current.history as any[] || []), ...(value as any[] || [])].map(entry => [entry.id, entry])).values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60); continue; }
    // Derived summaries are recalculated from the committed traveller list.
    if (['attendees', 'pax_count', 'traveler_emails'].includes(key)) continue;
    if (!same(before[key], current[key]) && !same(value, current[key])) {
      throw new Error(`This trip's ${key.replaceAll('_', ' ')} changed in another session. Refresh and review before saving again.`);
    }
    patch[key] = value;
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
