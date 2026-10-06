// Åtgärder för en bil (förläng, avsluta, sälj, lägg ut igen …) – delas av bil-listan och redigeringssidan.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, CopyPlus, ExternalLink, EyeOff, Flag, Pencil, Repeat, Rocket, Timer, Trash2 } from "lucide-react";
import { useCarAction, useDeleteCar, type AdminCar } from "./api";
import { carState, highestBid, kr, telHref } from "./helpers";
import { Btn, Field, Input, Sheet, Toggle, useFeedback, useRun, type MenuItem } from "./ui";

type Dialog = { type: "sell" | "extend" | "relist"; car: AdminCar } | null;

const CHIP = "rounded-full px-3.5 py-1.5 text-[14px] font-medium transition";

export function useCarActions({ onDeleted }: { onDeleted?: () => void } = {}) {
  const action = useCarAction();
  const del = useDeleteCar();
  const run = useRun();
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);

  function menuItems(car: AdminCar, { includeEdit = true } = {}): MenuItem[] {
    const state = carState(car);
    return [
      { label: "Redigera", icon: <Pencil size={16} />, onClick: () => navigate({ to: "/admin/bilar/$id", params: { id: car.id } }), hidden: !includeEdit },
      { label: "Visa på webbplatsen", icon: <ExternalLink size={16} />, onClick: () => window.open(`/auktion/${car.id}`, "_blank"), hidden: state === "draft" },
      { label: "Publicera", icon: <Rocket size={16} />, onClick: () => publish(car), hidden: state !== "draft" },
      { label: "Förläng auktionen", icon: <Timer size={16} />, onClick: () => setDialog({ type: "extend", car }), hidden: state !== "live" && state !== "ending" && state !== "ended" },
      { label: "Avsluta nu", icon: <Flag size={16} />, onClick: () => endNow(car), hidden: state !== "live" && state !== "ending" },
      { label: "Markera som såld", icon: <BadgeCheck size={16} />, onClick: () => setDialog({ type: "sell", car }), hidden: state === "sold" || state === "draft" },
      { label: "Lägg ut igen", icon: <Repeat size={16} />, onClick: () => setDialog({ type: "relist", car }), hidden: state !== "ended" && state !== "sold" },
      { label: "Duplicera", icon: <CopyPlus size={16} />, onClick: () => duplicate(car) },
      { label: "Gör till utkast", icon: <EyeOff size={16} />, onClick: () => unpublish(car), hidden: state === "draft" || state === "sold" },
      { label: "Ta bort", icon: <Trash2 size={16} />, onClick: () => remove(car), destructive: true },
    ];
  }

  const publish = (car: AdminCar) => run(() => action.mutateAsync({ id: car.id, action: "publish" }), "Bilen är publicerad");

  async function unpublish(car: AdminCar) {
    const ok = await confirm({
      title: "Gör till utkast?",
      message: "Bilen försvinner från webbplatsen tills du publicerar den igen. Bud finns kvar.",
      confirmLabel: "Gör till utkast",
    });
    if (ok) run(() => action.mutateAsync({ id: car.id, action: "unpublish" }), "Bilen är nu ett utkast");
  }

  async function endNow(car: AdminCar) {
    const ok = await confirm({
      title: "Avsluta auktionen nu?",
      message: "Inga fler bud kan läggas. Du kan sedan markera bilen som såld eller lägga ut den igen.",
      confirmLabel: "Avsluta",
      destructive: true,
    });
    if (ok) run(() => action.mutateAsync({ id: car.id, action: "end" }), "Auktionen är avslutad");
  }

  async function duplicate(car: AdminCar) {
    const copy = await run(() => action.mutateAsync({ id: car.id, action: "duplicate" }), "Kopia skapad som utkast");
    if (copy) navigate({ to: "/admin/bilar/$id", params: { id: copy.id } });
  }

  async function remove(car: AdminCar) {
    const ok = await confirm({
      title: `Ta bort ${car.title}?`,
      message: `Bilen, dess bilder och ${car.bids.length} bud tas bort permanent. Det går inte att ångra.`,
      confirmLabel: "Ta bort",
      destructive: true,
    });
    if (!ok) return;
    const res = await run(() => del.mutateAsync(car.id), "Bilen är borttagen");
    if (res) onDeleted?.();
  }

  const sheets = (
    <>
      {dialog?.type === "sell" && <SellSheet car={dialog.car} onClose={() => setDialog(null)} />}
      {dialog?.type === "extend" && <ExtendSheet car={dialog.car} onClose={() => setDialog(null)} />}
      {dialog?.type === "relist" && <RelistSheet car={dialog.car} onClose={() => setDialog(null)} />}
    </>
  );

  return { menuItems, sheets, openDialog: setDialog, publish };
}

function SellSheet({ car, onClose }: { car: AdminCar; onClose: () => void }) {
  const top = highestBid(car);
  const [price, setPrice] = useState(String(top?.amount ?? car.startPrice));
  const action = useCarAction();
  const run = useRun();
  const below = car.reservePrice != null && Number(price) < car.reservePrice;

  async function save() {
    const ok = await run(() => action.mutateAsync({ id: car.id, action: "sell", price: Number(price) }), "Markerad som såld");
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Markera som såld"
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn variant="primary" loading={action.isPending} disabled={!(Number(price) >= 0) || price === ""} onClick={save}>
            Markera såld
          </Btn>
        </>
      }
    >
      <div className="space-y-5 p-5">
        <p className="text-[15px] text-ios-secondary">{car.title}</p>
        {top ? (
          <div className="rounded-[14px] bg-white p-4">
            <p className="text-[13px] font-medium text-ios-secondary">Högsta bud</p>
            <p className="text-[22px] font-semibold tracking-tight">{kr(top.amount)}</p>
            <p className="mt-1 text-[15px] font-medium">{top.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 text-[14px]">
              {top.phone && (
                <a className="text-ios-blue" href={telHref(top.phone)}>
                  {top.phone}
                </a>
              )}
              {top.email && (
                <a className="text-ios-blue" href={`mailto:${top.email}?subject=${encodeURIComponent(`Ditt bud på ${car.title}`)}`}>
                  {top.email}
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-[14px] bg-white p-4 text-[15px] text-ios-secondary">Bilen har inga bud – ange priset den såldes för.</p>
        )}
        <Field label="Slutpris" hint={below ? `Under reservationspriset (${kr(car.reservePrice!)}).` : "Visas på sidan Sålda bilar."}>
          <Input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} suffix="kr" autoFocus />
        </Field>
      </div>
    </Sheet>
  );
}

function ExtendSheet({ car, onClose }: { car: AdminCar; onClose: () => void }) {
  const [hours, setHours] = useState(24);
  const action = useCarAction();
  const run = useRun();
  const options = [
    { h: 1, label: "1 timme" },
    { h: 6, label: "6 timmar" },
    { h: 24, label: "1 dag" },
    { h: 72, label: "3 dagar" },
    { h: 168, label: "1 vecka" },
  ];
  const base = Math.max(Date.now(), new Date(car.endsAt).getTime());
  const newEnd = new Date(base + hours * 3_600_000);

  async function save() {
    const ok = await run(() => action.mutateAsync({ id: car.id, action: "extend", hours }), "Auktionen är förlängd");
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Förläng auktionen"
      size="sm"
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn variant="primary" loading={action.isPending} onClick={save}>
            Förläng
          </Btn>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button key={o.h} type="button" onClick={() => setHours(o.h)} className={`${CHIP} ${hours === o.h ? "bg-ios-blue text-white" : "bg-white text-ios-label"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[15px] text-ios-secondary">
          Ny sluttid:{" "}
          <span className="font-semibold text-ios-label">
            {newEnd.toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </p>
      </div>
    </Sheet>
  );
}

function RelistSheet({ car, onClose }: { car: AdminCar; onClose: () => void }) {
  const [days, setDays] = useState(7);
  const [clearBids, setClearBids] = useState(true);
  const action = useCarAction();
  const run = useRun();

  async function save() {
    const ok = await run(() => action.mutateAsync({ id: car.id, action: "relist", days, clearBids }), "Bilen är utlagd igen");
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Lägg ut igen"
      size="sm"
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn variant="primary" loading={action.isPending} onClick={save}>
            Starta ny auktion
          </Btn>
        </>
      }
    >
      <div className="space-y-5 p-5">
        <Field label="Auktionens längd">
          <div className="flex flex-wrap gap-2">
            {[3, 5, 7, 10, 14].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} className={`${CHIP} ${days === d ? "bg-ios-blue text-white" : "bg-white text-ios-label"}`}>
                {d} dagar
              </button>
            ))}
          </div>
        </Field>
        <div className="rounded-[14px] bg-white px-4 py-3">
          <Toggle
            checked={clearBids}
            onChange={setClearBids}
            label="Rensa tidigare bud"
            description={car.bids.length ? `${car.bids.length} bud tas bort` : "Inga bud att rensa"}
          />
        </div>
      </div>
    </Sheet>
  );
}
