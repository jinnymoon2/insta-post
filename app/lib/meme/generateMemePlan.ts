import { fetchCaptionInspiration } from "./captionInspiration";
import {
  buildMemeSearchQuery,
  MemeImageSource,
  MemeLanguage,
} from "./templates";

export type MemePlan = {
  language: MemeLanguage;
  sourceSummary: string;
  keywords: string[];
  vibe: string;
  templateId: string;
  templateName: string;
  imageUrl: string;
  imageSource: MemeImageSource;
  searchQuery: string;
  captionSearchQuery: string;
  captionInspiration: string[];
  topText: string;
  bottomText: string;
};

type GenerateMemePlanInput = {
  language: MemeLanguage;
  sourceText: string;
};

function normalizeText(text: string) {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

function extractKeywords(text: string, language: MemeLanguage) {
  const cleaned = text
    .replace(/&#x27;/g, " ")
    .replace(/&#39;/g, " ")
    .replace(/&quot;/g, " ")
    .replace(/&amp;/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const stopwords =
    language === "ko"
      ? new Set([
          "그리고",
          "하지만",
          "있는",
          "없는",
          "합니다",
          "에서",
          "으로",
          "에게",
          "대한",
          "이번",
          "오늘",
          "관련",
          "것으로",
          "다고",
          "했다",
          "있다",
          "그",
          "이",
          "저",
          "것",
          "수",
          "등",
          "더",
          "또",
          "때",
          "중",
        ])
      : new Set([
          "the",
          "and",
          "or",
          "but",
          "this",
          "that",
          "with",
          "from",
          "about",
          "into",
          "their",
          "there",
          "have",
          "has",
          "was",
          "were",
          "will",
          "would",
          "could",
          "should",
          "when",
          "what",
          "which",
          "while",
          "because",
          "through",
          "for",
          "are",
          "not",
          "you",
          "your",
          "its",
          "it's",
          "to",
          "in",
          "on",
          "of",
          "as",
          "is",
          "a",
          "an",
          "x27",
          "quot",
          "amp",
        ]);

  const counts = new Map<string, number>();

  for (const word of cleaned) {
    const normalized = word.toLowerCase();

    if (normalized.length < 3) continue;
    if (/^\d+$/.test(normalized)) continue;
    if (stopwords.has(normalized)) continue;

    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function detectDynamicVibe(text: string, language: MemeLanguage) {
  const lower = text.toLowerCase();

  const vibeSignals: Array<{
    vibe: string;
    patterns: RegExp[];
  }> =
    language === "ko"
      ? [
          {
            vibe: "AI 때문에 살짝 위협받는 개발자 느낌",
            patterns: [/ai|인공지능|생성형|gpt|llm|모델/i],
          },
          {
            vibe: "개발하다가 예상 못 한 버그를 만난 느낌",
            patterns: [/개발|코드|버그|배포|깃허브|프론트엔드|백엔드|api/i],
          },
          {
            vibe: "회사에서 갑자기 일이 커지는 느낌",
            patterns: [/회사|업무|마감|회의|담당|요청|프로젝트/i],
          },
          {
            vibe: "뉴스 보고 어이없어서 멈춘 느낌",
            patterns: [/뉴스|발표|논란|정책|규제|이슈/i],
          },
          {
            vibe: "생각보다 일이 너무 잘 풀려서 당황한 느낌",
            patterns: [/성공|성장|돌파|출시|기록|인기|확산/i],
          },
          {
            vibe: "처음엔 쉬워 보였는데 현실은 어려운 느낌",
            patterns: [/문제|위기|실패|하락|리스크|복잡|어려/i],
          },
          {
            vibe: "갑자기 판이 바뀌어서 충격받은 느낌",
            patterns: [/충격|반전|갑자기|놀라운|예상 밖|실화/i],
          },
          {
            vibe: "모두가 조용히 눈치 보는 느낌",
            patterns: [/불확실|걱정|우려|긴장|위험/i],
          },
          {
            vibe: "혼자만 진실을 알아버린 느낌",
            patterns: [/사실|진실|알고 보니|결국|드러/i],
          },
          {
            vibe: "트렌드를 따라가야 해서 바쁜 느낌",
            patterns: [/트렌드|유행|빠르게|변화|전환|새로운/i],
          },
        ]
      : [
          {
            vibe: "developer realizing AI changed the game",
            patterns: [/ai|artificial intelligence|gpt|llm|model|automation/i],
          },
          {
            vibe: "programmer finding an unexpected bug",
            patterns: [/developer|code|bug|github|deploy|api|frontend|backend/i],
          },
          {
            vibe: "office worker watching a simple task become complicated",
            patterns: [/company|office|meeting|manager|deadline|project|enterprise/i],
          },
          {
            vibe: "person shocked by breaking tech news",
            patterns: [/news|announcement|policy|regulation|controversy|issue/i],
          },
          {
            vibe: "person celebrating an unexpected win",
            patterns: [/success|growth|launch|record|win|popular|viral/i],
          },
          {
            vibe: "person realizing reality is harder than expected",
            patterns: [/problem|risk|crisis|failure|decline|difficult|complex/i],
          },
          {
            vibe: "person processing a plot twist",
            patterns: [/shock|surprise|unexpected|suddenly|plot twist|real/i],
          },
          {
            vibe: "everyone quietly panicking",
            patterns: [/uncertain|worry|concern|fear|threat|danger/i],
          },
          {
            vibe: "person who just discovered the hidden truth",
            patterns: [/truth|actually|turns out|revealed|secret|finally/i],
          },
          {
            vibe: "person trying to keep up with a fast trend",
            patterns: [/trend|fast|change|shift|new era|transition/i],
          },
        ];

  const matchedVibes = vibeSignals
    .filter((signal) => signal.patterns.some((pattern) => pattern.test(lower)))
    .map((signal) => signal.vibe);

  if (matchedVibes.length > 0) {
    return matchedVibes.slice(0, 2).join(" + ");
  }

  const hasQuestion = lower.includes("?") || /(why|how|what|왜|어떻게|무슨)/i.test(text);

  if (language === "ko") {
    return hasQuestion
      ? "상황을 이해하려고 애쓰는 당황한 느낌"
      : "뉴스를 보고 반응을 숨기지 못하는 느낌";
  }

  return hasQuestion
    ? "confused person trying to understand what just happened"
    : "person reacting dramatically to unexpected news";
}

function pickRandom<T>(items: T[], fallback: T) {
  if (items.length === 0) return fallback;
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
}

function shorten(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) return cleaned;

  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function extractShortInspiration(phrases: string[], language: MemeLanguage) {
  const cleaned = phrases
    .map((phrase) =>
      phrase
        .replace(/\s+/g, " ")
        .replace(/^[^a-zA-Z가-힣0-9]+/, "")
        .replace(/[^a-zA-Z가-힣0-9?!'"“”‘’.,\s-]+$/g, "")
        .trim(),
    )
    .filter((phrase) => phrase.length >= 12 && phrase.length <= 120);

  const selected = pickRandom(
    cleaned,
    language === "ko" ? "이게 진짜 요즘 상황" : "This is literally the situation",
  );

  return shorten(selected, language === "ko" ? 36 : 48);
}

function makeCaption({
  language,
  vibe,
  keywords,
  inspirationPhrases,
}: {
  language: MemeLanguage;
  vibe: string;
  keywords: string[];
  inspirationPhrases: string[];
}) {
  const main = keywords[0] || (language === "ko" ? "이 뉴스" : "this update");
  const second = keywords[1] || (language === "ko" ? "현실" : "reality");
  const third = keywords[2] || (language === "ko" ? "상황" : "the situation");
  const inspiration = extractShortInspiration(inspirationPhrases, language);
  const vibeLower = vibe.toLowerCase();

  const randomSeed = Math.floor(Math.random() * 1000000);
  const variant = randomSeed % 12;

  if (language === "ko") {
    const topOptions = [
      `${main} 보기 전의 나`,
      `나: ${main} 별거 아니겠지`,
      `처음엔 ${main} 그냥 넘겼는데`,
      `사람들: ${main} 또 나온 거 아님?`,
      `${main} 소식 들은 내 표정`,
      `오늘의 인터넷: ${main}`,
      `내가 이해한 ${main}`,
      `아직 ${second} 모르는 나`,
      inspiration,
      `${third} 설명 들은 후`,
      `분명 간단한 얘기였는데`,
      `이쯤 되면 ${main}이 주인공`,
    ];

    const bottomOptions = [
      `현실: 전혀 간단하지 않았음`,
      `알고 보니 ${second}가 핵심이었음`,
      `그리고 하루가 사라졌습니다`,
      `근데 이제 진짜 문제가 시작됨`,
      `나만 이렇게 이해한 거 아니죠?`,
      `이게 바로 요즘 밈이 되는 과정`,
      `결론: 생각보다 더 심각함`,
      `그래서 이제 ${third}도 바뀐다고요?`,
      `웃긴데 안 웃김`,
      `인터넷은 이미 반응 중`,
      `잠깐만요 이게 실화라고요?`,
      `이제 모른 척 못 함`,
    ];

    if (vibe.includes("AI") || vibeLower.includes("ai")) {
      bottomOptions.push(
        "AI 업계: 아니요, 판이 바뀌었습니다",
        "개발자들: 웃고 있지만 눈은 안 웃음",
        "편해진 건 맞는데 마음은 불편함",
      );
    }

    if (vibe.includes("개발") || vibe.includes("버그")) {
      bottomOptions.push(
        "현실: 디버깅 파티 시작",
        "개발자: 왜 또 나야",
        "간단한 수정이 아니었습니다",
      );
    }

    return {
      topText: pickRandom(topOptions, `${main} 보기 전의 나`),
      bottomText: pickRandom(bottomOptions, `현실: ${second} 때문에 하루 삭제`),
    };
  }

  const topOptions = [
    `Me before reading about ${main}`,
    `Me: "${main} is probably simple"`,
    `Everyone acting normal about ${main}`,
    `The internet seeing ${main}`,
    `Me trying to understand ${main}`,
    `Before ${second} entered the chat`,
    inspiration,
    `Nobody:`,
    `The article: "${main}"`,
    `Me opening the article for 2 seconds`,
    `When ${main} sounds harmless`,
    `POV: you just learned about ${main}`,
  ];

  const bottomOptions = [
    `Reality: it was not simple`,
    `Also reality: ${second} changed everything`,
    `And somehow this is my problem now`,
    `The comments are already writing themselves`,
    `That aged badly in record time`,
    `Nobody is safe from ${third}`,
    `The plot twist has entered the chat`,
    `Internet reaction: completely reasonable panic`,
    `I laughed, then realized it was serious`,
    `So we are all pretending this is fine?`,
    `This is how the meme economy begins`,
    `Wait, that's actually real?`,
  ];

  if (vibeLower.includes("ai")) {
    bottomOptions.push(
      `AI industry: "That aged badly."`,
      `Developers laughing nervously in the corner`,
      `Cool feature. Slight existential crisis.`,
    );
  }

  if (vibeLower.includes("developer") || vibeLower.includes("programmer") || vibeLower.includes("bug")) {
    bottomOptions.push(
      `Also me 6 hours later: debugging ${second}`,
      `The bug was in my confidence`,
      `One does not simply "quickly fix" ${third}`,
    );
  }

  return {
    topText: pickRandom(topOptions, `Me before reading about ${main}`),
    bottomText: pickRandom(bottomOptions, `Reality: ${second} changed everything`),
  };
}

export async function generateMemePlan({
  language,
  sourceText,
}: GenerateMemePlanInput): Promise<MemePlan> {
  const cleanText = normalizeText(sourceText);
  const keywords = extractKeywords(cleanText, language);
  const vibe = detectDynamicVibe(cleanText, language);

  const captionInspiration = await fetchCaptionInspiration({
    language,
    vibe,
    keywords,
  });

  const caption = makeCaption({
    language,
    vibe,
    keywords,
    inspirationPhrases: captionInspiration.phrases,
  });

  const searchPlan = buildMemeSearchQuery({ language, vibe, keywords });

  const imageUrl = `/api/meme-image?language=${encodeURIComponent(language)}&source=${encodeURIComponent(
    searchPlan.source,
  )}&q=${encodeURIComponent(searchPlan.searchQuery)}`;

  return {
    language,
    sourceSummary: cleanText.slice(0, 280),
    keywords,
    vibe,
    templateId: "current-caption-inspired",
    templateName: searchPlan.searchQuery,
    imageUrl,
    imageSource: searchPlan.source,
    searchQuery: searchPlan.searchQuery,
    captionSearchQuery: captionInspiration.searchQuery,
    captionInspiration: captionInspiration.phrases,
    topText: caption.topText,
    bottomText: caption.bottomText,
  };
}
