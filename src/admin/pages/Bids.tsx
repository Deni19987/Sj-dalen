import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Download, Gavel, Mail, Phone, Trash2, Users } from "lucide-react";
import { cn } from "../../lib/cn";
import { useAdminCars, useDeleteBid, type AdminCar } from "../api";
import { carState, downloadCsv, fmtDateTime, kr, mailTime, num, telHref } from "../helpers";
import { Btn, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pill, SearchField, Segmented, Select, useFeedback, useRun } from "../ui";
import type { Bid } from "../../lib/types";

type View = "bids" | "bidders";
type Scope = "live" | "all";

interface Row extends Bid {
  car: AdminCar;
  leading: boolean;
  /** Budgivaren har lagt ett högre bud senare på samma bil */
  raisedLater: boolean;
}

export function BidsPage() {
  const { data: cars, isLoading, error, refetch } = useAdminCars();
  const [view, setView] = useState<View>("bids");
  const [scope, setScope] = useState<Scope>("live");
  const [carId, setCarId] = useState("");
  const [q, setQ] = useState("");
  const del = useDeleteBid();
  const run = useRun();
  const { confirm } = useFeedback();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const car of cars ?? []) {
      const state = carState(car);
      if (scope === "live" && state !== "live" && state !== "ending" && state !== "ended") continue;
      if (carId && car.id !== carId) continue;
      const max = Math.max(...car.bids.map((b) => b.amount));
      for (const b of car.bids)
        out.push({
          ...b,
          car,
          leading: b.amount === max,
          raisedLater: car.bids.some((o) => o.name === b.name && o.amount > b.amount),
        });
    }
    const term = q.trim().toLowerCase();
    return out
      .filter((r) => !term || `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.car.title}`.toLowerCase().includes(term))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [cars, scope, carId, q]);

  const bidders = useMemo(() => {
    const map = new Map<string, { name: string; email?: string; phone?: string; count: number; cars: Set<string>; leading: string[]; total: number; last: string }>();
    for (const r of rows) {
      const key = (r.email || r.name).toLowerCase();
      const e = map.get(key) ?? { name: r.name, email: r.email, phone: r.phone, count: 0, cars: new Set(), leading: [], total: 0, last: r.at };
      e.count++;
      e.cars.add(r.car.title);
      if (r.leading && !e.leading.includes(r.car.title)) e.leading.push(r.car.title);
      e.phone ??= r.phone;
      if (r.at > e.last) e.last = r.at;
      map.set(key, e);
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [rows]);

  const carsWithBids = (cars ?? []).filter((c) => c.bids.length > 0);

  function exportCsv() {
    downloadCsv(`bud-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Tid", "Bil", "Namn", "E-post", "Telefon", "Belopp", "Leder"],
      ...rows.map((r) => [fmtDateTime(r.at), r.car.title, r.name, r.email, r.phone, r.amount, r.leading ? "Ja" : ""]),
    ]);
  }

  async function remove(r: Row) {
    const ok = await confirm({
      title: "Ta bort budet?",
      message: `${r.name}s bud på ${kr(r.amount)} på ${r.car.title} tas bort.`,
      confirmLabel: "Ta bort",
      destructive: true,
    });
    if (ok) run(() => del.mutateAsync(r.id), "Budet är borttaget");
  }

  return (
    <div>
      <PageHeader
        title="Bud"
        subtitle="Alla bud och budgivare, uppdateras automatiskt"
        actions={
          <Btn icon={<Download size={16} />} onClick={exportCsv} disabled={rows.length === 0}>
            Exportera
          </Btn>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "bids", label: "Bud" },
              { value: "bidders", label: "Budgivare" },
            ]}
          />
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "live", label: "Aktuella" },
              { value: "all", label: "Alla" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-56">
            <Select value={carId} onChange={(e) => setCarId(e.target.value)} className="h-9 py-1.5">
              <option value="">Alla bilar</option>
              {carsWithBids.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.bids.length})
                </option>
              ))}
            </Select>
          </div>
          <SearchField value={q} onChange={setQ} placeholder="Sök namn, e-post, bil" />
        </div>
      </div>

      {error && <ErrorBlock error={error} retry={() => refetch()} />}
      {isLoading && <LoadingBlock />}

      {cars && rows.length === 0 && (
        <Card>
          <EmptyState icon={<Gavel size={26} />} title="Inga bud" text={scope === "live" ? "Inga bud på pågående auktioner just nu." : "Inga bud matchar."} />
        </Card>
      )}

      {view === "bids" && rows.length > 0 && (
        <Card padded={false} className="overflow-hidden">
          <div className="hidden grid-cols-[1.3fr_1.4fr_1fr_.8fr_40px] gap-4 border-b border-black/[.06] px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-ios-tertiary md:grid">
            <span>Budgivare</span>
            <span>Bil</span>
            <span className="text-right">Belopp</span>
            <span className="text-right">Tid</span>
            <span />
          </div>
          <ul className="divide-y divide-black/[.05]">
            {rows.map((r) => (
              <li key={r.id} className="group grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-5 py-3 md:grid-cols-[1.3fr_1.4fr_1fr_.8fr_40px] md:items-center">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                    {r.name}
                    {r.leading && carState(r.car) !== "sold" && <Crown size={13} className="shrink-0 text-ios-orange" aria-label="Leder" />}
                  </p>
                  <div className="flex flex-wrap gap-x-3 text-[13px]">
                    {r.phone && (
                      <a href={telHref(r.phone)} className="text-ios-blue">
                        {r.phone}
                      </a>
                    )}
                    {r.email && (
                      <a href={`mailto:${r.email}`} className="truncate text-ios-blue">
                        {r.email}
                      </a>
                    )}
                    {!r.phone && !r.email && <span className="text-ios-tertiary">Inga kontaktuppgifter</span>}
                  </div>
                </div>
                <Link to="/admin/bilar/$id" params={{ id: r.car.id }} className="order-3 col-span-2 min-w-0 truncate text-[14px] text-ios-secondary hover:text-ios-blue md:order-none md:col-span-1">
                  {r.car.title}
                </Link>
                <div className="text-right">
                  <p className={cn("text-[15px] font-semibold tabular-nums", r.leading ? "text-ios-label" : "text-ios-tertiary")}>{kr(r.amount)}</p>
                  {r.leading ? (
                    <Pill tone={carState(r.car) === "ended" || carState(r.car) === "sold" ? "dark" : "green"}>
                      {carState(r.car) === "ended" || carState(r.car) === "sold" ? "Vinnande" : "Leder"}
                    </Pill>
                  ) : (
                    <span className="text-[12px] text-ios-tertiary">{r.raisedLater ? "Höjt senare" : "Överbjuden"}</span>
                  )}
                </div>
                <span className="hidden text-right text-[13px] text-ios-secondary md:block" title={fmtDateTime(r.at)}>
                  {mailTime(r.at)}
                </span>
                <button
                  type="button"
                  aria-label="Ta bort bud"
                  onClick={() => remove(r)}
                  className="hidden justify-self-end rounded-full p-1.5 text-ios-tertiary opacity-0 transition hover:bg-ios-red/10 hover:text-ios-red group-hover:opacity-100 md:block"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view === "bidders" && bidders.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bidders.map((b) => (
            <Card key={(b.email ?? b.name) + b.last}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#7c7c80] text-[15px] font-semibold text-white">
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{b.name}</p>
                  <p className="text-[13px] text-ios-secondary">
                    {num(b.count)} bud · {b.cars.size} {b.cars.size === 1 ? "bil" : "bilar"} · senast {mailTime(b.last).toLowerCase()}
                  </p>
                </div>
              </div>
              {b.leading.length > 0 && (
                <p className="mt-3 flex items-start gap-1.5 text-[13px] text-ios-label">
                  <Crown size={13} className="mt-0.5 shrink-0 text-ios-orange" /> Leder på {b.leading.join(", ")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {b.phone && (
                  <a href={telHref(b.phone)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-ios-blue/10 text-[13px] font-medium text-ios-blue">
                    <Phone size={13} /> Ring
                  </a>
                )}
                {b.email && (
                  <a href={`mailto:${b.email}`} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-ios-blue/10 text-[13px] font-medium text-ios-blue">
                    <Mail size={13} /> Mejla
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {view === "bidders" && cars && bidders.length === 0 && rows.length > 0 && (
        <Card>
          <EmptyState icon={<Users size={26} />} title="Inga budgivare" />
        </Card>
      )}
    </div>
  );
}
