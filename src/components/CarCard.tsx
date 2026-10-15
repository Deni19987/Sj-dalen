import { Link } from "@tanstack/react-router";
import { Calendar, Fuel, Gauge, Heart, Route, Settings2, ShieldCheck, type LucideIcon } from "lucide-react";
import { currentPrice, isEnded } from "../lib/auction";
import { cn } from "../lib/cn";
import { formatKm, formatPrice } from "../lib/format";
import type { Car } from "../lib/types";
import { carName, carSubtitle } from "../lib/vehicle";
import { useWatch } from "../lib/watchlist";
import { Badge } from "./Badge";
import { CarCover } from "./CarGallery";
import { Countdown } from "./Countdown";

/** De fyra viktigaste fakta för kortet, i prioritetsordning. Det som saknas hoppas över. */
function cardSpecs(car: Car): { icon: LucideIcon; label: string; value: string }[] {
  const all = [
    { icon: Calendar, label: "Årsmodell", value: car.year > 0 ? String(car.year) : "" },
    { icon: Gauge, label: "Mätarställning", value: Number.isFinite(car.mileageKm) ? formatKm(car.mileageKm) : "" },
    { icon: Settings2, label: "Växellåda", value: car.gearbox },
    { icon: Route, label: "Drivning", value: car.drive ?? "" },
    { icon: Fuel, label: "Bränsle", value: car.fuel },
  ];
  return all.filter((s) => s.value).slice(0, 4);
}

export function CarCard({ car }: { car: Car }) {
  const [watched, toggleWatch] = useWatch(car.id);
  const ended = isEnded(car, Date.now());
  const price = currentPrice(car);
  // Rubriken på kortet är bara bilens namn; motor och utförande på raden under.
  const name = carName(car);
  const sub = carSubtitle(car);
  const specs = cardSpecs(car);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-shadow hover:shadow-lifted">
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

      <Link to="/auktion/$id" params={{ id: car.id }} className="flex flex-1 flex-col">
        <div className="relative">
          <CarCover car={car} />
          {car.inspected && (
            <Badge variant="dark" icon={<ShieldCheck size={12} />} className="absolute bottom-3 left-3 shadow-soft">
              Verkstadsbesiktigad
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="truncate font-display text-lg font-bold leading-tight text-graphite-900" title={name}>
            {name}
          </h3>
          <p className="mt-0.5 h-5 truncate text-sm text-graphite-500">{sub}</p>

          {specs.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {specs.map((s) => (
                <div key={s.label} className="flex min-w-0 items-center gap-2 text-sm text-graphite-700">
                  <s.icon size={15} className="shrink-0 text-blue-500" aria-hidden />
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="truncate">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Skjuter ner prisraden så att alla kort i en rad blir lika höga. */}
          <div className="min-h-4 flex-1" />
          <div className="flex items-end justify-between border-t border-graphite-100 pt-3">
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
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Förlängd</span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
