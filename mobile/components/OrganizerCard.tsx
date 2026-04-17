import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { CachedImage } from "@/components/CachedImage";
import { Phone, Mail, User } from "lucide-react-native";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";
import type { TripOrganizer } from "@/shared/types";

interface OrganizerCardProps {
  organizer: TripOrganizer;
  C: ThemeColors;
}

export function OrganizerCard({ organizer, C }: OrganizerCardProps) {
  const s = makeStyles(C);

  const initials = organizer.name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleCall = () => {
    if (organizer.phone) Linking.openURL(`tel:${organizer.phone}`);
  };

  const handleEmail = () => {
    if (organizer.email) Linking.openURL(`mailto:${organizer.email}`);
  };

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        {/* Avatar */}
        {organizer.avatar ? (
          <CachedImage uri={organizer.avatar} style={s.avatar} />
        ) : (
          <View style={s.avatarFallback}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </View>
        )}

        {/* Info */}
        <View style={s.info}>
          <Text style={s.label}>YOUR ORGANIZER</Text>
          <Text style={s.name} numberOfLines={1}>{organizer.name}</Text>
          {(organizer.role || organizer.company) && (
            <Text style={s.subtitle} numberOfLines={1}>
              {[organizer.role, organizer.company].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
      </View>

      {/* Action buttons */}
      {(organizer.phone || organizer.email) && (
        <View style={s.actions}>
          {organizer.phone && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityLabel={`Call ${organizer.name}`}
            >
              <Phone size={13} color={C.teal} strokeWidth={2} />
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
              <Mail size={13} color={C.teal} strokeWidth={2} />
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
      marginTop: S.md,
      backgroundColor: C.card,
      borderRadius: R.xl,
      padding: S.md,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: R.full,
    },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: R.full,
      backgroundColor: C.tealDim,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitials: {
      fontSize: T.md,
      fontWeight: T.bold,
      color: C.teal,
      letterSpacing: 0.5,
    },
    info: { flex: 1 },
    label: {
      fontSize: 10,
      fontWeight: T.bold,
      color: C.textTertiary,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: 2,
    },
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
      gap: 6,
      paddingVertical: S.xs + 2,
      borderRadius: R.md,
      backgroundColor: C.tealDim,
    },
    actionText: {
      fontSize: T.xs,
      fontWeight: T.bold,
      color: C.teal,
      letterSpacing: 1,
    },
  });
}
