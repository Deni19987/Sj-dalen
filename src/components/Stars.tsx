import { Star } from "lucide-react";

export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} av 5 stjärnor`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={
            n <= Math.round(rating) ? "fill-blue-500 text-blue-500" : "fill-graphite-200 text-graphite-200"
          }
        />
      ))}
    </div>
  );
}
