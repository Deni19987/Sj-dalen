// Beskärningsverktyg i stil med Bilder-appen: dra för att flytta, nyp/scrolla för att zooma,
// räta upp med reglaget och rotera i 90°-steg. Ramen är alltid 4:3 och alltid helt täckt av bilden.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "../lib/cn";
import { ASPECT, clampCrop, coverScale, DEFAULT_CROP, MAX_ZOOM, radians, type CropState } from "./images";

interface Props {
  src: string;
  width: number;
  height: number;
  initial?: CropState | null;
  onCancel: () => void;
  onDone: (crop: CropState) => void;
}

const PAD = 28;

export function ImageCropper({ src, width: iw, height: ih, initial, onCancel, onDone }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [crop, setCropRaw] = useState<CropState>(() => clampCrop(initial ?? DEFAULT_CROP, iw, ih));
  const [interacting, setInteracting] = useState(false);
  const [animate, setAnimate] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);

  const setCrop = useCallback(
    (fn: (c: CropState) => CropState, withAnimation = false) => {
      setAnimate(withAnimation);
      setCropRaw((c) => clampCrop(fn(c), iw, ih));
    },
    [iw, ih],
  );

  useLayoutEffect(() => {
    const el = stageRef.current!;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ramens storlek i skärmpixlar
  const availW = Math.max(0, stage.w - PAD * 2);
  const availH = Math.max(0, stage.h - PAD * 2);
  const W = Math.min(availW, availH * ASPECT);
  const H = W / ASPECT;
  const theta = radians(crop);
  const k = W > 0 ? coverScale(iw, ih, W, H, theta).k0 * crop.zoom : 0;

  /** Zooma med en fast punkt (relativt ramens mitt, i px) som stannar under fingret/pekaren. */
  const zoomAt = useCallback(
    (factor: number, px = 0, py = 0) => {
      if (!W) return;
      setCrop((c) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom * factor));
        const r = zoom / c.zoom;
        const ox = c.x * W;
        const oy = c.y * H;
        return { ...c, zoom, x: (px - (px - ox) * r) / W, y: (py - (py - oy) * r) / H };
      });
    },
    [W, H, setCrop],
  );

  const pan = useCallback(
    (dx: number, dy: number) => W && setCrop((c) => ({ ...c, x: c.x + dx / W, y: c.y + dy / H })),
    [W, H, setCrop],
  );

  // Scroll/nyp på styrplatta (måste vara icke-passiv för att kunna stoppa sidans scroll)
  useEffect(() => {
    const el = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const speed = e.ctrlKey ? 0.012 : 0.002;
      zoomAt(Math.exp(-e.deltaY * speed), px, py);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Tangentbord
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") {
        if (e.key === "Escape") onCancel();
        return;
      }
      const step = e.shiftKey ? 20 : 5;
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onDone(crop);
      else if (e.key === "ArrowLeft") pan(step, 0);
      else if (e.key === "ArrowRight") pan(-step, 0);
      else if (e.key === "ArrowUp") pan(0, step);
      else if (e.key === "ArrowDown") pan(0, -step);
      else if (e.key === "+" || e.key === "=") zoomAt(1.1);
      else if (e.key === "-") zoomAt(1 / 1.1);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [crop, onCancel, onDone, pan, zoomAt]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
    setInteracting(true);
  }

  function onPointerMove(e: ReactPointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    const pts = [...pointers.current.values()];

    if (pts.length === 1) {
      pan(next.x - prev.x, next.y - prev.y);
      return;
    }
    // Två fingrar: nyp för att zooma, flytta mittpunkten för att panorera
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const g = gesture.current;
    if (g && g.dist > 0) {
      const rect = stageRef.current!.getBoundingClientRect();
      pan(mid.x - g.mid.x, mid.y - g.mid.y);
      zoomAt(dist / g.dist, mid.x - rect.left - rect.width / 2, mid.y - rect.top - rect.height / 2);
    }
    gesture.current = { dist, mid };
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    if (pointers.current.size === 0) setInteracting(false);
  }

  const rotateLeft = () => setCrop((c) => ({ ...c, quarter: (c.quarter + 3) % 4, x: 0, y: 0 }), true);
  const reset = () => setCrop(() => DEFAULT_CROP, true);
  const changed = crop.zoom !== 1 || crop.angle !== 0 || crop.quarter !== 0 || Math.abs(crop.x) > 1e-4 || Math.abs(crop.y) > 1e-4;

  return createPortal(
    <div className="fixed inset-0 z-[75] flex animate-ios-fade flex-col bg-black font-apple text-white" role="dialog" aria-modal="true" aria-label="Beskär bild">
      {/* Övre rad */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-[17px] text-white/90 hover:bg-white/10">
          Avbryt
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold">Beskär</p>
          <p className="text-[12px] text-white/50">4:3 · samma format som på webbplatsen</p>
        </div>
        <button type="button" onClick={() => onDone(crop)} className="rounded-full bg-[#ffd60a] px-4 py-1.5 text-[17px] font-semibold text-black hover:bg-[#ffe03d]">
          Klar
        </button>
      </div>

      {/* Bildytan */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const rect = stageRef.current!.getBoundingClientRect();
          if (crop.zoom > 1.01) setCrop((c) => ({ ...c, zoom: 1 }), true);
          else {
            setAnimate(true);
            zoomAt(2, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
          }
        }}
      >
        {W > 0 && (
          <>
            <img
              src={src}
              alt=""
              draggable={false}
              className={cn("pointer-events-none absolute left-1/2 top-1/2 max-w-none origin-center", animate && "transition-transform duration-300 ease-ios")}
              style={{
                width: iw,
                height: ih,
                transform: `translate(-50%, -50%) translate(${crop.x * W}px, ${crop.y * H}px) rotate(${theta}rad) scale(${k})`,
              }}
            />
            {/* Ramen: allt utanför tonas ned */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: W, height: H, boxShadow: "0 0 0 9999px rgba(0,0,0,.62)" }}
            >
              <div className="absolute inset-0 border border-white/90" />
              {/* Hörn */}
              {["left-0 top-0 border-l-[3px] border-t-[3px]", "right-0 top-0 border-r-[3px] border-t-[3px]", "bottom-0 left-0 border-b-[3px] border-l-[3px]", "bottom-0 right-0 border-b-[3px] border-r-[3px]"].map((c) => (
                <span key={c} className={cn("absolute -m-[3px] h-5 w-5 border-white", c)} />
              ))}
              {/* Tredjedelslinjer när man drar */}
              <div className={cn("absolute inset-0 transition-opacity duration-200", interacting || crop.angle !== 0 ? "opacity-100" : "opacity-0")}>
                {[1, 2].map((i) => (
                  <span key={`v${i}`} className="absolute bottom-0 top-0 w-px bg-white/45" style={{ left: `${(i * 100) / 3}%` }} />
                ))}
                {[1, 2].map((i) => (
                  <span key={`h${i}`} className="absolute left-0 right-0 h-px bg-white/45" style={{ top: `${(i * 100) / 3}%` }} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reglage */}
      <div className="space-y-4 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-md">
          <div className="mb-1 flex items-center justify-between text-[12px] text-white/60">
            <span>Räta upp</span>
            <button type="button" className="tabular-nums text-[#ffd60a]" onClick={() => setCrop((c) => ({ ...c, angle: 0 }), true)}>
              {crop.angle === 0 ? "0°" : `${crop.angle > 0 ? "+" : ""}${crop.angle.toFixed(1).replace(".", ",")}°`}
            </button>
          </div>
          <input
            type="range"
            min={-15}
            max={15}
            step={0.1}
            value={crop.angle}
            aria-label="Räta upp"
            onPointerDown={() => setInteracting(true)}
            onPointerUp={() => setInteracting(false)}
            onChange={(e) => setCrop((c) => ({ ...c, angle: Number(e.target.value) }))}
            onDoubleClick={() => setCrop((c) => ({ ...c, angle: 0 }), true)}
            className="w-full accent-[#ffd60a]"
          />
        </div>
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button type="button" aria-label="Zooma ut" onClick={() => zoomAt(1 / 1.25)} className="rounded-full p-1.5 text-white/70 hover:bg-white/10">
            <Minus size={18} />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            aria-label="Zoom"
            onChange={(e) => {
              const z = Number(e.target.value);
              zoomAt(z / crop.zoom);
            }}
            className="flex-1 accent-white"
          />
          <button type="button" aria-label="Zooma in" onClick={() => zoomAt(1.25)} className="rounded-full p-1.5 text-white/70 hover:bg-white/10">
            <Plus size={18} />
          </button>
        </div>
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button type="button" onClick={rotateLeft} className="flex items-center gap-2 rounded-full px-3 py-2 text-[15px] text-white/90 hover:bg-white/10">
            <RotateCcw size={18} /> Rotera
          </button>
          <p className="hidden whitespace-nowrap text-[12px] text-white/40 md:block">Dra för att flytta · nyp eller scrolla för att zooma</p>
          <button
            type="button"
            onClick={reset}
            disabled={!changed}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-[15px] text-[#ffd60a] hover:bg-white/10 disabled:text-white/30"
          >
            <Undo2 size={18} /> Återställ
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
