const BASE = "http://internal.invalid";

// Validates the `?next=` return URL. Only same-origin paths are allowed,
// otherwise /login?next=https://evil.com would be an open redirect.
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;

  // URL parsing catches the tricky cases: "//evil.com" and "/\evil.com"
  // are treated by browsers as other hosts.
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
