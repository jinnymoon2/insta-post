"use client";

import { saveAs } from "file-saver";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import JSZip from "jszip";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type InputMode = "url" | "text";
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

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1350;
const PAGE_COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [language, setLanguage] = useState<OutputLanguage>("en");
  const [pageCount, setPageCount] = useState(6);
  const [slides, setSlides] = useState<GeneratedSlide[]>([]);
  const [generationMode, setGenerationMode] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [failedBackgrounds, setFailedBackgrounds] = useState<Set<number>>(new Set());
  // Stores base64 data: URIs so html-to-image can capture them without re-fetching
  const [resolvedBgUrls, setResolvedBgUrls] = useState<Map<number, string>>(new Map());
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  const canGenerate = useMemo(() => {
    if (loading) return false;
    return inputMode === "url" ? url.trim().length > 0 : articleText.trim().length >= 80;
  }, [articleText, inputMode, loading, url]);

  function resetResultState() {
    setError("");
    setWarning("");
    setGenerationMode("");
    setSlides([]);
    setFailedBackgrounds(new Set());
    setResolvedBgUrls(new Map());
    slideRefs.current = [];
  }

  async function handleGenerate() {
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
    // Use the server-provided URL as-is. It carries the page prompt AND the
    // whole-article topic (?topic=...) the image route needs to combine when
    // searching for a background; rebuilding it here would drop the topic.
    if (!failedBackgrounds.has(index) && imageUrl) {
      return proxiedImageUrl(imageUrl);
    }
    return proxiedImageUrl(fallbackImageUrl(slide, index));
  }

  // Pre-fetch backgrounds as base64 data URIs whenever slides or failedBackgrounds change.
  // This is what makes html-to-image work — it reads img.src at capture time and needs
  // a data: URI rather than a relative URL pointing to a server route.
  useEffect(() => {
    if (slides.length === 0) return;

    let cancelled = false;

    async function resolveOne(slide: GeneratedSlide, index: number): Promise<[number, string]> {
      const proxiedUrl = slideBackgroundProxiedUrl(slide, index);
      try {
        const res = await fetch(proxiedUrl);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        return await new Promise<[number, string]>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve([index, reader.result as string]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        // Empty string -> the <img> tag handles its own onError fallback.
        return [index, ""];
      }
    }

    // Fetch backgrounds ONE AT A TIME. The free image provider allows only a
    // single in-flight request per IP, so parallel fetches get rejected with
    // "queue full". Resolve each slide as it arrives so images appear
    // progressively instead of all at the end.
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
      ...`${slide.title ?? ""} ${slide.text ?? ""}`.split(/\s+/).map((w) => w.length),
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

  async function getSlidePng(index: number) {
    const node = slideRefs.current[index];
    if (!node) throw new Error(`Page ${index + 1} is not ready yet.`);

    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#000000",
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      style: {
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
      },
    });
  }

  async function downloadOne(index: number) {
    setError("");
    try {
      const png = await getSlidePng(index);
      const link = document.createElement("a");
      link.download = `instapost-page-${index + 1}.png`;
      link.href = png;
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download PNG.");
    }
  }

  async function downloadAllPngs() {
    if (slides.length === 0) return;
    setDownloading(true);
    setError("");
    try {
      const zip = new JSZip();
      for (let index = 0; index < slides.length; index += 1) {
        const png = await getSlidePng(index);
        zip.file(
          `instapost-page-${index + 1}.png`,
          png.replace(/^data:image\/png;base64,/, ""),
          { base64: true },
        );
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "instapost-carousel-pngs.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download PNGs.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPdf() {
    if (slides.length === 0) return;
    setDownloading(true);
    setError("");
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [PAGE_WIDTH, PAGE_HEIGHT],
        compress: true,
      });

      for (let index = 0; index < slides.length; index += 1) {
        const png = await getSlidePng(index);
        if (index > 0) {
          pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], "portrait");
        }
        pdf.addImage(png, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      }

      pdf.save("instapost-carousel.pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 grid gap-8 lg:grid-cols-[1fr_440px] lg:items-start">
          <div className="pt-4">
            <p className="mb-3 text-xs font-black uppercase text-sky-200">
              Instagram Carousel Generator
            </p>
            <h1 className="max-w-3xl text-5xl font-black leading-none md:text-6xl">
              Turn writing into Instagram-ready posts.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
              Generate 4:5 carousel pages with contextual backgrounds, short
              summaries, PNG downloads, and a PDF export.
            </p>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInputMode("url")}
                className={`rounded-xl px-4 py-3 font-bold transition ${
                  inputMode === "url"
                    ? "bg-sky-200 text-neutral-950"
                    : "bg-neutral-950 text-neutral-300"
                }`}
              >
                Article Link
              </button>
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`rounded-xl px-4 py-3 font-bold transition ${
                  inputMode === "text"
                    ? "bg-sky-200 text-neutral-950"
                    : "bg-neutral-950 text-neutral-300"
                }`}
              >
                Long Text
              </button>
            </div>

            {inputMode === "url" ? (
              <label className="mb-5 block">
                <span className="mb-2 block text-sm font-bold text-neutral-200">
                  Article URL
                </span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-sky-200"
                />
              </label>
            ) : (
              <label className="mb-5 block">
                <span className="mb-2 block text-sm font-bold text-neutral-200">
                  Long text
                </span>
                <textarea
                  value={articleText}
                  onChange={(event) => setArticleText(event.target.value)}
                  placeholder="Paste the full article or long writing here..."
                  rows={9}
                  className="w-full resize-y rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 leading-7 text-white outline-none focus:border-sky-200"
                />
              </label>
            )}

            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-neutral-200">
                  Output language
                </span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as OutputLanguage)}
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-sky-200"
                >
                  <option value="en">English</option>
                  <option value="ko">Korean</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-neutral-200">
                  Pages
                </span>
                <select
                  value={pageCount}
                  onChange={(event) => setPageCount(Number(event.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-sky-200"
                >
                  {PAGE_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? "page" : "pages"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full rounded-xl bg-sky-200 px-5 py-3 font-black text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate"}
            </button>

            {generationMode ? (
              <p className="mt-4 text-sm text-neutral-300">Mode: {generationMode}</p>
            ) : null}

            {warning ? (
              <div className="mt-4 rounded-xl border border-yellow-400/30 bg-yellow-950/50 px-4 py-3 text-sm text-yellow-100">
                {warning}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/70 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </section>
        </section>

        {slides.length > 0 ? (
          <section className="mt-10">
            <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="mb-2 text-xs font-black uppercase text-sky-200">
                  Generated Carousel
                </p>
                <h2 className="text-3xl font-black">Instagram post pages</h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={downloadAllPngs}
                  disabled={downloading}
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  Download PNGs
                </button>
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={downloading}
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  Download PDF
                </button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {slides.map((slide, index) => {
                const fittedSlide = getFittedSlide(slide);
                // Only the data URI resolved sequentially in resolveAll is used
                // as the <img> src. We deliberately do NOT point the <img> at the
                // /api/image route directly: that would make every slide fetch in
                // parallel and trip the image provider's 1-request-per-IP limit.
                const bgUrl = resolvedBgUrls.get(index) ?? "";

                return (
                  <article key={`${fittedSlide.title}-${index}`} className="grid gap-3">
                    <div
                      ref={(element) => {
                        slideRefs.current[index] = element;
                      }}
                      className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-900 shadow-2xl shadow-black/50"
                    >
                      {bgUrl ? (
                        <img
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full scale-[1.03] object-cover"
                          src={bgUrl}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-xs font-bold text-neutral-500">
                          Generating background…
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/78" />
                      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

                      <div
                        className="absolute bottom-[10%] left-[6%] right-[6%] max-h-[58%] overflow-hidden"
                        style={getSlideTextStyle(fittedSlide)}
                      >
                        <h3 className="mb-7 text-[length:var(--title-size)] font-black leading-[1.08] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]">
                          {fittedSlide.title}
                        </h3>
                        <p className="whitespace-pre-wrap text-[length:var(--text-size)] font-black leading-[1.24] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]">
                          {fittedSlide.text}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => downloadOne(index)}
                      className="rounded-xl bg-sky-200 px-4 py-3 font-black text-neutral-950"
                    >
                      Download Page {index + 1}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
