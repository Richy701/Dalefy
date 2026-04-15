import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Phone, CheckCircle2, Clock, AlertCircle, Mail, MessageSquare, Settings } from "lucide-react-native";
import { T, R, S, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { useMemo } from "react";

const TRAVELER = {
  name: "Alex Johnson",
  initials: "AJ",
  role: "Lead Traveller",
  passport: "GB 123 456 789",
  passportExpiry: "2028-03-15",
  nationality: "British",
  phone: "+44 7700 900123",
  email: "alex@email.com",
  emergency: { name: "Sarah Johnson", relation: "Spouse", phone: "+44 7700 900456" },
  preferences: {
    seat: "Window",
    meal: "Standard",
    room: "Twin bed",
    transfers: true,
    insurance: true,
  },
  documents: [
    { name: "Passport", status: "Valid", note: "Expires Mar 2028" },
    { name: "Travel Insurance", status: "Active", note: "Expires Dec 2026" },
    { name: "ESTA (USA)", status: "Valid", note: "Expires May 2027" },
  ],
};

const AGENT = {
  name: "DAF Adventures",
  phone: "+44 20 7946 0321",
  email: "concierge@dafadventures.com",
  hours: "Mon–Fri 9am–6pm",
};

function docColor(status: string, C: ThemeColors) {
  if (status === "Valid" || status === "Active") return C.green;
  if (status === "Pending") return C.amber;
  if (status === "Expired") return C.red;
  return C.textTertiary;
}

function DocStatusIcon({ status }: { status: string }) {
  const { C } = useTheme();
  const color = docColor(status, C);
  if (status === "Valid" || status === "Active") return <CheckCircle2 size={16} color={color} strokeWidth={2} />;
  if (status === "Pending") return <Clock size={16} color={color} strokeWidth={2} />;
  return <AlertCircle size={16} color={color} strokeWidth={2} />;
}

function PrefRow({ label, value, styles, C }: { label: string; value: string | boolean; styles: any; C: ThemeColors }) {
  const displayValue = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  const isYes = value === true;
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <View style={[styles.prefValue, isYes && { backgroundColor: C.tealDim, borderColor: C.tealMid }]}>
        <Text style={[styles.prefValueText, isYes && { color: C.teal }]}>{displayValue}</Text>
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: S.md, paddingBottom: S.lg },

    profileCard: {
      flexDirection: "row", alignItems: "center", gap: S.md,
      backgroundColor: C.card, borderRadius: R.xl, padding: S.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: S.lg,
    },
    avatarWrap: {
      width: 72, height: 72, borderRadius: R.full,
      backgroundColor: C.tealDim, borderWidth: 2, borderColor: C.tealMid,
      alignItems: "center", justifyContent: "center",
    },
    avatarText: { fontSize: T["2xl"], fontWeight: T.black, color: C.teal },
    profileInfo: { flex: 1 },
    brandLabel: { fontSize: T.xs, color: C.teal, fontWeight: T.bold, letterSpacing: 0.5, marginBottom: 3 },
    profileName: { fontSize: 22, fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.4, marginBottom: 2 },
    profileRole: { fontSize: T.sm, color: C.textSecondary, fontWeight: T.medium, marginBottom: 2 },
    profileNationality: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },
    settingsBtn: {
      width: 34, height: 34, borderRadius: R.full,
      backgroundColor: C.elevated, alignItems: "center", justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignSelf: "flex-start",
    },

    sectionLabel: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.textTertiary,
      marginBottom: S.xs, marginTop: S.sm,
    },
    card: {
      backgroundColor: C.card, borderRadius: R.lg, padding: S.sm,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: S.xs,
    },

    docRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9 },
    docRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    docLine: { flex: 1, fontSize: T.base },
    docName: { fontWeight: T.semibold, color: C.textPrimary },
    docSep: { color: C.textTertiary },
    docNote: { color: C.textTertiary, fontWeight: T.medium },

    passportRow: { flexDirection: "row", alignItems: "center" },
    passportItem: { flex: 1, alignItems: "center" },
    passportDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: C.border },
    passportLabel: { fontSize: T.xs - 1, fontWeight: T.semibold, color: C.textTertiary, marginBottom: 4 },
    passportValue: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary, letterSpacing: 0.3 },

    prefRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
    prefDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
    prefLabel: { flex: 1, fontSize: T.base, color: C.textSecondary, fontWeight: T.medium },
    prefValue: {
      backgroundColor: C.elevated, paddingHorizontal: S.xs, paddingVertical: 3,
      borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    prefValueText: { fontSize: T.sm, fontWeight: T.bold, color: C.textSecondary },

    emergencyName: { fontSize: T.lg, fontWeight: T.bold, color: C.textPrimary, marginBottom: 2 },
    emergencyRelation: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, marginBottom: S.sm },
    contactBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: C.tealDim, borderRadius: R.full,
      paddingHorizontal: S.sm, paddingVertical: S.xs,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid, alignSelf: "flex-start",
    },
    contactBtnText: { fontSize: T.sm, fontWeight: T.bold, color: C.teal },

    agentCard: { gap: S.sm },
    agentTop: { flexDirection: "row", alignItems: "center", gap: S.sm },
    agentIcon: {
      width: 44, height: 44, borderRadius: R.md,
      backgroundColor: C.tealDim, borderWidth: StyleSheet.hairlineWidth, borderColor: C.tealMid,
      alignItems: "center", justifyContent: "center",
    },
    agentIconText: { fontSize: T.sm, fontWeight: T.black, color: C.teal },
    agentInfo: { flex: 1 },
    agentName: { fontSize: T.md, fontWeight: T.bold, color: C.textPrimary, marginBottom: 2 },
    agentHours: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },
    agentBtns: { flexDirection: "row", gap: S.xs },
    agentBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 10, borderRadius: R.md,
      backgroundColor: C.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    agentBtnPrimary: { backgroundColor: C.teal, borderColor: C.teal },
    agentBtnText: { fontSize: T.sm, fontWeight: T.bold, color: C.teal },
    agentBtnPrimaryText: { fontSize: T.sm, fontWeight: T.bold, color: C.bg },
  });
}

export default function ProfileScreen() {
  const router = useRouter();
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Profile card — IS the header */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{TRAVELER.initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.brandLabel}>DAF Adventures</Text>
            <Text style={styles.profileName}>{TRAVELER.name}</Text>
            <Text style={styles.profileRole}>{TRAVELER.role}</Text>
            <Text style={styles.profileNationality}>{TRAVELER.nationality}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.settingsBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/settings")}
          >
            <Settings size={15} color={C.textSecondary} strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* Travel documents */}
        <Text style={styles.sectionLabel}>Travel Documents</Text>
        <View style={styles.card}>
          {TRAVELER.documents.map((doc, i) => (
            <View key={i} style={[styles.docRow, i < TRAVELER.documents.length - 1 && styles.docRowBorder]}>
              <DocStatusIcon status={doc.status} />
              <Text style={styles.docLine} numberOfLines={1}>
                <Text style={styles.docName}>{doc.name}</Text>
                <Text style={styles.docSep}> · </Text>
                <Text style={styles.docNote}>{doc.note}</Text>
              </Text>
            </View>
          ))}
        </View>

        {/* Passport details */}
        <Text style={styles.sectionLabel}>Passport</Text>
        <View style={styles.card}>
          <View style={styles.passportRow}>
            <View style={styles.passportItem}>
              <Text style={styles.passportLabel}>Number</Text>
              <Text style={styles.passportValue}>{TRAVELER.passport}</Text>
            </View>
            <View style={styles.passportDivider} />
            <View style={styles.passportItem}>
              <Text style={styles.passportLabel}>Nationality</Text>
              <Text style={styles.passportValue}>{TRAVELER.nationality}</Text>
            </View>
            <View style={styles.passportDivider} />
            <View style={styles.passportItem}>
              <Text style={styles.passportLabel}>Expires</Text>
              <Text style={[styles.passportValue, { color: C.green }]}>
                {new Date(TRAVELER.passportExpiry).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </Text>
            </View>
          </View>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Travel Preferences</Text>
        <View style={styles.card}>
          <PrefRow label="Seat preference" value={TRAVELER.preferences.seat} styles={styles} C={C} />
          <View style={styles.prefDivider} />
          <PrefRow label="Meal preference" value={TRAVELER.preferences.meal} styles={styles} C={C} />
          <View style={styles.prefDivider} />
          <PrefRow label="Room type" value={TRAVELER.preferences.room} styles={styles} C={C} />
          <View style={styles.prefDivider} />
          <PrefRow label="Airport transfers" value={TRAVELER.preferences.transfers} styles={styles} C={C} />
          <View style={styles.prefDivider} />
          <PrefRow label="Travel insurance" value={TRAVELER.preferences.insurance} styles={styles} C={C} />
        </View>

        {/* Emergency contact */}
        <Text style={styles.sectionLabel}>Emergency Contact</Text>
        <View style={styles.card}>
          <Text style={styles.emergencyName}>{TRAVELER.emergency.name}</Text>
          <Text style={styles.emergencyRelation}>{TRAVELER.emergency.relation}</Text>
          <Pressable
            style={({ pressed }) => [styles.contactBtn, { opacity: pressed ? 0.75 : 1 }]}
            onPress={() => Linking.openURL(`tel:${TRAVELER.emergency.phone}`)}
          >
            <Phone size={13} color={C.teal} strokeWidth={2} />
            <Text style={styles.contactBtnText}>{TRAVELER.emergency.phone}</Text>
          </Pressable>
        </View>

        {/* Contact agent */}
        <Text style={styles.sectionLabel}>Your Travel Agent</Text>
        <View style={[styles.card, styles.agentCard]}>
          <View style={styles.agentTop}>
            <View style={styles.agentIcon}>
              <Text style={styles.agentIconText}>DA</Text>
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{AGENT.name}</Text>
              <Text style={styles.agentHours}>{AGENT.hours}</Text>
            </View>
          </View>

          <View style={styles.agentBtns}>
            <Pressable
              style={({ pressed }) => [styles.agentBtn, styles.agentBtnPrimary, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => Linking.openURL(`tel:${AGENT.phone}`)}
            >
              <Phone size={14} color={C.bg} strokeWidth={2} />
              <Text style={styles.agentBtnPrimaryText}>Call</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.agentBtn, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => Linking.openURL(`mailto:${AGENT.email}`)}
            >
              <Mail size={14} color={C.teal} strokeWidth={1.8} />
              <Text style={styles.agentBtnText}>Email</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.agentBtn, { opacity: pressed ? 0.75 : 1 }]}
              onPress={() => Linking.openURL(`sms:${AGENT.phone}`)}
            >
              <MessageSquare size={14} color={C.teal} strokeWidth={1.8} />
              <Text style={styles.agentBtnText}>Message</Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
