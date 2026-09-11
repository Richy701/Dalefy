import { useState } from "react";
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { CoverFade } from "@/components/ui/CoverFade";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CalendarBlank, Images, CaretDown, CaretRight, Plus, WifiSlash } from "phosphor-react-native";
import { S, T } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { ScreenTitle } from "@/components/ui/CollapsingHeader";
import { IconCircleButton } from "@/components/ui/IconCircleButton";

/** A fresh route parameter reopens Home's existing join sheet after dismissal. */
function useOpenJoin() {
  const router = useRouter();
  return () => {
    void Haptics.selectionAsync();
    router.navigate({ pathname: "/(tabs)", params: { join: String(Date.now()) } });
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

/** Home before joining: the trip-cover photograph leads into a single access task. */
export function NoTripsHero({ greeting, offline, onRetry, retrying }: RecoveryProps & {
  greeting: string;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const openJoin = useOpenJoin();
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <View>
      <View style={{ height: insets.top + 208, opacity: offline ? 0.28 : 1 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image
          source={require("@/assets/images/welcome-hero.jpg")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
          accessibilityIgnoresInvertColors
        />
        <CoverFade />
      </View>
      <View style={styles.welcome}>
        <Text style={[styles.eyebrow, { color: C.textSecondary }]}>{offline ? "Connection unavailable" : greeting}</Text>
        <Text accessibilityRole="header" style={[styles.homeTitle, { color: C.textPrimary }]}>{offline ? "You’re offline" : "Join your trip."}</Text>
        <Text style={[styles.body, styles.homeBody, { color: C.textSecondary }]}>
          {offline
            ? "Connect to the internet to load your trips. Any trips saved on this phone will be available offline."
            : "Use the code or invite link from your organiser to get your itinerary and trip details."}
        </Text>
        <Pressable
          onPress={offline ? onRetry : openJoin}
          disabled={offline && retrying}
          accessibilityRole="button"
          accessibilityState={{ disabled: offline && retrying, busy: offline && retrying }}
          style={({ pressed }) => [styles.primary, { backgroundColor: C.teal, opacity: pressed || (offline && retrying) ? 0.7 : 1 }]}
        >
          <Text style={[styles.actionText, styles.homeActionText, { color: C.onAccent }]}>{offline ? (retrying ? "Connecting…" : "Try again") : "Join a trip"}</Text>
          {!offline && <Plus size={18} color={C.onAccent} weight="bold" />}
        </Pressable>
        {!offline && (
          <View>
            <Pressable
              onPress={() => setHelpOpen(open => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: helpOpen }}
              style={({ pressed }) => [styles.helpAction, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.helpText, styles.homeHelpText, { color: C.textSecondary }]}>Where do I find my code?</Text>
              {helpOpen ? <CaretDown size={14} color={C.textSecondary} /> : <CaretRight size={14} color={C.textSecondary} />}
            </Pressable>
            {helpOpen && (
              <Text style={[styles.helpText, styles.homeHelpText, styles.helpBody, { color: C.textSecondary }]}>
                Check the message from your organiser for a trip code or invite link. If you haven’t received one, ask them to send your invitation.
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
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
          <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Loading trips" accessibilityState={{ busy: true }}>
            <ActivityIndicator color={C.tealText} />
            <Text style={[styles.body, { color: C.textSecondary }]}>Loading your trips…</Text>
          </View>
        ) : (
          <>
            <View style={styles.contextIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {offline ? <WifiSlash size={35} color={C.textTertiary} weight="light" /> : isToday ? <CalendarBlank size={35} color={C.textTertiary} weight="light" /> : <Images size={35} color={C.textTertiary} weight="light" />}
            </View>
            <Text accessibilityRole="header" style={[styles.contextTitle, { color: C.textPrimary }]}>
              {offline ? "Your trips are unavailable" : isToday ? "The day, in order." : "Your group’s moments."}
            </Text>
            <Text style={[styles.body, { color: C.textSecondary }]}>
              {offline
                ? "You’re offline and there are no saved trips on this phone. Connect to load your trip details."
                : isToday
                  ? "Once you join a trip, you’ll find the day’s times, places and plans here."
                  : "Join a trip to see and share photos with the people travelling with you."}
            </Text>
            {offline ? (
              <Pressable
                onPress={onRetry}
                disabled={retrying}
                accessibilityRole="button"
                accessibilityState={{ disabled: retrying, busy: retrying }}
                style={({ pressed }) => [styles.textAction, { opacity: pressed || retrying ? 0.6 : 1 }]}
              >
                <Text style={[styles.actionText, { color: C.tealText }]}>{retrying ? "Connecting…" : "Try again"}</Text>
              </Pressable>
            ) : <JoinLink />}
            {!offline && isToday && (
              <View style={[styles.note, { borderTopColor: C.border }]}>
                <Text style={[styles.helpText, { color: C.textTertiary }]}>Your organiser keeps the itinerary up to date.</Text>
              </View>
            )}
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
  primary: { minHeight: 50, borderRadius: S.md, marginTop: S.xl, paddingHorizontal: S.md, paddingVertical: S.sm, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: S.xs },
  actionText: { fontSize: T.base, lineHeight: 21, fontWeight: T.semibold, flexShrink: 1 },
  helpAction: { minHeight: 44, marginTop: S.xs, paddingVertical: S.xs, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs2 },
  helpText: { fontSize: T.sm, lineHeight: 18, flexShrink: 1 },
  helpBody: { paddingHorizontal: S.xs, paddingBottom: S.md },
  context: { paddingHorizontal: S.md + S.xs, paddingTop: 112, paddingBottom: S.lg },
  contextIcon: { marginBottom: S.lg },
  contextTitle: { fontSize: 22, lineHeight: 27, fontWeight: T.semibold, letterSpacing: -0.4, marginBottom: S.sm },
  textAction: { minHeight: 48, marginTop: S.md, paddingVertical: S.sm, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: S.xs2 },
  note: { marginTop: S.xl, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: S.md },
  loading: { alignItems: "flex-start", gap: S.md },
});
