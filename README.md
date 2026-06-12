# InstaPost

Turn any article or long-form text into ready-to-post **Instagram carousel pages** — short, summarized copy laid over real, topic-relevant background photos.

**🔗 Live demo: https://insta-post-ruddy.vercel.app**

## What it does

Paste an article URL (or the raw text), pick a language and page count, and InstaPost generates a set of 4:5 carousel slides. Each slide has a concise headline and supporting line summarized from the source, set over a background photo chosen to match that page's topic. Export the result as individual PNGs or a single PDF.

## Features

- **Two input modes** — an article URL (the server fetches and extracts the text) or pasted long text.
- **AI summarization** — Google Gemini condenses the source into one concrete point per slide.
- **English or Korean output** — summarizes in either language regardless of the source language.
- **1–10 pages** per carousel.
- **Topic-aware backgrounds** — each page's background is a real photo found via image search, chosen from the combination of the whole-article keywords and that page's own keywords (details below).
- **Exports** — download a single page as PNG, all pages as a PNG zip, or the whole carousel as a PDF.

## How background images are chosen

Backgrounds are **searched, not AI-generated**:

1. The generator extracts the **whole-article keywords** (the overall topic) and attaches them to every slide.
2. For each page, the image route builds a **combined query** from the article topic plus that page's specific keywords (e.g. article `fable, agent` + page `python, web, server` → search `"fable python web server agent"`).
3. It fetches candidates from [Pexels](https://www.pexels.com/api/) and **scores each by how well its description matches the keywords** (page keywords weighted higher than article keywords), then uses the best match.
4. If the combined query returns nothing, it falls back to page-only, then article-only, then a generic query. As a last resort it renders a procedural gradient placeholder.

Selection is deterministic, so a page keeps the same photo across reloads and downloads.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + React + TypeScript
- Tailwind CSS
- Google Gemini API — text summarization
- Pexels API — background image search
- `html-to-image`, `jspdf`, `jszip`, `file-saver` — client-side PNG/PDF export

## Environment variables

Create `.env.local` (and set the same variables in your Vercel project):

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_API_KEY` | ✅ | Google AI Studio key for text summarization (`GEMINI_API_KEY` also accepted). |
| `PEXELS_API_KEY` | ✅ | Pexels API key for background image search. |
| `GOOGLE_TEXT_MODEL` | optional | Override the default summarization model. Leave unset to use the built-in default and automatic fallbacks. |

Get the keys:

- Google AI Studio — https://aistudio.google.com/app/apikey
- Pexels — https://www.pexels.com/api/

## Local development

```bash
# install dependencies
npm install

# create .env.local and set your keys
#   GOOGLE_API_KEY=...
#   PEXELS_API_KEY=...

# run the dev server
npm run dev
```

Open http://localhost:3000.

> Environment variables are read only at startup — restart the dev server after editing `.env.local`.

## Deployment (Vercel)

1. Import the repository into Vercel.
2. Under **Settings → Environment Variables**, add `GOOGLE_API_KEY` and `PEXELS_API_KEY` (and optionally `GOOGLE_TEXT_MODEL`) for Production and Preview.
3. Deploy. Vercel builds with `next build` automatically.

## License

Personal project — use freely. Background photos are provided by Pexels under the [Pexels License](https://www.pexels.com/license/).
