import { Link } from "@tanstack/react-router";
import { Check, Mail, MessageCircle, Phone, Trophy } from "lucide-react";
import { AUCTION_DEFAULTS, bidsNewestFirst } from "../lib/auction";
import { cn } from "../lib/cn";
import { useSettings } from "../lib/queries";
import { useDealStep, type AdminCar } from "./api";
import { carState, fmtDateTime, kr, telHref } from "./helpers";
import { Card, useRun } from "./ui";

type Step = "contactedAt" | "paidAt" | "pickedUpAt";

/** Lägg till n vardagar (mån–fre), som i server/auction.ts. */
function addBusinessDays(from: Date, n: number) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}
const day = (d: Date) => d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });

/**
 * Efter auktionen: vinnaren och stegen Kontaktad → Betald → Hämtad. Påminnelser (pushnotis)
 * skickas när betalning eller hämtning dröjer längre än auktionsvillkoren säger.
 */
export function DealCard({ car }: { car: AdminCar }) {
  const { data: settings } = useSettings();
  const step = useDealStep();
  const run = useRun();
  const state = carState(car);
  if (state !== "ended" && state !== "sold") return null;

  const t = { ...AUCTION_DEFAULTS, ...settings?.auction };
  const top = bidsNewestFirst(car)[0];
  const deal = car.deal ?? {};
  const reserveMissed = car.reservePrice != null && top && top.amount < car.reservePrice;
  const payDue = deal.contactedAt ? addBusinessDays(new Date(deal.contactedAt), t.paymentDays) : null;
  const pickupDue = deal.paidAt ? new Date(new Date(deal.paidAt).getTime() + t.pickupDays * 86_400_000) : null;
  const now = Date.now();

  const steps: { key: Step; label: string; hint: string; late?: boolean }[] = [
    { key: "contactedAt", label: "Vinnaren kontaktad", hint: "Betalningsuppgifter skickade" },
    {
      key: "paidAt",
      label: "Betald",
      hint: payDue ? `Ska vara betald senast ${day(payDue)}` : `${t.paymentDays} bankdagar efter kontakt`,
      late: !deal.paidAt && !!payDue && payDue.getTime() < now,
    },
    {
      key: "pickedUpAt",
      label: "Hämtad",
      hint: pickupDue ? `Ska hämtas senast ${day(pickupDue)}` : `${t.pickupDays} dagar efter betalning`,
      late: !deal.pickedUpAt && !!pickupDue && pickupDue.getTime() < now,
    },
  ];

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
        <Trophy size={18} className="text-ios-orange" /> Efter auktionen
      </h2>
      {!top ? (
        <p className="mt-1 text-[15px] text-ios-secondary">Auktionen slutade utan bud. Lägg ut bilen igen från menyn.</p>
      ) : (
        <>
          <div className="mt-3 rounded-[14px] bg-ios-fill2 p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold">{top.name}</p>
              <p className="text-[15px] font-semibold tabular-nums text-ios-blue">{kr(top.amount)}</p>
            </div>
            {reserveMissed && (
              <p className="mt-1 text-[13px] text-ios-orange">
                Under reservationspriset ({kr(car.reservePrice!)}). Budet gäller två arbetsdagar efter avslut – godta genom att markera som såld.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {top.phone && (
                <a href={telHref(top.phone)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ios-blue">
                  <Phone size={14} /> Ring
                </a>
              )}
              {top.email && (
                <a href={`mailto:${top.email}?subject=${encodeURIComponent(car.title)}`} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ios-blue">
                  <Mail size={14} /> Mejla
                </a>
              )}
              <Link to="/admin/inkorg" className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ios-blue">
                <MessageCircle size={14} /> Inkorg
              </Link>
            </div>
          </div>

          <ol className="mt-3 space-y-1">
            {steps.map((s, i) => {
              const done = !!deal[s.key];
              const prevDone = i === 0 || !!deal[steps[i - 1].key];
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={step.isPending || (!done && !prevDone)}
                    onClick={() => run(() => step.mutateAsync({ id: car.id, step: s.key, done: !done }))}
                    className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-ios-fill2 disabled:opacity-40"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
                        done ? "border-ios-green bg-ios-green text-white" : "border-ios-separator",
                      )}
                    >
                      {done && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{s.label}</span>
                      <span className={cn("block text-[12px]", s.late ? "font-medium text-ios-red" : "text-ios-tertiary")}>
                        {done ? fmtDateTime(deal[s.key]!) : s.late ? `Försenad – ${s.hint.toLowerCase()}` : s.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}
