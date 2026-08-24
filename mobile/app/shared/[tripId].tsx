import { useEffect, useState, useMemo, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Platform,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay,
} from "react-native-reanimated";
import { Skeleton } from "@/components/Skeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Compass, MapPin, Users, Moon, ShareNetwork, Plus, Check, CaretDown,
  AirplaneTilt, Bed, ForkKnife, Car, WarningCircle,
} from "phosphor-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { T, R, S, F, SCROLL_BOTTOM_PAD, type ThemeColors } from "@/constants/theme";
import { fetchTripById, logTripJoin, fetchClaimedTravelerIds, patchTravelerEmail } from "@/services/firebaseTrips";
import { parseTripDate } from "@/shared/dates";
import { usePreferences } from "@/context/PreferencesContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { DaySummaryRow } from "@/components/DaySummaryRow";
import { OrganizerCard } from "@/components/OrganizerCard";
import { InfoDocsRow } from "@/components/InfoDocsRow";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import type { Trip } from "@/shared/types";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

function timeToMinutes(t: string): number {
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

const EVENT_ICONS: Record<string, React.ComponentType<any>> = {
  flight: AirplaneTilt, hotel: Bed, activity: Compass, dining: ForkKnife, transfer: Car,
};

export default function SharedTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { C } = useTheme();
  const { trips, addTrip } = useTrips();
  const { prefs } = usePreferences();
  const { user: authUser, isAnonymous } = useAuth();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const alreadyInMyTrips = useMemo(
    () => (tripId ? trips.some((t) => t.id === tripId) : false),
    [tripId, trips]
  );

  const [justAdded, setJustAdded] = useState(false);
  const addScale = useSharedValue(1);
  const addCheck = useSharedValue(0);

  const addBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addScale.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addCheck.value }],
    opacity: addCheck.value,
  }));

  const completeJoin = useCallback((linkedTravelerId?: string) => {
    if (!trip) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTrip(trip);
    logTripJoin(trip.id, trip.name, prefs.name, prefs.avatar, linkedTravelerId)
      .then((ok) => {
        if (!ok) {
          toast("Couldn't save this trip. Check your connection and try again.", "error");
          return;
        }
        if (linkedTravelerId && !isAnonymous && authUser?.email) {
          patchTravelerEmail(trip.id, linkedTravelerId, authUser.email);
        }
      });

    addScale.value = withSpring(0.92, { damping: 10, stiffness: 200 }, () => {
      addScale.value = withSpring(1, { damping: 14, stiffness: 120 });
    });
    addCheck.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 200 }));
    setJustAdded(true);
    setShowLinkPicker(false);

    setTimeout(() => {
      router.replace(`/trip/${trip.id}`);
    }, 1200);
  }, [trip, addTrip, addScale, addCheck, prefs, router, isAnonymous, authUser, toast]);

  const handleAddToMyTrips = useCallback(async () => {
    if (!trip || alreadyInMyTrips || justAdded) return;
    if ((trip.travelers?.length ?? 0) > 0) {
      const claimed = await fetchClaimedTravelerIds(trip.id);
      setClaimedIds(claimed);

      if (!isAnonymous && authUser?.email) {
        const emailMatch = trip.travelers!.find(
          (t) => t.email && t.email.toLowerCase() === authUser.email.toLowerCase() && !claimed.has(t.id),
        );
        if (emailMatch) {
          completeJoin(emailMatch.id);
          return;
        }
      }

      setShowLinkPicker(true);
      return;
    }
    completeJoin();
  }, [trip, alreadyInMyTrips, justAdded, completeJoin, isAnonymous, authUser]);

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

  const toggleDay = useCallback((date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        {/* Hero skeleton */}
        <Skeleton width="100%" height={340} borderRadius={0} />
        <View style={{ padding: S.md, gap: S.md }}>
          <Skeleton width={80} height={12} borderRadius={6} />
          <Skeleton width="75%" height={22} borderRadius={8} />
          <Skeleton width="55%" height={14} borderRadius={6} />
          <View style={{ height: S.md }} />
          <Skeleton width="100%" height={64} borderRadius={R.xl} />
          <Skeleton width="100%" height={64} borderRadius={R.xl} />
          <Skeleton width="100%" height={64} borderRadius={R.xl} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon={<WarningCircle size={28} color={C.teal} weight="light" />}
            title="Trip not found"
            message="This trip isn't available or hasn't been published yet."
            cta={{ label: "Go back", onPress: () => router.canGoBack() ? router.back() : router.replace("/(tabs)") }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const start = parseTripDate(trip.start);
  const end = parseTripDate(trip.end);

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
    <SafeAreaView style={styles.safe} edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={{ top: "35%", left: "50%" }} />
          <LinearGradient
            colors={["rgba(0,0,0,0.2)", "transparent"]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.15 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.5)"]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0.6 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <IconCircleButton
            variant="glass"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            accessibilityLabel="Go back"
            style={{ position: "absolute", left: S.md, top: insets.top + S.xs }}
          >
            <ArrowLeft size={18} color={C.textPrimary} weight="regular" />
          </IconCircleButton>

          <IconCircleButton
            variant="glass"
            onPress={handleShare}
            accessibilityLabel="Share trip"
            style={{ position: "absolute", right: S.md, top: insets.top + S.xs }}
          >
            <ShareNetwork size={18} color={C.textPrimary} weight="regular" />
          </IconCircleButton>

          <View style={styles.heroContent}>
            <MicroLabel color={C.teal} style={{ marginBottom: S.xs2 }}>Shared trip</MicroLabel>
            <Text style={styles.heroTitle} numberOfLines={2}>{trip.name}</Text>
            <View style={styles.chipsRow}>
              {trip.attendees ? (
                <Pill tone="glass" icon={<Users size={10} color={C.teal} weight="regular" />} label={String(trip.attendees)} />
              ) : null}
              <Pill
                tone="glass"
                icon={<Moon size={10} color={C.teal} weight="regular" />}
                label={`${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
              />
              {trip.destination ? (
                <Pill tone="glass" icon={<MapPin size={10} color={C.teal} weight="regular" />} label={trip.destination} />
              ) : null}
            </View>
          </View>
        </View>

        {/* Traveler picker */}
        {hasTravelers && (
          <View style={styles.pickerWrap}>
            <Pressable
              style={({ pressed }) => [styles.pickerBtn, viewAsId ? styles.pickerBtnActive : null, pressed && { opacity: 0.7 }]}
              onPress={() => setPickerOpen(!pickerOpen)} accessibilityRole="button" accessibilityLabel="Personalise your view"
            >
              {viewAsTraveler ? (
                <Avatar size={36} initials={viewAsTraveler.initials} />
              ) : (
                <View style={styles.pickerAvatar}>
                  <Users size={14} color={C.textSecondary} weight="regular" />
                </View>
              )}
              <View style={styles.pickerTextWrap}>
                <MicroLabel>
                  {viewAsId ? "Viewing as" : "Personalise your view"}
                </MicroLabel>
                <Text style={[styles.pickerName, { color: C.textPrimary }]} numberOfLines={1}>
                  {viewAsTraveler ? viewAsTraveler.name : "Select your name to see your itinerary"}
                </Text>
              </View>
              <CaretDown
                size={16}
                color={C.textTertiary}
                weight="regular"
                style={{ transform: [{ rotate: pickerOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {pickerOpen && (
              <View style={styles.pickerDropdown}>
                <Pressable
                  style={({ pressed }) => [styles.pickerOption, !viewAsId && styles.pickerOptionActive, pressed && { opacity: 0.7 }]}
                  onPress={() => { setViewAsId(null); setPickerOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: !viewAsId }}
                >
                  <Avatar size={30} initials="ALL" color={C.textTertiary} />
                  <Text style={styles.pickerOptionName}>Everyone · Full itinerary</Text>
                  {!viewAsId && <Check size={14} color={C.teal} weight="bold" />}
                </Pressable>

                <View style={[styles.pickerDivider, { backgroundColor: C.border }]} />

                {trip.travelers!.map(t => (
                  <Pressable
                    key={t.id}
                    style={({ pressed }) => [styles.pickerOption, viewAsId === t.id && styles.pickerOptionActive, pressed && { opacity: 0.7 }]}
                    onPress={() => { setViewAsId(t.id); setPickerOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: viewAsId === t.id }}
                  >
                    <Avatar size={30} initials={t.initials} />
                    <Text style={styles.pickerOptionName}>{t.name}</Text>
                    {viewAsId === t.id && <Check size={14} color={C.teal} weight="bold" />}
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

        {/* Information & Documents — only show after joining */}
        {alreadyInMyTrips && trip.info && trip.info.length > 0 && (
          <InfoDocsRow
            count={trip.info.length}
            C={C}
            onPress={() => router.push({ pathname: "/trip/info", params: { tripId: trip.id } })}
          />
        )}

        {/* Itinerary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MicroLabel>Itinerary</MicroLabel>
          </View>

          <View style={styles.dayRows}>
            {(() => {
              const sortedDays = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
              const _now = new Date();
              const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
              return sortedDays.map(([date, events], dayIdx) => (
                <View key={date}>
                  <DaySummaryRow
                    dayIndex={dayIdx + 1}
                    date={date}
                    events={events}
                    C={C}
                    isToday={date === todayStr}
                    onPress={() => toggleDay(date)}
                  />
                  {expandedDays.has(date) && (
                    <View style={styles.expandedEvents}>
                      {[...events].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)).map(ev => {
                        const Icon = EVENT_ICONS[ev.type] ?? Compass;
                        return (
                          <View key={ev.id} style={styles.inlineEvent}>
                            <View style={[styles.inlineEventIcon, { backgroundColor: C.tealDim }]}>
                              <Icon size={13} color={C.teal} weight="regular" />
                            </View>
                            <View style={styles.inlineEventContent}>
                              <Text style={styles.inlineEventTitle} numberOfLines={1}>{ev.title}</Text>
                              {(ev.time || ev.location) ? (
                                <Text style={styles.inlineEventSub} numberOfLines={1}>
                                  {ev.time || ""}{ev.time && ev.location ? "  ·  " : ""}{ev.location || ""}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ));
            })()}
          </View>
        </View>
      </ScrollView>

      {/* Traveler linking overlay */}
      {showLinkPicker && trip.travelers && trip.travelers.length > 0 && (
        <View style={styles.linkOverlay}>
          <View style={styles.linkSheet}>
            <Text style={styles.linkTitle}>Which traveller are you?</Text>
            <Text style={styles.linkSub}>
              This helps show you only the events relevant to you.
            </Text>

            {trip.travelers.map(t => {
              const taken = claimedIds.has(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => !taken && completeJoin(t.id)} accessibilityRole="button" accessibilityLabel={t.name} accessibilityState={{ disabled: taken }}
                  disabled={taken}
                  style={({ pressed }) => [styles.linkOption, pressed && !taken && { opacity: 0.8 }, taken && { opacity: 0.4 }]}
                >
                  <Avatar size={30} initials={t.initials} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerOptionName, { color: C.textPrimary }]}>{t.name}</Text>
                    {taken && <Text style={{ fontSize: T["2xs"], color: C.textTertiary, marginTop: 1 }}>Already claimed</Text>}
                  </View>
                </Pressable>
              );
            })}

            <Pressable onPress={() => completeJoin()} accessibilityRole="button" style={({ pressed }) => [styles.linkSkip, pressed && { opacity: 0.7 }]}>
              <Text style={styles.linkSkipText}>I'm not listed</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Sticky bottom banner */}
      {!alreadyInMyTrips && !justAdded ? (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + S.sm }]}>
          <Text style={styles.stickyText}>You're previewing this trip</Text>
          <Animated.View style={[addBtnStyle, { flex: 1 }]}>
            <Pressable
              onPress={handleAddToMyTrips} accessibilityRole="button" accessibilityLabel="Join a trip"
              style={({ pressed }) => [
                styles.addCta,
                { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Plus size={16} color={C.onAccent} weight="bold" />
              <Text style={[styles.addCtaText, { color: C.onAccent }]}>Join a trip</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : (
        <View style={[styles.stickyBar, styles.stickyBarJoined, { paddingBottom: insets.bottom + S.sm }]}>
          <Animated.View style={checkStyle}>
            <Check size={18} color={C.teal} weight="bold" />
          </Animated.View>
          <Text style={[styles.stickyTextJoined, { color: C.tealText }]}>Saved to my trips</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: SCROLL_BOTTOM_PAD },
    addCta: {
      height: 52, borderRadius: R.xl,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
    },
    addCtaText: {
      fontSize: T.md, fontWeight: T.bold,
    },

    hero: { aspectRatio: 16 / 9, position: "relative" },

    heroContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingBottom: S.lg,
    },
    heroTitle: {
      fontSize: T["4xl"], fontFamily: F.extrabold, textTransform: "uppercase",
      color: "#fff", letterSpacing: 0.3, marginBottom: S.sm, lineHeight: 36,
      includeFontPadding: false,
    },

    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: S.xs2 },

    sectionHeader: {
      paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm,
    },

    section: { paddingBottom: S.md },
    dayRows: { paddingHorizontal: S.md },

    // Traveler picker
    pickerWrap: { paddingHorizontal: S.md, paddingTop: S.md },
    pickerBtn: {
      flexDirection: "row", alignItems: "center", gap: S.sm2,
      padding: S.sm, borderRadius: R.xl,
      backgroundColor: C.elevated,
    },
    pickerBtnActive: {
      backgroundColor: C.tealDim,
    },
    pickerAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.border, alignItems: "center", justifyContent: "center",
    },
    pickerTextWrap: { flex: 1 },
    pickerName: {
      fontSize: T.md, fontWeight: T.bold as any, marginTop: 1,
    },
    pickerDropdown: {
      marginTop: S.xs2, borderRadius: R.xl, overflow: "hidden",
      backgroundColor: C.elevated,
    },
    pickerOption: {
      flexDirection: "row", alignItems: "center", gap: S.sm2,
      paddingVertical: S.sm, paddingHorizontal: S.sm, minHeight: 44,
    },
    pickerOptionActive: {
      backgroundColor: C.tealDim,
    },
    pickerOptionName: {
      flex: 1, fontSize: T.sm, fontWeight: T.bold as any, color: C.textSecondary,
    },
    pickerDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: S.sm },
    pickerSubtext: {
      fontSize: T.xs, fontWeight: T.bold as any, color: C.tealText,
      letterSpacing: 0.8, textTransform: "uppercase",
      marginTop: S.xs2, paddingHorizontal: 2,
    },

    // Expanded inline events
    expandedEvents: {
      marginBottom: S.md,
      backgroundColor: C.card,
      borderRadius: R.xl,
      paddingVertical: S["2xs"], paddingHorizontal: S.sm,
    },
    inlineEvent: {
      flexDirection: "row", alignItems: "center", gap: S.sm2,
      paddingVertical: S.xs, paddingHorizontal: S["2xs"],
    },
    inlineEventIcon: {
      width: 28, height: 28, borderRadius: R.sm,
      alignItems: "center", justifyContent: "center",
    },
    inlineEventContent: { flex: 1 },
    inlineEventTitle: {
      fontSize: T.xs, fontWeight: T.bold as any, color: C.textPrimary,
    },
    inlineEventSub: {
      fontSize: T["2xs"], color: C.textTertiary, marginTop: 1,
    },

    // Traveler linking overlay
    linkOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
      zIndex: 10,
    },
    linkSheet: {
      backgroundColor: C.bg,
      borderTopLeftRadius: R["2xl"], borderTopRightRadius: R["2xl"],
      paddingHorizontal: S.xl, paddingTop: S.lg, paddingBottom: S.xl,
    },
    linkTitle: {
      fontSize: T.xl, fontWeight: "800" as any, color: C.textPrimary,
      marginBottom: S["2xs"],
    },
    linkSub: {
      fontSize: T.sm, color: C.textSecondary, marginBottom: S.lg,
    },
    linkOption: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingVertical: S.sm, paddingHorizontal: S["2xs"], minHeight: 56,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
    },
    linkSkip: {
      alignItems: "center", paddingVertical: S.md, marginTop: S.xs,
    },
    linkSkipText: {
      fontSize: T.sm, fontWeight: T.medium as any, color: C.textTertiary,
    },

    // Sticky bottom bar
    stickyBar: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      backgroundColor: C.bg,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
      paddingHorizontal: S.md, paddingTop: S.sm,
    },
    stickyBarJoined: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
      paddingVertical: S.md,
    },
    stickyText: {
      fontSize: T.xs, fontWeight: T.bold as any, color: C.textTertiary,
      textTransform: "uppercase", letterSpacing: 1,
      textAlign: "center", marginBottom: S.xs,
    },
    stickyTextJoined: {
      fontSize: T.sm, fontWeight: T.bold as any,
      textTransform: "uppercase", letterSpacing: 1,
    },
  });
}
