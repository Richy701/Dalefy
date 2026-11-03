import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Linking, Pressable } from "react-native";
import { AirplaneTilt, DeviceMobile, Headset, Phone } from "phosphor-react-native";
import * as Haptics from "@/services/haptics";
import { fetchTripOversight, type TripOversight } from "@/services/firebaseTrips";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import { parseTripDate } from "@/shared/dates";
import type { Trip } from "@/shared/types";

const SHOWN_NAMES = 6;

function flightProblems(trip: Trip) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return trip.events.flatMap(ev => {
    if (ev.type !== "flight" || parseTripDate(ev.date) < today) return [];
    const status = (ev.status ?? "").toLowerCase();
    const word = status.startsWith("cancel") ? "cancelled" : status === "diverted" ? "diverted" : status.startsWith("delay") ? "delayed" : null;
    return word ? [{ id: ev.id, text: `${ev.flightNum || ev.title} ${word}`, severe: word !== "delayed" }] : [];
  });
}

/** For someone overseeing the trip from home: what's wrong, who can't be reached in the app, and who to call. */
export function OverseeingCard({ trip, C }: { trip: Trip; C: ThemeColors }) {
  const s = useMemo(() => makeStyles(C), [C]);
  const [oversight, setOversight] = useState<TripOversight | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Refreshed when the trip changes, so someone joining or a new leader shows up
  const tripId = trip.id;
  const stamp = trip.events.length;
  useEffect(() => {
    let cancelled = false;
    fetchTripOversight(tripId)
      .then(next => { if (!cancelled) { setOversight(next); setFailed(!next); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [tripId, stamp]);

  const problems = useMemo(() => flightProblems(trip), [trip]);
  const hasFlights = trip.events.some(ev => ev.type === "flight");
  const missing = oversight?.notInApp ?? [];
  const names = showAll ? missing : missing.slice(0, SHOWN_NAMES);

  return (
    <View style={s.card} accessibilityLabel="Overseeing this trip">
      <View style={s.head}>
        <Headset size={16} color={C.textPrimary} weight="fill" />
        <Text style={s.title}>You're overseeing this trip</Text>
      </View>
      <Text style={s.hint}>Only coordinators see this.</Text>

      {hasFlights ? (
        <View style={s.row}>
          <AirplaneTilt size={16} color={problems.some(p => p.severe) ? C.redText : problems.length ? C.amberText : C.textSecondary} weight="fill" />
          <View style={s.rowText}>
            {problems.length
              ? problems.map(p => <Text key={p.id} style={[s.rowTitle, { color: p.severe ? C.redText : C.amberText }]}>{p.text}</Text>)
              : <Text style={s.rowTitle}>No flight problems</Text>}
          </View>
        </View>
      ) : null}

      {failed ? (
        <View style={s.row}>
          <DeviceMobile size={16} color={C.textSecondary} />
          <Text style={[s.rowText, s.sub]}>Couldn't load who's in the app.</Text>
        </View>
      ) : oversight && oversight.total > 0 ? (
        <View style={s.row}>
          <DeviceMobile size={16} color={C.textSecondary} />
          <View style={s.rowText}>
            <Text style={s.rowTitle}>{oversight.inApp} of {oversight.total} in the app</Text>
            {missing.length ? <Text style={s.sub}>Not joined: {names.join(", ")}{showAll || missing.length <= SHOWN_NAMES ? "" : ` and ${missing.length - SHOWN_NAMES} more`}</Text> : null}
            {missing.length > SHOWN_NAMES ? (
              <Pressable onPress={() => { Haptics.selectionAsync(); setShowAll(v => !v); }} accessibilityRole="button" hitSlop={8}>
                <Text style={s.link}>{showAll ? "Show fewer" : "Show everyone"}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {oversight?.leaders.map(leader => (
        <View key={leader.name} style={s.row}>
          <Phone size={16} color={C.textSecondary} />
          <View style={s.rowText}>
            <Text style={s.rowTitle} numberOfLines={1}>{leader.name}</Text>
            <Text style={s.sub}>Group leader</Text>
          </View>
          {leader.phone ? (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${leader.phone}`).catch(() => {}); }}
              accessibilityRole="button"
              accessibilityLabel={`Call ${leader.name}`}
              hitSlop={8}
            >
              <Text style={s.link}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: { marginHorizontal: S.md, marginBottom: S.md, padding: S.md, gap: S.sm, borderRadius: R.xl, backgroundColor: C.elevated },
    head: { flexDirection: "row", alignItems: "center", gap: S.xs },
    title: { flex: 1, fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    hint: { fontSize: T.xs, color: C.textSecondary, marginTop: -S.xs },
    row: { flexDirection: "row", alignItems: "flex-start", gap: S.xs },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    rowTitle: { fontSize: T.sm, fontWeight: T.medium, color: C.textPrimary },
    sub: { fontSize: T.xs, lineHeight: 16, color: C.textSecondary },
    link: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },
  });
}
