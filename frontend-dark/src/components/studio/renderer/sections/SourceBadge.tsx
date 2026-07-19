/**
 * Source attribution badge shown at the top-right of a report section.
 *
 * - If the source is a URL, render it as a clickable link that opens the
 *   original source in a new tab.
 * - If it is plain text, show it as an info tooltip.
 * - If there is no real source at all, render NOTHING (the button is hidden).
 */

const URL_RE = /https?:\/\/[^\s)]+/i

function firstUrl(text: string): string | null {
  const m = text.match(URL_RE)
  return m ? m[0] : null
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

export function SourceBadge({ source, footnote }: { source?: string | null; footnote?: string | null }) {
  const raw = (source ?? footnote ?? '').trim()
  // Hide entirely when there is no source, or only a placeholder.
  if (!raw || /^(not specified|n\/?a|none|unknown)$/i.test(raw)) return null

  const url = firstUrl(raw)
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-blue-400 hover:text-blue-300 transition-colors"
        title={raw}
      >
        ↗ {hostname(url)}
      </a>
    )
  }

  return (
    <span
      className="ml-auto inline-flex items-center text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-help"
      title={`Source: ${raw}`}
    >
      ⓘ source
    </span>
  )
}
