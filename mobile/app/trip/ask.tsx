import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, Platform, KeyboardAvoidingView, Keyboard,
} from "react-native";
import Animated, { FadeIn as EnterFade, FadeInDown, Easing } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ArrowUp, Copy, Check, ChatsTeardrop } from "phosphor-react-native";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { CategoryDot } from "@/components/ui/CategoryDot";
import { StreamedText, TypingDots } from "@/components/DaleChat";
import { IconCircleButton } from "@/components/ui/IconCircleButton";
import { PhotoBackdrop, photoPalette } from "@/components/ui/PhotoBackdrop";
import { FadeIn } from "@/components/FadeIn";
import { tidyTitleSeparators } from "@/shared/eventTitle";
import { parseTripDate } from "@/shared/dates";
import { todayKey } from "@/shared/tripSummary";
import { askTrip, type ChatTurn } from "@/services/tripChat";
import * as Haptics from "@/services/haptics";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { Trip, TravelEvent } from "@/shared/types";

const NATIVE_EDGE = Platform.OS === "ios" && isLiquidGlassAvailable();

// Conversations last while the app is open, so stepping into an event and back keeps the thread
const sessions = new Map<string, ChatTurn[]>();

const EASE_OUT = Easing.out(Easing.cubic);

function CopyButton({ text, color }: { text: string; color: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Pressable
      onPress={() => {
        Clipboard.setStringAsync(text).then(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCopied(true);
        }).catch(() => {});
      }}
      accessibilityRole="button"
      accessibilityLabel={copied ? "Copied" : "Copy answer"}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, alignSelf: "flex-start", paddingVertical: 2 })}
    >
      {copied ? <Check size={17} color={color} weight="bold" /> : <Copy size={17} color={color} />}
    </Pressable>
  );
}

/** Starters built from what this trip actually has */
type Starter = { title: string; sub: string; ask: string };

function suggestions(trip: Trip, events: TravelEvent[]): Starter[] {
  const today = todayKey();
  const upcoming = events.filter(e => e.date >= today);
  const out: Starter[] = [{ title: "What's next", sub: "for me on this trip", ask: "What's next for me?" }];
  if (trip.start <= today && trip.end >= today) out.push({ title: "Tomorrow", sub: "what's planned", ask: "What's on tomorrow?" });
  else out.push({ title: "The first day", sub: "how it starts", ask: "What happens on the first day?" });
  if (upcoming.some(e => e.type === "flight")) out.push({ title: "My next flight", sub: "times and terminal", ask: "When's my next flight?" });
  if (events.some(e => e.type === "hotel")) out.push({ title: "Where I'm staying", sub: "hotels and check-in", ask: "Where am I staying?" });
  if ((trip.info ?? []).length) out.push({ title: "Before I go", sub: "anything to sort", ask: "Is there anything I need to sort before I go?" });
  if (events.some(e => e.type === "dining")) out.push({ title: "Meals", sub: "which are included", ask: "Which meals are included?" });
  return out.slice(0, 5);
}

export default function AskScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C: themeC, isDark: themeDark } = useTheme();
  const insets = useSafeAreaInsets();
  const trip = trips.find(t => t.id === tripId);
  const photoPage = !!trip?.image;
  const C = useMemo(() => (photoPage ? photoPalette(themeC, themeDark) : themeC), [photoPage, themeC, themeDark]);
  const isDark = photoPage || themeDark;
  const styles = useMemo(() => makeStyles(C), [C]);
  const linkedTravelerId = useLinkedTravelerId(tripId);
  const { prefs } = usePreferences();
  const firstName = (prefs.name || "").trim().split(/\s+/)[0].replace(/^./, c => c.toUpperCase());

  const [turns, setTurns] = useState<ChatTurn[]>(() => sessions.get(tripId ?? "") ?? []);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  // The answer currently being written out; older answers render in full
  const [streaming, setStreaming] = useState<number | null>(null);
  const endStream = useCallback(() => setStreaming(null), []);
  const scrollRef = useRef<ScrollView>(null);
  const viewH = useRef(0);

  // The composer sits on the home indicator inset, and right on the keyboard while it is up
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => { if (tripId) sessions.set(tripId, turns); }, [tripId, turns]);

  // Same events the itinerary shows this traveller by default
  const myEvents = useMemo(() => (trip?.events ?? []).filter(e =>
    !linkedTravelerId || !e.assignedTo?.length || e.assignedTo.includes(linkedTravelerId)), [trip?.events, linkedTravelerId]);
  const byId = useMemo(() => new Map((trip?.events ?? []).map(e => [e.id, e])), [trip?.events]);
  const starters = useMemo(() => (trip ? suggestions(trip, myEvents) : []), [trip, myEvents]);

  const ask = useCallback(async (base: ChatTurn[], text: string) => {
    const question = text.trim();
    if (!question || pending || !tripId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const history = [...base.filter(t => !t.error), { role: "user" as const, content: question }];
    setTurns(history);
    setDraft("");
    setPending(true);
    try {
      const { reply, eventIds } = await askTrip(tripId, history);
      setStreaming(history.length);
      setTurns([...history, { role: "assistant", content: reply, eventIds }]);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTurns([...history, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setPending(false);
    }
  }, [pending, tripId]);

  const send = useCallback((text: string) => ask(turns, text), [ask, turns]);

  // Ask the failed question again in place of the failed answer
  const retry = useCallback(() => {
    const idx = turns.map(t => t.role).lastIndexOf("user");
    if (idx >= 0) ask(turns.slice(0, idx), turns[idx].content);
  }, [turns, ask]);

  const headerOptions = {
    headerShown: true,
    title: "Dale",
    headerBackTitle: " ",
    headerBackButtonDisplayMode: "minimal" as const,
    headerTransparent: Platform.OS === "ios",
    ...(photoPage && NATIVE_EDGE
      ? { scrollEdgeEffects: { top: "soft" as const, bottom: "hidden" as const, left: "hidden" as const, right: "hidden" as const } }
      : { headerBlurEffect: isDark ? "systemChromeMaterialDark" as const : "systemChromeMaterialLight" as const }),
    headerTintColor: C.textPrimary,
    headerTitleStyle: { color: C.textPrimary, fontWeight: "600" as const },
    headerShadowVisible: false,
    ...(Platform.OS === "android" ? { headerStyle: { backgroundColor: C.bg } } : {}),
  };

  if (!trip) {
    return (
      <View style={[styles.safe, styles.center]}>
        <Stack.Screen options={headerOptions} />
        <Text style={styles.sub}>This trip isn't available</Text>
      </View>
    );
  }

  const eventLine = (ev: TravelEvent) => {
    const day = parseTripDate(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return [day, ev.time && !/^tb[acd]$/i.test(ev.time) ? ev.time : ""].filter(Boolean).join(", ");
  };

  const canSend = !!draft.trim() && !pending;

  return (
    <View style={styles.safe}>
      {photoPage && <PhotoBackdrop uri={trip.image} />}
      <Stack.Screen options={headerOptions} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, turns.length === 0 && styles.contentEmpty]}
          onLayout={e => { viewH.current = e.nativeEvent.layout.height; }}
          onContentSizeChange={(_, h) => {
            // scrollToEnd ignores the inset under the transparent bar, so a short thread would slide up behind it.
            // Only follow the newest message once the thread is taller than the space below the bar.
            const bar = Platform.OS === "ios" ? insets.top + 44 : 0;
            if (turns.length && h + bar > viewH.current) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {turns.length === 0 ? (
            <FadeIn style={styles.hello}>
              {/* Dale's mark, in the agency's accent */}
              <View style={[styles.mark, { backgroundColor: C.teal }]}>
                <ChatsTeardrop size={28} color={C.onAccent} weight="fill" />
              </View>
              <Text style={styles.helloTitle}>{firstName ? `Hi ${firstName}, I'm Dale` : "Hi, I'm Dale"}</Text>
              <Text style={styles.helloSub}>Ask me anything about {trip.name}. I answer from your itinerary and your organiser's notes.</Text>
            </FadeIn>
          ) : (
            turns.map((t, i) => t.role === "user" ? (
              <Animated.View key={i} entering={FadeInDown.duration(260).easing(EASE_OUT)} style={styles.userBubble}>
                <Text style={styles.userText} selectable>{t.content}</Text>
              </Animated.View>
            ) : (
              <Animated.View key={i} entering={EnterFade.duration(180)} style={styles.answer}>
                <StreamedText
                  text={t.content}
                  style={[styles.answerText, t.error && { color: C.redText }]}
                  animate={streaming === i}
                  onDone={endStream}
                />
                {streaming === i ? null : (
                  <Animated.View entering={EnterFade.duration(220)} style={{ gap: S.xs }}>
                    {(t.eventIds ?? []).map(id => byId.get(id)).filter((e): e is TravelEvent => !!e).map(ev => (
                      <Pressable
                        key={ev.id}
                        onPress={() => { Haptics.selectionAsync(); router.push(`/trip/event?tripId=${trip.id}&eventId=${ev.id}`); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${tidyTitleSeparators(ev.title)}, ${eventLine(ev)}`}
                        style={({ pressed }) => [styles.eventCard, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <CategoryDot palette={C} type={ev.type} transferType={ev.transferType} size={36} base={C.elevated} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{tidyTitleSeparators(ev.title)}</Text>
                          <Text style={styles.eventSub} numberOfLines={1}>{eventLine(ev)}</Text>
                        </View>
                      </Pressable>
                    ))}
                    {t.error ? (i === turns.length - 1 ? (
                      <Pressable onPress={retry} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: "flex-start" })}>
                        <Text style={styles.retry}>Try again</Text>
                      </Pressable>
                    ) : null) : (
                      <CopyButton text={t.content} color={C.textTertiary} />
                    )}
                  </Animated.View>
                )}
              </Animated.View>
            ))
          )}
          {pending ? <TypingDots C={C} /> : null}
        </ScrollView>

        {turns.length === 0 ? (
          <ScrollView
            horizontal
            // ScrollView grows by default; this one only takes its cards' height, right on the composer
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.starterRail}
          >
            {starters.map((q, i) => (
              <Animated.View key={q.ask} entering={FadeInDown.delay(120 + Math.min(i, 6) * 60).duration(320).easing(EASE_OUT)}>
                <Pressable
                  onPress={() => send(q.ask)}
                  accessibilityRole="button"
                  accessibilityLabel={q.ask}
                  style={({ pressed }) => [styles.starterCard, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.starterTitle} numberOfLines={1}>{q.title}</Text>
                  <Text style={styles.starterSub} numberOfLines={1}>{q.sub}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.composer, { paddingBottom: keyboardUp ? S.xs : Math.max(insets.bottom, S.sm) }]}>
          {/* One rounded field with the send button inside it */}
          <View style={styles.field}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message Dale"
              placeholderTextColor={C.textTertiary}
              style={styles.input}
              multiline
              maxLength={1000}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => send(draft)}
              accessibilityLabel="Message Dale"
              keyboardAppearance={isDark ? "dark" : "light"}
            />
            <IconCircleButton
              size={34}
              variant={canSend ? "accent" : "elevated"}
              onPress={() => send(draft)}
              accessibilityLabel="Send"
              // The page palette, not the app theme: photo pages stay dark in light mode
              style={!canSend ? { backgroundColor: C.border } : undefined}
            >
              <ArrowUp size={17} weight="bold" color={canSend ? C.onAccent : C.textTertiary} />
            </IconCircleButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.md, gap: S.md },

    contentEmpty: { flexGrow: 1, justifyContent: "center" },
    hello: { alignItems: "center", gap: S.sm, paddingHorizontal: S.md, paddingBottom: S["2xl"] },
    mark: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: S.xs },
    helloTitle: { fontSize: T["2xl"], lineHeight: 30, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.4, textAlign: "center" },
    helloSub: { fontSize: T.base, lineHeight: 21, color: C.textSecondary, textAlign: "center", maxWidth: 300 },
    sub: { fontSize: T.base, color: C.textSecondary, lineHeight: 21 },

    starterRail: { paddingHorizontal: S.md, gap: S.xs, paddingBottom: S.xs },
    starterCard: {
      minWidth: 150, paddingHorizontal: S.sm2 + 4, paddingVertical: S.sm2,
      borderRadius: R.lg, backgroundColor: C.elevated,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    starterTitle: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    starterSub: { fontSize: T.sm, color: C.textSecondary, marginTop: 2 },

    userBubble: {
      alignSelf: "flex-end", maxWidth: "82%",
      backgroundColor: C.elevated, borderRadius: R.lg,
      paddingHorizontal: S.sm2 + 4, paddingVertical: S.sm2,
    },
    userText: { fontSize: T.md, lineHeight: 22, color: C.textPrimary },

    answer: { gap: S.xs, paddingRight: S.lg },
    answerText: { fontSize: T.md, lineHeight: 24, color: C.textPrimary },
    retry: { fontSize: T.base, fontWeight: T.semibold, color: C.tealText },
    eventCard: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.sm2, paddingVertical: S.sm2, borderRadius: R.lg,
      backgroundColor: C.elevated,
    },
    eventTitle: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    eventSub: { fontSize: T.xs, color: C.textSecondary, marginTop: 1 },

    composer: { paddingHorizontal: S.md, paddingTop: S.xs },
    field: {
      flexDirection: "row", alignItems: "flex-end", gap: S.xs,
      minHeight: 50, borderRadius: 25,
      backgroundColor: C.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      paddingLeft: S.md, paddingRight: 8, paddingVertical: 8,
    },
    input: {
      flex: 1, maxHeight: 120, minHeight: 34,
      paddingTop: 7, paddingBottom: 7, paddingHorizontal: 0,
      fontSize: T.md, color: C.textPrimary,
    },
  });
}
