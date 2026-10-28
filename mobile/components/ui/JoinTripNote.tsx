import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Keyboard } from "react-native";
import type { TextInputInstance } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { PinCell, PIN_LEN, PIN_W } from "@/components/ui/PinCell";
import { fetchTripByShortCode } from "@/services/firebaseTrips";
import { Image } from "expo-image";
import { CoverFade } from "@/components/ui/CoverFade";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "@/services/haptics";
import { CalendarBlank, CaretDown, CaretRight, ClipboardText, Images, Plus, WifiSlash } from "phosphor-react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { R, S, T, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { ListSkeleton } from "@/components/Skeleton";
import { openJoinSheet } from "@/services/openJoin";
import { ScreenTitle } from "@/components/ui/CollapsingHeader";
import { SampleDayPreview, PhotoDriftPreview } from "@/components/ui/EmptyPreviews";
import { IconCircleButton } from "@/components/ui/IconCircleButton";

/** A fresh route parameter reopens Home's existing join sheet after dismissal. */
function useOpenJoin() {
  return () => {
    void Haptics.selectionAsync();
    openJoinSheet();
  };
}

function JoinLink() {
  const { C } = useTheme();
  const openJoin = useOpenJoin();
  return (
    <Pressable
      onPress={openJoin}
      accessibilityRole="button"
      style={({ pressed }) => [styles.textAction, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.actionText, { color: C.tealText }]}>Join a trip</Text>
      <CaretRight size={15} color={C.tealText} />
    </Pressable>
  );
}

/** Compact guidance for the secondary Schedule screen. */
export function JoinTripNote({ message }: { message: string }) {
  const { C } = useTheme();
  return (
    <View style={{ paddingHorizontal: S.md, paddingTop: S.md }}>
      <Text style={[styles.body, { color: C.textSecondary }]}>{message}</Text>
      <JoinLink />
    </View>
  );
}

type RecoveryProps = {
  offline: boolean;
  onRetry: () => void;
  retrying: boolean;
};

const EMPTY_PIN = "";
const INVITE_LINK = /shared\/([A-Za-z0-9_-]+)/;

/** Home before joining: a holiday photo, then the PIN boxes right there, so joining is one step. */
export function NoTripsHero({ greeting, offline, onRetry, retrying }: RecoveryProps & {
  greeting: string;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [pin, setPin] = useState(EMPTY_PIN);
  const [resolving, setResolving] = useState(false);
  const [lit, setLit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInputInstance | null>(null);
  const pinStyles = useMemo(() => makePinStyles(C), [C]);

  // The photo steps back while typing so the boxes and button stay above the keyboard
  const photoH = useSharedValue(insets.top + 300);
  useEffect(() => {
    photoH.set(withTiming(insets.top + (focused ? 96 : 300), { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [focused, insets.top, photoH]);
  const photoStyle = useAnimatedStyle(() => ({ height: photoH.value }));

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const shake = () => {
    shakeX.set(withSequence(
      withTiming(-6, { duration: 50 }), withTiming(6, { duration: 50 }),
      withTiming(-4, { duration: 50 }), withTiming(4, { duration: 50 }), withTiming(0, { duration: 50 }),
    ));
  };

  const openTrip = (id: string) => {
    Keyboard.dismiss();
    router.push(`/shared/${id}`);
  };

  const submit = async (code = pin) => {
    if (resolving || code.length !== PIN_LEN) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResolving(true);
    setError(null);
    try {
      const trip = await fetchTripByShortCode(code);
      if (!trip) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError("That PIN doesn't match any trip. Check with your organiser.");
        shake();
        setPin(EMPTY_PIN);
        inputRef.current?.focus();
        return;
      }
      // Found: light the boxes, then show the trip with its Join button
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Keyboard.dismiss();
      setLit(true);
      setTimeout(() => {
        router.push(`/shared/${trip.id}`);
        setLit(false);
        setPin(EMPTY_PIN);
      }, 480);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
      setError((err instanceof Error && err.message) || "Couldn't reach the server. Try again.");
    } finally {
      setResolving(false);
    }
  };

  const onChange = (val: string) => {
    // Pasting a whole invite link into the boxes works too
    const linkId = val.match(INVITE_LINK)?.[1];
    if (linkId) { setPin(EMPTY_PIN); openTrip(linkId); return; }
    const clean = val.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, PIN_LEN);
    if (clean.length > pin.length) Haptics.selectionAsync();
    setPin(clean);
    if (error) setError(null);
  };

  const paste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const linkId = text.match(INVITE_LINK)?.[1];
      if (linkId) { openTrip(linkId); return; }
      const clean = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, PIN_LEN);
      if (clean.length === PIN_LEN) { setPin(clean); submit(clean); return; }
      setError("There's no invite link or PIN to paste. Copy it from your organiser's message first.");
    } catch {
      setError("Couldn't read what you copied. Type the PIN instead.");
    }
  };

  const complete = pin.length === PIN_LEN;
  const busy = resolving || lit;

  return (
    <View>
      <Animated.View style={[{ opacity: offline ? 0.28 : 1 }, photoStyle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image
          source={require("@/assets/images/tour/hero-3.jpg")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ top: "68%", left: "50%" }}
          transition={0}
          accessibilityIgnoresInvertColors
        />
        <CoverFade />
      </Animated.View>
      <View style={styles.welcome}>
        <Text style={[styles.eyebrow, { color: C.textSecondary }]}>{offline ? "Connection unavailable" : greeting}</Text>
        <Text accessibilityRole="header" style={[styles.homeTitle, { color: C.textPrimary }]}>{offline ? "You’re offline" : "Your trip, all in one place."}</Text>
        {offline ? (
          <>
            <Text style={[styles.body, styles.homeBody, { color: C.textSecondary }]}>
              Connect to the internet to load your trips. Any trips saved on this phone will be available offline.
            </Text>
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              accessibilityRole="button"
              accessibilityState={{ disabled: retrying, busy: retrying }}
              style={({ pressed }) => [styles.primary, { backgroundColor: C.teal, opacity: pressed || retrying ? 0.7 : 1 }]}
            >
              <Text style={[styles.actionText, styles.homeActionText, { color: C.onAccent }]}>{retrying ? "Connecting…" : "Try again"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: C.textSecondary }]}>Enter the 6-character PIN from your organiser.</Text>
            <Animated.View style={[pinStyles.boxes, shakeStyle]}>
              {Array.from({ length: PIN_LEN }).map((_, i) => (
                <PinCell
                  key={i}
                  index={i}
                  ch={pin[i] ?? ""}
                  active={focused && !busy && i === Math.min(pin.length, PIN_LEN - 1) && !complete}
                  resolving={resolving}
                  lit={lit}
                  C={C}
                  styles={pinStyles}
                  onPress={() => inputRef.current?.focus()}
                />
              ))}
              <TextInput
                ref={inputRef}
                value={pin}
                onChangeText={onChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="default"
                autoCapitalize="characters"
                autoCorrect={false}
                textContentType="oneTimeCode"
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => submit()}
                accessibilityLabel="Trip PIN"
                caretHidden
                style={pinStyles.hiddenInput}
              />
            </Animated.View>
            {error ? <Text accessibilityLiveRegion="polite" style={[styles.helpText, styles.error, { color: C.redText }]}>{error}</Text> : null}
            <Pressable
              onPress={() => submit()}
              disabled={!complete || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !complete || busy, busy: resolving }}
              style={({ pressed }) => [styles.primary, { backgroundColor: complete ? C.teal : C.fieldFill, opacity: pressed || busy ? 0.7 : 1 }]}
            >
              <Text style={[styles.actionText, styles.homeActionText, { color: complete ? C.onAccent : C.textSecondary }]}>{resolving ? "Finding your trip…" : "Join trip"}</Text>
            </Pressable>
            <Pressable
              onPress={paste}
              accessibilityRole="button"
              style={({ pressed }) => [styles.helpAction, { opacity: pressed ? 0.6 : 1 }]}
            >
              <ClipboardText size={16} color={C.tealText} weight="bold" />
              <Text style={[styles.helpText, styles.homeHelpText, { color: C.tealText, fontWeight: T.semibold }]}>Paste invite link instead</Text>
            </Pressable>
            <Pressable
              onPress={() => setHelpOpen(open => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: helpOpen }}
              style={({ pressed }) => [styles.helpAction, styles.helpTight, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.helpText, styles.homeHelpText, { color: C.textSecondary }]}>Where do I find my PIN?</Text>
              {helpOpen ? <CaretDown size={14} color={C.textSecondary} /> : <CaretRight size={14} color={C.textSecondary} />}
            </Pressable>
            {helpOpen && (
              <Text style={[styles.helpText, styles.homeHelpText, styles.helpBody, { color: C.textSecondary }]}>
                It’s in the invite from your organiser, by email or message, next to the trip link. If you haven’t had one, ask them to send your invitation.
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function makePinStyles(C: ThemeColors) {
  return StyleSheet.create({
    boxes: { flexDirection: "row", justifyContent: "center", gap: S.xs, marginTop: S.lg },
    pinCell: {
      width: PIN_W, height: Math.round(PIN_W * 1.25), borderRadius: R.lg,
      borderWidth: 1.5, alignItems: "center", justifyContent: "center",
    },
    pinCellText: { fontSize: T["3xl"], fontWeight: T.bold, color: C.textPrimary, fontVariant: ["tabular-nums"] },
    pinCaret: { width: 2, height: Math.round(PIN_W * 0.5), borderRadius: 1, backgroundColor: C.teal },
    hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  });
}

/** Today and Gallery keep their own page structure, including unavailable-data states. */
export function NoTripsPage({ screen, ready, offline, onRetry, retrying }: RecoveryProps & {
  screen: "today" | "gallery";
  ready: boolean;
}) {
  const { C } = useTheme();
  const openJoin = useOpenJoin();
  const isToday = screen === "today";
  return (
    <View>
      <ScreenTitle right={ready && !offline ? (
        <IconCircleButton variant="plain" accessibilityLabel="Join a trip" onPress={openJoin}>
          <Plus size={22} color={C.textSecondary} />
        </IconCircleButton>
      ) : undefined}>{isToday ? "Today" : "Gallery"}</ScreenTitle>
      <View style={styles.context}>
        {!ready ? (
          <View style={{ alignSelf: "stretch" }}>
            <ListSkeleton rows={3} />
          </View>
        ) : (
          <>
            {/* A live glimpse of the screen once there's a trip, then the empty state itself */}
            {!offline ? <View style={styles.preview}>{isToday ? <SampleDayPreview /> : <PhotoDriftPreview />}</View> : null}
            <EmptyState
              compact
              symbol={offline ? "wifi.slash" : isToday ? "calendar" : "photo.on.rectangle"}
              icon={offline
                ? <WifiSlash size={30} color={C.textSecondary} weight="duotone" />
                : isToday ? <CalendarBlank size={30} color={C.tealText} weight="duotone" /> : <Images size={30} color={C.tealText} weight="duotone" />}
              tone={offline ? "neutral" : "accent"}
              title={offline ? "Your trips are unavailable" : isToday ? "The day, in order" : "Your group’s moments"}
              message={offline
                ? "You’re offline and there are no saved trips on this phone. Connect to load your trip details."
                : isToday
                  ? "Once you join a trip, the day’s times, places and plans appear here."
                  : "Join a trip to see and share photos with the people travelling with you."}
              cta={offline
                ? { label: retrying ? "Connecting…" : "Try again", onPress: onRetry }
                : { label: "Join a trip", onPress: openJoin }}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { paddingHorizontal: S.md + S.xs, marginTop: -S.sm },
  eyebrow: { fontSize: T.base, lineHeight: 22, fontWeight: T.semibold, marginBottom: S.sm },
  homeTitle: { fontSize: T["4xl"], lineHeight: 38, fontWeight: T.bold, letterSpacing: -0.8, marginBottom: S.md },
  homeBody: { fontSize: T.lg, lineHeight: 26 },
  homeActionText: { fontSize: T.lg, lineHeight: 24 },
  homeHelpText: { fontSize: T.base, lineHeight: 22 },
  body: { fontSize: T.base, lineHeight: 23 },
  primary: { minHeight: 50, borderRadius: S.md, marginTop: S.lg, paddingHorizontal: S.md, paddingVertical: S.sm, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: S.xs },
  actionText: { fontSize: T.base, lineHeight: 21, fontWeight: T.semibold, flexShrink: 1 },
  helpAction: { minHeight: 44, marginTop: S.xs, paddingVertical: S.xs, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs2 },
  helpText: { fontSize: T.sm, lineHeight: 18, flexShrink: 1 },
  helpTight: { marginTop: 0 },
  error: { textAlign: "center", marginTop: S.sm },
  helpBody: { paddingHorizontal: S.xs, paddingBottom: S.md },
  context: { paddingHorizontal: S.md + S.xs, paddingTop: S.xl, paddingBottom: S.lg },
  preview: { marginBottom: S.sm },
  textAction: { minHeight: 48, marginTop: S.md, paddingVertical: S.sm, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: S.xs2 },
  loading: { alignItems: "flex-start", gap: S.md },
});
