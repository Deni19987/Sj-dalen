import { useEffect, useState, type FormEvent } from "react";
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
  CarFront,
  Check,
  ChevronDown,
  Cog,
  ListChecks,
  MessageCircle,
  Phone,
  Route,
} from "lucide-react";
import { BackLink } from "../components/BackLink";
import { Badge } from "../components/Badge";
import { groupEquipment } from "../lib/equipment";
import { carName, carSubtitle } from "../lib/vehicle";
import { Button } from "../components/Button";
import { CarGallery } from "../components/CarGallery";
import { Countdown } from "../components/Countdown";
import { bidsNewestFirst, currentPrice, isEnded, minNextBid } from "../lib/auction";
import { cn } from "../lib/cn";
import { formatKm, formatPrice, telHref, timeAgo } from "../lib/format";
import { useChatPanel } from "../components/chat/ChatProvider";
import { useCars, usePlaceBid, useSettings } from "../lib/queries";
import type { BidResult, Car } from "../lib/types";
import { useWatch } from "../lib/watchlist";

const route = getRouteApi("/auktion/$id");
const BODY_LABEL: Record<string, string> = { kombi: "Kombi", sedan: "Sedan", halvkombi: "Halvkombi", suv: "SUV", skåpbil: "Skåpbil" };
const INPUT = "w-full rounded-lg border border-graphite-200 px-3 py-2.5 outline-none focus:border-blue-500";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Budgivarens uppgifter sparas i webbläsaren så att man slipper fylla i dem vid nästa bud.
const BIDDER_KEY = "sjodalen-bilar-bidder";

function readBidder(): { name: string; email: string; phone: string } {
  try {
    return { name: "", email: "", phone: "", ...JSON.parse(localStorage.getItem(BIDDER_KEY) ?? "{}") };
  } catch {
    return { name: "", email: "", phone: "" };
  }
}

function BidForm({ car }: { car: Car }) {
  const placeBid = usePlaceBid();
  const min = minNextBid(car);
  const [bidder, setBidder] = useState(readBidder);
  const [amount, setAmount] = useState(String(min));
  const [result, setResult] = useState<BidResult | null>(null);
  const [accepted, setAccepted] = useState(false);

  // Om någon annan bjuder över medan sidan är öppen: höj förslaget till nytt minsta bud.
  useEffect(() => {
    setAmount((a) => (Number(a) < min ? String(min) : a));
  }, [min]);

  if (isEnded(car, Date.now())) return null;

  const update = (field: keyof typeof bidder) => (e: { target: { value: string } }) =>
    setBidder((b) => ({ ...b, [field]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    const name = bidder.name.trim();
    const email = bidder.email.trim();
    const phone = bidder.phone.trim();
    if (!name) return setResult({ ok: false, message: "Ange ditt namn." });
    if (!EMAIL_RE.test(email)) return setResult({ ok: false, message: "Ange en giltig e-postadress." });
    if (phone.replace(/\D/g, "").length < 6) return setResult({ ok: false, message: "Ange ditt telefonnummer." });
    if (!Number.isFinite(value)) return setResult({ ok: false, message: "Ange ett giltigt belopp." });
    if (!accepted)
      return setResult({ ok: false, message: "Du behöver godkänna auktionsvillkoren för att lägga bud." });
    placeBid.mutate(
      { carId: car.id, name, email, phone, amount: value, acceptTerms: true },
      {
        onSuccess: (r) => {
          setResult(r);
          if (r.ok) {
            setAmount(String(value + car.minIncrement));
            try {
              localStorage.setItem(BIDDER_KEY, JSON.stringify({ name, email, phone }));
            } catch {
              /* ignorera t.ex. privat läge */
            }
          }
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
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={bidder.name} onChange={update("name")} placeholder="Namn" autoComplete="name" className={INPUT} />
        <input
          type="email"
          value={bidder.email}
          onChange={update("email")}
          placeholder="E-post"
          autoComplete="email"
          className={INPUT}
        />
        <input
          type="tel"
          value={bidder.phone}
          onChange={update("phone")}
          placeholder="Telefon"
          autoComplete="tel"
          className={INPUT}
        />
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-graphite-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-blue-500"
        />
        <span>
          Jag har läst och godkänner{" "}
          <Link to="/auktion/villkor" target="_blank" className="font-semibold text-blue-600 hover:underline">
            auktionsvillkoren
          </Link>{" "}
          och förstår att <strong>mitt bud är bindande och inte kan dras tillbaka</strong>.
        </span>
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={min}
            step={car.minIncrement}
            aria-label="Ditt bud i kronor"
            className={cn(INPUT, "pr-10 font-semibold")}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-graphite-400">kr</span>
        </div>
        <Button type="submit" disabled={placeBid.isPending}>
          <Gavel size={16} /> Lägg bud
        </Button>
      </div>
      <p className="mt-3 text-xs text-graphite-400">
        Bara ditt namn visas i budhistoriken. E-post och telefon använder vi för att kontakta dig om du vinner – läs
        mer i vår{" "}
        <Link to="/integritet" target="_blank" className="underline hover:text-graphite-600">
          integritetspolicy
        </Link>
        .
      </p>
      {result && (
        <p className={`mt-3 text-sm font-semibold ${result.ok ? "text-blue-600" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}

/** Frågor om bilen: ring eller chatta – nära budrutan. */
function ContactBox({ car }: { car: Car }) {
  const { data: settings } = useSettings();
  const { openChat } = useChatPanel();
  return (
    <div className="mt-5 rounded-2xl border border-graphite-100 p-4">
      <p className="text-sm font-bold text-graphite-900">Frågor om bilen?</p>
      <p className="mt-0.5 text-sm text-graphite-500">Ring oss eller skriv i chatten – vi svarar snabbt.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {settings?.phone && (
          <a
            href={telHref(settings.phone)}
            className="flex items-center justify-center gap-2 rounded-full bg-graphite-100 px-3 py-2.5 text-sm font-semibold text-graphite-900 transition-colors hover:bg-graphite-200"
          >
            <Phone size={16} /> Ring
          </a>
        )}
        <button
          type="button"
          onClick={() => openChat({ carId: car.id, carTitle: carName(car) })}
          className={cn(
            "flex items-center justify-center gap-2 rounded-full bg-blue-500 px-3 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-blue-600 active:scale-[.98]",
            !settings?.phone && "col-span-2",
          )}
        >
          <MessageCircle size={16} /> Chatta med oss
        </button>
      </div>
    </div>
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
    { icon: Cog, label: "Motor", value: [car.engine, car.horsepower && `${car.horsepower} hk`].filter(Boolean).join(", ") },
    { icon: CarFront, label: "Kaross", value: BODY_LABEL[car.bodyType] ?? "" },
    { icon: Route, label: "Drivning", value: car.drive ?? "" },
    { icon: Palette, label: "Färg", value: car.colorName },
  ].filter((s) => s.value);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <BackLink
        to="/auktion"
        from={["/", "/auktion", "/auktion/salda"]}
        className="inline-flex items-center gap-1 text-sm font-semibold text-graphite-500 hover:text-graphite-900"
      >
        {(back) => (
          <>
            <ChevronLeft size={16} /> {back ? "Tillbaka" : "Till alla bilar"}
          </>
        )}
      </BackLink>

      {/* Mobil: bilder → bud → detaljer. Dator: bilder och detaljer till vänster, budrutan fast till höger. */}
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="lg:col-start-1 lg:row-start-1">
          <CarGallery
            car={car}
            badge={
              car.status === "sold" && (
                <span className="absolute left-6 top-6 rounded-full bg-graphite-900 px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-white">
                  Såld
                </span>
              )
            }
          />
        </div>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="space-y-6 lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white p-6 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-graphite-900 sm:text-3xl">
                    {carName(car)}
                  </h1>
                  {carSubtitle(car) && <p className="mt-0.5 text-graphite-500">{carSubtitle(car)}</p>}
                  {car.highlight && <p className="mt-2 text-sm text-graphite-600">{car.highlight}</p>}
                </div>
                <button
                  type="button"
                  onClick={toggleWatch}
                  aria-pressed={watched}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-graphite-50"
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

              <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-graphite-100 pt-5">
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
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-600">Förlängd efter sent bud</p>
                    )}
                  </div>
                )}
              </div>
              {car.status !== "sold" && car.hasReserve && (
                <p
                  className={cn(
                    "mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                    car.reserveMet ? "bg-blue-50 text-blue-700" : "bg-graphite-100 text-graphite-500",
                  )}
                >
                  {car.reserveMet ? "Reservationspriset är uppnått" : "Reservationspriset är inte uppnått"}
                </p>
              )}
              {!ended && (
                <div className="mt-5">
                  <BidForm key={car.id} car={car} />
                </div>
              )}
              <ContactBox car={car} />
              <div className="mt-6 border-t border-graphite-100 pt-5">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-graphite-500">Budhistorik</h2>
                <BidHistory car={car} />
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-6 lg:col-start-1 lg:row-start-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {specs.map((s) => (
              <div key={s.label} className="rounded-xl bg-white p-4 shadow-card">
                <s.icon size={16} className="text-blue-500" />
                <p className="mt-2 text-xs uppercase tracking-wide text-graphite-400">{s.label}</p>
                <p className="font-semibold text-graphite-900">{s.value}</p>
              </div>
            ))}
          </div>

          {car.description.trim() && (
            <section className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-graphite-900">Om bilen</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-graphite-600">
                {car.description
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {p}
                    </p>
                  ))}
              </div>
            </section>
          )}

          {(car.conditionSummary || car.highlights.length > 0 || car.thingsToNote.length > 0) && (
            <section className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-graphite-900">
                <ShieldCheck size={18} className="text-blue-500" /> Skick &amp; kontrollerat av oss
              </h2>
              {car.conditionSummary && <p className="mt-1 text-sm text-graphite-500">{car.conditionSummary}</p>}
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {car.highlights.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-graphite-400">Höjdpunkter</h3>
                    <ul className="mt-2 space-y-2">
                      {car.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm text-graphite-700">
                          <CircleCheck size={16} className="mt-0.5 shrink-0 text-blue-500" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {car.thingsToNote.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-graphite-400">Att känna till</h3>
                    <ul className="mt-2 space-y-2">
                      {car.thingsToNote.map((t) => (
                        <li key={t} className="flex items-start gap-2 text-sm text-graphite-700">
                          <Info size={16} className="mt-0.5 shrink-0 text-graphite-400" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          <EquipmentList items={car.equipment ?? []} />
        </div>
      </div>
    </div>
  );
}

/** Utrustningen grupperad (Komfort, Säkerhet …). Långa listor fälls ihop. */
function EquipmentList({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const groups = groupEquipment(items);
  if (!groups.length) return null;
  const collapsible = items.length > 12;
  const shown = collapsible && !open ? groups.slice(0, 2) : groups;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-card">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-graphite-900">
        <ListChecks size={18} className="text-blue-500" /> Utrustning
        <span className="text-sm font-normal text-graphite-400">({items.length})</span>
      </h2>
      <div className="mt-4 space-y-5">
        {shown.map((g) => (
          <div key={g.name}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-graphite-400">{g.name}</h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 md:grid-cols-3">
              {g.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-graphite-700">
                  <Check size={15} className="mt-0.5 shrink-0 text-blue-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600"
          aria-expanded={open}
        >
          {open ? "Visa mindre" : `Visa all utrustning (${items.length})`}
          <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      )}
    </section>
  );
}
