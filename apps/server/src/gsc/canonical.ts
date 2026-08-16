/**
 * Conservative URL comparison for canonical alignment.
 *
 * Normalizes:
 * - host lowercasing (DNS case-insensitivity)
 * - trivial trailing-slash differences on the same path
 * - safe percent-decoding of path/query when decodeURIComponent succeeds
 *
 * Does NOT treat as equivalent:
 * - http vs https
 * - different hosts
 * - different paths (beyond trailing slash)
 */

export function normalizeUrlForCanonicalCompare(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.host.toLowerCase();
  let pathname = safeDecode(parsed.pathname) || "/";
  // Collapse trailing slash except keep root as "/"
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  const search = safeDecode(parsed.search);
  // Ignore hash — not meaningful for Google canonical identity.
  return `${protocol}//${host}${pathname}${search}`;
}

export function urlsEquivalentForCanonical(a: string, b: string): boolean {
  const na = normalizeUrlForCanonicalCompare(a);
  const nb = normalizeUrlForCanonicalCompare(b);
  if (!na || !nb) return false;
  return na === nb;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
