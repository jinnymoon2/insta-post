const ROUTE_VERSION = "generate-route-input-modes-20-pages-v12";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LanguageMode = "auto" | "ko" | "en";
type InputMode = "url" | "text";

type GeneratedSlide = {
  title: string;
  text: string;
  imageUrl: string;
};

type GenerateResponse = {
  title: string;
  caption: string;
  hashtags: string[];
  slides: GeneratedSlide[];
  sourceUrl?: string;
  detectedLanguage: "ko" | "en";
  backgroundImageUrl: string;
  routeVersion: string;
};

const FALLBACK_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Placeholder_book.svg/1200px-Placeholder_book.svg.png";

const DEFAULT_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

function normalizeOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  if (!trimmed) return undefined;

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid article URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  return parsed.toString();
}

function normalizeArticleText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned) return undefined;

  if (cleaned.length < 80) {
    throw new Error("Article text is too short. Please paste more content.");
  }

  return cleaned.slice(0, 9000);
}

function normalizeSlideCount(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 5;

  return Math.min(20, Math.max(1, Math.floor(numberValue)));
}

function normalizeInputMode(value: unknown): InputMode {
  if (value === "url" || value === "text") {
    return value;
  }

  return "url";
}

function normalizeLanguageMode(value: unknown): LanguageMode {
  if (value === "ko" || value === "en" || value === "auto") {
    return value;
  }

  return "auto";
}

function detectLanguage(text: string): "ko" | "en" {
  const koreanMatches = text.match(/[가-힣]/g)?.length ?? 0;
  const latinMatches = text.match(/[A-Za-z]/g)?.length ?? 0;

  return koreanMatches > latinMatches * 0.15 ? "ko" : "en";
}

function getOutputLanguage(
  articleText: string,
  languageMode: LanguageMode,
): "ko" | "en" {
  if (languageMode === "ko") return "ko";
  if (languageMode === "en") return "en";

  return detectLanguage(articleText);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getMetaContent(html: string, propertyOrName: string): string | null {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const propertyRegex = new RegExp(
    `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );

  const nameRegex = new RegExp(
    `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );

  const reversePropertyRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`,
    "i",
  );

  const reverseNameRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`,
    "i",
  );

  return (
    propertyRegex.exec(html)?.[1] ??
    nameRegex.exec(html)?.[1] ??
    reversePropertyRegex.exec(html)?.[1] ??
    reverseNameRegex.exec(html)?.[1] ??
    null
  );
}

function getTitleFromHtml(html: string): string {
  const ogTitle = getMetaContent(html, "og:title");

  if (ogTitle) {
    return stripHtml(ogTitle);
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]) {
    return stripHtml(titleMatch[1]);
  }

  return "Article Summary";
}

function absolutizeUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function getBestImageFromHtml(html: string, baseUrl: string): string {
  const ogImage =
    getMetaContent(html, "og:image") ??
    getMetaContent(html, "twitter:image") ??
    getMetaContent(html, "twitter:image:src");

  const absoluteOgImage = absolutizeUrl(ogImage, baseUrl);

  if (absoluteOgImage) {
    return absoluteOgImage;
  }

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  const absoluteImg = absolutizeUrl(imgMatch?.[1] ?? null, baseUrl);

  return absoluteImg ?? FALLBACK_IMAGE;
}

async function fetchArticle(url: string): Promise<{
  title: string;
  text: string;
  imageUrl: string;
}> {
  const errors: string[] = [];

  async function fetchDirectArticle() {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
        Referer: "https://www.google.com/",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Direct fetch failed with status ${response.status}.`);
    }

    const html = await response.text();
    const title = getTitleFromHtml(html);
    const imageUrl = getBestImageFromHtml(html, url);
    const text = stripHtml(html).slice(0, 9000);

    if (!text || text.length < 200) {
      throw new Error("Direct fetch did not return enough readable text.");
    }

    return {
      title,
      text,
      imageUrl,
    };
  }

  async function fetchReaderArticle(readerUrl: string) {
    const response = await fetch(readerUrl, {
      method: "GET",
      headers: {
        Accept: "text/plain, text/markdown, */*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Reader fetch failed with status ${response.status}.`);
    }

    const markdown = await response.text();
    const titleMatch = markdown.match(/^Title:\s*(.+)$/im);
    const imageMatch =
      markdown.match(/^Image:\s*(https?:\/\/\S+)$/im) ??
      markdown.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/i);
    const text = markdown
      .replace(/^Title:\s*.+$/gim, " ")
      .replace(/^URL Source:\s*.+$/gim, " ")
      .replace(/^Markdown Content:\s*/gim, " ")
      .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
      .replace(/\[[^\]]+]\([^)]+\)/g, " ")
      .replace(/[#*_>`~-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 9000);

    if (!text || text.length < 200) {
      throw new Error("Reader fetch did not return enough readable text.");
    }

    return {
      title: titleMatch?.[1]?.trim() || "Article Summary",
      text,
      imageUrl: imageMatch?.[1] || FALLBACK_IMAGE,
    };
  }

  try {
    return await fetchDirectArticle();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Direct fetch failed.");
  }

  const parsed = new URL(url);
  const readerUrls = [
    `https://r.jina.ai/http://${parsed.href.replace(/^https?:\/\//, "")}`,
    `https://r.jina.ai/${parsed.href}`,
  ];

  for (const readerUrl of readerUrls) {
    try {
      return await fetchReaderArticle(readerUrl);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Reader fetch failed.");
    }
  }

  throw new Error(
    `This article site blocked automatic reading. Paste the article text into the Article text box and generate again. Details: ${errors.join(" ")}`,
  );
}

function extractFirstJsonObject(text: string): unknown | null {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to extraction.
  }

  const start = cleaned.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        const jsonOnly = cleaned.slice(start, i + 1);

        try {
          return JSON.parse(jsonOnly);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : fallback;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？다요죠음임까])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

function selectRepresentativeSentences(text: string, slideCount: number): string[] {
  const sentences = splitIntoSentences(text);

  if (sentences.length >= slideCount) {
    return Array.from({ length: slideCount }, (_, index) => {
      const sentenceIndex =
        slideCount === 1
          ? Math.floor(sentences.length / 2)
          : Math.round((index * (sentences.length - 1)) / (slideCount - 1));

      return sentences[sentenceIndex];
    });
  }

  const chunkSize = Math.max(120, Math.ceil(text.length / slideCount));

  return Array.from({ length: slideCount }, (_, index) => {
    const start = index * chunkSize;
    const chunk = text.slice(start, start + chunkSize).trim();

    return chunk || text.slice(0, 180);
  });
}

function makeFallbackPost(
  article: {
    title: string;
    text: string;
    imageUrl: string;
  },
  sourceUrl: string | undefined,
  slideCount: number,
  detectedLanguage: "ko" | "en",
): GenerateResponse {
  const sentences = selectRepresentativeSentences(article.text, slideCount);

  const fallbackTexts =
    sentences.length >= slideCount
      ? sentences
      : detectedLanguage === "ko"
        ? [
            article.text.slice(0, 180),
            "이 글은 독자가 빠르게 이해해야 할 핵심 내용을 담고 있습니다.",
            "핵심은 이 이슈가 앞으로 어떤 변화로 이어질지 살펴보는 것입니다.",
          ]
        : [
            article.text.slice(0, 180),
            "This article highlights an important topic readers may want to understand quickly.",
            "The key point is to watch what changes next and why it matters.",
          ];

  const koTitles = ["무슨 일이 있었나", "왜 중요한가", "핵심 내용", "맥락", "정리"];
  const enTitles = ["What happened", "Why it matters", "Key detail", "Context", "Takeaway"];
  const titles = detectedLanguage === "ko" ? koTitles : enTitles;

  return {
    title: article.title,
    caption:
      detectedLanguage === "ko"
        ? `${article.title}\n\n기사의 핵심 내용을 인스타그램 캐러셀 형식으로 정리했습니다.`
        : `${article.title}\n\nHere is a quick summary of the article in carousel format.`,
    hashtags:
      detectedLanguage === "ko"
        ? ["#뉴스", "#요약", "#인스타그램"]
        : ["#news", "#summary", "#instagram"],
    slides: Array.from({ length: slideCount }, (_, index) => ({
      title: titles[index] ?? `Slide ${index + 1}`,
      text: fallbackTexts[index] ?? fallbackTexts[fallbackTexts.length - 1],
      imageUrl: article.imageUrl,
    })),
    sourceUrl,
    detectedLanguage,
    backgroundImageUrl: article.imageUrl,
    routeVersion: ROUTE_VERSION,
  };
}

function normalizeGeneratedResult(
  raw: unknown,
  article: {
    title: string;
    text: string;
    imageUrl: string;
  },
  sourceUrl: string | undefined,
  slideCount: number,
  detectedLanguage: "ko" | "en",
): GenerateResponse {
  const fallback = makeFallbackPost(article, sourceUrl, slideCount, detectedLanguage);

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const rawSlides = Array.isArray(record.slides) ? record.slides : [];

  const slides = rawSlides
    .map((item, index): GeneratedSlide | null => {
      if (!item || typeof item !== "object") return null;

      const slide = item as Record<string, unknown>;

      return {
        title: asString(slide.title, `Slide ${index + 1}`),
        text: asString(slide.text ?? slide.body ?? slide.description, ""),
        imageUrl: article.imageUrl,
      };
    })
    .filter(
      (slide): slide is GeneratedSlide =>
        slide !== null && slide.text.trim().length > 0,
    )
    .slice(0, slideCount);

  if (slides.length < slideCount) {
    const fallbackSlides = fallback.slides.slice(slides.length);
    slides.push(...fallbackSlides);
  }

  if (slides.length === 0) {
    return fallback;
  }

  return {
    title: asString(record.title, article.title),
    caption: asString(
      record.caption,
      detectedLanguage === "ko"
        ? `${article.title}\n\n기사의 핵심 내용을 인스타그램 캐러셀 형식으로 정리했습니다.`
        : `${article.title}\n\nA quick summary of the key points from this article.`,
    ),
    hashtags: asStringArray(
      record.hashtags,
      detectedLanguage === "ko"
        ? ["#뉴스", "#요약", "#인스타그램"]
        : ["#news", "#summary", "#instagram"],
    ),
    slides,
    sourceUrl,
    detectedLanguage,
    backgroundImageUrl: article.imageUrl,
    routeVersion: ROUTE_VERSION,
  };
}

function buildPrompt(params: {
  article: { title: string; text: string };
  slideCount: number;
  outputLanguage: "ko" | "en";
}): string {
  const languageInstruction =
    params.outputLanguage === "ko"
      ? "Write the entire Instagram post in Korean. If the article is English, translate and localize the content naturally into Korean."
      : "Write the entire Instagram post in English. If the article is Korean, translate and localize the content naturally into English.";

  return `
You are an Instagram content strategist.

Create an Instagram carousel post from this article.

${languageInstruction}

Article title:
${params.article.title}

Article text:
${params.article.text}

Return one valid JSON object only.
No markdown.
No explanation.
No comments.
No extra text before or after the JSON.

Use exactly this JSON shape:
{
  "title": "Short post title",
  "caption": "Instagram caption",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "slides": [
    {
      "title": "Slide title",
      "text": "Slide body text"
    }
  ]
}

Rules:
- Make exactly ${params.slideCount} slides.
- The slides must summarize the full article, including the beginning, middle, and end.
- If ${params.slideCount} is small, compress the entire article into fewer broader points instead of covering only the first part.
- Each slide title must be short.
- Each slide text must be clear and concise.
- Do not invent facts that are not in the article.
- Make it understandable for a general audience.
- Keep slide text suitable for an Instagram carousel.
`.trim();
}

async function callHuggingFace(prompt: string): Promise<unknown | null> {
  const hfToken = process.env.HF_TOKEN?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_MODEL;

  if (!hfToken) {
    console.error("[huggingface:missing-token]");
    return null;
  }

  let response: Response;

  try {
    response = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 1800,
            temperature: 0.2,
            return_full_text: false,
          },
        }),
      },
    );
  } catch (error) {
    console.error("[huggingface:fetch-failed]", error);
    return null;
  }

  const responseText = await response.text();

  if (!response.ok) {
    console.error("[huggingface:error]", response.status, responseText);
    return null;
  }

  let data: unknown;

  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("[huggingface:non-json-response]", responseText);
    return null;
  }

  let generatedText = "";

  if (Array.isArray(data)) {
    const first = data[0];

    if (first && typeof first === "object") {
      const firstRecord = first as Record<string, unknown>;

      generatedText = asString(
        firstRecord.generated_text ??
          firstRecord.summary_text ??
          firstRecord.text,
        "",
      );
    }
  } else if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    generatedText = asString(
      record.generated_text ?? record.summary_text ?? record.text,
      "",
    );
  }

  if (!generatedText) {
    console.error("[huggingface:empty-generated-text]", data);
    return null;
  }

  return extractFirstJsonObject(generatedText);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const inputMode = normalizeInputMode(body.inputMode);
    const sourceUrl =
      inputMode === "url" ? normalizeOptionalUrl(body.url) : undefined;
    const manualText =
      inputMode === "text" ? normalizeArticleText(body.articleText) : undefined;
    const slideCount = normalizeSlideCount(body.slideCount);
    const languageMode = normalizeLanguageMode(body.languageMode);

    let article: {
      title: string;
      text: string;
      imageUrl: string;
    };

    if (manualText) {
      article = {
        title: asString(body.title, "Article Summary"),
        text: manualText,
        imageUrl: FALLBACK_IMAGE,
      };
    } else if (sourceUrl) {
      article = await fetchArticle(sourceUrl);
    } else if (inputMode === "text") {
      throw new Error("Please paste at least 80 characters of text.");
    } else {
      throw new Error("Please enter an article URL.");
    }

    const detectedLanguage = getOutputLanguage(article.text, languageMode);

    const prompt = buildPrompt({
      article,
      slideCount,
      outputLanguage: detectedLanguage,
    });

    const rawGenerated = await callHuggingFace(prompt);
    const normalized = normalizeGeneratedResult(
      rawGenerated,
      article,
      sourceUrl,
      slideCount,
      detectedLanguage,
    );

    return Response.json(normalized);
  } catch (error) {
    console.error("[generate:error]", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";

    return Response.json(
      {
        error: message,
        routeVersion: ROUTE_VERSION,
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    routeVersion: ROUTE_VERSION,
  });
}
