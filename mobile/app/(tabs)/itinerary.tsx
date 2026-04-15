import {
  View, Text, ScrollView, Image, Pressable,
  StyleSheet, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Plane, Hotel, Compass, Utensils, MapPin, Clock, Hash, Tag, ArrowRight, Moon, CalendarDays } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, eventColor } from "@/constants/theme";
import type { Trip } from "@/shared/types";

const EVENT_ICONS: Record<string, any> = {
  flight: Plane,
  hotel: Hotel,
  activity: Compass,
  dining: Utensils,
};

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function isToday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function NoTrip() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.emptyState}>
        <CalendarDays size={48} color={C.border} strokeWidth={1} />
        <Text style={styles.emptyTitle}>No trips scheduled</Text>
        <Text style={styles.emptyText}>Your itinerary will appear here once a trip is confirmed.</Text>
      </View>
    </SafeAreaView>
  );
}

export default function ItineraryScreen() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips } = useTrips();
  const router = useRouter();

  const activeTrip: Trip | undefined = useMemo(() => {
    const sorted = [...trips].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const active = sorted.find(t => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0);
    if (active) return active;
    const upcoming = sorted.find(t => daysUntil(t.start) > 0);
    return upcoming ?? sorted[sorted.length - 1];
  }, [trips]);

  if (!activeTrip) return <NoTrip />;

  const start = new Date(activeTrip.start);
  const end = new Date(activeTrip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const days = daysUntil(activeTrip.start);
  const isActive = days <= 0 && daysUntil(activeTrip.end) >= 0;
  const isPast = daysUntil(activeTrip.end) < 0;

  const grouped = activeTrip.events.reduce<Record<string, typeof activeTrip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  const tripLabel = isPast ? "PREVIOUS TRIP" : isActive ? "CURRENT TRIP" : `IN ${days} DAYS`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: activeTrip.image }} style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={["#00000015", "#00000060", "#000000ee"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Status bar area */}
          <View style={[styles.heroTop, { paddingTop: Platform.OS === "android" ? 16 : 8 }]}>
            <View style={[styles.tripBadge, isActive && styles.tripBadgeActive]}>
              <View style={[styles.tripBadgeDot, { backgroundColor: isActive ? C.teal : isPast ? C.textTertiary : C.amber }]} />
              <Text style={[styles.tripBadgeText, { color: isActive ? C.teal : isPast ? C.textTertiary : C.amber }]}>{tripLabel}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.viewAllBtn, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => router.push(`/trip/${activeTrip.id}`)}
            >
              <Text style={styles.viewAllText}>Full detail</Text>
              <ArrowRight size={12} color={C.teal} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.heroContent}>
            {activeTrip.destination && (
              <View style={styles.destRow}>
                <MapPin size={9} color={C.teal} strokeWidth={2} />
                <Text style={styles.heroDest}>{activeTrip.destination}</Text>
              </View>
            )}
            <Text style={styles.heroTitle} numberOfLines={2}>{activeTrip.name}</Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Moon size={11} color="#ffffffaa" strokeWidth={1.8} />
                <Text style={styles.heroStatText}>{nights} nights</Text>
              </View>
              <View style={styles.heroDot} />
              <View style={styles.heroStat}>
                <Compass size={11} color="#ffffffaa" strokeWidth={1.8} />
                <Text style={styles.heroStatText}>{activeTrip.events.length} events</Text>
              </View>
              <View style={styles.heroDot} />
              <Text style={styles.heroStatText}>
                {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </View>
          </View>
        </View>

        {/* Day-by-day itinerary */}
        <View style={styles.body}>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, events], dayIdx) => {
            const d = new Date(date + "T12:00:00");
            const today = isToday(date);

            return (
              <View key={date} style={styles.dayGroup}>
                {/* Day header */}
                <View style={[styles.dayHeader, today && styles.dayHeaderToday]}>
                  <View style={[styles.dayNumBox, today && styles.dayNumBoxToday]}>
                    <Text style={[styles.dayNum, today && styles.dayNumToday]}>{dayIdx + 1}</Text>
                  </View>
                  <View style={styles.dayInfo}>
                    <View style={styles.dayTitleRow}>
                      <Text style={styles.dayName}>{d.toLocaleDateString("en-US", { weekday: "long" })}</Text>
                      {today && (
                        <View style={styles.todayChip}>
                          <Text style={styles.todayChipText}>TODAY</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.dayDate}>
                      {d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </Text>
                  </View>
                </View>

                {/* Events */}
                {events.map((ev, evIdx) => {
                  const Icon = EVENT_ICONS[ev.type] ?? Compass;
                  const color = eventColor(ev.type);
                  const isLast = evIdx === events.length - 1;

                  return (
                    <View key={ev.id} style={styles.eventWrap}>
                      <View style={[styles.eventCard, today && styles.eventCardToday]}>
                        <View style={styles.eventCardTop}>
                          <View style={[styles.eventIconBox, { backgroundColor: `${color}18` }]}>
                            <Icon size={15} color={color} strokeWidth={1.8} />
                          </View>
                          <View style={styles.eventCardBody}>
                            <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                            <View style={styles.eventMetaRow}>
                              {ev.time && (
                                <View style={styles.metaChip}>
                                  <Clock size={9} color={C.textTertiary} strokeWidth={1.5} />
                                  <Text style={styles.metaChipText}>{ev.time}</Text>
                                </View>
                              )}
                              {ev.location && (
                                <View style={styles.metaChip}>
                                  <MapPin size={9} color={C.textTertiary} strokeWidth={1.5} />
                                  <Text style={styles.metaChipText} numberOfLines={1}>{ev.location}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          {ev.status && (
                            <View style={[styles.statusChip, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
                              <Text style={[styles.statusText, { color }]}>{ev.status}</Text>
                            </View>
                          )}
                        </View>

                        {/* Flight details */}
                        {ev.type === "flight" && (ev.airline || ev.flightNum || ev.duration) && (
                          <View style={styles.detailStrip}>
                            {ev.airline && <Text style={styles.detailItem}>{ev.airline}</Text>}
                            {ev.flightNum && <Text style={[styles.detailItem, { color: C.flight, fontWeight: T.bold }]}>{ev.flightNum}</Text>}
                            {ev.duration && <Text style={styles.detailItem}>{ev.duration}</Text>}
                            {ev.seatDetails && <Text style={styles.detailItem}>{ev.seatDetails}</Text>}
                          </View>
                        )}

                        {/* Hotel details */}
                        {ev.type === "hotel" && (ev.checkin || ev.roomType) && (
                          <View style={styles.detailStrip}>
                            {ev.checkin && <Text style={styles.detailItem}>Check-in {ev.checkin}</Text>}
                            {ev.checkout && <Text style={styles.detailItem}>Check-out {ev.checkout}</Text>}
                            {ev.roomType && <Text style={styles.detailItem}>{ev.roomType}</Text>}
                          </View>
                        )}

                        {/* Supplier + price */}
                        {(ev.supplier || ev.price) && (
                          <View style={styles.detailStrip}>
                            {ev.supplier && (
                              <View style={styles.metaChip}>
                                <Tag size={9} color={C.textTertiary} strokeWidth={1.5} />
                                <Text style={styles.metaChipText}>{ev.supplier}</Text>
                              </View>
                            )}
                            {ev.price && (
                              <View style={[styles.priceChip]}>
                                <Text style={styles.priceText}>{ev.price}</Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Confirmation */}
                        {ev.confNumber && (
                          <View style={styles.confRow}>
                            <Hash size={10} color={C.teal} strokeWidth={2} />
                            <Text style={styles.confLabel}>CONF</Text>
                            <Text style={styles.confNumber}>{ev.confNumber}</Text>
                          </View>
                        )}

                        {ev.notes && <Text style={styles.eventNotes} numberOfLines={2}>{ev.notes}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: S.lg },

    hero: { height: 240, position: "relative" },
    heroTop: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: S.md, position: "absolute", left: 0, right: 0, top: 0,
    },
    tripBadge: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "#00000060", paddingHorizontal: S.xs, paddingVertical: 5,
      borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
    },
    tripBadgeActive: { backgroundColor: C.tealDim, borderColor: C.tealMid },
    tripBadgeDot: { width: 5, height: 5, borderRadius: R.full },
    tripBadgeText: { fontSize: T.xs, fontWeight: T.black, letterSpacing: 1.2, textTransform: "uppercase" },
    viewAllBtn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: "#00000060", paddingHorizontal: S.xs, paddingVertical: 5,
      borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth, borderColor: `${C.teal}30`,
    },
    viewAllText: { fontSize: T.xs, fontWeight: T.bold, color: C.teal, letterSpacing: 0.5 },

    heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md, paddingBottom: S.lg },
    destRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
    heroDest: { fontSize: T.xs, fontWeight: T.bold, color: "#0bd2b5", letterSpacing: 1.8, textTransform: "uppercase" },
    heroTitle: { fontSize: T["3xl"] - 2, fontWeight: T.black, color: "#ffffff", letterSpacing: -0.5, marginBottom: 6, lineHeight: 28 },
    heroStats: { flexDirection: "row", alignItems: "center", gap: 6 },
    heroStat: { flexDirection: "row", alignItems: "center", gap: 4 },
    heroStatText: { fontSize: T.sm, color: "#ffffffaa", fontWeight: T.medium },
    heroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#ffffff30" },

    body: { padding: S.md },

    dayGroup: { marginBottom: S.xl },
    dayHeader: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      marginBottom: S.sm, paddingBottom: S.sm,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    dayHeaderToday: { borderBottomColor: `${C.teal}40` },
    dayNumBox: {
      width: 38, height: 38, borderRadius: R.md, backgroundColor: C.card,
      alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    dayNumBoxToday: { backgroundColor: C.tealDim, borderColor: C.tealMid },
    dayNum: { fontSize: T.lg, fontWeight: T.black, color: C.textSecondary },
    dayNumToday: { color: C.teal },
    dayInfo: { flex: 1 },
    dayTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dayName: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.2 },
    todayChip: {
      backgroundColor: C.tealDim, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    todayChipText: { fontSize: 8, fontWeight: T.black, color: C.teal, letterSpacing: 1.5 },
    dayDate: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },

    eventWrap: { marginBottom: S.xs },

    eventCard: {
      backgroundColor: C.card, borderRadius: R.lg, padding: S.sm,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: 0,
    },
    eventCardToday: { borderColor: `${C.teal}25` },
    eventCardTop: { flexDirection: "row", alignItems: "flex-start", gap: S.xs },
    eventIconBox: { width: 34, height: 34, borderRadius: R.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    eventCardBody: { flex: 1 },
    eventTitle: { fontSize: T.base, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.2, marginBottom: 3 },
    eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    metaChip: { flexDirection: "row", alignItems: "center", gap: 3 },
    metaChipText: { fontSize: 10, color: C.textTertiary, fontWeight: T.medium },
    statusChip: {
      paddingHorizontal: 7, paddingVertical: 3, borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth, alignSelf: "flex-start",
    },
    statusText: { fontSize: 8, fontWeight: T.bold, letterSpacing: 0.8, textTransform: "uppercase" },

    detailStrip: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: S.xs, paddingTop: S.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    detailItem: { fontSize: T.sm, color: C.textSecondary, fontWeight: T.medium },

    priceChip: {
      backgroundColor: C.tealDim, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
    },
    priceText: { fontSize: T.xs, fontWeight: T.bold, color: C.teal },

    confRow: {
      flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6,
      backgroundColor: `${C.teal}10`, paddingHorizontal: S.xs, paddingVertical: 4,
      borderRadius: R.sm, alignSelf: "flex-start", borderWidth: StyleSheet.hairlineWidth, borderColor: `${C.teal}25`,
    },
    confLabel: { fontSize: 8, fontWeight: T.black, color: C.teal, letterSpacing: 1.5 },
    confNumber: { fontSize: T.sm, fontWeight: T.bold, color: C.teal, letterSpacing: 0.5 },

    eventNotes: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.regular, marginTop: 5, lineHeight: 16 },

    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: S.sm, paddingHorizontal: S.xl },
    emptyTitle: { fontSize: T.lg, fontWeight: T.bold, color: C.textSecondary },
    emptyText: { fontSize: T.base, color: C.textTertiary, textAlign: "center", lineHeight: 20 },
  });
}
