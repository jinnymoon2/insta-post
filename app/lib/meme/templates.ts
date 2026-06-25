export type MemeLanguage = "ko" | "en";

export type MemeImageSource = "imgflip" | "korean-web-meme" | "pexels";

export type MemeSearchPlan = {
  language: MemeLanguage;
  searchQuery: string;
  source: MemeImageSource;
};

function cleanSearchPart(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMemeSearchQuery({
  language,
  vibe,
  keywords,
}: {
  language: MemeLanguage;
  vibe: string;
  keywords: string[];
}): MemeSearchPlan {
  const cleanedVibe = cleanSearchPart(vibe);
  const cleanedKeywords = keywords.map(cleanSearchPart).filter(Boolean).slice(0, 5);

  if (language === "ko") {
    return {
      language,
      source: "korean-web-meme",
      searchQuery: [
        "한국 유명 밈 짤",
        "한국 인터넷 밈",
        cleanedVibe,
        ...cleanedKeywords,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  return {
    language,
    source: "imgflip",
    searchQuery: [
      cleanedVibe,
      ...cleanedKeywords,
      "famous meme template",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
