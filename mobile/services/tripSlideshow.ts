import { calendarDays, scheduledMinutes } from "@/shared/today";
import { tidyTitleSeparators } from "@/shared/eventTitle";
import { destinationFlag } from "@/shared/tripSummary";
import type { Trip, TripMedia, TravelEvent } from "@/shared/types";

/** About four minutes at one photo every five seconds or so */
const MAX_SLIDES = 48;
/** Longer itinerary titles read like instructions and would wrap; those photos show just the date */
const MAX_CAPTION_TITLE = 30;

export interface Slide {
  photo: TripMedia;
  /** Which part of the progress bar this photo belongs to: one part per day with photos */
  group: number;
  positionInGroup: number;
  groupSize: number;
  heading: string;
  detail: string;
}

/** "Your Thailand stories": the first place named in the destination, so "Thailand (Bangkok, Phuket)" stays short */
export function storiesTitle(trip: Pick<Trip, "destination">): string {
  const place = (trip.destination ?? "").split(/[(,]/)[0].trim();
  return place ? `Your ${place} stories` : "Your trip stories";
}

/** The destination's flag, reading inside brackets too so "Thailand (Bangkok, Phuket)" finds Thailand */
export function storiesFlag(trip: Pick<Trip, "destination">): string | null {
  return destinationFlag((trip.destination ?? "").replace(/[()]/g, ","));
}

/** Calendar day a photo belongs to, the same way the gallery groups them: when it was taken, else when it was added */
function photoDay(m: TripMedia): string {
  if (m.takenAt && /^\d{4}-\d{2}-\d{2}/.test(m.takenAt)) return m.takenAt.slice(0, 10);
  const d = new Date(m.uploadedAt);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function photoTime(m: TripMedia): number {
  const t = new Date(m.takenAt ?? m.uploadedAt).getTime();
  return isNaN(t) ? 0 : t;
}

const likeCount = (m: TripMedia) => m.likes?.length ?? 0;

/** The biggest per-day allowance that keeps the whole slideshow within MAX_SLIDES, and never below one a day */
function perDayCap(sizes: number[]): number {
  const largest = Math.max(...sizes);
  const total = (cap: number) => sizes.reduce((sum, size) => sum + Math.min(size, cap), 0);
  let cap = 1;
  while (cap < largest && total(cap + 1) <= MAX_SLIDES) cap++;
  return cap;
}

/** Each person's most-liked photos first, taking turns so one keen photographer can't fill the day; shown in the order they were taken */
function pickForDay(photos: TripMedia[], cap: number): TripMedia[] {
  const byPerson = new Map<string, TripMedia[]>();
  for (const photo of photos) {
    const person = photo.uploaderId ?? photo.uploadedBy ?? "";
    const list = byPerson.get(person);
    if (list) list.push(photo); else byPerson.set(person, [photo]);
  }
  const people = [...byPerson.values()]
    .map(list => list.sort((a, b) => likeCount(b) - likeCount(a) || photoTime(a) - photoTime(b)))
    .sort((a, b) => likeCount(b[0]) - likeCount(a[0]));
  const picked: TripMedia[] = [];
  for (let turn = 0; picked.length < Math.min(cap, photos.length); turn++) {
    for (const list of people) {
      if (list[turn] && picked.length < cap) picked.push(list[turn]);
    }
  }
  return picked.sort((a, b) => photoTime(a) - photoTime(b));
}

/** The activity or meal under way when the photo was taken. Only a real time match counts: no guessing from the day alone */
function eventAtPhoto(photo: TripMedia, dayEvents: TravelEvent[]): string | null {
  const clock = photo.takenAt?.match(/T(\d{2}):(\d{2})/);
  if (!clock) return null;
  const minutes = Number(clock[1]) * 60 + Number(clock[2]);
  let best: { start: number; title: string } | null = null;
  for (const event of dayEvents) {
    if (event.type !== "activity" && event.type !== "dining") continue;
    const start = scheduledMinutes(event.time);
    if (start === null) continue;
    const scheduledEnd = scheduledMinutes(event.endTime);
    const end = scheduledEnd !== null && scheduledEnd > start ? scheduledEnd : start + 120;
    if (minutes >= start - 15 && minutes <= end && (!best || start > best.start)) {
      best = { start, title: tidyTitleSeparators(event.title) };
    }
  }
  return best && best.title.length <= MAX_CAPTION_TITLE ? best.title : null;
}

function longDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** A trip's photos as a slideshow: day by day in order, then any that can't be placed on a trip day */
export function buildSlides(trip: Trip, hidden: Set<string>): Slide[] {
  const start = trip.start.slice(0, 10);
  const end = trip.end.slice(0, 10);
  const byDay = new Map<string, TripMedia[]>();
  for (const photo of trip.media ?? []) {
    if (photo.type === "video" || hidden.has(photo.id)) continue;
    const day = photoDay(photo);
    const key = day >= start && day <= end ? day : "";
    const list = byDay.get(key);
    if (list) list.push(photo); else byDay.set(key, [photo]);
  }
  if (byDay.size === 0) return [];

  const keys = [...byDay.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const cap = perDayCap(keys.map(key => byDay.get(key)!.length));

  return keys.flatMap((key, group) => {
    const picked = pickForDay(byDay.get(key)!, cap);
    const dayEvents = trip.events.filter(event => event.date.slice(0, 10) === key);
    return picked.map((photo, positionInGroup): Slide => {
      const event = key ? eventAtPhoto(photo, dayEvents) : null;
      return {
        photo,
        group,
        positionInGroup,
        groupSize: picked.length,
        heading: key ? `Day ${calendarDays(start, key) + 1}` : "From the trip",
        detail: key ? [longDate(key), event].filter(Boolean).join(", ") : "",
      };
    });
  });
}
