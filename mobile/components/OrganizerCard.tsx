import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Phone, Envelope } from "phosphor-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import { Avatar } from "@/components/ui/Avatar";
import { MicroLabel } from "@/components/ui/MicroLabel";
import type { TripOrganizer } from "@/shared/types";

interface OrganizerCardProps {
  organizer: TripOrganizer;
  C: ThemeColors;
  isLeader?: boolean;
}

export function OrganizerCard({ organizer, C, isLeader = false }: OrganizerCardProps) {
  const s = makeStyles(C);

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
        <Avatar size={48} uri={organizer.avatar} initials={initials} />

        {/* Info */}
        <View style={s.info}>
          <MicroLabel style={s.label}>Your organiser</MicroLabel>
          <Text style={s.name} numberOfLines={1}>{organizer.name}</Text>
          {(organizer.role || organizer.company) && (
            <Text style={s.subtitle} numberOfLines={1}>
              {[organizer.role, organizer.company].filter(Boolean).join(" · ")}
            </Text>
          )}
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
              <Phone size={13} color={C.teal} weight="regular" />
              <Text style={s.actionText}>CALL</Text>
            </Pressable>
          )}
          {organizer.email && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleEmail}
              accessibilityRole="button"
              accessibilityLabel={`Email ${organizer.name}`}
            >
              <Envelope size={13} color={C.teal} weight="regular" />
              <Text style={s.actionText}>EMAIL</Text>
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
    label: { marginBottom: 2 },
    name: {
      fontSize: T.md,
      fontWeight: T.bold,
      color: C.textPrimary,
    },
    subtitle: {
      fontSize: T.sm,
      fontWeight: T.medium,
      color: C.textTertiary,
      marginTop: 1,
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
      fontSize: T.xs,
      fontWeight: T.bold,
      color: C.tealText,
      letterSpacing: 1,
    },
  });
}
