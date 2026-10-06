import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Car, ChevronRight, Gavel, Inbox, MessageSquare, Plus, Tag, TrendingUp, Wallet } from "lucide-react";
import { cn } from "../../lib/cn";
import { useAdminCars, useOverview, type Overview } from "../api";
import { carState, currentPrice, highestBid, kr, mailTime, num, relativeTime, reserveMet } from "../helpers";
import { Card, ErrorBlock, PageHeader, Pill, SectionLabel, Skeleton } from "../ui";
import { imageUrl } from "../../lib/api";
import { CarIllustration } from "../../components/CarIllustration";
import type { Car as CarT } from "../../lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 10) return "God morgon";
  if (h < 17) return "Hej";
  return "God kväll";
}

function Stat({ icon, color, label, value, sub, to }: { icon: ReactNode; color: string; label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <Card className="h-full transition hover:shadow-ios-lift">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-[9px] text-white", color)}>{icon}</span>
        {to && <ChevronRight size={16} className="text-ios-separator" />}
      </div>
      <p className="mt-3 text-[13px] font-medium text-ios-secondary">{label}</p>
      <p className="text-[21px] font-semibold tabular-nums sm:text-[26px] tracking-[-0.02em] text-ios-label">{value}</p>
      {sub && <p className="text-[12px] text-ios-tertiary">{sub}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Stapeldiagram: bud per dag senaste 14 dagarna (en serie, hover visar exakt värde). */
function BidsChart({ data }: { data: Overview["bidsPerDay"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const W = 560;
  const H = 140;
  const gap = 6;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const label = (d: string) => new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[15px] font-semibold text-ios-label">Bud per dag</p>
          <p className="text-[13px] text-ios-secondary">Senaste 14 dagarna · {num(total)} bud</p>
        </div>
        <p className="text-[13px] tabular-nums text-ios-secondary">
          {hover != null ? (
            <>
              <span className="font-semibold text-ios-label">{data[hover].count} bud</span> · {label(data[hover].day)}
            </>
          ) : (
            "Peka på en stapel"
          )}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="mt-4 w-full" role="img" aria-label={`Bud per dag, totalt ${total}`}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke="#E8E8ED" />
        {data.map((d, i) => {
          const h = d.count === 0 ? 0 : Math.max(4, (d.count / max) * (H - 8));
          const x = i * (bw + gap);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`}
                  fill="#0071E3"
                  opacity={hover == null || hover === i ? 1 : 0.35}
                  style={{ transition: "opacity .15s" }}
                />
              )}
              {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                <text x={x + bw / 2} y={H + 15} textAnchor="middle" fontSize="11" fill="#86868B">
                  {label(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

function Thumb({ car }: { car: CarT }) {
  return car.images[0] ? (
    <img src={imageUrl(car.images[0], "thumb")} alt="" className="h-12 w-16 shrink-0 rounded-[8px] object-cover" />
  ) : (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-[8px] bg-ios-fill2 px-1">
      <CarIllustration colorHex={car.colorHex} bodyType={car.bodyType} className="w-full" />
    </div>
  );
}

const ACTIVITY_ICON = {
  bid: { icon: Gavel, color: "bg-ios-blue" },
  message: { icon: MessageSquare, color: "bg-ios-green" },
  sell: { icon: Tag, color: "bg-ios-purple" },
  booking: { icon: CalendarDays, color: "bg-ios-orange" },
};

const ACTIVITY_TEXT = {
  bid: "lade ett bud",
  message: "skickade ett meddelande",
  sell: "vill sälja sin bil",
  booking: "bokade en tid",
};

export function OverviewPage() {
  const overview = useOverview();
  const cars = useAdminCars();
  const now = Date.now();

  const { needsAction, endingSoon } = useMemo(() => {
    const list = cars.data ?? [];
    return {
      needsAction: list.filter((c) => carState(c, now) === "ended"),
      endingSoon: list
        .filter((c) => ["live", "ending"].includes(carState(c, now)))
        .sort((a, b) => a.endsAt.localeCompare(b.endsAt))
        .slice(0, 5),
    };
  }, [cars.data, now]);

  const s = overview.data?.stats;
  const today = new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={
          <Link to="/admin/bilar/ny" className="inline-flex h-10 items-center gap-2 rounded-full bg-ios-blue px-4 text-[15px] font-medium text-white shadow-sm transition hover:bg-ios-blue-hover active:scale-[.97]">
            <Plus size={18} /> Ny bil
          </Link>
        }
      />

      {overview.error && <ErrorBlock error={overview.error} retry={() => overview.refetch()} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {!s ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[136px] rounded-[20px]" />)
        ) : (
          <>
            <Stat icon={<Car size={17} />} color="bg-ios-blue" label="Pågående auktioner" value={num(s.active_cars)} sub={s.draft_cars ? `${s.draft_cars} utkast` : undefined} to="/admin/bilar" />
            <Stat icon={<TrendingUp size={17} />} color="bg-ios-green" label="Budvärde just nu" value={kr(s.live_value)} sub={`${num(s.bids_24h)} bud senaste dygnet`} to="/admin/bud" />
            <Stat icon={<Inbox size={17} />} color="bg-ios-orange" label="Nya meddelanden" value={num(s.new_messages)} sub={s.new_messages ? "Väntar på svar" : "Allt besvarat"} to="/admin/inkorg" />
            <Stat icon={<Wallet size={17} />} color="bg-ios-purple" label="Sålt denna månad" value={kr(s.sold_month_value)} sub={`${s.sold_month} ${s.sold_month === 1 ? "bil" : "bilar"} · ${s.bookings_today} bokningar idag`} to="/admin/bokningar" />
          </>
        )}
      </div>

      {needsAction.length > 0 && (
        <div className="mt-8">
          <SectionLabel>Kräver åtgärd</SectionLabel>
          <Card padded={false} className="divide-y divide-black/[.05] overflow-hidden">
            {needsAction.map((car) => {
              const top = highestBid(car);
              return (
                <Link key={car.id} to="/admin/bilar/$id" params={{ id: car.id }} className="flex items-center gap-3 px-4 py-3 transition hover:bg-ios-fill2">
                  <Thumb car={car} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{car.title}</p>
                    <p className="text-[13px] text-ios-secondary">
                      Avslutades {relativeTime(car.endsAt)} · {top ? `${kr(top.amount)} av ${top.name}` : "inga bud"}
                    </p>
                  </div>
                  {!reserveMet(car) && <Pill tone="orange">Reservpris ej nått</Pill>}
                  <span className="hidden text-[13px] font-medium text-ios-blue sm:block">Sälj eller lägg ut igen</span>
                  <ChevronRight size={16} className="text-ios-separator" />
                </Link>
              );
            })}
          </Card>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {overview.data ? <BidsChart data={overview.data.bidsPerDay} /> : <Skeleton className="h-[230px] rounded-[20px]" />}

          <div>
            <SectionLabel
              action={
                <Link to="/admin/bilar" className="flex items-center gap-1 text-[13px] font-medium text-ios-blue">
                  Alla bilar <ArrowRight size={13} />
                </Link>
              }
            >
              Slutar snart
            </SectionLabel>
            <Card padded={false} className="divide-y divide-black/[.05] overflow-hidden">
              {cars.isLoading && <Skeleton className="m-4 h-12" />}
              {!cars.isLoading && endingSoon.length === 0 && <p className="px-4 py-6 text-center text-[15px] text-ios-secondary">Inga pågående auktioner.</p>}
              {endingSoon.map((car) => (
                <Link key={car.id} to="/admin/bilar/$id" params={{ id: car.id }} className="flex items-center gap-3 px-4 py-3 transition hover:bg-ios-fill2">
                  <Thumb car={car} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{car.title}</p>
                    <p className="text-[13px] text-ios-secondary">
                      {car.bids.length} bud · slutar {relativeTime(car.endsAt, now)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-semibold tabular-nums">{kr(currentPrice(car))}</p>
                    {carState(car, now) === "ending" && <Pill tone="orange">Snart slut</Pill>}
                  </div>
                </Link>
              ))}
            </Card>
          </div>
        </div>

        <div className="lg:col-span-2">
          <SectionLabel>Senaste händelser</SectionLabel>
          <Card padded={false} className="overflow-hidden">
            {!overview.data && <Skeleton className="m-4 h-40" />}
            {overview.data?.activity.length === 0 && <p className="px-4 py-6 text-center text-[15px] text-ios-secondary">Inget har hänt ännu.</p>}
            <ul className="divide-y divide-black/[.05]">
              {overview.data?.activity.map((a) => {
                const meta = ACTIVITY_ICON[a.kind];
                const to = a.kind === "bid" ? "/admin/bud" : a.kind === "booking" ? "/admin/bokningar" : "/admin/inkorg";
                return (
                  <li key={`${a.kind}-${a.id}`}>
                    <Link to={to} className="flex gap-3 px-4 py-3 transition hover:bg-ios-fill2">
                      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white", meta.color)}>
                        <meta.icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug">
                          <span className="font-semibold">{a.title}</span> <span className="text-ios-secondary">{ACTIVITY_TEXT[a.kind]}</span>
                          {a.amount != null && <span className="font-semibold tabular-nums"> {kr(a.amount)}</span>}
                        </p>
                        <p className="truncate text-[13px] text-ios-tertiary">{a.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-ios-tertiary">{mailTime(a.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
