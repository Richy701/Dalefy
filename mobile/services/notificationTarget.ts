/** Where an organiser pointed a message: an event, a day of the itinerary, or a Trip info item */
export interface NotificationTarget { mediaId?: string; eventId?: string; date?: string; infoId?: string }

export function notificationTarget(data: Record<string, unknown> | undefined | null): NotificationTarget {
  const pick = (k: string) => (typeof data?.[k] === "string" && data[k] ? (data[k] as string) : undefined);
  return { mediaId: pick("mediaId"), eventId: pick("eventId"), date: pick("date"), infoId: pick("infoId") };
}

export function notificationPath({ tripId, eventId, date, infoId, mediaId }: NotificationTarget & { tripId: string }): string {
  const trip = encodeURIComponent(tripId);
  if (mediaId) return `/(tabs)/media?tripId=${trip}&mediaId=${encodeURIComponent(mediaId)}`;
  if (eventId) return `/trip/event?tripId=${trip}&eventId=${encodeURIComponent(eventId)}`;
  if (infoId) return `/trip/info?tripId=${trip}&itemId=${encodeURIComponent(infoId)}`;
  if (date) return `/trip/${trip}?date=${encodeURIComponent(date)}`;
  return `/trip/${trip}`;
}
