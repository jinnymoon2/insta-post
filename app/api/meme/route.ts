import { NextResponse } from "next/server";
import { extractArticleText } from "@/app/lib/meme/extractArticleText";
import { generateMemePlan } from "@/app/lib/meme/generateMemePlan";
import { MemeLanguage } from "@/app/lib/meme/templates";

type RequestBody = {
  language: MemeLanguage;
  articleUrl?: string;
  text?: string;
};

function isValidLanguage(language: unknown): language is MemeLanguage {
  return language === "ko" || language === "en";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!isValidLanguage(body.language)) {
      return NextResponse.json(
        { error: "Language must be 'ko' or 'en'." },
        { status: 400 },
      );
    }

    const hasArticleUrl = Boolean(body.articleUrl?.trim());
    const hasText = Boolean(body.text?.trim());

    if (hasArticleUrl === hasText) {
      return NextResponse.json(
        { error: "Enter either an article URL or text, not both." },
        { status: 400 },
      );
    }

    let sourceText = "";

    if (hasArticleUrl && body.articleUrl) {
      sourceText = await extractArticleText(body.articleUrl.trim());
    }

    if (hasText && body.text) {
      sourceText = body.text.trim();
    }

    if (sourceText.length < 30) {
      return NextResponse.json(
        { error: "Please provide more text for meme generation." },
        { status: 400 },
      );
    }

    const memePlan = await generateMemePlan({
      language: body.language,
      sourceText,
    });

    return NextResponse.json({
      meme: memePlan,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate meme.",
      },
      { status: 500 },
    );
  }
}
