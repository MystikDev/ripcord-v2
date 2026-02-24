/**
 * @module url-utils
 * URL detection and text segmentation for linkified message rendering.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextSegment {
  type: 'text' | 'url';
  value: string;
}

// ---------------------------------------------------------------------------
// URL regex — matches http(s) URLs and www. prefixed domains
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>'")\]]+|www\.[^\s<>'")\]]+/gi;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Extract all URLs from a text string. `www.` prefixed URLs are normalised to `https://`. */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  return matches.map(normalise);
}

/** Split text into alternating plain-text and URL segments for rendering. */
export function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  // Reset regex state (global flag)
  URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    // Push preceding text
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'url', value: normalise(match[0]) });
    lastIndex = match.index + match[0].length;
  }

  // Push trailing text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(url: string): string {
  if (url.startsWith('www.')) return `https://${url}`;
  return url;
}
