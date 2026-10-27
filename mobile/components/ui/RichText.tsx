import { useMemo } from "react";
import { Linking, Text, type StyleProp, type TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { tokenize, type Token } from "@/shared/richText";

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
  selectable?: boolean;
  /** Links to leave out, such as one already shown as its own row */
  stripUrls?: string[];
}

function open(token: Token) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Linking.openURL(token.href).catch(() => {});
}

function copy(token: Token) {
  Clipboard.setStringAsync(token.value)
    .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
    .catch(() => {});
}

/**
 * Body text where phone numbers, emails and links can be tapped: a tap calls, emails or opens,
 * a long press copies. Everything else stays ordinary, selectable text.
 */
export function RichText({ text, style, linkColor, numberOfLines, selectable = true, stripUrls }: Props) {
  const cleaned = useMemo(() => {
    let t = text;
    for (const u of stripUrls ?? []) t = t.replace(u, "");
    return t.replace(/[ \t]{2,}/g, " ").trim();
  }, [text, stripUrls]);
  const tokens = useMemo(() => tokenize(cleaned), [cleaned]);
  if (!cleaned) return null;

  return (
    <Text style={style} selectable={selectable} numberOfLines={numberOfLines}>
      {tokens.map((t, i) =>
        t.kind === "text" ? (
          <Text key={i}>{t.value}</Text>
        ) : (
          <Text
            key={i}
            style={{ color: linkColor, fontWeight: "500" }}
            onPress={() => open(t)}
            onLongPress={() => copy(t)}
            accessibilityRole="link"
            accessibilityLabel={t.kind === "phone" ? `Call ${t.value}` : t.kind === "email" ? `Email ${t.value}` : `Open ${t.value}`}
            accessibilityHint="Long press to copy"
          >
            {t.value}
          </Text>
        ),
      )}
    </Text>
  );
}
