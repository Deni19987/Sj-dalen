import type { Car } from "./types";

/** Bud som läggs inom 5 min före sluttid förlänger auktionen med 5 min. */
export const EXTEND_WINDOW_MS = 5 * 60_000;
export const EXTEND_BY_MS = 5 * 60_000;

export function currentPrice(car: Car) {
  if (car.status === "sold" && car.soldPrice) return car.soldPrice;
  if (car.bids.length === 0) return car.startPrice;
  return Math.max(...car.bids.map((b) => b.amount));
}

export function minNextBid(car: Car) {
  return currentPrice(car) + car.minIncrement;
}

export function bidsNewestFirst(car: Car) {
  return [...car.bids].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function isEnded(car: Car, now: number) {
  return car.status === "sold" || new Date(car.endsAt).getTime() <= now;
}
