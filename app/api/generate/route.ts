import { NextRequest, NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE_VERSION = "generate-route-reader-fallback-v5";

const GenerateSchema = z.object({
  mode: z.enum(["url", "text"]),
  url: z.string().optional(),
  text: z.string().optional(),
  pageCount: z.number().int().min(5).max(20),
  language: z.enum(["auto", "english", "korean"]).default("auto")
});

type InstaSlide = {
  page: number;
  sentence: string;
  imageQuery: string;
  imageUrl?: string;
  imageCredit?: string;
  imagePageUrl?: string;
};

type AIResponse = {
  title: string;
  caption: string;
  hashtags: string[];
  slides: InstaSlide[];
};

type CommonsPage = {
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};

function cleanText(input: string) {
  return input
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function clampSourceText(input: string) {
  return cleanText(input).slice(0, 24000);
}

async function extractArticleFromUrl(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https links are allowed.");
  }

  const errors: string[] = [];

  async function tryDirectFetch() {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Direct fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url: parsed.toString() });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const title =
      article?.title ||
      dom.window.document.querySelector("title")?.textContent ||
      "Untitled Article";

    const text =
      article?.textContent ||
      dom.window.document.body?.textContent ||
      "";

    const cleaned = cleanText(text);

    if (cleaned.length < 300) {
      throw new Error("Direct fetch returned too little readable text.");
    }

    return {
      title: cleanText(title),
      text: clampSourceText(cleaned)
    };
  }

  async function tryJinaReaderOne() {
    const jinaUrl = `https://r.jina.ai/http://${parsed.href.replace(
      /^https?:\/\//,
      ""
    )}`;

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Mozilla/5.0"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Jina Reader one failed with status ${response.status}`);
    }

    const markdown = await response.text();
    const cleaned = cleanText(markdown);

    if (cleaned.length < 300) {
      throw new Error("Jina Reader one returned too little readable text.");
    }

    const titleMatch = markdown.match(/^Title:\s*(.+)$/m);

    return {
      title: cleanText(titleMatch?.[1] || "Article Summary"),
      text: clampSourceText(cleaned)
    };
  }

  async function tryJinaReaderTwo() {
    const jinaUrl = `https://r.jina.ai/${parsed.href}`;

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Mozilla/5.0"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Jina Reader two failed with status ${response.status}`);
    }

    const markdown = await response.text();
    const cleaned = cleanText(markdown);

    if (cleaned.length < 300) {
      throw new Error("Jina Reader two returned too little readable text.");
    }

    const titleMatch = markdown.match(/^Title:\s*(.+)$/m);

    return {
      title: cleanText(titleMatch?.[1] || "Article Summary"),
      text: clampSourceText(cleaned)
    };
  }

  try {
    return await tryDirectFetch();
  } catch (error: any) {
    errors.push(error?.message || "Direct fetch failed.");
  }

  try {
    return await tryJinaReaderOne();
  } catch (error: any) {
    errors.push(error?.message || "Jina Reader one failed.");
  }

  try {
    return await tryJinaReaderTwo();
  } catch (error: any) {
    errors.push(error?.message || "Jina Reader two failed.");
  }

  throw new Error(
    `Could not read this article automatically. Please use Paste Writing mode instead. Details: ${errors.join(
      " | "
    )}`
  );
}

function buildPrompt(args: {
  sourceTitle: string;
  sourceText: string;
  pageCount: number;
  language: "auto" | "english" | "korean";
}) {
  const languageInstruction =
    args.language === "korean"
      ? "Write the output in Korean."
      : args.language === "english"
        ? "Write the output in English."
        : "Use the same main language as the source text.";

  return `
You are InstaPost, an AI that turns articles and long writing into Instagram carousel posts.

Task:
Create exactly ${args.pageCount} Instagram carousel pages.
Each page must contain 1 to 2 short sentences.
The full carousel must summarize the entire source from beginning to end.
The writing should feel Instagram-postable: clear, punchy, concise, and readable on a visual slide.
Do not invent facts that are not in the source.

Style:
- Each slide should focus on one idea.
- The first slide should work as a hook.
- The middle slides should explain the core points.
- The final slide should give the takeaway.
- Avoid long paragraphs.
- Avoid generic filler.
- ${languageInstruction}

For each slide, also create an imageQuery for searching a background image.
The imageQuery should be 2 to 5 English words.
Use visual concepts, not abstract sentences.

Return only valid JSON.
No markdown.
No explanation.

JSON format:
{
  "title": "short carousel title",
  "caption": "short Instagram caption",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "slides": [
    {
      "page": 1,
      "sentence": "1-2 sentences for this page.",
      "imageQuery": "background image search query"
    }
  ]
}

Source title:
${args.sourceTitle}

Source text:
${args.sourceText}
`;
}

function extractJson(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("AI did not return valid JSON.");
    }

    return JSON.parse(match[0]);
  }
}

async function callHuggingFace(prompt: string): Promise<AIResponse> {
  const token = process.env.HF_TOKEN;
  const model = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct-1M";

  if (!token) {
    throw new Error("Missing HF_TOKEN in .env.local.");
  }

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a careful social media editor. You only output valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2500
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `Hugging Face request failed with status ${response.status}.`
    );
  }

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Hugging Face returned an empty response.");
  }

  return extractJson(content) as AIResponse;
}

async function searchCommonsImage(query: string) {
  const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");

  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");
  searchUrl.searchParams.set("generator", "search");
  searchUrl.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  searchUrl.searchParams.set("gsrnamespace", "6");
  searchUrl.searchParams.set("gsrlimit", "8");
  searchUrl.searchParams.set("prop", "imageinfo");
  searchUrl.searchParams.set("iiprop", "url|extmetadata");
  searchUrl.searchParams.set("iiurlwidth", "1400");

  const response = await fetch(searchUrl.toString(), {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  const pages = Object.values(
    (data?.query?.pages ?? {}) as Record<string, CommonsPage>
  );

  const usable = pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata || {};

      return {
        imageUrl: info?.thumburl || info?.url,
        imageCredit:
          meta.Artist?.value?.replace(/<[^>]*>/g, "") ||
          meta.Credit?.value?.replace(/<[^>]*>/g, "") ||
          "Wikimedia Commons",
        imagePageUrl: info?.descriptionurl
      };
    })
    .filter((item) => {
      if (!item.imageUrl) return false;
      return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(item.imageUrl);
    });

  return usable[0] || null;
}

function normalizeAIResponse(ai: AIResponse, pageCount: number): AIResponse {
  const slides = Array.isArray(ai.slides) ? ai.slides.slice(0, pageCount) : [];

  while (slides.length < pageCount) {
    slides.push({
      page: slides.length + 1,
      sentence: "Add one clear takeaway from the article here.",
      imageQuery: "digital abstract"
    });
  }

  return {
    title: ai.title || "InstaPost Carousel",
    caption: ai.caption || "",
    hashtags: Array.isArray(ai.hashtags) ? ai.hashtags.slice(0, 8) : [],
    slides: slides.map((slide, index) => ({
      page: index + 1,
      sentence: cleanText(slide.sentence || ""),
      imageQuery: cleanText(slide.imageQuery || "abstract background")
    }))
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: ROUTE_VERSION
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = GenerateSchema.parse(body);

    let sourceTitle = "Pasted Writing";
    let sourceText = "";

    if (parsed.mode === "url") {
      if (!parsed.url) {
        throw new Error("URL is required.");
      }

      const article = await extractArticleFromUrl(parsed.url);
      sourceTitle = article.title;
      sourceText = article.text;
    } else {
      if (!parsed.text || cleanText(parsed.text).length < 300) {
        throw new Error("Please paste at least 300 characters.");
      }

      sourceText = clampSourceText(parsed.text);
    }

    const prompt = buildPrompt({
      sourceTitle,
      sourceText,
      pageCount: parsed.pageCount,
      language: parsed.language
    });

    const aiRaw = await callHuggingFace(prompt);
    const ai = normalizeAIResponse(aiRaw, parsed.pageCount);

    const slidesWithImages = await Promise.all(
      ai.slides.map(async (slide) => {
        const image = await searchCommonsImage(slide.imageQuery);

        return {
          ...slide,
          imageUrl:
            image?.imageUrl ||
            "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/1400px-Fronalpstock_big.jpg",
          imageCredit: image?.imageCredit || "Wikimedia Commons",
          imagePageUrl: image?.imagePageUrl || "https://commons.wikimedia.org/"
        };
      })
    );

    return NextResponse.json({
      route: ROUTE_VERSION,
      title: ai.title,
      caption: ai.caption,
      hashtags: ai.hashtags,
      slides: slidesWithImages
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        route: ROUTE_VERSION,
        error: error?.message || "Something went wrong."
      },
      {
        status: 400
      }
    );
  }
}
