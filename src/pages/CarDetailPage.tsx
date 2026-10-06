import { useState, type FormEvent } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  Calendar,
  ChevronLeft,
  CircleCheck,
  Fuel,
  Gauge,
  Gavel,
  Heart,
  Info,
  Palette,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { CarIllustration } from "../components/CarIllustration";
import { Countdown } from "../components/Countdown";
import { bidsNewestFirst, currentPrice, isEnded, minNextBid } from "../lib/auction";
import { cn } from "../lib/cn";
import { formatKm, formatPrice, timeAgo } from "../lib/format";
import { useCars, usePlaceBid } from "../lib/queries";
import type { BidResult, Car } from "../lib/types";
import { useWatch } from "../lib/watchlist";

const route = getRouteApi("/auktion/$id");
const INPUT = "rounded-lg border border-graphite-200 px-3 py-2.5 outline-none focus:border-blue-500";

function BidForm({ car }: { car: Car }) {
  const placeBid = usePlaceBid();
  const min = minNextBid(car);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(String(min));
  const [result, setResult] = useState<BidResult | null>(null);

  if (isEnded(car, Date.now())) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!name.trim()) return setResult({ ok: false, message: "Ange ditt namn." });
    if (!Number.isFinite(value)) return setResult({ ok: false, message: "Ange ett giltigt belopp." });
    placeBid.mutate(
      { carId: car.id, name: name.trim(), amount: value },
      {
        onSuccess: (r) => {
          setResult(r);
          if (r.ok) setAmount(String(value + car.minIncrement));
        },
        onError: (err) => setResult({ ok: false, message: err.message }),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl bg-graphite-50 p-5">
      <p className="mb-3 text-sm text-graphite-500">
        Minsta nästa bud: <span className="font-bold text-graphite-900">{formatPrice(min)}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ditt namn"
          className={cn(INPUT, "sm:col-span-1")}
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={min}
          className={cn("w-32", INPUT)}
        />
        <Button type="submit" disabled={placeBid.isPending}>
          <Gavel size={16} /> Lägg bud
        </Button>
      </div>
      {result && (
        <p className={`mt-3 text-sm font-semibold ${result.ok ? "text-blue-600" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}

function BidHistory({ car }: { car: Car }) {
  const bids = bidsNewestFirst(car);
  if (bids.length === 0)
    return <p className="text-sm text-graphite-400">Inga bud ännu – bli den första att lägga ett.</p>;
  return (
    <ul className="space-y-3">
      {bids.map((bid, i) => (
        <li key={bid.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-graphite-100 text-graphite-500">
              <Gavel size={14} />
            </span>
            <span className={i === 0 ? "font-semibold text-graphite-900" : "text-graphite-600"}>{bid.name}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className={i === 0 ? "font-bold text-blue-600" : "text-graphite-500"}>
              {formatPrice(bid.amount)}
            </span>
            <span className="text-xs text-graphite-400">{timeAgo(bid.at)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CarDetailPage() {
  const { id } = route.useParams();
  const { data: cars, isLoading } = useCars({ live: true });
  const car = cars?.find((c) => c.id === id);
  const [watched, toggleWatch] = useWatch(id);

  if (isLoading) return <div className="min-h-[60vh]" />;

  if (!car)
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-extrabold text-graphite-900">Bilen hittades inte</h1>
        <p className="mt-2 text-graphite-500">Den kan vara såld eller borttagen.</p>
        <Link to="/auktion" className="mt-6 inline-flex items-center gap-1 font-semibold text-blue-600">
          <ChevronLeft size={16} /> Till alla bilar
        </Link>
      </div>
    );

  const ended = isEnded(car, Date.now());
  const price = currentPrice(car);
  const specs = [
    { icon: Calendar, label: "Årsmodell", value: String(car.year) },
    { icon: Gauge, label: "Mätarställning", value: formatKm(car.mileageKm) },
    { icon: Fuel, label: "Bränsle", value: car.fuel },
    { icon: Settings2, label: "Växellåda", value: car.gearbox },
    { icon: Palette, label: "Färg", value: car.colorName },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        to="/auktion"
        className="inline-flex items-center gap-1 text-sm font-semibold text-graphite-500 hover:text-graphite-900"
      >
        <ChevronLeft size={16} /> Till alla bilar
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="relative rounded-3xl bg-graphite-100 p-10">
            <CarIllustration colorHex={car.colorHex} bodyType={car.bodyType} className="w-full" />
            {car.status === "sold" && (
              <span className="absolute left-6 top-6 rounded-full bg-graphite-900 px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-white">
                Såld
              </span>
            )}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {specs.map((s) => (
              <div key={s.label} className="rounded-xl bg-white p-4 shadow-card">
                <s.icon size={16} className="text-blue-500" />
                <p className="mt-2 text-xs uppercase tracking-wide text-graphite-400">{s.label}</p>
                <p className="font-semibold text-graphite-900">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-graphite-900 sm:text-3xl">
              {car.title}
            </h1>
            <button
              type="button"
              onClick={toggleWatch}
              aria-pressed={watched}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-soft"
              aria-label={watched ? "Ta bort bevakning" : "Bevaka bil"}
            >
              <Heart size={19} className={cn(watched ? "fill-blue-500 text-blue-500" : "text-graphite-400")} />
            </button>
          </div>
          {car.inspected && (
            <Badge variant="dark" icon={<ShieldCheck size={13} />} className="mt-3">
              Verkstadsbesiktigad
            </Badge>
          )}
          <p className="mt-4 text-graphite-600">{car.description}</p>

          <div className="mt-6 rounded-2xl bg-white p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-graphite-400">
                  {car.status === "sold" ? "Såldes för" : "Högsta bud"}
                </p>
                <p className="font-display text-3xl font-extrabold text-graphite-900">{formatPrice(price)}</p>
                <p className="text-xs text-graphite-400">Utropspris {formatPrice(car.startPrice)}</p>
              </div>
              {!ended && (
                <div className="text-right">
                  <Countdown endsAt={car.endsAt} />
                  {car.extended && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Förlängd efter sent bud
                    </p>
                  )}
                </div>
              )}
            </div>
            {!ended && (
              <div className="mt-5">
                <BidForm key={car.id} car={car} />
              </div>
            )}
            <div className="mt-6 border-t border-graphite-100 pt-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-graphite-500">Budhistorik</h2>
              <BidHistory car={car} />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-graphite-200 p-6">
            <h2 className="flex items-center gap-2 font-display font-bold text-graphite-900">
              <ShieldCheck size={18} className="text-blue-500" /> Skick &amp; kontrollerat av oss
            </h2>
            <p className="mt-1 text-sm text-graphite-500">{car.conditionSummary}</p>
            <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-graphite-400">Höjdpunkter</h3>
            <ul className="mt-2 space-y-2">
              {car.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-graphite-700">
                  <CircleCheck size={16} className="mt-0.5 shrink-0 text-blue-500" />
                  {h}
                </li>
              ))}
            </ul>
            {car.thingsToNote.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-graphite-400">Att känna till</h3>
                <ul className="mt-2 space-y-2">
                  {car.thingsToNote.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-graphite-700">
                      <Info size={16} className="mt-0.5 shrink-0 text-graphite-400" />
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
