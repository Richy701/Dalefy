import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Phone, Envelope } from "phosphor-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import { Avatar } from "@/components/ui/Avatar";
import type { TripOrganizer } from "@/shared/types";

interface OrganizerCardProps {
  organizer: TripOrganizer;
  C: ThemeColors;
  isLeader?: boolean;
}

export function OrganizerCard({ organizer, C, isLeader = false }: OrganizerCardProps) {
  const s = makeStyles(C);

  if (!organizer?.name?.trim()) return null;

  const initials = organizer.name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (organizer.phone) Linking.openURL(`tel:${organizer.phone}`);
  };

  const handleEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (organizer.email) Linking.openURL(`mailto:${organizer.email}`);
  };

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <Avatar size={44} uri={organizer.avatar} initials={initials} />

        {/* Info */}
        <View style={s.info}>
          <Text style={s.name} numberOfLines={1}>{organizer.name}</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            {["Your organiser", organizer.role, organizer.company].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      {/* Action buttons — leader only */}
      {isLeader && (organizer.phone || organizer.email) && (
        <View style={s.actions}>
          {organizer.phone && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityLabel={`Call ${organizer.name}`}
            >
              <Phone size={15} color={C.tealText} weight="fill" />
              <Text style={s.actionText}>Call</Text>
            </Pressable>
          )}
          {organizer.email && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleEmail}
              accessibilityRole="button"
              accessibilityLabel={`Email ${organizer.name}`}
            >
              <Envelope size={15} color={C.tealText} weight="fill" />
              <Text style={s.actionText}>Email</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginHorizontal: S.md,
      marginTop: S.sm,
      backgroundColor: C.card,
      borderRadius: R.xl,
      padding: S.md,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
    },
    info: { flex: 1 },
    name: {
      fontSize: T.base,
      fontWeight: T.semibold,
      color: C.textPrimary,
    },
    subtitle: {
      fontSize: T.sm,
      color: C.textTertiary,
      marginTop: 2,
    },
    actions: {
      flexDirection: "row",
      gap: S.xs,
      marginTop: S.sm,
      paddingTop: S.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: S.xs2,
      paddingVertical: S.sm2,
      borderRadius: R.md,
      backgroundColor: C.tealDim,
    },
    actionText: {
      fontSize: T.sm,
      fontWeight: T.semibold,
      color: C.tealText,
    },
  });
}
