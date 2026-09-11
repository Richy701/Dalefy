import { useMemo, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  AirplaneTilt, CaretRight, WarningCircle, Clock, Calendar, Check, Images, FileText, CloudSun, MapPin,
} from "phosphor-react-native";
import { ScalePress } from "@/components/ScalePress";
import { FadeIn } from "@/components/FadeIn";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";
import { type ThemeColors, T, R, S, shadow, statusTone } from "@/constants/theme";
import { calendarDays, scheduledMinutes, dateInZone } from "@/shared/today";
import { getDestinationTz } from "@/shared/timezones";
import type { Trip, TravelEvent, TripInfo } from "@/shared/types";

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

const WEATHER_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_KEY;

interface Forecast { temp: number; high: number; low: number; description: string; rainChance: number }

async function fetchFirstDayForecast(destination: string, date: string): Promise<Forecast | null> {
  if (!WEATHER_KEY) return null;
  try {
    const g = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(destination)}&limit=1&appid=${WEATHER_KEY}`).then(r => r.json());
    if (!g?.[0]) return null;
    const f = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${g[0].lat}&lon=${g[0].lon}&units=metric&appid=${WEATHER_KEY}`).then(r => r.json());
    const timeZone = getDestinationTz(destination);
    const entries = (f.list ?? []).filter((e: any) => typeof e.dt === "number" && dateInZone(e.dt * 1000, timeZone) === date);
    if (!entries.length) return null;
    const midday = [...entries].sort((a: any, b: any) => {
      const hour = (entry: any) => Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(entry.dt * 1000));
      return Math.abs(hour(a) - 12) - Math.abs(hour(b) - 12);
    })[0];
    return {
      temp: Math.round(midday.main.temp),
      high: Math.round(Math.max(...entries.map((e: any) => e.main.temp_max))),
      low: Math.round(Math.min(...entries.map((e: any) => e.main.temp_min))),
      description: midday.weather[0].description,
      rainChance: Math.round(Math.max(...entries.map((e: any) => (e.pop ?? 0) * 100))),
    };
  } catch {
    return null;
  }
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function SectionHeader({ title, action, onAction, C }: { title: string; action?: string; onAction?: () => void; C: ThemeColors }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={[s.sectionTitle, { color: C.textPrimary }]}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={action} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
          <Text style={[s.sectionAction, { color: C.tealText }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Card({ children, C, isDark, style }: { children: React.ReactNode; C: ThemeColors; isDark: boolean; style?: any }) {
  return <View style={[s.card, { backgroundColor: C.card }, shadow("card", isDark), style]}>{children}</View>;
}

// ── Pre-trip ─────────────────────────────────────────────────────────────────

export function PreTripSheetContent({ trip, todayISO }: { trip: Trip; todayISO: string }) {
  const { C, isDark } = useTheme();
  const router = useRouter();
  const { isLeader } = useTripRole(trip.id);
  const daysUntil = Math.max(0, daysBetween(todayISO, trip.start));
  const tripDays = daysBetween(trip.start, trip.end) + 1;

  const flight = useMemo(() => firstFlight(trip), [trip]);
  const flightSoon = !!flight && daysBetween(todayISO, flight.date) >= 0 && daysBetween(todayISO, flight.date) <= 1;
  const { data: live } = useFlightLiveData(flightSoon ? flight?.flightNum : undefined, flightSoon ? flight?.date : undefined);

  const todo = useMemo(() => {
    const all = (trip.info ?? []).filter(i => isLeader || !i.leaderOnly);
    const open = all.filter(i => !i.completed && (i.deadline || i.actionUrl));
    open.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
    // With nothing dated or actionable, surface the organiser's notes instead of an empty tick
    const rows = open.length > 0 ? open.slice(0, 4) : all.slice(0, 3);
    return { rows, total: all.length, actionable: open.length > 0 };
  }, [trip.info, isLeader]);

  const docCount = (trip.documents?.length ?? 0) + (trip.info ?? []).filter(item => isLeader || !item.leaderOnly).reduce((n, i) => n + (i.documents?.length ?? 0), 0);

  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    setForecast(null);
    if (!trip.destination || daysUntil > 5) return;
    let cancelled = false;
    fetchFirstDayForecast(trip.destination, trip.start).then(f => { if (!cancelled) setForecast(f); });
    return () => { cancelled = true; };
  }, [trip.destination, trip.start, daysUntil]);

  const AVATAR_COLORS = [C.teal, C.hotel, C.activity, C.dining, C.transfer, C.green];
  const openTrip = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${trip.id}`); };
  const openInfo = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/trip/info", params: { tripId: trip.id } }); };

  let delay = 0;
  const next = () => { const d = delay; delay = Math.min(delay + 60, 360); return d; };

  return (
    <View>
        {/* Header */}
        <FadeIn delay={next()}>
          <View style={s.header}>
            <View style={s.headingMeta}>
              <Text style={[s.scope, { color: C.textSecondary }]}>Your next trip</Text>
              <Pill tone="custom" bg={C.tealDim} color={C.tealText} label={daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`} />
            </View>
            <View>
              <Pressable onPress={openTrip} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open trip ${trip.name}`}>
                <Text style={[s.tripName, { color: C.textPrimary }]} numberOfLines={2}>{trip.name}</Text>
              </Pressable>

            </View>
            <Text style={[s.headerDates, { color: C.textSecondary }]}>{fmtShort(trip.start)} – {fmtShort(trip.end)} · {tripDays} {tripDays === 1 ? "day" : "days"}</Text>
            {trip.destination ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.xs2, marginTop: S.xs2 }}>
                <MapPin size={10} color={C.textTertiary} weight="fill" />
                <Text style={{ fontSize: T.base, fontWeight: T.medium, color: C.textSecondary, flexShrink: 1 }} numberOfLines={1}>{trip.destination}</Text>

              </View>
            ) : null}
            {forecast && <Text style={[s.forecast, { color: C.textSecondary }]}>First-day forecast · {forecast.temp}° · {forecast.description}</Text>}
          </View>
        </FadeIn>

        {/* Before you go */}
        {todo.total > 0 && (
          <FadeIn delay={next()}>
            <SectionHeader title={todo.actionable ? "Before you go" : "From your organiser"} action={todo.total > todo.rows.length ? "See all" : undefined} onAction={openInfo} C={C} />
            <Card C={C} isDark={isDark}>
              {todo.rows.map((item, i) => {
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
                      {st ? <st.Icon size={16} color={tone!.text} weight="bold" /> : <FileText size={16} color={C.textSecondary} weight="regular" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>{item.title}</Text>
                      {st && <Text style={[s.rowSub, { color: tone!.text }]}>{st.label}</Text>}
                    </View>
                    <CaretRight size={14} color={C.textTertiary} weight="regular" />
                  </Pressable>
                );
              })}
            </Card>
          </FadeIn>
        )}

        {/* First flight */}
        {flight && (
          <FadeIn delay={next()}>
            <SectionHeader title={daysBetween(todayISO, flight.date) === 0 ? "Your flight today" : "Your first flight"} C={C} />
            <ScalePress
              activeScale={0.985}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/trip/event", params: { tripId: trip.id, eventId: flight.id } }); }}
              accessibilityRole="button"
              accessibilityLabel={`Flight ${flight.flightNum || ""} on ${fmtLong(flight.date)} at ${flight.time}`}
            >
              <Card C={C} isDark={isDark}>
                <View style={s.row}>
                  <View style={[s.rowIcon, { backgroundColor: C.flightSoft }]}>
                    <AirplaneTilt size={16} color={C.flight} weight="fill" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>
                      {[flight.airline, flight.flightNum].filter(Boolean).join(" ") || flight.title}
                    </Text>
                    <Text style={[s.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                      {flight.depAirport && flight.arrAirport ? `${flight.depAirport} → ${flight.arrAirport} · ` : ""}
                      {fmtLong(flight.date)} · {scheduledMinutes(flight.time) == null ? "Time to be confirmed" : flight.time}
                    </Text>
                  </View>
                  <CaretRight size={14} color={C.textTertiary} weight="regular" />
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

        {/* Documents + travellers */}
        <FadeIn delay={next()}>
          <SectionHeader title="Trip details" C={C} />
          <Card C={C} isDark={isDark}>
            {docCount > 0 && (
              <Pressable onPress={openInfo} accessibilityRole="button" accessibilityLabel={`${docCount} documents`} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
                <View style={[s.rowIcon, { backgroundColor: C.elevated }]}>
                  <FileText size={16} color={C.textSecondary} weight="regular" />
                </View>
                <Text style={[s.rowTitle, { color: C.textPrimary, flex: 1 }]}>{docCount} {docCount === 1 ? "document" : "documents"}</Text>
                <CaretRight size={14} color={C.textTertiary} weight="regular" />
              </Pressable>
            )}
            {(trip.travelers?.length ?? 0) > 0 && (
              <View style={[s.row, docCount > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                <View style={{ flexDirection: "row", marginRight: S.xs }}>
                  {trip.travelers!.slice(0, 5).map((t, i) => (
                    <View key={t.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
                      <Avatar size={26} initials={t.initials} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} ringColor={C.card} />
                    </View>
                  ))}
                </View>
                <Text style={[s.rowTitle, { color: C.textPrimary, flex: 1 }]}>
                  {trip.travelers!.length} {trip.travelers!.length === 1 ? "traveller" : "travellers"}
                </Text>
              </View>
            )}
            <Pressable onPress={openTrip} accessibilityRole="button" accessibilityLabel="See full itinerary" style={({ pressed }) => [s.row, (docCount > 0 || (trip.travelers?.length ?? 0) > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }, pressed && { opacity: 0.7 }]}>
              <View style={[s.rowIcon, { backgroundColor: C.elevated }]}>
                <Calendar size={16} color={C.textSecondary} weight="regular" />
              </View>
              <Text style={[s.rowTitle, { color: C.textPrimary, flex: 1 }]}>Full itinerary</Text>
              <CaretRight size={14} color={C.textTertiary} weight="regular" />
            </Pressable>
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
  const photoCount = trip.media?.length ?? 0;

  return (
    <View>
      <FadeIn delay={0}>
        <View style={s.header}>
          <Text style={[s.scope, { color: C.textTertiary }]}>
            {daysSince === 0 ? "Trip ended today" : daysSince === 1 ? "Trip ended yesterday" : `Trip ended ${daysSince} days ago`} · {fmtShort(trip.start)} – {fmtShort(trip.end)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${trip.id}`); }}
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel={`Open trip ${trip.name}`}
            >
              <Text style={[s.tripName, { color: C.textPrimary }]} numberOfLines={2}>{trip.name}</Text>
            </Pressable>
            <Pill tone="custom" bg={C.elevated} color={C.textTertiary} label="Past" />
          </View>
          {trip.destination ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
              <MapPin size={10} color={C.textTertiary} weight="fill" />
              <Text style={{ fontSize: T.base, fontWeight: T.medium, color: C.textSecondary, flexShrink: 1 }} numberOfLines={1}>{trip.destination}</Text>
            </View>
          ) : null}
        </View>
      </FadeIn>

      <FadeIn delay={60}>
        <SectionHeader title="Look back" C={C} />
        <Card C={C} isDark={isDark}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate("/(tabs)/media"); }}
            accessibilityRole="button"
            accessibilityLabel="Open gallery"
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          >
            <View style={[s.rowIcon, { backgroundColor: C.elevated }]}>
              <Images size={16} color={C.textSecondary} weight="regular" />
            </View>
            <Text style={[s.rowTitle, { color: C.textPrimary, flex: 1 }]}>
              {photoCount > 0 ? `${photoCount} ${photoCount === 1 ? "photo" : "photos"} from the group` : "Add your photos for the group"}
            </Text>
            <CaretRight size={14} color={C.textTertiary} weight="regular" />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${trip.id}`); }}
            accessibilityRole="button"
            accessibilityLabel="Open itinerary"
            style={({ pressed }) => [s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }, pressed && { opacity: 0.7 }]}
          >
            <View style={[s.rowIcon, { backgroundColor: C.elevated }]}>
              <Calendar size={16} color={C.textSecondary} weight="regular" />
            </View>
            <Text style={[s.rowTitle, { color: C.textPrimary, flex: 1 }]}>Itinerary</Text>
            <CaretRight size={14} color={C.textTertiary} weight="regular" />
          </Pressable>
        </Card>
        <Text style={[s.footnote, { color: C.textTertiary }]}>Your next trip will appear here once your agent shares it.</Text>
      </FadeIn>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: { paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.xs },
  headingMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, marginBottom: S.sm },
  headerDates: { fontSize: T.base, lineHeight: 22, marginTop: S.sm },
  forecast: { fontSize: T.base, lineHeight: 22, marginTop: S.sm },
  scope: { fontSize: T.base, lineHeight: 22, fontWeight: T.medium, marginBottom: 2 },
  tripName: { fontSize: T["3xl"], lineHeight: 33, fontWeight: T.bold, letterSpacing: -0.3 },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: S.md, marginTop: S.lg, marginBottom: S.sm,
  },
  sectionTitle: { fontSize: T.lg, fontWeight: T.semibold, letterSpacing: -0.2 },
  sectionAction: { fontSize: T.base, fontWeight: T.medium },

  card: { marginHorizontal: S.md, borderRadius: R.xl, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, paddingVertical: S.md, minHeight: 60 },
  rowIcon: { width: 32, height: 32, borderRadius: R.sm, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: T.md, lineHeight: 22, fontWeight: T.semibold },
  rowSub: { fontSize: 14, lineHeight: 20, marginTop: S["2xs"] },
  flightMeta: {
    flexDirection: "row", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.xs,
    borderTopWidth: StyleSheet.hairlineWidth, marginLeft: S.md + 32 + S.sm,
  },
  metaText: { fontSize: T.sm },
  footnote: { fontSize: T.sm, paddingHorizontal: S.md, marginTop: S.sm, lineHeight: 18 },
});
