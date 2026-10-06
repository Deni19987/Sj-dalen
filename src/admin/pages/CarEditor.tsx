import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Gavel, Mail, Phone, Plus, Trash2, X } from "lucide-react";
import { CarCard } from "../../components/CarCard";
import { cn } from "../../lib/cn";
import type { BodyType, Car, CarStatus } from "../../lib/types";
import { useAdminCars, useDeleteBid, useSaveCar, type AdminCar, type CarInput } from "../api";
import { useCarActions } from "../CarActions";
import { bidsNewestFirst } from "../../lib/auction";
import { carState, endsInDays, fmtDateTime, kr, num, relativeTime, STATE_LABEL, telHref, toLocalInput } from "../helpers";
import { ImageManager } from "../ImageManager";
import { ActionMenu, Btn, Card, EmptyState, Field, Input, LoadingBlock, Pill, Select, TextArea, Toggle, useFeedback, useRun } from "../ui";

export const PREFILL_KEY = "sjodalen-admin-car-prefill";

const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "kombi", label: "Kombi" },
  { value: "sedan", label: "Sedan" },
  { value: "halvkombi", label: "Halvkombi" },
  { value: "suv", label: "SUV" },
  { value: "skåpbil", label: "Skåpbil" },
];
const FUELS = ["Bensin", "Diesel", "El", "Hybrid", "Laddhybrid", "Gas", "E85"];
const GEARBOXES = ["Manuell", "Automat"];
const MAKES = ["Audi", "BMW", "Citroën", "Ford", "Honda", "Hyundai", "Kia", "Mazda", "Mercedes-Benz", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Renault", "Saab", "Seat", "Skoda", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo"];
const COLORS = [
  { name: "Svart", hex: "#1C1E22" },
  { name: "Vit", hex: "#F1F2F0" },
  { name: "Silver", hex: "#B8BEC4" },
  { name: "Grå", hex: "#6B7078" },
  { name: "Blå", hex: "#2F5D8A" },
  { name: "Röd", hex: "#A3242B" },
  { name: "Grön", hex: "#3D5A40" },
  { name: "Beige", hex: "#C8B79A" },
  { name: "Brun", hex: "#5C4033" },
];

interface Form {
  make: string;
  model: string;
  year: string;
  title: string;
  highlight: string;
  bodyType: BodyType;
  colorName: string;
  colorHex: string;
  mileageKm: string;
  fuel: string;
  gearbox: string;
  inspected: boolean;
  conditionSummary: string;
  highlights: string[];
  thingsToNote: string[];
  description: string;
  startPrice: string;
  minIncrement: string;
  reservePrice: string;
  endsAt: string; // datetime-local
  status: CarStatus;
  soldPrice: string;
  images: string[];
  adminNote: string;
}

function fromCar(car?: AdminCar): Form {
  if (!car) {
    // Förifyllning från en säljförfrågan i inkorgen (tas bort efter första renderingen)
    let prefill: Partial<Form> = {};
    try {
      prefill = JSON.parse(sessionStorage.getItem(PREFILL_KEY) ?? "{}");
    } catch {
      /* ingen förifyllning */
    }
    return {
      make: "",
      model: "",
      year: "",
      title: "",
      highlight: "",
      bodyType: "kombi",
      colorName: "",
      colorHex: "#B8BEC4",
      mileageKm: "",
      fuel: "Bensin",
      gearbox: "Manuell",
      inspected: true,
      conditionSummary: "",
      highlights: [],
      thingsToNote: [],
      description: "",
      startPrice: "",
      minIncrement: "1000",
      reservePrice: "",
      endsAt: toLocalInput(endsInDays(7)),
      status: "draft",
      soldPrice: "",
      images: [],
      adminNote: "",
      ...prefill,
    };
  }
  return {
    make: car.make,
    model: car.model,
    year: String(car.year),
    title: car.title,
    highlight: car.highlight,
    bodyType: car.bodyType,
    colorName: car.colorName,
    colorHex: car.colorHex,
    mileageKm: String(car.mileageKm),
    fuel: car.fuel,
    gearbox: car.gearbox,
    inspected: car.inspected,
    conditionSummary: car.conditionSummary,
    highlights: car.highlights,
    thingsToNote: car.thingsToNote,
    description: car.description,
    startPrice: String(car.startPrice),
    minIncrement: String(car.minIncrement),
    reservePrice: car.reservePrice != null ? String(car.reservePrice) : "",
    endsAt: toLocalInput(car.endsAt),
    status: car.status,
    soldPrice: car.soldPrice != null ? String(car.soldPrice) : "",
    images: car.images,
    adminNote: car.adminNote,
  };
}

const n = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/\s/g, "")));

function toInput(f: Form): CarInput {
  return {
    make: f.make.trim(),
    model: f.model.trim(),
    year: n(f.year),
    title: f.title.trim(),
    highlight: f.highlight.trim(),
    bodyType: f.bodyType,
    colorName: f.colorName.trim(),
    colorHex: f.colorHex,
    mileageKm: n(f.mileageKm),
    fuel: f.fuel,
    gearbox: f.gearbox,
    inspected: f.inspected,
    conditionSummary: f.conditionSummary.trim(),
    highlights: f.highlights.map((h) => h.trim()).filter(Boolean),
    thingsToNote: f.thingsToNote.map((h) => h.trim()).filter(Boolean),
    description: f.description.trim(),
    startPrice: n(f.startPrice),
    minIncrement: n(f.minIncrement),
    reservePrice: f.reservePrice.trim() ? n(f.reservePrice) : null,
    endsAt: new Date(f.endsAt).toISOString(),
    status: f.status,
    soldPrice: f.soldPrice.trim() ? n(f.soldPrice) : undefined,
    images: f.images,
    adminNote: f.adminNote,
  };
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const year = n(f.year);
  if (!f.make.trim()) e.make = "Ange märke";
  if (!f.model.trim()) e.model = "Ange modell";
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) e.year = "Ogiltig årsmodell";
  if (!f.title.trim()) e.title = "Ange en rubrik";
  if (!f.colorName.trim()) e.colorName = "Ange färg";
  if (!Number.isInteger(n(f.mileageKm)) || n(f.mileageKm) < 0) e.mileageKm = "Ange mätarställning";
  if (!Number.isInteger(n(f.startPrice)) || n(f.startPrice) < 0) e.startPrice = "Ange utropspris";
  if (!Number.isInteger(n(f.minIncrement)) || n(f.minIncrement) < 1) e.minIncrement = "Minst 1 kr";
  if (f.reservePrice.trim() && !Number.isInteger(n(f.reservePrice))) e.reservePrice = "Ogiltigt belopp";
  if (!f.endsAt || Number.isNaN(new Date(f.endsAt).getTime())) e.endsAt = "Ange sluttid";
  else if (f.status === "active" && new Date(f.endsAt).getTime() <= Date.now()) e.endsAt = "Sluttiden har redan passerat";
  if (f.status === "sold" && !Number.isInteger(n(f.soldPrice))) e.soldPrice = "Ange slutpris";
  return e;
}

export function CarEditorPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const cars = useAdminCars();
  const car = id ? cars.data?.find((c) => c.id === id) : undefined;

  if (id && cars.isLoading) return <LoadingBlock />;
  if (id && !car)
    return (
      <Card>
        <EmptyState
          icon={<X size={26} />}
          title="Bilen hittades inte"
          text="Den kan ha tagits bort."
          action={
            <Link to="/admin/bilar">
              <Btn variant="tinted">Till alla bilar</Btn>
            </Link>
          }
        />
      </Card>
    );
  return <CarEditor key={id ?? "new"} car={car} />;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-ios-secondary">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

function ListEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...value, draft.trim()]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={item} onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))} />
          <button type="button" aria-label="Ta bort rad" onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-tertiary hover:bg-ios-red/10 hover:text-ios-red">
            <X size={16} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" aria-label="Lägg till rad" onClick={add} disabled={!draft.trim()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ios-blue text-white transition disabled:bg-ios-fill disabled:text-ios-tertiary">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function CarEditor({ car }: { car?: AdminCar }) {
  const navigate = useNavigate();
  const save = useSaveCar();
  const run = useRun();
  const { toast } = useFeedback();
  const { menuItems, sheets } = useCarActions({ onDeleted: () => navigate({ to: "/admin/bilar" }) });
  const [form, setForm] = useState<Form>(() => fromCar(car));
  const [baseline, setBaseline] = useState(() => JSON.stringify(car ? fromCar(car) : form));
  const [titleTouched, setTitleTouched] = useState(!!car);
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const allowLeave = useRef(false);

  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => {
    try {
      sessionStorage.removeItem(PREFILL_KEY);
    } catch {
      /* ignorera */
    }
  }, []);
  const errors = validate(form);
  const err = (k: keyof Form) => (showErrors ? errors[k] : undefined);

  useBlocker({
    shouldBlockFn: () => dirty && !allowLeave.current && !window.confirm("Du har osparade ändringar. Vill du lämna sidan ändå?"),
    enableBeforeUnload: () => dirty,
  });

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  // Rubriken föreslås automatiskt tills man skriver en egen
  useEffect(() => {
    if (titleTouched) return;
    const auto = [form.make, form.model, form.year].map((s) => s.trim()).filter(Boolean).join(" ");
    setForm((f) => (f.title === auto ? f : { ...f, title: auto }));
  }, [form.make, form.model, form.year, titleTouched]);

  const onImages = useCallback((ids: string[]) => setForm((f) => ({ ...f, images: ids })), []);

  async function onSave() {
    if (uploading) return toast("Vänta tills bilderna har laddats upp.", "info");
    if (Object.keys(errors).length) {
      setShowErrors(true);
      toast(Object.values(errors)[0]!, "error");
      return;
    }
    const saved = await run(() => save.mutateAsync({ id: car?.id, input: toInput(form) }), car ? "Ändringarna är sparade" : form.status === "active" ? "Bilen är publicerad" : "Utkastet är sparat");
    if (!saved) return;
    setBaseline(JSON.stringify(form));
    if (!car) {
      allowLeave.current = true;
      navigate({ to: "/admin/bilar/$id", params: { id: saved.id }, replace: true });
    }
  }

  // ⌘S / Ctrl+S sparar
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Live-förhandsvisning av bilkortet som det ser ut på webbplatsen
  const preview: Car = useMemo(() => {
    const i = toInput(form);
    return {
      ...i,
      id: car?.id ?? "forhandsvisning",
      year: Number.isFinite(i.year) ? i.year : 0,
      title: i.title || "Rubrik",
      mileageKm: Number.isFinite(i.mileageKm) ? i.mileageKm : 0,
      startPrice: Number.isFinite(i.startPrice) ? i.startPrice : 0,
      minIncrement: Number.isFinite(i.minIncrement) ? i.minIncrement : 1,
      endsAt: Number.isNaN(new Date(form.endsAt).getTime()) ? new Date().toISOString() : new Date(form.endsAt).toISOString(),
      reservePrice: undefined,
      status: i.status === "draft" ? "active" : i.status,
      bids: car?.bids ?? [],
      extended: car?.extended,
    } as Car;
  }, [form, car]);

  const state = car ? carState(car) : null;
  const endsDate = new Date(form.endsAt);

  return (
    <div>
      {/* Verktygsrad */}
      <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-black/[.06] bg-ios-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          <Link to="/admin/bilar" className="flex items-center text-[17px] text-ios-blue">
            <ChevronLeft size={22} className="-ml-1.5" />
            <span className="hidden sm:inline">Bilar</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{car ? form.title || car.title : "Ny bil"}</p>
            <p className="truncate text-[12px] text-ios-secondary">
              {uploading ? "Laddar upp bilder…" : dirty ? "Osparade ändringar" : car ? `Senast sparad ${relativeTime(car.updatedAt)}` : "Inte sparad ännu"}
            </p>
          </div>
          {state && <Pill tone={STATE_LABEL[state].tone} className="hidden sm:inline-flex">{STATE_LABEL[state].label}</Pill>}
          {car && car.status !== "draft" && (
            <a href={`/auktion/${car.id}`} target="_blank" rel="noopener" className="hidden h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ios-blue hover:bg-ios-blue/10 md:flex">
              <ExternalLink size={14} /> Visa
            </a>
          )}
          {car && <ActionMenu items={menuItems(car, { includeEdit: false })} />}
          <Btn variant="primary" onClick={onSave} loading={save.isPending} disabled={(!dirty && !!car) || uploading}>
            {car ? "Spara" : form.status === "active" ? "Publicera" : "Spara utkast"}
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Section title="Bilder" description="Välj flera bilder på en gång. De beskärs automatiskt till 4:3 – tryck på en bild för att justera.">
            <ImageManager initial={form.images} onChange={onImages} onBusyChange={setUploading} />
          </Section>

          <Section title="Grunduppgifter">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Märke" hint={err("make")}>
                <Input list="car-makes" value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Volvo" className={cn(err("make") && "ring-2 ring-ios-red/60")} />
                <datalist id="car-makes">
                  {MAKES.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>
              <Field label="Modell" hint={err("model")}>
                <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="V70 D4" className={cn(err("model") && "ring-2 ring-ios-red/60")} />
              </Field>
              <Field label="Årsmodell" hint={err("year")}>
                <Input type="number" inputMode="numeric" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2016" className={cn(err("year") && "ring-2 ring-ios-red/60")} />
              </Field>
            </div>
            <Field label="Rubrik" hint={err("title") ?? (titleTouched ? undefined : "Fylls i automatiskt – skriv en egen om du vill.")}>
              <Input
                value={form.title}
                onChange={(e) => {
                  setTitleTouched(true);
                  set("title", e.target.value);
                }}
                placeholder="Volvo V70 D4 2014"
                className={cn(err("title") && "ring-2 ring-ios-red/60")}
              />
            </Field>
            <Field label="Kort säljtext" hint={`Visas på bilkortet. ${form.highlight.length}/200`}>
              <Input value={form.highlight} maxLength={200} onChange={(e) => set("highlight", e.target.value)} placeholder="Nyservad hos oss – redo att köras direkt." />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Mätarställning" hint={err("mileageKm") ?? (Number.isFinite(n(form.mileageKm)) ? `${num(n(form.mileageKm) / 10)} mil` : undefined)}>
                <Input type="number" inputMode="numeric" value={form.mileageKm} onChange={(e) => set("mileageKm", e.target.value)} suffix="km" placeholder="120000" className={cn(err("mileageKm") && "ring-2 ring-ios-red/60")} />
              </Field>
              <Field label="Kaross">
                <Select value={form.bodyType} onChange={(e) => set("bodyType", e.target.value as BodyType)}>
                  {BODY_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bränsle">
                <Select value={form.fuel} onChange={(e) => set("fuel", e.target.value)}>
                  {[...new Set([...FUELS, form.fuel])].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Växellåda">
                <Select value={form.gearbox} onChange={(e) => set("gearbox", e.target.value)}>
                  {[...new Set([...GEARBOXES, form.gearbox])].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Färg" hint={err("colorName")}>
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    onClick={() => setForm((f) => ({ ...f, colorHex: c.hex, colorName: f.colorName && !COLORS.some((x) => x.name === f.colorName) ? f.colorName : c.name }))}
                    className={cn("h-8 w-8 rounded-full ring-1 ring-inset ring-black/10 transition", form.colorHex.toLowerCase() === c.hex.toLowerCase() && "ring-2 ring-offset-2 ring-ios-blue")}
                    style={{ background: c.hex }}
                  />
                ))}
                <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full ring-1 ring-inset ring-black/10" title="Egen färg" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
                  <input type="color" value={form.colorHex} onChange={(e) => set("colorHex", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Egen färg" />
                </label>
                <Input value={form.colorName} onChange={(e) => set("colorName", e.target.value)} placeholder="Färgnamn, t.ex. Silvermetallic" className={cn("min-w-[200px] flex-1", err("colorName") && "ring-2 ring-ios-red/60")} />
              </div>
            </Field>
            <div className="rounded-[12px] bg-ios-fill2 px-4 py-3">
              <Toggle checked={form.inspected} onChange={(v) => set("inspected", v)} label="Verkstadsbesiktigad" description="Visar märket ”Verkstadsbesiktigad” på annonsen" />
            </div>
          </Section>

          <Section title="Beskrivning">
            <Field label="Beskrivning">
              <TextArea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Berätta om bilen – historik, utrustning, varför den är ett bra köp." />
            </Field>
            <Field label="Skick i korthet">
              <Input value={form.conditionSummary} onChange={(e) => set("conditionSummary", e.target.value)} placeholder="Servad hos oss, i väntan på ny ägare." />
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Höjdpunkter">
                <ListEditor value={form.highlights} onChange={(v) => set("highlights", v)} placeholder="T.ex. Nya bromsar fram" />
              </Field>
              <Field label="Att känna till">
                <ListEditor value={form.thingsToNote} onChange={(v) => set("thingsToNote", v)} placeholder="T.ex. Stenskott i vindrutan" />
              </Field>
            </div>
          </Section>
        </div>

        {/* Sidokolumn */}
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Section title="Publicering">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set("status", e.target.value as CarStatus)}>
                <option value="draft">Utkast – syns inte</option>
                <option value="active">Publicerad på auktionen</option>
                <option value="sold">Såld</option>
              </Select>
            </Field>
            {form.status === "sold" && (
              <Field label="Slutpris" hint={err("soldPrice")}>
                <Input type="number" inputMode="numeric" value={form.soldPrice} onChange={(e) => set("soldPrice", e.target.value)} suffix="kr" />
              </Field>
            )}
            <Field label="Auktionen slutar" hint={err("endsAt") ?? (Number.isNaN(endsDate.getTime()) ? undefined : `Slutar ${relativeTime(endsDate.toISOString())}`)}>
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={cn(err("endsAt") && "ring-2 ring-ios-red/60")} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[3, 5, 7, 10].map((d) => (
                  <button key={d} type="button" onClick={() => set("endsAt", toLocalInput(endsInDays(d)))} className="rounded-full bg-ios-fill2 px-2.5 py-1 text-[12px] font-medium text-ios-label transition hover:bg-ios-fill">
                    {d} dagar
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Pris">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Utropspris" hint={err("startPrice")}>
                <Input type="number" inputMode="numeric" value={form.startPrice} onChange={(e) => set("startPrice", e.target.value)} suffix="kr" className={cn(err("startPrice") && "ring-2 ring-ios-red/60")} />
              </Field>
              <Field label="Budhöjning" hint={err("minIncrement")}>
                <Input type="number" inputMode="numeric" value={form.minIncrement} onChange={(e) => set("minIncrement", e.target.value)} suffix="kr" />
              </Field>
            </div>
            <Field label="Reservationspris (valfritt)" hint={err("reservePrice") ?? "Beloppet visas aldrig – besökare ser bara om det är uppnått."}>
              <Input type="number" inputMode="numeric" value={form.reservePrice} onChange={(e) => set("reservePrice", e.target.value)} suffix="kr" placeholder="Inget" />
            </Field>
          </Section>

          {car && <BidsCard car={car} />}

          <Section title="Intern anteckning" description="Syns bara här i admin.">
            <TextArea value={form.adminNote} onChange={(e) => set("adminNote", e.target.value)} placeholder="T.ex. inköpspris, åtgärder, nycklar …" />
          </Section>

          <div>
            <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">Förhandsvisning</p>
            <div className="pointer-events-none select-none font-sans" aria-hidden>
              <CarCard car={preview} />
            </div>
          </div>
        </div>
      </div>
      {sheets}
    </div>
  );
}

function BidsCard({ car }: { car: AdminCar }) {
  const del = useDeleteBid();
  const run = useRun();
  const { confirm } = useFeedback();
  const bids = bidsNewestFirst(car);

  async function remove(bidId: string, name: string, amount: number) {
    const ok = await confirm({
      title: "Ta bort budet?",
      message: `${name}s bud på ${kr(amount)} tas bort. Använd det för felaktiga eller oseriösa bud.`,
      confirmLabel: "Ta bort",
      destructive: true,
    });
    if (ok) run(() => del.mutateAsync(bidId), "Budet är borttaget");
  }

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Bud</h2>
        <span className="text-[13px] text-ios-secondary">{bids.length} st</span>
      </div>
      {bids.length === 0 ? (
        <p className="px-5 pb-5 text-[15px] text-ios-secondary">Inga bud ännu.</p>
      ) : (
        <ul className="max-h-[360px] divide-y divide-black/[.05] overflow-y-auto pb-2">
          {bids.map((b, i) => (
            <li key={b.id} className="group flex items-start gap-3 px-5 py-2.5">
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", i === 0 ? "bg-ios-blue text-white" : "bg-ios-fill2 text-ios-tertiary")}>
                <Gavel size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-medium">{b.name}</p>
                  <p className={cn("text-[15px] font-semibold tabular-nums", i === 0 ? "text-ios-blue" : "text-ios-secondary")}>{kr(b.amount)}</p>
                </div>
                <p className="text-[12px] text-ios-tertiary">{fmtDateTime(b.at)}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]">
                  {b.phone && (
                    <a href={telHref(b.phone)} className="flex items-center gap-1 text-ios-blue">
                      <Phone size={11} /> {b.phone}
                    </a>
                  )}
                  {b.email && (
                    <a href={`mailto:${b.email}`} className="flex items-center gap-1 truncate text-ios-blue">
                      <Mail size={11} /> {b.email}
                    </a>
                  )}
                </div>
              </div>
              <button type="button" aria-label="Ta bort bud" onClick={() => remove(b.id, b.name, b.amount)} className="rounded-full p-1.5 text-ios-tertiary opacity-60 transition hover:bg-ios-red/10 hover:text-ios-red group-hover:opacity-100">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
