"use client";

import { saveAs } from "file-saver";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type InputMode = "url" | "text" | "meme";
type OutputLanguage = "en" | "ko";

type GeneratedSlide = {
  title?: string;
  text?: string;
  caption?: string;
  imagePrompt?: string;
  imageUrl?: string;
};

type GenerateResponse = {
  slides?: GeneratedSlide[];
  error?: string;
  meta?: {
    mode?: string;
    warning?: string;
  };
};

type MemeResult = {
  language: OutputLanguage;
  sourceSummary: string;
  keywords: string[];
  vibe: string;
  contentBrief?: {
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
  templateId: string;
  templateName: string;
  imageUrl: string;
  imageSource: "imgflip" | "korean-web-meme" | "pexels";
  searchQuery: string;
  preferredTemplates?: string[];
  topText: string;
  bottomText: string;
};

type MemeResponse = {
  meme?: MemeResult;
  error?: string;
};

const PAGE_WIDTH = 1080;
const PAGE_COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [memeUrl, setMemeUrl] = useState("");
  const [memeText, setMemeText] = useState("");
  const [language, setLanguage] = useState<OutputLanguage>("en");
  const [pageCount, setPageCount] = useState(6);
  const [slides, setSlides] = useState<GeneratedSlide[]>([]);
  const [memeResult, setMemeResult] = useState<MemeResult | null>(null);
  const [generationMode, setGenerationMode] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [failedBackgrounds, setFailedBackgrounds] = useState<Set<number>>(new Set());
  const [resolvedBgUrls, setResolvedBgUrls] = useState<Map<number, string>>(new Map());

  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const memeRef = useRef<HTMLDivElement | null>(null);

  const canGenerate = useMemo(() => {
    if (loading) return false;

    if (inputMode === "url") {
      return url.trim().length > 0;
    }

    if (inputMode === "text") {
      return articleText.trim().length >= 80;
    }

    const hasMemeUrl = memeUrl.trim().length > 0;
    const hasMemeText = memeText.trim().length >= 30;

    return hasMemeUrl !== hasMemeText;
  }, [articleText, inputMode, loading, memeText, memeUrl, url]);

  function resetResultState() {
    setError("");
    setWarning("");
    setGenerationMode("");
    setSlides([]);
    setMemeResult(null);
    setFailedBackgrounds(new Set());
    setResolvedBgUrls(new Map());
    slideRefs.current = [];
  }

  function changeInputMode(nextMode: InputMode) {
    resetResultState();
    setInputMode(nextMode);
  }

  async function handleGenerateSlides() {
    setLoading(true);
    resetResultState();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: inputMode === "url" ? url : "",
          articleText: inputMode === "text" ? articleText : "",
          language,
          pageCount,
        }),
      });

      const data = (await response.json()) as GenerateResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate post.");
      }

      if (!Array.isArray(data.slides) || data.slides.length === 0) {
        throw new Error("The server did not return any slides.");
      }

      setSlides(data.slides);
      setGenerationMode(data.meta?.mode ?? "generated");
      setWarning(data.meta?.warning ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateMeme() {
    setLoading(true);
    resetResultState();

    try {
      const hasMemeUrl = memeUrl.trim().length > 0;
      const hasMemeText = memeText.trim().length > 0;

      if (hasMemeUrl === hasMemeText) {
        throw new Error("Enter either an article URL or text, not both.");
      }

      const response = await fetch("/api/meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          articleUrl: hasMemeUrl ? memeUrl.trim() : "",
          text: hasMemeText ? memeText.trim() : "",
        }),
      });

      const data = (await response.json()) as MemeResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate meme.");
      }

      if (!data.meme) {
        throw new Error("The server did not return a meme.");
      }

      setMemeResult(data.meme);
      setGenerationMode("meme");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (inputMode === "meme") {
      await handleGenerateMeme();
      return;
    }

    await handleGenerateSlides();
  }

  function proxiedImageUrl(imageUrl: string) {
    return `/api/image?url=${encodeURIComponent(imageUrl)}`;
  }

  function fallbackImageUrl(slide: GeneratedSlide, index: number) {
    const prompt = slide.imagePrompt || `${slide.title ?? ""} ${slide.text ?? ""}`.trim();

    return `instapost-generated://slide-${index + 1}/${encodeURIComponent(
      prompt || `carousel page ${index + 1}`,
    )}`;
  }

  function slideBackgroundProxiedUrl(slide: GeneratedSlide, index: number) {
    const imageUrl = slide.imageUrl ?? "";

    if (!failedBackgrounds.has(index) && imageUrl) {
      return proxiedImageUrl(imageUrl);
    }

    return proxiedImageUrl(fallbackImageUrl(slide, index));
  }

  useEffect(() => {
    if (slides.length === 0) return;

    let cancelled = false;

    async function resolveOne(slide: GeneratedSlide, index: number): Promise<[number, string]> {
      const proxiedUrl = slideBackgroundProxiedUrl(slide, index);

      try {
        const response = await fetch(proxiedUrl);
        if (!response.ok) throw new Error("fetch failed");

        const blob = await response.blob();

        return await new Promise<[number, string]>((resolve, reject) => {
          const reader = new FileReader();

          reader.onload = () => resolve([index, reader.result as string]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return [index, ""];
      }
    }

    async function resolveAll() {
      for (let index = 0; index < slides.length; index += 1) {
        if (cancelled) return;

        const [, dataUrl] = await resolveOne(slides[index], index);

        if (cancelled) return;

        if (dataUrl) {
          setResolvedBgUrls((current) => {
            const next = new Map(current);
            next.set(index, dataUrl);
            return next;
          });
        }
      }
    }

    void resolveAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, failedBackgrounds]);

  function hasCjkText(value: string) {
    return /[가-힣一-龥ぁ-んァ-ン]/.test(value);
  }

  function truncateText(value: string | undefined, maxLength: number) {
    const cleaned = (value ?? "").replace(/\s+/g, " ").trim();

    if (cleaned.length <= maxLength) return cleaned;

    const sliced = cleaned.slice(0, Math.max(0, maxLength - 1)).trim();
    const lastSpace = sliced.lastIndexOf(" ");
    const shouldCutAtWord = lastSpace > maxLength * 0.62 && !hasCjkText(cleaned);

    return `${shouldCutAtWord ? sliced.slice(0, lastSpace) : sliced}…`;
  }

  function getFittedSlide(slide: GeneratedSlide): Required<GeneratedSlide> {
    const rawTitle = slide.title ?? "";
    const rawText = slide.text ?? "";
    const isCjk = hasCjkText(`${rawTitle} ${rawText}`);

    return {
      title: truncateText(rawTitle, isCjk ? 30 : 58),
      text: truncateText(rawText, isCjk ? 108 : 184),
      caption: slide.caption ?? "",
      imagePrompt: slide.imagePrompt ?? "",
      imageUrl: slide.imageUrl ?? "",
    };
  }

  function getSlideTextStyle(slide: GeneratedSlide): CSSProperties {
    const titleLength = slide.title?.length ?? 0;
    const textLength = slide.text?.length ?? 0;
    const longestWord = Math.max(
      0,
      ...`${slide.title ?? ""} ${slide.text ?? ""}`.split(/\s+/).map((word) => word.length),
    );
    const totalLength = titleLength + textLength;
    const hasCjk = hasCjkText(`${slide.title ?? ""} ${slide.text ?? ""}`);

    const titleSize = Math.max(
      hasCjk ? 33 : 34,
      Math.min(hasCjk ? 56 : 60, 60 - titleLength * (hasCjk ? 0.48 : 0.38)),
    );

    const textSize = Math.max(
      hasCjk ? 24 : 22,
      Math.min(
        hasCjk ? 36 : 35,
        37 - textLength * (hasCjk ? 0.07 : 0.055) - longestWord * 0.12 - totalLength * 0.01,
      ),
    );

    return {
      "--title-size": `${titleSize}px`,
      "--text-size": `${textSize}px`,
      overflowWrap: "anywhere",
      wordBreak: hasCjk ? "keep-all" : "break-word",
      hyphens: "auto",
    } as CSSProperties;
  }

  async function ensureImagesReady(node: HTMLElement) {
    const images = Array.from(node.querySelectorAll("img"));

    await Promise.all(
      images.map(async (image) => {
        if (image.complete && image.naturalWidth > 0) return;

        await new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      }),
    );

    await Promise.all(
      images.map(async (image) => {
        try {
          await image.decode();
        } catch {
          // Ignore decode failures. html-to-image can still try to capture.
        }
      }),
    );
  }

  async function imageUrlToDataUrl(url: string) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load background image. Status: ${response.status}`);
    }

    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read background image."));
      reader.readAsDataURL(blob);
    });
  }

  async function loadCanvasImage(src: string) {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load background image for canvas export."));
      image.src = src;
    });
  }

  function wrapCanvasText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number,
  ) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const words = normalized.includes(" ") ? normalized.split(" ") : [...normalized];

    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const separator = normalized.includes(" ") ? " " : "";
      const testLine = currentLine ? `${currentLine}${separator}${word}` : word;

      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
        continue;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = word;

      if (lines.length >= maxLines) break;
    }

    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }

    if (lines.length === maxLines && words.length > 0) {
      const lastIndex = lines.length - 1;
      while (ctx.measureText(`${lines[lastIndex]}…`).width > maxWidth && lines[lastIndex].length > 1) {
        lines[lastIndex] = lines[lastIndex].slice(0, -1);
      }
      lines[lastIndex] = `${lines[lastIndex]}…`;
    }

    return lines;
  }

  function drawCanvasTextBlock({
    ctx,
    title,
    body,
  }: {
    ctx: CanvasRenderingContext2D;
    title: string;
    body: string;
  }) {
    const left = PAGE_WIDTH * 0.07;
    const maxWidth = PAGE_WIDTH * 0.86;
    const bottom = PAGE_WIDTH * 0.09;

    const titleLength = [...title].length;
    const bodyLength = [...body].length;

    const titleSize = titleLength > 34 ? 70 : titleLength > 24 ? 78 : 88;
    const bodySize = bodyLength > 95 ? 46 : bodyLength > 65 ? 52 : 58;

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    ctx.font = `900 ${titleSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const titleLines = wrapCanvasText(ctx, title, maxWidth, 3);
    const titleLineHeight = titleSize * 1.08;

    ctx.font = `700 ${bodySize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const bodyLines = wrapCanvasText(ctx, body, maxWidth, 4);
    const bodyLineHeight = bodySize * 1.22;

    const gap = 42;
    const totalHeight =
      titleLines.length * titleLineHeight +
      gap +
      bodyLines.length * bodyLineHeight;

    let y = PAGE_WIDTH * 1.25 - bottom - totalHeight;

    ctx.font = `900 ${titleSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    for (const line of titleLines) {
      ctx.fillText(line, left, y);
      y += titleLineHeight;
    }

    y += gap;

    ctx.font = `700 ${bodySize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    for (const line of bodyLines) {
      ctx.fillText(line, left, y);
      y += bodyLineHeight;
    }
  }

  async function getSlidePng(index: number) {
    const slide = slides[index];

    if (!slide) {
      throw new Error(`Page ${index + 1} is not ready yet.`);
    }

    const fittedSlide = getFittedSlide(slide);
    const bgUrl = resolvedBgUrls.get(index);

    const canvas = document.createElement("canvas");
    canvas.width = PAGE_WIDTH;
    canvas.height = Math.round(PAGE_WIDTH * 1.25);

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Could not create image canvas.");
    }

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (bgUrl) {
      const dataUrl = await imageUrlToDataUrl(bgUrl);
      const image = await loadCanvasImage(dataUrl);

      const canvasRatio = canvas.width / canvas.height;
      const imageRatio = image.width / image.height;

      let drawWidth = canvas.width;
      let drawHeight = canvas.height;
      let drawX = 0;
      let drawY = 0;

      if (imageRatio > canvasRatio) {
        drawHeight = canvas.height;
        drawWidth = drawHeight * imageRatio;
        drawX = (canvas.width - drawWidth) / 2;
      } else {
        drawWidth = canvas.width;
        drawHeight = drawWidth / imageRatio;
        drawY = (canvas.height - drawHeight) / 2;
      }

      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawCanvasTextBlock({
      ctx,
      title: fittedSlide.title || "",
      body: fittedSlide.text || "",
    });

    return canvas.toDataURL("image/png");
  }

  async function downloadSlide(index: number) {
    setDownloading(true);
    setError("");

    try {
      const dataUrl = await getSlidePng(index);
      saveAs(dataUrl, `instapost-page-${index + 1}.png`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download page.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadAllSlides() {
    if (slides.length === 0) return;

    setDownloading(true);
    setError("");

    try {
      const zip = new JSZip();

      for (let index = 0; index < slides.length; index += 1) {
        const dataUrl = await getSlidePng(index);
        const base64 = dataUrl.split(",")[1];
        zip.file(`instapost-page-${index + 1}.png`, base64, { base64: true });
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "instapost-carousel.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download ZIP.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadMeme() {
    const node = memeRef.current;

    if (!node) {
      setError("Meme is not ready yet.");
      return;
    }

    setDownloading(true);
    setError("");

    try {
      await ensureImagesReady(node);

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        width: PAGE_WIDTH,
        height: Math.round(PAGE_WIDTH * 1.25),
        style: {
          width: `${PAGE_WIDTH}px`,
          height: `${Math.round(PAGE_WIDTH * 1.25)}px`,
        },
      });

      saveAs(dataUrl, "instapost-meme.png");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download meme.");
    } finally {
      setDownloading(false);
    }
  }

  function handleMemeUrlChange(value: string) {
    setMemeUrl(value);

    if (value.trim().length > 0) {
      setMemeText("");
    }
  }

  function handleMemeTextChange(value: string) {
    setMemeText(value);

    if (value.trim().length > 0) {
      setMemeUrl("");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] px-5 py-8 text-[#111827]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[32px] bg-white p-6 shadow-sm md:p-10">
          <div className="mb-8 flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#667085]">
              InstaPost
            </p>
            <h1 className="text-4xl font-black tracking-[-0.04em] md:text-6xl">
              Generate Instagram posts from articles
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[#667085]">
              Create carousel slides or one-page memes from an article link or long text.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-[#f2f4f7] p-2">
            <button
              type="button"
              onClick={() => changeInputMode("url")}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                inputMode === "url" ? "bg-white shadow-sm" : "text-[#667085]"
              }`}
            >
              Article Link
            </button>
            <button
              type="button"
              onClick={() => changeInputMode("text")}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                inputMode === "text" ? "bg-white shadow-sm" : "text-[#667085]"
              }`}
            >
              Long Text
            </button>
            <button
              type="button"
              onClick={() => changeInputMode("meme")}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                inputMode === "meme" ? "bg-white shadow-sm" : "text-[#667085]"
              }`}
            >
              Meme
            </button>
          </div>

          <div className="grid gap-5">
            {inputMode === "url" && (
              <label className="grid gap-2">
                <span className="text-sm font-bold">Article URL</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className="rounded-2xl border border-[#d0d5dd] px-4 py-4 outline-none focus:border-[#111827]"
                />
              </label>
            )}

            {inputMode === "text" && (
              <label className="grid gap-2">
                <span className="text-sm font-bold">Long Text</span>
                <textarea
                  value={articleText}
                  onChange={(event) => setArticleText(event.target.value)}
                  placeholder="Paste at least 80 characters..."
                  rows={10}
                  className="resize-y rounded-2xl border border-[#d0d5dd] px-4 py-4 outline-none focus:border-[#111827]"
                />
              </label>
            )}

            {inputMode === "meme" && (
              <div className="grid gap-5">
                <label className="grid gap-2">
                  <span className="text-sm font-bold">Article URL</span>
                  <input
                    value={memeUrl}
                    disabled={memeText.trim().length > 0}
                    onChange={(event) => handleMemeUrlChange(event.target.value)}
                    placeholder="Paste an article link"
                    className="rounded-2xl border border-[#d0d5dd] px-4 py-4 outline-none focus:border-[#111827] disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
                  />
                </label>

                <div className="text-center text-sm font-bold text-[#98a2b3]">or</div>

                <label className="grid gap-2">
                  <span className="text-sm font-bold">Text</span>
                  <textarea
                    value={memeText}
                    disabled={memeUrl.trim().length > 0}
                    onChange={(event) => handleMemeTextChange(event.target.value)}
                    placeholder="Paste text to turn into a meme"
                    rows={8}
                    className="resize-y rounded-2xl border border-[#d0d5dd] px-4 py-4 outline-none focus:border-[#111827] disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
                  />
                </label>

                <p className="rounded-2xl bg-[#f9fafb] p-4 text-sm leading-6 text-[#667085]">
                  Meme mode creates one page only. It analyzes the article or text, detects the
                  vibe, chooses a meme template, and writes a Korean or English meme caption.
                </p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-bold">Language</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as OutputLanguage)}
                  className="rounded-2xl border border-[#d0d5dd] px-4 py-4 outline-none focus:border-[#111827]"
                >
                  <option value="en">English</option>
                  <option value="ko">Korean</option>
                </select>
              </label>

              {inputMode !== "meme" && (
                <label className="grid gap-2">
                  <span className="text-sm font-bold">Pages</span>
                  <select
                    value={pageCount}
                    onChange={(event) => setPageCount(Number(event.target.value))}
                    className="rounded-2xl border border-[#d0d5dd] px-4 py-4 outline-none focus:border-[#111827]"
                  >
                    {PAGE_COUNT_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count} page{count > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="rounded-2xl bg-[#111827] px-6 py-4 text-base font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#d0d5dd]"
            >
              {loading
                ? inputMode === "meme"
                  ? "Generating Meme..."
                  : "Generating..."
                : inputMode === "meme"
                  ? "Generate Meme"
                  : "Generate"}
            </button>

            {error && (
              <p className="rounded-2xl bg-[#fef3f2] p-4 text-sm font-bold text-[#d92d20]">
                {error}
              </p>
            )}

            {warning && (
              <p className="rounded-2xl bg-[#fffaeb] p-4 text-sm font-bold text-[#b54708]">
                {warning}
              </p>
            )}

            {generationMode && (
              <p className="text-sm font-semibold text-[#667085]">Mode: {generationMode}</p>
            )}
          </div>
        </section>

        {inputMode === "meme" && memeResult && (
          <section className="rounded-[32px] bg-white p-6 shadow-sm md:p-10">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-[-0.03em]">Generated Meme</h2>

              </div>

              <button
                type="button"
                onClick={downloadMeme}
                disabled={downloading}
                className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-black text-white disabled:bg-[#d0d5dd]"
              >
                {downloading ? "Downloading..." : "Download Meme PNG"}
              </button>
            </div>

            <div className="flex justify-center">
              <div
                ref={memeRef}
                className="relative aspect-[4/5] w-full max-w-[480px] overflow-hidden rounded-[28px] bg-black shadow-2xl"
              >
                <img
                  src={`${memeResult.imageUrl}&t=${Date.now()}`}
                  alt={memeResult.templateName}
                  className="h-full w-full object-cover"
                />

                <div className="absolute left-1/2 top-[5%] w-[92%] -translate-x-1/2 text-center text-[clamp(28px,6vw,56px)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white [text-shadow:3px_3px_0_#000,-3px_3px_0_#000,3px_-3px_0_#000,-3px_-3px_0_#000,0_3px_0_#000,3px_0_0_#000,0_-3px_0_#000,-3px_0_0_#000]">
                  {memeResult.topText}
                </div>

                <div className="absolute bottom-[5%] left-1/2 w-[92%] -translate-x-1/2 text-center text-[clamp(28px,6vw,56px)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white [text-shadow:3px_3px_0_#000,-3px_3px_0_#000,3px_-3px_0_#000,-3px_-3px_0_#000,0_3px_0_#000,3px_0_0_#000,0_-3px_0_#000,-3px_0_0_#000]">
                  {memeResult.bottomText}
                </div>
              </div>
            </div>
          </section>
        )}

        {slides.length > 0 && (
          <section className="rounded-[32px] bg-white p-6 shadow-sm md:p-10">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-[-0.03em]">Generated Carousel</h2>
                <p className="mt-2 text-sm text-[#667085]">
                  {slides.length} page{slides.length > 1 ? "s" : ""} ready.
                </p>
              </div>

              <button
                type="button"
                onClick={downloadAllSlides}
                disabled={downloading}
                className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-black text-white disabled:bg-[#d0d5dd]"
              >
                {downloading ? "Downloading..." : "Download ZIP"}
              </button>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {slides.map((slide, index) => {
                const fittedSlide = getFittedSlide(slide);
                const bgUrl = resolvedBgUrls.get(index);
                const textStyle = getSlideTextStyle(fittedSlide);

                return (
                  <article key={index} className="grid gap-3">
                    <div
                      ref={(node) => {
                        slideRefs.current[index] = node;
                      }}
                      className="relative aspect-[4/5] w-full overflow-hidden rounded-[28px] bg-[#111827] shadow-xl"
                      style={{
                        width: "100%",
                      }}
                    >
                      {bgUrl ? (
                        <div
                          data-slide-background
                          className="absolute inset-0"
                          style={{
                            backgroundImage: `url("${bgUrl}")`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat",
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#111827] to-[#475467]" />
                      )}

                      <div className="absolute inset-0 bg-black/45" />

                      <div
                        className="absolute inset-x-[7%] bottom-[7%] top-[7%] flex flex-col justify-end gap-5 text-white"
                        style={textStyle}
                      >
                        <h3
                          className="font-black leading-[1.05] tracking-[-0.05em]"
                          style={{
                            fontSize: "var(--title-size)",
                          }}
                        >
                          {fittedSlide.title}
                        </h3>

                        <p
                          className="font-semibold leading-[1.22] tracking-[-0.03em]"
                          style={{
                            fontSize: "var(--text-size)",
                          }}
                        >
                          {fittedSlide.text}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => downloadSlide(index)}
                      disabled={downloading}
                      className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 text-sm font-black disabled:text-[#98a2b3]"
                    >
                      Download Page {index + 1}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
