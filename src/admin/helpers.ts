import { currentPrice } from "../lib/auction";
import type { Bid, Car } from "../lib/types";
import type { Tone } from "./ui";

export type CarState = "draft" | "live" | "ending" | "ended" | "sold";

export function carState(car: Car, now = Date.now()): CarState {
  if (car.status === "draft") return "draft";
  if (car.status === "sold") return "sold";
  const left = new Date(car.endsAt).getTime() - now;
  if (left <= 0) return "ended";
  return left < 24 * 3_600_000 ? "ending" : "live";
}

export const STATE_LABEL: Record<CarState, { label: string; tone: Tone }> = {
  draft: { label: "Utkast", tone: "gray" },
  live: { label: "Pågår", tone: "green" },
  ending: { label: "Slutar snart", tone: "orange" },
  ended: { label: "Avslutad – väntar på beslut", tone: "red" },
  sold: { label: "Såld", tone: "dark" },
};

export function highestBid(car: Car): Bid | undefined {
  return car.bids.reduce<Bid | undefined>((best, b) => (!best || b.amount > best.amount ? b : best), undefined);
}

export function reserveMet(car: Car & { reservePrice?: number }) {
  if (car.reservePrice == null) return true;
  return (highestBid(car)?.amount ?? 0) >= car.reservePrice;
}

export { currentPrice };

export const kr = (n: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) + " kr";
export const num = (n: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n);

export function relativeTime(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  const h = Math.floor(abs / 3_600_000);
  const d = Math.floor(abs / 86_400_000);
  let s: string;
  if (min < 1) return diff > 0 ? "om några sekunder" : "nyss";
  if (min < 60) s = `${min} min`;
  else if (h < 24) s = `${h} tim${min % 60 && h < 6 ? ` ${min % 60} min` : ""}`;
  else s = `${d} ${d === 1 ? "dag" : "dagar"}${h % 24 && d < 3 ? ` ${h % 24} tim` : ""}`;
  return diff > 0 ? `om ${s}` : `${s} sedan`;
}

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("sv-SE", o);
export const fmtDateTime = (iso: string) =>
  dtf({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const fmtDate = (iso: string) => dtf({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
export const fmtLongDate = (iso: string) =>
  dtf({ weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

/** Smart tidsstämpel som i Mail: klockslag idag, "igår", veckodag eller datum. */
export function mailTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return dtf({ hour: "2-digit", minute: "2-digit" }).format(d);
  if (d.getTime() >= startOfToday - 86_400_000) return "Igår";
  if (d.getTime() >= startOfToday - 6 * 86_400_000) return dtf({ weekday: "long" }).format(d);
  return dtf({ day: "numeric", month: "short" }).format(d);
}

/** ISO-tid → värde för <input type="datetime-local"> (lokal tid). */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sluttid om `days` dagar kl. 19.00 (kvällar ger flest sena bud). */
export function endsInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
}

/** Laddar ned rader som CSV (öppnas direkt i Excel/Numbers). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { telHref } from "../lib/format";
