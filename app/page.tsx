"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import * as htmlToImage from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type Slide = {
  page: number;
  sentence: string;
  imageQuery: string;
  imageUrl: string;
  imageCredit?: string;
  imagePageUrl?: string;
};

type Result = {
  title: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
};

export default function Home() {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [pageCount, setPageCount] = useState(7);
  const [language, setLanguage] = useState<"auto" | "english" | "korean">("auto");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);

  async function generatePost() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode,
          url,
          text,
          pageCount,
          language
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate post.");
      }

      setResult(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadOne(index: number) {
    const node = cardRefs.current[index];
    if (!node) return;

    const dataUrl = await htmlToImage.toPng(node, {
      quality: 1,
      pixelRatio: 2,
      cacheBust: true
    });

    saveAs(dataUrl, `instapost-page-${index + 1}.png`);
  }

  async function downloadAll() {
    if (!result) return;

    setDownloading(true);

    try {
      const zip = new JSZip();

      for (let i = 0; i < result.slides.length; i += 1) {
        const node = cardRefs.current[i];
        if (!node) continue;

        const dataUrl = await htmlToImage.toPng(node, {
          quality: 1,
          pixelRatio: 2,
          cacheBust: true
        });

        const base64 = dataUrl.split(",")[1];
        zip.file(`instapost-page-${i + 1}.png`, base64, { base64: true });
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "instapost-carousel.zip");
    } finally {
      setDownloading(false);
    }
  }

  const canGenerate =
    mode === "url" ? url.trim().length > 0 : text.trim().length >= 300;

  return (
    <main className="app">
      <section className="hero">
        <div className="brandRow">
          <div className="logoMark">I</div>
          <span>InstaPost</span>
        </div>

        <h1>Turn any article into an Instagram carousel.</h1>
        <p>
          Paste a link or long writing. Choose 5–20 pages. Get short,
          Instagram-ready pages with AI-written copy and internet-sourced
          background images.
        </p>
      </section>

      <section className="panel">
        <div className="modeTabs">
          <button
            className={mode === "url" ? "active" : ""}
            onClick={() => setMode("url")}
          >
            Article link
          </button>
          <button
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            Paste writing
          </button>
        </div>

        {mode === "url" ? (
          <label className="field">
            <span>Article URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/article"
            />
          </label>
        ) : (
          <label className="field">
            <span>Long writing</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your long writing here. Minimum 300 characters."
            />
          </label>
        )}

        <div className="controlsGrid">
          <label className="field">
            <span>Number of pages</span>
            <input
              type="number"
              min={5}
              max={20}
              value={pageCount}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPageCount(Math.min(20, Math.max(5, value)));
              }}
            />
          </label>

          <label className="field">
            <span>Language</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as "auto" | "english" | "korean")
              }
            >
              <option value="auto">Auto</option>
              <option value="english">English</option>
              <option value="korean">Korean</option>
            </select>
          </label>
        </div>

        <button
          className="generateButton"
          disabled={!canGenerate || loading}
          onClick={generatePost}
        >
          {loading ? "Generating carousel..." : "Generate InstaPost"}
        </button>

        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="resultSection">
          <div className="resultHeader">
            <div>
              <p className="eyebrow">Generated carousel</p>
              <h2>{result.title}</h2>
              <p className="caption">{result.caption}</p>
              <p className="hashtags">{result.hashtags.join(" ")}</p>
            </div>

            <button
              className="downloadAllButton"
              onClick={downloadAll}
              disabled={downloading}
            >
              {downloading ? "Preparing ZIP..." : "Download all PNGs"}
            </button>
          </div>

          <div className="carouselGrid">
            {result.slides.map((slide, index) => (
              <div className="slideWrap" key={`${slide.page}-${index}`}>
                <div
                  className="instaCard"
                  ref={(node) => {
                    cardRefs.current[index] = node;
                  }}
                >
                  <Image
                    className="bgImage"
                    src={`/api/image?url=${encodeURIComponent(slide.imageUrl)}`}
                    alt=""
                    width={600}
                    height={900}
                  />
                  <div className="darkOverlay" />
                  <div className="neonGlow neonGlowOne" />
                  <div className="neonGlow neonGlowTwo" />

                  <div className="cardTop">
                    <div className="miniBrand">
                      <div className="miniLogo">I</div>
                      <span>InstaPost</span>
                    </div>
                    <span className="pageNumber">
                      {slide.page}/{result.slides.length}
                    </span>
                  </div>

                  <div className="cardText">
                    <p>{slide.sentence}</p>
                  </div>

                  <div className="cardFooter">
                    <span>{slide.imageQuery}</span>
                    <span>Image: Wikimedia Commons</span>
                  </div>
                </div>

                <div className="slideActions">
                  <button onClick={() => downloadOne(index)}>
                    Download page {index + 1}
                  </button>
                  {slide.imagePageUrl && (
                    <a
                      href={slide.imagePageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Image source
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}