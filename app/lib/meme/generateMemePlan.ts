import {
  buildMemeSearchQuery,
  MemeContentBrief,
  MemeImageSource,
  MemeLanguage,
} from "./templates";

export type MemePlan = {
  language: MemeLanguage;
  sourceSummary: string;
  keywords: string[];
  vibe: string;
  contentBrief: MemeContentBrief;
  templateId: string;
  templateName: string;
  imageUrl: string;
  imageSource: MemeImageSource;
  searchQuery: string;
  preferredTemplates: string[];
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

function sentenceSplit(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

function extractKeywords(text: string, language: MemeLanguage) {
  const cleaned = text
    .replace(/&#x27;/g, " ")
    .replace(/&#39;/g, " ")
    .replace(/&quot;/g, " ")
    .replace(/&amp;/g, " ")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
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
          "및",
          "등을",
          "통해",
          "위해",
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
          "by",
          "be",
          "can",
          "new",
          "said",
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
    .slice(0, 12)
    .map(([word]) => word);
}

function findFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 2) return word;
      return `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
    })
    .join(" ");
}

function short(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) return cleaned;

  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function extractContentBrief(text: string, language: MemeLanguage, keywords: string[]): MemeContentBrief {
  const sentences = sentenceSplit(text);
  const firstSentence = sentences[0] || text.slice(0, 220);
  const lower = text.toLowerCase();

  const mainKeyword = keywords[0] || (language === "ko" ? "이 이슈" : "this issue");
  const secondKeyword = keywords[1] || (language === "ko" ? "변화" : "the change");

  const actor =
    findFirstMatch(text, [
      /([A-Z][A-Za-z0-9 .-]{1,40})\s+(?:announced|released|launched|introduced|built|created|plans|said)/,
      /([가-힣A-Za-z0-9 .-]{2,30})이\s+(?:발표|출시|공개|도입|시작)/,
      /([가-힣A-Za-z0-9 .-]{2,30})가\s+(?:발표|출시|공개|도입|시작)/,
    ]) || mainKeyword;

  let topic = short(firstSentence, language === "ko" ? 42 : 64);
  let subject = mainKeyword;
  let change = secondKeyword;
  let conflict = language === "ko" ? "예상보다 일이 커짐" : "it becomes more complicated than expected";
  let consequence = language === "ko" ? "모두가 당황함" : "everyone has to react";
  let emotion = language === "ko" ? "당황한 반응" : "confused reaction";
  let templateIntent = language === "ko" ? "상황 반전 밈" : "plot twist reaction meme";

  if (/(ai|artificial intelligence|gpt|llm|agent|automation|인공지능|생성형|에이전트|자동화)/i.test(text)) {
    subject = language === "ko" ? `${mainKeyword} AI 변화` : `${titleCase(mainKeyword)} AI shift`;
    change = language === "ko" ? "AI가 일을 대신하기 시작함" : "AI starts doing the work";
    conflict = language === "ko" ? "편해졌는데 내 역할이 흔들림" : "it is useful, but everyone's role suddenly feels less safe";
    consequence = language === "ko" ? "개발자들이 웃으면서 긴장함" : "developers are laughing nervously";
    emotion = language === "ko" ? "불안한 웃음" : "nervous laughter";
    templateIntent = language === "ko" ? "AI 때문에 당황한 개발자 밈" : "developer nervous about AI meme";
  }

  if (/(developer|code|bug|github|deploy|api|frontend|backend|programmer|개발|코드|버그|배포|깃허브|프론트엔드|백엔드)/i.test(text)) {
    subject = language === "ko" ? `${mainKeyword} 개발 이슈` : `${titleCase(mainKeyword)} developer issue`;
    change = language === "ko" ? "간단해 보인 작업이 커짐" : "a simple task turns into a bigger engineering problem";
    conflict = language === "ko" ? "간단한 수정인 줄 알았는데 디버깅이 시작됨" : "it looked simple until debugging started";
    consequence = language === "ko" ? "개발자의 하루가 사라짐" : "the developer's day disappears";
    emotion = language === "ko" ? "개발자 멘붕" : "developer panic";
    templateIntent = language === "ko" ? "개발자 버그 반응 밈" : "programmer debugging meme";
  }

  if (/(company|office|manager|deadline|enterprise|saas|startup|funding|회사|업무|회의|마감|스타트업|투자|기업)/i.test(text)) {
    subject = language === "ko" ? `${mainKeyword} 업무 이슈` : `${titleCase(mainKeyword)} work issue`;
    change = language === "ko" ? "작은 요청이 큰 프로젝트가 됨" : "a small request becomes a whole project";
    conflict = language === "ko" ? "금방 된다던 일이 점점 커짐" : "the quick task is no longer quick";
    consequence = language === "ko" ? "담당자가 조용히 무너짐" : "the person responsible quietly breaks";
    emotion = language === "ko" ? "직장인 현실 웃음" : "office worker pain";
    templateIntent = language === "ko" ? "직장인 공감 밈" : "office work meme";
  }

  if (/(success|growth|record|launch|viral|win|성공|성장|기록|출시|인기|확산|돌파)/i.test(text)) {
    change = language === "ko" ? "생각보다 너무 잘됨" : "it works better than expected";
    conflict = language === "ko" ? "기대보다 커져서 오히려 당황함" : "the success is bigger than expected";
    consequence = language === "ko" ? "모두가 갑자기 진지해짐" : "everyone suddenly takes it seriously";
    emotion = language === "ko" ? "성공해서 당황" : "surprised success";
    templateIntent = language === "ko" ? "성공했는데 당황한 밈" : "unexpected success meme";
  }

  if (/(risk|crisis|problem|failure|decline|controversy|lawsuit|문제|위기|실패|하락|논란|소송|리스크)/i.test(text)) {
    change = language === "ko" ? "문제가 예상보다 커짐" : "the problem gets bigger than expected";
    conflict = language === "ko" ? "처음엔 별일 아닌 줄 알았는데 위험해짐" : "it seemed fine until the risk became obvious";
    consequence = language === "ko" ? "모두가 눈치 보기 시작함" : "everyone starts quietly panicking";
    emotion = language === "ko" ? "조용한 패닉" : "quiet panic";
    templateIntent = language === "ko" ? "위기 반응 밈" : "this is fine crisis meme";
  }

  return {
    topic,
    subject: short(subject, language === "ko" ? 28 : 40),
    actor: short(actor, language === "ko" ? 24 : 32),
    change: short(change, language === "ko" ? 38 : 52),
    conflict: short(conflict, language === "ko" ? 42 : 64),
    consequence: short(consequence, language === "ko" ? 36 : 56),
    jokeAngle: short(
      language === "ko"
        ? `${subject}: ${conflict}`
        : `${subject}: ${conflict}`,
      language === "ko" ? 48 : 72,
    ),
    emotion,
    templateIntent,
  };
}

function makeCaption(language: MemeLanguage, brief: MemeContentBrief, keywords: string[]) {
  const main = brief.subject || keywords[0] || (language === "ko" ? "이 뉴스" : "this update");
  const actor = brief.actor || keywords[0] || (language === "ko" ? "사람들" : "everyone");
  const change = brief.change;
  const conflict = brief.conflict;
  const consequence = brief.consequence;

  const variant = Math.floor(Math.random() * 8);

  if (language === "ko") {
    const options = [
      {
        topText: `${actor}: ${main} 금방 되죠?`,
        bottomText: `현실: ${conflict}`,
      },
      {
        topText: `${main} 보기 전의 나`,
        bottomText: `보고 난 후: ${consequence}`,
      },
      {
        topText: `처음엔 ${main} 그냥 넘겼는데`,
        bottomText: `알고 보니 ${change}`,
      },
      {
        topText: `나: ${main} 별거 아니겠지`,
        bottomText: `현실: ${conflict}`,
      },
      {
        topText: `${main} 소식 들은 사람들`,
        bottomText: `${consequence}`,
      },
      {
        topText: `분명 ${main} 얘기였는데`,
        bottomText: `갑자기 ${change}`,
      },
      {
        topText: `${actor} 발표 전`,
        bottomText: `${actor} 발표 후: ${consequence}`,
      },
      {
        topText: `오늘의 인터넷: ${main}`,
        bottomText: `댓글창: ${conflict}`,
      },
    ];

    return options[variant] ?? options[0];
  }

  const options = [
    {
      topText: `${actor}: "${main} should be simple"`,
      bottomText: `Reality: ${conflict}`,
    },
    {
      topText: `Me before reading about ${main}`,
      bottomText: `Me after: ${consequence}`,
    },
    {
      topText: `Everyone thought ${main} was just news`,
      bottomText: `Then ${change}`,
    },
    {
      topText: `Me: "${main} is probably not my problem"`,
      bottomText: `The problem: ${conflict}`,
    },
    {
      topText: `The article: "${main}"`,
      bottomText: `The actual story: ${change}`,
    },
    {
      topText: `Before ${main}`,
      bottomText: `After realizing ${consequence}`,
    },
    {
      topText: `${actor} before the announcement`,
      bottomText: `${actor} after: ${consequence}`,
    },
    {
      topText: `The internet seeing ${main}`,
      bottomText: `The comments: ${conflict}`,
    },
  ];

  return options[variant] ?? options[0];
}

export async function generateMemePlan({
  language,
  sourceText,
}: GenerateMemePlanInput): Promise<MemePlan> {
  const cleanText = normalizeText(sourceText);
  const keywords = extractKeywords(cleanText, language);
  const brief = extractContentBrief(cleanText, language, keywords);
  const caption = makeCaption(language, brief, keywords);
  const searchPlan = buildMemeSearchQuery({
    language,
    searchText: [
      brief.topic,
      brief.subject,
      brief.change,
      brief.conflict,
      brief.consequence,
      caption,
    ].join(" "),
    keywords,
  });

  const imageUrl = `/api/meme-image?language=${encodeURIComponent(language)}&source=${encodeURIComponent(
    searchPlan.source,
  )}&q=${encodeURIComponent(searchPlan.searchQuery)}&preferred=${encodeURIComponent(
    searchPlan.preferredTemplates.join(","),
  )}`;

  return {
    language,
    sourceSummary: cleanText.slice(0, 280),
    keywords,
    vibe: brief.emotion,
    contentBrief: brief,
    templateId: "article-grounded-famous-meme",
    templateName: searchPlan.searchQuery,
    imageUrl,
    imageSource: searchPlan.source,
    searchQuery: searchPlan.searchQuery,
    preferredTemplates: searchPlan.preferredTemplates,
    topText: caption.topText,
    bottomText: caption.bottomText,
  };
}
