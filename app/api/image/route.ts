import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// On Vercel: Hobby caps functions at 10s, Pro at 60s. The fallback chain below can
// take up to PRIMARY + RETRY seconds in the worst case, so give it headroom.
// If you are on Hobby, lower the timeouts (see constants) instead of raising this.
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Config (read from .env.local — never commit real tokens)
//
//   POLLINATIONS_TOKEN=...        -> authenticated tier: nologo/private honored,
//                                    much higher rate limits. Get one from the
//                                    Pollinations auth portal (auth.pollinations.ai).
//   POLLINATIONS_REFERRER=...     -> no-token option. Register your app's referrer
//                                    with Pollinations for better limits than the
//                                    fully-anonymous tier. e.g. "https://yourapp.com".
//
// Both are optional — the route still works anonymously, just with the strict
// public rate limit (which is the usual reason you only ever see the gradient).
// Pollinations' params/auth evolve; if something is ignored, check their current docs.
// ---------------------------------------------------------------------------
const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN?.trim() ?? "";
const POLLINATIONS_REFERRER = process.env.POLLINATIONS_REFERRER?.trim() ?? "";

const PRIMARY_TIMEOUT_MS = 15000; // flux: best quality, slower
const RETRY_TIMEOUT_MS = 12000; // turbo: faster, used when flux fails/times out
const EXTERNAL_TIMEOUT_MS = 12000; // pass-through fetch for real http(s) image URLs
const MIN_IMAGE_BYTES = 512; // reject tiny error payloads mislabeled as images

function extractPrompt(rawUrl: string) {
  if (!rawUrl) return "abstract editorial background, blue green neon gradient, no text";

  if (rawUrl.startsWith("instapost-generated://")) {
    const lastSlash = rawUrl.lastIndexOf("/");
    const encoded = lastSlash >= 0 ? rawUrl.slice(lastSlash + 1) : rawUrl;

    try {
      return decodeURIComponent(encoded);
    } catch {
      return rawUrl;
    }
  }

  return rawUrl;
}

function cleanPrompt(value: string) {
  return value
    .replace(/^instapost-generated:\/\/[^/]+\//, "")
    .replace(/[%#?&=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

// Deterministic seed so the same prompt yields the same image on every load.
// This makes the result cacheable per-URL and stops backgrounds from re-rolling.
function promptSeed(value: string) {
  let seed = 0;
  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) % 1000000;
  }
  return seed;
}

function buildPollinationsUrl(
  prompt: string,
  options: { model: string; enhance: boolean; seed: number },
) {
  const finalPrompt = [
    cleanPrompt(prompt),
    "vertical Instagram carousel background",
    "editorial magazine style",
    "dark lower area for white text",
    "blue and green accent lighting",
    "high quality",
    "no words",
    "no letters",
    "no watermark",
  ].join(", ");

  const params = new URLSearchParams({
    width: "1080",
    height: "1350",
    model: options.model,
    seed: String(options.seed),
    nologo: "true",
    private: "true",
    safe: "true",
  });
  // `enhance` runs a prompt-rewriting LLM step — nicer output, but adds latency
  // and is a common cause of timeouts. We only use it on the primary attempt.
  if (options.enhance) params.set("enhance", "true");

  // NOTE: token/referrer are sent as HEADERS (see pollinationsHeaders), not query
  // params, to keep secrets out of URLs and server logs.
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    finalPrompt,
  )}?${params.toString()}`;
}

function pollinationsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (POLLINATIONS_TOKEN) {
    // If your token isn't honored via header, Pollinations also accepts it as a
    // `?token=` query param — but the header keeps it out of logs.
    headers.Authorization = `Bearer ${POLLINATIONS_TOKEN}`;
  }
  if (POLLINATIONS_REFERRER) {
    headers.Referer = POLLINATIONS_REFERRER;
  }
  return headers;
}

// Single fetch attempt. Returns the image bytes, or null on any failure
// (non-2xx, non-image content type, suspiciously small body, timeout, network error).
async function fetchAsImage(
  url: string,
  init: { headers?: Record<string, string>; timeoutMs: number },
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: init.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < MIN_IMAGE_BYTES) return null;

    return { buffer, contentType };
  } catch {
    return null;
  }
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }

  return hash;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fallbackSvg(prompt: string) {
  const safePrompt = escapeXml(cleanPrompt(prompt).slice(0, 120));
  const hue = hashString(prompt);
  const hue2 = (hue + 48) % 360;
  const hue3 = (hue + 140) % 360;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 55%, 18%)"/>
      <stop offset="45%" stop-color="hsl(${hue2}, 50%, 13%)"/>
      <stop offset="100%" stop-color="hsl(${hue3}, 55%, 8%)"/>
    </linearGradient>
    <radialGradient id="glow1" cx="25%" cy="20%" r="70%">
      <stop offset="0%" stop-color="rgba(47,124,255,0.55)"/>
      <stop offset="55%" stop-color="rgba(47,124,255,0.12)"/>
      <stop offset="100%" stop-color="rgba(47,124,255,0)"/>
    </radialGradient>
    <radialGradient id="glow2" cx="80%" cy="70%" r="70%">
      <stop offset="0%" stop-color="rgba(32,242,162,0.45)"/>
      <stop offset="55%" stop-color="rgba(32,242,162,0.10)"/>
      <stop offset="100%" stop-color="rgba(32,242,162,0)"/>
    </radialGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="32"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.16"/>
      </feComponentTransfer>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect width="1080" height="1350" fill="url(#glow1)"/>
  <rect width="1080" height="1350" fill="url(#glow2)"/>

  <circle cx="280" cy="310" r="210" fill="rgba(255,255,255,0.08)" filter="url(#blur)"/>
  <circle cx="750" cy="540" r="260" fill="rgba(255,255,255,0.06)" filter="url(#blur)"/>

  <path d="M110 760 C260 620, 410 840, 560 690 C720 520, 870 680, 1020 540"
        fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="18" stroke-linecap="round"/>
  <path d="M80 880 C260 760, 450 980, 650 790 C790 660, 900 760, 1020 690"
        fill="none" stroke="rgba(32,242,162,0.20)" stroke-width="12" stroke-linecap="round"/>

  <rect y="760" width="1080" height="590" fill="rgba(0,0,0,0.45)"/>
  <rect y="920" width="1080" height="430" fill="rgba(0,0,0,0.42)"/>

  <text x="54" y="1280" fill="rgba(255,255,255,0.18)" font-family="Arial, sans-serif" font-size="22" font-weight="800">${safePrompt}</text>
  <rect width="1080" height="1350" filter="url(#grain)" opacity="0.4"/>
</svg>`.trim();
}

// Successful real image: cache hard (the seed makes it stable).
function imageResponse(buffer: ArrayBuffer, contentType: string, source: string) {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Image-Source": source,
    },
  });
}

// Fallback SVG: DO NOT cache. Previously this was cached for an hour, so the first
// failure froze the slide as a gradient even after Pollinations recovered. With
// no-store, the next page load retries the real generation.
function fallbackResponse(prompt: string) {
  return new NextResponse(fallbackSvg(prompt), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Image-Source": "fallback-svg",
    },
  });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
  const prompt = extractPrompt(rawUrl);

  // Generated backgrounds (or empty url) -> Pollinations with a fallback chain.
  if (!rawUrl || rawUrl.startsWith("instapost-generated://")) {
    const seed = promptSeed(prompt);
    const headers = pollinationsHeaders();

    // Try best-quality first, then a faster model, then the SVG.
    const attempts = [
      { model: "flux", enhance: true, timeoutMs: PRIMARY_TIMEOUT_MS },
      { model: "turbo", enhance: false, timeoutMs: RETRY_TIMEOUT_MS },
    ];

    for (const attempt of attempts) {
      const url = buildPollinationsUrl(prompt, {
        model: attempt.model,
        enhance: attempt.enhance,
        seed,
      });
      const result = await fetchAsImage(url, { headers, timeoutMs: attempt.timeoutMs });
      if (result) {
        return imageResponse(result.buffer, result.contentType, `pollinations-${attempt.model}`);
      }
      console.error(`[image] pollinations attempt failed: model=${attempt.model}`);
    }

    return fallbackResponse(prompt);
  }

  // Pass-through for real http(s) image URLs.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return fallbackResponse(prompt);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    return fallbackResponse(prompt);
  }

  const result = await fetchAsImage(parsed.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; InstaPostImageProxy/1.0)",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    timeoutMs: EXTERNAL_TIMEOUT_MS,
  });

  if (!result) {
    return fallbackResponse(prompt);
  }

  return imageResponse(result.buffer, result.contentType, "passthrough");
}