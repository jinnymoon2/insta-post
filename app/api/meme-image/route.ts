import { NextResponse } from "next/server";

type ImgflipMeme = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
};

type ImgflipResponse = {
  success: boolean;
  data?: {
    memes?: ImgflipMeme[];
  };
};

type PexelsPhoto = {
  id: number;
  alt: string | null;
  width: number;
  height: number;
  src: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    portrait?: string;
    landscape?: string;
  };
};

type PexelsSearchResponse = {
  photos?: PexelsPhoto[];
};

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreImgflipMeme(meme: ImgflipMeme, query: string) {
  const normalizedName = normalize(meme.name);
  const normalizedQuery = normalize(query);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);

  let score = 0;

  for (const word of queryWords) {
    if (normalizedName.includes(word)) {
      score += 5;
    }
  }

  const famousTemplateBoosts: Array<{
    patterns: RegExp[];
    templateNames: RegExp[];
    boost: number;
  }> = [
    {
      patterns: [/ai|automation|changed the game|new era|tool/i],
      templateNames: [/drake|two buttons|change my mind|expanding brain|buff doge/i],
      boost: 30,
    },
    {
      patterns: [/developer|programmer|code|bug|debug|deploy|engineering/i],
      templateNames: [/one does not simply|two buttons|disaster girl|drake|gru/i],
      boost: 30,
    },
    {
      patterns: [/office|company|manager|meeting|deadline|corporate/i],
      templateNames: [/distracted boyfriend|drake|change my mind|one does not simply/i],
      boost: 28,
    },
    {
      patterns: [/shock|surprise|unexpected|plot twist|breaking news/i],
      templateNames: [/surprised pikachu|disaster girl|this is fine|monkey puppet/i],
      boost: 35,
    },
    {
      patterns: [/success|win|growth|launch|celebrating/i],
      templateNames: [/success kid|leonardo dicaprio cheers|drake/i],
      boost: 35,
    },
    {
      patterns: [/failure|problem|risk|crisis|pain|harder than expected/i],
      templateNames: [/this is fine|sad pablo escobar|hide the pain harold|first time/i],
      boost: 35,
    },
    {
      patterns: [/confused|understand|what just happened/i],
      templateNames: [/confused nick young|math lady|monkey puppet|two buttons/i],
      boost: 35,
    },
    {
      patterns: [/truth|revealed|secret|actually|turns out/i],
      templateNames: [/always has been|change my mind|ancient aliens/i],
      boost: 35,
    },
    {
      patterns: [/trend|keep up|fast|shift|transition/i],
      templateNames: [/distracted boyfriend|drake|running away balloon|bike fall/i],
      boost: 30,
    },
  ];

  for (const boostRule of famousTemplateBoosts) {
    const queryMatches = boostRule.patterns.some((pattern) => pattern.test(normalizedQuery));
    const nameMatches = boostRule.templateNames.some((pattern) => pattern.test(normalizedName));

    if (queryMatches && nameMatches) {
      score += boostRule.boost;
    }
  }

  // General famous-template preference.
  if (
    /drake|distracted boyfriend|two buttons|change my mind|one does not simply|success kid|this is fine|surprised pikachu|expanding brain|disaster girl|hide the pain/i.test(
      normalizedName,
    )
  ) {
    score += 12;
  }

  // Prefer templates with standard meme caption boxes.
  if (meme.box_count >= 2) {
    score += 5;
  }

  return score;
}

async function fetchImgflipMemeUrl(query: string) {
  const response = await fetch("https://api.imgflip.com/get_memes", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Imgflip failed with status ${response.status}`);
  }

  const data = (await response.json()) as ImgflipResponse;
  const memes = data.data?.memes ?? [];

  if (!data.success || memes.length === 0) {
    throw new Error("Imgflip returned no memes.");
  }

  const selected = [...memes].sort((a, b) => {
    return scoreImgflipMeme(b, query) - scoreImgflipMeme(a, query);
  })[0];

  if (!selected?.url) {
    throw new Error("Imgflip selected meme did not include an image URL.");
  }

  return selected.url;
}

function extractDuckDuckGoVqd(html: string) {
  const patterns = [
    /vqd="([^"]+)"/,
    /vqd=([^&"]+)/,
    /'vqd':'([^']+)'/,
    /"vqd":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

async function fetchKoreanFamousMemeUrl(query: string) {
  const searchQuery = `${query} 한국 유명 밈 짤`;
  const searchPageUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
    searchQuery,
  )}&iax=images&ia=images`;

  const searchPageResponse = await fetch(searchPageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 InstaPost Korean Meme Search",
    },
    cache: "no-store",
  });

  if (!searchPageResponse.ok) {
    throw new Error(`DuckDuckGo page failed with status ${searchPageResponse.status}`);
  }

  const searchPageHtml = await searchPageResponse.text();
  const vqd = extractDuckDuckGoVqd(searchPageHtml);

  if (!vqd) {
    throw new Error("Could not extract DuckDuckGo image token.");
  }

  const imageSearchUrl = `https://duckduckgo.com/i.js?l=kr-ko&o=json&q=${encodeURIComponent(
    searchQuery,
  )}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`;

  const imageSearchResponse = await fetch(imageSearchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 InstaPost Korean Meme Search",
      Referer: searchPageUrl,
    },
    cache: "no-store",
  });

  if (!imageSearchResponse.ok) {
    throw new Error(`DuckDuckGo image search failed with status ${imageSearchResponse.status}`);
  }

  const imageData = await imageSearchResponse.json();
  const results = Array.isArray(imageData.results) ? imageData.results : [];

  const firstUsable = results.find((item: unknown) => {
    if (!item || typeof item !== "object") return false;

    const candidate = item as {
      image?: unknown;
      title?: unknown;
      url?: unknown;
    };

    const image = typeof candidate.image === "string" ? candidate.image : "";
    const title = typeof candidate.title === "string" ? candidate.title : "";
    const url = typeof candidate.url === "string" ? candidate.url : "";

    if (!image.startsWith("http")) return false;
    if (image.toLowerCase().includes(".svg")) return false;

    const combined = `${title} ${url} ${image}`;

    return /밈|짤|meme|reaction|웃긴|유명/i.test(combined);
  });

  if (!firstUsable || typeof firstUsable !== "object") {
    throw new Error("No usable Korean famous meme image result found.");
  }

  const image = (firstUsable as { image?: unknown }).image;

  if (typeof image !== "string") {
    throw new Error("Korean meme result did not include an image URL.");
  }

  return image;
}

function buildSafePexelsQuery(query: string, language: string) {
  const cleaned = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (language === "ko") {
    return `${cleaned} funny reaction person expressive face`;
  }

  return cleaned || "funny reaction person expressive face";
}

async function searchPexelsImageUrl(query: string, language: string) {
  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing PEXELS_API_KEY in environment variables.");
  }

  const safeQuery = buildSafePexelsQuery(query, language);

  const params = new URLSearchParams({
    query: safeQuery,
    orientation: "portrait",
    size: "large",
    per_page: "12",
  });

  const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: {
      Authorization: apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Pexels search failed with status ${response.status}`);
  }

  const data = (await response.json()) as PexelsSearchResponse;
  const photos = data.photos ?? [];

  if (photos.length === 0) {
    throw new Error("Pexels returned no photos.");
  }

  const randomIndex = Math.floor(Math.random() * Math.min(photos.length, 6));
  const selected = photos[randomIndex];

  const imageUrl =
    selected?.src.portrait ||
    selected?.src.large2x ||
    selected?.src.large ||
    selected?.src.medium ||
    selected?.src.original;

  if (!imageUrl) {
    throw new Error("Selected Pexels photo did not include an image URL.");
  }

  return imageUrl;
}

async function proxyImage(imageUrl: string) {
  const imageResponse = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 InstaPost Meme Image Proxy",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!imageResponse.ok) {
    throw new Error(`Image fetch failed with status ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new Error("Fetched result was not an image.");
  }

  const arrayBuffer = await imageResponse.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const query = searchParams.get("q")?.trim() || "";
  const language = searchParams.get("language") || "en";
  const source = searchParams.get("source") || "imgflip";

  if (!query) {
    return jsonError("Missing meme search query.", 400);
  }

  try {
    let imageUrl = "";

    if (language === "en" && source === "imgflip") {
      imageUrl = await fetchImgflipMemeUrl(query);
    } else if (language === "ko" && source === "korean-web-meme") {
      imageUrl = await fetchKoreanFamousMemeUrl(query);
    }

    if (!imageUrl) {
      imageUrl = await searchPexelsImageUrl(query, language);
    }

    return await proxyImage(imageUrl);
  } catch (primaryError) {
    console.error("Primary famous meme image search failed:", primaryError);

    try {
      const fallbackQuery =
        language === "ko"
          ? "funny reaction person expressive face"
          : "funny reaction person expressive face";

      const fallbackImageUrl = await searchPexelsImageUrl(fallbackQuery, language);

      return await proxyImage(fallbackImageUrl);
    } catch (fallbackError) {
      console.error("Pexels fallback image failed:", fallbackError);

      return jsonError(
        fallbackError instanceof Error
          ? fallbackError.message
          : "Could not find a meme image.",
        500,
      );
    }
  }
}
