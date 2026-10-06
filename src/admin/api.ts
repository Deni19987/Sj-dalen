// Klient för admin-API:t (/api/admin/*) + TanStack Query-hooks.
import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toBid, toCar } from "../lib/api";
import { queryKeys } from "../lib/queries";
import type { Car, CarStatus, Faq, Review, Service, SiteSettings } from "../lib/types";

/* ------------------------------------------------------------------ */
/* Inloggning                                                           */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = "sjodalen-admin-session";
const listeners = new Set<() => void>();

function readSession(): { token: string; expiresAt: number } | null {
  try {
    const s = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null");
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

let session = readSession();

function setSession(s: typeof session) {
  session = s;
  try {
    if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* privat läge – sessionen gäller bara tills fliken stängs */
  }
  listeners.forEach((l) => l());
}

export const authToken = () => (session && session.expiresAt > Date.now() ? session.token : null);

export function useIsLoggedIn() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => !!authToken(),
  );
}

export async function login(password: string, remember: boolean) {
  const data = await request<{ token: string; expiresAt: number }>("/login", {
    method: "POST",
    body: { password, remember },
  });
  setSession(data);
}

export const logout = () => setSession(null);

/* ------------------------------------------------------------------ */
/* Anrop                                                                */
/* ------------------------------------------------------------------ */

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = authToken();
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, {
      method: init?.method ?? "GET",
      headers: {
        ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error("Ingen anslutning till servern. Kontrollera nätet och försök igen.");
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== "/login") setSession(null);
  if (!res.ok) {
    if (res.status === 404 && !data) throw new Error("Admin-API:t svarar inte. Körs sajten med API (npm run dev:local)?");
    throw new Error(data?.error ?? "Något gick fel. Försök igen.");
  }
  return data as T;
}

type Row = Record<string, any>;

/* ------------------------------------------------------------------ */
/* Typer                                                                */
/* ------------------------------------------------------------------ */

export interface AdminCar extends Car {
  reservePrice?: number;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

/** Fälten som skickas när en bil sparas. */
export type CarInput = Omit<Car, "id" | "bids" | "extended" | "hasReserve" | "reserveMet"> & {
  reservePrice?: number | null;
  adminNote: string;
};

export interface ContactMessage {
  kind: "contact";
  id: string;
  name: string;
  email: string;
  message: string;
  status: MessageStatus;
  note: string;
  createdAt: string;
}

export interface SellRequest {
  kind: "sell";
  id: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  description: string;
  name: string;
  phone: string;
  email: string;
  status: MessageStatus;
  note: string;
  createdAt: string;
}

export type InboxItem = ContactMessage | SellRequest;
export type MessageStatus = "new" | "read" | "archived";

export type BookingStatus = "booked" | "done" | "cancelled" | "no_show";
export interface AdminBooking {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  regNumber?: string;
  notes?: string;
  status: BookingStatus;
  note: string;
  createdAt: string;
}

export interface Overview {
  stats: {
    active_cars: number;
    ended_cars: number;
    draft_cars: number;
    sold_month: number;
    sold_month_value: number;
    bids_24h: number;
    bidders_30d: number;
    live_value: number;
    new_messages: number;
    bookings_today: number;
    bookings_upcoming: number;
  };
  bidsPerDay: { day: string; count: number }[];
  activity: {
    kind: "bid" | "message" | "sell" | "booking";
    id: string;
    title: string;
    subtitle: string;
    amount: number | null;
    ref: string | null;
    created_at: string;
  }[];
}

export interface Content {
  services: (Service & { sortOrder: number })[];
  faqs: Faq[];
  reviews: Review[];
}

const toAdminCar = (r: Row): AdminCar => ({
  ...toCar(r),
  reservePrice: r.reserve_price ?? undefined,
  adminNote: r.admin_note ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  bids: (r.bids ?? []).map(toBid),
});

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

export const adminKeys = {
  overview: ["admin", "overview"] as const,
  cars: ["admin", "cars"] as const,
  messages: ["admin", "messages"] as const,
  bookings: ["admin", "bookings"] as const,
  content: ["admin", "content"] as const,
};

const LIVE = { refetchInterval: 15_000, refetchOnWindowFocus: true } as const;

export const useOverview = () =>
  useQuery({ queryKey: adminKeys.overview, queryFn: () => request<Overview>("/overview"), ...LIVE });

export const useAdminCars = () =>
  useQuery({
    queryKey: adminKeys.cars,
    queryFn: async () => (await request<Row[]>("/cars")).map(toAdminCar),
    ...LIVE,
  });

export const useMessages = () =>
  useQuery({
    queryKey: adminKeys.messages,
    queryFn: async (): Promise<InboxItem[]> => {
      const d = await request<{ contact: Row[]; sell: Row[] }>("/messages");
      const contact: ContactMessage[] = d.contact.map((r) => ({
        kind: "contact",
        id: r.id,
        name: r.name,
        email: r.email,
        message: r.message,
        status: r.status,
        note: r.note ?? "",
        createdAt: r.created_at,
      }));
      const sell: SellRequest[] = d.sell.map((r) => ({
        kind: "sell",
        id: r.id,
        make: r.make,
        model: r.model,
        year: r.year,
        mileageKm: r.mileage_km,
        description: r.description,
        name: r.name,
        phone: r.phone,
        email: r.email,
        status: r.status,
        note: r.note ?? "",
        createdAt: r.created_at,
      }));
      return [...contact, ...sell].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    ...LIVE,
  });

export const useBookings = () =>
  useQuery({
    queryKey: adminKeys.bookings,
    queryFn: async () =>
      (await request<Row[]>("/bookings")).map(
        (r): AdminBooking => ({
          id: r.id,
          serviceId: r.service_id,
          serviceName: r.service_name,
          date: r.date,
          time: r.time,
          name: r.name,
          phone: r.phone,
          email: r.email,
          regNumber: r.reg_number ?? undefined,
          notes: r.notes ?? undefined,
          status: r.status,
          note: r.note ?? "",
          createdAt: r.created_at,
        }),
      ),
    ...LIVE,
  });

export const useContent = () =>
  useQuery({
    queryKey: adminKeys.content,
    queryFn: async (): Promise<Content> => {
      const d = await request<{ services: Row[]; faqs: Row[]; reviews: Row[] }>("/content");
      return {
        services: d.services.map((r) => ({
          id: r.id,
          category: r.category,
          name: r.name,
          description: r.description,
          priceFrom: r.price_from,
          priceTo: r.price_to ?? undefined,
          durationMin: r.duration_min,
          popular: r.popular,
          sortOrder: r.sort_order,
        })),
        faqs: d.faqs.map((r) => ({ id: r.id, question: r.question, answer: r.answer })),
        reviews: d.reviews.map((r) => ({ id: r.id, name: r.name, rating: r.rating, text: r.text, date: r.created_at })),
      };
    },
  });

/** Gemensam mutation som uppdaterar både admin- och publika cachar efteråt. */
function useAdminMutation<V, R>(fn: (v: V) => Promise<R>, invalidate: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of [...invalidate, adminKeys.overview]) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const useSaveCar = () =>
  useAdminMutation(
    async ({ id, input }: { id?: string; input: CarInput }) =>
      toAdminCar(
        await request<Row>(id ? `/cars/${encodeURIComponent(id)}` : "/cars", {
          method: id ? "PUT" : "POST",
          body: input,
        }),
      ),
    [adminKeys.cars, queryKeys.cars],
  );

export type CarAction =
  | { action: "end" }
  | { action: "extend"; hours: number }
  | { action: "sell"; price: number }
  | { action: "relist"; days: number; clearBids: boolean }
  | { action: "publish" }
  | { action: "unpublish" }
  | { action: "duplicate" };

export const useCarAction = () =>
  useAdminMutation(
    async ({ id, ...action }: CarAction & { id: string }) =>
      toAdminCar(await request<Row>(`/cars/${encodeURIComponent(id)}/actions`, { method: "POST", body: action })),
    [adminKeys.cars, queryKeys.cars],
  );

export const useDeleteCar = () =>
  useAdminMutation(
    (id: string) => request(`/cars/${encodeURIComponent(id)}`, { method: "DELETE" }),
    [adminKeys.cars, queryKeys.cars],
  );

export const useDeleteBid = () =>
  useAdminMutation(
    (id: string) => request(`/bids/${encodeURIComponent(id)}`, { method: "DELETE" }),
    [adminKeys.cars, queryKeys.cars],
  );

export const useUpdateMessage = () =>
  useAdminMutation(
    ({ kind, id, ...patch }: { kind: InboxItem["kind"]; id: string; status?: MessageStatus; note?: string }) =>
      request(`/messages/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    [adminKeys.messages],
  );

export const useDeleteMessage = () =>
  useAdminMutation(
    ({ kind, id }: { kind: InboxItem["kind"]; id: string }) =>
      request(`/messages/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    [adminKeys.messages],
  );

export const useUpdateBooking = () =>
  useAdminMutation(
    ({ id, ...patch }: { id: string; status?: BookingStatus; note?: string }) =>
      request(`/bookings/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    [adminKeys.bookings],
  );

export const useDeleteBooking = () =>
  useAdminMutation(
    (id: string) => request(`/bookings/${encodeURIComponent(id)}`, { method: "DELETE" }),
    [adminKeys.bookings],
  );

export type ContentType = "services" | "faqs" | "reviews";
const contentPublicKey = { services: queryKeys.services, faqs: queryKeys.faqs, reviews: queryKeys.reviews };

export function useSaveContent(type: ContentType) {
  return useAdminMutation(
    ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      request(id ? `/content/${type}/${encodeURIComponent(id)}` : `/content/${type}`, {
        method: id ? "PUT" : "POST",
        body: data,
      }),
    [adminKeys.content, contentPublicKey[type]],
  );
}

export function useDeleteContent(type: ContentType) {
  return useAdminMutation(
    (id: string) => request(`/content/${type}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    [adminKeys.content, contentPublicKey[type]],
  );
}

export function useReorderContent(type: ContentType) {
  return useAdminMutation(
    (ids: string[]) => request(`/content/${type}/reorder`, { method: "POST", body: { ids } }),
    [adminKeys.content, contentPublicKey[type]],
  );
}

export const useSaveSettings = () =>
  useAdminMutation(
    (settings: SiteSettings) => request<SiteSettings>("/settings", { method: "PUT", body: settings }),
    [queryKeys.settings],
  );

/** Sparad beskärning för en uppladdad bild (för att kunna beskära om). */
export const fetchImageMeta = (id: string) =>
  request<{ id: string; width: number; height: number; crop: Record<string, number> | null }>(
    `/images/${encodeURIComponent(id)}`,
  );

export type { CarStatus };
