/**
 * Lightweight Firestore REST client for serverless functions.
 * Authenticates via a dedicated cron user (Firebase Auth email/password).
 */

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? "";
if (!PROJECT_ID) throw new Error("VITE_FIREBASE_PROJECT_ID is required");
const API_KEY = process.env.VITE_FIREBASE_API_KEY || "";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken: { idToken: string; expiresAt: number } | null = null;

/** Sign in via Firebase Auth REST API and get an ID token */
async function getAuthToken(): Promise<string> {
  // Reuse token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.idToken;
  }

  const email = process.env.CRON_EMAIL;
  const password = process.env.CRON_PASSWORD;
  if (!email || !password || !API_KEY) {
    throw new Error("Missing CRON_EMAIL, CRON_PASSWORD, or VITE_FIREBASE_API_KEY");
  }

  const resp = await fetch(
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

// ── Firestore REST operations ──────────────────────────────────────────────

export interface FirestoreDoc {
  name: string;
  fields: Record<string, any>;
}

/** List all documents in a collection */
export async function listCollection(collectionName: string): Promise<FirestoreDoc[]> {
  const token = await getAuthToken();
  const docs: FirestoreDoc[] = [];
  let pageToken = "";

  do {
    const url = `${BASE}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const resp = await fetch(url, { headers: authHeaders(token) });
    if (!resp.ok) throw new Error(`Firestore list ${collectionName}: ${resp.status}`);
    const data = await resp.json();
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return docs;
}

/** Update specific fields on a document */
export async function updateDocument(
  collectionName: string,
  docId: string,
  fields: Record<string, any>,
  fieldPaths: string[],
): Promise<void> {
  const token = await getAuthToken();
  const mask = fieldPaths.map(f => `updateMask.fieldPaths=${f}`).join("&");
  const url = `${BASE}/${collectionName}/${docId}?${mask}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    console.error(`Firestore update ${collectionName}/${docId}:`, resp.status, await resp.text());
    throw new Error("Database update failed");
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
