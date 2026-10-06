import { Link } from "@tanstack/react-router";
import { Fuel, Gauge, Heart, ShieldCheck } from "lucide-react";
import { currentPrice, isEnded } from "../lib/auction";
import { cn } from "../lib/cn";
import { formatKm, formatPrice } from "../lib/format";
import type { Car } from "../lib/types";
import { useWatch } from "../lib/watchlist";
import { Badge } from "./Badge";
import { CarIllustration } from "./CarIllustration";
import { Countdown } from "./Countdown";

export function CarCard({ car }: { car: Car }) {
  const [watched, toggleWatch] = useWatch(car.id);
  const ended = isEnded(car, Date.now());
  const price = currentPrice(car);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-shadow hover:shadow-lifted">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          toggleWatch();
        }}
        aria-label={watched ? "Ta bort bevakning" : "Bevaka bil"}
        aria-pressed={watched}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-soft"
      >
        <Heart size={17} className={cn(watched ? "fill-blue-500 text-blue-500" : "text-graphite-400")} />
      </button>

      <Link to="/auktion/$id" params={{ id: car.id }} className="block">
        <div className="bg-graphite-100 px-6 pt-6">
          <CarIllustration colorHex={car.colorHex} bodyType={car.bodyType} className="mx-auto h-32 w-full" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg font-bold leading-tight text-graphite-900">{car.title}</h3>
          </div>
          {car.inspected && (
            <Badge variant="dark" icon={<ShieldCheck size={13} />}>
              Verkstadsbesiktigad
            </Badge>
          )}
          <p className="text-sm leading-snug text-graphite-600">{car.highlight}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-graphite-500">
            <span className="flex items-center gap-1">
              <Gauge size={14} /> {formatKm(car.mileageKm)}
            </span>
            <span className="flex items-center gap-1">
              <Fuel size={14} /> {car.fuel}
            </span>
            <span>{car.gearbox}</span>
          </div>
          <div className="mt-1 flex items-end justify-between border-t border-graphite-100 pt-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-graphite-400">
                {car.status === "sold" ? "Såldes för" : "Högsta bud"}
              </p>
              <p className="font-display text-xl font-extrabold text-graphite-900">{formatPrice(price)}</p>
            </div>
            {ended ? (
              <Badge variant="muted">Avslutad</Badge>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Countdown endsAt={car.endsAt} compact />
                {car.extended && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                    Förlängd
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
