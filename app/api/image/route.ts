import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXTERNAL_TIMEOUT_MS = 12000; // pass-through fetch for real http(s) image URLs
// Pexels: real, topic-relevant stock photos via keyword search. Free API key
// (open registration at https://www.pexels.com/api/). Set PEXELS_API_KEY.
const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const PEXELS_TIMEOUT_MS = 12000;
const MIN_IMAGE_BYTES = 512; // reject tiny error payloads mislabeled as images

function getOptionalEnvValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

// Everything after "instapost-generated://slide-N/" — i.e. the encoded page
// prompt plus an optional "?topic=..." carrying the whole-article keywords.
function extractGeneratedTail(rawUrl: string) {
  const match = rawUrl.match(/^instapost-generated:\/\/[^/]+\/(.*)$/);
  return match ? match[1] : "";
}

function extractPrompt(rawUrl: string) {
  if (!rawUrl) return "abstract editorial background, blue green neon gradient, no text";

  if (rawUrl.startsWith("instapost-generated://")) {
    const path = extractGeneratedTail(rawUrl).split("?")[0];
    try {
      return decodeURIComponent(path);
    } catch {
      return path || rawUrl;
    }
  }

  return rawUrl;
}

// The whole-article keyword string the generate route attached as ?topic=...
function extractTopic(rawUrl: string) {
  if (!rawUrl.startsWith("instapost-generated://")) return "";
  const tail = extractGeneratedTail(rawUrl);
  const queryIndex = tail.indexOf("?");
  if (queryIndex === -1) return "";
  // URLSearchParams decodes the percent-encoding for us.
  return new URLSearchParams(tail.slice(queryIndex + 1)).get("topic") ?? "";
}

function cleanPrompt(value: string) {
  return value
    .replace(/^instapost-generated:\/\/[^/]+\//, "")
    .replace(/[%#?&=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

// Single fetch attempt. Returns the image bytes, or null on any failure
// (non-2xx, non-image content type, suspiciously small body, timeout, network error).
async function fetchAsImage(
  url: string,
  init: { body?: BodyInit; headers?: Record<string, string>; label?: string; timeoutMs: number },
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      method: init.body ? "POST" : "GET",
      body: init.body,
      headers: init.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[image] ${init.label ?? "fetch"} failed: HTTP ${response.status} ${errorText.slice(0, 220)}`,
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      console.error(`[image] ${init.label ?? "fetch"} returned ${contentType}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < MIN_IMAGE_BYTES) {
      console.error(`[image] ${init.label ?? "fetch"} returned only ${buffer.byteLength} bytes`);
      return null;
    }

    return { buffer, contentType };
  } catch (error) {
    console.error(`[image] ${init.label ?? "fetch"} error`, error);
    return null;
  }
}

const PEXELS_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "with", "without", "from", "into",
  "on", "in", "at", "to", "by", "is", "are", "being", "that", "this", "these",
  "showing", "actively", "various", "multiple", "complex", "next", "many",
  "editorial", "magazine", "photography", "cinematic", "light", "layered",
  "depth", "dark", "lower", "area", "white", "text", "words", "watermark",
  "no", "high", "quality", "vertical", "instagram", "carousel", "background",
  "scene", "specific", "visible", "subject", "matter", "prompt", "slide",
]);

// Pull up to `limit` distinct, meaningful keywords out of a phrase.
function extractKeywords(text: string, limit: number): string[] {
  const words = cleanPrompt(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !PEXELS_STOP_WORDS.has(word));

  const unique: string[] = [];
  for (const word of words) {
    if (!unique.includes(word)) unique.push(word);
    if (unique.length >= limit) break;
  }
  return unique;
}

type PexelsPhoto = {
  alt?: string;
  src?: {
    large2x?: string;
    large?: string;
    portrait?: string;
    original?: string;
  };
};

type PexelsSearchResponse = { photos?: PexelsPhoto[] };

async function searchPexels(apiKey: string, query: string): Promise<PexelsPhoto[] | null> {
  const params = new URLSearchParams({
    query,
    orientation: "portrait",
    per_page: "24",
    size: "large",
  });

  try {
    const response = await fetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[image] pexels search "${query}" failed: HTTP ${response.status} ${body.slice(0, 160)}`);
      return null;
    }

    const data = (await response.json()) as PexelsSearchResponse;
    return data.photos ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[image] pexels search "${query}" error`, message);
    return null;
  }
}

// Score a candidate by how well its description matches the keywords. Page
// keywords (specific to this slide) count double; article keywords (the overall
// topic) count once. This is how we "choose the best" of the search results.
function scorePhoto(photo: PexelsPhoto, pageKeywords: string[], articleKeywords: string[]) {
  const alt = (photo.alt ?? "").toLowerCase();
  if (!alt) return 0;

  let score = 0;
  for (const keyword of pageKeywords) if (alt.includes(keyword)) score += 2;
  for (const keyword of articleKeywords) if (alt.includes(keyword)) score += 1;
  return score;
}

function pickBestPhoto(photos: PexelsPhoto[], pageKeywords: string[], articleKeywords: string[]) {
  let best: PexelsPhoto | null = null;
  let bestScore = -1;

  // Photos are already returned in Pexels relevance order, so a strict ">"
  // keeps the most relevant one when scores tie.
  for (const photo of photos) {
    const score = scorePhoto(photo, pageKeywords, articleKeywords);
    if (score > bestScore) {
      bestScore = score;
      best = photo;
    }
  }
  return best;
}

async function fetchPexelsImage(prompt: string, topic: string) {
  const apiKey = getOptionalEnvValue("PEXELS_API_KEY");
  if (!apiKey) return { result: null, error: "missing-pexels-key" };

  const pageKeywords = extractKeywords(prompt, 4);
  const articleKeywords = extractKeywords(topic, 3);

  // Combined query = whole-article topic + this page's specifics.
  const combined: string[] = [];
  for (const keyword of [
    articleKeywords[0],
    ...pageKeywords.slice(0, 3),
    articleKeywords[1],
  ]) {
    if (keyword && !combined.includes(keyword)) combined.push(keyword);
  }

  // Try the combined query first, then progressively broader fallbacks.
  const queries = [
    combined.join(" "),
    pageKeywords.join(" "),
    articleKeywords.join(" "),
    "abstract background",
  ].filter((query, index, all) => query && all.indexOf(query) === index);

  for (const query of queries) {
    const photos = await searchPexels(apiKey, query);
    if (!photos || photos.length === 0) continue;

    const best = pickBestPhoto(photos, pageKeywords, articleKeywords) ?? photos[0];
    const photoUrl =
      best.src?.large2x ?? best.src?.portrait ?? best.src?.large ?? best.src?.original;
    if (!photoUrl) continue;

    const result = await fetchAsImage(photoUrl, {
      headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
      label: `pexels(${query})`,
      timeoutMs: PEXELS_TIMEOUT_MS,
    });

    if (result) {
      console.log(`[image] pexels picked best match for query "${query}"`);
      return { result, error: undefined as string | undefined };
    }
  }

  console.error(
    `[image] pexels: no usable photo (page=[${pageKeywords.join(",")}] topic=[${articleKeywords.join(",")}])`,
  );
  return { result: null, error: "pexels-no-results" };
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

// Fallback SVG: DO NOT cache. If a Pexels lookup failed transiently, no-store
// lets the next page load retry the real photo search instead of freezing the
// slide on the gradient placeholder.
function fallbackResponse(prompt: string, reason = "unknown") {
  return new NextResponse(fallbackSvg(prompt), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Image-Source": "fallback-svg",
      // Inspect this header in the browser Network tab to see why a slide
      // fell back to the gradient instead of a generated image.
      "X-Image-Fallback-Reason": reason,
    },
  });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
  const prompt = extractPrompt(rawUrl);
  const topic = extractTopic(rawUrl);

  // Backgrounds (or empty url) -> search Pexels for a real, topic-relevant
  // photo (no AI image generation). Local procedural SVG only as a last resort.
  if (!rawUrl || rawUrl.startsWith("instapost-generated://")) {
    const pexels = await fetchPexelsImage(prompt, topic);
    if (pexels.result) {
      return imageResponse(pexels.result.buffer, pexels.result.contentType, "pexels");
    }

    return fallbackResponse(prompt, pexels.error);
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
