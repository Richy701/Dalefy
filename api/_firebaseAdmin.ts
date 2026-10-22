/**
 * Lightweight Firestore REST client for serverless functions.
 *
 * Authenticates keylessly as the Firebase Admin service account (Vercel OIDC ->
 * Google, see _firebaseAuthAdmin.ts). If that isn't configured, or Google refuses
 * it, it falls back to the dedicated cron user (Firebase Auth email/password),
 * which local dev still uses.
 */
import { getServiceAccessToken } from "./_firebaseAuthAdmin.js";

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? "";
if (!PROJECT_ID) throw new Error("VITE_FIREBASE_PROJECT_ID is required");
const API_KEY = process.env.VITE_FIREBASE_API_KEY || "";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken: { idToken: string; expiresAt: number } | null = null;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Sign in via Firebase Auth REST API and get an ID token */
async function getPasswordToken(): Promise<string> {
  // Reuse token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.idToken;
  }

  const email = process.env.CRON_EMAIL;
  const password = process.env.CRON_PASSWORD;
  if (!email || !password || !API_KEY) {
    throw new Error("Missing CRON_EMAIL, CRON_PASSWORD, or VITE_FIREBASE_API_KEY");
  }

  const resp = await fetchWithTimeout(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  if (!resp.ok) {
    console.error("Firebase Auth sign-in failed:", resp.status, await resp.text());
    throw new Error("Authentication failed");
  }

  const data = await resp.json();
  cachedToken = {
    idToken: data.idToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
  };
  return cachedToken.idToken;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Set once Google refuses the service account, so this instance stops trying it
let keylessRefused = false;

/** A Firestore request with the server's credentials: keyless first, the cron sign-in as fallback */
async function firestoreFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!keylessRefused) {
    const token = await getServiceAccessToken().catch((err) => {
      console.warn("Keyless Firestore access unavailable:", err instanceof Error ? err.message : err);
      return null;
    });
    if (token) {
      const resp = await fetchWithTimeout(url, { ...init, headers: authHeaders(token) });
      if (resp.status !== 401 && resp.status !== 403) return resp;
      keylessRefused = true;
      console.warn(`Firestore refused keyless access (${resp.status}); using the cron sign-in`);
    }
  }
  return fetchWithTimeout(url, { ...init, headers: authHeaders(await getPasswordToken()) });
}

// ── Firestore REST operations ──────────────────────────────────────────────

export interface FirestoreDoc {
  name: string;
  fields: Record<string, any>;
  updateTime?: string;
}

export async function queryDocuments(collection: string, field: string, value: string, limit = 1): Promise<FirestoreDoc[]> {
  const response = await firestoreFetch(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } },
      limit,
    } }),
  });
  if (!response.ok) throw new Error(`Firestore query: ${response.status}`);
  const rows = await response.json() as Array<{ document?: FirestoreDoc }>;
  return rows.flatMap(row => row.document ? [row.document] : []);
}

/** Every document whose field equals any of the values (Firestore's IN takes 30 at a time; no result cap) */
export async function queryDocumentsIn(collection: string, field: string, values: string[]): Promise<FirestoreDoc[]> {
  const unique = [...new Set(values.filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) batches.push(unique.slice(i, i + 30));
  const results = await Promise.all(batches.map(async (batch) => {
    const response = await firestoreFetch(`${BASE}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "IN", value: { arrayValue: { values: batch.map(v => ({ stringValue: v })) } } } },
      } }),
    });
    if (!response.ok) throw new Error(`Firestore query: ${response.status}`);
    const rows = await response.json() as Array<{ document?: FirestoreDoc }>;
    return rows.flatMap(row => row.document ? [row.document] : []);
  }));
  return results.flat();
}

/** List all documents in a collection */
export async function listCollection(collectionName: string): Promise<FirestoreDoc[]> {
  const docs: FirestoreDoc[] = [];
  let pageToken = "";

  do {
    const url = `${BASE}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const resp = await firestoreFetch(url);
    if (!resp.ok) throw new Error(`Firestore list ${collectionName}: ${resp.status}`);
    const data = await resp.json();
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return docs;
}

/** Get a single document, or null if it does not exist / is not readable */
export async function getDocument(collectionName: string, id: string): Promise<FirestoreDoc | null> {
  const resp = await firestoreFetch(`${BASE}/${collectionName}/${encodeURIComponent(id)}`);
  if (resp.status === 404 || resp.status === 403) return null;
  if (!resp.ok) throw new Error(`Firestore get ${collectionName}/${id}: ${resp.status}`);
  return (await resp.json()) as FirestoreDoc;
}

/** Update specific fields on a document */
export async function updateDocument(
  collectionName: string,
  docId: string,
  fields: Record<string, any>,
  fieldPaths: string[],
  updateTime?: string,
): Promise<void> {
  const mask = fieldPaths.map(f => `updateMask.fieldPaths=${f}`).join("&");
  const condition = updateTime ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}` : "&currentDocument.exists=true";
  const url = `${BASE}/${collectionName}/${encodeURIComponent(docId)}?${mask}${condition}`;
  const resp = await firestoreFetch(url, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    if (resp.status === 409 || resp.status === 412 || (updateTime && resp.status === 400)) throw new Error("Database conflict");
    console.error(`Firestore update ${collectionName}/${docId}:`, resp.status, await resp.text());
    throw new Error("Database update failed");
  }
}

/** Create or overwrite a document */
export async function setDocument(collectionName: string, id: string, fields: Record<string, unknown>): Promise<void> {
  const resp = await firestoreFetch(`${BASE}/${collectionName}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`Firestore set ${collectionName}/${id}: ${resp.status}`);
}

/** Delete a document; a missing document counts as deleted */
export async function deleteDocument(collectionName: string, id: string): Promise<void> {
  const resp = await firestoreFetch(`${BASE}/${collectionName}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) throw new Error(`Firestore delete ${collectionName}/${id}: ${resp.status}`);
}

/**
 * Moves a trip's "last changed" stamp so travellers' apps reload it. Call after
 * a successful trip write. Never throws: a missed stamp only delays the update
 * until the app's next foreground or hourly check.
 */
export async function touchTripVersion(tripId: string): Promise<void> {
  try {
    const resp = await firestoreFetch(`${BASE}/trip_versions/${encodeURIComponent(tripId)}?updateMask.fieldPaths=updated_at`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { updated_at: { timestampValue: new Date().toISOString() } } }),
    });
    if (!resp.ok) console.warn(`trip_versions/${tripId}: ${resp.status}`);
  } catch (err) {
    console.warn(`trip_versions/${tripId}:`, err instanceof Error ? err.message : err);
  }
}

// ── Firestore value helpers ────────────────────────────────────────────────

export function decodeValue(val: any): any {
  if (!val) return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) return (val.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in val) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      obj[k] = decodeValue(v);
    }
    return obj;
  }
  return null;
}

export function encodeValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeValue) } };
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function docId(doc: FirestoreDoc): string {
  return doc.name.split("/").pop()!;
}
