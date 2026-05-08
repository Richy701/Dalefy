import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

interface TripDoc {
  name?: string;
  destination?: string;
  events?: Array<{ title?: string; type?: string; date?: string }>;
  status?: string;
  user_id?: string;
  published_snapshot?: Record<string, unknown>;
}

interface PushToken {
  token: string;
  device_id: string;
  user_id: string;
  platform: string;
}

export const onTripUpdated = onDocumentWritten(
  { document: "trips/{tripId}", region: "us-central1" },
  async (event) => {
    const tripId = event.params.tripId;
    const before = event.data?.before?.data() as TripDoc | undefined;
    const after = event.data?.after?.data() as TripDoc | undefined;

    // Skip deletes
    if (!after) return;

    // Skip creates (no before data) — travelers get notified on join, not creation
    if (!before) return;

    const change = describeChange(before, after);
    if (!change) return;

    // Get all members of this trip
    const membersSnap = await db
      .collection("trip_members")
      .where("trip_id", "==", tripId)
      .get();

    if (membersSnap.empty) return;

    // Collect unique device_ids (skip the trip creator — they made the edit)
    const deviceIds = new Set<string>();
    for (const doc of membersSnap.docs) {
      const data = doc.data();
      const deviceId = data.device_id as string | undefined;
      if (deviceId) deviceIds.add(deviceId);
    }

    if (deviceIds.size === 0) return;

    // Get push tokens for these devices
    const tokens: PushToken[] = [];
    const deviceIdArray = [...deviceIds];

    // Firestore "in" queries support max 30 values
    for (let i = 0; i < deviceIdArray.length; i += 30) {
      const batch = deviceIdArray.slice(i, i + 30);
      const tokenSnap = await db
        .collection("push_tokens")
        .where("device_id", "in", batch)
        .get();

      for (const doc of tokenSnap.docs) {
        const data = doc.data() as PushToken;
        if (data.token) tokens.push(data);
      }
    }

    if (tokens.length === 0) return;

    const tripName = after.name ?? "your trip";

    // Send via Expo Push API
    const messages = tokens.map((t) => ({
      to: t.token,
      title: `${tripName} updated`,
      body: change,
      data: { tripId, category: "update" },
      sound: "default" as const,
      priority: "high" as const,
    }));

    // Expo accepts batches of up to 100
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!resp.ok) {
        console.error(`Expo push failed: ${resp.status} ${await resp.text()}`);
      }
    }

    console.log(
      `Sent ${messages.length} push(es) for trip ${tripId}: "${change}"`
    );
  }
);

function describeChange(before: TripDoc, after: TripDoc): string | null {
  const beforeEvents = before.events ?? [];
  const afterEvents = after.events ?? [];

  // Published snapshot changed — this is the main edit path from web
  if (
    JSON.stringify(before.published_snapshot) !==
    JSON.stringify(after.published_snapshot)
  ) {
    return "The itinerary has been updated - tap to see changes";
  }

  // Events added
  if (afterEvents.length > beforeEvents.length) {
    const diff = afterEvents.length - beforeEvents.length;
    const newest = afterEvents.find(
      (e) => !beforeEvents.some((b) => b.title === e.title && b.date === e.date)
    );
    if (newest?.title) {
      return `New event added: ${newest.title}`;
    }
    return `${diff} new event${diff > 1 ? "s" : ""} added`;
  }

  // Events removed
  if (afterEvents.length < beforeEvents.length) {
    return "An event has been removed from the itinerary";
  }

  // Events reordered or modified
  if (JSON.stringify(beforeEvents) !== JSON.stringify(afterEvents)) {
    return "The itinerary has been updated - tap to see changes";
  }

  // Destination changed
  if (before.destination !== after.destination && after.destination) {
    return `Destination updated to ${after.destination}`;
  }

  // Dates changed
  if (
    (before as Record<string, unknown>).start !== (after as Record<string, unknown>).start ||
    (before as Record<string, unknown>).end_date !== (after as Record<string, unknown>).end_date
  ) {
    return "Trip dates have been updated";
  }

  // Name changed
  if (before.name !== after.name && after.name) {
    return `Trip renamed to ${after.name}`;
  }

  // Status changed
  if (before.status !== after.status) {
    return `Trip status changed to ${after.status}`;
  }

  // No meaningful change detected
  return null;
}
