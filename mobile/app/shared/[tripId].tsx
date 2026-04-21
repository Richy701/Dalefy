import { useEffect, useState, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Compass, MapPin, Users, Moon, Share2, Plus, Check, ChevronDown,
} from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { T, R, S, F, type ThemeColors } from "@/constants/theme";
import { fetchTripById, logTripJoin } from "@/services/firebaseTrips";
import { usePreferences } from "@/context/PreferencesContext";
import { DaySummaryRow } from "@/components/DaySummaryRow";
import { OrganizerCard } from "@/components/OrganizerCard";
import { InfoDocsRow } from "@/components/InfoDocsRow";
import type { Trip } from "@/shared/types";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

function timeToMinutes(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

export default function SharedTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { C } = useTheme();
  const { trips, addTrip } = useTrips();
  const { prefs } = usePreferences();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const alreadyInMyTrips = useMemo(
    () => (tripId ? trips.some((t) => t.id === tripId) : false),
    [tripId, trips]
  );

  const handleAddToMyTrips = () => {
    if (!trip || alreadyInMyTrips) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTrip(trip);
    logTripJoin(trip.id, trip.name, prefs.name, prefs.avatar);
    router.replace(`/trip/${trip.id}`);
  };

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    fetchTripById(tripId)
      .then((t) => {
        if (t) setTrip(t);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found or not published</Text>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start = new Date(trip.start);
  const end = new Date(trip.end);

  const hasTravelers = (trip.travelers?.length ?? 0) > 0;
  const viewAsTraveler = viewAsId ? trip.travelers?.find(t => t.id === viewAsId) ?? null : null;

  const filteredEvents = viewAsId
    ? trip.events.filter(e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(viewAsId))
    : trip.events;

  const grouped = filteredEvents.reduce<Record<string, typeof trip.events>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});
  for (const evs of Object.values(grouped)) {
    evs.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://dafadventures.com/shared/${trip.id}`;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { dialogTitle: trip.name });
      } else {
        await Clipboard.setStringAsync(url);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <CachedImage uri={trip.image} style={StyleSheet.absoluteFillObject} accessible={false} />
          <LinearGradient
            colors={["#00000008", "#00000040", "#000000e8"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <Pressable
            style={({ pressed }) => [
              styles.backCircle,
              { top: insets.top + 8, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={18} color="#fff" strokeWidth={2} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.shareCircle,
              { top: insets.top + 8, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share trip"
          >
            <Share2 size={16} color="#fff" strokeWidth={2} />
          </Pressable>

          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>SHARED TRIP</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>
            <View style={styles.chipsRow}>
              {trip.attendees ? (
                <View style={styles.chip}>
                  <Users size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.chipText}>{trip.attendees}</Text>
                </View>
              ) : null}
              <View style={styles.chip}>
                <Moon size={10} color={C.teal} strokeWidth={2} />
                <Text style={styles.chipText}>
                  {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" — "}
                  {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              {trip.destination ? (
                <View style={styles.chip}>
                  <MapPin size={10} color={C.teal} strokeWidth={2} />
                  <Text style={styles.chipText}>{trip.destination}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Traveler picker */}
        {hasTravelers && (
          <View style={styles.pickerWrap}>
            <Pressable
              style={[styles.pickerBtn, viewAsId ? styles.pickerBtnActive : null]}
              onPress={() => setPickerOpen(!pickerOpen)}
            >
              <View style={[styles.pickerAvatar, viewAsId ? styles.pickerAvatarActive : null]}>
                {viewAsTraveler
                  ? <Text style={styles.pickerAvatarText}>{viewAsTraveler.initials}</Text>
                  : <Users size={14} color={C.textSecondary} strokeWidth={2} />
                }
              </View>
              <View style={styles.pickerTextWrap}>
                <Text style={styles.pickerLabel}>
                  {viewAsId ? "VIEWING AS" : "WHO ARE YOU?"}
                </Text>
                <Text style={[styles.pickerName, { color: C.textPrimary }]} numberOfLines={1}>
                  {viewAsTraveler ? viewAsTraveler.name : "Select your name to see your itinerary"}
                </Text>
              </View>
              <ChevronDown
                size={16}
                color={C.textTertiary}
                strokeWidth={2}
                style={{ transform: [{ rotate: pickerOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {pickerOpen && (
              <View style={styles.pickerDropdown}>
                <Pressable
                  style={[styles.pickerOption, !viewAsId && styles.pickerOptionActive]}
                  onPress={() => { setViewAsId(null); setPickerOpen(false); }}
                >
                  <View style={styles.pickerOptionAvatar}>
                    <Text style={styles.pickerOptionAvatarText}>ALL</Text>
                  </View>
                  <Text style={styles.pickerOptionName}>Everyone — Full itinerary</Text>
                  {!viewAsId && <Check size={14} color={C.teal} strokeWidth={2.5} />}
                </Pressable>

                <View style={[styles.pickerDivider, { backgroundColor: C.border }]} />

                {trip.travelers!.map(t => (
                  <Pressable
                    key={t.id}
                    style={[styles.pickerOption, viewAsId === t.id && styles.pickerOptionActive]}
                    onPress={() => { setViewAsId(t.id); setPickerOpen(false); }}
                  >
                    <View style={[styles.pickerOptionAvatar, styles.pickerOptionAvatarBrand]}>
                      <Text style={[styles.pickerOptionAvatarText, { color: C.teal }]}>{t.initials}</Text>
                    </View>
                    <Text style={styles.pickerOptionName}>{t.name}</Text>
                    {viewAsId === t.id && <Check size={14} color={C.teal} strokeWidth={2.5} />}
                  </Pressable>
                ))}
              </View>
            )}

            {viewAsTraveler && (
              <Text style={styles.pickerSubtext}>
                Showing {filteredEvents.length} of {trip.events.length} events for {viewAsTraveler.name}
              </Text>
            )}
          </View>
        )}

        {/* Organizer contact card */}
        {trip.organizer && <OrganizerCard organizer={trip.organizer} C={C} />}

        {/* Information & Documents */}
        {trip.info && trip.info.length > 0 && (
          <InfoDocsRow
            count={trip.info.length}
            C={C}
            onPress={() => router.push({ pathname: "/trip/info", params: { tripId: trip.id } })}
          />
        )}

        {/* Itinerary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Compass size={13} color={C.teal} strokeWidth={1.8} />
            <Text style={styles.sectionEyebrow}>ITINERARY</Text>
          </View>

          <View style={styles.dayRows}>
            {(() => {
              const sortedDays = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
              const todayStr = new Date().toISOString().split("T")[0];
              return sortedDays.map(([date, events], dayIdx) => (
                <DaySummaryRow
                  key={date}
                  dayIndex={dayIdx + 1}
                  date={date}
                  events={events}
                  C={C}
                  isToday={date === todayStr}
                  isFirst={dayIdx === 0}
                  isLast={dayIdx === sortedDays.length - 1}
                  onPress={() => router.push({ pathname: "/trip/day", params: { tripId: trip.id, date } })}
                />
              ));
            })()}
          </View>
        </View>

        <Pressable
          onPress={handleAddToMyTrips}
          disabled={alreadyInMyTrips}
          style={({ pressed }) => [
            styles.addCta,
            {
              backgroundColor: alreadyInMyTrips ? C.elevated : C.teal,
              opacity: pressed && !alreadyInMyTrips ? 0.85 : 1,
            },
          ]}
        >
          {alreadyInMyTrips
            ? <Check size={16} color={C.textSecondary} strokeWidth={2.5} />
            : <Plus size={16} color="#000" strokeWidth={2.5} />}
          <Text style={[
            styles.addCtaText,
            { color: alreadyInMyTrips ? C.textSecondary : "#000" },
          ]}>
            {alreadyInMyTrips ? "Saved to my trips" : "Add to my trips"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 60 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: C.textSecondary, fontSize: T.lg, marginBottom: S.md, textAlign: "center", paddingHorizontal: S.xl },
    actionBtn: { backgroundColor: C.teal, paddingHorizontal: S.lg, paddingVertical: S.xs, borderRadius: R.full },
    actionBtnText: { color: C.bg, fontWeight: T.bold, fontSize: T.base },

    addCta: {
      marginHorizontal: S.md, marginTop: S.sm,
      height: 52, borderRadius: R.xl,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    addCtaText: {
      fontSize: T.sm, fontWeight: T.bold, letterSpacing: 1.2,
      textTransform: "uppercase",
    },

    hero: { height: 340, position: "relative" },
    backCircle: {
      position: "absolute", left: S.md,
      width: 44, height: 44, borderRadius: R.full,
      backgroundColor: "#00000055", alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
    },
    shareCircle: {
      position: "absolute", right: S.md,
      width: 44, height: 44, borderRadius: R.full,
      backgroundColor: "#00000055", alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "#ffffff18",
    },

    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingBottom: S.lg,
    },
    heroEyebrow: {
      fontSize: T.xs, fontWeight: T.bold, color: C.teal,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 6,
    },
    heroTitle: {
      fontSize: T["3xl"] + 4, fontFamily: F.black, fontWeight: T.black,
      color: "#ffffff", letterSpacing: -0.3, marginBottom: S.sm, lineHeight: 36,
    },

    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    },
    chipText: {
      fontSize: 10, fontWeight: T.bold,
      color: "rgba(255,255,255,0.9)", letterSpacing: 0.5, textTransform: "uppercase",
    },

    sectionHeader: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm,
    },
    sectionEyebrow: {
      fontSize: 10, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 1.5,
    },

    section: { paddingBottom: S.md },
    dayRows: { paddingHorizontal: S.md },

    // Traveler picker
    pickerWrap: { paddingHorizontal: S.md, paddingTop: S.md },
    pickerBtn: {
      flexDirection: "row", alignItems: "center", gap: 10,
      padding: 12, borderRadius: R.xl,
      backgroundColor: C.elevated,
    },
    pickerBtnActive: {
      backgroundColor: `${C.teal}10`,
    },
    pickerAvatar: {
      width: 36, height: 36, borderRadius: R.md,
      backgroundColor: C.border, alignItems: "center", justifyContent: "center",
    },
    pickerAvatarActive: {
      backgroundColor: `${C.teal}20`,
    },
    pickerAvatarText: {
      fontSize: 10, fontWeight: T.bold as any, color: C.teal,
      textTransform: "uppercase", letterSpacing: 0.5,
    },
    pickerTextWrap: { flex: 1 },
    pickerLabel: {
      fontSize: T.xs, fontWeight: T.bold as any, color: C.textTertiary,
      letterSpacing: 1.5, textTransform: "uppercase",
    },
    pickerName: {
      fontSize: T.md, fontWeight: T.bold as any, marginTop: 1,
    },
    pickerDropdown: {
      marginTop: 6, borderRadius: R.xl, overflow: "hidden",
      backgroundColor: C.elevated,
    },
    pickerOption: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingVertical: 12, paddingHorizontal: 12, minHeight: 44,
    },
    pickerOptionActive: {
      backgroundColor: `${C.teal}08`,
    },
    pickerOptionAvatar: {
      width: 30, height: 30, borderRadius: R.sm,
      backgroundColor: C.border, alignItems: "center", justifyContent: "center",
    },
    pickerOptionAvatarBrand: {
      backgroundColor: `${C.teal}15`,
    },
    pickerOptionAvatarText: {
      fontSize: 10, fontWeight: T.bold as any, color: C.textSecondary,
      textTransform: "uppercase", letterSpacing: 0.3,
    },
    pickerOptionName: {
      flex: 1, fontSize: T.sm, fontWeight: T.bold as any, color: C.textSecondary,
    },
    pickerDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
    pickerSubtext: {
      fontSize: T.xs, fontWeight: T.bold as any, color: `${C.teal}80`,
      letterSpacing: 0.8, textTransform: "uppercase",
      marginTop: 6, paddingHorizontal: 2,
    },
  });
}
