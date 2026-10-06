import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Button } from "../components/Button";
import { PageHero } from "../components/PageHero";
import { slotsFor, upcomingWorkdays } from "../lib/booking";
import { cn } from "../lib/cn";
import { formatLongDate, formatShortDate, formatWeekday } from "../lib/format";
import { useBookedSlots, useCreateBooking, useServices } from "../lib/queries";
import type { Booking } from "../lib/types";
import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/boka");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT =
  "w-full rounded-lg border border-graphite-200 px-3 py-2.5 outline-none focus:border-blue-500";
const STEP = "mb-4 font-display text-lg font-extrabold uppercase tracking-tight text-graphite-900";

export function BookingPage() {
  const { service: initialService } = route.useSearch();
  const { data: services = [] } = useServices();
  const createBooking = useCreateBooking();
  const days = useMemo(() => upcomingWorkdays(10), []);

  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);

  const { data: booked = [] } = useBookedSlots(date);
  const slots = date ? slotsFor(date, booked) : [];
  const service = services.find((s) => s.id === serviceId);
  const valid =
    !!serviceId &&
    !!date &&
    !!time &&
    name.trim().length > 1 &&
    phone.trim().length >= 6 &&
    EMAIL_RE.test(email);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !service || !date || !time || createBooking.isPending) return;
    createBooking.mutate(
      {
        serviceId,
        serviceName: service.name,
        date,
        time,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        regNumber: regNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      { onSuccess: setBooking },
    );
  }

  function reset() {
    setBooking(null);
    setServiceId("");
    setDate(null);
    setTime(null);
    setName("");
    setPhone("");
    setEmail("");
    setRegNumber("");
    setNotes("");
    createBooking.reset();
  }

  if (booking)
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white">
          <CircleCheck size={32} />
        </span>
        <h1 className="mt-6 font-display text-3xl font-extrabold uppercase tracking-tight text-graphite-900">
          Tid bokad!
        </h1>
        <p className="mt-3 text-graphite-600">
          Vi bekräftar din tid inom en arbetsdag på {booking.email}. Bokningsnummer:{" "}
          <span className="font-mono font-semibold text-graphite-900">{booking.id}</span>
        </p>
        <div className="mt-8 rounded-2xl bg-white p-6 text-left shadow-card">
          <dl className="space-y-2 text-sm">
            {[
              ["Tjänst", booking.serviceName],
              ["Datum", formatLongDate(booking.date)],
              ["Tid", booking.time],
              ["Namn", booking.name],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-graphite-500">{label}</dt>
                <dd className="font-semibold text-graphite-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to="/" variant="outline">
            Till startsidan
          </Button>
          <Button onClick={reset}>Boka en till tid</Button>
        </div>
      </div>
    );

  return (
    <div>
      <PageHero
        kicker="Boka tid"
        title="Välj tjänst, datum och tid"
        subtitle="Tar under två minuter. Ingen betalning krävs för att boka."
      />
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-10 px-4 py-14 sm:px-6">
        <section>
          <h2 className={STEP}>1. Vilken tjänst?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setServiceId(s.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  serviceId === s.id
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-800"
                    : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300",
                )}
              >
                {s.name}
                <span className="ml-2 text-graphite-400">från {s.priceFrom.toLocaleString("sv-SE")} kr</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className={STEP}>2. Vilket datum?</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map((d) => (
              <button
                key={d.iso}
                type="button"
                onClick={() => {
                  setDate(d.iso);
                  setTime(null);
                }}
                className={cn(
                  "flex w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-3 text-sm transition-colors",
                  date === d.iso
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300",
                )}
              >
                <span className="text-xs uppercase text-graphite-400">{formatWeekday(d.iso)}</span>
                <span className="font-display font-bold">{formatShortDate(d.iso)}</span>
              </button>
            ))}
          </div>
        </section>

        {date && (
          <section>
            <h2 className={STEP}>3. Vilken tid?</h2>
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => setTime(slot.time)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                    !slot.available &&
                      "cursor-not-allowed border-graphite-100 bg-graphite-50 text-graphite-300 line-through",
                    slot.available && time === slot.time && "border-blue-500 bg-blue-500 text-white",
                    slot.available &&
                      time !== slot.time &&
                      "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300",
                  )}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className={STEP}>4. Dina uppgifter</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-graphite-700">Namn *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-graphite-700">Telefon *</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required className={INPUT} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-graphite-700">E-post *</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={INPUT}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-graphite-700">Registreringsnummer</span>
              <input
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className={INPUT}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold text-graphite-700">Övrigt att veta</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={INPUT} />
            </label>
          </div>
        </section>

        <Button type="submit" size="lg" disabled={!valid || createBooking.isPending} className="w-full sm:w-auto">
          Bekräfta bokning <ArrowRight size={18} />
        </Button>
        {!valid && (
          <p className="text-sm text-graphite-400">Fyll i tjänst, datum, tid och dina uppgifter för att boka.</p>
        )}
        {createBooking.isError && (
          <p className="text-sm font-semibold text-red-600">{createBooking.error.message}</p>
        )}
      </form>
    </div>
  );
}
