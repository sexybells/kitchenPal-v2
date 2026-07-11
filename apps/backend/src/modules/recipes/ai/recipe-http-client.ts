import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Result of an outbound HTTP GET: status plus decoded body. */
export interface HttpTextResponse {
  status: number;
  body: string;
}

/**
 * Minimal outbound HTTP client for recipe web-search and URL scraping. Kept
 * behind an interface (and DI token) so tests can inject canned responses and
 * suites stay hermetic — no real network calls in CI.
 */
export interface RecipeHttpClient {
  getText(url: string): Promise<HttpTextResponse>;
}

/** DI token for the {@link RecipeHttpClient} implementation. */
export const RECIPE_HTTP_CLIENT = "RECIPE_HTTP_CLIENT";

/** Upper bound on a fetched page/response body to bound memory. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Abort a slow outbound request rather than hanging the handler. */
const REQUEST_TIMEOUT_MS = 8000;
/** Cap redirect hops; every hop is re-validated against the SSRF blocklist. */
const MAX_REDIRECTS = 3;

/**
 * Raised when a requested URL targets a non-public address. The import service
 * treats it like any fetch failure (degrades to a null draft), so an SSRF probe
 * gets no distinguishing signal.
 */
export class BlockedAddressError extends Error {}

/**
 * Rejects a URL that does not use http(s) or that resolves to a private,
 * loopback, link-local, or otherwise non-routable address — the SSRF guard for
 * user-supplied import URLs. DNS names are resolved and EVERY resolved address is
 * checked, so a public name pointing at an internal IP is still blocked.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BlockedAddressError("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedAddressError(
      `Refusing to fetch a non-HTTP(S) URL: ${parsed.protocol}`,
    );
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses =
    literalFamily !== 0
      ? [hostname]
      : (await lookup(hostname, { all: true })).map((entry) => entry.address);
  if (addresses.length === 0) {
    throw new BlockedAddressError(`Could not resolve host: ${hostname}`);
  }
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new BlockedAddressError(
        `Refusing to fetch a private or reserved address: ${address}`,
      );
    }
  }
  return parsed;
}

/**
 * Production {@link RecipeHttpClient} using global `fetch` with an SSRF guard,
 * manual redirect handling (each hop re-validated), a request timeout, and a
 * bounded response body.
 */
export class FetchRecipeHttpClient implements RecipeHttpClient {
  async getText(url: string): Promise<HttpTextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let current = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        // Validate the address BEFORE each fetch, including every redirect hop,
        // so a public URL cannot 3xx into an internal target.
        await assertPublicUrl(current);
        const response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "text/html,application/json" },
        });
        const location = response.headers.get("location");
        if (isRedirect(response.status) && location) {
          current = new URL(location, current).toString();
          continue;
        }
        const body = (await response.text()).slice(0, MAX_BODY_BYTES);
        return { status: response.status, body };
      }
      throw new BlockedAddressError("Too many redirects");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * Whether an IP literal falls in a private, loopback, link-local, or reserved
 * range (IPv4 and IPv6, including IPv4-mapped IPv6). Errs toward blocking on
 * anything it cannot positively classify as public.
 */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return isBlockedIpv4(ip);
  }
  if (family === 6) {
    return isBlockedIpv6(ip.toLowerCase());
  }
  // Not a parseable IP — refuse rather than guess.
  return true;
}

function isBlockedIpv4(ip: string): boolean {
  const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (
    octets.length !== 4 ||
    octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 127) return true; // "this" network + loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved (224/4, 240/4)
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  if (ip === "::1" || ip === "::") return true; // loopback + unspecified
  // IPv4-mapped/embedded (e.g. ::ffff:169.254.169.254) → check the IPv4 part.
  const embeddedV4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (embeddedV4?.[1]) {
    return isBlockedIpv4(embeddedV4[1]);
  }
  const firstGroup = ip.split(":")[0] ?? "";
  if (/^f[cd]/.test(firstGroup)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(firstGroup)) return true; // fe80::/10 link-local
  return false;
}
