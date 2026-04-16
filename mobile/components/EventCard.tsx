import { View, Text, Image, StyleSheet, Pressable, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Plane, Hotel, Compass, Utensils,
  MapPin, Clock, ArrowRight, Hash, Tag, Paperclip, FileText,
} from "lucide-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TravelEvent, EventDocument } from "@/shared/types";

// ── Documents badge — tiny counter chip ───────────────────────────────────────
function DocsBadge({ count, color }: { count: number; color: string }) {
  if (!count) return null;
  return (
    <View style={[docsBadge.wrap, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
      <Paperclip size={9} color={color} strokeWidth={2} />
      <Text style={[docsBadge.text, { color }]}>{count}</Text>
    </View>
  );
}
const docsBadge = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: R.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: T.xs, fontWeight: "800", letterSpacing: 0.5 },
});

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status, color }: { status: string; color: string }) {
  return (
    <View style={[chip.wrap, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
      <Text style={[chip.text, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: R.full, borderWidth: StyleSheet.hairlineWidth },
  text: { fontSize: T.xs, fontWeight: "800", letterSpacing: 0.8 },
});

// ── Compact Card — used when event data is sparse ─────────────────────────────
function CompactCard({
  ev, C, color, Icon, label, originCode,
}: {
  ev: TravelEvent; C: ThemeColors; color: string;
  Icon: React.ComponentType<any>;
  label: string;
  originCode?: string;
}) {
  const s = makeCompactStyles(C, color);
  return (
    <View style={s.card}>
      {ev.image ? (
        <Image source={{ uri: ev.image }} style={s.thumb} />
      ) : (
        <View style={s.iconBox}>
          <Icon size={15} color={color} strokeWidth={1.8} />
        </View>
      )}

      {ev.time ? (
        <View style={s.timeCol}>
          <Text style={s.timeVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {ev.time.split(" ")[0]}
          </Text>
          {ev.time.split(" ")[1] ? (
            <Text style={s.timeAmPm} numberOfLines={1}>{ev.time.split(" ")[1]}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={s.content}>
        <View style={s.labelRow}>
          <Text style={[s.label, { color }]}>{label}</Text>
          {originCode ? <Text style={s.origin}>· {originCode}</Text> : null}
        </View>
        <Text style={s.title} numberOfLines={1}>{ev.title}</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <DocsBadge count={ev.documents?.length ?? 0} color={color} />
        {ev.status ? <StatusChip status={ev.status} color={color} /> : null}
      </View>
    </View>
  );
}

function makeCompactStyles(C: ThemeColors, color: string) {
  return StyleSheet.create({
    card: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      paddingVertical: S.sm, paddingHorizontal: S.sm,
    },
    thumb: { width: 44, height: 44, borderRadius: R.md },
    iconBox: {
      width: 44, height: 44, borderRadius: R.md,
      backgroundColor: `${color}15`,
      alignItems: "center", justifyContent: "center",
    },
    timeCol: { alignItems: "center", width: 58 },
    timeVal: { fontSize: T.md, fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.3, lineHeight: 18 },
    timeAmPm: { fontSize: 9, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 1 },
    content: { flex: 1, minWidth: 0 },
    labelRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
    label: { fontSize: T.xs, fontWeight: T.black, letterSpacing: 1.2, textTransform: "uppercase" },
    origin: { fontSize: T.xs, fontWeight: T.black, color: C.textTertiary, letterSpacing: 0.5 },
    title: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary },
  });
}

// ── Flight Card ───────────────────────────────────────────────────────────────
function FlightCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const parts = ev.location?.match(/^(.+?)\s+to\s+(.+)$/i);
  const from      = parts?.[1]?.trim() ?? ev.location ?? "";
  const to        = parts?.[2]?.trim() ?? "";

  // Sparse: no destination → route viz breaks, use compact row.
  if (!to) {
    const originCode = from ? (from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase()) : undefined;
    return <CompactCard ev={ev} C={C} color={C.flight} Icon={Plane} label="FLIGHT" originCode={originCode} />;
  }

  const fromCode  = from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase();
  const toCode    = to.length <= 4   ? to.toUpperCase()   : to.slice(0, 3).toUpperCase();
  const fromLabel = from.length > 4  ? from.slice(0, 14)  : "Departure";
  const toLabel   = to.length > 4    ? to.slice(0, 14)    : "Arrival";

  const s = makeFlightStyles(C);
  return (
    <View style={s.card}>
      {/* Left: time + icon */}
      <View style={s.timeCol}>
        <View style={s.iconBox}>
          <Plane size={13} color={C.flight} strokeWidth={1.8} />
        </View>
        {ev.time ? (
          <>
            <Text style={s.timeVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {ev.time.split(" ")[0]}
            </Text>
            {ev.time.split(" ")[1] && (
              <Text style={s.timeAmPm} numberOfLines={1}>{ev.time.split(" ")[1]}</Text>
            )}
          </>
        ) : null}
      </View>

      {/* Center: route */}
      <View style={s.routeCol}>
        <View style={s.routeRow}>
          <View style={s.airport}>
            <Text style={s.airportCode} numberOfLines={1}>{fromCode}</Text>
            <Text style={s.airportLabel} numberOfLines={1}>{fromLabel}</Text>
          </View>
          <View style={s.routeLine}>
            <View style={s.dash} />
            <Plane size={10} color={C.textTertiary} strokeWidth={1.5} />
            <View style={s.dash} />
          </View>
          {to ? (
            <View style={s.airport}>
              <Text style={s.airportCode} numberOfLines={1}>{toCode}</Text>
              <Text style={s.airportLabel} numberOfLines={1}>{toLabel}</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.title} numberOfLines={1}>{ev.title}</Text>

        <View style={s.metaRow}>
          {ev.airline ? (
            <Text style={s.meta}>
              {ev.airline}{ev.flightNum ? ` · ${ev.flightNum}` : ""}
            </Text>
          ) : null}
          {ev.duration ? (
            <View style={s.metaChip}>
              <Clock size={9} color={C.textTertiary} strokeWidth={1.5} />
              <Text style={s.meta}>{ev.duration}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right: status + docs */}
      {(ev.status || (ev.documents?.length ?? 0) > 0) ? (
        <View style={s.statusWrap}>
          {ev.status ? <StatusChip status={ev.status} color={C.flight} /> : null}
          <DocsBadge count={ev.documents?.length ?? 0} color={C.flight} />
        </View>
      ) : null}
    </View>
  );
}

function makeFlightStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      paddingVertical: S.sm, paddingHorizontal: S.md, gap: S.sm,
    },
    // Wide enough for "12:00 AM" without wrapping, plus auto-shrink as fallback
    timeCol: { alignItems: "center", width: 64 },
    iconBox: {
      width: 32, height: 32, borderRadius: R.sm,
      backgroundColor: `${C.flight}18`,
      alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    timeVal: { fontSize: T.lg, fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.5, lineHeight: 22 },
    timeAmPm: { fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.5, textTransform: "uppercase" },

    routeCol: { flex: 1 },
    routeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    // Wide enough for 3-char IATA codes (e.g. "MAN") at 24px bold without wrapping
    airport: { alignItems: "center", width: 56 },
    airportCode: { fontSize: T["2xl"], fontWeight: T.black, color: C.textPrimary, letterSpacing: -0.5, lineHeight: 28 },
    airportLabel: { fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.3, textTransform: "uppercase", maxWidth: 56 },
    routeLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: 3 },
    dash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 0.5, borderColor: C.border },

    title: { fontSize: T.sm, fontWeight: T.bold, color: C.textSecondary, marginBottom: 3 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    metaChip: { flexDirection: "row", alignItems: "center", gap: 3 },
    meta: { fontSize: T.xs, fontWeight: T.bold, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 0.3 },
    statusWrap: { alignSelf: "flex-start", flexDirection: "column", alignItems: "flex-end", gap: 4 },
  });
}

// ── Hotel Card ────────────────────────────────────────────────────────────────
function HotelCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  // Sparse: no checkin/out, no roomType, no location → compact row.
  const isSparse = !ev.checkin && !ev.checkout && !ev.roomType && !ev.location;
  if (isSparse) {
    return <CompactCard ev={ev} C={C} color={C.hotel} Icon={Hotel} label="ACCOMMODATION" />;
  }
  const s = makeHotelStyles(C);
  return (
    <View style={s.card}>
      {/* Left: image or placeholder */}
      {ev.image ? (
        <Image source={{ uri: ev.image }} style={s.image} />
      ) : (
        <View style={s.imagePlaceholder}>
          <Hotel size={22} color={C.hotel} strokeWidth={1.5} style={{ opacity: 0.35 }} />
        </View>
      )}

      {/* Right: content */}
      <View style={s.content}>
        <View style={s.topRow}>
          <Hotel size={11} color={C.hotel} strokeWidth={1.8} />
          <Text style={s.typeLabel}>ACCOMMODATION</Text>
        </View>
        <Text style={s.title} numberOfLines={2}>{ev.title}</Text>
        {ev.location ? (
          <View style={s.locationRow}>
            <MapPin size={9} color={C.textTertiary} strokeWidth={1.5} />
            <Text style={s.locationText} numberOfLines={1}>{ev.location}</Text>
          </View>
        ) : null}

        <View style={s.divider} />

        {/* Check-in / Check-out row */}
        {ev.checkin ? (
          <View style={s.checkinRow}>
            <View>
              <Text style={s.checkLabel}>CHECK IN</Text>
              <Text style={s.checkVal}>{ev.checkin}</Text>
            </View>
            {ev.checkout ? (
              <>
                <ArrowRight size={12} color={C.hotel} strokeWidth={2} />
                <View>
                  <Text style={s.checkLabel}>CHECK OUT</Text>
                  <Text style={s.checkVal}>{ev.checkout}</Text>
                </View>
              </>
            ) : null}
          </View>
        ) : ev.time ? (
          <Text style={s.checkVal}>{ev.time}</Text>
        ) : null}

        {/* Badges row — separate line so they never overlap checkin times */}
        {(ev.roomType || ev.status || (ev.documents?.length ?? 0) > 0) ? (
          <View style={s.badgesRow}>
            {ev.roomType ? (
              <View style={s.roomBadge}>
                <Text style={s.roomText} numberOfLines={1}>{ev.roomType}</Text>
              </View>
            ) : null}
            {ev.status ? <StatusChip status={ev.status} color={C.hotel} /> : null}
            <DocsBadge count={ev.documents?.length ?? 0} color={C.hotel} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeHotelStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden", minHeight: 120,
    },
    image: { width: 96, alignSelf: "stretch" },
    imagePlaceholder: {
      width: 96, alignSelf: "stretch",
      backgroundColor: `${C.hotel}08`,
      alignItems: "center", justifyContent: "center",
      borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border,
    },
    content: { flex: 1, padding: S.sm },
    topRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
    typeLabel: { fontSize: T.xs, fontWeight: T.black, color: C.hotel, letterSpacing: 1.2 },
    title: { fontSize: T.base, fontWeight: T.bold, color: C.textPrimary, marginBottom: 3 },
    locationRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    locationText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, flex: 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.xs },
    checkinRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
    checkLabel: { fontSize: T.xs, fontWeight: T.black, color: C.textTertiary, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
    checkVal: { fontSize: T.sm, fontWeight: T.black, color: C.textPrimary },
    badgesRow: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap", marginTop: 6 },
    roomBadge: {
      backgroundColor: `${C.hotel}18`, borderRadius: R.full,
      paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1,
      borderWidth: StyleSheet.hairlineWidth, borderColor: `${C.hotel}30`,
    },
    roomText: { fontSize: T.xs, fontWeight: T.bold, color: C.hotel },
  });
}

// ── Activity / Dining Card ────────────────────────────────────────────────────
function ActivityCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const isDining = ev.type === "dining";
  const color    = isDining ? C.dining : C.activity;
  const Icon     = isDining ? Utensils : Compass;
  const label    = isDining ? "DINING" : "ACTIVITY";

  // Sparse: no notes, no endTime, no location → compact row (image becomes thumbnail).
  const isSparse = !ev.notes && !ev.endTime && !ev.location;
  if (isSparse) {
    return <CompactCard ev={ev} C={C} color={color} Icon={Icon} label={label} />;
  }

  const s = makeActivityStyles(C, color);
  return (
    <View style={s.card}>
      {/* Left: image or placeholder */}
      {ev.image ? (
        <Image source={{ uri: ev.image }} style={s.image} />
      ) : (
        <View style={s.imagePlaceholder}>
          <Icon size={22} color={color} strokeWidth={1.5} style={{ opacity: 0.3 }} />
        </View>
      )}

      {/* Right: content */}
      <View style={s.content}>
        <View style={s.topRow}>
          <Icon size={11} color={color} strokeWidth={1.8} />
          <Text style={[s.typeLabel, { color }]}>{label}</Text>
        </View>
        <Text style={s.title} numberOfLines={2}>{ev.title}</Text>
        {ev.location ? (
          <View style={s.locationRow}>
            <MapPin size={9} color={C.textTertiary} strokeWidth={1.5} />
            <Text style={s.locationText} numberOfLines={1}>{ev.location}</Text>
          </View>
        ) : null}
        {ev.notes ? (
          <Text style={s.notes} numberOfLines={2}>{ev.notes}</Text>
        ) : null}

        <View style={s.divider} />

        <View style={s.bottomRow}>
          {ev.time ? <Text style={s.timeVal}>{ev.time}</Text> : null}
          {ev.endTime ? <Text style={s.endTime}>→ {ev.endTime}</Text> : null}
          {ev.status ? <StatusChip status={ev.status} color={color} /> : null}
          {ev.price ? (
            <View style={[s.priceBadge, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
              <Tag size={8} color={color} strokeWidth={1.5} />
              <Text style={[s.priceText, { color }]}>{ev.price}</Text>
            </View>
          ) : null}
          <DocsBadge count={ev.documents?.length ?? 0} color={color} />
        </View>
      </View>
    </View>
  );
}

function makeActivityStyles(C: ThemeColors, color: string) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      backgroundColor: C.card, borderRadius: R.xl,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      overflow: "hidden", minHeight: 120,
    },
    image: { width: 96, alignSelf: "stretch" },
    imagePlaceholder: {
      width: 96, alignSelf: "stretch",
      backgroundColor: `${color}08`,
      alignItems: "center", justifyContent: "center",
      borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border,
    },
    content: { flex: 1, padding: S.sm },
    topRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
    typeLabel: { fontSize: T.xs, fontWeight: T.black, letterSpacing: 1.2 },
    title: { fontSize: T.base, fontWeight: T.bold, color: C.textPrimary, marginBottom: 3 },
    locationRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    locationText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium, flex: 1 },
    notes: { fontSize: T.sm, color: C.textTertiary, lineHeight: 18, marginTop: 3, fontWeight: T.regular },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.xs },
    bottomRow: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap" },
    timeVal: { fontSize: T.sm, fontWeight: T.black, color: C.textPrimary },
    endTime: { fontSize: T.sm, fontWeight: T.bold, color: C.textTertiary },
    priceBadge: {
      flexDirection: "row", alignItems: "center", gap: 3,
      borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 2,
      borderWidth: StyleSheet.hairlineWidth,
    },
    priceText: { fontSize: T.xs, fontWeight: T.bold },
  });
}

// ── Conf number row ────────────────────────────────────────────────────────────
export function ConfRow({ confNumber, C }: { confNumber: string; C: ThemeColors }) {
  const s = StyleSheet.create({
    row: {
      flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6,
      backgroundColor: `${C.teal}10`, paddingHorizontal: S.xs, paddingVertical: 4,
      borderRadius: R.sm, alignSelf: "flex-start",
      borderWidth: StyleSheet.hairlineWidth, borderColor: `${C.teal}25`,
    },
    label: { fontSize: T.xs, fontWeight: T.black as any, color: C.teal, letterSpacing: 1.5 },
    value: { fontSize: T.sm, fontWeight: T.bold as any, color: C.teal, letterSpacing: 0.5 },
  });
  return (
    <View style={s.row}>
      <Hash size={10} color={C.teal} strokeWidth={2} />
      <Text style={s.label}>CONF</Text>
      <Text style={s.value}>{confNumber}</Text>
    </View>
  );
}

// ── Docs row — tappable attachment list ──────────────────────────────────────
export function DocsRow({ documents, C }: { documents: EventDocument[]; C: ThemeColors }) {
  if (!documents.length) return null;

  const handlePress = async (doc: EventDocument) => {
    // Data URLs can't be opened directly on iOS without writing to disk.
    // For v1, copy the URL to clipboard so the user can paste/open in a browser,
    // and show an Alert with file metadata.
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
      paddingHorizontal: S.sm, paddingVertical: 7,
      backgroundColor: `${C.teal}0c`,
      borderRadius: R.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: `${C.teal}22`,
    },
    iconBox: {
      width: 22, height: 22, borderRadius: R.sm,
      backgroundColor: `${C.teal}20`,
      alignItems: "center", justifyContent: "center",
    },
    name: { fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary, flex: 1 },
    size: { fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary, letterSpacing: 0.3 },
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
