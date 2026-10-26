/** Where an organiser pointed a message: an event, a day of the itinerary, or a Trip info item */
export interface NotificationTarget { eventId?: string; date?: string; infoId?: string }

export function notificationTarget(data: Record<string, unknown> | undefined | null): NotificationTarget {
  const pick = (k: string) => (typeof data?.[k] === "string" && data[k] ? (data[k] as string) : undefined);
  return { eventId: pick("eventId"), date: pick("date"), infoId: pick("infoId") };
}

export function notificationPath({ tripId, eventId, date, infoId }: NotificationTarget & { tripId: string }): string {
  const trip = encodeURIComponent(tripId);
  if (eventId) return `/trip/event?tripId=${trip}&eventId=${encodeURIComponent(eventId)}`;
  if (infoId) return `/trip/info?tripId=${trip}&itemId=${encodeURIComponent(infoId)}`;
  if (date) return `/trip/${trip}?date=${encodeURIComponent(date)}`;
  return `/trip/${trip}`;
}
