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
  topText: string;
  bottomText: string;
};

type GenerateMemePlanInput = {
  language: MemeLanguage;
  sourceText: string;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 6000);
}

function extractKeywords(text: string, language: MemeLanguage) {
  const cleaned = text
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
        ]);

  const counts = new Map<string, number>();

  for (const word of cleaned) {
    const normalized = word.toLowerCase();

    if (normalized.length < 2) continue;
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

function makeCaption(language: MemeLanguage, vibe: string, keywords: string[]) {
  const main = keywords[0] || (language === "ko" ? "이 뉴스" : "this news");
  const second = keywords[1] || (language === "ko" ? "현실" : "reality");
  const third = keywords[2] || (language === "ko" ? "상황" : "situation");

  const vibeLower = vibe.toLowerCase();

  if (language === "ko") {
    if (vibe.includes("AI") || vibeLower.includes("ai")) {
      return {
        topText: `사람들: ${main} 그냥 새 기능 아닌가요?`,
        bottomText: `현실: 아니요, 판이 바뀌었습니다`,
      };
    }

    if (vibe.includes("개발") || vibe.includes("버그")) {
      return {
        topText: `개발자: ${main} 금방 끝나겠지`,
        bottomText: `현실: ${second} 때문에 하루 삭제`,
      };
    }

    if (vibe.includes("회사") || vibe.includes("업무")) {
      return {
        topText: `회사: ${main} 이거 간단하죠?`,
        bottomText: `나: 그 말이 제일 무섭습니다`,
      };
    }

    if (vibe.includes("충격") || vibe.includes("반전")) {
      return {
        topText: `${main} 보기 전의 나`,
        bottomText: `보고 난 후: 잠깐만 이게 실화라고?`,
      };
    }

    if (vibe.includes("성공") || vibe.includes("잘 풀려")) {
      return {
        topText: `${main} 처음 봤을 때`,
        bottomText: `생각보다 너무 잘돼서 당황함`,
      };
    }

    if (vibe.includes("어려운") || vibe.includes("현실")) {
      return {
        topText: `${main} 별거 아니겠지 했는데`,
        bottomText: `알고 보니 ${third}가 핵심이었음`,
      };
    }

    return {
      topText: `${main} 뉴스 보기 전`,
      bottomText: `보고 난 후: 그래서 이제 ${second}도 바뀐다고요?`,
    };
  }

  if (vibeLower.includes("ai")) {
    return {
      topText: `People: "${main} is just another update"`,
      bottomText: `AI industry: "That aged badly."`,
    };
  }

  if (vibeLower.includes("developer") || vibeLower.includes("programmer") || vibeLower.includes("bug")) {
    return {
      topText: `Me: "This ${main} update should be simple"`,
      bottomText: `Also me 6 hours later: debugging ${second}`,
    };
  }

  if (vibeLower.includes("office") || vibeLower.includes("company")) {
    return {
      topText: `Management: "Can we quickly add ${main}?"`,
      bottomText: `Engineering: "Define quickly."`,
    };
  }

  if (vibeLower.includes("shock") || vibeLower.includes("plot twist")) {
    return {
      topText: `Me before reading about ${main}`,
      bottomText: `Me after: wait, that's actually real?`,
    };
  }

  if (vibeLower.includes("win") || vibeLower.includes("celebrating")) {
    return {
      topText: `When ${main} finally works`,
      bottomText: `And nobody knows how fragile ${second} is`,
    };
  }

  if (vibeLower.includes("harder") || vibeLower.includes("reality")) {
    return {
      topText: `Me thinking ${main} was not my problem`,
      bottomText: `The problem: now it is`,
    };
  }

  return {
    topText: `Everyone before the ${main} news`,
    bottomText: `Everyone after: so ${second} changes now?`,
  };
}

export async function generateMemePlan({
  language,
  sourceText,
}: GenerateMemePlanInput): Promise<MemePlan> {
  const cleanText = normalizeText(sourceText);
  const keywords = extractKeywords(cleanText, language);
  const vibe = detectDynamicVibe(cleanText, language);
  const caption = makeCaption(language, vibe, keywords);
  const searchPlan = buildMemeSearchQuery({ language, vibe, keywords });

  const imageUrl = `/api/meme-image?language=${encodeURIComponent(language)}&source=${encodeURIComponent(
    searchPlan.source,
  )}&q=${encodeURIComponent(searchPlan.searchQuery)}`;

  return {
    language,
    sourceSummary: cleanText.slice(0, 280),
    keywords,
    vibe,
    templateId: "famous-meme-priority",
    templateName: searchPlan.searchQuery,
    imageUrl,
    imageSource: searchPlan.source,
    searchQuery: searchPlan.searchQuery,
    topText: caption.topText,
    bottomText: caption.bottomText,
  };
}
