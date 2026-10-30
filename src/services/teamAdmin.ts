import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { firebaseDb } from "./firebase";
import { apiFetch, getIdToken } from "@/lib/api";

/** Someone who created trips on the team, counted on the server so private trips are included */
export interface TripHolder {
  uid: string;
  name: string;
  email: string;
  /** Still on the team */
  member: boolean;
  trips: number;
  privateTrips: number;
}

export async function fetchTripHolders(orgId: string): Promise<TripHolder[]> {
  const { owners } = await apiFetch<{ owners: TripHolder[] }>(`/api/team-trips?orgId=${encodeURIComponent(orgId)}`, { auth: await getIdToken() });
  return owners;
}

/** Give every team trip one person created to someone else on the team (owner, admin or agent) */
export async function handOverTrips(orgId: string, fromUid: string, toUid: string): Promise<{ moved: number; privateMoved: number }> {
  return apiFetch("/api/team-trips", { method: "POST", auth: await getIdToken(), body: { orgId, fromUid, toUid } });
}

/** Email a teammate a link that signs them straight in, or one to set a new password */
export async function emailTeammate(kind: "sign-in" | "reset", email: string): Promise<void> {
  await apiFetch("/api/auth-email", {
    method: "POST",
    body: kind === "sign-in" ? { kind: "magic-link", email, web: true } : { kind: "reset", email },
  });
}

export type TeamActivityKind = "team" | "trips" | "email" | "sign-in-as";

export interface TeamActivityEntry {
  id: string;
  /** Epoch ms */
  at: number;
  byUid: string;
  byName: string;
  kind: TeamActivityKind;
  summary: string;
}

/** Note something an owner or admin did to the team. Never blocks the action it describes */
export function logTeamActivity(orgId: string, by: { uid: string; name: string }, kind: TeamActivityKind, summary: string) {
  addDoc(collection(firebaseDb(), "team_activity"), {
    organization_id: orgId,
    at: new Date().toISOString(),
    by_uid: by.uid,
    by_name: by.name.slice(0, 120),
    kind,
    summary: summary.slice(0, 300),
  }).catch(() => {});
}

/** The team's own log plus every "Sign in as" session, newest first. Owners and admins only */
export async function fetchTeamActivity(orgId: string): Promise<TeamActivityEntry[]> {
  const db = firebaseDb();
  const [logged, sessions] = await Promise.all([
    getDocs(query(collection(db, "team_activity"), where("organization_id", "==", orgId))),
    getDocs(query(collection(db, "impersonation_log"), where("organization_id", "==", orgId))).catch(() => null),
  ]);
  const out: TeamActivityEntry[] = logged.docs.map(d => {
    const x = d.data();
    return { id: d.id, at: Date.parse(x.at), byUid: x.by_uid ?? "", byName: x.by_name ?? "", kind: (x.kind ?? "team") as TeamActivityKind, summary: x.summary ?? "" };
  });
  for (const d of sessions?.docs ?? []) {
    const x = d.data();
    const ended = x.ended_at ? ` until ${new Date(x.ended_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "";
    out.push({ id: d.id, at: Date.parse(x.started_at), byUid: x.by_uid ?? "", byName: x.by_name ?? "", kind: "sign-in-as", summary: `Signed in as ${x.as_name || "a teammate"}${ended}` });
  }
  return out.filter(e => Number.isFinite(e.at)).sort((a, b) => b.at - a.at);
}
