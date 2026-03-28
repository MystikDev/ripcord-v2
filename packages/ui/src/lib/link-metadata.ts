/**
 * @module link-metadata
 * Client-side OpenGraph metadata fetcher for link previews.
 * Uses Tauri HTTP plugin when available (no CORS), falls back to browser fetch.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkMetadata {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// ---------------------------------------------------------------------------
// Cache — module-level to persist across component mounts
// ---------------------------------------------------------------------------

const cache = new Map<string, LinkMetadata | null>();
const pending = new Map<string, Promise<LinkMetadata | null>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch OpenGraph metadata for a URL. Returns cached result when available.
 * Deduplicates concurrent requests for the same URL.
 */
export function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  // Only fetch http(s) URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) return Promise.resolve(null);

  // Cache hit
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);

  // Dedup in-flight request
  if (pending.has(url)) return pending.get(url)!;

  const promise = doFetch(url);
  pending.set(url, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function doFetch(url: string): Promise<LinkMetadata | null> {
  try {
    const html = await httpFetch(url);
    const og = parseOgTags(html);
    const domain = extractDomain(url);

    // Resolve relative og:image against the base URL
    let image = og.image;
    if (image) {
      if (image.startsWith('//')) {
        image = `https:${image}`;
      } else if (image.startsWith('/')) {
        const origin = new URL(url).origin;
        image = `${origin}${image}`;
      }
      // Drop non-HTTPS images (CSP img-src only allows https:)
      if (image.startsWith('http://')) image = null;
    }

    const result: LinkMetadata | null =
      og.title || og.description
        ? { url, domain, title: og.title, description: og.description, image, siteName: og.siteName }
        : null;

    cache.set(url, result);
    pending.delete(url);
    return result;
  } catch {
    // Network error, timeout, etc. — cache null to avoid retrying
    cache.set(url, null);
    pending.delete(url);
    return null;
  }
}

/**
 * Fetch HTML from an arbitrary URL. Uses the platform bridge which tries
 * native fetch first (Tauri HTTP plugin, CORS-free), then browser fetch.
 */
async function httpFetch(url: string): Promise<string> {
  const { nativeFetch } = await import('./platform');
  return nativeFetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'Ripcord-LinkPreview/1.0' },
    timeout: 5000,
  });
}

// ---------------------------------------------------------------------------
// OG tag parser — regex-based, no heavy HTML parser needed
// ---------------------------------------------------------------------------

interface OgData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

function parseOgTags(html: string): OgData {
  const get = (property: string): string | null => {
    // <meta property="og:title" content="..." />
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    );
    // Reverse attribute order: content before property
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    );
    return re1.exec(html)?.[1] ?? re2.exec(html)?.[1] ?? null;
  };

  // Fallback: <title> tag
  const titleFallback = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null;

  return {
    title: get('og:title') ?? titleFallback,
    description: get('og:description') ?? get('description'),
    image: get('og:image'),
    siteName: get('og:site_name'),
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
