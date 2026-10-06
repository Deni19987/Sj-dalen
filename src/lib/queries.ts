import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBooking,
  createContactMessage,
  createSellRequest,
  fetchBookedSlots,
  fetchCars,
  fetchFaqs,
  fetchReviews,
  fetchServices,
  placeBid,
} from "./api";
import { supabase } from "./supabase";

export const queryKeys = {
  services: ["services"] as const,
  cars: ["cars"] as const,
  reviews: ["reviews"] as const,
  faqs: ["faqs"] as const,
  bookedSlots: (date: string) => ["booked-slots", date] as const,
};

export const useServices = () =>
  useQuery({ queryKey: queryKeys.services, queryFn: fetchServices, staleTime: 10 * 60_000 });

export const useCars = () => useQuery({ queryKey: queryKeys.cars, queryFn: fetchCars });

export const useReviews = () =>
  useQuery({ queryKey: queryKeys.reviews, queryFn: fetchReviews, staleTime: 10 * 60_000 });

export const useFaqs = () =>
  useQuery({ queryKey: queryKeys.faqs, queryFn: fetchFaqs, staleTime: 10 * 60_000 });

export const useBookedSlots = (date: string | null) =>
  useQuery({
    queryKey: queryKeys.bookedSlots(date ?? ""),
    queryFn: () => fetchBookedSlots(date!),
    enabled: !!date,
  });

export function usePlaceBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { carId: string; name: string; amount: number }) =>
      placeBid(v.carId, v.name, v.amount),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.cars }),
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSuccess: (b) => qc.invalidateQueries({ queryKey: queryKeys.bookedSlots(b.date) }),
  });
}

export const useCreateSellRequest = () => useMutation({ mutationFn: createSellRequest });

export const useCreateContactMessage = () => useMutation({ mutationFn: createContactMessage });

/** Live-uppdatera auktionen när någon annan lägger bud (Supabase Realtime). */
export function useAuctionRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("auction")
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, () =>
        qc.invalidateQueries({ queryKey: queryKeys.cars }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "cars" }, () =>
        qc.invalidateQueries({ queryKey: queryKeys.cars }),
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [qc]);
}
