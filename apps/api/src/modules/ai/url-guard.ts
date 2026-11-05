/**
 * A user-chosen Ollama endpoint makes the SERVER send requests. Local and private addresses are legitimate
 * (Ollama usually runs on localhost or the LAN), so they are allowed; what is refused is the cloud-metadata
 * and link-local range that has no business being an AI endpoint, plus unsafe schemes and embedded credentials.
 * Note: this checks the literal host; it does not resolve DNS, so it is a guard rail rather than a sandbox.
 * That is why custom endpoints are off unless the operator enables AI_ALLOW_CUSTOM_OLLAMA_URL.
 */
export class UnsafeEndpointError extends Error {}

const BLOCKED_HOSTS = new Set(["metadata.google.internal", "metadata", "instance-data"]);

export function assertSafeEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeEndpointError("That isn't a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new UnsafeEndpointError("Only http:// and https:// endpoints are allowed.");
  if (url.username || url.password)
    throw new UnsafeEndpointError("Don't put credentials in the URL.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host === "0.0.0.0" || isLinkLocal(host)) {
    throw new UnsafeEndpointError("That address isn't allowed as an AI endpoint.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function isLinkLocal(host: string): boolean {
  if (/^169\.254\./.test(host)) return true; // IPv4 link-local, incl. the 169.254.169.254 metadata address
  if (/^fe[89ab][0-9a-f]?:/.test(host)) return true; // IPv6 link-local fe80::/10
  if (host === "fd00:ec2::254") return true; // AWS IPv6 metadata
  // IPv4-mapped IPv6. The URL parser rewrites ::ffff:169.254.169.254 into hex (::ffff:a9fe:a9fe), so decode that form too.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapped) {
    const high = parseInt(mapped[1]!, 16);
    return high >> 8 === 169 && (high & 0xff) === 254;
  }
  return /^::ffff:169\.254\./.test(host);
}
