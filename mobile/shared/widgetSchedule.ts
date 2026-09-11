import type { Trip, TravelEvent } from './types';
import { calendarDays, dateInZone, dayEvents, eventTiming, selectTodayTrips, eventInstant, currentOrNext } from './today';
import { getDestinationTz } from './timezones';

export function surfaceEvents(events: TravelEvent[], travelerId?: string | null) {
  return events.filter(event => !event.assignedTo?.length || (!!travelerId && event.assignedTo.includes(travelerId)));
}

export function surfaceCandidates(trips: Trip[], now: number, flights: boolean) {
  return trips.flatMap(trip => trip.events
    .filter(event => (event.type === 'flight') === flights && !/cancel|landed|arrived/i.test(event.status || ''))
    .map(event => {
      const timing = eventTiming(event, getDestinationTz(trip.destination), now);
      const start = timing.start;
      const duration = event.duration?.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
      const minutes = Number(duration?.[1] || 0) * 60 + Number(duration?.[2] || 0);
      const end = timing.end ?? (start == null ? null : start + (minutes > 0 ? minutes : flights ? 60 : 30) * 60000);
      return { trip, event, start, end };
    }))
    .filter(item => item.start != null && item.end != null && item.end > now && item.start <= now + (flights ? 4 : 1) * 3600000)
    .sort((a, b) => a.start! - b.start!);
}

export function tripDayUrl(tripId: string, date: string) {
  return `/trip/day?tripId=${encodeURIComponent(tripId)}&date=${encodeURIComponent(date)}`;
}

export function widgetProps(trips: Trip[], now: number, accentColor: string, images: Record<string, string> = {}) {
  const { active, upcoming } = selectTodayTrips(trips, now);
  const trip = active || upcoming;
  const empty = { state: 'empty', tripName: '', destination: '', tripImage: '', daysLeft: 0, startDate: '', currentDay: 0, totalDays: 0, accentColor, event1: '', event2: '', event3: '', eventTime: '', eventTitle: '', eventLocation: '', eventLabel: '', url: '/(tabs)' };
  if (!trip) return empty;
  const zone = getDestinationTz(trip.destination);
  const date = dateInZone(now, zone);
  const events = active ? dayEvents(trip.events, date, zone, now).filter(event => {
    const timing = eventTiming(event, zone, now);
    return timing.start == null || timing.start >= now || (timing.end != null && timing.end > now);
  }) : [];
  const focus = currentOrNext(events, zone, now)?.event;
  if (focus) events.sort((a, b) => a.id === focus.id ? -1 : b.id === focus.id ? 1 : 0);
  const next = events[0];
  const line = (index: number) => events[index] ? `${events[index].time || 'TBD'}  ${events[index].title}` : '';
  return { ...empty, state: active ? 'active' : 'upcoming', tripName: trip.name, destination: trip.destination || trip.name,
    tripImage: active ? '' : images[trip.id] || '', daysLeft: Math.max(0, calendarDays(date, trip.start)),
    startDate: new Date(`${trip.start}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    currentDay: active ? calendarDays(trip.start, date) + 1 : 0, totalDays: calendarDays(trip.start, trip.end) + 1,
    event1: line(0), event2: line(1), event3: line(2), eventTime: next?.time || '', eventTitle: next?.title || '', eventLocation: next?.location || '',
    eventLabel: next && eventTiming(next, zone, now).phase === 'current' ? 'Now' : 'Next up', url: tripDayUrl(trip.id, active ? date : trip.start) };
}

export function widgetTimeline(trips: Trip[], now: number, accent: string, images: Record<string, string>) {
  const dates = new Set<number>([now]);
  // Hourly entries cover local midnight/DST changes, even when the app is closed.
  for (let i = 1; i <= 24 * 7; i++) dates.add(now + i * 3600000);
  for (const trip of trips) {
    const zone = getDestinationTz(trip.destination);
    const today = dateInZone(now, zone);
    for (let day = 1; day <= 60; day++) {
      const date = new Date(Date.parse(`${today}T12:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
      const midnight = eventInstant(date, 0, zone);
      if (midnight != null) dates.add(midnight);
    }
  }
  for (const trip of trips) for (const event of trip.events) {
    const timing = eventTiming(event, getDestinationTz(trip.destination), now);
    for (const date of [timing.start, timing.end ?? (timing.start == null ? null : timing.start + 60000)]) {
      if (date != null && date > now && date < now + 60 * 86400000) dates.add(date);
    }
  }
  return [...dates].sort((a, b) => a - b).map(date => ({ date: new Date(date), props: widgetProps(trips, date, accent, images) }));
}
