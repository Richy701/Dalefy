/**
 * The one path for sending Expo push notifications, with token hygiene:
 * - tokens Expo rejects at send time (DeviceNotRegistered) are removed at once
 * - accepted pushes leave a ticket in push_tickets; checkPushReceipts() (run by
 *   the flight cron every 15 minutes) reads Expo's receipts and removes tokens of
 *   uninstalled apps, which Expo only reports there
 * - EXPO_ACCESS_TOKEN, when set, authenticates every request (Expo's enhanced
 *   push security)
 *
 * push_tokens documents are keyed by the token itself, and the app saves its token
 * on every launch, so a removed token comes back if that phone is still in use.
 */
import { listCollection, setDocument, deleteDocument, decodeValue, docId } from "./_firebaseAdmin.js";

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo keeps receipts for about a day and has most ready within 15 minutes */
const RECEIPT_READY_MS = 15 * 60_000;
const RECEIPT_EXPIRES_MS = 24 * 60 * 60_000;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  [key: string]: unknown;
}

interface Ticket { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } }

function headers(): Record<string, string> {
  const token = (process.env.EXPO_ACCESS_TOKEN ?? "").trim();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Same ID scheme the app uses when it saves its token */
const tokenDocId = (token: string) => token.replace(/[/\\]/g, "_");

async function removeToken(token: string, reason: string): Promise<void> {
  try {
    await deleteDocument("push_tokens", tokenDocId(token));
    console.log(`push: removed token (${reason})`);
  } catch (err) {
    console.warn("push: couldn't remove token:", err instanceof Error ? err.message : err);
  }
}

/** Sends in batches of 100 (Expo's limit); returns Expo's tickets in message order */
export async function sendPush(messages: PushMessage[]): Promise<Ticket[]> {
  const tickets: Ticket[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    let data: Ticket[] = [];
    try {
      const resp = await fetch(SEND_URL, { method: "POST", headers: headers(), body: JSON.stringify(chunk) });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) console.warn("push: send failed", resp.status, JSON.stringify(json).slice(0, 300));
      data = Array.isArray(json?.data) ? json.data : [];
    } catch (err) {
      console.warn("push: send failed:", err instanceof Error ? err.message : err);
    }
    const sentAt = new Date().toISOString();
    await Promise.all(chunk.map(async (msg, j) => {
      const ticket = data[j] ?? { status: "error", message: "No ticket" };
      tickets.push(ticket);
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        await removeToken(msg.to, "not registered at send");
      } else if (ticket.status === "ok" && ticket.id) {
        await setDocument("push_tickets", ticket.id, {
          token: { stringValue: msg.to },
          sent_at: { stringValue: sentAt },
        }).catch(() => { /* receipts are a bonus; the send already happened */ });
      }
    }));
  }
  return tickets;
}

/** Reads receipts for pushes old enough to have one; removes dead tokens and spent tickets */
export async function checkPushReceipts(): Promise<{ checked: number; removed: number }> {
  const now = Date.now();
  const due: { id: string; token: string }[] = [];
  for (const doc of await listCollection("push_tickets")) {
    const id = docId(doc);
    const sentAt = Date.parse(decodeValue(doc.fields?.sent_at) ?? "");
    const age = Number.isFinite(sentAt) ? now - sentAt : Infinity;
    if (age > RECEIPT_EXPIRES_MS) { await deleteDocument("push_tickets", id).catch(() => {}); continue; }
    if (age >= RECEIPT_READY_MS) due.push({ id, token: String(decodeValue(doc.fields?.token) ?? "") });
  }
  if (!due.length) return { checked: 0, removed: 0 };

  let removed = 0;
  for (let i = 0; i < due.length; i += 1000) {
    const batch = due.slice(i, i + 1000);
    let receipts: Record<string, Ticket> = {};
    try {
      const resp = await fetch(RECEIPTS_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ids: batch.map(t => t.id) }) });
      receipts = (await resp.json().catch(() => ({})))?.data ?? {};
    } catch {
      continue; // try again next run, until the ticket expires
    }
    for (const { id, token } of batch) {
      const receipt = receipts[id];
      if (!receipt) continue; // not ready yet
      if (receipt.status === "error") {
        if (receipt.details?.error === "DeviceNotRegistered" && token) { await removeToken(token, "uninstalled"); removed++; }
        else console.warn("push: delivery failed", receipt.details?.error ?? receipt.message);
      }
      await deleteDocument("push_tickets", id).catch(() => {});
    }
  }
  return { checked: due.length, removed };
}
