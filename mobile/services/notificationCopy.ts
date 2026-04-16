export type NotifEvent =
  | "trip_published"
  | "trip_updated"
  | "event_added"
  | "event_updated"
  | "event_deleted"
  | "itinerary_imported"
  | "reminder_tomorrow";

export interface NotifPayload {
  title: string;
  body: string;
  category: "update" | "reminder";
}

export function buildNotifCopy(
  event: NotifEvent,
  ctx: { tripName?: string; eventTitle?: string } = {}
): NotifPayload {
  const trip = ctx.tripName?.trim() || "Your trip";
  const ev = ctx.eventTitle?.trim() || "An event";

  switch (event) {
    case "trip_published":
      return {
        title: "Your trip is live",
        body: `${trip} is ready to view — tap to open your itinerary.`,
        category: "update",
      };
    case "trip_updated":
      return {
        title: "Trip details updated",
        body: `${trip} — dates, destination, or travellers were changed.`,
        category: "update",
      };
    case "event_added":
      return {
        title: "New stop added",
        body: `${ev} was added to ${trip}.`,
        category: "update",
      };
    case "event_updated":
      return {
        title: "Itinerary change",
        body: `${ev} in ${trip} has been updated.`,
        category: "update",
      };
    case "event_deleted":
      return {
        title: "Stop removed",
        body: `${ev} was removed from ${trip}.`,
        category: "update",
      };
    case "itinerary_imported":
      return {
        title: "Itinerary imported",
        body: `${trip} has been pulled in — review it now.`,
        category: "update",
      };
    case "reminder_tomorrow":
      return {
        title: "Tomorrow: pack your bags",
        body: `${trip} begins tomorrow. Tap for the day-one schedule.`,
        category: "reminder",
      };
  }
}
