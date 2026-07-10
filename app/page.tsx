"use client";

import { saveAs } from "file-saver";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type InputMode = "url" | "text" | "meme";
type OutputLanguage = "en" | "ko";
type TextElement = "title" | "body";
type MemeTextElement = "top" | "bottom";

type GeneratedSlide = {
  title?: string;
  text?: string;
  caption?: string;
  imagePrompt?: string;
  imageUrl?: string;
};

type Position = {
  x: number;
  y: number;
};

type SlideEditorState = {
  title: string;
  text: string;
  backgroundDataUrl: string;
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  titleColor: string;
  bodyColor: string;
  titleSize: number;
  bodySize: number;
  titleFont: string;
  bodyFont: string;
  titlePosition: Position;
  bodyPosition: Position;
  overlayOpacity: number;
};

type EditableSlide = GeneratedSlide & {
  editor: SlideEditorState;
};

type MemeEditorState = {
  topText: string;
  bottomText: string;
  backgroundDataUrl: string;
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  topColor: string;
  bottomColor: string;
  topSize: number;
  bottomSize: number;
  topFont: string;
  bottomFont: string;
  topPosition: Position;
  bottomPosition: Position;
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

type DragState = {
  slideIndex: number;
  element: TextElement;
  startPointerX: number;
  startPointerY: number;
  startPosition: Position;
  rectWidth: number;
  rectHeight: number;
};

type MemeDragState = {
  element: MemeTextElement;
  startPointerX: number;
  startPointerY: number;
  startPosition: Position;
  rectWidth: number;
  rectHeight: number;
};

type BackgroundDragState = {
  slideIndex: number;
  startPointerX: number;
  startPointerY: number;
  startPositionX: number;
  startPositionY: number;
  rectWidth: number;
  rectHeight: number;
};

type MemeBackgroundDragState = {
  startPointerX: number;
  startPointerY: number;
  startPositionX: number;
  startPositionY: number;
  rectWidth: number;
  rectHeight: number;
};

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1350;
const PAGE_COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);
const SLIDE_STORAGE_KEY = "instapost-slide-editor-v2";
const MEME_STORAGE_KEY = "instapost-meme-editor-v2";

const FONT_OPTIONS = [
  { label: "System Sans", value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Courier New", value: '"Courier New", monospace' },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' },
  { label: "Verdana", value: "Verdana, sans-serif" },
];


function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function defaultEditor(slide: GeneratedSlide): SlideEditorState {
  return {
    title: slide.title ?? "",
    text: slide.text ?? "",
    backgroundDataUrl: "",
    imageScale: 1,
    imagePositionX: 0,
    imagePositionY: 0,
    titleColor: "#ffffff",
    bodyColor: "#ffffff",
    titleSize: 88,
    bodySize: 58,
    titleFont: FONT_OPTIONS[0].value,
    bodyFont: FONT_OPTIONS[0].value,
    titlePosition: { x: 7, y: 67 },
    bodyPosition: { x: 7, y: 82 },
    overlayOpacity: 45,
  };
}

function defaultMemeEditor(meme: MemeResult): MemeEditorState {
  return {
    topText: meme.topText,
    bottomText: meme.bottomText,
    backgroundDataUrl: "",
    imageScale: 1,
    imagePositionX: 0,
    imagePositionY: 0,
    topColor: "#ffffff",
    bottomColor: "#ffffff",
    topSize: 72,
    bottomSize: 72,
    topFont: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    bottomFont: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    topPosition: { x: 4, y: 5 },
    bottomPosition: { x: 4, y: 78 },
  };
}

function toEditableSlide(slide: GeneratedSlide): EditableSlide {
  return { ...slide, editor: defaultEditor(slide) };
}

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [memeUrl, setMemeUrl] = useState("");
  const [memeText, setMemeText] = useState("");
  const [language, setLanguage] = useState<OutputLanguage>("en");
  const [pageCount, setPageCount] = useState(6);
  const [slides, setSlides] = useState<EditableSlide[]>([]);
  const [memeResult, setMemeResult] = useState<MemeResult | null>(null);
  const [memeEditor, setMemeEditor] = useState<MemeEditorState | null>(null);
  const [generationMode, setGenerationMode] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [resolvedBgUrls, setResolvedBgUrls] = useState<Map<number, string>>(new Map());

  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const memeRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const memeDragState = useRef<MemeDragState | null>(null);
  const backgroundDragState = useRef<BackgroundDragState | null>(null);
  const memeBackgroundDragState = useRef<MemeBackgroundDragState | null>(null);

  const canGenerate = useMemo(() => {
    if (loading) return false;
    if (inputMode === "url") return url.trim().length > 0;
    if (inputMode === "text") return articleText.trim().length >= 80;

    const hasMemeUrl = memeUrl.trim().length > 0;
    const hasMemeText = memeText.trim().length >= 30;
    return hasMemeUrl !== hasMemeText;
  }, [articleText, inputMode, loading, memeText, memeUrl, url]);

  useEffect(() => {
    const saved = localStorage.getItem(SLIDE_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as EditableSlide[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSlides(parsed);
        setGenerationMode("restored draft");
      }
    } catch {
      localStorage.removeItem(SLIDE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (slides.length === 0) return;
    localStorage.setItem(SLIDE_STORAGE_KEY, JSON.stringify(slides));
  }, [slides]);

  useEffect(() => {
    const saved = localStorage.getItem(MEME_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        result: MemeResult;
        editor: MemeEditorState;
      };
      if (parsed.result && parsed.editor) {
        setMemeResult(parsed.result);
        setMemeEditor(parsed.editor);
      }
    } catch {
      localStorage.removeItem(MEME_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!memeResult || !memeEditor) return;
    localStorage.setItem(
      MEME_STORAGE_KEY,
      JSON.stringify({ result: memeResult, editor: memeEditor }),
    );
  }, [memeEditor, memeResult]);

  function resetResultState() {
    setError("");
    setWarning("");
    setGenerationMode("");
    setSlides([]);
    setMemeResult(null);
    setMemeEditor(null);
    setResolvedBgUrls(new Map());
    slideRefs.current = [];
  }

  function changeInputMode(nextMode: InputMode) {
    setInputMode(nextMode);
    setError("");
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

  async function blobToDataUrl(blob: Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(blob);
    });
  }

  async function resolveGeneratedBackgrounds(generatedSlides: EditableSlide[]) {
    const next = new Map<number, string>();

    for (let index = 0; index < generatedSlides.length; index += 1) {
      const slide = generatedSlides[index];
      const source = slide.imageUrl || fallbackImageUrl(slide, index);

      try {
        const response = await fetch(proxiedImageUrl(source), { cache: "no-store" });
        if (!response.ok) continue;
        next.set(index, await blobToDataUrl(await response.blob()));
        setResolvedBgUrls(new Map(next));
      } catch {
        // Keep the gradient fallback.
      }
    }
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

      if (!response.ok) throw new Error(data.error || "Failed to generate post.");
      if (!Array.isArray(data.slides) || data.slides.length === 0) {
        throw new Error("The server did not return any slides.");
      }

      const editableSlides = data.slides.map(toEditableSlide);
      setSlides(editableSlides);
      setGenerationMode(data.meta?.mode ?? "generated");
      setWarning(data.meta?.warning ?? "");
      void resolveGeneratedBackgrounds(editableSlides);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateMeme() {
    setLoading(true);
    setError("");
    setWarning("");

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
      if (!response.ok) throw new Error(data.error || "Failed to generate meme.");
      if (!data.meme) throw new Error("The server did not return a meme.");

      setMemeResult(data.meme);
      setMemeEditor(defaultMemeEditor(data.meme));
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

  function updateSlideEditor(index: number, patch: Partial<SlideEditorState>) {
    setSlides((current) =>
      current.map((slide, slideIndex) =>
        slideIndex === index
          ? { ...slide, editor: { ...slide.editor, ...patch } }
          : slide,
      ),
    );
  }

  function updateMemeEditor(patch: Partial<MemeEditorState>) {
    setMemeEditor((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleBackgroundFile(index: number, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    try {
      updateSlideEditor(index, {
        backgroundDataUrl: await blobToDataUrl(file),
        imageScale: 1,
        imagePositionX: 0,
        imagePositionY: 0,
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the selected image.");
    }
  }

  async function handleMemeBackgroundFile(file?: File) {
    if (!file || !memeEditor) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    try {
      updateMemeEditor({
        backgroundDataUrl: await blobToDataUrl(file),
        imageScale: 1,
        imagePositionX: 0,
        imagePositionY: 0,
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the selected image.");
    }
  }

  function handleSlideDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    void handleBackgroundFile(index, event.dataTransfer.files?.[0]);
  }

  function handleMemeDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleMemeBackgroundFile(event.dataTransfer.files?.[0]);
  }

  function resetSlide(index: number) {
    setSlides((current) =>
      current.map((slide, slideIndex) =>
        slideIndex === index
          ? { ...slide, editor: defaultEditor(slide) }
          : slide,
      ),
    );
  }

  function clearSavedDrafts() {
    localStorage.removeItem(SLIDE_STORAGE_KEY);
    localStorage.removeItem(MEME_STORAGE_KEY);
    setSlides([]);
    setMemeResult(null);
    setMemeEditor(null);
    setResolvedBgUrls(new Map());
    setGenerationMode("");
  }

  function getBackgroundUrl(slide: EditableSlide, index: number) {
    return slide.editor.backgroundDataUrl || resolvedBgUrls.get(index) || "";
  }

  function startTextDrag(
    event: ReactPointerEvent<HTMLElement>,
    slideIndex: number,
    element: TextElement,
  ) {
    const container = slideRefs.current[slideIndex];
    if (!container) return;

    const editor = slides[slideIndex]?.editor;
    if (!editor) return;

    const rect = container.getBoundingClientRect();
    dragState.current = {
      slideIndex,
      element,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPosition:
        element === "title" ? editor.titlePosition : editor.bodyPosition,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveTextDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = dragState.current;
    if (!state) return;

    const deltaX = ((event.clientX - state.startPointerX) / state.rectWidth) * 100;
    const deltaY = ((event.clientY - state.startPointerY) / state.rectHeight) * 100;
    const nextPosition = {
      x: clamp(state.startPosition.x + deltaX, 0, 86),
      y: clamp(state.startPosition.y + deltaY, 0, 92),
    };

    updateSlideEditor(
      state.slideIndex,
      state.element === "title"
        ? { titlePosition: nextPosition }
        : { bodyPosition: nextPosition },
    );
  }

  function endTextDrag() {
    dragState.current = null;
  }

  function startMemeTextDrag(
    event: ReactPointerEvent<HTMLElement>,
    element: MemeTextElement,
  ) {
    if (!memeRef.current || !memeEditor) return;

    const rect = memeRef.current.getBoundingClientRect();
    memeDragState.current = {
      element,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPosition:
        element === "top" ? memeEditor.topPosition : memeEditor.bottomPosition,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveMemeTextDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = memeDragState.current;
    if (!state) return;

    const deltaX = ((event.clientX - state.startPointerX) / state.rectWidth) * 100;
    const deltaY = ((event.clientY - state.startPointerY) / state.rectHeight) * 100;
    const nextPosition = {
      x: clamp(state.startPosition.x + deltaX, 0, 86),
      y: clamp(state.startPosition.y + deltaY, 0, 92),
    };

    updateMemeEditor(
      state.element === "top"
        ? { topPosition: nextPosition }
        : { bottomPosition: nextPosition },
    );
  }

  function endMemeTextDrag() {
    memeDragState.current = null;
  }

  function startBackgroundDrag(
    event: ReactPointerEvent<HTMLElement>,
    slideIndex: number,
  ) {
    const container = slideRefs.current[slideIndex];
    const editor = slides[slideIndex]?.editor;
    if (!container || !editor) return;

    const rect = container.getBoundingClientRect();
    backgroundDragState.current = {
      slideIndex,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPositionX: editor.imagePositionX,
      startPositionY: editor.imagePositionY,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveBackgroundDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = backgroundDragState.current;
    if (!state) return;

    const deltaX = ((event.clientX - state.startPointerX) / state.rectWidth) * 200;
    const deltaY = ((event.clientY - state.startPointerY) / state.rectHeight) * 200;

    updateSlideEditor(state.slideIndex, {
      imagePositionX: clamp(state.startPositionX + deltaX, -100, 100),
      imagePositionY: clamp(state.startPositionY + deltaY, -100, 100),
    });
  }

  function endBackgroundDrag() {
    backgroundDragState.current = null;
  }

  function startMemeBackgroundDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!memeRef.current || !memeEditor) return;

    const rect = memeRef.current.getBoundingClientRect();
    memeBackgroundDragState.current = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPositionX: memeEditor.imagePositionX,
      startPositionY: memeEditor.imagePositionY,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveMemeBackgroundDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = memeBackgroundDragState.current;
    if (!state) return;

    const deltaX = ((event.clientX - state.startPointerX) / state.rectWidth) * 200;
    const deltaY = ((event.clientY - state.startPointerY) / state.rectHeight) * 200;

    updateMemeEditor({
      imagePositionX: clamp(state.startPositionX + deltaX, -100, 100),
      imagePositionY: clamp(state.startPositionY + deltaY, -100, 100),
    });
  }

  function endMemeBackgroundDrag() {
    memeBackgroundDragState.current = null;
  }

  async function loadCanvasImage(src: string) {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load the background image."));
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
    if (!normalized) return [];

    const usesSpaces = normalized.includes(" ");
    const words = usesSpaces ? normalized.split(" ") : [...normalized];
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const separator = usesSpaces ? " " : "";
      const candidate = currentLine ? `${currentLine}${separator}${word}` : word;

      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    }

    if (currentLine && lines.length < maxLines) lines.push(currentLine);

    if (lines.length === maxLines) {
      const lastIndex = lines.length - 1;
      while (
        lines[lastIndex].length > 1 &&
        ctx.measureText(`${lines[lastIndex]}…`).width > maxWidth
      ) {
        lines[lastIndex] = lines[lastIndex].slice(0, -1);
      }
      lines[lastIndex] = `${lines[lastIndex]}…`;
    }

    return lines;
  }

  function drawCoverImage(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    scale: number,
    positionX: number,
    positionY: number,
  ) {
    const canvasRatio = PAGE_WIDTH / PAGE_HEIGHT;
    const imageRatio = image.width / image.height;

    let baseWidth = PAGE_WIDTH;
    let baseHeight = PAGE_HEIGHT;

    if (imageRatio > canvasRatio) {
      baseHeight = PAGE_HEIGHT;
      baseWidth = baseHeight * imageRatio;
    } else {
      baseWidth = PAGE_WIDTH;
      baseHeight = baseWidth / imageRatio;
    }

    const drawWidth = baseWidth * scale;
    const drawHeight = baseHeight * scale;
    const travelX = Math.max(0, drawWidth - PAGE_WIDTH) / 2;
    const travelY = Math.max(0, drawHeight - PAGE_HEIGHT) / 2;
    const drawX = (PAGE_WIDTH - drawWidth) / 2 + (positionX / 100) * travelX;
    const drawY = (PAGE_HEIGHT - drawHeight) / 2 + (positionY / 100) * travelY;

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  function drawPositionedText({
    ctx,
    text,
    fontSize,
    fontFamily,
    fontWeight,
    color,
    position,
    maxWidth,
    maxLines,
    lineHeight,
    stroke,
  }: {
    ctx: CanvasRenderingContext2D;
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    color: string;
    position: Position;
    maxWidth: number;
    maxLines: number;
    lineHeight: number;
    stroke?: boolean;
  }) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const lines = wrapCanvasText(ctx, text, maxWidth, maxLines);
    let y = (position.y / 100) * PAGE_HEIGHT;
    const x = (position.x / 100) * PAGE_WIDTH;

    for (const line of lines) {
      if (stroke) {
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(5, fontSize * 0.09);
        ctx.strokeStyle = "#000000";
        ctx.strokeText(line, x, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(line, x, y);
      y += fontSize * lineHeight;
    }
  }

  async function getSlidePng(index: number) {
    const slide = slides[index];
    if (!slide) throw new Error(`Page ${index + 1} is not ready yet.`);

    const canvas = document.createElement("canvas");
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create image canvas.");

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

    const backgroundUrl = getBackgroundUrl(slide, index);
    if (backgroundUrl) {
      drawCoverImage(
        ctx,
        await loadCanvasImage(backgroundUrl),
        slide.editor.imageScale,
        slide.editor.imagePositionX,
        slide.editor.imagePositionY,
      );
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${slide.editor.overlayOpacity / 100})`;
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

    drawPositionedText({
      ctx,
      text: slide.editor.title,
      fontSize: slide.editor.titleSize,
      fontFamily: slide.editor.titleFont,
      fontWeight: 900,
      color: slide.editor.titleColor,
      position: slide.editor.titlePosition,
      maxWidth: PAGE_WIDTH * 0.86,
      maxLines: 4,
      lineHeight: 1.08,
    });

    drawPositionedText({
      ctx,
      text: slide.editor.text,
      fontSize: slide.editor.bodySize,
      fontFamily: slide.editor.bodyFont,
      fontWeight: 600,
      color: slide.editor.bodyColor,
      position: slide.editor.bodyPosition,
      maxWidth: PAGE_WIDTH * 0.86,
      maxLines: 6,
      lineHeight: 1.22,
    });

    return canvas.toDataURL("image/png");
  }

  async function downloadSlide(index: number) {
    setDownloading(true);
    setError("");

    try {
      saveAs(await getSlidePng(index), `instapost-page-${index + 1}.png`);
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
        zip.file(`instapost-page-${index + 1}.png`, dataUrl.split(",")[1], {
          base64: true,
        });
      }

      saveAs(await zip.generateAsync({ type: "blob" }), "instapost-carousel.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download ZIP.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadMeme() {
    if (!memeRef.current) {
      setError("Meme is not ready yet.");
      return;
    }

    setDownloading(true);
    setError("");

    try {
      const dataUrl = await toPng(memeRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        style: {
          width: `${PAGE_WIDTH}px`,
          height: `${PAGE_HEIGHT}px`,
          borderRadius: "0",
        },
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.editorOnly === "true"),
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
    if (value.trim()) setMemeText("");
  }

  function handleMemeTextChange(value: string) {
    setMemeText(value);
    if (value.trim()) setMemeUrl("");
  }

  function backgroundTransform(scale: number, x: number, y: number) {
    return `translate(${x * 0.25}%, ${y * 0.25}%) scale(${scale})`;
  }

  const controlClass =
    "rounded-xl border border-[#d0d5dd] bg-white px-3 py-3 outline-none focus:border-[#111827]";

  return (
    <main className="min-h-screen bg-[#f6f7fb] px-5 py-8 text-[#111827]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="rounded-[32px] bg-white p-6 shadow-sm md:p-10">
          <div className="mb-8 flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#667085]">
              InstaPost
            </p>
            <h1 className="text-4xl font-black tracking-[-0.04em] md:text-6xl">
              Generate and edit Instagram posts
            </h1>
            <p className="max-w-3xl text-base leading-7 text-[#667085]">
              Drag images from Finder, position them with a grid, move text boxes directly on the canvas, and keep drafts after refreshing.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-[#f2f4f7] p-2">
            {(["url", "text", "meme"] as InputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeInputMode(mode)}
                className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                  inputMode === mode ? "bg-white shadow-sm" : "text-[#667085]"
                }`}
              >
                {mode === "url" ? "Article Link" : mode === "text" ? "Long Text" : "Meme"}
              </button>
            ))}
          </div>

          <div className="grid gap-5">
            {inputMode === "url" && (
              <label className="grid gap-2">
                <span className="text-sm font-bold">Article URL</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className={controlClass}
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
                  className={`${controlClass} resize-y`}
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
                    className={`${controlClass} disabled:bg-[#f2f4f7]`}
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
                    className={`${controlClass} resize-y disabled:bg-[#f2f4f7]`}
                  />
                </label>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-bold">Language</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as OutputLanguage)}
                  className={controlClass}
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
                    className={controlClass}
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

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex-1 rounded-2xl bg-[#111827] px-6 py-4 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-[#d0d5dd]"
              >
                {loading
                  ? inputMode === "meme"
                    ? "Generating Meme..."
                    : "Generating..."
                  : inputMode === "meme"
                    ? "Generate Meme"
                    : "Generate"}
              </button>
              <button
                type="button"
                onClick={clearSavedDrafts}
                className="rounded-2xl border border-[#d0d5dd] px-6 py-4 text-sm font-black"
              >
                Clear saved drafts
              </button>
            </div>

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

        {inputMode === "meme" && memeResult && memeEditor && (
          <section className="rounded-[32px] bg-white p-6 shadow-sm md:p-10">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-black">Meme Editor</h2>
                <p className="mt-2 text-sm text-[#667085]">
                  Drag either caption directly on the meme. Drop an image from Finder to replace the background.
                </p>
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

            <div className="grid gap-8 lg:grid-cols-[minmax(320px,520px)_1fr]">
              <div
                ref={memeRef}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleMemeDrop}
                className="relative aspect-[4/5] w-full overflow-hidden rounded-[24px] bg-black shadow-2xl"
              >
                <img
                  src={
                    memeEditor.backgroundDataUrl ||
                    `${memeResult.imageUrl}&t=${Date.now()}`
                  }
                  alt={memeResult.templateName}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    transform: backgroundTransform(
                      memeEditor.imageScale,
                      memeEditor.imagePositionX,
                      memeEditor.imagePositionY,
                    ),
                    transformOrigin: "center",
                  }}
                />

                <ImageOverlayGrid
                  scale={memeEditor.imageScale}
                  onScaleChange={(imageScale) => updateMemeEditor({ imageScale })}
                  onPointerDown={startMemeBackgroundDrag}
                  onPointerMove={moveMemeBackgroundDrag}
                  onPointerUp={endMemeBackgroundDrag}
                  onPointerCancel={endMemeBackgroundDrag}
                />

                <div
                  onPointerDown={(event) => startMemeTextDrag(event, "top")}
                  onPointerMove={moveMemeTextDrag}
                  onPointerUp={endMemeTextDrag}
                  onPointerCancel={endMemeTextDrag}
                  className="absolute z-20 w-[92%] cursor-move select-none text-center font-black uppercase leading-[1.05]"
                  style={{
                    left: `${memeEditor.topPosition.x}%`,
                    top: `${memeEditor.topPosition.y}%`,
                    color: memeEditor.topColor,
                    fontFamily: memeEditor.topFont,
                    fontSize: `${memeEditor.topSize * 0.48}px`,
                    textShadow:
                      "3px 3px 0 #000,-3px 3px 0 #000,3px -3px 0 #000,-3px -3px 0 #000",
                    touchAction: "none",
                  }}
                >
                  {memeEditor.topText}
                </div>

                <div
                  onPointerDown={(event) => startMemeTextDrag(event, "bottom")}
                  onPointerMove={moveMemeTextDrag}
                  onPointerUp={endMemeTextDrag}
                  onPointerCancel={endMemeTextDrag}
                  className="absolute z-20 w-[92%] cursor-move select-none text-center font-black uppercase leading-[1.05]"
                  style={{
                    left: `${memeEditor.bottomPosition.x}%`,
                    top: `${memeEditor.bottomPosition.y}%`,
                    color: memeEditor.bottomColor,
                    fontFamily: memeEditor.bottomFont,
                    fontSize: `${memeEditor.bottomSize * 0.48}px`,
                    textShadow:
                      "3px 3px 0 #000,-3px 3px 0 #000,3px -3px 0 #000,-3px -3px 0 #000",
                    touchAction: "none",
                  }}
                >
                  {memeEditor.bottomText}
                </div>
              </div>

              <div className="grid content-start gap-5">
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleMemeDrop}
                  className="rounded-2xl border-2 border-dashed border-[#98a2b3] bg-[#f9fafb] p-6 text-center"
                >
                  <p className="font-black">Drag an image here from Finder</p>
                  <p className="mt-1 text-sm text-[#667085]">or select a file</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      void handleMemeBackgroundFile(event.target.files?.[0])
                    }
                    className="mt-4 block w-full text-sm"
                  />
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-bold">Top text</span>
                  <textarea
                    value={memeEditor.topText}
                    onChange={(event) =>
                      updateMemeEditor({ topText: event.target.value })
                    }
                    rows={3}
                    className={`${controlClass} resize-y`}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold">Bottom text</span>
                  <textarea
                    value={memeEditor.bottomText}
                    onChange={(event) =>
                      updateMemeEditor({ bottomText: event.target.value })
                    }
                    rows={3}
                    className={`${controlClass} resize-y`}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold">
                    Image scale: {memeEditor.imageScale.toFixed(2)}×
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={memeEditor.imageScale}
                    onChange={(event) =>
                      updateMemeEditor({ imageScale: Number(event.target.value) })
                    }
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold">Top size</span>
                    <input
                      type="range"
                      min="32"
                      max="130"
                      value={memeEditor.topSize}
                      onChange={(event) =>
                        updateMemeEditor({ topSize: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold">Bottom size</span>
                    <input
                      type="range"
                      min="32"
                      max="130"
                      value={memeEditor.bottomSize}
                      onChange={(event) =>
                        updateMemeEditor({ bottomSize: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold">Top color</span>
                    <input
                      type="color"
                      value={memeEditor.topColor}
                      onChange={(event) =>
                        updateMemeEditor({ topColor: event.target.value })
                      }
                      className="h-12 w-full"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold">Bottom color</span>
                    <input
                      type="color"
                      value={memeEditor.bottomColor}
                      onChange={(event) =>
                        updateMemeEditor({ bottomColor: event.target.value })
                      }
                      className="h-12 w-full"
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}

        {inputMode !== "meme" && slides.length > 0 && (
          <section className="rounded-[32px] bg-white p-6 shadow-sm md:p-10">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-black">Carousel Editor</h2>
                <p className="mt-2 text-sm text-[#667085]">
                  Drag each title or body box directly. Drop a desktop image onto a page or its upload panel.
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

            <div className="grid gap-10">
              {slides.map((slide, index) => {
                const editor = slide.editor;
                const bgUrl = getBackgroundUrl(slide, index);

                return (
                  <article
                    key={index}
                    className="grid gap-6 rounded-[28px] border border-[#e4e7ec] bg-[#fcfcfd] p-5 lg:grid-cols-[minmax(320px,520px)_1fr]"
                  >
                    <div className="grid content-start gap-3">
                      <div
                        ref={(node) => {
                          slideRefs.current[index] = node;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleSlideDrop(event, index)}
                        className="relative aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-[#111827] shadow-xl"
                      >
                        {bgUrl ? (
                          <img
                            src={bgUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            style={{
                              transform: backgroundTransform(
                                editor.imageScale,
                                editor.imagePositionX,
                                editor.imagePositionY,
                              ),
                              transformOrigin: "center",
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[#111827] to-[#475467]" />
                        )}

                        <ImageOverlayGrid
                          scale={editor.imageScale}
                          onScaleChange={(imageScale) =>
                            updateSlideEditor(index, { imageScale })
                          }
                          onPointerDown={(event) => startBackgroundDrag(event, index)}
                          onPointerMove={moveBackgroundDrag}
                          onPointerUp={endBackgroundDrag}
                          onPointerCancel={endBackgroundDrag}
                        />

                        <div
                          className="pointer-events-none absolute inset-0 z-10 bg-black"
                          style={{ opacity: editor.overlayOpacity / 100 }}
                        />

                        <h3
                          onPointerDown={(event) => startTextDrag(event, index, "title")}
                          onPointerMove={moveTextDrag}
                          onPointerUp={endTextDrag}
                          onPointerCancel={endTextDrag}
                          className="absolute z-20 w-[86%] cursor-move select-none font-black leading-[1.08] tracking-[-0.04em]"
                          style={{
                            left: `${editor.titlePosition.x}%`,
                            top: `${editor.titlePosition.y}%`,
                            color: editor.titleColor,
                            fontFamily: editor.titleFont,
                            fontSize: `${editor.titleSize * 0.46}px`,
                            overflowWrap: "anywhere",
                            touchAction: "none",
                          }}
                        >
                          {editor.title}
                        </h3>

                        <p
                          onPointerDown={(event) => startTextDrag(event, index, "body")}
                          onPointerMove={moveTextDrag}
                          onPointerUp={endTextDrag}
                          onPointerCancel={endTextDrag}
                          className="absolute z-20 w-[86%] cursor-move select-none font-semibold leading-[1.22] tracking-[-0.02em]"
                          style={{
                            left: `${editor.bodyPosition.x}%`,
                            top: `${editor.bodyPosition.y}%`,
                            color: editor.bodyColor,
                            fontFamily: editor.bodyFont,
                            fontSize: `${editor.bodySize * 0.46}px`,
                            overflowWrap: "anywhere",
                            touchAction: "none",
                          }}
                        >
                          {editor.text}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadSlide(index)}
                        disabled={downloading}
                        className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 text-sm font-black"
                      >
                        Download Page {index + 1}
                      </button>
                    </div>

                    <div className="grid content-start gap-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black">Page {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => resetSlide(index)}
                          className="text-sm font-bold text-[#667085] underline"
                        >
                          Reset page
                        </button>
                      </div>

                      <section className="grid gap-4 rounded-2xl border border-[#e4e7ec] bg-white p-5">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#667085]">
                            Background image
                          </p>
                          <h4 className="mt-1 text-base font-black">Image box</h4>
                        </div>

                        <div
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleSlideDrop(event, index)}
                          className="rounded-2xl border-2 border-dashed border-[#98a2b3] bg-[#f9fafb] p-6 text-center"
                        >
                          <p className="font-black">Drag an image here from Finder</p>
                          <p className="mt-1 text-sm text-[#667085]">
                            Or choose a PNG, JPG, or WebP file from your desktop.
                          </p>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            onChange={(event) =>
                              void handleBackgroundFile(index, event.target.files?.[0])
                            }
                            className="mt-4 block w-full text-sm"
                          />
                          {editor.backgroundDataUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideEditor(index, { backgroundDataUrl: "" })
                              }
                              className="mt-3 text-sm font-bold text-[#d92d20] underline"
                            >
                              Restore generated background
                            </button>
                          )}
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold">
                            Image scale: {editor.imageScale.toFixed(2)}×
                          </span>
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="0.05"
                            value={editor.imageScale}
                            onChange={(event) =>
                              updateSlideEditor(index, {
                                imageScale: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold">
                            Dark overlay: {editor.overlayOpacity}%
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="90"
                            value={editor.overlayOpacity}
                            onChange={(event) =>
                              updateSlideEditor(index, {
                                overlayOpacity: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </section>

                      <section className="grid gap-4 rounded-2xl border border-[#e4e7ec] bg-white p-5">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#667085]">
                            Text box 1
                          </p>
                          <h4 className="mt-1 text-base font-black">Title text box</h4>
                          <p className="mt-1 text-xs text-[#667085]">
                            Edit here, then drag the title directly on the slide preview.
                          </p>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold">Text</span>
                          <textarea
                            value={editor.title}
                            onChange={(event) =>
                              updateSlideEditor(index, { title: event.target.value })
                            }
                            rows={3}
                            className={`${controlClass} resize-y`}
                          />
                        </label>

                        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                          <label className="grid gap-2">
                            <span className="text-sm font-bold">Font</span>
                            <select
                              value={editor.titleFont}
                              onChange={(event) =>
                                updateSlideEditor(index, { titleFont: event.target.value })
                              }
                              className={controlClass}
                            >
                              {FONT_OPTIONS.map((font) => (
                                <option key={font.label} value={font.value}>
                                  {font.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-2">
                            <span className="text-sm font-bold">Color</span>
                            <input
                              type="color"
                              value={editor.titleColor}
                              onChange={(event) =>
                                updateSlideEditor(index, { titleColor: event.target.value })
                              }
                              className="h-12 w-full rounded-xl border border-[#d0d5dd] bg-white p-1"
                            />
                          </label>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold">
                            Font size: {editor.titleSize}px
                          </span>
                          <input
                            type="range"
                            min="36"
                            max="150"
                            value={editor.titleSize}
                            onChange={(event) =>
                              updateSlideEditor(index, {
                                titleSize: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </section>

                      <section className="grid gap-4 rounded-2xl border border-[#e4e7ec] bg-white p-5">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#667085]">
                            Text box 2
                          </p>
                          <h4 className="mt-1 text-base font-black">Body text box</h4>
                          <p className="mt-1 text-xs text-[#667085]">
                            Edit here, then drag the body text independently on the preview.
                          </p>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold">Text</span>
                          <textarea
                            value={editor.text}
                            onChange={(event) =>
                              updateSlideEditor(index, { text: event.target.value })
                            }
                            rows={5}
                            className={`${controlClass} resize-y`}
                          />
                        </label>

                        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                          <label className="grid gap-2">
                            <span className="text-sm font-bold">Font</span>
                            <select
                              value={editor.bodyFont}
                              onChange={(event) =>
                                updateSlideEditor(index, { bodyFont: event.target.value })
                              }
                              className={controlClass}
                            >
                              {FONT_OPTIONS.map((font) => (
                                <option key={font.label} value={font.value}>
                                  {font.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-2">
                            <span className="text-sm font-bold">Color</span>
                            <input
                              type="color"
                              value={editor.bodyColor}
                              onChange={(event) =>
                                updateSlideEditor(index, { bodyColor: event.target.value })
                              }
                              className="h-12 w-full rounded-xl border border-[#d0d5dd] bg-white p-1"
                            />
                          </label>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-bold">
                            Font size: {editor.bodySize}px
                          </span>
                          <input
                            type="range"
                            min="24"
                            max="100"
                            value={editor.bodySize}
                            onChange={(event) =>
                              updateSlideEditor(index, {
                                bodySize: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </section>
                    </div>
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

function ImageOverlayGrid({
  scale,
  onScaleChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  scale: number;
  onScaleChange: (scale: number) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  function changeScale(amount: number) {
    onScaleChange(Number(clamp(scale + amount, 1, 3).toFixed(2)));
  }

  return (
    <div
      data-editor-only="true"
      className="absolute inset-0 z-20 cursor-grab select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={(event) => {
        event.preventDefault();
        changeScale(event.deltaY < 0 ? 0.1 : -0.1);
      }}
      style={{ touchAction: "none" }}
      title="Drag to reposition the background image. Scroll to scale."
    >
      <div className="pointer-events-none grid h-full w-full grid-cols-3 grid-rows-3">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="border border-white/20" />
        ))}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl bg-black/70 p-1 text-white shadow-lg backdrop-blur-sm">
        <button
          type="button"
          aria-label="Scale image down"
          title="Scale image down"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            changeScale(-0.1);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl font-black hover:bg-white/20"
        >
          −
        </button>
        <span className="min-w-14 text-center text-xs font-black">
          {scale.toFixed(2)}×
        </span>
        <button
          type="button"
          aria-label="Scale image up"
          title="Scale image up"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            changeScale(0.1);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl font-black hover:bg-white/20"
        >
          +
        </button>
      </div>
    </div>
  );
}
