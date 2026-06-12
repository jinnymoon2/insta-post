import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROUTE_VERSION = "generate-route-source-first-v4";
const HF_CHAT_COMPLETIONS_URL = "https://router.huggingface.co/v1/chat/completions";
const MAX_ARTICLE_CHARS = 12000;
const MIN_TEXT_INPUT_LENGTH = 80;
const MIN_ARTICLE_LENGTH = 180;
type OutputLanguage = "en" | "ko";
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
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
function getHFToken() {
  const token = getOptionalEnvValue("HF_TOKEN");
  if (!token) {
    throw new Error(
      "Missing HF_TOKEN. Add HF_TOKEN=hf_your_token_here to .env.local, then stop and restart npm run dev.",
    );
  }
  if (!token.startsWith("hf_")) {
    throw new Error(
      "Invalid HF_TOKEN format. Hugging Face tokens usually start with hf_. Check .env.local.",
    );
  }
  return token;
}
function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
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
    throw new Error(
      "Could not extract enough article text. Paste the article text manually instead.",
    );
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
    // Skip first-person sentences from the source text
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
    "about", "after", "also", "because", "before", "being", "could", "first",
    "from", "have", "into", "only", "other", "section", "their", "there",
    "these", "this", "through", "while", "with", "would", "article",
    "explains", "important", "overall", "story",
  ]);
  const words =
    text
      .match(/[A-Za-z][A-Za-z0-9-]{3,}|[가-힣]{2,}/g)
      ?.filter((word) => !stopWords.has(word.toLowerCase())) ?? [];
  const counts = new Map<string, { value: string; count: number }>();
  for (const word of words) {
    const key = word.toLowerCase();
    const current = counts.get(key);
    counts.set(key, { value: current?.value ?? word, count: (current?.count ?? 0) + 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || b.value.length - a.value.length)
    .slice(0, limit)
    .map((item) => item.value);
}
function detectTone(text: string) {
  const lower = text.toLowerCase();
  if (/(ai|technology|software|computer|device|startup|innovation|robotics|robot|claude|openai|github|code|developer)/.test(lower))
    return "technology";
  if (/(climate|energy|solar|wind|battery|earth|ocean|forest|nature)/.test(lower))
    return "climate";
  if (/(school|student|education|learning|research|classroom|university)/.test(lower))
    return "education";
  if (/(market|business|company|revenue|startup|customer|product)/.test(lower))
    return "business";
  return "editorial";
}
function makeImagePrompt(slideText: string, index: number) {
  const keywords = extractKeywords(slideText, 5);
  const tone = detectTone(slideText);
  const topic = keywords.length > 0 ? keywords.join(", ") : "article summary";
  return `${tone} editorial photograph for ${topic}, slide ${index + 1}, visually specific scene inspired by this point, cinematic light, layered depth, dark lower area for white text, no text`;
}
function makeImageUrl(imagePrompt: string, index: number) {
  return `instapost-generated://slide-${index + 1}/${encodeURIComponent(imagePrompt)}`;
}
function makeFallbackTitle(index: number, language: OutputLanguage) {
  return language === "ko" ? `핵심 포인트 ${index + 1}` : `Key Point ${index + 1}`;
}
function makeExtractiveSlides(
  articleText: string,
  pageCount: number,
  language: OutputLanguage,
): GeneratedSlide[] {
  const sentences = splitIntoSentences(articleText);
  const usefulSentences = sentences.length > 0 ? sentences : [articleText.slice(0, 360)];
  return Array.from({ length: pageCount }, (_, index) => {
    const sentence = usefulSentences[index % usefulSentences.length];
    const title = makeFallbackTitle(index, language);
    const text = compactText(sentence, language, "body");
    const imagePrompt = makeImagePrompt(`${title} ${text}`, index);
    return { title, text, imagePrompt, imageUrl: makeImageUrl(imagePrompt, index) };
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
    if (/전체 이야기|중요한 흐름과 의미|한눈에 이해|짧게 정리합니다|핵심 내용을 요약하면/i.test(combined))
      return false;
    if (language === "ko" && !/[가-힣]/.test(combined)) return false;
    if (language === "en" && !/[A-Za-z]{4,}/.test(combined)) return false;
    return true;
  });
}
function buildSummarySystemPrompt(sourceLanguage: OutputLanguage, pageCount: number) {
  const sourceLanguageName = sourceLanguage === "ko" ? "Korean" : "English";
  return [
    "You convert article text into Instagram carousel slide copy.",
    "Return only valid JSON. No markdown. No commentary.",
    `First summarize the article in its source language: ${sourceLanguageName}.`,
    `Create exactly ${pageCount} slides.`,
    "Every slide must summarize one concrete point from the article.",
    "Write in third person. Never use first person (I, we, our, 우리, 저는, etc).",
    "Write as if explaining the idea to a reader, not as the author speaking.",
    "Do not write generic filler.",
    "Do not repeat the same point.",
    "Keep every title short and declarative.",
    "Keep every text field to one clear sentence that summarizes a fact or insight.",
    "Use natural social-media wording, but do not invent facts.",
    "For imagePrompt, write an English visual prompt for a different contextual background image for that specific slide.",
    "Each imagePrompt must mention concrete visual subjects from the slide context, not generic abstract gradients.",
    'JSON format: {"slides":[{"title":"...","text":"...","imagePrompt":"..."}]}',
  ].join("\n");
}
function buildTranslationSystemPrompt(targetLanguage: OutputLanguage, pageCount: number) {
  const targetLanguageName = targetLanguage === "ko" ? "Korean" : "English";
  return [
    "Translate Instagram carousel slide copy.",
    "Return only valid JSON. No markdown. No commentary.",
    `Final output language: ${targetLanguageName}.`,
    `Translate exactly ${pageCount} slides.`,
    "Preserve the meaning, order, specificity, and factual claims.",
    "Keep every title short and declarative.",
    "Keep every text field to one clear sentence.",
    "Do not add, remove, merge, or repeat points.",
    'JSON format: {"slides":[{"title":"...","text":"..."}]}',
  ].join("\n");
}
function buildUserPrompt(articleText: string) {
  return `ARTICLE TEXT:\n${articleText.slice(0, MAX_ARTICLE_CHARS)}`;
}
function buildTranslationUserPrompt(slides: Array<{ title: string; text: string }>) {
  return `SLIDES TO TRANSLATE:\n${JSON.stringify({ slides })}`;
}
function getModelCandidates() {
  const envModel = getOptionalEnvValue("HF_MODEL");
  return [
    "Qwen/Qwen2.5-7B-Instruct:together",
    "meta-llama/Llama-3.1-8B-Instruct:nscale",
    "google/gemma-3n-E4B-it:together",
    "openai/gpt-oss-20b:novita",
    "Qwen/Qwen3-4B-Instruct-2507:nscale",
    envModel,
  ].filter((model, index, array): model is string => {
    return Boolean(model) && array.indexOf(model) === index;
  });
}
async function callHuggingFaceChatCompletion(args: {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}) {
  const token = getHFToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(HF_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxTokens ?? 1400,
        temperature: args.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 700)}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Invalid JSON response: ${rawText.slice(0, 700)}`);
    }
    const content =
      typeof data === "object" &&
      data !== null &&
      "choices" in data &&
      Array.isArray((data as { choices?: unknown }).choices)
        ? (data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message
            ?.content
        : undefined;
    if (!content || typeof content !== "string") {
      throw new Error(
        `No generated content returned: ${JSON.stringify(data).slice(0, 700)}`,
      );
    }
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}
async function callHuggingFace(systemPrompt: string, userPrompt: string) {
  const errors: string[] = [];
  for (const model of getModelCandidates()) {
    try {
      const result = await callHuggingFaceChatCompletion({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 1400,
        temperature: 0.2,
      });
      console.log(`[hf:success] ${model}`);
      return result;
    } catch (error) {
      const message = `${model}: ${safeErrorMessage(error)}`;
      errors.push(message);
      console.error("[hf:error]", message);
    }
  }
  throw new Error(`Hugging Face failed: ${errors.join(" | ")}`);
}
async function generateSlidesWithAi(
  articleText: string,
  pageCount: number,
  language: OutputLanguage,
) {
  const sourceLanguage = detectSourceLanguage(articleText);
  const systemPrompt = buildSummarySystemPrompt(sourceLanguage, pageCount);
  const userPrompt = buildUserPrompt(articleText);
  const summaryOutput = await callHuggingFace(systemPrompt, userPrompt);
  const sourceSlides = parseSlidesFromModel(summaryOutput);
  if (!isValidSlides(sourceSlides, pageCount, sourceLanguage)) {
    throw new Error(
      sourceLanguage === "ko"
        ? "AI returned invalid Korean source summaries. Using local fallback."
        : "AI returned invalid English source summaries. Using local fallback.",
    );
  }

  const finalSlides =
    sourceLanguage === language
      ? sourceSlides
      : parseSlidesFromModel(
          await callHuggingFace(
            buildTranslationSystemPrompt(language, pageCount),
            buildTranslationUserPrompt(sourceSlides.slice(0, pageCount)),
          ),
        );

  if (!isValidSlides(finalSlides, pageCount, language)) {
    throw new Error(
      language === "ko"
        ? "AI returned invalid Korean translated slides. Using local fallback."
        : "AI returned invalid English translated slides. Using local fallback.",
    );
  }

  return finalSlides.slice(0, pageCount).map((slide, index) => {
    const sourceSlide = sourceSlides[index] ?? slide;
    const title = compactText(
      slide.title || makeFallbackTitle(index, language),
      language,
      "title",
    );
    const text = compactText(slide.text, language, "body");
    const imagePrompt =
      sourceSlide.imagePrompt || makeImagePrompt(`${sourceSlide.title} ${sourceSlide.text}`, index);
    return { title, text, imagePrompt, imageUrl: makeImageUrl(imagePrompt, index) };
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
    models: getModelCandidates(),
    hasHFToken: Boolean(getOptionalEnvValue("HF_TOKEN")),
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
    try {
      const slides = await generateSlidesWithAi(articleText, pageCount, language);
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
      if (sourceLanguage !== language) {
        throw new Error(
          `Could not generate ${language === "ko" ? "Korean" : "English"} translation because the AI provider failed. ${safeErrorMessage(error)}`,
        );
      }
      return NextResponse.json({
        slides: makeExtractiveSlides(articleText, pageCount, language),
        meta: {
          route: ROUTE_VERSION,
          mode: "local-fallback",
          warning: safeErrorMessage(error),
          sourceLanguage,
        },
      });
    }
  } catch (error) {
    console.error("[generate:error]", error);
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Failed to generate post." },
      { status: 500 },
    );
  }
}
