import { useMemo, useState } from "react";
import { CalendarDays, Check, Download, Mail, Phone, StickyNote, UserX, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useBookings, useDeleteBooking, useUpdateBooking, type AdminBooking, type BookingStatus } from "../api";
import { downloadCsv, telHref } from "../helpers";
import { ActionMenu, Btn, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pill, SearchField, Segmented, Sheet, TextArea, useFeedback, useRun, type Tone } from "../ui";

type View = "upcoming" | "today" | "past" | "cancelled";

const STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  booked: { label: "Bokad", tone: "blue" },
  done: { label: "Klar", tone: "green" },
  cancelled: { label: "Avbokad", tone: "gray" },
  no_show: { label: "Uteblev", tone: "red" },
};

const todayIso = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function dayLabel(date: string) {
  const today = todayIso();
  const tomorrow = todayIso(1);
  const d = new Date(`${date}T12:00:00`);
  const long = d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  if (date === today) return `Idag · ${long}`;
  if (date === tomorrow) return `I morgon · ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

export function BookingsPage() {
  const { data, isLoading, error, refetch } = useBookings();
  const [view, setView] = useState<View>("upcoming");
  const [q, setQ] = useState("");
  const [noteFor, setNoteFor] = useState<AdminBooking | null>(null);
  const today = todayIso();

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      today: all.filter((b) => b.date === today && b.status === "booked").length,
      upcoming: all.filter((b) => b.date >= today && b.status === "booked").length,
    };
  }, [data, today]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data ?? [])
      .filter((b) => {
        if (view === "cancelled") return b.status === "cancelled";
        if (b.status === "cancelled") return false;
        if (view === "today") return b.date === today;
        if (view === "upcoming") return b.date >= today;
        return b.date < today;
      })
      .filter((b) => !term || `${b.name} ${b.phone} ${b.email} ${b.regNumber ?? ""} ${b.serviceName}`.toLowerCase().includes(term))
      .sort((a, b) => (view === "past" ? b.date.localeCompare(a.date) || a.time.localeCompare(b.time) : a.date.localeCompare(b.date) || a.time.localeCompare(b.time)));
    const map = new Map<string, AdminBooking[]>();
    for (const b of list) map.set(b.date, [...(map.get(b.date) ?? []), b]);
    return [...map.entries()];
  }, [data, view, q, today]);

  function exportCsv() {
    downloadCsv(`bokningar-${today}.csv`, [
      ["Datum", "Tid", "Tjänst", "Namn", "Telefon", "E-post", "Regnr", "Övrigt", "Status"],
      ...groups.flatMap(([, list]) => list.map((b) => [b.date, b.time, b.serviceName, b.name, b.phone, b.email, b.regNumber, b.notes, STATUS[b.status].label])),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Bokningar"
        subtitle={`${counts.today} idag · ${counts.upcoming} kommande`}
        actions={
          <Btn icon={<Download size={16} />} onClick={exportCsv} disabled={groups.length === 0}>
            Exportera
          </Btn>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "upcoming", label: "Kommande", count: counts.upcoming },
            { value: "today", label: "Idag", count: counts.today },
            { value: "past", label: "Tidigare" },
            { value: "cancelled", label: "Avbokade" },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Sök namn, regnr …" />
      </div>

      {error && <ErrorBlock error={error} retry={() => refetch()} />}
      {isLoading && <LoadingBlock />}
      {data && groups.length === 0 && (
        <Card>
          <EmptyState icon={<CalendarDays size={26} />} title="Inga bokningar" text={view === "today" ? "Inga bokningar idag." : undefined} />
        </Card>
      )}

      <div className="space-y-6">
        {groups.map(([date, list]) => (
          <section key={date}>
            <h2 className={cn("mb-2 px-1 text-[15px] font-semibold", date === today ? "text-ios-blue" : "text-ios-label")}>{dayLabel(date)}</h2>
            <Card padded={false} className="divide-y divide-black/[.05] overflow-hidden">
              {list.map((b) => (
                <BookingRow key={b.id} b={b} onNote={() => setNoteFor(b)} />
              ))}
            </Card>
          </section>
        ))}
      </div>

      {noteFor && <NoteSheet booking={noteFor} onClose={() => setNoteFor(null)} />}
    </div>
  );
}

function BookingRow({ b, onNote }: { b: AdminBooking; onNote: () => void }) {
  const update = useUpdateBooking();
  const del = useDeleteBooking();
  const run = useRun();
  const { confirm } = useFeedback();
  const setStatus = (status: BookingStatus, msg: string) => run(() => update.mutateAsync({ id: b.id, status }), msg);

  async function cancel() {
    const ok = await confirm({
      title: "Avboka tiden?",
      message: `${b.name} ${b.time}. Tiden blir ledig igen för andra att boka. Kom ihåg att meddela kunden.`,
      confirmLabel: "Avboka",
      destructive: true,
    });
    if (ok) setStatus("cancelled", "Bokningen är avbokad");
  }

  async function remove() {
    const ok = await confirm({ title: "Ta bort bokningen permanent?", confirmLabel: "Ta bort", destructive: true });
    if (ok) run(() => del.mutateAsync(b.id), "Bokningen är borttagen");
  }

  return (
    <div className={cn("flex gap-4 px-4 py-3.5 sm:px-5", b.status === "cancelled" && "opacity-60")}>
      <div className="w-14 shrink-0 pt-0.5 text-center">
        <p className="text-[17px] font-semibold tabular-nums">{b.time}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold">{b.serviceName}</p>
          {b.status !== "booked" && <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>}
          {b.regNumber && <span className="rounded-[5px] border border-ios-separator px-1.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-ios-label">{b.regNumber}</span>}
        </div>
        <p className="text-[14px] text-ios-label">{b.name}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-[13px]">
          <a href={telHref(b.phone)} className="flex items-center gap-1 text-ios-blue">
            <Phone size={12} /> {b.phone}
          </a>
          <a href={`mailto:${b.email}`} className="flex items-center gap-1 text-ios-blue">
            <Mail size={12} /> {b.email}
          </a>
        </div>
        {b.notes && <p className="mt-1.5 rounded-[10px] bg-ios-fill2 px-3 py-2 text-[13px] text-ios-secondary">”{b.notes}”</p>}
        {b.note && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-ios-orange">
            <StickyNote size={13} className="mt-0.5 shrink-0" /> {b.note}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {b.status === "booked" && (
          <Btn size="sm" variant="tinted" icon={<Check size={14} />} onClick={() => setStatus("done", "Markerad som klar")} className="hidden sm:inline-flex">
            Klar
          </Btn>
        )}
        <ActionMenu
          items={[
            { label: "Markera som klar", icon: <Check size={16} />, onClick: () => setStatus("done", "Markerad som klar"), hidden: b.status === "done" },
            { label: "Kunden uteblev", icon: <UserX size={16} />, onClick: () => setStatus("no_show", "Markerad som utebliven"), hidden: b.status === "no_show" },
            { label: "Återställ till bokad", icon: <CalendarDays size={16} />, onClick: () => setStatus("booked", "Bokningen är återställd"), hidden: b.status === "booked" },
            { label: b.note ? "Ändra anteckning" : "Lägg till anteckning", icon: <StickyNote size={16} />, onClick: onNote },
            { label: "Avboka", icon: <X size={16} />, onClick: cancel, destructive: true, hidden: b.status === "cancelled" },
            { label: "Ta bort", icon: <X size={16} />, onClick: remove, destructive: true, hidden: b.status !== "cancelled" },
          ]}
        />
      </div>
    </div>
  );
}

function NoteSheet({ booking, onClose }: { booking: AdminBooking; onClose: () => void }) {
  const [note, setNote] = useState(booking.note);
  const update = useUpdateBooking();
  const run = useRun();
  return (
    <Sheet
      open
      onClose={onClose}
      title="Anteckning"
      size="sm"
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn
            variant="primary"
            loading={update.isPending}
            onClick={async () => {
              if ((await run(() => update.mutateAsync({ id: booking.id, note }), "Anteckningen är sparad")) !== undefined) onClose();
            }}
          >
            Spara
          </Btn>
        </>
      }
    >
      <div className="p-5">
        <p className="mb-3 text-[14px] text-ios-secondary">
          {booking.name} · {booking.serviceName} {booking.time}
        </p>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Syns bara i admin" autoFocus />
      </div>
    </Sheet>
  );
}
