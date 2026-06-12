import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }

  return hash;
}

function getTone(prompt: string) {
  const lower = prompt.toLowerCase();

  if (/(urgent|warning|risk|crisis|alert|conflict|danger)/.test(lower)) {
    return "urgent";
  }

  if (/(growth|future|innovation|technology|startup|ai|software)/.test(lower)) {
    return "tech";
  }

  if (/(climate|nature|energy|earth|solar|ocean|forest)/.test(lower)) {
    return "nature";
  }

  if (/(education|learning|classroom|student|research)/.test(lower)) {
    return "knowledge";
  }

  return "editorial";
}

function makeGeneratedImage(prompt: string) {
  const tone = getTone(prompt);
  const baseHue = hashString(`${tone}-${prompt}`);
  const accentHue = (baseHue + 38) % 360;
  const deepHue = (baseHue + 118) % 360;
  const iconSeed = baseHue % 4;
  const icon =
    iconSeed === 0
      ? `<rect x="245" y="245" width="590" height="680" rx="42" fill="rgba(255,255,255,0.52)" stroke="rgba(90,130,160,0.34)" stroke-width="4"/>
         <circle cx="342" cy="360" r="48" fill="rgba(90,130,160,0.22)"/>
         <rect x="438" y="323" width="270" height="22" rx="11" fill="rgba(90,130,160,0.28)"/>
         <rect x="438" y="371" width="345" height="16" rx="8" fill="rgba(90,130,160,0.18)"/>
         <rect x="315" y="500" width="450" height="18" rx="9" fill="rgba(90,130,160,0.2)"/>
         <rect x="315" y="548" width="370" height="18" rx="9" fill="rgba(90,130,160,0.18)"/>
         <rect x="315" y="596" width="430" height="18" rx="9" fill="rgba(90,130,160,0.18)"/>
         <rect x="315" y="688" width="500" height="20" rx="10" fill="rgba(90,130,160,0.16)"/>
         <rect x="315" y="742" width="405" height="20" rx="10" fill="rgba(90,130,160,0.14)"/>`
      : iconSeed === 1
        ? `<rect x="275" y="330" width="530" height="405" rx="56" fill="rgba(255,255,255,0.38)" stroke="rgba(90,130,160,0.28)" stroke-width="5"/>
           <rect x="345" y="408" width="390" height="52" rx="26" fill="rgba(90,130,160,0.18)"/>
           <rect x="345" y="506" width="300" height="32" rx="16" fill="rgba(90,130,160,0.14)"/>
           <circle cx="395" cy="650" r="34" fill="rgba(90,130,160,0.18)"/>
           <circle cx="540" cy="650" r="34" fill="rgba(90,130,160,0.18)"/>
           <circle cx="685" cy="650" r="34" fill="rgba(90,130,160,0.18)"/>`
        : iconSeed === 2
          ? `<circle cx="540" cy="470" r="180" fill="rgba(255,255,255,0.35)" stroke="rgba(90,130,160,0.24)" stroke-width="6"/>
             <path d="M450 470 L515 535 L650 390" fill="none" stroke="rgba(90,130,160,0.38)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
             <path d="M265 755 C 400 670, 535 850, 815 715" fill="none" stroke="rgba(90,130,160,0.16)" stroke-width="34" stroke-linecap="round"/>
             <path d="M315 835 C 450 750, 560 910, 760 810" fill="none" stroke="rgba(90,130,160,0.12)" stroke-width="24" stroke-linecap="round"/>`
          : `<rect x="370" y="250" width="340" height="340" rx="72" fill="rgba(90,130,160,0.22)"/>
             <text x="540" y="466" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-family="Arial, sans-serif" font-size="150" font-weight="900">AI</text>
             <line x1="230" y1="420" x2="370" y2="420" stroke="rgba(90,130,160,0.2)" stroke-width="18" stroke-linecap="round"/>
             <line x1="710" y1="420" x2="850" y2="420" stroke="rgba(90,130,160,0.2)" stroke-width="18" stroke-linecap="round"/>
             <circle cx="235" cy="420" r="16" fill="rgba(90,130,160,0.25)"/>
             <circle cx="845" cy="420" r="16" fill="rgba(90,130,160,0.25)"/>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${baseHue}, 38%, 91%)"/>
      <stop offset="52%" stop-color="hsl(${deepHue}, 34%, 84%)"/>
      <stop offset="100%" stop-color="hsl(${accentHue}, 42%, 72%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="20%" r="78%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.78)"/>
      <stop offset="52%" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <filter id="soft">
      <feGaussianBlur stdDeviation="28"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.13"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect width="1080" height="1350" fill="url(#glow)"/>
  <circle cx="${200 + (baseHue % 280)}" cy="${180 + (accentHue % 240)}" r="250" fill="rgba(255,255,255,0.28)" filter="url(#soft)"/>
  <circle cx="${690 + (deepHue % 180)}" cy="${690 + (baseHue % 230)}" r="340" fill="rgba(70,105,130,0.12)" filter="url(#soft)"/>
  <g opacity="0.88">${icon}</g>
  <path d="M-80 1000 C 170 820, 360 1110, 610 930 S 910 710, 1180 850 L 1180 1460 L -80 1460 Z" fill="rgba(0,0,0,0.12)"/>
  <rect width="1080" height="1350" filter="url(#grain)" opacity="0.36"/>
</svg>`.trim();
}

function generatedImageResponse(prompt: string) {
  return new NextResponse(makeGeneratedImage(prompt), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
      return generatedImageResponse("missing background");
    }

    const parsed = new URL(url);

    if (parsed.protocol === "instapost-generated:") {
      return generatedImageResponse(decodeURIComponent(`${parsed.hostname}${parsed.pathname}`));
    }

    if (!["https:", "http:"].includes(parsed.protocol)) {
      return generatedImageResponse(url);
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; InstaPostImageProxy/1.0)"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return generatedImageResponse(url);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return generatedImageResponse(url);
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch {
    return generatedImageResponse("image fallback");
  }
}
