import { randomUUID } from "node:crypto";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { getDocument, queryDocuments, updateDocument, setDocument, decodeValue, encodeValue, docId, type FirestoreDoc } from "./_firebaseAdmin.js";

/**
 * Who holds the team's trips, and handing them over. A trip's creator can't be changed from the
 * browser (the rules lock user_id) and nobody else can see their private trips, so when someone
 * leaves, their trips would be stranded. Owners and admins move them here.
 *
 *   GET  ?orgId=                     -> { owners: [{ uid, name, email, member, trips, privateTrips }] }
 *   POST { orgId, fromUid, toUid }   -> { moved, privateMoved }
 *
 * Private trips stay private, now to the person who receives them. Each handover lands in the
 * trip's history and in team_activity.
 */

interface Request {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Response {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(data: unknown): unknown;
}

const RANK: Record<string, number> = { viewer: 0, agent: 1, admin: 2, owner: 3 };
const ID_RE = /^[\w-]{1,128}$/;
const HISTORY_KEEP = 60;

const text = (doc: FirestoreDoc | null, key: string) => {
  const v = decodeValue(doc?.fields?.[key]);
  return typeof v === "string" ? v : "";
};
const nameOf = (profile: FirestoreDoc | null) => text(profile, "name") || text(profile, "email") || "Someone";

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, res, { bucket: "team-trips", limit: 60, windowMs: 10 * 60_000 })) return;

  const payload = await verifyFirebaseToken(String(req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "").trim());
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const callerUid = payload.sub;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const orgId = String((req.method === "GET" ? req.query.orgId : body.orgId) ?? "").trim();
  if (!ID_RE.test(orgId)) return res.status(400).json({ error: "orgId required" });

  try {
    const roster = await queryDocuments("org_members", "organization_id", orgId, 500);
    const roleOf = new Map(roster.map(m => [text(m, "user_id"), text(m, "role")]));
    const callerRole = roleOf.get(callerUid) ?? "";
    if (callerRole !== "owner" && callerRole !== "admin") return res.status(403).json({ error: "Only owners and admins can hand over trips" });

    if (req.method === "GET") {
      const trips = await queryDocuments("trips", "organization_id", orgId, 5000, ["user_id", "private"]);
      const counts = new Map<string, { trips: number; privateTrips: number }>();
      for (const t of trips) {
        const uid = text(t, "user_id");
        if (!uid) continue;
        const c = counts.get(uid) ?? { trips: 0, privateTrips: 0 };
        c.trips++;
        if (decodeValue(t.fields?.private) === true) c.privateTrips++;
        counts.set(uid, c);
      }
      const owners = await Promise.all([...counts].map(async ([uid, c]) => {
        const profile = await getDocument("profiles", uid).catch(() => null);
        return { uid, name: nameOf(profile), email: text(profile, "email"), member: roleOf.has(uid), ...c };
      }));
      return res.status(200).json({ owners });
    }

    const fromUid = typeof body.fromUid === "string" ? body.fromUid.trim() : "";
    const toUid = typeof body.toUid === "string" ? body.toUid.trim() : "";
    if (!ID_RE.test(fromUid) || !ID_RE.test(toUid) || fromUid === toUid) return res.status(400).json({ error: "Choose who the trips go to" });
    const toRole = roleOf.get(toUid) ?? "";
    if (!["owner", "admin", "agent"].includes(toRole)) return res.status(400).json({ error: "Trips can only go to an owner, admin or agent on this team" });
    // Someone still on the team: only their own trips, or those of someone below you
    const fromRole = roleOf.get(fromUid);
    if (fromRole && fromUid !== callerUid && !(RANK[fromRole] < RANK[callerRole])) {
      return res.status(403).json({ error: "You can only hand over trips from someone whose role is below yours" });
    }

    const [fromProfile, toProfile, callerProfile] = await Promise.all([
      getDocument("profiles", fromUid).catch(() => null),
      getDocument("profiles", toUid).catch(() => null),
      getDocument("profiles", callerUid).catch(() => null),
    ]);
    const fromName = nameOf(fromProfile), toName = nameOf(toProfile), callerName = nameOf(callerProfile);
    const theirs = (await queryDocuments("trips", "user_id", fromUid, 5000)).filter(t => text(t, "organization_id") === orgId);

    let moved = 0, privateMoved = 0;
    for (const trip of theirs) {
      const now = new Date();
      const entry = { id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: now.toISOString(), by: callerName, summary: `Handed the trip over from ${fromName} to ${toName}` };
      const history = Array.isArray(decodeValue(trip.fields?.history)) ? decodeValue(trip.fields.history) : [];
      // The revision check keeps an edit made a moment ago from being overwritten
      await updateDocument("trips", docId(trip), {
        user_id: encodeValue(toUid),
        history: encodeValue([entry, ...history].slice(0, HISTORY_KEEP)),
      }, ["user_id", "history"], trip.updateTime);
      moved++;
      if (decodeValue(trip.fields?.private) === true) privateMoved++;
    }

    if (moved) {
      await setDocument("team_activity", randomUUID(), {
        organization_id: encodeValue(orgId),
        at: encodeValue(new Date().toISOString()),
        by_uid: encodeValue(callerUid),
        by_name: encodeValue(callerName),
        kind: encodeValue("trips"),
        summary: encodeValue(`Handed ${moved} ${moved === 1 ? "trip" : "trips"} from ${fromName} to ${toName}`),
      }).catch(err => console.warn("team_activity:", err instanceof Error ? err.message : err));
    }
    return res.status(200).json({ moved, privateMoved });
  } catch (err) {
    const conflict = err instanceof Error && err.message === "Database conflict";
    console.error("team-trips error:", err instanceof Error ? err.message : err);
    return res.status(conflict ? 409 : 502).json({ error: conflict ? "A trip changed while moving it. Try again." : "Couldn't move the trips. Try again in a moment." });
  }
}
