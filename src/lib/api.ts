import { seedCars, seedFaqs, seedReviews, seedServices } from "../data/seed";
import { EXTEND_BY_MS, EXTEND_WINDOW_MS, minNextBid } from "./auction";
import { supabase } from "./supabase";
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

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Demoläge: data i minnet när Supabase inte är konfigurerat            */
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
  if (!supabase) return seedServices;
  const rows = unwrap(await supabase.from("services").select("*").order("sort_order"));
  return rows.map(toService);
}

export async function fetchCars(): Promise<Car[]> {
  if (!supabase) return structuredClone(demo.cars);
  const rows = unwrap(await supabase.from("cars").select("*, bids(*)").order("ends_at"));
  return rows.map(toCar);
}

export async function fetchReviews(): Promise<Review[]> {
  if (!supabase) return seedReviews;
  const rows = unwrap(await supabase.from("reviews").select("*").order("sort_order"));
  return rows.map(toReview);
}

export async function fetchFaqs(): Promise<Faq[]> {
  if (!supabase) return seedFaqs;
  const rows = unwrap(await supabase.from("faqs").select("*").order("sort_order"));
  return rows.map(toFaq);
}

/** Tider som redan är bokade ett visst datum (inga personuppgifter lämnas ut). */
export async function fetchBookedSlots(date: string): Promise<string[]> {
  if (!supabase) return demo.bookings.filter((b) => b.date === date).map((b) => b.time);
  const rows = unwrap(await supabase.rpc("booked_slots", { p_date: date }));
  return (rows as { slot: string }[]).map((r) => r.slot);
}

export async function placeBid(carId: string, name: string, amount: number): Promise<BidResult> {
  if (supabase) {
    return unwrap(
      await supabase.rpc("place_bid", { p_car_id: carId, p_name: name, p_amount: amount }),
    ) as BidResult;
  }
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
  if (supabase) {
    const result = unwrap(
      await supabase.rpc("create_booking", {
        p_service_id: input.serviceId,
        p_date: input.date,
        p_time: input.time,
        p_name: input.name,
        p_phone: input.phone,
        p_email: input.email,
        p_reg_number: input.regNumber ?? null,
        p_notes: input.notes ?? null,
      }),
    ) as { id: string; created_at: string };
    return { ...input, id: result.id, createdAt: result.created_at };
  }
  const booking = { ...input, id: demoId("bok"), createdAt: new Date().toISOString() };
  demo.bookings.push(booking);
  return booking;
}

export async function createSellRequest(input: SellRequestInput): Promise<void> {
  if (!supabase) return;
  unwrap(
    await supabase.from("sell_requests").insert({
      make: input.make,
      model: input.model,
      year: input.year,
      mileage_km: input.mileageKm,
      description: input.description,
      name: input.name,
      phone: input.phone,
      email: input.email,
    }),
  );
}

export async function createContactMessage(input: ContactMessageInput): Promise<void> {
  if (!supabase) return;
  unwrap(await supabase.from("contact_messages").insert(input));
}
