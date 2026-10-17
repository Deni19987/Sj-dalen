// Stegen för att göra klart en affär efter auktionen – används av bilens sida och Översikten.
import { AUCTION_DEFAULTS, bidsNewestFirst } from "../lib/auction";
import type { AdminCar, Deal, DealStep } from "./api";
import { carState } from "./helpers";

export type DealStepKey = "sold" | DealStep;

export interface DealStepInfo {
  key: DealStepKey;
  label: string;
  done: boolean;
  doneAt?: string;
  /** Senaste dag (för betalning och hämtning) */
  due?: Date;
}

export function addBusinessDays(from: Date, n: number) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

export function dealSteps(car: AdminCar, terms: { paymentDays: number; pickupDays: number } = AUCTION_DEFAULTS): DealStepInfo[] {
  const d: Deal = car.deal ?? {};
  const sold = car.status === "sold";
  return [
    { key: "sold", label: "Godkänn försäljningen", done: sold, doneAt: car.soldAt },
    { key: "contactedAt", label: "Kontakta köparen", done: !!d.contactedAt, doneAt: d.contactedAt },
    {
      key: "paidAt",
      label: "Betalning mottagen",
      done: !!d.paidAt,
      doneAt: d.paidAt,
      due: d.contactedAt ? addBusinessDays(new Date(d.contactedAt), terms.paymentDays) : undefined,
    },
    { key: "pickupBookedAt", label: "Hämtning bokad", done: !!d.pickupBookedAt, doneAt: d.pickupBookedAt },
    { key: "ownershipAt", label: "Ägarbyte klart", done: !!d.ownershipAt, doneAt: d.ownershipAt },
    {
      key: "pickedUpAt",
      label: "Bilen hämtad",
      done: !!d.pickedUpAt,
      doneAt: d.pickedUpAt,
      due: d.paidAt ? new Date(new Date(d.paidAt).getTime() + terms.pickupDays * 86_400_000) : undefined,
    },
  ];
}

/** Affärsläge: auktionen är slut (eller bilen markerad som såld) och det finns något att göra eller visa. */
export const inDealMode = (car: AdminCar) => {
  const s = carState(car);
  return s === "ended" || s === "sold";
};

/** Hela affären är klar när alla steg är ibockade. */
export const dealComplete = (car: AdminCar) => dealSteps(car).every((s) => s.done);

/**
 * Bilar som behöver något gjort: avslutade men inte sålda, eller sålda med steg kvar.
 * Sålda bilar utan påbörjad affär äldre än 14 dagar räknas inte (t.ex. sålda före checklistan fanns).
 */
export function needsDealAction(car: AdminCar, now = Date.now()) {
  const s = carState(car, now);
  if (s === "ended") return true;
  if (s !== "sold" || dealComplete(car)) return false;
  const started = Object.keys(car.deal ?? {}).some((k) => k !== "endedAt" && k !== "note" && k !== "pickupTime");
  const soldAt = new Date(car.soldAt ?? car.endsAt).getTime();
  return started || now - soldAt < 14 * 86_400_000;
}

export const nextDealStep = (car: AdminCar) => dealSteps(car).find((s) => !s.done) ?? null;

export const topBid = (car: AdminCar) => bidsNewestFirst(car)[0] ?? null;
