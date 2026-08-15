/**
 * Generic human-readable labels for page URLs.
 * No project-specific hardcoding — slug title-casing is the fallback.
 */

export function humanizePageUrl(pageUrl: string): {
  label: string;
  path: string;
  host: string;
} {
  let path = "/";
  let host = "";
  try {
    const u = new URL(pageUrl);
    path = u.pathname || "/";
    host = u.host;
  } catch {
    path = pageUrl;
  }

  const label = humanizePath(path);
  return { label, path, host };
}

export function humanizePath(path: string): string {
  const normalized = path === "" ? "/" : path;
  if (normalized === "/" || normalized === "") return "Home";

  const trimmed = normalized.replace(/\/+$/, "");
  const segment = trimmed.split("/").filter(Boolean).pop() ?? "";
  if (!segment) return "Home";

  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Host string used when grouping pages outside the primary origin. */
export function hostKeyFromPageUrl(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    // Preserve protocol variants as distinct diagnostic hosts when helpful.
    if (u.protocol === "http:") return `http://${u.host}`;
    return u.host;
  } catch {
    return pageUrl;
  }
}

export function primaryOriginHost(primaryOrigin: string): string {
  try {
    return new URL(primaryOrigin).host;
  } catch {
    return primaryOrigin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}
