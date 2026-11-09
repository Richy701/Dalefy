import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { firebaseDb, firebaseStorage } from "./firebase";
import type { EventDocument, Trip, TripInfo } from "@/types";

const COLLECTION = "org_saved_info";

/** Info a team keeps once and reuses on its trips, such as the 24/7 contact or travel insurance */
export interface SavedInfoItem {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  documents: EventDocument[];
  /** On: every new trip gets it. Off: only offered under "Add from saved info". */
  automatic: boolean;
  createdAt: string;
}

export async function fetchSavedInfo(orgId: string): Promise<SavedInfoItem[]> {
  const snap = await getDocs(query(collection(firebaseDb(), COLLECTION), where("organization_id", "==", orgId)));
  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        organizationId: orgId,
        title: typeof data.title === "string" ? data.title : "",
        body: typeof data.body === "string" ? data.body : "",
        documents: Array.isArray(data.documents) ? (data.documents as EventDocument[]) : [],
        automatic: data.automatic !== false,
        createdAt: typeof data.created_at === "string" ? data.created_at : "",
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Creates the item when it has no id yet, and returns the id it was saved under */
export async function saveSavedInfo(
  orgId: string,
  uid: string,
  item: { id?: string; title: string; body: string; documents: EventDocument[]; automatic: boolean; createdAt?: string },
): Promise<string> {
  const col = collection(firebaseDb(), COLLECTION);
  const ref = item.id ? doc(col, item.id) : doc(col);
  const now = new Date().toISOString();
  await setDoc(ref, {
    organization_id: orgId,
    title: item.title,
    body: item.body,
    documents: item.documents,
    automatic: item.automatic,
    created_at: item.createdAt || now,
    updated_at: now,
    updated_by: uid,
  });
  return ref.id;
}

/** Trips keep their own copy of a file's link, so deleting an item leaves its files in place for them */
export async function deleteSavedInfo(id: string): Promise<void> {
  await deleteDoc(doc(collection(firebaseDb(), COLLECTION), id));
}

export async function uploadSavedInfoFile(orgId: string, uid: string, file: File): Promise<EventDocument> {
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileRef = storageRef(firebaseStorage(), `saved-info/${orgId}/${uid}/${unique}${ext}`);
  await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  return {
    id: `doc-${unique}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    url: await getDownloadURL(fileRef),
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

/** A trip's own copy of a saved item. Later edits only reach it if someone chooses to update it. */
export function infoFromSaved(item: SavedInfoItem): TripInfo {
  return {
    id: `info-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedInfoId: item.id,
    title: item.title,
    body: item.body,
    ...(item.documents.length ? { documents: item.documents } : {}),
  };
}

export function hasSavedInfo(info: TripInfo[] | undefined, item: SavedInfoItem): boolean {
  return (info ?? []).some(page => page.savedInfoId === item.id);
}

/** A new trip with the team's automatic items after whatever pages it already has */
export function withSavedInfo<T extends Trip>(trip: T, items: SavedInfoItem[]): T {
  const added = items.filter(item => item.automatic && !hasSavedInfo(trip.info, item)).map(infoFromSaved);
  return added.length ? { ...trip, info: [...(trip.info ?? []), ...added] } : trip;
}
