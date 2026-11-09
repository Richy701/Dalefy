import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useKeepAwake } from "expo-keep-awake";
import Animated, {
  Easing, FadeIn, FadeOut, cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withSequence, withTiming, type SharedValue,
} from "react-native-reanimated";
import { X } from "phosphor-react-native";
import type { ImageLoadEventData } from "expo-image";
import { CachedImage } from "@/components/CachedImage";
import { Avatar } from "@/components/ui/Avatar";
import { useTrips } from "@/context/TripsContext";
import { T } from "@/constants/theme";
import * as Haptics from "@/services/haptics";
import { buildSlides, storiesFlag, storiesTitle } from "@/services/tripSlideshow";
import { loadHiddenPhotos } from "@/services/hiddenPhotos";
import type { TripMedia } from "@/shared/types";

const SLIDE_MS = 5200;
const FADE_MS = 1400;
const ZOOM_MS = 9000;
const ZOOM_TO = 1.08;
const BACKDROP_BLUR = 70;
/** Just enough to hide the blur's soft edges */
const BACKDROP_SCALE = 1.12;
const BACKDROP_SHADE = "rgba(8,8,10,0.5)";
/** A photo that won't load shouldn't stop the show */
const LOAD_WAIT_MS = 5000;
const easing = Easing.inOut(Easing.quad);

type Role = "previous" | "current" | "next";
const LAYER_ORDER: Record<Role, number> = { next: 0, previous: 1, current: 2 };

/**
 * One photo. Each keeps its own fade, and the next one is already loading underneath.
 * Portrait photos fill the screen. Landscape and square ones would lose most of their width that way, so they
 * show whole over a blurred copy of themselves, and only that copy zooms.
 */
function PhotoLayer({ photo, role, visible, onLoaded, instant, zoom, widePhotos }: {
  photo: TripMedia; role: Role; visible: boolean; onLoaded: (id: string) => void; instant: boolean;
  zoom: SharedValue<number>; widePhotos: Set<string>;
}) {
  const [wide, setWide] = useState(() => widePhotos.has(photo.id));
  const handlePhotoLoad = (event: ImageLoadEventData) => {
    if (event.source.width < event.source.height) {
      onLoaded(photo.id);
      return;
    }
    // Not ready to show yet: the blurred copy behind it reports in when it arrives
    widePhotos.add(photo.id);
    setWide(true);
  };
  const photoZoom = useAnimatedStyle(() => ({ transform: [{ scale: wide ? 1 : zoom.value }] }));
  const backdropZoom = useAnimatedStyle(() => ({ transform: [{ scale: BACKDROP_SCALE * zoom.value }] }));
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (role === "next") opacity.value = 0;
    else if (role === "current" && visible) opacity.value = instant ? 1 : withTiming(1, { duration: FADE_MS, easing });
  }, [role, visible, instant, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: LAYER_ORDER[role] }, style]}>
      {wide ? (
        <Animated.View style={[StyleSheet.absoluteFill, backdropZoom]}>
          <CachedImage uri={photo.url} style={StyleSheet.absoluteFill} blurRadius={BACKDROP_BLUR} transition={0} accessible={false} enforceEarlyResizing onLoad={() => onLoaded(photo.id)} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP_SHADE }]} />
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, photoZoom]}>
        <CachedImage uri={photo.url} style={StyleSheet.absoluteFill} contentFit={wide ? "contain" : "cover"} transition={0} accessible={false} enforceEarlyResizing onLoad={handlePhotoLoad} />
      </Animated.View>
    </Animated.View>
  );
}

/** One day on the progress bar, filling across all of that day's photos */
function DaySegment({ group, currentGroup, position, size, progress }: {
  group: number; currentGroup: number; position: number; size: number; progress: SharedValue<number>;
}) {
  const fill = useAnimatedStyle(() => {
    const done = group < currentGroup ? 1 : group > currentGroup ? 0 : (position + progress.value) / size;
    return { width: `${done * 100}%` };
  });
  return (
    <View style={s.segment}>
      <Animated.View style={[s.segmentFill, fill]} />
    </View>
  );
}

export default function TripSlideshowScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  useKeepAwake();

  const trip = trips.find(t => t.id === tripId);
  // Nothing plays until this arrives, so a photo this person reported can't appear first
  const [hidden, setHidden] = useState<Set<string> | null>(null);
  useEffect(() => {
    void loadHiddenPhotos().then(setHidden);
  }, []);
  const slides = useMemo(() => (trip && hidden ? buildSlides(trip, hidden) : []), [trip, hidden]);
  const total = slides.length;
  const dayCount = total ? slides[total - 1].group + 1 : 0;

  // step only ever counts up, so the show loops without a photo being mistaken for its earlier self
  const [step, setStep] = useState(0);
  const [startedStep, setStartedStep] = useState(-1);
  const [paused, setPaused] = useState(false);
  // Tapping cuts straight to the photo; only the show's own timing cross-fades
  const [tapped, setTapped] = useState(false);
  // Going back on the very first photo starts it over
  const [restarts, setRestarts] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  const index = total ? step % total : 0;
  const slide = slides[index];
  const started = startedStep === step;
  const running = !paused && foreground;

  const progress = useSharedValue(0);
  const zoom = useSharedValue(1);
  const loaded = useRef(new Set<string>());
  // Remembered so a photo coming back round is the right shape from its first frame
  const [widePhotos] = useState(() => new Set<string>());
  const waitingFor = useRef<{ id: string; step: number } | null>(null);

  const advance = useCallback(() => { setTapped(false); setStep(n => n + 1); }, []);

  const onLoaded = useCallback((id: string) => {
    loaded.current.add(id);
    if (waitingFor.current?.id === id) {
      setStartedStep(waitingFor.current.step);
      waitingFor.current = null;
    }
  }, []);

  // Hold on the previous photo until this one has arrived, so nobody watches a blank screen on hotel wifi
  const photoId = slide?.photo.id;
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (!photoId) return;
    if (loaded.current.has(photoId)) {
      setStartedStep(step);
      return;
    }
    waitingFor.current = { id: photoId, step };
    const timer = setTimeout(() => {
      waitingFor.current = null;
      setStartedStep(step);
    }, LOAD_WAIT_MS);
    return () => clearTimeout(timer);
  }, [step, restarts, photoId, progress]);

  useEffect(() => {
    if (!started || !running || total < 2) return;
    progress.value = withTiming(1, { duration: SLIDE_MS * (1 - progress.value), easing: Easing.linear }, finished => {
      if (finished) runOnJS(advance)();
    });
    return () => cancelAnimation(progress);
  }, [started, running, step, restarts, total, progress, advance]);

  useEffect(() => {
    if (!running || reduceMotion) return;
    const remaining = Math.max(1, ZOOM_MS * ((ZOOM_TO - zoom.value) / (ZOOM_TO - 1)));
    zoom.value = withSequence(
      withTiming(ZOOM_TO, { duration: remaining, easing }),
      withRepeat(withTiming(1, { duration: ZOOM_MS, easing }), -1, true),
    );
    return () => cancelAnimation(zoom);
  }, [running, reduceMotion, zoom]);

  // Reached by a link with too little to show: nothing to play
  const nothingToPlay = !trip || total < 3;
  useEffect(() => {
    if (hidden && nothingToPlay && router.canGoBack()) router.back();
  }, [hidden, nothingToPlay, router]);
  if (nothingToPlay) return <View style={s.root} />;

  const layers: { photo: TripMedia; role: Role }[] = [
    { photo: slides[(index + 1) % total].photo, role: "next" },
    ...(step > 0 ? [{ photo: slides[(index + total - 1) % total].photo, role: "previous" as const }] : []),
    { photo: slide.photo, role: "current" },
  ];

  const flag = storiesFlag(trip);
  const days = Array.from({ length: dayCount }, (_, group) => group);
  const name = slide.photo.uploadedBy?.trim();
  const avatar = slide.photo.uploaderAvatar ?? trip.travelers?.find(t => t.name === slide.photo.uploadedBy && !!t.avatar)?.avatar;

  const goNext = () => { Haptics.selectionAsync(); setTapped(true); setStep(n => n + 1); };
  const goBack = () => {
    Haptics.selectionAsync();
    setTapped(true);
    if (step === 0) setRestarts(n => n + 1);
    else setStep(n => n - 1);
  };
  const hold = () => setPaused(true);
  const release = () => setPaused(false);
  // Opened from a link there may be nothing behind this screen to go back to
  const close = () => {
    Haptics.selectionAsync();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/media");
  };

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill}>
        {layers.map(({ photo, role }) => (
          <PhotoLayer key={photo.id} photo={photo} role={role} visible={started} onLoaded={onLoaded} instant={tapped || reduceMotion} zoom={zoom} widePhotos={widePhotos} />
        ))}
      </View>

      <LinearGradient colors={["rgba(6,6,8,0.72)", "rgba(6,6,8,0.5)", "rgba(6,6,8,0)"]} locations={[0, 0.7, 1]} style={[s.scrim, { top: 0, height: insets.top + 120 }]} pointerEvents="none" />
      <LinearGradient colors={["rgba(6,6,8,0)", "rgba(6,6,8,0.78)"]} style={[s.scrim, { bottom: 0, height: insets.bottom + 300 }]} pointerEvents="none" />

      <View style={s.tapZones}>
        <Pressable style={s.tapBack} onPress={goBack} onLongPress={hold} onPressOut={release} delayLongPress={200} accessibilityRole="button" accessibilityLabel="Previous photo" />
        <Pressable style={s.tapNext} onPress={goNext} onLongPress={hold} onPressOut={release} delayLongPress={200} accessibilityRole="button" accessibilityLabel="Next photo" />
      </View>

      <View style={[s.segments, { top: insets.top + 8 }]} pointerEvents="none">
        {days.map(group => (
          <DaySegment key={group} group={group} currentGroup={slide.group} position={slide.positionInGroup} size={slide.groupSize} progress={progress} />
        ))}
      </View>

      <View style={[s.header, { top: insets.top + 16 }]} pointerEvents="box-none">
        <View style={s.titleRow}>
          {flag ? <Text style={s.flag} accessible={false}>{flag}</Text> : null}
          <Text style={s.tripName} numberOfLines={1}>{storiesTitle(trip)}</Text>
        </View>
        <Pressable onPress={close} hitSlop={4} style={({ pressed }) => [s.close, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Close stories">
          <X size={20} color="#fff" weight="bold" />
        </Pressable>
      </View>

      {started ? (
        <Animated.View key={step} entering={FadeIn.duration(500)} exiting={FadeOut.duration(500)} style={[s.caption, { bottom: Math.max(insets.bottom + 18, 28) }]} pointerEvents="none">
          <Text style={s.heading}>{slide.heading}</Text>
          {slide.detail ? <Text style={s.detail} numberOfLines={2}>{slide.detail}</Text> : null}
          {name ? (
            <View style={s.credit}>
              <Avatar size={28} uri={avatar} initials={name.charAt(0).toUpperCase()} />
              <Text style={s.creditName} numberOfLines={1}>{name}'s photo</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0E0E10", overflow: "hidden" },
  scrim: { position: "absolute", left: 0, right: 0, zIndex: 3 },
  tapZones: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 5 },
  tapBack: { flex: 1 },
  tapNext: { flex: 2 },
  segments: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 4, zIndex: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.32)" },
  segmentFill: { height: "100%", backgroundColor: "#fff" },
  header: { position: "absolute", left: 16, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 6 },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  flag: { fontSize: 22, lineHeight: 26 },
  tripName: { flexShrink: 1, fontSize: T.md, fontWeight: T.bold, color: "#fff" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  caption: { position: "absolute", left: 20, right: 20, zIndex: 6 },
  heading: { fontSize: T["5xl"], fontWeight: T.bold, letterSpacing: -0.5, color: "#fff" },
  detail: { marginTop: 2, fontSize: T.lg, fontWeight: T.medium, color: "#fff" },
  credit: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  creditName: { flexShrink: 1, fontSize: T.base, color: "#fff" },
});
