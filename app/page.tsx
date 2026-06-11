"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

type Slide = {
  title: string;
  text: string;
  imageUrl: string;
};

type GenerateResult = {
  title: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  sourceUrl?: string;
  detectedLanguage?: "ko" | "en";
  backgroundImageUrl?: string;
  routeVersion?: string;
  error?: string;
};

export default function Home() {
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [languageMode, setLanguageMode] = useState<"auto" | "ko" | "en">(
    "auto",
  );
  const [slideCount, setSlideCount] = useState(5);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  async function handleGenerate() {
    setIsLoading(true);
    setErrorMessage("");
    setResult(null);
    slideRefs.current = [];

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputMode,
          url,
          articleText,
          languageMode,
          slideCount,
        }),
      });

      const responseText = await response.text();

      let data: GenerateResult;

      try {
        data = JSON.parse(responseText) as GenerateResult;
      } catch {
        const start = responseText.indexOf("{");
        const end = responseText.lastIndexOf("}");

        if (start === -1 || end === -1 || end <= start) {
          throw new Error(responseText || "Failed to parse server response.");
        }

        data = JSON.parse(responseText.slice(start, end + 1)) as GenerateResult;
      }

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to generate post.");
      }

      setResult(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  function proxiedImageUrl(imageUrl: string) {
    return `/api/image?url=${encodeURIComponent(imageUrl)}`;
  }

  async function getSlidePng(index: number) {
    const node = slideRefs.current[index];

    if (!node) {
      throw new Error(`Slide ${index + 1} is not ready.`);
    }

    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#000000",
      filter: (element) => {
        const classList = Array.from(element.classList || []);

        return !classList.some((className) =>
          [
            "brand",
            "logo",
            "pageNumber",
            "slideNumber",
            "imageKeywords",
            "imageCredit",
            "sourceCredit",
            "metadata",
            "watermark",
            "topMeta",
            "bottomMeta",
          ].includes(className),
        );
      },
    });
  }

  async function downloadSlide(index: number) {
    try {
      const dataUrl = await getSlidePng(index);

      const link = document.createElement("a");
      link.download = `instapost-slide-${index + 1}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to download PNG.";
      setErrorMessage(message);
    }
  }

  async function downloadAllSlidesAsPng() {
    if (!result?.slides.length) return;

    for (let i = 0; i < result.slides.length; i += 1) {
      await downloadSlide(i);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  async function downloadPdf() {
    if (!result?.slides.length) return;

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [1080, 1350],
        compress: true,
      });

      for (let i = 0; i < result.slides.length; i += 1) {
        const dataUrl = await getSlidePng(i);

        if (i > 0) {
          pdf.addPage([1080, 1350], "portrait");
        }

        pdf.addImage(dataUrl, "PNG", 0, 0, 1080, 1350);
      }

      pdf.save("instapost-carousel.pdf");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to download PDF.";
      setErrorMessage(message);
    }
  }

  return (
    <main
      className="page"
      style={
        result?.backgroundImageUrl
          ? ({
              "--page-bg-image": `url("${proxiedImageUrl(result.backgroundImageUrl)}")`,
            } as CSSProperties)
          : undefined
      }
    >
      <section className="hero">
        <div className="heroText">
          <p className="eyebrow">Instagram Carousel Generator</p>
          <h1>Turn an article into an Instagram carousel.</h1>
          <p className="subtitle">
            Use an article URL or paste long text. Choose Korean or English,
            set the page count, and get carousel copy, a suggested caption,
            hashtags, downloadable PNG slides, and a PDF.
          </p>
        </div>

        <div className="inputCard">
          <div className="modeTabs" aria-label="Input type">
            <button
              type="button"
              className={inputMode === "url" ? "active" : ""}
              onClick={() => setInputMode("url")}
            >
              Article URL
            </button>

            <button
              type="button"
              className={inputMode === "text" ? "active" : ""}
              onClick={() => setInputMode("text")}
            >
              Long text
            </button>
          </div>

          {inputMode === "url" ? (
            <>
              <label htmlFor="article-url">Article URL</label>

              <div className="inputRow">
                <input
                  id="article-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                />
              </div>
            </>
          ) : (
            <label className="textField" htmlFor="article-text">
              Long text
              <textarea
                id="article-text"
                value={articleText}
                onChange={(event) => setArticleText(event.target.value)}
                placeholder="Paste your writing here. The app will turn the full text into Instagram carousel posts."
              />
            </label>
          )}

          <div className="controlGrid">
            <label htmlFor="language-mode">
              Output language
              <select
                id="language-mode"
                value={languageMode}
                onChange={(event) =>
                  setLanguageMode(event.target.value as "auto" | "ko" | "en")
                }
              >
                <option value="auto">Auto detect</option>
                <option value="ko">Korean</option>
                <option value="en">English</option>
              </select>
            </label>

            <label htmlFor="slide-count">
              Number of pages
              <input
                id="slide-count"
                type="number"
                min={1}
                max={20}
                value={slideCount}
                onChange={(event) => {
                  const nextCount = Number(event.target.value);
                  setSlideCount(
                    Number.isFinite(nextCount)
                      ? Math.min(20, Math.max(1, Math.floor(nextCount)))
                      : 5,
                  );
                }}
              />
            </label>
          </div>

          <button
            type="button"
            className="generateButton"
            onClick={handleGenerate}
            disabled={
              isLoading ||
              (inputMode === "url"
                ? !url.trim()
                : articleText.trim().length < 80)
            }
          >
            {isLoading ? "Generating..." : "Generate"}
          </button>

          {errorMessage ? <p className="error">{errorMessage}</p> : null}
        </div>
      </section>

      {result ? (
        <section className="resultSection">
          <div className="resultHeader">
            <div>
              <p className="eyebrow">Generated Result</p>
              <h2>{result.title}</h2>
              {result.detectedLanguage ? (
                <p className="languageMeta">
                  Output: {result.detectedLanguage === "ko" ? "Korean" : "English"}
                </p>
              ) : null}
            </div>

            <div className="downloadActions">
              <button
                type="button"
                className="secondaryButton"
                onClick={downloadAllSlidesAsPng}
              >
                Download PNGs
              </button>

              <button
                type="button"
                className="secondaryButton"
                onClick={downloadPdf}
              >
                Download PDF
              </button>
            </div>
          </div>

          <div className="slidesGrid">
            {result.slides.map((slide, index) => (
              <article key={`${slide.title}-${index}`} className="slideBlock">
                <div
                  ref={(element) => {
                    slideRefs.current[index] = element;
                  }}
                  className="slideCard cleanExportSlide"
                >
                  <Image
                    className="bgImage"
                    src={proxiedImageUrl(
                      slide.imageUrl || result.backgroundImageUrl || "",
                    )}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 520px"
                    unoptimized
                    priority={index === 0}
                  />

                  <div className="overlay" />

                  <div className="slideContent">
                    <h3>{slide.title}</h3>
                    <p>{slide.text}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="downloadButton"
                  onClick={() => downloadSlide(index)}
                >
                  Download PNG
                </button>
              </article>
            ))}
          </div>

          <div className="captionCard">
            <h3>Suggested caption</h3>
            <p>{result.caption}</p>

            <h3>Suggested hashtags</h3>
            <p>{result.hashtags.join(" ")}</p>

            {result.sourceUrl ? (
              <>
                <h3>Source</h3>
                <p className="sourceUrl">{result.sourceUrl}</p>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .page {
          position: relative;
          min-height: 100vh;
          background:
            linear-gradient(rgba(5, 5, 5, 0.78), rgba(5, 5, 5, 0.86)),
            var(--page-bg-image, none),
            radial-gradient(circle at top left, rgba(0, 255, 191, 0.12), transparent 30%),
            radial-gradient(circle at top right, rgba(0, 128, 255, 0.14), transparent 32%),
            #050505;
          background-size: cover, cover, auto, auto, auto;
          background-position: center, center, top left, top right, center;
          background-attachment: fixed;
          color: #f7f7f7;
          padding: 48px 24px 80px;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(18px);
          z-index: 0;
        }

        .page > * {
          position: relative;
          z-index: 1;
        }

        .hero {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 32px;
          align-items: center;
        }

        .heroText h1 {
          margin: 0;
          max-width: 720px;
          font-size: clamp(42px, 7vw, 84px);
          line-height: 0.95;
          letter-spacing: -0.07em;
        }

        .subtitle {
          margin: 24px 0 0;
          max-width: 640px;
          color: rgba(255, 255, 255, 0.72);
          font-size: 18px;
          line-height: 1.6;
        }

        .eyebrow {
          margin: 0 0 14px;
          color: #56ffd2;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .inputCard {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 28px;
          padding: 24px;
          backdrop-filter: blur(18px);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
        }

        label {
          display: block;
          margin-bottom: 10px;
          color: rgba(255, 255, 255, 0.82);
          font-size: 14px;
          font-weight: 700;
        }

        .modeTabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 20px;
        }

        .modeTabs button {
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .modeTabs button.active {
          background: linear-gradient(135deg, #55ffd1, #4aa3ff);
          color: #02110d;
          border-color: transparent;
        }

        .inputRow {
          display: flex;
          gap: 10px;
        }

        input,
        select,
        textarea {
          flex: 1;
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.12);
          outline: none;
          border-radius: 16px;
          padding: 15px 16px;
          background: rgba(0, 0, 0, 0.35);
          color: white;
          font-size: 15px;
        }

        textarea {
          min-height: 210px;
          resize: vertical;
          line-height: 1.55;
        }

        input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        textarea::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        .textField {
          margin: 0;
        }

        select {
          appearance: none;
          margin-top: 10px;
        }

        .controlGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 16px;
        }

        .controlGrid label {
          margin: 0;
        }

        button {
          border: 0;
          border-radius: 16px;
          padding: 15px 18px;
          background: linear-gradient(135deg, #55ffd1, #4aa3ff);
          color: #02110d;
          font-weight: 900;
          cursor: pointer;
          transition:
            transform 160ms ease,
            opacity 160ms ease;
        }

        .generateButton {
          width: 100%;
          margin-top: 18px;
        }

        button:hover {
          transform: translateY(-1px);
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
          transform: none;
        }

        .error {
          margin: 14px 0 0;
          color: #ff8585;
          font-size: 14px;
          line-height: 1.5;
        }

        .resultSection {
          max-width: 1120px;
          margin: 56px auto 0;
        }

        .resultHeader {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-end;
          margin-bottom: 24px;
        }

        .resultHeader h2 {
          margin: 0;
          font-size: clamp(28px, 4vw, 48px);
          line-height: 1.05;
          letter-spacing: -0.04em;
        }

        .languageMeta {
          margin: 12px 0 0;
          color: rgba(255, 255, 255, 0.68);
          font-weight: 700;
        }

        .downloadActions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .secondaryButton {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }

        .slidesGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px;
        }

        .slideBlock {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .slideCard {
          position: relative;
          overflow: hidden;
          width: 100%;
          aspect-ratio: 4 / 5;
          border-radius: 0;
          background: #000000;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
          isolation: isolate;
        }

        .bgImage {
          object-fit: cover;
          transform: scale(1.03);
          filter: saturate(0.95) contrast(1.05) brightness(0.68);
          z-index: 0;
        }

        .overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background:
            linear-gradient(
              180deg,
              rgba(0, 0, 0, 0.05) 0%,
              rgba(0, 0, 0, 0.18) 38%,
              rgba(0, 0, 0, 0.78) 72%,
              rgba(0, 0, 0, 0.9) 100%
            ),
            radial-gradient(
              circle at top left,
              rgba(86, 255, 210, 0.13),
              transparent 38%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(74, 163, 255, 0.14),
              transparent 42%
            );
        }

        .slideContent {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 0 76px 110px;
        }

        .slideContent h3 {
          margin: 0 0 22px;
          color: white;
          font-size: clamp(28px, 3.6vw, 44px);
          line-height: 1.18;
          letter-spacing: -0.045em;
          font-weight: 900;
          text-wrap: balance;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
        }

        .slideContent p {
          margin: 0;
          color: rgba(255, 255, 255, 0.95);
          font-size: clamp(22px, 2.85vw, 36px);
          line-height: 1.28;
          letter-spacing: -0.04em;
          font-weight: 850;
          text-wrap: balance;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
        }

        .downloadButton {
          width: 100%;
        }

        .captionCard {
          margin-top: 32px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 28px;
          padding: 26px;
        }

        .captionCard h3 {
          margin: 0 0 8px;
          font-size: 16px;
        }

        .captionCard h3:not(:first-child) {
          margin-top: 24px;
        }

        .captionCard p {
          margin: 0;
          color: rgba(255, 255, 255, 0.76);
          line-height: 1.65;
          white-space: pre-wrap;
        }

        .sourceUrl {
          word-break: break-all;
        }

        :global(.brand),
        :global(.logo),
        :global(.pageNumber),
        :global(.slideNumber),
        :global(.imageKeywords),
        :global(.imageCredit),
        :global(.sourceCredit),
        :global(.metadata),
        :global(.watermark),
        :global(.topMeta),
        :global(.bottomMeta) {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }

        @media (max-width: 900px) {
          .hero {
            grid-template-columns: 1fr;
          }

          .inputRow {
            flex-direction: column;
          }

          .controlGrid {
            grid-template-columns: 1fr;
          }

          .resultHeader {
            align-items: flex-start;
            flex-direction: column;
          }

          .slidesGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .page {
            padding: 32px 16px 64px;
          }

          .slideContent {
            padding: 0 32px 72px;
          }
        }
      `}</style>
    </main>
  );
}
