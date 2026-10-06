// Bilder på en annons: dra in eller välj flera bilder på en gång. De beskärs automatiskt till 4:3
// och laddas upp direkt; tryck på en bild för att justera beskärningen, dra för att ändra ordning.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, Camera, Crop, ImagePlus, RotateCw, Star, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { imageUrl } from "../lib/api";
import { cn } from "../lib/cn";
import { fetchImageMeta } from "./api";
import { ImageCropper } from "./ImageCropper";
import { DEFAULT_CROP, loadImage, processImage, uploadImage, type CropState } from "./images";
import { ActionMenu, Btn, useFeedback } from "./ui";

interface Item {
  key: string;
  id?: string;
  preview?: string;
  status: "processing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  /** Originalfilen (finns kvar under sessionen för omkörning/beskärning i full upplösning) */
  file?: File;
  /** Nedskalat original som laddas upp tillsammans med bilden */
  source?: Blob;
  crop?: CropState;
}

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const PARALLEL = 2;
let keySeq = 0;
const newKey = () => `img-${Date.now()}-${keySeq++}`;

/** Enkel kö så att bara ett par bilder bearbetas/laddas upp samtidigt (sparar minne på mobilen). */
function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export function ImageManager({
  initial,
  onChange,
  onBusyChange,
}: {
  initial: string[];
  onChange: (ids: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [items, setItems] = useState<Item[]>(() =>
    initial.map((id) => ({ key: id, id, preview: imageUrl(id, "thumb"), status: "done", progress: 1 })),
  );
  const [dragOver, setDragOver] = useState(false);
  const [cropping, setCropping] = useState<{ key: string; src: string; w: number; h: number; crop: CropState | null } | null>(null);
  const limiter = useRef(createLimiter(PARALLEL));
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const update = useCallback((key: string, patch: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  // Rapportera färdiga bild-id:n och om något fortfarande laddas upp
  const lastReported = useRef<string>(JSON.stringify(initial));
  useEffect(() => {
    const ids = items.filter((i) => i.status === "done" && i.id).map((i) => i.id!);
    const key = JSON.stringify(ids);
    if (key !== lastReported.current) {
      lastReported.current = key;
      onChange(ids);
    }
    onBusyChange?.(items.some((i) => i.status === "processing" || i.status === "uploading"));
  }, [items, onChange, onBusyChange]);

  /** Bearbetar och laddar upp en bild. */
  const pipeline = useCallback(
    async (key: string, input: { file?: File; image?: HTMLImageElement; source?: Blob; crop: CropState }) => {
      update(key, { status: "processing", progress: 0, error: undefined });
      try {
        await limiter.current(async () => {
          const img = input.image ?? (await loadImage(input.file!));
          const processed = await processImage(img, input.crop, input.source);
          update(key, { preview: processed.previewUrl, status: "uploading", source: processed.source, crop: processed.crop });
          const { id } = await uploadImage(processed, (p) => update(key, { progress: p }));
          update(key, { id, status: "done", progress: 1 });
        });
      } catch (err) {
        update(key, { status: "error", error: err instanceof Error ? err.message : "Något gick fel." });
      }
    },
    [update],
  );

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => {
      if (!f.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) {
        toast(`${f.name} är ingen bild.`, "error");
        return false;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast(`${f.name} är för stor (max 40 MB).`, "error");
        return false;
      }
      return true;
    });
    if (files.length === 0) return;
    const created = files.map((file) => ({ key: newKey(), file, status: "processing" as const, progress: 0 }));
    setItems((cur) => [...cur, ...created]);
    created.forEach((it) => pipeline(it.key, { file: it.file, crop: DEFAULT_CROP }));
  }

  async function openCropper(item: Item) {
    try {
      if (item.file) {
        const img = await loadImage(item.file);
        setCropping({
          key: item.key,
          src: URL.createObjectURL(item.file),
          w: img.naturalWidth,
          h: img.naturalHeight,
          crop: item.crop ?? DEFAULT_CROP,
        });
        return;
      }
      if (!item.id) return;
      // Bild från servern: hämta det sparade originalet och tidigare beskärning
      const [meta, blob] = await Promise.all([
        fetchImageMeta(item.id).catch(() => null),
        fetch(imageUrl(item.id, "source")).then((r): Promise<Blob | null> | null => (r.ok ? r.blob() : null)),
      ]);
      const src: Blob = blob ?? (await fetch(imageUrl(item.id, "main")).then((r) => r.blob()));
      const img = await loadImage(src);
      update(item.key, { source: blob ?? undefined });
      setCropping({
        key: item.key,
        src: URL.createObjectURL(src),
        w: img.naturalWidth,
        h: img.naturalHeight,
        crop: blob && meta?.crop ? (meta.crop as unknown as CropState) : DEFAULT_CROP,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunde inte öppna bilden.", "error");
    }
  }

  async function finishCrop(crop: CropState) {
    if (!cropping) return;
    const item = items.find((i) => i.key === cropping.key);
    const src = cropping.src;
    setCropping(null);
    if (!item) return;
    try {
      const image = await loadImage(src);
      await pipeline(item.key, { image, source: item.source, crop });
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  function cancelCrop() {
    if (cropping) URL.revokeObjectURL(cropping.src);
    setCropping(null);
  }

  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));
  const move = (key: string, to: number) =>
    setItems((list) => {
      const from = list.findIndex((i) => i.key === key);
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });

  /* ---------------- Dra för att ändra ordning (mus och pek) ---------------- */
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const drag = useRef<{
    key: string;
    pointerId: number;
    startX: number;
    startY: number;
    grabX: number;
    grabY: number;
    slots: DOMRect[];
    active: boolean;
    timer?: number;
  } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  // FLIP-animation: övriga bilder glider mjukt till sina nya platser
  const snapshot = () => {
    prevRects.current = new Map([...tileRefs.current].map(([k, el]) => [k, el.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    const prev = prevRects.current;
    if (prev.size === 0) return;
    for (const [k, el] of tileRefs.current) {
      const before = prev.get(k);
      if (!before || k === dragKey) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (!dx && !dy) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 320ms cubic-bezier(.32,.72,0,1)";
        el.style.transform = "";
      });
    }
    prevRects.current = new Map();
  }, [items, dragKey]);

  // Stoppa sidans scroll på pekskärm medan en bild dras
  useEffect(() => {
    if (!dragKey) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [dragKey]);

  function startDrag() {
    const d = drag.current;
    if (!d) return;
    d.active = true;
    d.slots = items.map((i) => tileRefs.current.get(i.key)!.getBoundingClientRect());
    setDragKey(d.key);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function onTilePointerDown(e: ReactPointerEvent, item: Item) {
    if ((e.target as HTMLElement).closest("button") || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = {
      key: item.key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      slots: [],
      active: false,
    };
    // På pekskärm: håll kvar fingret en kort stund för att börja dra (som på hemskärmen i iOS)
    if (e.pointerType === "touch" && items.length > 1) drag.current.timer = window.setTimeout(startDrag, 280);
  }

  function onTilePointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (e.pointerType === "touch") {
        if (moved > 10) {
          clearTimeout(d.timer);
          drag.current = null; // användaren scrollar
        }
        return;
      }
      if (moved < 6 || items.length < 2) return;
      startDrag();
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const cur = items.findIndex((i) => i.key === d.key);
    const slot = d.slots[cur];
    setDragPos({ x: e.clientX - d.grabX - slot.left, y: e.clientY - d.grabY - slot.top });
    // Vilken plats är pekaren över?
    let target = cur;
    let best = Infinity;
    d.slots.forEach((r, i) => {
      const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (dist < best) {
        best = dist;
        target = i;
      }
    });
    if (target !== cur) {
      snapshot();
      move(d.key, target);
      const nextSlot = d.slots[target];
      setDragPos({ x: e.clientX - d.grabX - nextSlot.left, y: e.clientY - d.grabY - nextSlot.top });
    }
  }

  function onTilePointerUp(item: Item) {
    const d = drag.current;
    if (d) clearTimeout(d.timer);
    const wasDragging = d?.active;
    drag.current = null;
    if (wasDragging) {
      snapshot();
      setDragKey(null);
      setDragPos({ x: 0, y: 0 });
      return;
    }
    // Vanligt tryck: öppna beskärning
    if (d && item.status === "done") openCropper(item);
  }

  const busy = items.filter((i) => i.status === "processing" || i.status === "uploading").length;

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
      className={cn("rounded-[18px] transition", dragOver && "bg-ios-blue/5 ring-2 ring-ios-blue")}
    >
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))} />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))}
      />

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-ios-separator bg-ios-fill2/60 px-6 py-12 text-center transition hover:border-ios-blue hover:bg-ios-blue/5"
        >
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-ios-blue shadow-ios-card">
            <ImagePlus size={26} />
          </span>
          <span className="text-[17px] font-semibold text-ios-label">Lägg till bilder</span>
          <span className="mt-1 text-[14px] text-ios-secondary">Dra in bilder hit eller klicka för att välja – flera åt gången går bra</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => {
            const dragging = dragKey === item.key;
            return (
              <div
                key={item.key}
                ref={(el) => {
                  if (el) tileRefs.current.set(item.key, el);
                  else tileRefs.current.delete(item.key);
                }}
                onPointerDown={(e) => onTilePointerDown(e, item)}
                onPointerMove={onTilePointerMove}
                onPointerUp={() => onTilePointerUp(item)}
                onPointerCancel={() => {
                  if (drag.current) clearTimeout(drag.current.timer);
                  drag.current = null;
                  setDragKey(null);
                }}
                onContextMenu={(e) => dragKey && e.preventDefault()}
                style={dragging ? { transform: `translate(${dragPos.x}px, ${dragPos.y}px) scale(1.05)`, zIndex: 20 } : undefined}
                className={cn(
                  "group relative aspect-[4/3] cursor-pointer select-none overflow-hidden rounded-[14px] bg-ios-fill [-webkit-touch-callout:none]",
                  dragging ? "cursor-grabbing shadow-ios-lift" : "shadow-ios-card",
                )}
              >
                {item.preview ? (
                  <img src={item.preview} alt={`Bild ${index + 1}`} draggable={false} className="pointer-events-none h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full animate-ios-pulse bg-ios-fill" />
                )}

                {index === 0 && item.status !== "error" && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                    <Star size={11} className="fill-current" /> Omslag
                  </span>
                )}

                {(item.status === "processing" || item.status === "uploading") && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/55 backdrop-blur-[2px]">
                    <ProgressRing value={item.status === "processing" ? null : item.progress} />
                    <span className="text-[12px] font-medium text-ios-label">{item.status === "processing" ? "Förbereder…" : "Laddar upp…"}</span>
                  </div>
                )}

                {item.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-3 text-center">
                    <AlertCircle size={22} className="text-ios-red" />
                    <span className="line-clamp-2 text-[12px] text-ios-secondary">{item.error}</span>
                    <div className="flex gap-1.5">
                      {item.file && (
                        <Btn size="sm" variant="tinted" icon={<RotateCw size={13} />} onClick={() => pipeline(item.key, { file: item.file, crop: item.crop ?? DEFAULT_CROP })}>
                          Försök igen
                        </Btn>
                      )}
                      <Btn size="sm" variant="destructive" onClick={() => remove(item.key)}>
                        Ta bort
                      </Btn>
                    </div>
                  </div>
                )}

                {item.status === "done" && (
                  <>
                    <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                      <Crop size={11} /> Beskär
                    </span>
                    <div className="absolute bottom-1.5 right-1.5 rounded-full bg-white/90 shadow-sm backdrop-blur">
                      <ActionMenu
                        items={[
                          { label: "Beskär", icon: <Crop size={16} />, onClick: () => openCropper(item) },
                          { label: "Gör till omslagsbild", icon: <Star size={16} />, onClick: () => move(item.key, 0), hidden: index === 0 },
                          { label: "Flytta åt vänster", icon: <ArrowLeft size={16} />, onClick: () => move(item.key, index - 1), hidden: index === 0 },
                          { label: "Flytta åt höger", icon: <ArrowRight size={16} />, onClick: () => move(item.key, index + 1), hidden: index === items.length - 1 },
                          { label: "Ta bort", icon: <Trash2 size={16} />, onClick: () => remove(item.key), destructive: true },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-ios-separator text-ios-blue transition hover:border-ios-blue hover:bg-ios-blue/5"
          >
            <ImagePlus size={24} />
            <span className="text-[13px] font-medium">Lägg till</span>
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[12px] leading-relaxed text-ios-tertiary">
          {busy > 0
            ? `Laddar upp ${busy} ${busy === 1 ? "bild" : "bilder"} …`
            : items.length > 0
              ? "Tryck på en bild för att beskära. Dra för att ändra ordning – första bilden är omslagsbild."
              : "Bilderna beskärs automatiskt till 4:3 och kan justeras efteråt."}
        </p>
        <Btn size="sm" variant="tinted" icon={<Camera size={14} />} className="sm:hidden" onClick={() => cameraInput.current?.click()}>
          Ta foto
        </Btn>
      </div>

      {cropping && (
        <ImageCropper src={cropping.src} width={cropping.w} height={cropping.h} initial={cropping.crop} onCancel={cancelCrop} onDone={finishCrop} />
      )}
    </div>
  );
}

function ProgressRing({ value }: { value: number | null }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className={cn(value == null && "animate-spin")}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(0,0,0,.1)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="#0071E3"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={value == null ? c * 0.7 : c * (1 - value)}
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dashoffset .2s" }}
      />
    </svg>
  );
}
