export type MemeLanguage = "ko" | "en";

export type MemeImageSource = "imgflip" | "korean-web-meme" | "pexels";

export type MemeSearchPlan = {
  language: MemeLanguage;
  searchQuery: string;
  source: MemeImageSource;
  preferredTemplates: string[];
};

function cleanSearchPart(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chooseEnglishTemplates(searchText: string) {
  const lower = searchText.toLowerCase();

  if (/(choice|choose|instead|vs|versus|tradeoff|better|worse)/i.test(lower)) {
    return ["Drake", "Two Buttons", "Distracted Boyfriend"];
  }

  if (/(surprise|shock|unexpected|suddenly|plot twist|unbelievable|real)/i.test(lower)) {
    return ["Surprised Pikachu", "Disaster Girl", "Monkey Puppet", "This Is Fine"];
  }

  if (/(success|growth|record|win|launch|viral|popular|celebrate)/i.test(lower)) {
    return ["Success Kid", "Leonardo Dicaprio Cheers", "Drake"];
  }

  if (/(problem|risk|crisis|failure|decline|hard|difficult|complicated|chaos)/i.test(lower)) {
    return ["This Is Fine", "One Does Not Simply", "Hide the Pain Harold", "Two Buttons"];
  }

  if (/(opinion|debate|argument|controversy|hot take|claim)/i.test(lower)) {
    return ["Change My Mind", "Drake", "Two Buttons"];
  }

  if (/(ai|artificial intelligence|developer|programmer|code|bug|github|api|deploy)/i.test(lower)) {
    return ["Drake", "Two Buttons", "One Does Not Simply", "Change My Mind"];
  }

  return ["Drake", "Distracted Boyfriend", "Two Buttons", "Change My Mind", "This Is Fine"];
}

export function buildMemeSearchQuery({
  language,
  searchText,
  keywords,
}: {
  language: MemeLanguage;
  searchText: string;
  keywords: string[];
}): MemeSearchPlan {
  const cleanedSearchText = cleanSearchPart(searchText);
  const cleanedKeywords = keywords.map(cleanSearchPart).filter(Boolean).slice(0, 6);

  if (language === "ko") {
    return {
      language,
      source: "korean-web-meme",
      preferredTemplates: [
        "무한도전",
        "박명수",
        "유재석",
        "당황",
        "충격",
        "이왜진",
        "직장인",
      ],
      searchQuery: [
        "한국 유명 밈 짤",
        "한국 인터넷 밈",
        cleanedSearchText,
        ...cleanedKeywords,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const preferredTemplates = chooseEnglishTemplates(`${cleanedSearchText} ${cleanedKeywords.join(" ")}`);

  return {
    language,
    source: "imgflip",
    preferredTemplates,
    searchQuery: [
      preferredTemplates.join(" "),
      cleanedSearchText,
      ...cleanedKeywords,
      "famous meme template",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export type MemeContentBrief = {
  topic: string;
  subject: string;
  actor: string;
  change: string;
  conflict: string;
  consequence: string;
  jokeAngle: string;
  emotion: string;
  templateIntent: string;
};
