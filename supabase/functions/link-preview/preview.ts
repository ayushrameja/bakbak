export const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

export type LinkPreview =
  | {
      kind: "page";
      url: string;
      title: string;
      description: string;
      siteName: string;
    }
  | {
      kind: "youtube";
      url: string;
      videoId: string;
      title: string;
    };

export interface PreviewEnvironment {
  resolve: (hostname: string, family: "A" | "AAAA") => Promise<string[]>;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
}

export function firstMessageUrl(body: string, content: unknown): string | null {
  const text = Array.isArray(content)
    ? content
        .flatMap((segment) =>
          segment &&
          typeof segment === "object" &&
          "type" in segment &&
          segment.type === "text" &&
          "text" in segment &&
          typeof segment.text === "string"
            ? [segment.text]
            : [],
        )
        .join(" ")
    : body;
  const match = /\b(?:https?:\/\/|www\.)[^\s<>"']+/i.exec(text);
  if (!match) return null;
  const trimmed = trimTrailingPunctuation(match[0]);
  try {
    return new URL(
      trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed,
    ).toString();
  } catch {
    return null;
  }
}

export async function discoverLinkPreview(
  inputUrl: string,
  environment: PreviewEnvironment,
): Promise<LinkPreview> {
  let url = new URL(inputUrl);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    environment.timeoutMs ?? 3000,
  );
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await assertPublicHttpsUrl(url, environment.resolve);
      const response = await environment.fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Bakbak-Link-Preview/1.0",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        if (redirect === MAX_REDIRECTS) throw new Error("redirect_limit");
        const location = response.headers.get("location");
        if (!location) throw new Error("invalid_redirect");
        await response.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) throw new Error("preview_unavailable");
      const contentType = response.headers.get("content-type") ?? "";
      if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(contentType)) {
        throw new Error("preview_not_html");
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_PREVIEW_BYTES
      ) {
        throw new Error("preview_too_large");
      }
      const html = await readLimitedText(response, MAX_PREVIEW_BYTES);
      const metadata = extractMetadata(html, url);
      const videoId = youtubeVideoId(url);
      if (videoId) {
        return {
          kind: "youtube",
          url: url.toString(),
          videoId,
          title: metadata.title,
        };
      }
      return {
        kind: "page",
        url: url.toString(),
        title: metadata.title,
        description: metadata.description,
        siteName: metadata.siteName,
      };
    }
    throw new Error("redirect_limit");
  } catch (error) {
    if (controller.signal.aborted) throw new Error("preview_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertPublicHttpsUrl(
  url: URL,
  resolve: PreviewEnvironment["resolve"],
): Promise<void> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("unsafe_preview_url");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIpLiteral(hostname)
  ) {
    throw new Error("unsafe_preview_host");
  }
  const [ipv4, ipv6] = await Promise.all([
    resolve(hostname, "A").catch(() => []),
    resolve(hostname, "AAAA").catch(() => []),
  ]);
  const addresses = [...ipv4, ...ipv6];
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error("unsafe_preview_address");
  }
}

function extractMetadata(
  html: string,
  url: URL,
): { title: string; description: string; siteName: string } {
  const title =
    metaContent(html, "property", "og:title") ||
    metaContent(html, "name", "twitter:title") ||
    tagContent(html, "title") ||
    url.hostname;
  const description =
    metaContent(html, "property", "og:description") ||
    metaContent(html, "name", "description") ||
    "";
  const siteName =
    metaContent(html, "property", "og:site_name") || url.hostname;
  return {
    title: cleanMetadata(title, 180) || url.hostname,
    description: cleanMetadata(description, 320),
    siteName: cleanMetadata(siteName, 80) || url.hostname,
  };
}

function metaContent(
  html: string,
  attribute: "name" | "property",
  value: string,
): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*${attribute}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attribute}\\s*=\\s*["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  return (
    patterns.map((pattern) => pattern.exec(html)?.[1] ?? "").find(Boolean) ?? ""
  );
}

function tagContent(html: string, tag: string): string {
  return (
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(html)?.[1] ??
    ""
  );
}

function cleanMetadata(value: string, maximum: number): string {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

async function readLimitedText(
  response: Response,
  maximum: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximum) {
      await reader.cancel();
      throw new Error("preview_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") candidate = url.pathname.split("/")[1] ?? null;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    candidate =
      url.searchParams.get("v") ??
      /^\/(?:shorts|embed)\/([^/?]+)/.exec(url.pathname)?.[1] ??
      null;
  }
  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

function trimTrailingPunctuation(value: string): string {
  let result = value;
  while (/[.,!?;:\]}]$/.test(result)) result = result.slice(0, -1);
  while (
    result.endsWith(")") &&
    (result.match(/\(/g)?.length ?? 0) < (result.match(/\)/g)?.length ?? 0)
  ) {
    result = result.slice(0, -1);
  }
  return result;
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const groups = parseIpv6(address);
    if (!groups) return true;
    const [first, second] = groups;
    const allZero = groups.every((group) => group === 0);
    const loopback =
      groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
    const mappedIpv4 =
      groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
        ? [
            (groups[6] >> 8) & 0xff,
            groups[6] & 0xff,
            (groups[7] >> 8) & 0xff,
            groups[7] & 0xff,
          ]
        : null;
    return (
      allZero ||
      loopback ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (first === 0x0064 && second === 0xff9b) ||
      (first === 0x0100 && second === 0) ||
      (first === 0x2001 && second === 0x0db8) ||
      first === 0x2002 ||
      (first & 0xfff0) === 0x3ff0 ||
      first === 0x5f00 ||
      (mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false)
    );
  }
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  return isPrivateIpv4(octets);
}

function isPrivateIpv4(octets: number[]): boolean {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 88) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0)
  );
}

function parseIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase();
  if (normalized.includes("%")) return null;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (value: string): number[] | null => {
    if (!value) return [];
    const parts = value.split(":");
    const parsed: number[] = [];
    for (const part of parts) {
      if (part.includes(".")) {
        const ipv4 = part.split(".").map(Number);
        if (
          ipv4.length !== 4 ||
          ipv4.some(
            (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
          )
        ) {
          return null;
        }
        parsed.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else if (!/^[0-9a-f]{1,4}$/.test(part)) {
        return null;
      } else {
        parsed.push(Number.parseInt(part, 16));
      }
    }
    return parsed;
  };
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
}
