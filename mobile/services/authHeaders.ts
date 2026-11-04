import { firebaseAuth } from "./firebase";

/**
 * The signed-in user's token as a header; empty when no one is signed in or Firebase isn't available.
 * Its own file so the web preview can stand in for it without bundling Firebase's native login code.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await firebaseAuth().currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
