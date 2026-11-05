import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { CaretRight, FileText, ChatsTeardrop } from "phosphor-react-native";
import * as Haptics from "@/services/haptics";
import { ScalePress } from "@/components/ScalePress";
import { Avatar } from "@/components/ui/Avatar";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TripOrganizer } from "@/shared/types";

/** Trip info (stays, notes, documents), the organiser and the trip concierge, near the top of the itinerary. */
export function TripQuickTiles({ C, docCount, onDocs, organizer, onAsk, onOrganizer }: {
  C: ThemeColors;
  docCount: number;
  onDocs: () => void;
  organizer?: TripOrganizer | null;
  onAsk?: () => void;
  onOrganizer?: () => void;
}) {
  const s = useMemo(() => makeStyles(C), [C]);
  const org = organizer?.name?.trim() ? organizer : null;
  if (!docCount && !org && !onAsk) return null;

  const initials = org ? org.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") : "";
  // Says what it does only when there's a way to reach them; either way it opens who they are
  const reachable = !!(org?.phone?.trim() || org?.email?.trim());

  const askTile = onAsk ? (
    <ScalePress
      activeScale={0.97}
      onPress={() => { Haptics.selectionAsync(); onAsk(); }}
      accessibilityRole="button"
      accessibilityLabel="Ask Dale about your trip"
      style={s.tile}
    >
      <View style={s.iconTile}>
        <ChatsTeardrop size={18} color={C.textPrimary} weight="fill" />
      </View>
      <View style={s.text}>
        <Text style={s.title} numberOfLines={1}>Ask Dale</Text>
        <Text style={s.sub} numberOfLines={1}>Quick answers</Text>
      </View>
      <CaretRight size={14} color={C.textTertiary} weight="regular" />
        </ScalePress>
  ) : null;
  const paired = (docCount > 0 ? 1 : 0) + (org ? 1 : 0);

  return (
    <View style={s.wrap}>
    <View style={s.row}>
      {docCount > 0 ? (
        <ScalePress
          activeScale={0.97}
          onPress={() => { Haptics.selectionAsync(); onDocs(); }}
          accessibilityRole="button"
          accessibilityLabel="Trip info from your organiser"
          style={s.tile}
        >
          <View style={s.iconTile}>
            <FileText size={18} color={C.textPrimary} weight="fill" />
          </View>
          <View style={s.text}>
            <Text style={s.title} numberOfLines={1}>Trip info</Text>
            <Text style={s.sub} numberOfLines={1}>All the details</Text>
          </View>
          <CaretRight size={14} color={C.textTertiary} weight="regular" />
        </ScalePress>
      ) : null}
      {org ? (
        <ScalePress
          activeScale={0.97}
          onPress={() => { Haptics.selectionAsync(); onOrganizer?.(); }}
          accessibilityRole="button"
          accessibilityLabel={`${org.name}, your organiser`}
          accessibilityHint="Shows their details"
          style={s.tile}
        >
          <Avatar size={36} uri={org.avatar} initials={initials} />
          <View style={s.text}>
            <Text style={s.title} numberOfLines={1}>{org.name}</Text>
            <Text style={s.sub} numberOfLines={1}>{reachable ? "Get in touch" : org.company || "Your organiser"}</Text>
          </View>
          <CaretRight size={14} color={C.textTertiary} weight="regular" />
        </ScalePress>
      ) : null}
      {/* Ask fills the second half beside a lone tile, or takes its own row under a full pair */}
      {paired < 2 ? askTile : null}
      {/* A lone tile keeps its half width, so every trip's layout matches */}
      {paired === 1 && !askTile ? <View style={{ flex: 1 }} /> : null}
    </View>
    {paired === 2 && askTile ? <View style={s.row}>{askTile}</View> : null}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: S.sm, marginBottom: S.md },
    row: { flexDirection: "row", gap: S.sm, paddingHorizontal: S.md },
    tile: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: S.sm,
      paddingHorizontal: S.sm2, paddingVertical: S.sm2, borderRadius: R.lg,
      backgroundColor: C.elevated,
    },
    iconTile: { width: 36, height: 36, borderRadius: R.md, backgroundColor: C.border, alignItems: "center", justifyContent: "center" },
    text: { flex: 1, minWidth: 0, gap: 1 },
    title: { fontSize: T.base, fontWeight: T.semibold, color: C.textPrimary },
    sub: { fontSize: T.xs, color: C.textSecondary },
  });
}
