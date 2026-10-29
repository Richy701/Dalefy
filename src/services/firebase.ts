import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  terminate, clearIndexedDbPersistence, type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Static property access only: a dynamic import.meta.env[key] makes Vite inline the whole env object.
const env = (value: string | undefined) => (value ?? "").trim();

const firebaseConfig = {
  apiKey: env(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: env(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: env(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: env(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: env(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: env(import.meta.env.VITE_FIREBASE_APP_ID),
};

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

function init() {
  if (!app && isFirebaseConfigured()) {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = openDb(app);
    storageInstance = getStorage(app);
  }
}

export function isFirebaseConfigured(): boolean {
  return !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  );
}

export function firebaseAuth(): Auth {
  init();
  return authInstance!;
}

// Keep a copy of Firestore data in IndexedDB so a return visit shows the last
// trips instantly while fresh data loads. Falls back to memory if unavailable.
function openDb(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(firebaseApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return initializeFirestore(firebaseApp, {});
  }
}

export function firebaseDb(): Firestore {
  init();
  if (!dbInstance && app) dbInstance = openDb(app);
  return dbInstance!;
}

/** Wipe the offline copy on sign-out so the next person on this device can't read it. */
export async function clearFirestoreCache(): Promise<void> {
  if (!dbInstance) return;
  const db = dbInstance;
  dbInstance = null;
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another open tab still holds the cache; it clears when that tab signs out
  }
}

export function firebaseStorage(): FirebaseStorage {
  init();
  return storageInstance!;
}
