const URL_RE = /https?:\/\/[^\s<>)"']+/g;

export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  const urls = text.match(URL_RE) ?? [];
  return (
    <span className={className}>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {urls[i] && (
            <a
              href={urls[i]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-2 hover:opacity-80 break-all"
              onClick={e => e.stopPropagation()}
            >
              {urls[i]}
            </a>
          )}
        </span>
      ))}
    </span>
  );
}
