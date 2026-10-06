import { seedCars, seedFaqs, seedReviews, seedServices } from "../data/seed";
import { EXTEND_BY_MS, EXTEND_WINDOW_MS, minNextBid } from "./auction";
import type {
  Bid,
  BidResult,
  Booking,
  BookingInput,
  Car,
  ContactMessageInput,
  Faq,
  Review,
  SellRequestInput,
  Service,
} from "./types";

/* ------------------------------------------------------------------ */
/* Mappning mellan databasens snake_case-rader och appens typer         */
/* ------------------------------------------------------------------ */

type Row = Record<string, any>;

const toService = (r: Row): Service => ({
  id: r.id,
  category: r.category,
  name: r.name,
  description: r.description,
  priceFrom: r.price_from,
  priceTo: r.price_to ?? undefined,
  durationMin: r.duration_min,
  popular: r.popular,
});

const toBid = (r: Row): Bid => ({ id: r.id, name: r.name, amount: r.amount, at: r.created_at });

const toCar = (r: Row): Car => ({
  id: r.id,
  make: r.make,
  model: r.model,
  year: r.year,
  title: r.title,
  highlight: r.highlight,
  bodyType: r.body_type,
  colorName: r.color_name,
  colorHex: r.color_hex,
  mileageKm: r.mileage_km,
  fuel: r.fuel,
  gearbox: r.gearbox,
  inspected: r.inspected,
  conditionSummary: r.condition_summary,
  highlights: r.highlights ?? [],
  thingsToNote: r.things_to_note ?? [],
  description: r.description,
  startPrice: r.start_price,
  minIncrement: r.min_increment,
  endsAt: r.ends_at,
  status: r.status,
  soldPrice: r.sold_price ?? undefined,
  extended: r.extended,
  bids: (r.bids ?? []).map(toBid),
});

const toReview = (r: Row): Review => ({
  id: r.id,
  name: r.name,
  rating: r.rating,
  text: r.text,
  date: r.created_at,
});

const toFaq = (r: Row): Faq => ({ id: r.id, question: r.question, answer: r.answer });

/** Demoläge: kör helt utan databas (VITE_DEMO_DATA=true), all data hålls i minnet. */
export const DEMO = import.meta.env.VITE_DEMO_DATA === "true";

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Något gick fel. Försök igen om en stund.");
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Demoläge: data i minnet                                              */
/* ------------------------------------------------------------------ */

const demo = {
  cars: structuredClone(seedCars),
  bookings: [] as Booking[],
};

const demoId = (prefix: string) =>
  `${prefix}_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/* ------------------------------------------------------------------ */
/* API                                                                  */
/* ------------------------------------------------------------------ */

export async function fetchServices(): Promise<Service[]> {
  if (DEMO) return seedServices;
  return (await request<Row[]>("/services")).map(toService);
}

export async function fetchCars(): Promise<Car[]> {
  if (DEMO) return structuredClone(demo.cars);
  return (await request<Row[]>("/cars")).map(toCar);
}

export async function fetchReviews(): Promise<Review[]> {
  if (DEMO) return seedReviews;
  return (await request<Row[]>("/reviews")).map(toReview);
}

export async function fetchFaqs(): Promise<Faq[]> {
  if (DEMO) return seedFaqs;
  return (await request<Row[]>("/faqs")).map(toFaq);
}

/** Tider som redan är bokade ett visst datum (inga personuppgifter lämnas ut). */
export async function fetchBookedSlots(date: string): Promise<string[]> {
  if (DEMO) return demo.bookings.filter((b) => b.date === date).map((b) => b.time);
  return request<string[]>(`/booked-slots?date=${encodeURIComponent(date)}`);
}

export async function placeBid(carId: string, name: string, amount: number): Promise<BidResult> {
  if (!DEMO) return request<BidResult>("/bids", { method: "POST", body: { carId, name, amount } });
  const car = demo.cars.find((c) => c.id === carId);
  if (!car) return { ok: false, message: "Bilen hittades inte." };
  if (car.status === "sold" || new Date(car.endsAt).getTime() <= Date.now())
    return { ok: false, message: "Auktionen är avslutad." };
  const min = minNextBid(car);
  if (amount < min)
    return { ok: false, message: `Budet måste vara minst ${min.toLocaleString("sv-SE")} kr.` };
  const now = Date.now();
  const extended = new Date(car.endsAt).getTime() - now <= EXTEND_WINDOW_MS;
  car.bids.push({ id: demoId("bid"), name, amount, at: new Date().toISOString() });
  if (extended) {
    car.endsAt = new Date(now + EXTEND_BY_MS).toISOString();
    car.extended = true;
  }
  return {
    ok: true,
    extended,
    message: extended
      ? "Ditt bud är registrerat! Eftersom det kom precis innan sluttid förlängde vi auktionen 5 minuter."
      : "Ditt bud är registrerat!",
  };
}

export async function createBooking(input: BookingInput): Promise<Booking> {
  if (!DEMO) {
    const result = await request<{ id: string; created_at: string }>("/bookings", {
      method: "POST",
      body: input,
    });
    return { ...input, id: result.id, createdAt: result.created_at };
  }
  const booking = { ...input, id: demoId("bok"), createdAt: new Date().toISOString() };
  demo.bookings.push(booking);
  return booking;
}

export async function createSellRequest(input: SellRequestInput): Promise<void> {
  if (!DEMO) await request("/sell-requests", { method: "POST", body: input });
}

export async function createContactMessage(input: ContactMessageInput): Promise<void> {
  if (!DEMO) await request("/contact", { method: "POST", body: input });
}
