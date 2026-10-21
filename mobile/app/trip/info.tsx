import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Platform, Share, Linking,
} from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  CaretRight, Calendar, Clock, Check,
  Warning, WarningCircle, ArrowSquareOut, Paperclip,
} from "phosphor-react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useTripRole } from "@/hooks/useTripRole";
import { T, R, S, statusTone, type ThemeColors } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMemo, useCallback } from "react";
import type { TripInfo } from "@/shared/types";
import { openDocument } from "@/services/openDocument";
import { CachedImage } from "@/components/CachedImage";
import { CategoryDot } from "@/components/ui/CategoryDot";
import * as Haptics from "@/services/haptics";
import { PhotoBackdrop, photoPalette } from "@/components/ui/PhotoBackdrop";
import { isLiquidGlassAvailable } from "expo-glass-effect";

const NATIVE_EDGE = Platform.OS === "ios" && isLiquidGlassAvailable();
import type { TravelEvent } from "@/shared/types";

const URL_RE = /(https?:\/\/[^\s),]+)/g;

function LinkedText({ text, style, linkColor, stripUrls, numberOfLines }: { text: string; style: any; linkColor: string; stripUrls?: string[]; numberOfLines?: number }) {
  let cleaned = text;
  if (stripUrls) {
    for (const u of stripUrls) cleaned = cleaned.replace(u, "").trim();
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return null;

  const parts = cleaned.split(URL_RE);
  return (
    <Text style={style} selectable numberOfLines={numberOfLines}>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <Text
            key={i}
            style={{ color: linkColor, textDecorationLine: "underline" }}
            onPress={() => Linking.openURL(part)}
          >
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

type InfoStatus = "overdue" | "urgent" | "upcoming" | "done" | null;

const FACT_RE = /([A-Za-z][^.,:;()\n]{2,48}?)\s*[:(]\s*((?:£|\$|€)\s?[\d,]+(?:\.\d{2})?)/g;

/** Money amounts with the words that label them, so a cost paragraph gets a scannable row. */
function extractFacts(body: string): { label: string; amount: string }[] {
  const out: { label: string; amount: string }[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(FACT_RE)) {
    let label = m[1].replace(/^(and|or|plus|the|a|an|includes?)\s+/i, "").trim();
    label = label.charAt(0).toUpperCase() + label.slice(1);
    const amount = m[2].replace(/\s+/g, "");
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, amount });
    if (out.length === 12) break;
  }
  return out;
}

/** Sentences that carry no amount, so a cost receipt isn't repeated as prose underneath it. */
function nonMoneySentences(body: string): string {
  return body.split(/(?<=[.!?])\s+/).filter(sn => !/(?:£|\$|€)\s?\d/.test(sn)).join(" ").trim();
}

type TopicKind = "costs" | "stay" | "todo" | "text";

/** What a topic is about decides how it is laid out. */
function topicKind(title: string): TopicKind {
  const t = title.toLowerCase();
  if (/cost|price|budget|payment|invoice|deposit|balance/.test(t)) return "costs";
  if (/hotel|accommodation|room|resort|stay|lodg|camp/.test(t)) return "stay";
  if (/outstanding|to do|todo|pending|action|checklist|remaining|to sort|tbc|tba/.test(t)) return "todo";
  return "text";
}

/** The itinerary category a cost line belongs to, so it carries the same icon as on the itinerary. */
function costCategory(label: string): TravelEvent["type"] | null {
  const l = label.toLowerCase();
  if (/accommodation|hotel|resort|lodge|camp|stay|room/.test(l)) return "hotel";
  if (/flight|airfare|airline/.test(l)) return "flight";
  if (/transfer|transport|coach|car|taxi/.test(l)) return "transfer";
  if (/dinner|lunch|breakfast|meal|dining|restaurant/.test(l)) return "dining";
  if (/tour|activity|excursion|experience|ticket/.test(l)) return "activity";
  return null;
}

/** The hotel event a stay line talks about, for its photo. */
function matchHotel(name: string, events: TravelEvent[]): TravelEvent | undefined {
  const key = name.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
  return events.find(e => e.type === "hotel" && e.image && (e.title.toLowerCase().includes(key) || (e.location ?? "").toLowerCase().includes(key)));
}

/** The icon already says what kind of cost it is, so the label doesn't need to. */
function shortCostLabel(label: string): string {
  return label.replace(/\s+(accommodation|hotel stay|stay|hotel)$/i, "").trim() || label;
}

/** Shorthand in brackets that the sentence already spells out: (comp), (TBA), (TBC). */
function dropShorthand(text: string): string {
  return text.replace(/\s*\((?:comp|tba|tbc|tbd|n\/a)\)/gi, "").replace(/\s{2,}/g, " ").trim();
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "…, 8–10 Nov (2 nights, …)" -> the date range, a night count, and the details without them. */
function stayDates(detail: string): { range: string; nights: number | null; rest: string } {
  const m = detail.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*/);
  if (!m) return { range: "", nights: null, rest: detail };
  const from = Number(m[1]), to = Number(m[2]);
  const nights = MONTHS[m[3].toLowerCase()] !== undefined && to > from ? to - from : null;
  const rest = detail.replace(m[0], "").replace(/\(\s*\d+\s+nights?,?\s*/i, "(").replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",").replace(/,\s*\(/g, " (").replace(/\s{2,}/g, " ").replace(/[,\s]+$/, "").replace(/^[,\s]+/, "").trim();
  return { range: `${m[1]}–${m[2]} ${m[3]}`, nights, rest };
}

/** The itinerary event a line talks about ("Phuket entertainment…" -> "Phuket Entertainment – Details TBC"). */
function matchEvent(line: string, events: TravelEvent[], type?: TravelEvent["type"]): TravelEvent | undefined {
  const l = line.toLowerCase();
  return events.find(e => {
    if (type && e.type !== type) return false;
    const key = e.title.toLowerCase().replace(/^[a-z]{2}\d+\s*[–—-]\s*/, "").split(/\s+/).slice(0, 2).join(" ");
    return key.length > 4 && l.includes(key);
  });
}

const TOPIC_HEADING: Record<TopicKind, string | null> = { costs: "Costs", stay: "Where you're staying", todo: "Still to sort", text: null };

/** Lines the organiser wrote, or failing that, sentences. */
function splitLines(body: string): string[] {
  const lines = body.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const parts = lines.length > 1 ? lines : body.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.map(l => l.replace(/[.\s]+$/, "").trim()).filter(Boolean);
}

/** "Anantara Resort: 14 rooms, 7–8 Nov" -> name and details */
function splitNamed(line: string): { name: string; detail: string } {
  const i = line.indexOf(":");
  return i > 0 && i < 70 ? { name: line.slice(0, i).trim(), detail: line.slice(i + 1).trim() } : { name: line, detail: "" };
}

function getStatus(item: TripInfo, now = new Date()): InfoStatus {
  if (item.completed) return "done";
  if (!item.deadline) return null;
  const deadline = new Date(item.deadline + "T23:59:59");
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 3) return "urgent";
  return "upcoming";
}

function formatDeadlineShort(d: string): string {
  const date = new Date(d + "T12:00:00");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function statusConfig(status: InfoStatus, deadline: string | undefined, C: ThemeColors) {
  const dl = deadline ? formatDeadlineShort(deadline) : "";
  switch (status) {
    case "overdue":
      return { Icon: WarningCircle, label: `Overdue, was due ${dl}`, tone: statusTone("expired", C) };
    case "urgent": {
      const days = Math.ceil((new Date(deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
      return { Icon: Clock, label: `Due in ${days} day${days !== 1 ? "s" : ""}, ${dl}`, tone: statusTone("expiring", C) };
    }
    case "upcoming":
      return { Icon: Calendar, label: `Due ${dl}`, tone: statusTone("upcoming", C) };
    case "done":
      return { Icon: Check, label: "Completed", tone: statusTone("done", C) };
    default: return null;
  }
}

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export default function InfoScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips } = useTrips();
  const router = useRouter();
  const { C: themeC, isDark: themeDark } = useTheme();
  const insets = useSafeAreaInsets();
  // Like the trip page: the trip's photo, blurred, behind everything
  const coverImage = trips.find(t => t.id === tripId)?.image;
  const photoPage = !!coverImage;
  const C = useMemo(() => (photoPage ? photoPalette(themeC, themeDark) : themeC), [photoPage, themeC, themeDark]);
  const isDark = photoPage || themeDark;
  const styles = useMemo(() => makeStyles(C), [C]);

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const { isLeader } = useTripRole(tripId);
  const trip = trips.find(t => t.id === tripId);
  const infoItems = useMemo(() => {
    const all = trip?.info ?? [];
    return isLeader ? all : all.filter(i => !i.leaderOnly);
  }, [trip?.info, isLeader]);

  // Essentials first: what's due (soonest at the top), what's still to sort, where you're staying,
  // then everything else, with costs last
  const ordered = useMemo(() => {
    const rank: Record<TopicKind, number> = { todo: 1, stay: 2, text: 3, costs: 4 };
    const score = (i: TripInfo) => (!i.completed && i.deadline ? 0 : rank[topicKind(i.title || "")]);
    return [...infoItems].sort((x, y) => score(x) - score(y) || (x.deadline ?? "").localeCompare(y.deadline ?? ""));
  }, [infoItems]);

  const headerOptions = (title: string) => ({
    headerShown: true,
    title,
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
  });

  const shareMenu = (item: TripInfo) => ({
    actions: [
      { title: "Share", systemIcon: "square.and.arrow.up" },
      { title: "Copy Text", systemIcon: "doc.on.doc" },
    ],
    onPress: (e: any) => {
      const text = `${item.title}\n\n${item.body ?? ""}`;
      if (e.nativeEvent.index === 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Share.share({ message: text }); }
      else if (e.nativeEvent.index === 1) {
        import("expo-clipboard").then(Clipboard => Clipboard.setStringAsync(text))
          .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch(() => {});
      }
    },
  });

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <EmptyState
            title="Trip not found"
            cta={{ label: "Go back", onPress: safeBack }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const renderTopic = (item: TripInfo) => {
    const kind = topicKind(item.title || "");
    const heading = TOPIC_HEADING[kind] ?? item.title ?? "Information";
    const sc = statusConfig(getStatus(item), item.deadline, C);
    const body = item.body ?? "";
    const facts = kind === "costs" && body ? extractFacts(body) : [];
    const totalIdx = facts.findIndex(f => /total/i.test(f.label));
    const receipt = totalIdx >= 0 ? [...facts.filter((_, i) => i !== totalIdx), facts[totalIdx]] : facts;
    const lines = (kind === "stay" || kind === "todo") && body ? splitLines(body) : [];
    // Essentials: "Currency: Thai baht" lines become label/value rows; several separate lines become rows
    const textLines = kind === "text" && body ? body.split(/\n+/).map(l => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean) : [];
    const pairs = textLines.length >= 2 && textLines.filter(l => { const n = splitNamed(l); return !!n.detail && n.name.length <= 32; }).length >= Math.ceil(textLines.length * 0.6)
      ? textLines.map(splitNamed) : [];
    const textRows = pairs.length === 0 && textLines.length >= 2 ? textLines : [];
    const prose = kind === "costs" && facts.length > 0 ? dropShorthand(nonMoneySentences(body))
      : (kind === "stay" || kind === "todo") && lines.length > 0 ? ""
      : pairs.length > 0 || textRows.length > 0 ? ""
      : body;

    return (
      <ContextMenu key={item.id} {...shareMenu(item)}>
        <View style={styles.topic}>
          <Text
            style={styles.groupTitle}
            accessibilityRole="header"
            // Long-press Share and Copy, reachable from VoiceOver too
            accessibilityActions={[{ name: "share", label: "Share" }, { name: "copy", label: "Copy text" }]}
            onAccessibilityAction={(e) => shareMenu(item).onPress({ nativeEvent: { index: e.nativeEvent.actionName === "share" ? 0 : 1 } })}
          >{heading}</Text>
          {sc ? <Text style={[styles.metaText, { color: sc.tone.text }]}>{sc.label}</Text> : null}

          {receipt.length > 0 && (
            <View style={styles.card}>
              {totalIdx >= 0 && (
                <View style={styles.totalHero}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{facts[totalIdx].amount}</Text>
                </View>
              )}
              {receipt.filter((_, i) => !(totalIdx >= 0 && i === receipt.length - 1)).map((f, i) => {
                const cat = costCategory(f.label);
                return (
                  <View key={f.label} style={[styles.receiptRow, (i > 0 || totalIdx >= 0) && styles.rowBorder]}>
                    {cat ? <CategoryDot palette={C} type={cat} size={28} /> : null}
                    <Text style={styles.receiptLabel} numberOfLines={2}>{cat ? shortCostLabel(f.label) : f.label}</Text>
                    <Text style={styles.receiptAmount}>{f.amount}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {lines.length > 0 && (
            <View style={styles.card}>
              {lines.map((line, i) => {
                const named = kind === "stay" ? splitNamed(line) : { name: line, detail: "" };
                const dates = kind === "stay" ? stayDates(named.detail) : null;
                const name = named.name;
                const detail = dates ? dates.rest : named.detail;
                const hotel = kind === "stay" ? matchHotel(name, trip.events) : undefined;
                // Rows open the itinerary event they describe, when there is one
                const linked = kind === "stay" ? (hotel ?? matchEvent(name, trip.events, "hotel")) : matchEvent(name, trip.events);
                return (
                  <Pressable
                    key={i}
                    disabled={!linked}
                    onPress={() => { if (!linked) return; Haptics.selectionAsync(); router.push({ pathname: "/trip/event", params: { tripId: trip.id, eventId: linked.id } }); }}
                    accessibilityRole={linked ? "button" : undefined}
                    style={({ pressed }) => [styles.listRow, kind === "todo" && { alignItems: "flex-start" }, i > 0 && styles.rowBorder, pressed && linked ? { backgroundColor: C.elevated } : null]}
                  >
                    {kind === "stay" ? (
                      hotel?.image ? <CachedImage uri={hotel.image} style={styles.stayThumb} /> : <CategoryDot palette={C} type="hotel" size={28} />
                    ) : (
                      <Clock size={18} color={C.amberText} weight="regular" style={{ marginTop: 2 }} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={kind === "todo" ? styles.todoText : styles.rowTitle}>{name}</Text>
                      {dates?.range ? (
                        <Text style={styles.stayRange}>{dates.range}{dates.nights ? `, ${dates.nights} night${dates.nights === 1 ? "" : "s"}` : ""}</Text>
                      ) : null}
                      {detail ? <Text style={styles.rowSub}>{detail}</Text> : null}
                    </View>
                    {linked ? <CaretRight size={14} color={C.textTertiary} weight="regular" style={{ alignSelf: "center" }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {pairs.length > 0 && (
            <View style={styles.card}>
              {pairs.map((pr, i) => {
                const phone = /^\+?[\d\s()-]{6,}$/.test(pr.detail) ? pr.detail.replace(/[^\d+]/g, "") : null;
                return (
                  <Pressable
                    key={i}
                    disabled={!phone}
                    onPress={() => { if (!phone) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(`tel:${phone}`); }}
                    accessibilityRole={phone ? "button" : undefined}
                    accessibilityLabel={phone ? `Call ${pr.name}, ${pr.detail}` : undefined}
                    style={({ pressed }) => [styles.pairRow, i > 0 && styles.rowBorder, pressed && { backgroundColor: C.elevated }]}
                  >
                    <Text style={styles.pairLabel}>{pr.name || " "}</Text>
                    <Text style={[styles.pairValue, phone && { color: C.tealText }]} selectable={!phone}>{pr.detail || pr.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {textRows.length > 0 && (
            <View style={styles.card}>
              {textRows.map((row, i) => (
                <View key={i} style={[styles.listRow, i > 0 && styles.rowBorder]}>
                  <LinkedText text={row} style={[styles.todoText, { flex: 1 }]} linkColor={C.tealText} />
                </View>
              ))}
            </View>
          )}

          {prose && kind === "text" ? (
            <View style={[styles.card, { padding: S.md }]}>
              <LinkedText
                text={prose}
                style={styles.bodyText}
                linkColor={C.tealText}
                stripUrls={item.actionUrl ? [item.actionUrl] : undefined}
              />
            </View>
          ) : prose ? (
            <LinkedText
              text={prose}
              style={kind === "text" ? styles.bodyText : styles.caption}
              linkColor={C.tealText}
              stripUrls={item.actionUrl ? [item.actionUrl] : undefined}
            />
          ) : null}

          {item.notes?.map((note, i) => (
            <View key={i} style={styles.noteCallout}>
              <Warning size={14} color={C.amberText} weight="fill" style={{ marginTop: 3 }} />
              <Text style={styles.noteCalloutText}>{note}</Text>
            </View>
          ))}

          {(item.actionUrl || (item.documents?.length ?? 0) > 0) && (
            <View style={styles.card}>
              {item.actionUrl && (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(item.actionUrl!); }}
                  accessibilityRole="button"
                  accessibilityLabel={item.actionLabel ?? "Open link"}
                  style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: C.elevated }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, { color: C.tealText }]}>{item.actionLabel ?? "Open link"}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{hostname(item.actionUrl)}</Text>
                  </View>
                  <ArrowSquareOut size={16} color={C.textTertiary} weight="regular" />
                </Pressable>
              )}
              {item.documents?.map((d, i) => (
                <Pressable
                  key={d.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDocument(d.url, d.name).catch(() => {}); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open attachment ${d.name}`}
                  style={({ pressed }) => [styles.listRow, (i > 0 || !!item.actionUrl) && styles.rowBorder, pressed && { backgroundColor: C.elevated }]}
                >
                  <Paperclip size={16} color={C.textTertiary} weight="regular" />
                  <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{d.name}</Text>
                  <CaretRight size={14} color={C.textTertiary} weight="regular" />
                </Pressable>
              ))}
            </View>
          )}

          {item.source ? <Text style={styles.sourceText}>From {item.source}</Text> : null}
        </View>
      </ContextMenu>
    );
  };

  return (
    <View style={styles.safe}>
      {photoPage && <PhotoBackdrop uri={coverImage!} />}
      <Stack.Screen options={headerOptions("Trip info")} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} contentInsetAdjustmentBehavior="automatic">
        {ordered.length === 0 ? (
          <View style={{ paddingTop: S.xl }}>
            <EmptyState compact title="Nothing here yet" message="Your organiser hasn't shared any trip information yet." />
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.intro}>
              <Text style={styles.introName} numberOfLines={2}>{trip.name}</Text>
              <Text style={styles.introSub}>Everything your organiser has shared for this trip</Text>
            </View>
            {ordered.map(renderTopic)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    content: { marginTop: S.sm, paddingHorizontal: S.md, gap: S.xl },
    intro: { gap: S.xs2 },
    introName: { fontSize: T["2xl"], lineHeight: 30, fontWeight: T.bold, color: C.textPrimary, letterSpacing: -0.4 },
    introSub: { fontSize: T.base, color: C.textSecondary },
    topic: { gap: S.sm },
    groupTitle: { fontSize: T.lg, fontWeight: T.semibold, color: C.textPrimary, letterSpacing: -0.2 },
    caption: { fontSize: T.base, color: C.textSecondary, lineHeight: 22 },

    // Boxless: rows run to the page edge (undoing the content gutter) and split with hairlines
    card: { marginHorizontal: -S.md },
    listRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.md, paddingVertical: S.sm2, minHeight: 56,
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    rowTitle: { fontSize: T.md, fontWeight: T.medium, color: C.textPrimary },
    rowSub: { fontSize: T.sm, color: C.textTertiary, marginTop: 2 },
    todoText: { fontSize: T.base, color: C.textPrimary, lineHeight: 22 },
    pairRow: { flexDirection: "row", alignItems: "flex-start", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.sm2 },
    pairLabel: { width: 112, fontSize: T.base, color: C.textTertiary, lineHeight: 22 },
    pairValue: { flex: 1, fontSize: T.base, color: C.textPrimary, lineHeight: 22 },

    detail: { paddingHorizontal: S.md, paddingTop: S.xs, gap: S.md },
    sourceText: { fontSize: T.sm, color: C.textTertiary },
    metaText: { fontSize: T.sm, fontWeight: T.semibold },

    totalHero: { paddingHorizontal: S.md, paddingTop: S.md, paddingBottom: S.sm2 },
    totalLabel: { fontSize: T.sm, color: C.textTertiary },
    totalValue: { fontSize: T["2xl"], fontWeight: T.bold, color: C.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.5, marginTop: 2 },
    stayThumb: { width: 48, height: 48, borderRadius: R.sm },
    stayRange: { fontSize: T.sm, fontWeight: T.medium, color: C.textSecondary, marginTop: 2 },
    receiptRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.md, paddingVertical: S.sm2,
    },
    receiptLabel: { flex: 1, fontSize: T.base, color: C.textPrimary, lineHeight: 21 },
    receiptAmount: { fontSize: T.base, color: C.textPrimary, fontVariant: ["tabular-nums"], lineHeight: 21 },
    receiptTotal: { fontWeight: T.semibold },

    noteCallout: {
      flexDirection: "row", alignItems: "flex-start", gap: S.xs,
      padding: S.sm, borderRadius: R.lg,
      backgroundColor: C.amberDim,
    },
    noteCalloutText: { flex: 1, fontSize: T.sm, color: C.amberText, lineHeight: 20 },

    bodyText: { fontSize: T.md, color: C.textPrimary, lineHeight: 25 },
  });
}
