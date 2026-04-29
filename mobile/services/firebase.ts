import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeFirestore, getFirestore, type Firestore } from "firebase/firestore";
import {
  initializeAuth, getAuth, getReactNativePersistence,
  signInAnonymously, type Auth,
} from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { SecureStorageAdapter } from "./secureStorageAdapter";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

function getOrCreateApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _storage: FirebaseStorage | null = null;
let _authReady: Promise<void> | null = null;

function ensureApp(): FirebaseApp {
  if (!_app) _app = getOrCreateApp();
  return _app;
}

export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY &&
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function firebaseDb(): Firestore {
  if (!_db) {
    const app = ensureApp();
    try {
      _db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch {
      _db = getFirestore(app);
    }
  }
  return _db;
}

export function firebaseAuth(): Auth {
  if (!_auth) {
    const app = ensureApp();
    try {
      _auth = initializeAuth(app, {
        persistence: getReactNativePersistence(SecureStorageAdapter),
      });
    } catch {
      _auth = getAuth(app);
    }
  }
  return _auth;
}

export function firebaseStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(ensureApp());
  return _storage;
}

/**
 * Ensure auth is ready. Signs in anonymously if no user.
 * Never blocks longer than 5 seconds.
 */
export function waitForAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return Promise.resolve();

  if (!_authReady) {
    const auth = firebaseAuth();

    // If auth already has a user, resolve immediately
    if (auth.currentUser) {
      console.log("[Firebase] Already signed in:", auth.currentUser.isAnonymous ? "anonymous" : auth.currentUser.email);
      _authReady = Promise.resolve();
      return _authReady;
    }

    _authReady = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("[Firebase] Auth timeout — proceeding");
        resolve();
      }, 5000);

      const unsub = auth.onAuthStateChanged((user) => {
        unsub();
        clearTimeout(timeout);
        if (user) {
          console.log("[Firebase] Auth ready:", user.isAnonymous ? "anonymous" : user.email);
          resolve();
        } else {
          signInAnonymously(auth)
            .then(() => console.log("[Firebase] Anonymous auth OK"))
            .catch((err) => console.warn("[Firebase] Anonymous auth failed:", err))
            .finally(resolve);
        }
      });
    });
  }

  return _authReady;
}
