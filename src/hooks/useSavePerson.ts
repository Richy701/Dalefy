import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useDirectoryTravelers } from '@/context/directory';
import { useTrips } from '@/context/TripsContext';
import { firebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { combinePersonDetails, changePersonOnTrip } from '@/lib/personChanges';
import { deriveAttendeesString } from '@/lib/travelerSync';
import { initialsFrom } from '@/lib/names';
import type { User } from '@/types';
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));

export function useSavePerson() {
  const { user } = useAuth(); const { currentOrg } = useOrg();
  const [directory, setDirectory] = useDirectoryTravelers();
  const { trips, updateTrip } = useTrips(); const qc = useQueryClient();
  return async (original: User, patch: Partial<User>, duplicate?: User) => {
    const person = { ...(duplicate ? combinePersonDetails(original, duplicate) : original), ...patch, id: original.id };
    person.initials = initialsFrom(person.name);
    if (!person.name.trim() || (person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email))) throw new Error('Enter a name and a valid email address.');
    if (!isFirebaseConfigured() || !user || user.id === 'demo' || user.id.length <= 20) {
      setDirectory([...directory.filter(p => p.id !== person.id && p.id !== duplicate?.id), person]);
      for (const trip of trips) {
        const changed = changePersonOnTrip({ ...trip, traveler_ids: trip.travelerIds, published_snapshot: trip.publishedSnapshot }, person, duplicate?.id);
        updateTrip(trip.id, { travelers: changed.travelers, travelerIds: changed.traveler_ids, events: changed.events, organizer: changed.organizer, publishedSnapshot: changed.published_snapshot });
      }
      return;
    }
    const db = firebaseDb(), orgId = currentOrg?.id || null, scope = orgId || `u-${user.id}`;
    // Shared team trips plus my own (private ones included); rules refuse a whole-team list so private trips stay hidden
    const listTrips = async () => {
      const trips = collection(db, 'trips');
      const snaps = await Promise.all(orgId
        ? [getDocs(query(trips, where('organization_id', '==', orgId), where('private', '==', false))), getDocs(query(trips, where('organization_id', '==', orgId), where('user_id', '==', user.id)))]
        : [getDocs(query(trips, where('user_id', '==', user.id)))]);
      return { docs: [...new Map(snaps.flatMap(s => s.docs).map(d => [d.id, d])).values()] };
    };
    const scoped = (name: string) => query(collection(db, name), ...(orgId ? [where('organization_id', '==', orgId)] : [where('organization_id', '==', null), where('user_id', '==', user.id)]));
    const [contacts, tripList, compliance] = await Promise.all([getDocs(scoped('directory_travelers')), listTrips(), duplicate ? getDocs(scoped('traveler_compliance')) : Promise.resolve(null)]);
    const ids = [person.id, duplicate?.id].filter(Boolean);
    const relevant = tripList.docs.filter(d => { const data = d.data(); return ids.some(id => data.travelers?.some((p: User) => p.id === id) || data.traveler_ids?.includes(id) || data.organizer?.travelerId === id || data.published_snapshot?.travelers?.some((p: User) => p.id === id)); });
    const members = duplicate ? (await Promise.all(relevant.map(trip => getDocs(query(collection(db, 'trip_members'), where('trip_id', '==', trip.id)))))).flatMap(s => s.docs).filter(d => d.data().linked_traveler_id === duplicate.id) : [];
    const contactDocs = contacts.docs.filter(d => ids.includes(d.data().traveler?.id));
    const complianceDocs = compliance?.docs.filter(d => ids.includes(d.data().traveler_id)) || [];
    if (relevant.length * 2 + members.length + contactDocs.length + complianceDocs.length + 3 > 450) throw new Error('Too many linked records to save together. Contact support before merging this person.');
    await runTransaction(db, async tx => {
      const refs = [...contactDocs, ...relevant, ...members, ...complianceDocs].map(d => d.ref);
      const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
      const current = new Map(snapshots.map(d => [d.ref.path, d]));
      const stored = contactDocs.find(d => d.data().traveler?.id === person.id);
      const latest = stored ? current.get(stored.ref.path)?.data()?.traveler as User | undefined : undefined;
      for (const key of Object.keys(patch) as (keyof User)[]) {
        if (latest && JSON.stringify(latest[key] ?? '') !== JSON.stringify(original[key] ?? '') && JSON.stringify(latest[key] ?? '') !== JSON.stringify(patch[key] ?? '')) throw new Error('This profile changed in another session. Reopen it and review before saving.');
      }
      const sourceDoc = duplicate && contactDocs.find(d => d.data().traveler?.id === duplicate.id);
      const source = sourceDoc ? current.get(sourceDoc.ref.path)?.data()?.traveler as User : duplicate;
      if (duplicate && sourceDoc && (!source || ['name', 'email', 'avatar', 'profile'].some(key => JSON.stringify(source[key as keyof User] ?? '') !== JSON.stringify(duplicate[key as keyof User] ?? '')))) throw new Error('The duplicate profile changed. Reopen the merge and review its details.');
      const finalPerson = { ...(source ? combinePersonDetails(latest || original, source) : latest || original), ...patch, id: person.id, initials: person.initials };
      tx.set(doc(db, 'directory_travelers', `${scope}__${person.id}`), { organization_id: orgId, user_id: user.id, traveler: clean(finalPerson), updated_at: new Date().toISOString() });
      for (const trip of relevant) {
        const snapshot = current.get(trip.ref.path)!;
        if (!snapshot.exists()) throw new Error('A linked trip was removed. Refresh and try again.');
        const changed = changePersonOnTrip(snapshot.data()!, finalPerson, duplicate?.id);
        const fields: Record<string, unknown> = { travelers: changed.travelers, traveler_ids: changed.traveler_ids, traveler_emails: [...new Set(changed.travelers.map((p: User) => (p.email || '').trim().toLowerCase()).filter(Boolean))], attendees: deriveAttendeesString(changed.travelers), pax_count: String(changed.travelers.length), organizer: changed.organizer || null };
        if (duplicate) fields.events = changed.events;
        if (changed.published_snapshot) fields.published_snapshot = changed.published_snapshot;
        tx.update(trip.ref, clean(fields)); tx.set(doc(db, 'trip_versions', trip.id), { updated_at: serverTimestamp() });
      }
      for (const member of members) {
        const latestMember = current.get(member.ref.path);
        if (latestMember?.exists() && latestMember.data()?.linked_traveler_id === duplicate?.id) tx.update(member.ref, { linked_traveler_id: person.id });
      }
      if (duplicate) {
        for (const contact of contactDocs) if (contact.data().traveler?.id === duplicate.id) tx.delete(contact.ref);
        const documents = [...new Map(complianceDocs.flatMap(d => current.get(d.ref.path)?.data()?.docs || []).map((d: unknown) => [JSON.stringify(d), d])).values()];
        if (documents.length) tx.set(doc(db, 'traveler_compliance', `${scope}__${person.id}`), { organization_id: orgId, user_id: user.id, traveler_id: person.id, docs: clean(documents), updated_at: new Date().toISOString() });
        for (const d of complianceDocs) if (d.data().traveler_id === duplicate.id) tx.delete(d.ref);
      }
    });
    await qc.invalidateQueries({ queryKey: ['trips', orgId || user.id] });
  };
}
