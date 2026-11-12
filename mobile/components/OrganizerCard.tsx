import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import * as Haptics from "@/services/haptics";
import { Phone, Envelope, CaretRight } from "phosphor-react-native";
import { type ThemeColors, T, S } from "@/constants/theme";
import { Avatar } from "@/components/ui/Avatar";
import type { TripOrganizer } from "@/shared/types";

interface OrganizerCardProps {
  organizer: TripOrganizer;
  C: ThemeColors;
  isLeader?: boolean;
  /** Opens their details; leave out where there's no trip to open them from */
  onPress?: () => void;
  /** A smaller row with no Call or Email buttons; tapping it still opens their details */
  compact?: boolean;
}

export function OrganizerCard({ organizer, C, isLeader = false, onPress, compact = false }: OrganizerCardProps) {
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

  // Leaders get Call and Email as round icon buttons beside the name; tapping the row opens their details
  const actions = isLeader && !compact ? [
    organizer.phone ? { key: "call", Icon: Phone, label: `Call ${organizer.name}`, onPress: handleCall } : null,
    organizer.email ? { key: "email", Icon: Envelope, label: `Email ${organizer.name}`, onPress: handleEmail } : null,
  ].filter((a): a is NonNullable<typeof a> => !!a) : [];

  return (
    <View style={[s.card, s.topRow]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityHint={onPress ? "Shows their details" : undefined}
        style={({ pressed }) => [s.topRow, { flex: 1, opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar size={compact ? 36 : 44} uri={organizer.avatar} initials={initials} />

        {/* Info */}
        <View style={s.info}>
          <Text style={s.name} numberOfLines={1}>{organizer.name}</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            {["Your organiser", organizer.role, organizer.company].filter(Boolean).join(", ")}
          </Text>
        </View>
        {onPress && !actions.length ? <CaretRight size={14} color={C.textTertiary} weight="regular" /> : null}
      </Pressable>

      {actions.map(({ key, Icon, label, onPress: act }) => (
        <Pressable
          key={key}
          onPress={act}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [s.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon size={18} color={C.tealText} weight="fill" />
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    // Boxless: sits on the page at the standard 16pt gutter
    card: {
      marginHorizontal: S.md,
      marginTop: S.sm,
      paddingVertical: S.sm,
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
    // Round, like the Call and Mail buttons in Contacts; 40pt plus hitSlop clears the 44pt touch target
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.tealDim,
    },
  });
}
