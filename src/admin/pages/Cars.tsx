import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Car as CarIcon, Gavel, ImageOff, Plus } from "lucide-react";
import { CarIllustration } from "../../components/CarIllustration";
import { imageUrl } from "../../lib/api";
import { useAdminCars, type AdminCar } from "../api";
import { useCarActions } from "../CarActions";
import { carState, currentPrice, highestBid, kr, num, relativeTime, reserveMet, STATE_LABEL, type CarState } from "../helpers";
import { ActionMenu, Btn, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pill, SearchField, Segmented } from "../ui";

type Filter = "all" | "live" | "ended" | "draft" | "sold";

const matches = (f: Filter, s: CarState) =>
  f === "all" || (f === "live" ? s === "live" || s === "ending" : s === f);

export function CarsPage() {
  const { data: cars, isLoading, error, refetch } = useAdminCars();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { menuItems, sheets, openDialog } = useCarActions();
  const now = Date.now();

  const counts = useMemo(() => {
    const c = { all: 0, live: 0, ended: 0, draft: 0, sold: 0 } as Record<Filter, number>;
    for (const car of cars ?? []) {
      const s = carState(car, now);
      c.all++;
      (Object.keys(c) as Filter[]).forEach((f) => f !== "all" && matches(f, s) && c[f]++);
    }
    return c;
  }, [cars, now]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const order: Record<CarState, number> = { ended: 0, ending: 1, live: 2, draft: 3, sold: 4 };
    return (cars ?? [])
      .filter((c) => matches(filter, carState(c, now)))
      .filter((c) => !term || `${c.title} ${c.make} ${c.model} ${c.year} ${c.id}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const d = order[carState(a, now)] - order[carState(b, now)];
        if (d) return d;
        return carState(a, now) === "sold" ? b.endsAt.localeCompare(a.endsAt) : a.endsAt.localeCompare(b.endsAt);
      });
  }, [cars, filter, q, now]);

  return (
    <div>
      <PageHeader
        title="Bilar"
        subtitle="Annonser och auktioner"
        actions={
          <Link to="/admin/bilar/ny" className="inline-flex h-10 items-center gap-2 rounded-full bg-ios-blue px-4 text-[15px] font-medium text-white shadow-sm transition hover:bg-ios-blue-hover active:scale-[.97]">
            <Plus size={18} /> Ny bil
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Alla" },
            { value: "live", label: "Pågår", count: counts.live },
            { value: "ended", label: "Avslutade", count: counts.ended },
            { value: "draft", label: "Utkast", count: counts.draft },
            { value: "sold", label: "Sålda" },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Sök bil" />
      </div>

      {error && <ErrorBlock error={error} retry={() => refetch()} />}
      {isLoading && <LoadingBlock />}

      {cars && list.length === 0 && (
        <Card>
          <EmptyState
            icon={<CarIcon size={26} />}
            title={q ? "Inga träffar" : filter === "all" ? "Inga bilar ännu" : "Inga bilar här"}
            text={q ? "Prova ett annat sökord." : "Lägg upp en bil så syns den på auktionssidan."}
            action={
              !q && (
                <Link to="/admin/bilar/ny">
                  <Btn variant="primary" icon={<Plus size={17} />}>
                    Lägg upp bil
                  </Btn>
                </Link>
              )
            }
          />
        </Card>
      )}

      <div className="space-y-3">
        {list.map((car) => (
          <CarRow key={car.id} car={car} now={now} menu={menuItems(car)} onSell={() => openDialog({ type: "sell", car })} onRelist={() => openDialog({ type: "relist", car })} />
        ))}
      </div>
      {sheets}
    </div>
  );
}

function CarRow({
  car,
  now,
  menu,
  onSell,
  onRelist,
}: {
  car: AdminCar;
  now: number;
  menu: ReturnType<ReturnType<typeof useCarActions>["menuItems"]>;
  onSell: () => void;
  onRelist: () => void;
}) {
  const state = carState(car, now);
  const top = highestBid(car);
  const meta = STATE_LABEL[state];

  return (
    <Card padded={false} className="group transition hover:shadow-ios-lift">
      <div className="flex items-stretch gap-4 p-3 sm:p-4">
        <Link to="/admin/bilar/$id" params={{ id: car.id }} className="relative w-28 shrink-0 sm:w-40">
          {car.images[0] ? (
            <img src={imageUrl(car.images[0], "thumb")} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-[12px] object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-[12px] bg-ios-fill2 px-2">
              <CarIllustration colorHex={car.colorHex} bodyType={car.bodyType} className="w-full" />
              <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-ios-tertiary">
                <ImageOff size={10} /> Inga bilder
              </span>
            </div>
          )}
          {car.images.length > 1 && (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-1.5 text-[11px] font-medium text-white backdrop-blur">{car.images.length}</span>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <Link to="/admin/bilar/$id" params={{ id: car.id }} className="min-w-0">
              <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ios-label">{car.title}</p>
              <p className="truncate text-[13px] text-ios-secondary">
                {car.year} · {num(car.mileageKm)} km · {car.fuel} · {car.gearbox}
              </p>
            </Link>
            <ActionMenu items={menu} />
          </div>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={meta.tone} dot>
                {meta.label}
              </Pill>
              {state !== "draft" && state !== "sold" && car.reservePrice != null && (
                <Pill tone={reserveMet(car) ? "green" : "gray"}>{reserveMet(car) ? "Reservpris nått" : "Under reservpris"}</Pill>
              )}
              <span className="text-[13px] text-ios-secondary">
                {state === "sold"
                  ? `Såld ${relativeTime(car.endsAt, now)}`
                  : state === "ended"
                    ? `Slutade ${relativeTime(car.endsAt, now)}`
                    : state === "draft"
                      ? "Syns inte på webbplatsen"
                      : `Slutar ${relativeTime(car.endsAt, now)}`}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {state === "ended" && (
                <div className="hidden gap-2 sm:flex">
                  <Btn size="sm" variant="tinted" onClick={onRelist}>
                    Lägg ut igen
                  </Btn>
                  <Btn size="sm" variant="primary" onClick={onSell}>
                    Markera såld
                  </Btn>
                </div>
              )}
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-[12px] text-ios-tertiary">
                  <Gavel size={11} /> {car.bids.length} bud{top ? ` · ${top.name}` : ""}
                </p>
                <p className="text-[17px] font-semibold tabular-nums">{kr(currentPrice(car))}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
