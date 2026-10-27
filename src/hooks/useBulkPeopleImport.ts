import { changePersonOnTrip } from "@/lib/personChanges";
import { useQueryClient } from '@tanstack/react-query';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useTrips } from '@/context/TripsContext';
import { useDirectoryTravelers } from '@/context/directory';
import { firebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { mergePeopleIntoTrip } from '@/lib/bulkPeople';
import { deriveAttendeesString } from '@/lib/travelerSync';
import type { Trip, User } from '@/types';

export interface BulkPeopleSelection { matched: User[]; created: User[]; tripId?: string }

/** Save directory contacts and their trip copies together; report success only after commit. */
export function useBulkPeopleImport() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { trips, updateTrip } = useTrips();
  const [directory, setDirectory] = useDirectoryTravelers();
  const qc = useQueryClient();
  return async ({ matched, created, tripId }: BulkPeopleSelection) => {
    const people = [...matched, ...created];
    if (!people.length) return;
    const ids = new Set(people.map(person => person.id));
    const affected = trips.filter(trip => trip.id === tripId || trip.travelers?.some(person => ids.has(person.id)) || trip.travelerIds?.some(id => ids.has(id)));
    if (tripId && !affected.some(trip => trip.id === tripId)) throw new Error('That trip is no longer available. Choose another trip.');
    const cloud = isFirebaseConfigured() && !!user && user.id !== 'demo' && user.id.length > 20;
    if (!cloud) {
      setDirectory(prev => {
        const next = new Map(prev.map(person => [person.id, person]));
        for (const person of people) next.set(person.id, { ...next.get(person.id), ...person });
        return [...next.values()];
      });
      for (const trip of affected) updateTrip(trip.id, mergePeopleIntoTrip(trip, people, trip.id === tripId));
      return;
    }
    if (people.length + affected.length * 2 > 450) throw new Error('This import touches too many trips. Import a smaller group at a time.');
    const db = firebaseDb();
    const scope = currentOrg?.id || `u-${user.id}`;
    const directoryRefs = people.map(person => doc(db, 'directory_travelers', `${scope}__${person.id}`));
    const tripRefs = affected.map(trip => doc(db, 'trips', trip.id));
    const updates = await runTransaction(db, async transaction => {
      const knownIds = new Set(directory.map(person => person.id));
      const contacts = await Promise.all(directoryRefs.map((ref, i) => knownIds.has(people[i].id) ? transaction.get(ref) : Promise.resolve(null)));
      const tripDocs = await Promise.all(tripRefs.map(ref => transaction.get(ref)));
      const savedPeople = people.map((person, i) => {
        const stored = contacts[i]?.data()?.traveler as User | undefined;
        if (stored?.email && person.email && stored.email.trim().toLowerCase() !== person.email.trim().toLowerCase()) {
          throw new Error(`${person.name}'s email changed since this preview. Go back and review the list again.`);
        }
        return { ...person, ...stored, email: person.email || stored?.email || '', avatar: stored?.avatar || person.avatar || '' };
      });
      const result = tripDocs.map((snapshot, i) => {
        if (!snapshot.exists()) throw new Error('A trip was removed while importing. Refresh and try again.');
        const data = snapshot.data();
        for (const person of (data.travelers || []) as NonNullable<Trip['travelers']>) {
          const incoming = savedPeople.find(value => value.id === person.id);
          if (incoming?.email && person.email && incoming.email.toLowerCase() !== person.email.trim().toLowerCase()) {
            throw new Error(`${person.name} has a different email on ${affected[i].name}. Review that contact before importing.`);
          }
        }
        const updates = mergePeopleIntoTrip({ travelers: data.travelers || [], travelerIds: data.traveler_ids || [] }, savedPeople, affected[i].id === tripId);
        let linked: Record<string, any> = { ...data, travelers: updates.travelers, traveler_ids: updates.travelerIds };
        for (const person of savedPeople) linked = changePersonOnTrip(linked, person);
        return { id: affected[i].id, ...updates, organizer: linked.organizer || undefined, publishedSnapshot: linked.published_snapshot, attendees: deriveAttendeesString(updates.travelers || []), paxCount: String(updates.travelers?.length || 0) };
      });
      savedPeople.forEach((person, i) => transaction.set(directoryRefs[i], {
        organization_id: currentOrg?.id || null, user_id: user.id,
        traveler: JSON.parse(JSON.stringify(person)), updated_at: new Date().toISOString(),
      }, { merge: true }));
      result.forEach((trip, i) => {
        transaction.update(tripRefs[i], {
          travelers: JSON.parse(JSON.stringify(trip.travelers)), traveler_ids: trip.travelerIds,
          traveler_emails: [...new Set((trip.travelers || []).map(person => (person.email || '').trim().toLowerCase()).filter(Boolean))],
          attendees: trip.attendees, pax_count: trip.paxCount,
          organizer: trip.organizer ? JSON.parse(JSON.stringify(trip.organizer)) : null,
          ...(trip.publishedSnapshot ? { published_snapshot: JSON.parse(JSON.stringify(trip.publishedSnapshot)) } : {}),
        });
        transaction.set(doc(db, 'trip_versions', trip.id), { updated_at: serverTimestamp() });
      });
      return result;
    });
    const byId = new Map(updates.map(trip => [trip.id, trip]));
    qc.setQueryData<Trip[]>(['trips', currentOrg?.id || user.id], prev => prev?.map(trip => ({ ...trip, ...byId.get(trip.id) })));
  };
}
