import { PhotoBackdrop, PhotoDissolve, photoPalette } from "@/components/ui/PhotoBackdrop";
import { heroPosition } from "@/shared/imagePosition";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { tidyTitleSeparators, tidyLocation } from "@/shared/eventTitle";
import { useBannerStretch } from "@/hooks/useBannerStretch";
import { useEffect, useState, useMemo, useCallback, useRef, type ReactNode } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView, useWindowDimensions, type StyleProp, type ViewStyle,
  StyleSheet, Platform, ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, cancelAnimation, runOnJS,
  FadeIn, FadeInDown, FadeInUp, SlideInDown, ZoomIn, Easing,
} from "react-native-reanimated";
import { handedOffTrip } from "@/services/joinHandoff";
import { Skeleton } from "@/components/Skeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { CachedImage } from "@/components/CachedImage";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Users, ShareNetwork, Check, CaretDown, CalendarBlank, Buildings, MagnifyingGlass,
  AirplaneTakeoff, AirplaneLanding, WarningCircle,
} from "phosphor-react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTrips } from "@/context/TripsContext";
import { T, R, S, SCROLL_BOTTOM_PAD, type ThemeColors } from "@/constants/theme";
import { fetchTripById, logTripJoin, fetchClaimedTravelerIds, patchTravelerEmail } from "@/services/firebaseTrips";
import { tripFactLine, shortDay, destinationFlag } from "@/shared/tripSummary";
import { usePreferences } from "@/context/PreferencesContext";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { OrganizerCard } from "@/components/OrganizerCard";
import { InfoDocsRow } from "@/components/InfoDocsRow";
import { Avatar } from "@/components/ui/Avatar";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { SegmentedControl } from "@/components/native/SegmentedControl";
import { Pill } from "@/components/ui/Pill";
import type { Trip } from "@/shared/types";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "@/services/haptics";

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

const DOT = 32;
const HERO_H = 380;

/**
 * The traveller picker's sheet: the system's frosted glass material over the trip photo. (GlassView drew nothing
 * inside this overlay.) A light hairline along the top edge marks where the sheet starts.
 */
function SheetSurface({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <BlurView intensity={60} tint={Platform.OS === "ios" ? "systemThickMaterialDark" : "dark"} style={[style, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.22)" }]}>
      {Platform.OS !== "ios" ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(28,28,32,0.6)" }]} /> : null}
      {children}
    </BlurView>
  );
}
const isPlaceholderTime = (t?: string) => !t || /^tb[acd]$/i.test(t);
const cleanTitle = (title: string) => tidyTitleSeparators(title.replace(/\s*\([A-Z]{3}\)\s*$/, ""));

export default function SharedTripScreen() {
  // ?join=1: they already chose "Join this trip" in onboarding, so join (and link their traveller) straight away
  // traveler: who the server matched them to by sign-in email (onboarding), so no picker is needed
  const { tripId, join, traveler } = useLocalSearchParams<{ tripId: string; join?: string; traveler?: string }>();
  const autoJoined = useRef(false);
  const linkedId = useLinkedTravelerId(tripId);
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();
  const { C: themeC, isDark: themeDark } = useTheme();
  // Like Home: the cover photo, blurred, carries down the whole page, so the photo palette in both themes
  const C = useMemo(() => photoPalette(themeC, themeDark), [themeC, themeDark]);
  const isDark = true;
  const { trips, addTrip } = useTrips();
  const { prefs } = usePreferences();
  const { user: authUser, isAnonymous } = useAuth();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { onScroll, stretchStyle, scrollY } = useBannerStretch(HERO_H);
  const joining = join === "1";
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  // Join hands over the trip it already has, so the joining screen draws on its first frame
  const [handoff] = useState(() => (joining ? handedOffTrip(tripId) : null));
  const [trip, setTrip] = useState<Trip | null>(handoff);
  const [loading, setLoading] = useState(!handoff);
  const [error, setError] = useState(false);
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  // "Which one is you?": a tap picks, the button confirms, so a stray tap can't claim someone else's plan
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const { height: screenH } = useWindowDimensions();

  const alreadyInMyTrips = useMemo(
    () => (tripId ? trips.some((t) => t.id === tripId) : false),
    [tripId, trips]
  );

  const [justAdded, setJustAdded] = useState(false);
  const addScale = useSharedValue(1);

  const addBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addScale.value }],
  }));

  // Joining can start from the first-run screens, which leave nothing underneath. Rebuild the stack as Home with
  // the trip on top, in one step, so Back goes Home instead of the trip being a dead end.
  // By path, not route names: SDK 58's router no longer handles a reset to "(tabs)" from here
  const openJoinedTrip = useCallback((id: string) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace("/(tabs)");
    router.push({ pathname: "/trip/[id]", params: { id, arrived: "1" } });
  }, [router]);

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
    setJustAdded(true);
    setShowLinkPicker(false);

    // Joining from onboarding, the arrival screen's button moves them on; elsewhere, straight to the trip
    if (!joining) setTimeout(() => openJoinedTrip(trip.id), 1200);
  }, [trip, addTrip, addScale, prefs, openJoinedTrip, joining, isAnonymous, authUser, toast]);

  const handleAddToMyTrips = useCallback(async () => {
    if (!trip || alreadyInMyTrips || justAdded) return;
    if ((trip.travelers?.length ?? 0) > 0) {
      const claimed = await fetchClaimedTravelerIds(trip.id);
      setClaimedIds(claimed);

      if (traveler && trip.travelers!.some(t => t.id === traveler) && !claimed.has(traveler)) {
        completeJoin(traveler);
        return;
      }

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
  }, [trip, alreadyInMyTrips, justAdded, completeJoin, isAnonymous, authUser, traveler]);

  useEffect(() => {
    if (!joining || !trip || autoJoined.current) return;
    autoJoined.current = true;
    if (alreadyInMyTrips) { openJoinedTrip(trip.id); return; }
    handleAddToMyTrips();
  }, [joining, trip, handleAddToMyTrips, alreadyInMyTrips, openJoinedTrip]);

  useEffect(() => {
    if (!tripId) return;
    // A handed-over trip is already on screen: refresh it quietly, and never swap it for an error mid-join
    if (!handoff) setLoading(true);
    fetchTripById(tripId)
      .then((t) => {
        if (t) setTrip(t);
        else if (!handoff) setError(true);
      })
      .catch(() => { if (!handoff) setError(true); })
      .finally(() => setLoading(false));
  }, [tripId, handoff]);

  // The arrival: the first thing on the trip that's still to come
  const firstPlan = useMemo(() => {
    if (!trip) return null;
    const today = new Date().toISOString().slice(0, 10);
    const dated = trip.events.filter(e => e.date).sort((a, b) => `${a.date} ${a.time || "99"}`.localeCompare(`${b.date} ${b.time || "99"}`));
    return dated.find(e => e.date >= today) ?? dated[0] ?? null;
  }, [trip]);

  // The arrival's button fills over a few seconds, then moves on by itself; a tap goes straight away
  const arriveProgress = useSharedValue(0);
  const leftArrival = useRef(false);
  const goToJoinedTrip = useCallback(() => {
    if (leftArrival.current || !trip) return;
    leftArrival.current = true;
    cancelAnimation(arriveProgress);
    openJoinedTrip(trip.id);
  }, [trip, openJoinedTrip, arriveProgress]);
  useEffect(() => {
    if (!joining || !justAdded) return;
    arriveProgress.set(withDelay(1100, withTiming(1, { duration: 4000, easing: Easing.linear }, done => {
      if (done) runOnJS(goToJoinedTrip)();
    })));
    return () => cancelAnimation(arriveProgress);
  }, [joining, justAdded, arriveProgress, goToJoinedTrip]);
  const arriveFill = useAnimatedStyle(() => ({ width: `${arriveProgress.value * 100}%` }));

  const joinFirst = (prefs.name || "").trim().split(/\s+/)[0];
  const joinFirstName = joinFirst ? joinFirst[0].toUpperCase() + joinFirst.slice(1) : "";

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
            symbol="exclamationmark.circle"
            icon={<WarningCircle size={30} color={C.textSecondary} weight="duotone" />}
            tone="neutral"
            title="Trip not found"
            message="This trip isn't available or hasn't been published yet."
            secondary={{ label: "Go back", onPress: () => router.canGoBack() ? router.back() : router.replace("/(tabs)") }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const flag = destinationFlag(trip.destination);

  // "Which traveller are you?": rises over the page when the server couldn't match them by email
  const renderLinkSheet = () => {
    if (!showLinkPicker || !trip.travelers?.length) return null;
    const q = nameQuery.trim().toLowerCase();
    const people = q ? trip.travelers.filter(t => t.name.toLowerCase().includes(q)) : trip.travelers;
    const picked = trip.travelers.find(t => t.id === pickedId) ?? null;
    return (
      <View style={styles.linkOverlay}>
        {/* Slides up from the bottom, as a sheet does */}
        <Animated.View entering={SlideInDown.duration(380).easing(Easing.out(Easing.cubic))}>
          {/* Liquid Glass over the trip's photo, holding the sheet itself; a frosted wash where glass isn't available */}
          <SheetSurface style={styles.linkSheet}>
          <View style={styles.linkGrabber} />
          <Text style={styles.linkTitle}>Which one is you?</Text>
          <Text style={styles.linkSub}>Pick your name so you see your own plan.</Text>

          {/* A long group gets a search box */}
          {trip.travelers.length > 9 ? (
            <View style={styles.linkSearch}>
              <MagnifyingGlass size={16} color={C.textTertiary} weight="bold" />
              <TextInput
                value={nameQuery}
                onChangeText={setNameQuery}
                placeholder="Find your name"
                placeholderTextColor={C.textTertiary}
                autoCorrect={false}
                style={styles.linkSearchInput}
                accessibilityLabel="Find your name"
              />
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: screenH * 0.48 }} contentContainerStyle={styles.linkGrid} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {people.map(t => {
              const taken = claimedIds.has(t.id);
              const on = t.id === pickedId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => { Haptics.selectionAsync(); setPickedId(on ? null : t.id); }}
                  disabled={taken}
                  accessibilityRole="button"
                  accessibilityLabel={taken ? `${t.name}, already taken` : t.name}
                  accessibilityState={{ disabled: taken, selected: on }}
                  style={({ pressed }) => [styles.linkPerson, taken && { opacity: 0.35 }, pressed && !taken && { opacity: 0.75 }]}
                >
                  <View style={[styles.linkFace, on && { borderColor: C.teal }]}>
                    <Avatar size={60} initials={t.initials || t.name.trim().charAt(0).toUpperCase()} />
                    {on ? (
                      <View style={[styles.linkTick, { backgroundColor: C.teal }]}>
                        <Check size={13} color={C.onAccent} weight="bold" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.linkName, on && { color: C.tealText }]} numberOfLines={2}>{t.name}</Text>
                  {taken ? <Text style={styles.linkTaken}>Taken</Text> : null}
                </Pressable>
              );
            })}
            {!people.length ? <Text style={[styles.linkSub, { textAlign: "center", width: "100%" }]}>No one by that name on this trip.</Text> : null}
          </ScrollView>

          <Pressable
            onPress={() => { if (picked) completeJoin(picked.id); }}
            disabled={!picked}
            accessibilityRole="button"
            style={({ pressed }) => [styles.linkConfirm, { backgroundColor: C.teal }, !picked && { opacity: 0.4 }, pressed && picked && { opacity: 0.9 }]}
          >
            <Text style={[styles.linkConfirmText, { color: C.onAccent }]}>
              {picked ? `That's me, ${picked.name.trim().split(/\s+/)[0]}` : "Pick your name"}
            </Text>
          </Pressable>
          <Pressable onPress={() => completeJoin()} accessibilityRole="button" style={({ pressed }) => [styles.linkSkip, pressed && { opacity: 0.7 }]}>
            <Text style={styles.linkSkipText}>I'm not listed</Text>
          </Pressable>
          </SheetSurface>
        </Animated.View>
      </View>
    );
  };

  // Joining from onboarding: they've already seen the trip, so just the photo while it joins (or asks who they are)
  if (joining) {
    return (
      <View style={styles.safe}>
        <PhotoBackdrop uri={trip.image} />
        {/* Join's card photo grew into exactly this spot, and the trip page's hero sits here too */}
        <View style={styles.joinHero} pointerEvents="none">
          <CachedImage uri={trip.image} transition={0} style={StyleSheet.absoluteFill} accessible={false} contentPosition={heroPosition(trip.imagePosition)} />
          <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]} locations={[0, 0.3]} style={StyleSheet.absoluteFill} />
          <PhotoDissolve uri={trip.image} />
        </View>
        <View style={[styles.joiningWrap, { paddingBottom: Math.max(insets.bottom, S.md) + S.xs }, showLinkPicker && { opacity: 0 }]}>
          <View style={styles.arriveHead}>
            {justAdded ? (
              <Animated.View entering={ZoomIn.duration(360).easing(Easing.out(Easing.cubic))} style={[styles.joinTick, { backgroundColor: C.teal }]}>
                <Check size={18} color={C.onAccent} weight="bold" />
              </Animated.View>
            ) : <ActivityIndicator size="small" color="#fff" style={styles.joinTick} />}
            <Animated.Text key={justAdded ? "in" : "joining"} entering={FadeIn.duration(280)} style={styles.joiningTitle} numberOfLines={1}>
              {justAdded ? (joinFirstName ? `You're in, ${joinFirstName}` : "You're in") : "Joining your trip…"}
            </Animated.Text>
          </View>
          <Text style={styles.joiningText} numberOfLines={2}>{trip.name}</Text>

          {/* The trip arrives a line at a time in one glass card: when, who, who's looking after them, what comes first */}
          {justAdded ? (
            <Animated.View entering={FadeInDown.delay(220).duration(420).easing(Easing.out(Easing.cubic))} style={styles.arriveCard}>
              <BlurView intensity={50} tint={Platform.OS === "ios" ? "systemMaterialDark" : "dark"} style={StyleSheet.absoluteFill} />
              <Animated.View entering={FadeIn.delay(320).duration(320)} style={styles.arriveRow}>
                <View style={styles.arriveIcon}><CalendarBlank size={18} color="#fff" weight="bold" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.arriveMain}>{shortDay(trip.start)} – {shortDay(trip.end)}</Text>
                  <Text style={styles.arriveSub}>{tripFactLine(trip)}</Text>
                </View>
              </Animated.View>
              {trip.travelers?.length ? (
                <Animated.View entering={FadeIn.delay(460).duration(320)} style={[styles.arriveRow, styles.arriveRowLine]}>
                  <View style={styles.arriveIcon}><Users size={18} color="#fff" weight="bold" /></View>
                  <Text style={[styles.arriveMain, { flex: 1 }]} numberOfLines={1}>
                    {trip.travelers.length === 1 ? "1 traveller" : `${trip.travelers.length} travellers`} going
                  </Text>
                  {/* Who, at a glance, trailing so every row's icon lines up */}
                  <View style={styles.arriveFaces}>
                    {trip.travelers.slice(0, 4).map((t, i) => (
                      <View key={t.id} style={{ marginLeft: i ? -8 : 0 }}>
                        <Avatar size={26} uri={t.avatar} initials={t.initials || t.name.trim().charAt(0).toUpperCase()} solid ringColor="rgba(30,30,34,1)" />
                      </View>
                    ))}
                  </View>
                </Animated.View>
              ) : null}
              {trip.organizer?.company || trip.organizer?.name ? (
                <Animated.View entering={FadeIn.delay(600).duration(320)} style={[styles.arriveRow, styles.arriveRowLine]}>
                  <View style={styles.arriveIcon}><Buildings size={18} color="#fff" weight="bold" /></View>
                  <Text style={[styles.arriveMain, { flex: 1 }]} numberOfLines={1}>Hosted by {trip.organizer?.company || trip.organizer?.name}</Text>
                </Animated.View>
              ) : null}
              {firstPlan ? (
                <Animated.View entering={FadeIn.delay(740).duration(320)} style={[styles.arriveRow, styles.arriveRowLine]}>
                  <CategoryDot palette={C} type={firstPlan.type} transferType={firstPlan.transferType} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.arriveSub}>
                      First up, {new Date(`${firstPlan.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      {firstPlan.time && /^\d/.test(firstPlan.time) ? ` at ${firstPlan.time}` : ""}
                    </Text>
                    <Text style={styles.arriveMain} numberOfLines={1}>{tidyTitleSeparators(firstPlan.title)}</Text>
                  </View>
                </Animated.View>
              ) : null}
            </Animated.View>
          ) : null}

          <View style={{ flex: 1 }} />
          {/* Fills up as a countdown and moves on by itself; tap to go now */}
          {justAdded ? (
            <Animated.View entering={FadeInUp.delay(900).duration(360).easing(Easing.out(Easing.cubic))}>
              <Pressable
                onPress={goToJoinedTrip}
                accessibilityRole="button"
                accessibilityLabel="See your trip"
                style={({ pressed }) => [styles.arriveGo, { backgroundColor: C.teal }, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <Animated.View style={[styles.arriveGoFill, arriveFill]} />
                <Text style={[styles.arriveGoText, { color: C.onAccent }]}>See your trip</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
        {renderLinkSheet()}
      </View>
    );
  }

  const hasTravelers = (trip.travelers?.length ?? 0) > 0;
  // Only worth choosing a name when some plans are for particular people
  const hasPersonalPlans = trip.events.some(e => (e.assignedTo?.length ?? 0) > 0);
  // Linked to their traveller: their own plan (unless they asked for everyone's); otherwise whoever they picked
  const me = linkedId ? trip.travelers?.find(t => t.id === linkedId) ?? null : null;
  const effectiveId = me && !showAll ? me.id : viewAsId;
  const viewAsTraveler = effectiveId ? trip.travelers?.find(t => t.id === effectiveId) ?? null : null;

  const filteredEvents = effectiveId
    ? trip.events.filter(e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(effectiveId))
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
    const url = `${process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app"}/shared/${trip.id}`;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { dialogTitle: trip.name });
      } else {
        await Clipboard.setStringAsync(url);
      }
    } catch { /* user cancelled */ }
  };

  return (
    // No bottom safe area here: the bottom bar adds it itself, so it sits on the home indicator, not above it
    <SafeAreaView style={styles.safe} edges={Platform.OS === "android" ? ["top"] : []}>
      <StatusBar style="light" />
      <PhotoBackdrop uri={trip.image} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Hero: photo that dissolves into the wash */}
        <View style={styles.hero}>
          <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, stretchStyle]}>
            <CachedImage uri={trip.image} style={StyleSheet.absoluteFill} accessible={false} contentPosition={heroPosition(trip.imagePosition)} />
            <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]} locations={[0, 0.3]} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <PhotoDissolve uri={trip.image} scrollY={scrollY} />


          </Animated.View>
          <IconCircleButton
            variant="glass" glassScheme="dark"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            accessibilityLabel="Go back"
            style={{ position: "absolute", left: S.md, top: insets.top + S.xs }}
          >
            <ArrowLeft size={18} color="#fff" weight="bold" />
          </IconCircleButton>

          <IconCircleButton
            variant="glass" glassScheme="dark"
            onPress={handleShare}
            accessibilityLabel="Share trip"
            style={{ position: "absolute", right: S.md, top: insets.top + S.xs }}
          >
            <ShareNetwork size={18} color="#fff" weight="bold" />
          </IconCircleButton>

          <View style={styles.heroContent}>
            {flag ? (
              <View style={styles.flagWrap} accessible={false}>
                <Text style={styles.flag}>{flag}</Text>
              </View>
            ) : null}
            {trip.destination ? <Text style={[styles.heroDest, styles.heroShadow]} numberOfLines={1}>{trip.destination}</Text> : null}
            <Text style={[styles.heroName, styles.heroShadow]} numberOfLines={2}>{trip.name}</Text>
            <Text style={[styles.heroFact, isDark && styles.heroShadow]} numberOfLines={1}>{tripFactLine(trip)}</Text>
            <Text style={[styles.heroDates, isDark && styles.heroShadow]}>{shortDay(trip.start)} → {shortDay(trip.end)}</Text>
          </View>
        </View>

        {/* Whose plan to show: iOS segmented tabs, or a native menu when there are too many names to fit */}
        {/* Linked: just say whose plan this is, with a way to see everyone's */}
        {me && hasPersonalPlans ? (
          <View style={[styles.pickerWrap, styles.mineRow]}>
            <Text style={styles.pickerSubtext}>
              {showAll ? `Showing everyone's plans` : `Showing your plan, ${me.name.split(" ")[0]}`}
            </Text>
            <Pressable onPress={() => { Haptics.selectionAsync(); setShowAll(v => !v); }} hitSlop={8} accessibilityRole="button">
              <Text style={styles.mineLink}>{showAll ? "Just mine" : "All plans"}</Text>
            </Pressable>
          </View>
        ) : null}
        {/* Not linked yet, and the choice matters: pick a name */}
        {!me && hasTravelers && hasPersonalPlans && (
          <View style={styles.pickerWrap}>
            <Text style={styles.viewLabel}>Show the plan for</Text>
            {trip.travelers!.length <= 3 ? (
              <SegmentedControl
                values={["Everyone", ...trip.travelers!.map(t => t.name.split(" ")[0])]}
                selectedIndex={viewAsId ? trip.travelers!.findIndex(t => t.id === viewAsId) + 1 : 0}
                onChange={(e) => {
                  Haptics.selectionAsync();
                  const i = e.nativeEvent.selectedSegmentIndex;
                  setViewAsId(i === 0 ? null : trip.travelers![i - 1].id);
                }}
                appearance="dark"
                style={styles.segments}
              />
            ) : (
              <Pressable
                onPress={() => setPickerOpen(!pickerOpen)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.7 }]}
              >
                {viewAsTraveler ? <Avatar size={28} solid initials={viewAsTraveler.initials} /> : <Users size={18} color="#fff" weight="regular" />}
                <Text style={styles.pickerName} numberOfLines={1}>{viewAsTraveler ? viewAsTraveler.name : "Everyone"}</Text>
                <CaretDown size={16} color={C.textSecondary} weight="bold" style={{ transform: [{ rotate: pickerOpen ? "180deg" : "0deg" }] }} />
              </Pressable>
            )}
            {pickerOpen && trip.travelers!.length > 3 && (
              <View style={styles.pickerDropdown}>
                {[{ id: null as string | null, name: "Everyone", initials: "" }, ...trip.travelers!].map(t => (
                  <Pressable
                    key={t.id ?? "all"}
                    onPress={() => { Haptics.selectionAsync(); setViewAsId(t.id); setPickerOpen(false); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: viewAsId === t.id }}
                    style={({ pressed }) => [styles.pickerOption, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.pickerOptionName}>{t.name}</Text>
                    {viewAsId === t.id ? <Check size={16} color={C.tealText} weight="bold" /> : null}
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.pickerSubtext}>
              {viewAsTraveler
                ? `${filteredEvents.length} of ${trip.events.length} plans are for ${viewAsTraveler.name.split(" ")[0]}`
                : `All ${trip.events.length} plans on the trip`}
            </Text>
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
            <MicroLabel color={C.textPrimary}>Itinerary</MicroLabel>
          </View>

          {(() => {
            const sortedDays = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
            const _now = new Date();
            const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
            return sortedDays.map(([date, events]) => {
              const d = new Date(date + "T12:00:00");
              const isToday = date === todayStr;
              return (
                <View key={date} style={styles.dayBlock}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayHeaderText}>
                      {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </Text>
                    {isToday && <Pill tone="accent" size="sm" label="Today" />}
                    <View style={{ flex: 1 }} />
                    <Text style={styles.dayHeaderMeta}>{`${events.length} event${events.length === 1 ? "" : "s"}`}</Text>
                  </View>

                  <View style={styles.dayCard}>
                    <View style={styles.tlLine} pointerEvents="none" />
                    {events.map((ev, i) => (
                      <View key={ev.id}>
                        {i > 0 && <View style={styles.tlSep} />}
                        <View
                          style={styles.tlRow}
                          accessible
                          accessibilityLabel={`${cleanTitle(ev.title)}${isPlaceholderTime(ev.time) ? "" : `, ${ev.time}`}`}
                        >
                          <CategoryDot type={ev.type} transferType={ev.transferType} size={DOT} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tlTitle} numberOfLines={2}>{cleanTitle(ev.title)}</Text>
                            {ev.type === "flight" && (ev.airline || ev.flightNum) ? (
                              <Text style={styles.tlSub} numberOfLines={1}>{[ev.airline, ev.flightNum].filter(Boolean).join(" ")}</Text>
                            ) : ev.location ? (
                              <Text style={styles.tlSub} numberOfLines={1}>{tidyLocation(ev.location)}</Text>
                            ) : null}
                          </View>
                          {ev.time ? (
                            <Text style={[styles.tlTime, isPlaceholderTime(ev.time) && { color: C.textTertiary }]}>{isPlaceholderTime(ev.time) ? "TBC" : ev.time}</Text>
                          ) : null}
                        </View>

                        {ev.type === "flight" && (ev.depAirport || ev.arrAirport) ? (
                          <View style={styles.legs}>
                            <View style={styles.leg}>
                              <AirplaneTakeoff size={13} color={C.textTertiary} weight="regular" />
                              <Text style={styles.legText} numberOfLines={1}>
                                {[ev.depAirport, ev.terminal ? `Terminal ${ev.terminal}` : null].filter(Boolean).join(", ")}
                              </Text>
                              {!isPlaceholderTime(ev.time) && <Text style={styles.legTime}>{ev.time}</Text>}
                            </View>
                            <View style={styles.leg}>
                              <AirplaneLanding size={13} color={C.textTertiary} weight="regular" />
                              <Text style={styles.legText} numberOfLines={1}>
                                {[ev.arrAirport, ev.arrTerminal ? `Terminal ${ev.arrTerminal}` : null].filter(Boolean).join(", ")}
                              </Text>
                              {!isPlaceholderTime(ev.endTime) && <Text style={styles.legTime}>{ev.endTime}</Text>}
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              );
            });
          })()}
        </View>
      </Animated.ScrollView>

      {/* Content fades out under the clock instead of running into it */}
      <LinearGradient
        colors={["rgba(8,8,10,0.9)", "rgba(8,8,10,0.6)", "rgba(8,8,10,0)"]}
        locations={[0, 0.55, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + 28 }}
        pointerEvents="none"
      />

      {renderLinkSheet()}

      {/* Bottom bar: join, or open it once it's in their trips */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + S.sm }]}>
        {/* No bar and no edge: the page darkens gradually towards the bottom, so the button sits on it */}
        <LinearGradient
          colors={["rgba(12,11,10,0)", "rgba(12,11,10,0.7)", "rgba(12,11,10,0.92)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {!alreadyInMyTrips && !justAdded ? (
          <Animated.View style={addBtnStyle}>
            <Pressable
              onPress={handleAddToMyTrips} accessibilityRole="button" accessibilityLabel="Join this trip"
              style={({ pressed }) => [styles.addCta, { backgroundColor: C.teal, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
            >
              <Text style={[styles.addCtaText, { color: C.onAccent }]}>Join this trip</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Pressable
            onPress={() => router.replace(`/trip/${trip.id}`)} accessibilityRole="button" accessibilityLabel="Open this trip"
            style={({ pressed }) => [styles.addCta, { backgroundColor: C.teal, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
          >
            <Text style={[styles.addCtaText, { color: C.onAccent }]}>Open trip</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#000" },
    joinHero: { position: "absolute", top: 0, left: 0, right: 0, height: HERO_H },
    // Starts where the hero melts into the blur, as the trip page's title does
    joiningWrap: { flex: 1, paddingTop: HERO_H - 64, paddingHorizontal: S.lg, gap: 2 },
    arriveCard: {
      marginTop: S.lg, borderRadius: R.xl, overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.14)",
    },
    arriveRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)" },
    arriveGo: { height: 54, borderRadius: R.xl, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    // A lighter sweep across the button as the seconds run down
    arriveGoFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.28)" },
    arriveGoText: { fontSize: T.md, fontWeight: T.bold },
    arriveHead: { flexDirection: "row", alignItems: "center", gap: S.sm },
    joinTick: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    joiningTitle: { flex: 1, fontSize: 28, lineHeight: 33, fontWeight: T.bold, color: "#fff", letterSpacing: -0.4 },
    joiningText: { fontSize: T.md, fontWeight: T.semibold, color: "rgba(255,255,255,0.82)", marginLeft: 30 + S.sm },
    arriveRow: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md, paddingVertical: S.sm2, minHeight: 62 },
    arriveIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
    arriveFaces: { flexDirection: "row" },
    arriveMain: { fontSize: T.md, fontWeight: T.semibold, color: "#fff" },
    arriveSub: { fontSize: T.sm, color: "rgba(255,255,255,0.78)", marginTop: 1 },
    linkName: { fontSize: T.sm, fontWeight: T.semibold, color: "#fff", textAlign: "center" },
    scroll: { paddingBottom: SCROLL_BOTTOM_PAD + 40 },
    addCta: {
      height: 52, borderRadius: R.xl,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs,
    },
    addCtaText: {
      fontSize: T.md, fontWeight: T.bold,
    },

    hero: { height: HERO_H, justifyContent: "flex-end" },
    heroContent: { paddingHorizontal: S.lg, paddingBottom: S.sm, gap: 3, alignItems: "center" },
    heroShadow: {
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    },
    heroDest: {
      fontSize: T.sm, fontWeight: T.bold, color: "rgba(255,255,255,0.9)",
      textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center",
    },
    heroName: {
      fontSize: 30, lineHeight: 34, fontWeight: T.bold, color: "#fff", letterSpacing: -0.4, textAlign: "center",
    },
    heroFact: { fontSize: T.base, fontWeight: T.semibold, color: isDark ? "rgba(255,255,255,0.92)" : C.textPrimary, marginTop: 2, textAlign: "center" },
    heroDates: { fontSize: T.sm, color: isDark ? "rgba(255,255,255,0.72)" : C.textPrimary, textAlign: "center" },
    flagWrap: {
      width: 44, height: 44, borderRadius: 22, marginBottom: S.xs,
      backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
    },
    flag: { fontSize: 24, lineHeight: 30 },

    sectionHeader: {
      paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm,
    },

    section: { paddingBottom: S.md },
    dayBlock: { marginTop: S.sm },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingHorizontal: S.md + S.xs, paddingBottom: S.xs },
    dayHeaderText: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    dayHeaderMeta: { fontSize: T.sm, color: C.textTertiary },
    dayCard: {
      marginHorizontal: S.md, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: R.lg, overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.14)",
    },
    tlLine: {
      position: "absolute", left: S.md + DOT / 2 - 1, top: S.sm + DOT / 2, bottom: S.sm + DOT / 2, width: 2,
      backgroundColor: C.border,
    },
    tlRow: { flexDirection: "row", alignItems: "center", gap: S.sm2, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 56 },
    tlSep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: S.md + DOT + S.sm2 },
    tlTitle: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    tlSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 1 },
    tlTime: { fontSize: T.sm, fontWeight: T.medium, color: C.tealText, fontVariant: ["tabular-nums"] },
    legs: { paddingLeft: S.md + DOT + S.sm2, paddingRight: S.md, paddingBottom: S.sm, gap: S.xs2 },
    leg: { flexDirection: "row", alignItems: "center", gap: S.xs },
    legText: { flex: 1, fontSize: T.sm, color: C.textSecondary },
    legTime: { fontSize: T.sm, color: C.textTertiary, fontVariant: ["tabular-nums"] },

    // Whose plan to show
    pickerWrap: { paddingHorizontal: S.md, paddingTop: S.lg, gap: S.sm },
    viewLabel: { fontSize: T.base, fontWeight: T.semibold, color: "#fff" },
    segments: { height: 36 },
    pickerBtn: {
      flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 48,
      paddingHorizontal: S.md, borderRadius: R.lg,
      backgroundColor: "rgba(255,255,255,0.1)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.16)",
    },
    pickerName: { flex: 1, fontSize: T.md, fontWeight: T.semibold, color: "#fff" },
    pickerDropdown: {
      borderRadius: R.lg, overflow: "hidden",
      backgroundColor: "rgba(28,28,32,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    },
    pickerOption: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, minHeight: 48 },
    pickerOptionName: { flex: 1, fontSize: T.md, color: "#fff" },
    pickerSubtext: { fontSize: T.sm, color: C.textSecondary },
    mineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    mineLink: { fontSize: T.sm, fontWeight: T.semibold, color: C.tealText },

    // Expanded inline events
    linkOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.2)",
      justifyContent: "flex-end",
      zIndex: 10,
    },
    linkSheet: {
      overflow: "hidden",
      borderTopLeftRadius: R["2xl"], borderTopRightRadius: R["2xl"],
      paddingHorizontal: S.lg, paddingTop: S.xs, paddingBottom: S.xl,
    },
    // The iOS sheet handle
    linkGrabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: S.md },
    linkTitle: {
      fontSize: T["2xl"], fontWeight: T.bold, color: "#fff",
      marginBottom: S["2xs"], letterSpacing: -0.3, textAlign: "center",
    },
    linkSub: {
      fontSize: T.sm, color: C.textSecondary, marginBottom: S.lg, textAlign: "center",
    },
    linkSearch: {
      flexDirection: "row", alignItems: "center", gap: S.xs, height: 40, paddingHorizontal: S.sm,
      borderRadius: R.lg, backgroundColor: "rgba(255,255,255,0.08)", marginBottom: S.md,
    },
    linkSearchInput: { flex: 1, fontSize: T.md, color: "#fff" },
    linkGrid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: S.sm },
    linkPerson: { width: "33.333%", alignItems: "center", gap: S.xs, paddingVertical: S.sm, paddingHorizontal: S["2xs"] },
    // A ring that lights teal when picked; transparent otherwise so nothing shifts
    linkFace: { padding: 3, borderRadius: 36, borderWidth: 2.5, borderColor: "transparent" },
    linkTick: {
      position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12,
      alignItems: "center", justifyContent: "center",
    },
    linkTaken: { fontSize: T["2xs"], color: C.textTertiary, marginTop: -4 },
    linkConfirm: { height: 52, borderRadius: R.xl, alignItems: "center", justifyContent: "center", marginTop: S.md },
    linkConfirmText: { fontSize: T.md, fontWeight: T.bold },
    linkSkip: {
      alignItems: "center", paddingVertical: S.md, marginTop: S.xs,
    },
    linkSkipText: {
      fontSize: T.sm, fontWeight: T.medium as any, color: C.textTertiary,
    },

    // Sticky bottom bar
    stickyBar: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: S.md, paddingTop: S["2xl"] + S.md,
    },
  });
}
