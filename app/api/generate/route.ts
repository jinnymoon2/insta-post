export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE_VERSION = "generate-route-4x5-two-sentence-v3";

type GeneratedSlide = {
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string;
};

type GeneratedResponse = {
  slides: GeneratedSlide[];
};

function getEnvValue(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} in .env.local.`);
  }

  return value;
}

async function fetchArticle(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Could not fetch article. Status: ${response.status}`);
  }

  const html = await response.text();

  const cleanedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedText || cleanedText.length < 200) {
    throw new Error("Could not extract enough article text.");
  }

  return cleanedText.slice(0, 12000);
}

function getLanguageInstruction(language: string) {
  if (language === "ko") {
    return "Write everything in Korean.";
  }

  if (language === "ja") {
    return "Write everything in Japanese.";
  }

  if (language === "zh") {
    return "Write everything in Chinese.";
  }

  return "Write everything in English.";
}

function clampPageCount(value: unknown) {
  const requestedPageCount = Number(value);

  return Number.isFinite(requestedPageCount)
    ? Math.min(Math.max(Math.floor(requestedPageCount), 1), 10)
    : 6;
}

function splitIntoSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？다요죠음임까])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);
}

function limitToTwoSentences(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences = splitIntoSentences(cleaned);

  if (sentences.length > 0) {
    return sentences.slice(0, 2).join(" ");
  }

  return cleaned.slice(0, 220);
}

function getFallbackTitle(index: number, language: string) {
  const englishTitles = [
    "Core Idea",
    "Why It Matters",
    "Key Context",
    "Main Change",
    "What To Watch",
    "Impact",
    "Next Step",
    "Big Picture",
    "Open Question",
    "Takeaway",
  ];
  const koreanTitles = [
    "핵심 내용",
    "왜 중요한가",
    "주요 맥락",
    "핵심 변화",
    "눈여겨볼 점",
    "영향",
    "다음 단계",
    "큰 흐름",
    "남은 질문",
    "정리",
  ];

  return language === "ko"
    ? koreanTitles[index % koreanTitles.length]
    : englishTitles[index % englishTitles.length];
}

function hasUnexpectedLatin(text: string) {
  const allowed = new Set(["AI", "API", "CEO", "SNS", "IT", "Gemini", "ChatGPT"]);
  const latinWords = text.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];

  return latinWords.some((word) => !allowed.has(word));
}

function cleanTitle(title: string, index: number, language: string) {
  const cleaned = title.replace(/\s+/g, " ").trim();
  const maxLength = language === "ko" ? 34 : 58;

  if (!cleaned || cleaned.length > maxLength) {
    return getFallbackTitle(index, language);
  }

  if (language === "ko" && hasUnexpectedLatin(cleaned)) {
    return getFallbackTitle(index, language);
  }

  return cleaned.replace(/[.!?。！？]+$/g, "");
}

function cleanBody(text: string, index: number, language: string) {
  const cleaned = limitToTwoSentences(text);

  if (!cleaned) {
    return language === "ko"
      ? "이 페이지는 전체 이야기에서 중요한 흐름과 의미를 짧게 정리합니다."
      : "This page summarizes one important part of the larger story.";
  }

  if (language === "ko" && hasUnexpectedLatin(cleaned)) {
    return "전체 이야기에서 중요한 흐름과 의미를 한눈에 이해할 수 있도록 짧게 정리합니다.";
  }

  return cleaned;
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

  if (/(risk|crisis|urgent|warning|danger|conflict|threat)/.test(lower)) {
    return "urgent";
  }

  if (/(ai|technology|software|computer|device|startup|innovation|robotics)/.test(lower)) {
    return "technology";
  }

  if (/(climate|energy|solar|wind|battery|earth|ocean|forest|nature)/.test(lower)) {
    return "climate";
  }

  if (/(school|student|education|learning|research|classroom)/.test(lower)) {
    return "education";
  }

  return "editorial";
}

function makeImagePrompt(slideText: string, index: number) {
  const keywords = extractKeywords(slideText, 5);
  const tone = detectTone(slideText);
  const topic = keywords.length > 0 ? keywords.join(", ") : "article summary";

  return `${tone} editorial background for ${topic}, slide ${index + 1}, abstract photographic composition, no text`;
}

function makeImageUrl(imagePrompt: string, index: number) {
  return `instapost-generated://slide-${index + 1}/${encodeURIComponent(imagePrompt)}`;
}

function summarizeFallback(article: string, pageCount: number, language: string): GeneratedResponse {
  const sentences = splitIntoSentences(article);
  const selected = Array.from({ length: pageCount }, (_, index) => {
    if (sentences.length === 0) return article.slice(0, 220);

    const sentenceIndex =
      pageCount === 1
        ? Math.floor(sentences.length / 2)
        : Math.round((index * (sentences.length - 1)) / Math.max(1, pageCount - 1));

    return sentences[sentenceIndex] ?? sentences[index % sentences.length];
  });

  const useKorean = language === "ko";

  return {
    slides: selected.map((sourceText, index) => {
      const keywords = extractKeywords(sourceText, 4);
      const topic = keywords.length > 0 ? keywords.join(", ") : "the main point";
      const text = useKorean
        ? `${topic}를 중심으로 핵심 내용을 요약하면, 이 부분은 전체 이야기의 흐름과 의미를 보여줍니다.`
        : `This page summarizes the key point around ${topic} and why it matters in the larger story.`;
      const imagePrompt = makeImagePrompt(`${topic} ${sourceText}`, index);

      return {
        title: getFallbackTitle(index, language),
        text,
        imagePrompt,
        imageUrl: makeImageUrl(imagePrompt, index),
      };
    }),
  };
}

function extractJson(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("AI response did not contain valid JSON.");
    }

    return JSON.parse(jsonMatch[0]);
  }
}

function normalizeGeneratedResponse(
  parsed: unknown,
  pageCount: number,
  language: string
): GeneratedResponse {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("slides" in parsed) ||
    !Array.isArray((parsed as { slides: unknown }).slides)
  ) {
    throw new Error("AI response was missing the slides array.");
  }

  const slides = (parsed as { slides: unknown[] }).slides
    .slice(0, pageCount)
    .map((slide, index) => {
      if (typeof slide !== "object" || slide === null) {
        return {
          title: `Page ${index + 1}`,
          text: "",
          imagePrompt: "",
          imageUrl: "",
        };
      }

      const item = slide as {
        title?: unknown;
        text?: unknown;
        imagePrompt?: unknown;
      };

      return {
        title:
          typeof item.title === "string" && item.title.trim()
            ? cleanTitle(item.title, index, language)
            : getFallbackTitle(index, language),
        text:
          typeof item.text === "string" && item.text.trim()
            ? cleanBody(item.text, index, language)
            : cleanBody("", index, language),
        imagePrompt:
          typeof item.imagePrompt === "string" && item.imagePrompt.trim()
            ? item.imagePrompt.trim()
            : "",
        imageUrl: "",
      };
    })
    .map((slide, index) => {
      const imagePrompt =
        slide.imagePrompt || makeImagePrompt(`${slide.title} ${slide.text}`, index);

      return {
        ...slide,
        imagePrompt,
        imageUrl: makeImageUrl(imagePrompt, index),
      };
    });

  if (slides.length < pageCount) {
    throw new Error("AI returned fewer slides than requested.");
  }

  return { slides };
}

async function generateWithHuggingFace(prompt: string) {
  const hfToken = getEnvValue("HF_TOKEN");

  const response = await fetch(
    "https://router.huggingface.co/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-3.1-8B-Instruct",
        messages: [
          {
            role: "system",
            content:
              "You are a social media content strategist. Return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2500,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : JSON.stringify(data, null, 2);

    throw new Error(message || "Hugging Face generation failed.");
  }

  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Hugging Face response did not include text content.");
  }

  return content;
}

export async function GET() {
  return Response.json({
    ok: true,
    route: ROUTE_VERSION,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const url = typeof body.url === "string" ? body.url.trim() : "";

    const articleText =
      typeof body.articleText === "string" ? body.articleText.trim() : "";

    const language = typeof body.language === "string" ? body.language : "en";

    const pageCount = clampPageCount(body.pageCount);

    if (!url && !articleText) {
      return Response.json(
        {
          error: "Please enter an article URL or paste article text manually.",
        },
        { status: 400 }
      );
    }

    let article = articleText;

    if (!article && url) {
      try {
        article = await fetchArticle(url);
      } catch (error) {
        console.error("[fetchArticle:error]", error);

        return Response.json(
          {
            error:
              "Could not fetch article. Status: 403. This site may block server fetching. Paste the article text manually instead.",
          },
          { status: 403 }
        );
      }
    }

    const languageInstruction = getLanguageInstruction(language);

    const prompt = `
You are an expert Instagram carousel content strategist.

Create an Instagram carousel post based on the article below.

Requirements:
- Create exactly ${pageCount} carousel pages.
- ${languageInstruction}
- Summarize the article; do not copy/paste article sentences directly.
- Make the content clear, concise, and engaging.
- Each page should have a strong title and short body text.
- Keep each title short: under 34 Korean characters or under 58 English characters.
- Each page body must be 1-2 sentences only.
- Each page should include a different imagePrompt for generating a visual.
- The imagePrompt should reflect the tone and information of that page.
- Each imagePrompt must be different from the others.
- The carousel should feel coherent from first page to last page.
- The first page should work as a strong hook.
- The last page should feel like a conclusion or takeaway.
- Return only valid JSON.
- Do not include markdown.
- Do not include explanations outside the JSON.

Return this exact JSON structure:

{
  "slides": [
    {
      "title": "Page title",
      "text": "Page body text",
      "imagePrompt": "Image generation prompt for this page"
    }
  ]
}

Article:
${article}
`;

    let normalized: GeneratedResponse;

    try {
      const aiText = await generateWithHuggingFace(prompt);
      const parsed = extractJson(aiText);
      normalized = normalizeGeneratedResponse(parsed, pageCount, language);
    } catch (error) {
      console.error("[generate:fallback]", error);
      normalized = summarizeFallback(article, pageCount, language);
    }

    return Response.json(normalized);
  } catch (error) {
    console.error("[generate:error]", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate carousel.",
      },
      { status: 500 }
    );
  }
}
