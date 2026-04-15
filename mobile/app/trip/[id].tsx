import {
  View, Text, ScrollView, Image, Pressable,
  StyleSheet, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plane, Hotel, Compass, Utensils, MapPin, Clock, Users, Moon, Hash, DollarSign, Tag } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { T, R, S, statusColor, statusBg, eventColor, type ThemeColors } from "@/constants/theme";
import { useMemo } from "react";

const EVENT_ICONS: Record<string, any> = {
  flight: Plane,
  hotel: Hotel,
  activity: Compass,
  dining: Utensils,
};

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const trip = trips.find(t => t.id === id);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start = new Date(trip.start);
  const end = new Date(trip.end);
  const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const sc = statusColor(trip.status, C);
  const sb = statusBg(trip.status, C);

  const grouped = trip.events.reduce<Record<string, typeof trip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: trip.image }} style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={["#00000020", "#00000060", "#000000e0"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <Pressable
            style={({ pressed }) => [styles.backCircle, { top: Platform.OS === "android" ? 20 : 16, opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={18} color="#fff" strokeWidth={2} />
          </Pressable>
          <View style={styles.heroContent}>
            {trip.destination && (
              <View style={styles.destTag}>
                <MapPin size={9} color={C.teal} strokeWidth={2} />
                <Text style={styles.heroDest}>{trip.destination}</Text>
              </View>
            )}
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>
            <View style={styles.heroFooter}>
              <View style={[styles.statusChip, { backgroundColor: sb, borderColor: `${sc}40` }]}>
                <View style={[styles.statusDot, { backgroundColor: sc }]} />
                <Text style={[styles.statusText, { color: sc }]}>{trip.status}</Text>
              </View>
              <Text style={styles.heroDate}>
                {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick stats bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Moon size={14} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.statVal}>{nights}</Text>
            <Text style={styles.statLbl}>Nights</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Compass size={14} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.statVal}>{trip.events.length}</Text>
            <Text style={styles.statLbl}>Events</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Users size={14} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.statVal}>{trip.paxCount || "—"}</Text>
            <Text style={styles.statLbl}>Pax</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <DollarSign size={14} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.statVal}>{trip.budget ? trip.budget : (trip.currency || "USD")}</Text>
            <Text style={styles.statLbl}>{trip.budget ? "Budget" : "Currency"}</Text>
          </View>
        </View>

        {/* Trip info pills */}
        {(trip.attendees || trip.tripType) && (
          <View style={styles.infoRow}>
            {trip.attendees && (
              <View style={styles.infoPill}>
                <Users size={11} color={C.textSecondary} strokeWidth={1.8} />
                <Text style={styles.infoPillText}>{trip.attendees}</Text>
              </View>
            )}
            {trip.tripType && (
              <View style={styles.infoPill}>
                <Tag size={11} color={C.textSecondary} strokeWidth={1.8} />
                <Text style={styles.infoPillText}>{trip.tripType}</Text>
              </View>
            )}
          </View>
        )}


        {/* Itinerary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itinerary</Text>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, events]) => {
            const d = new Date(date + "T12:00:00");
            return (
              <View key={date} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayNumBox}>
                    <Text style={styles.dayNum}>{d.getDate()}</Text>
                  </View>
                  <View style={styles.dayInfo}>
                    <Text style={styles.dayName}>{d.toLocaleDateString("en-US", { weekday: "long" })}</Text>
                    <Text style={styles.dayMonth}>{d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
                  </View>
                  <View style={styles.dayEventCount}>
                    <Text style={styles.dayEventCountText}>{events.length}</Text>
                  </View>
                </View>

                {events.map(ev => {
                  const Icon = EVENT_ICONS[ev.type] ?? Compass;
                  const color = eventColor(ev.type, C);
                  return (
                    <View key={ev.id} style={styles.eventCard}>
                      <View style={[styles.eventIconBox, { backgroundColor: `${color}15` }]}>
                        <Icon size={16} color={color} strokeWidth={1.8} />
                      </View>
                      <View style={styles.eventBody}>
                        <View style={styles.eventTitleRow}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                          {ev.status && (
                            <View style={[styles.eventStatusChip, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
                              <Text style={[styles.eventStatusText, { color }]}>{ev.status}</Text>
                            </View>
                          )}
                        </View>

                        {/* Time + location */}
                        <View style={styles.eventMetaRow}>
                          {ev.time && (
                            <View style={styles.metaItem}>
                              <Clock size={10} color={C.textTertiary} strokeWidth={1.5} />
                              <Text style={styles.metaText}>{ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}</Text>
                            </View>
                          )}
                          {ev.location && (
                            <View style={styles.metaItem}>
                              <MapPin size={10} color={C.textTertiary} strokeWidth={1.5} />
                              <Text style={styles.metaText} numberOfLines={1}>{ev.location}</Text>
                            </View>
                          )}
                        </View>

                        {/* Flight-specific */}
                        {ev.type === "flight" && (ev.airline || ev.flightNum || ev.duration) && (
                          <View style={styles.detailRow}>
                            {ev.airline && <Text style={styles.detailText}>{ev.airline}</Text>}
                            {ev.flightNum && <Text style={[styles.detailText, { color: C.flight }]}>{ev.flightNum}</Text>}
                            {ev.duration && <Text style={styles.detailText}>{ev.duration}</Text>}
                            {ev.seatDetails && <Text style={styles.detailText}>{ev.seatDetails}</Text>}
                          </View>
                        )}

                        {/* Hotel-specific */}
                        {ev.type === "hotel" && (ev.checkin || ev.roomType) && (
                          <View style={styles.detailRow}>
                            {ev.checkin && <Text style={styles.detailText}>In: {ev.checkin}</Text>}
                            {ev.checkout && <Text style={styles.detailText}>Out: {ev.checkout}</Text>}
                            {ev.roomType && <Text style={styles.detailText}>{ev.roomType}</Text>}
                          </View>
                        )}

                        {/* Supplier + price */}
                        {(ev.supplier || ev.price) && (
                          <View style={styles.detailRow}>
                            {ev.supplier && (
                              <View style={styles.metaItem}>
                                <Tag size={9} color={C.textTertiary} strokeWidth={1.5} />
                                <Text style={styles.detailText}>{ev.supplier}</Text>
                              </View>
                            )}
                            {ev.price && (
                              <View style={[styles.priceChip]}>
                                <Text style={styles.priceText}>{ev.price}</Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Confirmation number */}
                        {ev.confNumber && (
                          <View style={styles.confRow}>
                            <Hash size={10} color={C.teal} strokeWidth={2} />
                            <Text style={styles.confLabel}>CONF</Text>
                            <Text style={styles.confNumber}>{ev.confNumber}</Text>
                          </View>
                        )}

                        {ev.notes && (
                          <Text style={styles.eventNotes} numberOfLines={2}>{ev.notes}</Text>
                        )}
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

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md },
  backBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
  backBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

  hero: { height: 340, position: "relative" },
  backCircle: {
    position: "absolute", left: S.md,
    width: 44, height: 44, borderRadius: R.full,
    backgroundColor: "#00000055", alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
  },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: S.lg, paddingBottom: S.xl },
  destTag: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  heroDest: { fontSize: T.xs, fontWeight: T.bold, color: "#0bd2b5", letterSpacing: 1.8, textTransform: "uppercase" },
  heroTitle: { fontSize: T["3xl"], fontWeight: T.black, color: "#ffffff", letterSpacing: -0.5, marginBottom: S.xs, lineHeight: 30 },
  heroFooter: { flexDirection: "row", alignItems: "center", gap: S.xs },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: S.xs, paddingVertical: 4, borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth },
  statusDot: { width: 5, height: 5, borderRadius: R.full },
  statusText: { fontSize: 10, fontWeight: T.bold, letterSpacing: 0.8, textTransform: "uppercase" },
  heroDate: { fontSize: T.sm, color: "#ffffffaa", fontWeight: T.medium },

  statsBar: {
    flexDirection: "row", backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: S.sm, gap: 3 },
  statVal: { fontSize: T.lg, fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.3 },
  statLbl: { fontSize: T.xs - 1, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.8, textTransform: "uppercase" },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: S.xs },

  infoRow: { flexDirection: "row", gap: S.xs, flexWrap: "wrap", paddingHorizontal: S.md, paddingTop: S.sm },
  infoPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.card, borderRadius: R.full,
    paddingHorizontal: S.sm, paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  infoPillText: { fontSize: T.sm, color: C.textSecondary, fontWeight: T.medium },

  section: { padding: S.md, paddingTop: S.lg },
  sectionTitle: { fontSize: T.xl, fontWeight: T.extrabold, color: C.textPrimary, letterSpacing: -0.3, marginBottom: S.lg },

  dayGroup: { marginBottom: S.xl },
  dayHeader: {
    flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.sm,
    paddingBottom: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  dayNumBox: {
    width: 42, height: 42, borderRadius: R.md, backgroundColor: C.tealDim,
    alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
  },
  dayNum: { fontSize: T.xl, fontWeight: T.black, color: C.teal, letterSpacing: -0.5 },
  dayInfo: { flex: 1 },
  dayName: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.2 },
  dayMonth: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginTop: 1 },
  dayEventCount: {
    backgroundColor: C.elevated, borderRadius: R.sm,
    paddingHorizontal: S.xs, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  dayEventCountText: { fontSize: T.xs, fontWeight: T.bold, color: C.textSecondary, letterSpacing: 0.5 },

  eventCard: {
    flexDirection: "row", gap: S.sm, marginBottom: S.xs,
    backgroundColor: C.card, borderRadius: R.lg, padding: S.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  eventIconBox: { width: 38, height: 38, borderRadius: R.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eventBody: { flex: 1 },
  eventTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.xs, marginBottom: 5 },
  eventTitle: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.2, flex: 1 },
  eventStatusChip: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth,
  },
  eventStatusText: { fontSize: 8, fontWeight: T.bold, letterSpacing: 0.8, textTransform: "uppercase" },

  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap", marginBottom: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },

  detailRow: { flexDirection: "row", gap: S.xs, flexWrap: "wrap", alignItems: "center", marginTop: 4 },
  detailText: { fontSize: T.sm, color: C.textSecondary, fontWeight: T.medium },

  priceChip: {
    backgroundColor: C.tealDim, borderRadius: R.full,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
  },
  priceText: { fontSize: T.xs, fontWeight: T.bold, color: C.teal, letterSpacing: 0.3 },

  confRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 6, backgroundColor: `${C.teal}10`,
    paddingHorizontal: S.xs, paddingVertical: 4,
    borderRadius: R.sm, alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth, borderColor: `${C.teal}25`,
  },
  confLabel: { fontSize: 8, fontWeight: T.black, color: C.teal, letterSpacing: 1.5 },
  confNumber: { fontSize: T.sm, fontWeight: T.bold, color: C.teal, letterSpacing: 0.5 },

  eventNotes: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.regular, marginTop: 5, lineHeight: 16 },

}); }
