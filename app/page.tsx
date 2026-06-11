"use client";

import { useState } from "react";

type GeneratedSlide = {
  title?: string;
  text?: string;
  caption?: string;
  imagePrompt?: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [language, setLanguage] = useState("en");
  const [pageCount, setPageCount] = useState(6);

  const [slides, setSlides] = useState<GeneratedSlide[]>([]);
  const [rawResult, setRawResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setSlides([]);
    setRawResult("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          articleText,
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
      } else if (typeof data.result === "string") {
        setRawResult(data.result);
      } else {
        setRawResult(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <section className="mb-10">
          <h1 className="mb-3 text-4xl font-bold">
            Instagram Post Generator
          </h1>
          <p className="text-neutral-400">
            Generate Instagram carousel content from an article URL or pasted
            article text.
          </p>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium">
              Article URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-blue-500"
            />
            <p className="mt-2 text-sm text-neutral-500">
              Some websites block server fetching. If you get a 403 error,
              paste the article text below instead.
            </p>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium">
              Paste article text manually
            </label>
            <textarea
              value={articleText}
              onChange={(e) => setArticleText(e.target.value)}
              placeholder="Paste the article text here..."
              rows={10}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-blue-500"
            />
          </div>

          <div className="mb-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Output language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                <option value="en">English</option>
                <option value="ko">Korean</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Number of carousel pages
              </label>
              <input
                type="number"
                min={3}
                max={10}
                value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
              <p className="mt-2 text-sm text-neutral-500">
                Recommended: 5–7 pages.
              </p>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate"}
          </button>

          {error && (
            <div className="mt-5 rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-red-200">
              {error}
            </div>
          )}
        </section>

        {slides.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">Generated Carousel</h2>

            <div className="grid gap-5">
              {slides.map((slide, index) => (
                <article
                  key={index}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
                >
                  <p className="mb-2 text-sm text-neutral-500">
                    Page {index + 1}
                  </p>

                  {slide.title && (
                    <h3 className="mb-3 text-xl font-semibold">
                      {slide.title}
                    </h3>
                  )}

                  {slide.text && (
                    <p className="mb-3 whitespace-pre-wrap text-neutral-200">
                      {slide.text}
                    </p>
                  )}

                  {slide.caption && (
                    <div className="mb-3 rounded-xl bg-neutral-950 p-4 text-neutral-300">
                      <strong>Caption:</strong>
                      <p className="mt-2 whitespace-pre-wrap">
                        {slide.caption}
                      </p>
                    </div>
                  )}

                  {slide.imagePrompt && (
                    <div className="rounded-xl bg-neutral-950 p-4 text-neutral-300">
                      <strong>Image prompt:</strong>
                      <p className="mt-2 whitespace-pre-wrap">
                        {slide.imagePrompt}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {rawResult && (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">Generated Result</h2>
            <pre className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-200">
              {rawResult}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}