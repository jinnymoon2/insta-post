export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE_VERSION = "generate-route-manual-input-v1";

type GeneratedSlide = {
  title: string;
  text: string;
  imagePrompt: string;
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
  pageCount: number
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
            ? item.title.trim()
            : `Page ${index + 1}`,
        text:
          typeof item.text === "string" && item.text.trim()
            ? item.text.trim()
            : "",
        imagePrompt:
          typeof item.imagePrompt === "string" && item.imagePrompt.trim()
            ? item.imagePrompt.trim()
            : "",
      };
    });

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

    const requestedPageCount = Number(body.pageCount);

    const pageCount = Number.isFinite(requestedPageCount)
      ? Math.min(Math.max(requestedPageCount, 3), 10)
      : 6;

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
- Make the content clear, concise, and engaging.
- Each page should have a strong title and short body text.
- Each page should include an imagePrompt for generating a visual.
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

    const aiText = await generateWithHuggingFace(prompt);
    const parsed = extractJson(aiText);
    const normalized = normalizeGeneratedResponse(parsed, pageCount);

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