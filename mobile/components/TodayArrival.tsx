import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Suitcase } from "phosphor-react-native";
import type { TravelEvent } from "@/shared/types";
import { eventTiming } from "@/shared/today";
import { tidyLocation } from "@/shared/eventTitle";
import { categoryTone, T, S, type ThemeColors } from "@/constants/theme";
import type { Weather } from "@/services/weather";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { FadeIn } from "@/components/FadeIn";
import { ScalePress } from "@/components/ScalePress";
import { SectionHeader } from "@/components/TodayPreTrip";
import { sheetStyles as ps } from "@/components/todaySheetStyles";
import * as Haptics from "@/services/haptics";

const H = 3_600_000;
/** How long the sheet stays in arrival mode after touchdown */
export const ARRIVAL_WINDOW_MS = 90 * 60_000;
// Statuses that mean the plane is still on the ground at the origin or in the air
const NOT_LANDED = new Set(["expected", "checkin", "boarding", "gateclosed", "delayed", "departed", "enroute", "approaching", "diverted"]);

/**
 * The flight arrival mode follows: the latest one that has left by its schedule and was due
 * within the last six hours. None when another flight follows soon, as bags go straight through.
 */
export function arrivingFlight(events: TravelEvent[], timeZone: string | undefined, now: number): TravelEvent | null {
  const flights = events
    .filter(e => e.type === "flight")
    .map(event => ({ event, ...eventTiming(event, timeZone, now) }))
    .filter((f): f is typeof f & { start: number; end: number } => f.start != null && f.end != null);
  const flight = flights
    .filter(f => f.start <= now && f.end >= now - 6 * H)
    .sort((a, b) => b.start - a.start)[0];
  if (!flight) return null;
  if (flights.some(f => f.start > flight.start && f.start - flight.end < 8 * H)) return null;
  return flight.event;
}

/** When the flight touched down, or null while it hasn't (or never will: cancelled, diverted) */
export function landingTime(
  flight: TravelEvent,
  live: { status?: string; revisedEndTime?: string } | null,
  timeZone: string | undefined,
  now: number,
): number | null {
  const status = (live?.status || flight.status || "").toLowerCase().replace(/\s+/g, "");
  if (status.startsWith("cancel") || NOT_LANDED.has(status)) return null;
  const scheduled = eventTiming(flight, timeZone, now).end;
  const revisedTime = live?.revisedEndTime || flight.revisedEndTime;
  let end = revisedTime ? eventTiming({ ...flight, endTime: revisedTime }, timeZone, now).end : scheduled;
  // A revised time that crossed midnight from the scheduled one: late past it, or early before it
  if (end != null && scheduled != null && end < scheduled - 12 * H) end += 24 * H;
  if (end != null && scheduled != null && end > scheduled + 12 * H) end -= 24 * H;
  if (end == null) return null;
  if (status === "arrived" || status === "landed") return Math.min(end, now);
  return end <= now ? end : null;
}

/** What the group does after landing: the first plan from half an hour before touchdown */
export function afterLanding(events: TravelEvent[], flight: TravelEvent, landedAt: number, timeZone: string | undefined, now: number): TravelEvent | null {
  return events
    .filter(e => e.id !== flight.id && e.type !== "flight")
    .map(event => ({ event, start: eventTiming(event, timeZone, now).start }))
    .filter((x): x is { event: TravelEvent; start: number } => x.start != null && x.start >= landedAt - 30 * 60_000 && x.start - landedAt < 6 * H)
    .sort((a, b) => a.start - b.start)[0]?.event ?? null;
}

/**
 * Replaces Next up on the Today sheet for a while after landing: where the bags come out,
 * then the first thing planned on the ground, usually the transfer.
 */
export function ArrivalSection({ tripId, flight, live, landedAt, then, place, timeZone, weather, title, now, C }: {
  tripId: string;
  flight: TravelEvent;
  live: { baggageBelt?: string; arrTerminal?: string } | null;
  landedAt: number;
  then: TravelEvent | null;
  /** The destination's name when the flight lands there */
  place: string | null;
  timeZone: string | undefined;
  weather: Weather | null;
  title: (ev: TravelEvent) => string;
  now: number;
  C: ThemeColors;
}) {
  const router = useRouter();
  const clock = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(ms);
  const belt = live?.baggageBelt || flight.baggageBelt;
  const terminal = live?.arrTerminal || flight.arrTerminal;
  const tone = categoryTone("flight", C);
  const open = (eventId: string) => {
    Haptics.selectionAsync();
    router.push({ pathname: "/trip/event", params: { tripId, eventId } });
  };
  const thenDetail = then?.type === "transfer" ? (then.description ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim() : "";

  return (
    <FadeIn delay={0}>
      <SectionHeader title={place ? `Welcome to ${place}` : "You’ve landed"} C={C} first />
      <Text style={[s.lede, { color: C.textSecondary }]}>
        {[`${clock(now)} local`, weather ? `${weather.temp}°, ${weather.description.toLowerCase()}` : ""].filter(Boolean).join(", ")}
      </Text>
      <ScalePress
        activeScale={0.985}
        onPress={() => open(flight.id)}
        accessibilityRole="button"
        accessibilityLabel={`${belt ? `Bags on belt ${belt}` : "Baggage belt not posted yet"}${terminal ? `, terminal ${terminal}` : ""}`}
      >
        <View style={[ps.row, ps.rowTop]}>
          <View style={ps.iconOnTitle}>
            <View style={[ps.rowIcon, { backgroundColor: tone.bg }]}>
              <Suitcase size={16} color={tone.fg} weight="fill" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ps.rowTitle, { color: C.textPrimary }]}>{belt ? `Bags on belt ${belt}` : "Baggage belt not posted yet"}</Text>
            <Text style={[ps.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
              {[terminal ? `Terminal ${terminal}` : "", flight.flightNum ?? "", `landed ${clock(landedAt)}`].filter(Boolean).join(", ")}
            </Text>
          </View>
        </View>
      </ScalePress>
      {then ? (
        <ScalePress
          activeScale={0.985}
          onPress={() => open(then.id)}
          accessibilityRole="button"
          accessibilityLabel={`Then: ${title(then)}, ${then.time}`}
        >
          <View style={[ps.row, ps.rowTop, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
            <View style={ps.iconOnTitle}><CategoryDot type={then.type} transferType={then.transferType} size={32} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[ps.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>{title(then)}</Text>
              <Text style={[ps.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                <Text style={{ color: C.tealText, fontWeight: T.semibold }}>{then.time}</Text>
                {then.location ? `, ${tidyLocation(then.location)}` : ""}
              </Text>
              {thenDetail ? <Text style={[ps.rowSub, { color: C.textSecondary }]} numberOfLines={2}>{thenDetail}</Text> : null}
            </View>
          </View>
        </ScalePress>
      ) : null}
    </FadeIn>
  );
}

const s = StyleSheet.create({
  lede: { fontSize: T.base, lineHeight: 22, paddingHorizontal: S.md, marginBottom: S.xs },
});
