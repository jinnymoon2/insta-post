import { MemeLanguage } from "./templates";

type CaptionInspirationInput = {
  language: MemeLanguage;
  vibe: string;
  keywords: string[];
};

export type CaptionInspiration = {
  searchQuery: string;
  phrases: string[];
};

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPhrase(value: string) {
  return stripHtml(value)
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulPhrase(value: string, language: MemeLanguage) {
  const cleaned = value.trim();

  if (cleaned.length < 12) return false;
  if (cleaned.length > 180) return false;

  const lower = cleaned.toLowerCase();

  if (
    lower.includes("duckduckgo") ||
    lower.includes("privacy") ||
    lower.includes("javascript") ||
    lower.includes("cookie") ||
    lower.includes("terms of service") ||
    lower.includes("all rights reserved")
  ) {
    return false;
  }

  if (language === "ko") {
    return /[가-힣]/.test(cleaned) || /meme|caption|reaction|funny/i.test(cleaned);
  }

  return /[a-z]/i.test(cleaned);
}

function dedupePhrases(phrases: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const phrase of phrases) {
    const key = phrase.toLowerCase().replace(/[^a-z0-9가-힣]/gi, "");

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(phrase);
  }

  return result;
}

function buildCaptionSearchQuery({
  language,
  vibe,
  keywords,
}: CaptionInspirationInput) {
  const usefulKeywords = keywords
    .filter((keyword) => keyword.length > 2)
    .slice(0, 4)
    .join(" ");

  if (language === "ko") {
    return [
      "요즘 밈 문구",
      "웃긴 짤 문구",
      "인터넷 밈 대사",
      vibe,
      usefulKeywords,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "current meme captions",
    "funny meme text",
    "reaction meme captions",
    vibe,
    usefulKeywords,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractDuckDuckGoPhrases(html: string, language: MemeLanguage) {
  const phrases: string[] = [];

  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const titleRegex = /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;

  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    const phrase = cleanPhrase(snippetMatch[1]);
    if (isUsefulPhrase(phrase, language)) {
      phrases.push(phrase);
    }
  }

  let titleMatch: RegExpExecArray | null;
  while ((titleMatch = titleRegex.exec(html)) !== null) {
    const phrase = cleanPhrase(titleMatch[1]);
    if (isUsefulPhrase(phrase, language)) {
      phrases.push(phrase);
    }
  }

  return dedupePhrases(phrases).slice(0, 12);
}

export async function fetchCaptionInspiration(
  input: CaptionInspirationInput,
): Promise<CaptionInspiration> {
  const searchQuery = buildCaptionSearchQuery(input);

  try {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 InstaPost Meme Caption Search",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Caption search failed with status ${response.status}`);
    }

    const html = await response.text();
    const phrases = extractDuckDuckGoPhrases(html, input.language);

    return {
      searchQuery,
      phrases,
    };
  } catch (error) {
    console.error("Caption inspiration search failed:", error);

    return {
      searchQuery,
      phrases: [],
    };
  }
}
