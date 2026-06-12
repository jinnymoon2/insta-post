import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE_VERSION = "generate-route-google-ai-safe-json-v6";
const GOOGLE_GENERATE_CONTENT_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_GOOGLE_TEXT_MODEL = "gemini-2.5-flash";
const GOOGLE_TEXT_TIMEOUT_MS = 30000;

const MAX_ARTICLE_CHARS = 9000;
const MIN_TEXT_INPUT_LENGTH = 80;
const MIN_ARTICLE_LENGTH = 180;

type OutputLanguage = "en" | "ko";

type GeneratedSlide = {
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string;
};

type ModelSlide = {
  title?: unknown;
  text?: unknown;
  imagePrompt?: unknown;
};

type GenerateRequestBody = {
  url?: unknown;
  articleText?: unknown;
  language?: unknown;
  pageCount?: unknown;
};

function clampPageCount(value: unknown) {
  const requestedPageCount = Number(value);
  if (!Number.isFinite(requestedPageCount)) return 6;
  return Math.min(Math.max(Math.floor(requestedPageCount), 1), 10);
}

function normalizeLanguage(value: unknown): OutputLanguage {
  return value === "ko" ? "ko" : "en";
}

function getOptionalEnvValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getGoogleApiKey() {
  const token =
    getOptionalEnvValue("GOOGLE_API_KEY") || getOptionalEnvValue("GEMINI_API_KEY");

  if (!token) {
    throw new Error(
      "Missing GOOGLE_API_KEY. Add your Google AI Studio API key to .env.local or Vercel environment variables.",
    );
  }

  return token;
}

function getGoogleTextModels() {
  const envModel = getOptionalEnvValue("GOOGLE_TEXT_MODEL");

  return [
    envModel,
    DEFAULT_GOOGLE_TEXT_MODEL,
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
  ].filter((model, index, array): model is string => {
    return Boolean(model) && array.indexOf(model) === index;
  });
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function humanizeAiError(error: unknown, language?: OutputLanguage) {
  const message = safeErrorMessage(error);
  const targetLanguageName =
    language === "ko" ? "Korean" : language === "en" ? "English" : "the selected language";

  if (/quota|billing|rate limit|RESOURCE_EXHAUSTED|HTTP 429|HTTP 402/i.test(message)) {
    return `Google AI Studio could not generate ${targetLanguageName} summaries because the API quota or billing limit was reached. The app used local fallback slides instead.`;
  }

  if (/aborted|abort|timeout|timed out/i.test(message)) {
    return `Google AI Studio took too long to respond. The app used local fallback slides instead.`;
  }

  if (/incomplete JSON|MAX_TOKENS|cut off|truncated|Unexpected end/i.test(message)) {
    return `Google AI Studio returned incomplete JSON. The app used local fallback slides instead.`;
  }

  if (/Missing GOOGLE_API_KEY/i.test(message)) {
    return "Missing GOOGLE_API_KEY. Add your Google AI Studio API key to your environment variables, then restart the app.";
  }

  return `AI generation failed, so the app used local fallback slides instead. Original error: ${message}`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  const articleMatch = withoutNoise.match(/<article[\s\S]*?<\/article>/i);
  const mainMatch = withoutNoise.match(/<main[\s\S]*?<\/main>/i);
  const bestBlock = articleMatch?.[0] ?? mainMatch?.[0] ?? withoutNoise;

  const paragraphs = Array.from(bestBlock.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => match[1].replace(/<[^>]+>/g, " "))
    .map(decodeHtmlEntities)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length >= 40)
    .filter(
      (text) =>
        !/cookie|privacy policy|subscribe|newsletter|advertisement|sign up|log in/i.test(text),
    );

  const paragraphText = paragraphs.join(" ").trim();
  if (paragraphText.length >= 400) return paragraphText;

  return decodeHtmlEntities(bestBlock.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(input: string) {
  try {
    const parsed = new URL(input);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http and https URLs are supported.");
    }

    return parsed.toString();
  } catch {
    throw new Error("Please enter a valid article URL, or use Long Text mode.");
  }
}

async function fetchArticle(url: string) {
  if (!url) {
    throw new Error("Please enter an article URL or paste article text.");
  }

  const articleUrl = normalizeUrl(url);

  const response = await fetch(articleUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(
      `Could not fetch article. Status: ${response.status}. This site may block server fetching. Paste the article text manually instead.`,
    );
  }

  const html = await response.text();
  const cleanedText = stripHtml(html);

  if (!cleanedText || cleanedText.length < MIN_ARTICLE_LENGTH) {
    throw new Error("Could not extract enough article text. Paste the article text manually instead.");
  }

  return cleanedText.slice(0, MAX_ARTICLE_CHARS);
}

function detectSourceLanguage(text: string): OutputLanguage {
  const koreanChars = text.match(/[가-힣]/g)?.length ?? 0;
  const latinChars = text.match(/[A-Za-z]/g)?.length ?? 0;
  return koreanChars > latinChars * 0.18 ? "ko" : "en";
}

function splitIntoSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|(?<=[다요죠음임까])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 500)
    .filter(
      (sentence) =>
        !/cookie|privacy policy|subscribe|newsletter|advertisement|sign up|log in/i.test(
          sentence,
        ),
    )
    .filter(
      (sentence) =>
        !/\b(I|we|our|my)\b/i.test(sentence) &&
        !/우리는|우리가|저는|저희|제가/.test(sentence),
    );
}

function compactText(value: string, language: OutputLanguage, kind: "title" | "body") {
  const cleaned = value.replace(/\s+/g, " ").trim().replace(/^[.,;:!?。！？\s]+/, "");

  const maxLength =
    kind === "title" ? (language === "ko" ? 30 : 58) : language === "ko" ? 105 : 180;

  if (cleaned.length <= maxLength) return cleaned;

  const sliced = cleaned.slice(0, maxLength - 1).trim();
  const lastSpace = sliced.lastIndexOf(" ");

  if (language === "en" && lastSpace > maxLength * 0.62) {
    return `${sliced.slice(0, lastSpace)}…`;
  }

  return `${sliced}…`;
}

function extractKeywords(text: string, limit = 5) {
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "because",
    "before",
    "being",
    "could",
    "first",
    "from",
    "have",
    "into",
    "only",
    "other",
    "section",
    "their",
    "there",
    "these",
    "this",
    "through",
    "while",
    "with",
    "would",
    "article",
    "explains",
    "important",
    "overall",
    "story",
  ]);

  const words =
    text
      .match(/[A-Za-z][A-Za-z0-9-]{3,}|[가-힣]{2,}/g)
      ?.filter((word) => !stopWords.has(word.toLowerCase())) ?? [];

  const counts = new Map<string, { value: string; count: number }>();

  for (const word of words) {
    const key = word.toLowerCase();
    const current = counts.get(key);
    counts.set(key, {
      value: current?.value ?? word,
      count: (current?.count ?? 0) + 1,
    });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || b.value.length - a.value.length)
    .slice(0, limit)
    .map((item) => item.value);
}

function detectTone(text: string) {
  const lower = text.toLowerCase();

  if (
    /(ai|technology|software|computer|device|startup|innovation|robotics|robot|claude|openai|github|code|developer)/.test(
      lower,
    )
  ) {
    return "technology";
  }

  if (/(climate|energy|solar|wind|battery|earth|ocean|forest|nature)/.test(lower)) {
    return "climate";
  }

  if (/(school|student|education|learning|research|classroom|university)/.test(lower)) {
    return "education";
  }

  if (/(market|business|company|revenue|startup|customer|product)/.test(lower)) {
    return "business";
  }

  return "editorial";
}

function makeImagePrompt(slideText: string, index: number) {
  const keywords = extractKeywords(slideText, 5);
  const tone = detectTone(slideText);
  const topic = keywords.length > 0 ? keywords.join(", ") : "article summary";

  return `${tone} editorial photograph for ${topic}, slide ${index + 1}, visually specific scene inspired by this point, cinematic light, layered depth, dark lower area for white text, no text`;
}

// Encode the page-level image prompt plus the whole-article keywords (?topic=)
// so the image route can search Pexels on the combination of both.
function makeImageUrl(imagePrompt: string, index: number, articleKeywords: string[] = []) {
  const base = `instapost-generated://slide-${index + 1}/${encodeURIComponent(imagePrompt)}`;
  const topic = articleKeywords.join(" ").trim();
  return topic ? `${base}?topic=${encodeURIComponent(topic)}` : base;
}

function makeFallbackTitle(index: number, language: OutputLanguage) {
  return language === "ko" ? `핵심 포인트 ${index + 1}` : `Key Point ${index + 1}`;
}

function makeExtractiveSlides(
  articleText: string,
  pageCount: number,
  language: OutputLanguage,
  articleKeywords: string[],
): GeneratedSlide[] {
  const sentences = splitIntoSentences(articleText);
  const usefulSentences = sentences.length > 0 ? sentences : [articleText.slice(0, 360)];

  return Array.from({ length: pageCount }, (_, index) => {
    const sentence = usefulSentences[index % usefulSentences.length];
    const title = makeFallbackTitle(index, language);
    const text = compactText(sentence, language, "body");
    const imagePrompt = makeImagePrompt(`${title} ${text}`, index);

    return {
      title,
      text,
      imagePrompt,
      imageUrl: makeImageUrl(imagePrompt, index, articleKeywords),
    };
  });
}

function extractJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? value;
  const firstBrace = candidate.indexOf("{");

  if (firstBrace === -1) {
    throw new Error("The AI returned text instead of JSON.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return candidate.slice(firstBrace, index + 1);
    }
  }

  throw new Error("The AI returned incomplete JSON.");
}

function parseSlidesFromModel(value: string) {
  const json = extractJsonObject(value);
  const parsed = JSON.parse(json) as { slides?: ModelSlide[] };

  if (!Array.isArray(parsed.slides)) {
    throw new Error("The AI JSON did not include a slides array.");
  }

  return parsed.slides.map((slide) => ({
    title: typeof slide.title === "string" ? slide.title.trim() : "",
    text: typeof slide.text === "string" ? slide.text.trim() : "",
    imagePrompt: typeof slide.imagePrompt === "string" ? slide.imagePrompt.trim() : "",
  }));
}

function isValidSlides(
  slides: Array<{ title: string; text: string }>,
  pageCount: number,
  language: OutputLanguage,
) {
  if (slides.length < pageCount) return false;

  return slides.slice(0, pageCount).every((slide) => {
    const combined = `${slide.title} ${slide.text}`;

    if (slide.title.length < 2 || slide.text.length < 18) return false;

    if (
      /전체 이야기|중요한 흐름과 의미|한눈에 이해|짧게 정리합니다|핵심 내용을 요약하면/i.test(
        combined,
      )
    ) {
      return false;
    }

    if (language === "ko" && !/[가-힣]/.test(combined)) return false;
    if (language === "en" && !/[A-Za-z]{4,}/.test(combined)) return false;

    return true;
  });
}

function buildSummarySystemPrompt(
  sourceLanguage: OutputLanguage,
  outputLanguage: OutputLanguage,
  pageCount: number,
) {
  const sourceLanguageName = sourceLanguage === "ko" ? "Korean" : "English";
  const outputLanguageName = outputLanguage === "ko" ? "Korean" : "English";

  return [
    "You convert article text into Instagram carousel slide copy.",
    "Return only valid compact JSON. No markdown. No commentary.",
    `Article source language: ${sourceLanguageName}.`,
    `Final output language for title and text: ${outputLanguageName}.`,
    sourceLanguage === outputLanguage
      ? `Summarize directly in ${sourceLanguageName}.`
      : `First understand the article in ${sourceLanguageName}, then write the slide title and text in ${outputLanguageName}.`,
    `Create exactly ${pageCount} slides.`,
    "Use this exact shape: {\"slides\":[{\"title\":\"...\",\"text\":\"...\",\"imagePrompt\":\"...\"}]}",
    "Every slide must summarize one concrete point from the article.",
    "Write in third person. Never use first person.",
    "Do not invent facts.",
    "Keep title under 12 words.",
    "Keep text under 22 words.",
    "Keep imagePrompt in English under 18 words.",
    "Each imagePrompt must describe concrete visual subjects.",
  ].join("\n");
}

function buildUserPrompt(articleText: string) {
  return `ARTICLE TEXT:\n${articleText.slice(0, MAX_ARTICLE_CHARS)}`;
}

function extractGoogleText(data: unknown) {
  if (typeof data !== "object" || data === null || !("candidates" in data)) return "";

  const candidates = (data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> };
      finishReason?: unknown;
    }>;
  }).candidates;

  const finishReason = candidates?.[0]?.finishReason;

  if (finishReason === "MAX_TOKENS") {
    throw new Error("Google AI Studio cut off the JSON response because it reached MAX_TOKENS.");
  }

  const parts = candidates?.[0]?.content?.parts ?? [];

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function callGoogleAiModel(model: string, systemPrompt: string, userPrompt: string) {
  const token = getGoogleApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TEXT_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GOOGLE_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 12000,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 700)}`);
    }

    let data: unknown;

    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Invalid Google API JSON response: ${rawText.slice(0, 700)}`);
    }

    const content = extractGoogleText(data);

    if (!content) {
      throw new Error(`No generated content returned: ${JSON.stringify(data).slice(0, 700)}`);
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function callGoogleAi(systemPrompt: string, userPrompt: string) {
  const errors: string[] = [];

  for (const model of getGoogleTextModels()) {
    try {
      const result = await callGoogleAiModel(model, systemPrompt, userPrompt);
      console.log(`[google:success] ${model}`);
      return result;
    } catch (error) {
      const message = `${model}: ${safeErrorMessage(error)}`;
      errors.push(message);
      console.error("[google:error]", message);
    }
  }

  throw new Error(`Google AI Studio failed: ${errors.join(" | ")}`);
}

async function generateSlidesWithAi(
  articleText: string,
  pageCount: number,
  language: OutputLanguage,
  articleKeywords: string[],
) {
  const sourceLanguage = detectSourceLanguage(articleText);
  const systemPrompt = buildSummarySystemPrompt(sourceLanguage, language, pageCount);
  const userPrompt = buildUserPrompt(articleText);

  const summaryOutput = await callGoogleAi(systemPrompt, userPrompt);
  const finalSlides = parseSlidesFromModel(summaryOutput);

  if (!isValidSlides(finalSlides, pageCount, language)) {
    throw new Error(
      language === "ko"
        ? "AI returned invalid Korean slides."
        : "AI returned invalid English slides.",
    );
  }

  return finalSlides.slice(0, pageCount).map((slide, index) => {
    const title = compactText(
      slide.title || makeFallbackTitle(index, language),
      language,
      "title",
    );

    const text = compactText(slide.text, language, "body");
    const imagePrompt = slide.imagePrompt || makeImagePrompt(`${title} ${text}`, index);

    return {
      title,
      text,
      imagePrompt,
      imageUrl: makeImageUrl(imagePrompt, index, articleKeywords),
    };
  });
}

async function getArticleTextFromRequest(body: GenerateRequestBody) {
  const inputText = typeof body.articleText === "string" ? body.articleText.trim() : "";
  const inputUrl = typeof body.url === "string" ? body.url.trim() : "";

  if (inputText.length >= MIN_TEXT_INPUT_LENGTH) {
    return inputText.slice(0, MAX_ARTICLE_CHARS);
  }

  return fetchArticle(inputUrl);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: ROUTE_VERSION,
    models: getGoogleTextModels(),
    hasGoogleApiKey: Boolean(
      getOptionalEnvValue("GOOGLE_API_KEY") || getOptionalEnvValue("GEMINI_API_KEY"),
    ),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequestBody;
    const language = normalizeLanguage(body.language);
    const pageCount = clampPageCount(body.pageCount);
    const articleText = await getArticleTextFromRequest(body);
    const sourceLanguage = detectSourceLanguage(articleText);

    if (!articleText || articleText.length < MIN_ARTICLE_LENGTH) {
      throw new Error("Please provide a longer article or text input.");
    }

    // Whole-article keywords (the overall topic), combined per page with each
    // slide's own keywords when searching for a background image.
    const articleKeywords = extractKeywords(articleText, 3);

    try {
      const slides = await generateSlidesWithAi(articleText, pageCount, language, articleKeywords);

      return NextResponse.json({
        slides,
        meta: {
          route: ROUTE_VERSION,
          mode: "ai",
          sourceLanguage,
        },
      });
    } catch (error) {
      console.error("[generate:ai-fallback]", error);

      return NextResponse.json({
        slides: makeExtractiveSlides(articleText, pageCount, language, articleKeywords),
        meta: {
          route: ROUTE_VERSION,
          mode: "local-fallback",
          warning: humanizeAiError(error, language),
          sourceLanguage,
        },
      });
    }
  } catch (error) {
    console.error("[generate:error]", error);

    return NextResponse.json(
      {
        error: safeErrorMessage(error) || "Failed to generate post.",
      },
      { status: 500 },
    );
  }
}
