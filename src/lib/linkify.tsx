import { tokenize } from "@/lib/richText";

/**
 * Organiser text with the actionable bits live: phone numbers dial, emails open mail, links open
 * in a new tab. Mirrors RichText in the mobile app so the shared itinerary and the app agree.
 */
export function Linkify({ text, className }: { text: string; className?: string }) {
  const tokens = tokenize(text);
  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.kind === "text" ? (
          <span key={i}>{t.value}</span>
        ) : (
          <a
            key={i}
            href={t.href}
            {...(t.kind === "url" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="text-link underline underline-offset-2 hover:opacity-80 break-all"
            onClick={e => e.stopPropagation()}
          >
            {t.value}
          </a>
        ),
      )}
    </span>
  );
}
