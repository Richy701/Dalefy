import { useMemo, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import {
  WarningCircle, Clock, Calendar, Check, Images, FileText, CloudSun, MapPin, NavigationArrow, CaretRight,
} from "phosphor-react-native";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import { CategoryDot } from "@/components/ui/CategoryDot";
import * as Haptics from "@/services/haptics";
import { tidyTitleSeparators } from "@/shared/eventTitle";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";
import { type ThemeColors, T, S, R, statusTone } from "@/constants/theme";
import { calendarDays, scheduledMinutes } from "@/shared/today";
import type { Trip, TravelEvent, TripInfo } from "@/shared/types";
import { sheetStyles } from "@/components/todaySheetStyles";
import { fetchDayForecast, type DayForecast } from "@/services/weather";

// ── Helpers ──────────────────────────────────────────────────────────────────

const daysBetween = calendarDays;

function fmtShort(d: string): string {
  const date = new Date(d + "T12:00:00");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtLong(d: string): string {
  const date = new Date(d + "T12:00:00");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function firstFlight(trip: Trip): TravelEvent | null {
  const flights = trip.events.filter(e => e.type === "flight");
  if (!flights.length) return null;
  flights.sort((a, b) => a.date.localeCompare(b.date) || (scheduledMinutes(a.time) ?? Infinity) - (scheduledMinutes(b.time) ?? Infinity));
  return flights[0];
}

type InfoStatus = "overdue" | "urgent" | "upcoming" | "done" | null;

function infoStatus(item: TripInfo, todayISO: string): InfoStatus {
  if (item.completed) return "done";
  if (!item.deadline) return null;
  const d = daysBetween(todayISO, item.deadline);
  if (d < 0) return "overdue";
  if (d <= 3) return "urgent";
  return "upcoming";
}

function infoStatusLabel(status: InfoStatus, item: TripInfo, todayISO: string): { Icon: typeof Clock; label: string; toneKey: "expired" | "expiring" | "upcoming" | "done" } | null {
  const dl = item.deadline ? fmtShort(item.deadline) : "";
  switch (status) {
    case "overdue": return { Icon: WarningCircle, label: `Was due ${dl}`, toneKey: "expired" };
    case "urgent": {
      const d = daysBetween(todayISO, item.deadline!);
      return { Icon: Clock, label: d === 0 ? "Due today" : `Due in ${d} day${d === 1 ? "" : "s"}`, toneKey: "expiring" };
    }
    case "upcoming": return { Icon: Calendar, label: `Due ${dl}`, toneKey: "upcoming" };
    case "done": return { Icon: Check, label: "Done", toneKey: "done" };
    default: return null;
  }
}

// ── Shared bits ──────────────────────────────────────────────────────────────

export function SectionHeader({ title, action, onAction, C, first }: { title: string; action?: string; onAction?: () => void; C: ThemeColors; first?: boolean }) {
  return (
    <View style={[s.sectionHeader, first && { marginTop: S.xs }]}>
      <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={action} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
          <Text style={[s.sectionAction, { color: C.tealText }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Card({ children, C, isDark, style }: { children: React.ReactNode; C: ThemeColors; isDark: boolean; style?: any }) {
  // Boxless: groups sit on the page, rows separated by hairlines
  return <View style={[s.card, style]}>{children}</View>;
}

/** First sentence of an organiser note, without links, for a one-line preview */
function infoPreview(body: string): string {
  return body.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
}

/** "Check-in at X", "Overnight at X", "Check-out from X": the hotel is X */
const stayName = (title: string) => tidyTitleSeparators(title.replace(/^\s*(check[\s-]?in|overnight|check[\s-]?out)\s+(at|from|of|in)\s+/i, "")).trim();
const isCheckout = (title: string) => /^\s*check[\s-]?out\b/i.test(title);

export type Stay = { event: TravelEvent; name: string; start: string; end: string; nights: number };

/** Each place they sleep. Imports often give one hotel several entries (check-in, overnights, check-out,
 *  names shortened on some), so entries for the same hotel in a row are one stay, ending at its check-out,
 *  else its own end date, else the next stay or the trip end, like the map labels. */
export function tripStays(trip: Trip): Stay[] {
  const hotels = [...trip.events].filter(e => e.type === "hotel")
    .sort((a, b) => a.date.localeCompare(b.date) || (scheduledMinutes(a.time) ?? 0) - (scheduledMinutes(b.time) ?? 0));
  const groups: { key: string; events: TravelEvent[] }[] = [];
  for (const h of hotels) {
    const key = stayName(h.title).toLowerCase();
    const last = groups[groups.length - 1];
    if (last && (last.key.startsWith(key) || key.startsWith(last.key))) {
      last.events.push(h);
      if (key.length > last.key.length) last.key = key;
    } else if (!isCheckout(h.title) || !last) {
      groups.push({ key, events: [h] });
    }
  }
  return groups.map((g, i) => {
    const stayEvents = g.events.filter(e => !isCheckout(e.title));
    const event = stayEvents.find(e => e.image) ?? stayEvents[0] ?? g.events[0];
    const start = (stayEvents[0] ?? g.events[0]).date;
    const checkout = g.events.find(e => isCheckout(e.title));
    const end = checkout?.date
      || g.events.map(e => e.endDate || e.checkout).filter((d): d is string => !!d).sort().pop()
      || groups[i + 1]?.events[0].date
      || trip.end;
    const name = g.events.map(e => stayName(e.title)).sort((x, y) => y.length - x.length)[0];
    return { event, name, start, end, nights: Math.max(0, calendarDays(start, end)) };
  });
}

function openDirections(place: string) {
  const q = encodeURIComponent(place);
  Linking.openURL(Platform.OS === "ios" ? `maps://?q=${q}` : `geo:0,0?q=${q}`).catch(() => {});
}

/** A hotel with its photo: how long, when, where, and a way to get there */
export function StayCard({ stay, tripId, C, label }: { stay: Stay; tripId: string; C: ThemeColors; label?: string }) {
  const router = useRouter();
  const ev = stay.event;
  const where = ev.location || stay.name;
  const when = stay.nights > 0
    ? `${stay.nights} ${stay.nights === 1 ? "night" : "nights"}, ${fmtShort(stay.start)} – ${fmtShort(stay.end)}`
    : fmtLong(stay.start);
  return (
    <ScalePress
      activeScale={0.985}
      onPress={() => { Haptics.selectionAsync(); router.push({ pathname: "/trip/event", params: { tripId, eventId: ev.id } }); }}
      accessibilityRole="button"
      accessibilityLabel={`${label ? `${label}, ` : ""}${stay.name}, ${when}`}
      style={[s.stayCard, { backgroundColor: C.card, borderColor: C.border }]}
    >
      {ev.image ? <CachedImage uri={ev.image} style={s.stayPhoto} accessible={false} /> : null}
      <View style={s.stayBody}>
        {label ? <Text style={[s.rowSub, { color: C.tealText, marginTop: 0, fontWeight: T.semibold }]}>{label}</Text> : null}
        <Text style={[s.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>{stay.name}</Text>
        <Text style={[s.rowSub, { color: C.textSecondary, marginTop: 0 }]} numberOfLines={1}>{when}</Text>
        {ev.location ? <Text style={[s.rowSub, { color: C.textSecondary, marginTop: 0 }]} numberOfLines={1}>{ev.location}</Text> : null}
        <Pressable
          onPress={() => { Haptics.selectionAsync(); openDirections(where); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Directions to ${stay.name}`}
          style={({ pressed }) => [s.stayAction, { opacity: pressed ? 0.6 : 1 }]}
        >
          {/* Mirrored to point up and right, like the arrow in Maps */}
          <View style={{ transform: [{ scaleX: -1 }] }}><NavigationArrow size={14} color={C.tealText} weight="fill" /></View>
          <Text style={[s.sectionAction, { color: C.tealText }]}>Directions</Text>
        </Pressable>
      </View>
    </ScalePress>
  );
}

/** The trip's photos, newest first, opening the gallery */
function PhotoStrip({ trip, C }: { trip: Trip; C: ThemeColors }) {
  const router = useRouter();
  const photos = useMemo(() => [...(trip.media ?? [])]
    .filter(m => m.type !== "video")
    .sort((a, b) => String(b.uploadedAt ?? "").localeCompare(String(a.uploadedAt ?? "")))
    .slice(0, 10), [trip.media]);
  const open = () => { Haptics.selectionAsync(); router.navigate("/(tabs)/media"); };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
      {photos.map(m => (
        <Pressable key={m.id} onPress={open} accessibilityRole="button" accessibilityLabel="Open the trip's photos" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <CachedImage uri={m.thumbUrl ?? m.url} style={[s.photo, { backgroundColor: C.elevated }]} accessible={false} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Plain link row closing a section, e.g. the full itinerary */
function LinkRow({ label, onPress, C, Icon }: { label: string; onPress: () => void; C: ThemeColors; Icon: typeof Calendar }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      <View style={s.rowIcon}><Icon size={16} color={C.textSecondary} weight="regular" /></View>
      <Text style={[s.rowTitle, { color: C.textPrimary, flex: 1 }]}>{label}</Text>
      <CaretRight size={14} color={C.textTertiary} weight="bold" />
    </Pressable>
  );
}
export { LinkRow };

// ── Pre-trip ─────────────────────────────────────────────────────────────────

export function PreTripSheetContent({ trip, todayISO, weatherCoord }: { trip: Trip; todayISO: string; weatherCoord?: [number, number] | null }) {
  const { C, isDark } = useTheme();
  const router = useRouter();
  const { isLeader } = useTripRole(trip.id);
  const daysUntil = Math.max(0, daysBetween(todayISO, trip.start));
  const tripDays = daysBetween(trip.start, trip.end) + 1;

  const flight = useMemo(() => firstFlight(trip), [trip]);
  const flightSoon = !!flight && daysBetween(todayISO, flight.date) >= 0 && daysBetween(todayISO, flight.date) <= 1;
  const { data: live } = useFlightLiveData(flightSoon ? flight?.flightNum : undefined, flightSoon ? flight?.date : undefined);

  // Two lists: things to do (dated or with an action, open first, then done), and the organiser's plain notes
  const todo = useMemo(() => {
    const all = (trip.info ?? []).filter(i => isLeader || !i.leaderOnly);
    const tasks = all.filter(i => i.deadline || i.actionUrl);
    tasks.sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
    const notes = all.filter(i => !i.deadline && !i.actionUrl);
    return { tasks: tasks.slice(0, 4), notes: notes.slice(0, 3), more: tasks.length > 4 || notes.length > 3 };
  }, [trip.info, isLeader]);

  const stays = useMemo(() => tripStays(trip), [trip]);

  // First-day forecast at the stay the map shows, a few days out when it's worth reading
  const weatherKey = weatherCoord ? weatherCoord.map(n => n.toFixed(2)).join(",") : "";
  const [forecast, setForecast] = useState<DayForecast | null>(null);
  useEffect(() => {
    setForecast(null);
    if (!weatherKey || daysUntil > 5) return;
    let cancelled = false;
    fetchDayForecast(weatherKey.split(",").map(Number) as [number, number], trip.start).then(f => { if (!cancelled) setForecast(f); });
    return () => { cancelled = true; };
  }, [weatherKey, trip.start, daysUntil]);

  const openTrip = () => { Haptics.selectionAsync(); router.push(`/trip/${trip.id}`); };
  const openInfo = () => { Haptics.selectionAsync(); router.push({ pathname: "/trip/info", params: { tripId: trip.id } }); };

  let delay = 0;
  const next = () => { const d = delay; delay = Math.min(delay + 60, 360); return d; };

  return (
    <View>
        {/* The map chip already says where and when; the sheet opens on what needs doing */}
        {forecast && (
          <FadeIn delay={next()}>
            <View style={s.header}>
              <Text style={[s.forecast, { color: C.textSecondary, marginTop: 0 }]}>First-day forecast, {forecast.temp}°, {forecast.description}</Text>
            </View>
          </FadeIn>
        )}

        {/* Before you go */}
        {todo.tasks.length > 0 && (
          <FadeIn delay={next()}>
            <SectionHeader title="Before you go" action={todo.more ? "See all" : undefined} onAction={openInfo} C={C} first />
            <Card C={C} isDark={isDark}>
              {todo.tasks.map((item, i) => {
                const st = infoStatusLabel(infoStatus(item, todayISO), item, todayISO);
                const tone = st ? statusTone(st.toneKey, C) : null;
                return (
                  <Pressable
                    key={item.id}
                    onPress={openInfo}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}${st ? `, ${st.label}` : ""}`}
                    style={({ pressed }) => [s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[s.rowIcon, { backgroundColor: tone ? tone.bg : C.elevated }]}>
                      {st ? <st.Icon size={17} color={tone!.text} weight="bold" /> : <FileText size={17} color={C.textSecondary} weight="regular" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>{item.title}</Text>
                      {st ? <Text style={[s.rowSub, { color: tone!.text, marginTop: 0 }]}>{st.label}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </FadeIn>
        )}

        {/* First flight */}
        {flight && (
          <FadeIn delay={next()}>
            <SectionHeader title={daysBetween(todayISO, flight.date) === 0 ? "Your flight today" : "Your first flight"} C={C} first={todo.tasks.length === 0} />
            <ScalePress
              activeScale={0.985}
              onPress={() => { Haptics.selectionAsync(); router.push({ pathname: "/trip/event", params: { tripId: trip.id, eventId: flight.id } }); }}
              accessibilityRole="button"
              accessibilityLabel={`Flight ${flight.flightNum || ""} on ${fmtLong(flight.date)} at ${flight.time}`}
            >
              <Card C={C} isDark={isDark}>
                <View style={[s.row, s.rowTop]}>
                  <View style={s.iconOnTitle}><CategoryDot type="flight" size={32} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>
                      {[flight.airline, flight.flightNum].filter(Boolean).join(" ") || tidyTitleSeparators(flight.title.replace(/\s*\([A-Z]{3}\)\s*$/, ""))}
                    </Text>
                    <Text style={[s.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                      {flight.depAirport && flight.arrAirport ? `${flight.depAirport} → ${flight.arrAirport}, ` : ""}
                      {fmtLong(flight.date)}, {scheduledMinutes(flight.time) == null ? "Time to be confirmed" : flight.time}
                    </Text>
                  </View>
                </View>
                {(flight.terminal || live?.terminal || live?.gate || live?.status) && (
                  <View style={[s.flightMeta, { borderTopColor: C.border }]}>
                    {(live?.terminal || flight.terminal) ? <Text style={[s.metaText, { color: C.textSecondary }]}>Terminal {live?.terminal || flight.terminal}</Text> : null}
                    {live?.gate ? <Text style={[s.metaText, { color: C.textSecondary }]}>Gate {live.gate}</Text> : null}
                    {live?.status ? <Text style={[s.metaText, { color: C.tealText, fontWeight: T.semibold }]}>{live.status}</Text> : null}
                  </View>
                )}
              </Card>
            </ScalePress>
          </FadeIn>
        )}

        {/* From your organiser */}
        {todo.notes.length > 0 && (
          <FadeIn delay={next()}>
            <SectionHeader title="From your organiser" action={todo.tasks.length === 0 && todo.more ? "See all" : undefined} onAction={openInfo} C={C} />
            <Card C={C} isDark={isDark}>
              {todo.notes.map((item, i) => (
                <Pressable
                  key={item.id}
                  onPress={openInfo}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  style={({ pressed }) => [s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }, pressed && { opacity: 0.7 }]}
                >
                  <View style={[s.rowIcon, { backgroundColor: C.elevated }]}>
                    <FileText size={17} color={C.textSecondary} weight="regular" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowTitle, { color: C.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    {item.body ? <Text style={[s.rowSub, { color: C.textSecondary, marginTop: 0 }]} numberOfLines={1}>{infoPreview(item.body)}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </Card>
          </FadeIn>
        )}

        {/* Where they'll sleep, with photos and directions */}
        {stays.length > 0 && (
          <FadeIn delay={next()}>
            <SectionHeader title="Where you're staying" C={C} />
            {stays.slice(0, 4).map(st => <StayCard key={st.event.id} stay={st} tripId={trip.id} C={C} />)}
          </FadeIn>
        )}

        <FadeIn delay={next()}>
          <Card C={C} isDark={isDark} style={{ marginTop: S.xs }}>
            <LinkRow label="Full itinerary" onPress={openTrip} C={C} Icon={Calendar} />
          </Card>
        </FadeIn>
    </View>
  );
}

// ── Post-trip ────────────────────────────────────────────────────────────────

export function PostTripSheetContent({ trip, todayISO }: { trip: Trip; todayISO: string }) {
  const { C, isDark } = useTheme();
  const router = useRouter();
  const daysSince = Math.max(0, daysBetween(trip.end, todayISO));
  const photoCount = (trip.media ?? []).filter(m => m.type !== "video").length;
  const openTrip = () => { Haptics.selectionAsync(); router.push(`/trip/${trip.id}`); };
  const openGallery = () => { Haptics.selectionAsync(); router.navigate("/(tabs)/media"); };

  // A one-line recap of what the trip was
  const recap = useMemo(() => {
    const days = daysBetween(trip.start, trip.end) + 1;
    const stays = tripStays(trip).length;
    const flights = trip.events.filter(e => e.type === "flight").length;
    return [
      days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : "",
      stays ? `${stays} ${stays === 1 ? "hotel" : "hotels"}` : "",
      flights ? `${flights} ${flights === 1 ? "flight" : "flights"}` : "",
    ].filter(Boolean).join(", ");
  }, [trip]);

  return (
    <View>
      <FadeIn delay={0}>
        <View style={s.header}>
          <Text style={[s.scope, { color: C.textTertiary }]}>
            {/* Counting days only helps while it's recent; after that the dates say it */}
            {daysSince === 0 ? "Ended today, " : daysSince === 1 ? "Ended yesterday, " : daysSince < 14 ? `Ended ${daysSince} days ago, ` : ""}
            {fmtShort(trip.start)} – {fmtShort(trip.end)}{daysSince >= 14 ? ` ${trip.end.slice(0, 4)}` : ""}
          </Text>
          <Pressable onPress={openTrip} accessibilityRole="button" accessibilityLabel={`Open trip ${trip.name}`}>
            <Text style={[s.tripName, { color: C.textPrimary }]} numberOfLines={2}>{trip.name}</Text>
          </Pressable>
          {trip.destination || recap ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
              {trip.destination ? <MapPin size={10} color={C.textTertiary} weight="fill" /> : null}
              <Text style={{ fontSize: T.base, fontWeight: T.medium, color: C.textSecondary, flexShrink: 1 }} numberOfLines={1}>
                {[trip.destination, recap].filter(Boolean).join(", ")}
              </Text>
            </View>
          ) : null}
        </View>
      </FadeIn>

      <FadeIn delay={60}>
        {photoCount > 0 ? (
          <>
            <SectionHeader title={`${photoCount} ${photoCount === 1 ? "photo" : "photos"} from the group`} action="See all" onAction={openGallery} C={C} />
            <PhotoStrip trip={trip} C={C} />
          </>
        ) : (
          <>
            <SectionHeader title="Photos" C={C} />
            <Card C={C} isDark={isDark}>
              <LinkRow label="Add your photos for the group" onPress={openGallery} C={C} Icon={Images} />
            </Card>
          </>
        )}
        <Card C={C} isDark={isDark} style={{ marginTop: S.sm }}>
          <LinkRow label="Relive the itinerary" onPress={openTrip} C={C} Icon={Calendar} />
        </Card>
      </FadeIn>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = sheetStyles;
