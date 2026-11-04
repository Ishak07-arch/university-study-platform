import path from "node:path";

// Server-only storage root. Tests override this to preserve development data.
export function dataDirectory(...parts: string[]) {
  return path.resolve(
    process.env.FOLIO_DATA_DIR || path.join(process.cwd(), ".data"),
    ...parts,
  );
}

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
type Env = Readonly<Record<string, string | undefined>>;

// The configured public origin, normalised (no path or trailing slash).
// Production requires HTTPS except for a loopback preview such as qa:serve.
export function configuredOrigin(env: Env = process.env) {
  const raw = env.APP_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL must be an absolute http(s) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("APP_URL must be an absolute http(s) URL.");
  if (
    env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !loopback.has(url.hostname)
  )
    throw new Error("Set APP_URL to your public HTTPS origin for production.");
  return url.origin;
}

// Origin used for CSRF checks and emailed links. Request-derived values are a
// development convenience only; production never trusts the Host header.
export function appOrigin(fallback: string, env: Env = process.env) {
  const origin = configuredOrigin(env);
  if (origin) return origin;
  if (env.NODE_ENV === "production")
    throw new Error("Set APP_URL to your public HTTPS origin for production.");
  return fallback;
}
