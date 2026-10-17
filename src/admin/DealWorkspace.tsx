import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, CalendarClock, Check, ExternalLink, Mail, MessageCircle, Phone, Repeat, Trophy } from "lucide-react";
import { AUCTION_DEFAULTS } from "../lib/auction";
import { cn } from "../lib/cn";
import { useSettings } from "../lib/queries";
import { chatAdminApi, useCarAction, useDealInfo, useDealStep, type AdminCar, type DealStep } from "./api";
import { dealSteps, topBid, type DealStepInfo } from "./deal";
import { fmtDateTime, kr, telHref } from "./helpers";
import { Btn, Card, Input, TextArea, useFeedback, useRun } from "./ui";

const day = (d: Date) => d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
const TRANSPORTSTYRELSEN_AGARBYTE = "https://www.transportstyrelsen.se/sv/vagtrafik/fordon/agarbyte/";

/**
 * Bilens sida när auktionen är slut eller bilen är såld: en checklista för att göra klart affären,
 * från "Godkänn försäljningen" till "Bilen hämtad". Nästa steg är utfällt med det man behöver göra.
 */
export function DealWorkspace({ car, onSell, onRelist }: { car: AdminCar; onSell: () => void; onRelist: () => void }) {
  const { data: settings } = useSettings();
  const terms = { ...AUCTION_DEFAULTS, ...settings?.auction };
  const steps = dealSteps(car, terms);
  const current = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  const top = topBid(car);
  const price = car.soldPrice ?? top?.amount;
  const complete = current === -1;

  return (
    <Card id="affar" className="mb-6 scroll-mt-24">
      {/* Huvud: köparen och slutpriset */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ios-orange">
            <Trophy size={15} /> {car.status === "sold" ? "Såld" : "Auktionen är slut"}
          </p>
          <h2 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">
            {top ? (
              <>
                {car.status === "sold" ? "Köpare" : "Högst bud"}: {top.name}
              </>
            ) : (
              "Inga bud"
            )}
          </h2>
          {price != null && <p className="text-[17px] font-semibold tabular-nums text-ios-blue">{kr(price)}</p>}
        </div>
        {/* Kontaktknapparna finns i steget "Kontakta köparen" när det är aktuellt */}
        {top && steps[current]?.key !== "contactedAt" && (
          <div className="flex flex-wrap gap-2">
            {top.phone && (
              <a href={telHref(top.phone)} className="flex h-9 items-center gap-1.5 rounded-full bg-ios-fill2 px-3.5 text-[14px] font-medium text-ios-blue">
                <Phone size={15} /> {top.phone}
              </a>
            )}
            {top.email && (
              <a href={`mailto:${top.email}`} className="flex h-9 items-center gap-1.5 rounded-full bg-ios-fill2 px-3.5 text-[14px] font-medium text-ios-blue">
                <Mail size={15} /> Mejla
              </a>
            )}
            <Link to="/admin/inkorg" className="flex h-9 items-center gap-1.5 rounded-full bg-ios-fill2 px-3.5 text-[14px] font-medium text-ios-blue">
              <MessageCircle size={15} /> Inkorg
            </Link>
          </div>
        )}
      </div>

      {/* Hur långt man kommit */}
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-[13px]">
          <span className="font-medium">{complete ? "Affären är klar" : `Nästa: ${steps[current].label}`}</span>
          <span className="tabular-nums text-ios-secondary">
            {doneCount} av {steps.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ios-fill">
          <div
            className={cn("h-full origin-left rounded-full transition-transform duration-500 ease-ios", complete ? "bg-ios-green" : "bg-ios-blue")}
            style={{ transform: `scaleX(${doneCount / steps.length})` }}
          />
        </div>
      </div>

      {complete ? (
        <div className="mt-5 flex animate-ios-fade items-center gap-3 rounded-[14px] bg-ios-green/10 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-green text-white">
            <Check size={22} strokeWidth={3} />
          </span>
          <div>
            <p className="text-[15px] font-semibold">Affären är klar</p>
            <p className="text-[13px] text-ios-secondary">
              Bilen hämtades {fmtDateTime(car.deal.pickedUpAt!)}. Den syns under Sålda bilar på webbplatsen.
            </p>
          </div>
        </div>
      ) : (
        <ol className="mt-4">
          {steps.map((s, i) => (
            <StepRow
              key={s.key}
              car={car}
              step={s}
              index={i}
              state={i < current ? "done" : i === current ? "current" : s.done ? "done" : "upcoming"}
              last={i === steps.length - 1}
              canUndo={s.done && (i === steps.length - 1 || !steps[i + 1].done)}
            >
              {i === current && <StepBody car={car} step={s} terms={terms} onSell={onSell} onRelist={onRelist} />}
            </StepRow>
          ))}
        </ol>
      )}

      <DealNote car={car} />
    </Card>
  );
}

function StepRow({
  car,
  step,
  index,
  state,
  last,
  canUndo,
  children,
}: {
  car: AdminCar;
  step: DealStepInfo;
  index: number;
  state: "done" | "current" | "upcoming";
  last: boolean;
  canUndo: boolean;
  children?: ReactNode;
}) {
  const toggle = useDealStep();
  const run = useRun();
  const late = !step.done && step.due && step.due.getTime() < Date.now();
  const undo = () => step.key !== "sold" && run(() => toggle.mutateAsync({ id: car.id, step: step.key as DealStep, done: false }));

  return (
    <li className="relative flex gap-3">
      {/* Tidslinje */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={canUndo && step.key !== "sold" ? undo : undefined}
          disabled={!(canUndo && step.key !== "sold")}
          title={canUndo && step.key !== "sold" ? "Ångra" : undefined}
          className={cn(
            "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-semibold transition-colors duration-200",
            state === "done" && "border-ios-green bg-ios-green text-white",
            state === "current" && "border-ios-blue bg-white text-ios-blue",
            state === "upcoming" && "border-ios-separator bg-white text-ios-tertiary",
          )}
        >
          {state === "done" ? <Check size={15} strokeWidth={3} /> : index + 1}
        </button>
        {!last && <span className={cn("w-0.5 flex-1", state === "done" ? "bg-ios-green" : "bg-ios-fill")} />}
      </div>
      <div className={cn("min-w-0 flex-1", last ? "pb-1" : "pb-5")}>
        <p className={cn("pt-0.5 text-[15px] font-semibold", state === "upcoming" && "text-ios-tertiary")}>{step.label}</p>
        {state === "done" && step.doneAt && <p className="text-[12px] text-ios-tertiary">{fmtDateTime(step.doneAt)}</p>}
        {state === "upcoming" && step.due && (
          <p className={cn("text-[12px]", late ? "font-medium text-ios-red" : "text-ios-tertiary")}>Senast {day(step.due)}</p>
        )}
        {children && <div className="mt-2 animate-ios-fade">{children}</div>}
      </div>
    </li>
  );
}

function StepBody({
  car,
  step,
  terms,
  onSell,
  onRelist,
}: {
  car: AdminCar;
  step: DealStepInfo;
  terms: { paymentDays: number; pickupDays: number; paymentInfo?: string };
  onSell: () => void;
  onRelist: () => void;
}) {
  const toggle = useDealStep();
  const info = useDealInfo();
  const action = useCarAction();
  const run = useRun();
  const { confirm } = useFeedback();
  const top = topBid(car);
  const price = car.soldPrice ?? top?.amount ?? 0;
  const first = top?.name.split(" ")[0] ?? "";
  const late = step.due && step.due.getTime() < Date.now();
  const markDone = (key: DealStep, msg?: string) => run(() => toggle.mutateAsync({ id: car.id, step: key, done: true }), msg);
  const [pickupTime, setPickupTime] = useState(car.deal.pickupTime ?? "");

  const hint = (text: ReactNode) => <p className="text-[14px] leading-relaxed text-ios-secondary">{text}</p>;

  switch (step.key) {
    case "sold": {
      if (!top)
        return (
          <div className="space-y-3">
            {hint("Ingen lade bud. Lägg ut bilen igen, gärna med lägre utropspris eller längre auktionstid.")}
            <Btn variant="primary" icon={<Repeat size={16} />} onClick={onRelist}>
              Lägg ut igen
            </Btn>
          </div>
        );
      const reserveMissed = car.reservePrice != null && top.amount < car.reservePrice;
      async function sell() {
        const ok = await confirm({
          title: `Sälj till ${top!.name}?`,
          message: `Bilen markeras som såld för ${kr(top!.amount)} och visas under Sålda bilar.`,
          confirmLabel: "Sälj",
        });
        if (ok) run(() => action.mutateAsync({ id: car.id, action: "sell", price: top!.amount }), "Bilen är såld – nästa steg: kontakta köparen");
      }
      return (
        <div className="space-y-3">
          {reserveMissed
            ? hint(
                <>
                  Högsta budet når inte reservationspriset ({kr(car.reservePrice!)}). Budet gäller två arbetsdagar efter avslut – du
                  kan godta det, sälja för ett annat pris efter kontakt med budgivaren, eller lägga ut bilen igen.
                </>,
              )
            : hint(`${top.name} vann auktionen med ${kr(top.amount)}. Godkänn försäljningen för att gå vidare.`)}
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" icon={<BadgeCheck size={16} />} onClick={sell}>
              Sälj för {kr(top.amount)}
            </Btn>
            <Btn variant="tinted" onClick={onSell}>
              Annat pris
            </Btn>
            <Btn variant="plain" icon={<Repeat size={16} />} onClick={onRelist}>
              Lägg ut igen
            </Btn>
          </div>
        </div>
      );
    }

    case "contactedAt":
      return <ContactStep car={car} terms={terms} onDone={() => markDone("contactedAt", "Bra – nu väntar vi på betalningen")} />;

    case "paidAt":
      return (
        <div className="space-y-3">
          {hint(
            <>
              Kontrollera att <strong className="text-ios-label">{kr(price)}</strong> har kommit in.{" "}
              {step.due && (
                <span className={cn(late && "font-medium text-ios-red")}>
                  {late ? "Försenad – skulle varit betald" : "Senast"} {day(step.due)}.
                </span>
              )}
            </>,
          )}
          <Btn variant="primary" icon={<Check size={16} />} onClick={() => markDone("paidAt", "Betalningen är registrerad")}>
            Betalningen har kommit in
          </Btn>
        </div>
      );

    case "pickupBookedAt":
      return (
        <div className="space-y-3">
          {hint(`Boka en tid då ${first || "köparen"} hämtar bilen – inom ${terms.pickupDays} dagar efter betalningen.`)}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full max-w-[240px]">
              <Input type="datetime-local" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} aria-label="Tid för hämtning" />
            </div>
            <Btn
              variant="primary"
              icon={<CalendarClock size={16} />}
              disabled={!pickupTime}
              onClick={() =>
                run(async () => {
                  await info.mutateAsync({ id: car.id, pickupTime });
                  await toggle.mutateAsync({ id: car.id, step: "pickupBookedAt", done: true });
                }, "Hämtningen är bokad")
              }
            >
              Boka
            </Btn>
          </div>
        </div>
      );

    case "ownershipAt":
      return (
        <div className="space-y-3">
          {car.deal.pickupTime && (
            <p className="flex items-center gap-2 text-[14px] font-medium">
              <CalendarClock size={16} className="text-ios-blue" /> Hämtning {fmtDateTime(car.deal.pickupTime)}
            </p>
          )}
          {hint(
            "Gör ägarbytet tillsammans med köparen när bilen hämtas – i Transportstyrelsens e-tjänst eller med registreringsbevisets del 2. Köparen behöver trafikförsäkring från och med ägarbytet.",
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={TRANSPORTSTYRELSEN_AGARBYTE}
              target="_blank"
              rel="noopener"
              className="flex h-10 items-center gap-2 rounded-full bg-ios-blue/10 px-4 text-[15px] font-medium text-ios-blue"
            >
              <ExternalLink size={16} /> Transportstyrelsen
            </a>
            <Btn variant="primary" icon={<Check size={16} />} onClick={() => markDone("ownershipAt", "Ägarbytet är klart")}>
              Ägarbytet är klart
            </Btn>
          </div>
        </div>
      );

    case "pickedUpAt":
      return (
        <div className="space-y-3">
          {hint("Lämna över nycklar, servicebok och papper. Bocka av när bilen har lämnat verkstaden.")}
          <Btn variant="primary" icon={<Check size={16} />} onClick={() => markDone("pickedUpAt", "Affären är klar")}>
            Bilen är hämtad
          </Btn>
        </div>
      );
  }
}

/** Steget "Kontakta köparen": välj chatt, samtal eller mejl – sedan bockar man av. */
function ContactStep({
  car,
  terms,
  onDone,
}: {
  car: AdminCar;
  terms: { paymentDays: number; pickupDays: number; paymentInfo?: string };
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const top = topBid(car);
  const price = car.soldPrice ?? top?.amount ?? 0;
  const first = top?.name.split(" ")[0] ?? "";
  const ref = car.regNumber || car.title;
  const message = [
    `Hej ${first}! Grattis – du har köpt ${car.title} för ${kr(price)}.`,
    terms.paymentInfo
      ? `Betala till ${terms.paymentInfo} inom ${terms.paymentDays} bankdagar och märk betalningen med ${ref}.`
      : `Betala inom ${terms.paymentDays} bankdagar och märk betalningen med ${ref}.`,
    `När betalningen kommit in bokar vi en tid för hämtning. Vi gör ägarbytet tillsammans på plats – ha en trafikförsäkring klar från ägarbytet.`,
    // Utan sparade betalningsuppgifter: sista raden fyller man i själv
    ...(terms.paymentInfo ? [] : ["Betalningsuppgifter: "]),
  ].join("\n\n");

  async function chat() {
    if (!top?.email) return;
    setBusy(true);
    const r = await run(() => chatAdminApi.start({ email: top.email!, name: top.name, phone: top.phone, carId: car.id }));
    setBusy(false);
    if (r) navigate({ to: "/admin/inkorg/$id", params: { id: r.id }, search: { utkast: message } as never });
  }

  const tile =
    "flex flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-ios-fill2 px-3 py-3.5 text-[14px] font-medium text-ios-blue transition-[background-color,transform] duration-150 hover:bg-ios-blue/10 active:scale-[.97] disabled:opacity-50";

  return (
    <div className="space-y-3">
      <p className="text-[14px] leading-relaxed text-ios-secondary">
        Kontakta {first || "köparen"} med betalningsuppgifterna – i chatten, per telefon eller mejl. Betalning ska ske inom{" "}
        {terms.paymentDays} bankdagar.
      </p>
      <div className="flex gap-2">
        {top?.email && (
          <button type="button" onClick={chat} disabled={busy} className={tile}>
            <MessageCircle size={22} /> Chatta
          </button>
        )}
        {top?.phone && (
          <a href={telHref(top.phone)} className={tile}>
            <Phone size={22} /> Ring
          </a>
        )}
        {top?.email && (
          <a
            href={`mailto:${top.email}?subject=${encodeURIComponent(`Ditt köp av ${car.title}`)}&body=${encodeURIComponent(`${message}\n\nHälsningar`)}`}
            className={tile}
          >
            <Mail size={22} /> Mejla
          </a>
        )}
      </div>
      <p className="text-[12px] text-ios-tertiary">
        Chatten öppnas med ett färdigt meddelande om betalningen som du kan ändra innan du skickar. Köparen får det även på mejl.
        {!terms.paymentInfo && " Lägg in bankgiro eller Swish under Innehåll → Kontakt så kommer det med automatiskt."}
      </p>
      <Btn variant="primary" icon={<Check size={16} />} onClick={onDone}>
        Köparen är kontaktad
      </Btn>
    </div>
  );
}

/** Fritext om affären (t.ex. "betalar halva kontant"), sparas när man lämnar fältet. */
function DealNote({ car }: { car: AdminCar }) {
  const info = useDealInfo();
  const run = useRun();
  const [note, setNote] = useState(car.deal.note ?? "");
  useEffect(() => setNote(car.deal.note ?? ""), [car.deal.note]);
  return (
    <div className="mt-5 border-t border-black/[.06] pt-4">
      <p className="mb-1.5 px-1 text-[13px] font-medium text-ios-secondary">Anteckningar om affären</p>
      <TextArea
        value={note}
        rows={2}
        maxLength={2000}
        placeholder="T.ex. överenskommelser med köparen – syns bara här"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (car.deal.note ?? "") && run(() => info.mutateAsync({ id: car.id, note }), "Anteckningen är sparad")}
      />
    </div>
  );
}
