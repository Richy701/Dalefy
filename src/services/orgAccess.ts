import { doc, getDoc } from "firebase/firestore";
import { firebaseDb } from "./firebase";

/** Whether this user is allowlisted (app_config/org_creators) to create a new agency.
 *  Mirrors the Firestore rule; the rule is the real gate. */
export async function canCreateOrganization(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(firebaseDb(), "app_config", "org_creators"));
    return snap.exists() && snap.data()?.[uid] === true;
  } catch {
    return false;
  }
}
