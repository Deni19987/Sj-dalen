import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { imageUrl } from "../lib/api";
import { cn } from "../lib/cn";
import type { Car } from "../lib/types";
import { CarIllustration } from "./CarIllustration";

/** Omslagsbild för bilkort (4:3). Visar illustrationen om bilen saknar foton. */
export function CarCover({ car, className }: { car: Car; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const cover = car.images[0];
  if (!cover)
    return (
      <div className={cn("bg-graphite-100 px-6 pt-6", className)}>
        <CarIllustration colorHex={car.colorHex} bodyType={car.bodyType} className="mx-auto h-32 w-full" />
      </div>
    );
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden bg-graphite-100", className)}>
      <img
        src={imageUrl(cover, "thumb")}
        alt={car.title}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-[1.03]",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/** Bildgalleri på bilsidan: stor bild, miniatyrer, svep på mobil och helskärmsläge. */
export function CarGallery({ car, badge }: { car: Car; badge?: ReactNode }) {
  const images = car.images;
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = images.length;

  const go = useCallback((dir: number) => setIndex((i) => (i + dir + count) % count), [count]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen, go]);

  // Förladda nästa bild så att bläddring känns direkt
  useEffect(() => {
    if (count > 1) new Image().src = imageUrl(images[(index + 1) % count]);
  }, [index, images, count]);

  if (count === 0)
    return (
      <div className="relative rounded-3xl bg-graphite-100 p-10">
        <CarIllustration colorHex={car.colorHex} bodyType={car.bodyType} className="w-full" />
        {badge}
      </div>
    );

  const swipe = {
    onTouchStart: (e: TouchEvent) => (touchX.current = e.touches[0].clientX),
    onTouchEnd: (e: TouchEvent) => {
      if (touchX.current == null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      touchX.current = null;
    },
  };

  const arrows = count > 1 && (
    <>
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Föregående bild"
        className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-graphite-900 shadow-soft backdrop-blur transition hover:bg-white"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Nästa bild"
        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-graphite-900 shadow-soft backdrop-blur transition hover:bg-white"
      >
        <ChevronRight size={20} />
      </button>
    </>
  );

  return (
    <div>
      <div className="group relative aspect-[4/3] overflow-hidden rounded-3xl bg-graphite-100" {...swipe}>
        {images.map((id, i) => (
          <img
            key={id}
            src={imageUrl(id)}
            alt={`${car.title} – bild ${i + 1} av ${count}`}
            loading={i === 0 ? "eager" : "lazy"}
            className={cn(
              "absolute inset-0 h-full w-full cursor-zoom-in object-cover transition-opacity duration-500",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={() => setFullscreen(true)}
          />
        ))}
        {badge}
        {arrows}
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="Visa i helskärm"
          className="absolute bottom-3 right-3 flex h-9 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur"
        >
          <Expand size={14} /> {index + 1} / {count}
        </button>
      </div>

      {count > 1 && (
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto p-1">
          {images.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Visa bild ${i + 1}`}
              className={cn(
                "aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-graphite-50 transition sm:w-24",
                i === index ? "ring-blue-500" : "opacity-70 ring-transparent hover:opacity-100",
              )}
            >
              <img src={imageUrl(id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label={car.title}
          onClick={() => setFullscreen(false)}
          {...swipe}
        >
          <img
            src={imageUrl(images[index])}
            alt={car.title}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Stäng"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
          >
            <X size={22} />
          </button>
          {count > 1 && (
            <div onClick={(e) => e.stopPropagation()}>
              {arrows}
              <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-sm font-semibold text-white/80">
                {index + 1} / {count}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
