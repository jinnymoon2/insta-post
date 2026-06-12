"use client";

import { saveAs } from "file-saver";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import JSZip from "jszip";
import Image from "next/image";
import type { CSSProperties } from "react";
import { useRef, useState } from "react";

type InputMode = "url" | "text";

type GeneratedSlide = {
  title?: string;
  text?: string;
  caption?: string;
  imagePrompt?: string;
  imageUrl?: string;
};

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [language, setLanguage] = useState("en");
  const [pageCount, setPageCount] = useState(6);
  const [slides, setSlides] = useState<GeneratedSlide[]>([]);
  const [rawResult, setRawResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [failedBackgrounds, setFailedBackgrounds] = useState<Set<number>>(
    new Set(),
  );
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  const canGenerate =
    inputMode === "url" ? url.trim().length > 0 : articleText.trim().length >= 80;

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setSlides([]);
    setRawResult("");
    setFailedBackgrounds(new Set());
    slideRefs.current = [];

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: inputMode === "url" ? url : "",
          articleText: inputMode === "text" ? articleText : "",
          language,
          pageCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate post.");
      }

      if (Array.isArray(data.slides)) {
        setSlides(data.slides);
      } else {
        setRawResult(JSON.stringify(data, null, 2));
      }
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
    const prompt =
      slide.imagePrompt || `${slide.title ?? ""} ${slide.text ?? ""}`.trim();

    return `instapost-generated://slide-${index + 1}/${encodeURIComponent(
      prompt || `carousel page ${index + 1}`,
    )}`;
  }

  function slideBackgroundUrl(slide: GeneratedSlide, index: number) {
    const imageUrl = slide.imageUrl ?? "";

    if (!failedBackgrounds.has(index) && /^https?:\/\//.test(imageUrl)) {
      return imageUrl;
    }

    return proxiedImageUrl(
      failedBackgrounds.has(index) || !imageUrl
        ? fallbackImageUrl(slide, index)
        : imageUrl,
    );
  }

  function slideFallbackBackgroundStyle(
    slide: GeneratedSlide,
    index: number,
  ): CSSProperties {
    return {
      backgroundImage: `url("${proxiedImageUrl(fallbackImageUrl(slide, index))}")`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  }

  function getSlideTextStyle(slide: GeneratedSlide): CSSProperties {
    const titleLength = slide.title?.length ?? 0;
    const textLength = slide.text?.length ?? 0;
    const longestWord = Math.max(
      0,
      ...`${slide.title ?? ""} ${slide.text ?? ""}`
        .split(/\s+/)
        .map((word) => word.length),
    );
    const titleSize = Math.max(34, Math.min(60, 62 - titleLength * 0.2));
    const textSize = Math.max(
      25,
      Math.min(42, 44 - textLength * 0.08 - longestWord * 0.18),
    );

    return {
      "--title-size": `${titleSize}px`,
      "--text-size": `${textSize}px`,
    } as CSSProperties;
  }

  async function getSlidePng(index: number) {
    const node = slideRefs.current[index];

    if (!node) {
      throw new Error(`Page ${index + 1} is not ready yet.`);
    }

    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#000000",
      width: 1080,
      height: 1350,
      style: {
        width: "1080px",
        height: "1350px",
      },
    });
  }

  async function downloadOne(index: number) {
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
        format: [1080, 1350],
        compress: true,
      });

      for (let index = 0; index < slides.length; index += 1) {
        const png = await getSlidePng(index);

        if (index > 0) {
          pdf.addPage([1080, 1350], "portrait");
        }

        pdf.addImage(png, "PNG", 0, 0, 1080, 1350);
      }

      pdf.save("instapost-carousel.pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080b10] px-5 py-8 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 grid gap-8 lg:grid-cols-[1fr_440px] lg:items-start">
          <div className="pt-4">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-sky-200">
              Instagram Carousel Generator
            </p>
            <h1 className="max-w-3xl text-5xl font-black leading-none tracking-tight md:text-6xl">
              Turn writing into Instagram-ready posts.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
              Generate square-free 4:5 carousel pages with unique backgrounds,
              summary copy, PNG downloads, and a PDF export.
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
                  onChange={(event) => setLanguage(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-sky-200"
                >
                  <option value="en">English</option>
                  <option value="ko">Korean</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-neutral-200">
                  Pages
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={pageCount}
                  onChange={(event) =>
                    setPageCount(
                      Math.min(
                        10,
                        Math.max(1, Math.floor(Number(event.target.value))),
                      ),
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-sky-200"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !canGenerate}
              className="w-full rounded-xl bg-gradient-to-r from-sky-200 to-blue-300 px-5 py-3 font-black text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate"}
            </button>

            {error ? (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-950/70 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </section>
        </section>

        {slides.length > 0 ? (
          <section className="mt-10">
            <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-sky-200">
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
              {slides.map((slide, index) => (
                <article key={`${slide.title}-${index}`} className="grid gap-3">
                  <div
                    ref={(element) => {
                      slideRefs.current[index] = element;
                    }}
                    className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-900 shadow-2xl shadow-black/50"
                    style={slideFallbackBackgroundStyle(slide, index)}
                  >
                    <Image
                      alt=""
                      aria-hidden="true"
                      fill
                      unoptimized
                      className="scale-[1.03] object-cover"
                      src={slideBackgroundUrl(slide, index)}
                      onError={() => {
                        setFailedBackgrounds((current) => {
                          const next = new Set(current);
                          next.add(index);
                          return next;
                        });
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/78" />
                    <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

                    <div
                      className="absolute bottom-[10%] left-[6%] right-[6%] max-h-[58%] overflow-hidden"
                      style={getSlideTextStyle(slide)}
                    >
                      <h3 className="mb-7 text-[length:var(--title-size)] font-black leading-[1.08] tracking-[-0.01em] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)] [overflow-wrap:anywhere]">
                        {slide.title}
                      </h3>
                      <p className="whitespace-pre-wrap text-[length:var(--text-size)] font-black leading-[1.24] tracking-[-0.005em] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)] [overflow-wrap:anywhere]">
                        {slide.text}
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
              ))}
            </div>
          </section>
        ) : null}

        {rawResult ? (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">Generated Result</h2>
            <pre className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-200">
              {rawResult}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}
