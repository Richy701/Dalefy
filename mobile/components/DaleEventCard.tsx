import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import type { TravelEvent } from "@/shared/types";
import type { ThemeColors } from "@/constants/theme";
import { T, R, S } from "@/constants/theme";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { CachedImage } from "@/components/CachedImage";
import { PlaneIcon } from "@/components/ui/PlaneIcon";
import { airlineLogo } from "@/shared/airlineLogos";
import { tidyTitleSeparators, tidyLocation } from "@/shared/eventTitle";
import { parseTripDate } from "@/shared/dates";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

const DAY_MS = 86_400_000;
// Carrier marks are drawn for a white ground, in either theme, as on the flight page
const LOGO_PLATE = "#fff";
const LIQUID_GLASS = isLiquidGlassAvailable();

/** A card's ground: Liquid Glass where the system has it, else a see-through tint with a hairline edge */
export function Ground({ glass, C }: { glass?: boolean; C: ThemeColors }) {
  if (!glass) return null;
  // Tinted with the card colour so the card reads as a card, not a hole in the sheet
  const tint = /^#[0-9a-f]{6}$/i.test(C.card) ? `${C.card}99` : C.elevated;
  const edge = { borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border };
  return LIQUID_GLASS
    ? <GlassView glassEffectStyle="regular" tintColor={tint} style={[StyleSheet.absoluteFill, edge]} />
    : <View style={[StyleSheet.absoluteFill, edge, { backgroundColor: tint }]} />;
}
const isTbd = (t?: string) => !t || /^tb[acd]$/i.test(t.trim());
const shortDay = (date: string) => parseTripDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function minutes(t?: string): number | null {
  const m = (t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** "7-8 Nov, 1 night" from a stay's dates */
function stayLine(ev: TravelEvent, fallbackEnd?: string): string {
  const start = ev.checkin && /^\d{4}-\d{2}-\d{2}$/.test(ev.checkin) ? ev.checkin : ev.date;
  const end = ev.checkout && /^\d{4}-\d{2}-\d{2}$/.test(ev.checkout) ? ev.checkout : ev.endDate || fallbackEnd;
  const a = parseTripDate(start);
  if (!end) return shortDay(start);
  const b = parseTripDate(end);
  const nights = Math.round((b.getTime() - a.getTime()) / DAY_MS);
  const range = a.getMonth() === b.getMonth()
    ? `${a.getDate()}-${b.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  return nights > 0 ? `${range}, ${nights} night${nights === 1 ? "" : "s"}` : range;
}

/** Route codes from the airport fields, else from "LHR to DOH" in the location */
function route(ev: TravelEvent): { from: string; to: string } {
  const parts = (ev.location ?? "").split(/\s+to\s+|→/i).map(s => s.trim());
  const code = (s: string) => (/^[A-Z]{3}$/.test(s) ? s : "");
  return { from: ev.depAirport || code(parts[0] ?? ""), to: ev.arrAirport || code(parts[1] ?? "") };
}

/**
 * The event Dale's answer is about, shaped by what it is: a flight as a small ticket with the carrier's
 * logo and live status, a stay with its photo and nights, anything else with its photo, time and place.
 */
export function DaleEventCard({ ev, C, onPress, stayEnd, glass }: {
  ev: TravelEvent; C: ThemeColors; onPress: () => void; stayEnd?: string;
  /** On a glass sheet: the card is glass too rather than a solid slab */
  glass?: boolean;
}) {
  const title = tidyTitleSeparators(ev.title);
  if (ev.type === "flight") return <FlightCard ev={ev} C={C} onPress={onPress} title={title} glass={glass} />;
  const sub = ev.type === "hotel" ? stayLine(ev, stayEnd) : [shortDay(ev.date), isTbd(ev.time) ? "" : ev.time].filter(Boolean).join(", ");
  const place = ev.location ? tidyLocation(ev.location) : "";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, sub, place].filter(Boolean).join(", ")}
      style={({ pressed }) => [s.card, { backgroundColor: glass ? "transparent" : C.elevated, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ground glass={glass} C={C} />
      {ev.image
        ? <CachedImage uri={ev.image} style={s.photo} />
        : <CategoryDot palette={C} type={ev.type} transferType={ev.transferType} size={44} base={C.elevated} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.title, { color: C.textPrimary }]} numberOfLines={2}>{title}</Text>
        <Text style={[s.sub, { color: glass ? C.textPrimary : C.textSecondary }]} numberOfLines={1}>
          {ev.type === "hotel" || isTbd(ev.time) ? sub : (
            <>{shortDay(ev.date)}, <Text style={{ color: C.tealText, fontWeight: T.semibold }}>{ev.time}</Text></>
          )}
        </Text>
        {place && ev.type !== "transfer" ? <Text style={[s.sub, { color: glass ? C.textSecondary : C.textTertiary }]} numberOfLines={1}>{place}</Text> : null}
      </View>
    </Pressable>
  );
}

function FlightCard({ ev, C, onPress, title, glass }: { ev: TravelEvent; C: ThemeColors; onPress: () => void; title: string; glass?: boolean }) {
  // Live status only around the day itself; further out the schedule is the answer and lookups cost money
  const now = useMinuteClock();
  const near = Math.abs(parseTripDate(ev.date).getTime() - now) < 1.5 * DAY_MS;
  const { data: live } = useFlightLiveData(near ? ev.flightNum : undefined, near ? ev.date : undefined);
  const iata = ev.flightNum?.match(/^([A-Z0-9]{2})/)?.[1] ?? "";
  const logo = airlineLogo(iata);
  const { from, to } = route(ev);
  const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ") || title;

  const status = (live?.status || ev.status || "").trim();
  const group = status.toLowerCase().replace(/\s+/g, "");
  const revised = live?.revisedTime || ev.revisedTime;
  const late = (() => {
    const a = minutes(ev.time), b = minutes(revised);
    if (a === null || b === null) return 0;
    return Math.max(0, ((b - a) % 1440 + 1440 + 720) % 1440 - 720);
  })();
  const statusText = group.startsWith("cancel") ? "Cancelled"
    : group === "diverted" ? "Diverted"
    : group === "arrived" || group === "landed" ? "Landed"
    : late >= 15 ? `${late} min late`
    : group === "departed" || group === "enroute" ? "In the air"
    : group === "boarding" ? "Boarding"
    : "";
  const statusColor = /Cancelled|Diverted/.test(statusText) ? C.redText : /late/.test(statusText) ? C.amberText : C.tealText;
  const terminal = live?.terminal || ev.terminal;
  const gate = live?.gate || ev.gate;
  const foot = [shortDay(ev.date), terminal ? `Terminal ${terminal.replace(/^T/i, "")}` : "", gate ? `Gate ${gate}` : ""].filter(Boolean).join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[carrier, from && to ? `${from} to ${to}` : "", isTbd(ev.time) ? "" : `departs ${ev.time}`, statusText, foot].filter(Boolean).join(", ")}
      style={({ pressed }) => [s.ticket, { backgroundColor: glass ? "transparent" : C.elevated, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ground glass={glass} C={C} />
      <View style={s.carrierRow}>
        <View style={[s.logoTile, { backgroundColor: LOGO_PLATE }]}>
          {logo ? <Image source={logo} accessible={false} style={s.logo} resizeMode="cover" />
            : <PlaneIcon size={14} color="#1c1c1e" />}
        </View>
        <Text style={[s.carrier, { color: glass ? C.textPrimary : C.textSecondary }]} numberOfLines={1}>{carrier}</Text>
        {statusText ? <Text style={[s.status, { color: statusColor }]}>{statusText}</Text> : null}
      </View>
      <View style={s.routeRow}>
        <View>
          <Text style={[s.code, { color: C.textPrimary }]}>{from || "---"}</Text>
          <Text style={[s.time, { color: glass ? C.textPrimary : C.textSecondary }]}>{isTbd(ev.time) ? "TBC" : (late >= 15 && revised ? revised : ev.time)}</Text>
        </View>
        <View style={s.line}>
          <View style={[s.rule, { backgroundColor: C.border }]} />
          <PlaneIcon size={14} color={C.textTertiary} />
          <View style={[s.rule, { backgroundColor: C.border }]} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.code, { color: C.textPrimary }]}>{to || "---"}</Text>
          <Text style={[s.time, { color: glass ? C.textPrimary : C.textSecondary }]}>{isTbd(ev.endTime) ? "" : ev.endTime}</Text>
        </View>
      </View>
      <Text style={[s.foot, { color: glass ? C.textSecondary : C.textTertiary }]} numberOfLines={1}>{foot}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.sm, borderRadius: R.lg },
  photo: { width: 56, height: 56, borderRadius: R.md },
  title: { fontSize: T.base, fontWeight: T.semibold, lineHeight: 20 },
  sub: { fontSize: T.sm, marginTop: 2 },
  ticket: { padding: S.sm2, borderRadius: R.lg, gap: S.xs },
  carrierRow: { flexDirection: "row", alignItems: "center", gap: S.xs },
  logoTile: { width: 22, height: 22, borderRadius: 11, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  logo: { width: 22, height: 22 },
  carrier: { flex: 1, fontSize: T.sm, fontWeight: T.medium },
  status: { fontSize: T.sm, fontWeight: T.semibold },
  routeRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  code: { fontSize: T.xl, fontWeight: T.bold, letterSpacing: 0.5, fontVariant: ["tabular-nums"] },
  time: { fontSize: T.sm, fontVariant: ["tabular-nums"], marginTop: 1 },
  line: { flex: 1, flexDirection: "row", alignItems: "center", gap: S.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  foot: { fontSize: T.xs },
});
