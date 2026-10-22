import { StyleSheet } from "react-native";
import { T, S, R } from "@/constants/theme";

// Shared with the live-day sheet in the Today tab so all three states read the same
export const sheetStyles = StyleSheet.create({
  header: { paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.xs },
  countdown: { flexDirection: "row", alignItems: "baseline", gap: S.xs, marginBottom: S.xs },
  countNum: { fontSize: 40, lineHeight: 46, fontWeight: T.bold, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  countLabel: { fontSize: T.lg, fontWeight: T.medium },
  headingMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, marginBottom: S.sm },
  headerDates: { fontSize: T.base, lineHeight: 22, marginTop: S.sm },
  forecast: { fontSize: T.base, lineHeight: 22, marginTop: S.sm },
  scope: { fontSize: T.sm, lineHeight: 18, fontWeight: T.semibold, marginBottom: 2 },
  tripName: { fontSize: T["3xl"], lineHeight: 33, fontWeight: T.bold, letterSpacing: -0.3 },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: S.md, marginTop: S.xl, marginBottom: S.xs,
  },
  sectionTitle: { fontSize: T.xl, fontWeight: T.bold, letterSpacing: -0.3 },
  sectionAction: { fontSize: T.base, fontWeight: T.medium },

  card: {},
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, paddingVertical: 13, minHeight: 52 },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  // Two-line rows: the icon sits on the title line (centred on its 22pt line height), the chevron stays centred
  rowTop: { alignItems: "flex-start" },
  iconOnTitle: { marginTop: -5 },
  rowTitle: { fontSize: T.md, lineHeight: 22, fontWeight: T.medium },
  rowSub: { fontSize: 14, lineHeight: 20, marginTop: S["2xs"] },
  // A free day's "what's next" row, sitting under the empty state
  freeNext: { flexDirection: "row", alignItems: "center", gap: S.sm, marginHorizontal: S.md, padding: S.md, borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth },
  freeTime: { fontSize: T.base, fontWeight: T.semibold, fontVariant: ["tabular-nums"] },
  flightMeta: {
    flexDirection: "row", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.xs,
    borderTopWidth: StyleSheet.hairlineWidth, marginLeft: S.md + 32 + S.sm,
  },
  metaText: { fontSize: T.sm },
  footnote: { fontSize: T.sm, paddingHorizontal: S.md, marginTop: S.sm, lineHeight: 18 },
});
