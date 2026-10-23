import { collection, doc, onSnapshot, query, setDoc, deleteDoc, where, type Unsubscribe } from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { ComplianceDoc, User } from "@/types";

/**
 * The traveller directory and HR compliance, shared by everyone in the organisation (or kept per user without one).
 * One document per traveller in each collection, so two teammates editing different people never clash.
 * Document IDs start with the scope ("org id" or "u-uid") so one agency can never write into another's.
 */
const TRAVELERS = "directory_travelers";
const COMPLIANCE = "traveler_compliance";

export interface DirectoryScope {
  orgId: string | null;
  uid: string;
}

const scopeKey = (s: DirectoryScope) => s.orgId ?? `u-${s.uid}`;
const docId = (s: DirectoryScope, travelerId: string) => `${scopeKey(s)}__${travelerId}`;
const owner = (s: DirectoryScope) => ({ organization_id: s.orgId, user_id: s.uid });

function scoped(name: string, s: DirectoryScope) {
  const col = collection(firebaseDb(), name);
  return s.orgId
    ? query(col, where("organization_id", "==", s.orgId))
    : query(col, where("organization_id", "==", null), where("user_id", "==", s.uid));
}

export function subscribeDirectoryTravelers(
  s: DirectoryScope,
  onChange: (travelers: User[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(scoped(TRAVELERS, s), snap => {
    onChange(snap.docs.map(d => d.data().traveler as User).filter(u => u && typeof u.id === "string"));
  }, onError);
}

export function subscribeCompliance(
  s: DirectoryScope,
  onChange: (compliance: Record<string, ComplianceDoc[]>) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(scoped(COMPLIANCE, s), snap => {
    const out: Record<string, ComplianceDoc[]> = {};
    for (const d of snap.docs) {
      const data = d.data();
      if (typeof data.traveler_id === "string" && Array.isArray(data.docs)) out[data.traveler_id] = data.docs as ComplianceDoc[];
    }
    onChange(out);
  }, onError);
}

// Firestore rejects undefined values; drop them rather than fail the whole write
const clean = <T extends object>(value: T): T => JSON.parse(JSON.stringify(value));

export function saveDirectoryTraveler(s: DirectoryScope, traveler: User): Promise<void> {
  return setDoc(doc(firebaseDb(), TRAVELERS, docId(s, traveler.id)), { ...owner(s), traveler: clean(traveler), updated_at: new Date().toISOString() });
}

export function deleteDirectoryTraveler(s: DirectoryScope, travelerId: string): Promise<void> {
  return deleteDoc(doc(firebaseDb(), TRAVELERS, docId(s, travelerId)));
}

export function saveCompliance(s: DirectoryScope, travelerId: string, docs: ComplianceDoc[]): Promise<void> {
  return setDoc(doc(firebaseDb(), COMPLIANCE, docId(s, travelerId)), { ...owner(s), traveler_id: travelerId, docs: clean(docs), updated_at: new Date().toISOString() });
}

export function deleteCompliance(s: DirectoryScope, travelerId: string): Promise<void> {
  return deleteDoc(doc(firebaseDb(), COMPLIANCE, docId(s, travelerId)));
}
