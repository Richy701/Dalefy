import { useMemo } from "react";
import { View, Text, StyleSheet, Linking, Platform, Alert } from "react-native";
// Native only: react-native-web (the admin's web preview) has no ActionSheetIOS export
const ActionSheetIOS: typeof import("react-native").ActionSheetIOS | null = Platform.OS === "ios" ? require("react-native").ActionSheetIOS : null;
import { FileText } from "phosphor-react-native";
import * as Haptics from "@/services/haptics";
import { ScalePress } from "@/components/ScalePress";
import { Avatar } from "@/components/ui/Avatar";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TripOrganizer } from "@/shared/types";

/** Trip info (stays, notes, documents) and the organiser, side by side near the top of the itinerary. */
export function TripQuickTiles({ C, docCount, onDocs, organizer }: {
  C: ThemeColors;
  docCount: number;
  onDocs: () => void;
  organizer?: TripOrganizer | null;
}) {
  const s = useMemo(() => makeStyles(C), [C]);
  const org = organizer?.name?.trim() ? organizer : null;
  if (!docCount && !org) return null;

  const initials = org ? org.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") : "";
  // Only the ways the organiser actually left
  const contacts = org ? [
    org.phone ? { label: "Call", url: `tel:${org.phone}` } : null,
    org.phone ? { label: "Message", url: `sms:${org.phone}` } : null,
    org.email ? { label: "Email", url: `mailto:${org.email}` } : null,
  ].filter(Boolean) as { label: string; url: string }[] : [];

  const contact = () => {
    if (!org || !contacts.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const open = (url: string) => Linking.openURL(url).catch(() => {});
    const title = [org.name, org.company].filter(Boolean).join(", ");
    if (ActionSheetIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...contacts.map(c => c.label), "Cancel"], cancelButtonIndex: contacts.length },
        (i) => { if (i < contacts.length) open(contacts[i].url); },
      );
    } else {
      Alert.alert(title, undefined, [...contacts.map(c => ({ text: c.label, onPress: () => open(c.url) })), { text: "Cancel", style: "cancel" as const }]);
    }
  };

  return (
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
        </ScalePress>
      ) : null}
      {org ? (
        <ScalePress
          activeScale={contacts.length ? 0.97 : 1}
          onPress={contacts.length ? contact : undefined}
          disabled={!contacts.length}
          accessibilityRole={contacts.length ? "button" : undefined}
          accessibilityLabel={`${org.name}, your organiser${contacts.length ? `, ${contacts.map(c => c.label.toLowerCase()).join(" or ")}` : ""}`}
          style={s.tile}
        >
          <Avatar size={36} uri={org.avatar} initials={initials} />
          <View style={s.text}>
            <Text style={s.title} numberOfLines={1}>{org.name}</Text>
            <Text style={s.sub} numberOfLines={1}>{contacts.length ? "Get in touch" : org.company || "Your organiser"}</Text>
          </View>
        </ScalePress>
      ) : null}
      {/* A lone tile keeps its half width, so every trip's layout matches */}
      {!docCount || !org ? <View style={{ flex: 1 }} /> : null}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: S.sm, paddingHorizontal: S.md, marginBottom: S.md },
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
