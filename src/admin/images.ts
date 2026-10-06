// Bildbehandling i webbläsaren: beskärning till 4:3, nedskalning med bra kvalitet och uppladdning.
// Allt görs lokalt innan uppladdning så att servern bara tar emot färdiga, lagom stora JPEG-filer.

import { authToken } from "./api";

/** Alla bilbilder beskärs till 4:3 så att korten och galleriet ser enhetliga ut. */
export const ASPECT = 4 / 3;
const MAIN = { w: 1600, h: 1200 };
const THUMB = { w: 800, h: 600 };
/** Originalet sparas nedskalat så att bilden kan beskäras om senare. */
const SOURCE_MAX = 2400;
const QUALITY = 0.86;

export interface CropState {
  /** Kvartsvarv medurs (0–3) */
  quarter: number;
  /** Upprätning i grader (−15 … 15) */
  angle: number;
  /** 1 = bilden täcker precis ramen */
  zoom: number;
  /** Bildens mittpunkt relativt ramens mitt, i andelar av ramens bredd/höjd */
  x: number;
  y: number;
}

export const DEFAULT_CROP: CropState = { quarter: 0, angle: 0, zoom: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

const dims = (img: ImageSource) =>
  img instanceof HTMLImageElement ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height };

/** Läser in en bildfil eller URL. Moderna webbläsare roterar enligt EXIF automatiskt. */
export async function loadImage(src: File | Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const img = new Image();
  img.decoding = "async";
  if (typeof src === "string") img.crossOrigin = "anonymous";
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error("Bilden kunde inte läsas. Prova att spara den som JPEG först.");
  } finally {
    if (typeof src !== "string") setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!img.naturalWidth) throw new Error("Bilden kunde inte läsas.");
  return img;
}

/* ------------------------------------------------------------------ */
/* Geometri                                                             */
/* ------------------------------------------------------------------ */

export function radians(c: CropState) {
  return ((c.quarter * 90 + c.angle) * Math.PI) / 180;
}

/** Skala (bildpixel → rampixel) som behövs för att bilden ska täcka ramen helt. */
export function coverScale(iw: number, ih: number, W: number, H: number, theta: number) {
  const cos = Math.abs(Math.cos(theta));
  const sin = Math.abs(Math.sin(theta));
  const bw = W * cos + H * sin;
  const bh = W * sin + H * cos;
  return { k0: Math.max(bw / iw, bh / ih), bw, bh };
}

/** Begränsar zoom och förflyttning så att ramen alltid är helt täckt av bilden. */
export function clampCrop(c: CropState, iw: number, ih: number, W = ASPECT, H = 1): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
  const theta = radians(c);
  const { k0, bw, bh } = coverScale(iw, ih, W, H, theta);
  const k = k0 * zoom;
  const ox = c.x * W;
  const oy = c.y * H;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Till bildens lokala koordinater
  let lx = ox * cos + oy * sin;
  let ly = -ox * sin + oy * cos;
  const mx = Math.max(0, (iw * k - bw) / 2);
  const my = Math.max(0, (ih * k - bh) / 2);
  lx = Math.min(mx, Math.max(-mx, lx));
  ly = Math.min(my, Math.max(-my, ly));
  // Tillbaka till ramens koordinater
  return { ...c, zoom, x: (lx * cos - ly * sin) / W, y: (lx * sin + ly * cos) / H };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Webbläsaren kunde inte bearbeta bilden.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Halverar bilden stegvis tills skalan är rimlig – ger skarpare resultat än en stor nedskalning. */
function stepDown(img: ImageSource, scale: number): { src: ImageSource; factor: number } {
  let src = img;
  let factor = 1;
  let { w, h } = dims(img);
  while (scale / factor < 0.5 && w > 2 && h > 2) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const c = canvas(w, h);
    ctx2d(c).drawImage(src, 0, 0, w, h);
    src = c;
    factor /= 2;
  }
  return { src, factor };
}

export function renderCrop(img: ImageSource, crop: CropState, outW: number, outH: number) {
  const { w: iw, h: ih } = dims(img);
  const c = clampCrop(crop, iw, ih);
  const theta = radians(c);
  const W = ASPECT;
  const f = outW / W; // rampixel → utdatapixel
  const k = coverScale(iw, ih, W, 1, theta).k0 * c.zoom;
  const { src, factor } = stepDown(img, k * f);
  const { w: sw, h: sh } = dims(src);

  const out = canvas(outW, outH);
  const ctx = ctx2d(out);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.translate(outW / 2 + c.x * W * f, outH / 2 + c.y * f);
  ctx.rotate(theta);
  ctx.scale((k * f) / factor, (k * f) / factor);
  ctx.drawImage(src, -sw / 2, -sh / 2);
  return out;
}

function resize(img: ImageSource, maxSide: number) {
  const { w, h } = dims(img);
  const s = Math.min(1, maxSide / Math.max(w, h));
  const out = canvas(w * s, h * s);
  ctx2d(out).drawImage(stepDown(img, s).src, 0, 0, out.width, out.height);
  return out;
}

const toBlob = (c: HTMLCanvasElement, quality = QUALITY) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Kunde inte spara bilden."))), "image/jpeg", quality),
  );

export interface ProcessedImage {
  main: Blob;
  thumb: Blob;
  source: Blob;
  crop: CropState;
  previewUrl: string;
}

/** Skapar huvudbild (1600×1200), miniatyr (800×600) och ett nedskalat original. */
export async function processImage(
  img: ImageSource,
  crop: CropState,
  existingSource?: Blob,
): Promise<ProcessedImage> {
  const main = renderCrop(img, crop, MAIN.w, MAIN.h);
  const thumbCanvas = canvas(THUMB.w, THUMB.h);
  ctx2d(thumbCanvas).drawImage(main, 0, 0, THUMB.w, THUMB.h);
  const [mainBlob, thumbBlob, source] = await Promise.all([
    toBlob(main),
    toBlob(thumbCanvas, 0.82),
    existingSource ? Promise.resolve(existingSource) : toBlob(resize(img, SOURCE_MAX), 0.88),
  ]);
  const { w, h } = dims(img);
  return {
    main: mainBlob,
    thumb: thumbBlob,
    source,
    crop: clampCrop(crop, w, h),
    previewUrl: URL.createObjectURL(thumbBlob),
  };
}

/* ------------------------------------------------------------------ */
/* Uppladdning                                                          */
/* ------------------------------------------------------------------ */

/** Laddar upp med XHR för att kunna visa förlopp. */
export function uploadImage(p: ProcessedImage, onProgress: (fraction: number) => void): Promise<{ id: string }> {
  const form = new FormData();
  form.append("main", p.main, "main.jpg");
  form.append("thumb", p.thumb, "thumb.jpg");
  form.append("source", p.source, "source.jpg");
  form.append("width", String(MAIN.w));
  form.append("height", String(MAIN.h));
  form.append("crop", JSON.stringify(p.crop));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/images");
    const token = authToken();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* tomt svar */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.id) resolve(data);
      else reject(new Error(data?.error ?? "Uppladdningen misslyckades."));
    };
    xhr.onerror = () => reject(new Error("Ingen anslutning. Kontrollera nätet och försök igen."));
    xhr.send(form);
  });
}
