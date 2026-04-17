import { View, Text, Image, StyleSheet, Pressable, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Plane, Hotel, Compass, Utensils,
  MapPin, ArrowRight, Hash, FileText, Tag,
} from "lucide-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TravelEvent, EventDocument } from "@/shared/types";

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status, C }: { status: string; C: ThemeColors }) {
  return (
    <View style={[chip.wrap, { backgroundColor: C.elevated }]}>
      <Text style={[chip.text, { color: C.textSecondary }]}>{status.toUpperCase()}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full },
  text: { fontSize: T.xs, fontWeight: "700", letterSpacing: 0.6 },
});

// ── Flight Card ───────────────────────────────────────────────────────────────
function FlightCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const parts = ev.location?.match(/^(.+?)\s+to\s+(.+)$/i);
  const from = parts?.[1]?.trim() ?? ev.location ?? "";
  const to = parts?.[2]?.trim() ?? "";

  const fromCode = from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase();
  const toCode = to ? (to.length <= 4 ? to.toUpperCase() : to.slice(0, 3).toUpperCase()) : "";
  const fromLabel = from.length > 4 ? from.slice(0, 18) : "Departure";
  const toLabel = to.length > 4 ? to.slice(0, 18) : "Arrival";

  const s = makeFlightStyles(C);
  return (
    <View style={s.card}>
      {/* Header bar */}
      <View style={s.header}>
        <View style={s.iconBox}>
          <Plane size={14} color={C.flight} strokeWidth={1.8} />
        </View>
        <View style={s.headerText}>
          <Text style={s.typeLabel}>Flight</Text>
          {ev.airline ? (
            <Text style={s.airline}>{ev.airline}{ev.flightNum ? ` · ${ev.flightNum}` : ""}</Text>
          ) : null}
        </View>
        {ev.time ? (
          <View style={s.timeBadge}>
            <Text style={s.timeText}>{ev.time}</Text>
          </View>
        ) : null}
      </View>

      {/* Route visualization */}
      {to ? (
        <View style={s.routeSection}>
          <View style={s.airport}>
            <Text style={s.airportCode}>{fromCode}</Text>
            <Text style={s.airportLabel} numberOfLines={1}>{fromLabel}</Text>
          </View>
          <View style={s.routeLine}>
            <View style={s.dash} />
            <View style={s.planeCircle}>
              <Plane size={12} color={C.flight} strokeWidth={1.8} />
            </View>
            <View style={s.dash} />
          </View>
          <View style={s.airport}>
            <Text style={s.airportCode}>{toCode}</Text>
            <Text style={s.airportLabel} numberOfLines={1}>{toLabel}</Text>
          </View>
        </View>
      ) : null}

      {/* Title + description */}
      <Text style={s.title} numberOfLines={2}>{ev.title}</Text>
      {ev.description ? <Text style={s.desc}>{ev.description}</Text> : null}

      {/* Metadata grid */}
      {(() => {
        const cells = [
          ev.terminal && { label: "Terminal", value: ev.terminal },
          ev.gate && { label: "Gate", value: ev.gate },
          ev.seatDetails && { label: "Seat", value: ev.seatDetails },
          ev.duration && { label: "Duration", value: ev.duration },
        ].filter(Boolean) as Array<{ label: string; value: string }>;
        if (cells.length === 0) return null;
        return (
          <View style={s.metaGrid}>
            {cells.map(c => (
              <View key={c.label} style={s.metaCell}>
                <Text style={s.metaCellLabel}>{c.label}</Text>
                <Text style={s.metaCellValue} numberOfLines={1}>{c.value}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      {/* Status row */}
      {ev.status ? (
        <View style={s.bottomRow}>
          <StatusChip status={ev.status} C={C} />
        </View>
      ) : null}
    </View>
  );
}

function makeFlightStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card, borderRadius: R.xl, padding: S.md,
    },
    header: {
      flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.sm,
    },
    iconBox: {
      width: 36, height: 36, borderRadius: R.md,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    headerText: { flex: 1 },
    typeLabel: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary },
    airline: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary, marginTop: 1 },
    timeBadge: {
      backgroundColor: C.elevated, borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    timeText: { fontSize: T.xs, fontWeight: T.bold, color: C.flight },

    routeSection: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: C.elevated, borderRadius: R.lg,
      padding: S.md, marginBottom: S.sm,
    },
    airport: { alignItems: "center", width: 70 },
    airportCode: {
      fontSize: T["2xl"] + 2, fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: -0.5, lineHeight: 30,
    },
    airportLabel: {
      fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary,
      marginTop: 2, maxWidth: 70,
    },
    routeLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
    dash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 0.5, borderColor: C.border },
    planeCircle: {
      width: 28, height: 28, borderRadius: R.full,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },

    title: { fontSize: T.base, fontWeight: T.bold, color: C.textSecondary, marginBottom: 3 },
    desc: { fontSize: T.sm, color: C.textTertiary, lineHeight: 20, marginBottom: S.xs },

    metaGrid: {
      flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: S.xs,
    },
    metaCell: {
      backgroundColor: C.elevated, borderRadius: R.sm,
      paddingHorizontal: 10, paddingVertical: 6, minWidth: 70,
    },
    metaCellLabel: { fontSize: 9, fontWeight: T.semibold, color: C.textTertiary, letterSpacing: 0.5, marginBottom: 2 },
    metaCellValue: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary },

    bottomRow: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      marginTop: S.sm,
    },
  });
}

// ── Hotel Card ────────────────────────────────────────────────────────────────
function HotelCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const s = makeHotelStyles(C);
  return (
    <View style={s.card}>
      {/* Image banner */}
      {ev.image ? (
        <Image source={{ uri: ev.image }} style={s.imageBanner} />
      ) : (
        <View style={s.imagePlaceholder}>
          <Hotel size={28} color={C.hotel} strokeWidth={1.2} style={{ opacity: 0.3 }} />
        </View>
      )}

      <View style={s.content}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.iconBox}>
            <Hotel size={13} color={C.hotel} strokeWidth={1.8} />
          </View>
          <Text style={s.typeLabel}>Accommodation</Text>
          {ev.time ? (
            <Text style={s.time}>{ev.time}</Text>
          ) : null}
        </View>

        <Text style={s.title} numberOfLines={2}>{ev.title}</Text>
        {ev.description ? <Text style={s.desc}>{ev.description}</Text> : null}

        {ev.location ? (
          <View style={s.locationRow}>
            <MapPin size={11} color={C.textTertiary} strokeWidth={1.5} />
            <Text style={s.locationText} numberOfLines={1}>{ev.location}</Text>
          </View>
        ) : null}

        {/* Check-in / Check-out */}
        {(ev.checkin || ev.checkout) ? (
          <View style={s.checkRow}>
            {ev.checkin ? (
              <View style={s.checkBlock}>
                <Text style={s.checkLabel}>Check in</Text>
                <Text style={s.checkVal}>{ev.checkin}</Text>
              </View>
            ) : null}
            {ev.checkin && ev.checkout ? (
              <ArrowRight size={14} color={C.hotel} strokeWidth={2} />
            ) : null}
            {ev.checkout ? (
              <View style={s.checkBlock}>
                <Text style={s.checkLabel}>Check out</Text>
                <Text style={s.checkVal}>{ev.checkout}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Bottom badges */}
        {(ev.roomType || ev.status) ? (
          <View style={s.badgesRow}>
            {ev.roomType ? (
              <View style={s.roomBadge}>
                <Text style={s.roomText} numberOfLines={1}>{ev.roomType}</Text>
              </View>
            ) : null}
            {ev.status ? <StatusChip status={ev.status} C={C} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeHotelStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card, borderRadius: R.xl, overflow: "hidden",
    },
    imageBanner: { width: "100%", height: 140 },
    imagePlaceholder: {
      width: "100%", height: 100,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    content: { padding: S.md },
    header: {
      flexDirection: "row", alignItems: "center", gap: S.xs, marginBottom: S.xs,
    },
    iconBox: {
      width: 30, height: 30, borderRadius: R.sm,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    typeLabel: { flex: 1, fontSize: T.xs, fontWeight: T.bold, color: C.hotel, letterSpacing: 0.5 },
    time: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary },

    title: { fontSize: T.lg, fontWeight: T.bold, color: C.textPrimary, marginBottom: 4 },
    desc: { fontSize: T.sm, color: C.textTertiary, lineHeight: 20, marginBottom: S.xs },

    locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: S.sm },
    locationText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, flex: 1 },

    checkRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      backgroundColor: C.elevated, borderRadius: R.lg,
      padding: S.sm, marginBottom: S.xs,
    },
    checkBlock: {},
    checkLabel: { fontSize: 9, fontWeight: T.semibold, color: C.textTertiary, letterSpacing: 0.5, marginBottom: 2 },
    checkVal: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary },

    badgesRow: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap", marginTop: S.xs },
    roomBadge: {
      backgroundColor: C.elevated, borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    roomText: { fontSize: T.xs, fontWeight: T.bold, color: C.hotel },
  });
}

// ── Activity / Dining Card ────────────────────────────────────────────────────
function ActivityCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const isDining = ev.type === "dining";
  const color = isDining ? C.dining : C.activity;
  const Icon = isDining ? Utensils : Compass;
  const label = isDining ? "Dining" : "Activity";

  const s = makeActivityStyles(C);
  return (
    <View style={s.card}>
      {/* Image banner */}
      {ev.image ? (
        <Image source={{ uri: ev.image }} style={s.imageBanner} />
      ) : (
        <View style={s.imagePlaceholder}>
          <Icon size={28} color={color} strokeWidth={1.2} style={{ opacity: 0.25 }} />
        </View>
      )}

      <View style={s.content}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.iconBox}>
            <Icon size={13} color={color} strokeWidth={1.8} />
          </View>
          <Text style={[s.typeLabel, { color }]}>{label}</Text>
          {ev.time ? (
            <View style={s.timeBadge}>
              <Text style={[s.timeText, { color }]}>{ev.time}</Text>
              {ev.endTime ? <Text style={[s.timeText, { color, opacity: 0.6 }]}> → {ev.endTime}</Text> : null}
            </View>
          ) : null}
        </View>

        <Text style={s.title} numberOfLines={2}>{ev.title}</Text>
        {ev.description ? <Text style={s.desc}>{ev.description}</Text> : null}

        {ev.location ? (
          <View style={s.locationRow}>
            <MapPin size={11} color={C.textTertiary} strokeWidth={1.5} />
            <Text style={s.locationText} numberOfLines={1}>{ev.location}</Text>
          </View>
        ) : null}

        {ev.notes ? (
          <View style={s.notesBox}>
            <Text style={s.notes}>{ev.notes}</Text>
          </View>
        ) : null}

        {/* Bottom badges */}
        {(ev.status || ev.price) ? (
          <View style={s.bottomRow}>
            {ev.status ? <StatusChip status={ev.status} C={C} /> : null}
            {ev.price ? (
              <View style={s.priceBadge}>
                <Tag size={9} color={color} strokeWidth={1.5} />
                <Text style={[s.priceText, { color }]}>{ev.price}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeActivityStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card, borderRadius: R.xl, overflow: "hidden",
    },
    imageBanner: { width: "100%", height: 140 },
    imagePlaceholder: {
      width: "100%", height: 80,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    content: { padding: S.md },
    header: {
      flexDirection: "row", alignItems: "center", gap: S.xs, marginBottom: S.xs,
    },
    iconBox: {
      width: 30, height: 30, borderRadius: R.sm,
      backgroundColor: C.elevated,
      alignItems: "center", justifyContent: "center",
    },
    typeLabel: { flex: 1, fontSize: T.xs, fontWeight: T.bold, letterSpacing: 0.5 },
    timeBadge: {
      backgroundColor: C.elevated, borderRadius: R.full,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    timeText: { fontSize: T.xs, fontWeight: T.bold },

    title: { fontSize: T.lg, fontWeight: T.bold, color: C.textPrimary, marginBottom: 4 },
    desc: { fontSize: T.sm, color: C.textTertiary, lineHeight: 20, marginBottom: S.xs },

    locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: S.xs },
    locationText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, flex: 1 },

    notesBox: {
      backgroundColor: C.elevated, borderRadius: R.lg,
      padding: S.sm, marginBottom: S.xs,
    },
    notes: { fontSize: T.sm, color: C.textSecondary, lineHeight: 20 },

    bottomRow: {
      flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap",
      marginTop: S.xs,
    },
    priceBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: C.elevated, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    priceText: { fontSize: T.xs, fontWeight: T.bold },
  });
}

// ── Conf number row ────────────────────────────────────────────────────────────
export function ConfRow({ confNumber, C }: { confNumber: string; C: ThemeColors }) {
  const s = StyleSheet.create({
    row: {
      flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6,
      backgroundColor: C.elevated, paddingHorizontal: S.sm, paddingVertical: 6,
      borderRadius: R.sm, alignSelf: "flex-start",
    },
    label: { fontSize: T.xs, fontWeight: T.bold as any, color: C.teal, letterSpacing: 1 },
    value: { fontSize: T.sm, fontWeight: T.bold as any, color: C.teal, letterSpacing: 0.5 },
  });
  return (
    <View style={s.row}>
      <Hash size={11} color={C.teal} strokeWidth={2} />
      <Text style={s.label}>CONF</Text>
      <Text style={s.value}>{confNumber}</Text>
    </View>
  );
}

// ── Docs row — tappable attachment list ──────────────────────────────────────
export function DocsRow({ documents, C }: { documents: EventDocument[]; C: ThemeColors }) {
  if (!documents.length) return null;

  const handlePress = async (doc: EventDocument) => {
    try {
      await Clipboard.setStringAsync(doc.url);
    } catch { /* ignore */ }
    const sizeKb = Math.max(1, Math.round(doc.size / 1024));
    const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    Alert.alert(
      doc.name,
      `${doc.mimeType || "file"} · ${sizeText}\n\nLink copied to clipboard.`,
      [{ text: "OK" }],
    );
  };

  const s = StyleSheet.create({
    wrap: { marginTop: 6, gap: 4 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: S.sm, paddingVertical: 8,
      backgroundColor: C.elevated,
      borderRadius: R.md,
    },
    iconBox: {
      width: 24, height: 24, borderRadius: R.sm,
      alignItems: "center", justifyContent: "center",
    },
    name: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary, flex: 1 },
    size: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary },
  });

  return (
    <View style={s.wrap}>
      {documents.map(doc => {
        const sizeKb = Math.max(1, Math.round(doc.size / 1024));
        const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        return (
          <Pressable
            key={doc.id}
            onPress={() => handlePress(doc)}
            style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${doc.name}`}
          >
            <View style={s.iconBox}>
              <FileText size={12} color={C.teal} strokeWidth={1.8} />
            </View>
            <Text style={s.name} numberOfLines={1}>{doc.name}</Text>
            <Text style={s.size}>{sizeText}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────
export function EventCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  if (ev.type === "flight") return <FlightCard ev={ev} C={C} />;
  if (ev.type === "hotel")  return <HotelCard  ev={ev} C={C} />;
  return <ActivityCard ev={ev} C={C} />;
}
