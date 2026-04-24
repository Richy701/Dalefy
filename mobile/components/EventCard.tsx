import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { CachedImage } from "@/components/CachedImage";
import * as Clipboard from "expo-clipboard";
import {
  Plane, Hotel, Compass, Utensils, Car,
  MapPin, ArrowRight, Hash, FileText,
} from "lucide-react-native";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import type { TravelEvent, EventDocument } from "@/shared/types";

function formatDate(d: string): string {
  // Handle both "2026-07-15" and "2026-07-15T10:00:00" formats
  const raw = d.includes("T") ? d : d + "T12:00:00";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return d; // fallback to raw string
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ── Flight Card ──────────────────────────────────────────────────────────────
function FlightCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const routeMatch = ev.title?.match(/^(.+?)\s*[→➜>]\s*(.+)$/);
  const from = routeMatch?.[1]?.trim() ?? ev.location ?? ev.title;
  const to = routeMatch?.[2]?.trim() ?? "";

  const fromCode = from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase();
  const toCode = to ? (to.length <= 4 ? to.toUpperCase() : to.slice(0, 3).toUpperCase()) : "";
  const fromLabel = from.length > 4 ? from : "Departure";
  const toLabel = to.length > 4 ? to : "Arrival";

  const cells = [
    ev.terminal && { label: "Terminal", value: ev.terminal },
    ev.gate && { label: "Gate", value: ev.gate },
    ev.seatDetails && { label: "Seat", value: ev.seatDetails },
    ev.duration && { label: "Duration", value: ev.duration },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <View style={[cs.card, { backgroundColor: C.card }]}>
      {/* Header */}
      <View style={cs.header}>
        <View style={[cs.iconBox, { backgroundColor: C.elevated }]}>
          <Plane size={14} color={C.flight} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[cs.smallLabel, { color: C.flight }]}>Flight</Text>
          {ev.airline && (
            <Text style={[cs.meta, { color: C.textTertiary }]}>
              {ev.airline}{ev.flightNum ? ` · ${ev.flightNum}` : ""}
            </Text>
          )}
        </View>
        {ev.time && (
          <Text style={[cs.timeBadge, { color: C.flight, backgroundColor: C.elevated }]}>{ev.time}</Text>
        )}
      </View>

      {/* Route */}
      {to ? (
        <View style={[cs.routeSection, { backgroundColor: C.elevated }]}>
          <View style={cs.airport}>
            <Text style={[cs.airportCode, { color: C.textPrimary }]}>{fromCode}</Text>
            <Text style={[cs.airportLabel, { color: C.textTertiary }]} numberOfLines={1}>{fromLabel}</Text>
          </View>
          <View style={cs.routeLine}>
            <View style={[cs.dash, { borderColor: C.border }]} />
            <Plane size={11} color={C.flight} strokeWidth={1.8} style={{ opacity: 0.6 }} />
            <View style={[cs.dash, { borderColor: C.border }]} />
          </View>
          <View style={cs.airport}>
            <Text style={[cs.airportCode, { color: C.textPrimary }]}>{toCode}</Text>
            <Text style={[cs.airportLabel, { color: C.textTertiary }]} numberOfLines={1}>{toLabel}</Text>
          </View>
        </View>
      ) : (
        <Text style={[cs.title, { color: C.textPrimary }]}>{ev.title}</Text>
      )}

      {/* Meta details */}
      {cells.length > 0 && (
        <View style={cs.metaInline}>
          {cells.map((c, i) => (
            <Text key={c.label} style={[cs.metaInlineText, { color: C.textTertiary }]}>
              {i > 0 && "  ·  "}{c.label} <Text style={{ color: C.textPrimary, fontWeight: T.bold }}>{c.value}</Text>
            </Text>
          ))}
        </View>
      )}

      {ev.notes && (
        <Text style={[cs.notesFlat, { color: C.textTertiary }]}>{ev.notes}</Text>
      )}

      {/* Footer */}
      {(ev.status || ev.confNumber) && (
        <View style={[cs.footer, { marginTop: S.sm }]}>
          {ev.status && (
            <Text style={[cs.statusInline, { color: C.textDim }]}>{ev.status.toUpperCase()}</Text>
          )}
          <View style={{ flex: 1 }} />
          {ev.confNumber && (
            <View style={cs.confRow}>
              <Hash size={10} color={C.textDim} strokeWidth={2} />
              <Text style={[cs.confText, { color: C.textDim }]}>{ev.confNumber}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Hotel Card ───────────────────────────────────────────────────────────────
function HotelCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  return (
    <View style={[cs.card, { backgroundColor: C.card, overflow: "hidden" }]}>
      {ev.image && (
        <CachedImage uri={ev.image} style={cs.imageBanner} />
      )}

      <View style={cs.content}>
        {/* Header */}
        <View style={cs.header}>
          <View style={[cs.iconBox, { backgroundColor: C.elevated }]}>
            <Hotel size={13} color={C.hotel} strokeWidth={1.8} />
          </View>
          <Text style={[cs.smallLabel, { color: C.hotel, flex: 1 }]}>Stay</Text>
          {ev.time && <Text style={[cs.meta, { color: C.textTertiary }]}>{ev.time}</Text>}
        </View>

        <Text style={[cs.title, { color: C.textPrimary }]} numberOfLines={2}>{ev.title}</Text>

        {ev.location && (
          <View style={cs.locationRow}>
            <MapPin size={11} color={C.textTertiary} strokeWidth={1.5} />
            <Text style={[cs.locationText, { color: C.textTertiary }]}>{ev.location}</Text>
          </View>
        )}

        {/* Check-in / Check-out */}
        {(ev.checkin || ev.checkout) && (
          <View style={[cs.checkRow, { backgroundColor: C.elevated }]}>
            {ev.checkin && (
              <View style={{ flex: 1 }}>
                <Text style={[cs.checkLabel, { color: C.textTertiary }]}>Check in</Text>
                <Text style={[cs.checkVal, { color: C.textPrimary }]}>{formatDate(ev.checkin)}</Text>
              </View>
            )}
            {ev.checkin && ev.checkout && (
              <ArrowRight size={14} color={C.hotel} strokeWidth={2} />
            )}
            {ev.checkout && (
              <View style={{ flex: 1, alignItems: ev.checkin ? "flex-end" : "flex-start" }}>
                <Text style={[cs.checkLabel, { color: C.textTertiary }]}>Check out</Text>
                <Text style={[cs.checkVal, { color: C.textPrimary }]}>{formatDate(ev.checkout)}</Text>
              </View>
            )}
          </View>
        )}

        {ev.roomType && (
          <Text style={[cs.roomType, { color: C.hotel }]}>{ev.roomType}</Text>
        )}

        {ev.notes && (
          <Text style={[cs.notesFlat, { color: C.textTertiary }]}>{ev.notes}</Text>
        )}

        {ev.confNumber && (
          <View style={[cs.footer, { marginTop: S.sm }]}>
            <View style={{ flex: 1 }} />
            <View style={cs.confRow}>
              <Hash size={10} color={C.textDim} strokeWidth={2} />
              <Text style={[cs.confText, { color: C.textDim }]}>{ev.confNumber}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Activity / Dining Card ───────────────────────────────────────────────────
function ActivityCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  const isDining = ev.type === "dining";
  const isTransfer = ev.type === "transfer";
  const color = isDining ? C.dining : isTransfer ? (C as any).transfer ?? C.activity : C.activity;
  const Icon = isTransfer ? Car : isDining ? Utensils : Compass;
  const label = isTransfer ? "Transfer" : isDining ? "Dining" : "Activity";

  return (
    <View style={[cs.card, { backgroundColor: C.card, overflow: "hidden" }]}>
      {ev.image && (
        <CachedImage uri={ev.image} style={cs.imageBanner} />
      )}

      <View style={cs.content}>
        {/* Header */}
        <View style={cs.header}>
          <View style={[cs.iconBox, { backgroundColor: C.elevated }]}>
            <Icon size={13} color={color} strokeWidth={1.8} />
          </View>
          <Text style={[cs.smallLabel, { color, flex: 1 }]}>{label}</Text>
          {ev.time && (
            <Text style={[cs.meta, { color: C.textTertiary }]}>
              {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}
            </Text>
          )}
        </View>

        <Text style={[cs.title, { color: C.textPrimary }]} numberOfLines={2}>{ev.title}</Text>

        {ev.description && (
          <Text style={[cs.desc, { color: C.textTertiary }]}>{ev.description}</Text>
        )}

        {ev.location && (
          <View style={cs.locationRow}>
            <MapPin size={11} color={C.textTertiary} strokeWidth={1.5} />
            <Text style={[cs.locationText, { color: C.textTertiary }]}>{ev.location}</Text>
          </View>
        )}

        {ev.notes && (
          <Text style={[cs.notesFlat, { color: C.textTertiary }]}>{ev.notes}</Text>
        )}

        {/* Footer */}
        {(ev.status || ev.price || ev.confNumber) && (
          <View style={[cs.footer, { marginTop: S.sm }]}>
            {ev.status && (
              <Text style={[cs.statusInline, { color: C.textDim }]}>{ev.status.toUpperCase()}</Text>
            )}
            {ev.price && (
              <Text style={[cs.priceText, { color }]}>{ev.price}</Text>
            )}
            <View style={{ flex: 1 }} />
            {ev.confNumber && (
              <View style={cs.confRow}>
                <Hash size={10} color={C.textDim} strokeWidth={2} />
                <Text style={[cs.confText, { color: C.textDim }]}>{ev.confNumber}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Shared card styles ───────────────────────────────────────────────────────
const cs = StyleSheet.create({
  card: { borderRadius: R.xl, padding: S.md },
  content: { padding: S.md },
  imageBanner: { width: "100%", height: 140, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },

  header: { flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.sm },
  iconBox: {
    width: 34, height: 34, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
  },
  smallLabel: { fontSize: T.xs, fontWeight: T.bold, letterSpacing: 0.5 },
  meta: { fontSize: T.xs, fontWeight: T.medium, marginTop: 1 },
  timeBadge: {
    fontSize: T.xs, fontWeight: T.bold,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full,
    overflow: "hidden",
  },

  title: { fontSize: T.lg, fontWeight: T.bold, letterSpacing: -0.2, marginBottom: 4 },
  desc: { fontSize: T.sm, lineHeight: 20, marginBottom: S.xs },

  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: S.sm },
  locationText: { fontSize: T.sm, fontWeight: T.medium, flex: 1 },

  // Flight route
  routeSection: {
    flexDirection: "row", alignItems: "center",
    borderRadius: R.lg, padding: S.md, marginBottom: S.sm,
  },
  airport: { alignItems: "center", width: 80 },
  airportCode: { fontSize: T["3xl"], fontWeight: T.bold, letterSpacing: -0.5, lineHeight: 32 },
  airportLabel: { fontSize: T.xs, fontWeight: T.medium, marginTop: 3, maxWidth: 80 },
  routeLine: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  dash: { flex: 1, height: 1, borderStyle: "dashed", borderWidth: 0.5 },

  metaInline: { flexDirection: "row", flexWrap: "wrap", marginTop: S.xs },
  metaInlineText: { fontSize: T.sm, fontWeight: T.medium },

  // Hotel dates
  checkRow: {
    flexDirection: "row", alignItems: "center", gap: S.xs,
    borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: S.xs,
    marginBottom: S.xs,
  },
  checkLabel: { fontSize: 9, fontWeight: T.semibold, letterSpacing: 0.5, marginBottom: 1 },
  checkVal: { fontSize: T.sm, fontWeight: T.bold },

  roomType: { fontSize: T.xs, fontWeight: T.bold, marginTop: S.xs },
  notesFlat: { fontSize: T.sm, lineHeight: 20, marginTop: S.xs },

  footer: { flexDirection: "row", alignItems: "center", gap: S.xs, flexWrap: "wrap" },
  statusInline: { fontSize: T.xs, fontWeight: T.bold, letterSpacing: 0.6 },
  priceText: { fontSize: T.sm, fontWeight: T.bold },
  confRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  confText: { fontSize: 10, fontWeight: T.bold, letterSpacing: 0.8 },
});

// ── Compat exports ───────────────────────────────────────────────────────────
export function ConfRow({ confNumber, C }: { confNumber: string; C: ThemeColors }) {
  return null; // now rendered inside cards
}

export function DocsRow({ documents, C }: { documents: EventDocument[]; C: ThemeColors }) {
  if (!documents.length) return null;

  const handlePress = async (doc: EventDocument) => {
    try { await Clipboard.setStringAsync(doc.url); } catch {}
    const sizeKb = Math.max(1, Math.round(doc.size / 1024));
    const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    Alert.alert(doc.name, `${doc.mimeType || "file"} · ${sizeText}\n\nLink copied to clipboard.`, [{ text: "OK" }]);
  };

  return (
    <View style={{ marginTop: 6, gap: 4 }}>
      {documents.map(doc => {
        const sizeKb = Math.max(1, Math.round(doc.size / 1024));
        const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        return (
          <Pressable
            key={doc.id}
            onPress={() => handlePress(doc)}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 8,
              paddingHorizontal: S.sm, paddingVertical: 8,
              backgroundColor: C.elevated, borderRadius: R.md,
              opacity: pressed ? 0.7 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${doc.name}`}
          >
            <FileText size={12} color={C.teal} strokeWidth={1.8} />
            <Text style={{ fontSize: T.sm, fontWeight: T.bold, color: C.textPrimary, flex: 1 }} numberOfLines={1}>{doc.name}</Text>
            <Text style={{ fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary }}>{sizeText}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EventCard({ ev, C }: { ev: TravelEvent; C: ThemeColors }) {
  if (ev.type === "flight") return <FlightCard ev={ev} C={C} />;
  if (ev.type === "hotel")  return <HotelCard  ev={ev} C={C} />;
  return <ActivityCard ev={ev} C={C} />;
}
