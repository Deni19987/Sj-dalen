import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, Copy, ExternalLink, Gavel, Loader2, Mail, Phone, Plus, Search, Sparkles, Store, Trash2, X } from "lucide-react";
import { CarCard } from "../../components/CarCard";
import { cn } from "../../lib/cn";
import type { BodyType, Car, CarStatus } from "../../lib/types";
import { lookupVehicle, suggestStandardEquipment, useAdminCars, useDeleteBid, useSaveCar, writeAdWithAi, type AdminCar, type CarFacts, type CarInput, type VehicleData } from "../api";
import { BlocketSheet } from "../BlocketSheet";
import { inDealMode } from "../deal";
import { DealWorkspace } from "../DealWorkspace";
import { EquipmentPicker } from "../EquipmentPicker";
import { BackLink } from "../../components/BackLink";
import { MAKES } from "../../lib/vehicle";
import { useCarActions } from "../CarActions";
import { bidsNewestFirst } from "../../lib/auction";
import { carState, endsInDays, fmtDateTime, kr, num, relativeTime, siteUrl, STATE_LABEL, telHref, toLocalInput } from "../helpers";
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
const SERVICE_HISTORY = ["Full servicehistorik", "Delvis servicehistorik", "Servicebok saknas"];
const TS_URL = "https://fordon-fu-regnr.transportstyrelsen.se/";
// Inkorgen som registerutdragen skickas till (samma som Carflow). Kan ändras med VITE_VEHICLE_LOOKUP_INBOX.
const LOOKUP_INBOX = import.meta.env.VITE_VEHICLE_LOOKUP_INBOX || "deni.ferchichi@scandicreach.se";

// iOS öppnar target="_blank"-länkar från en hemskärmsapp i ett inbäddat Safari-fönster, där
// BankID:s återhopp kan tappa sessionen. "x-safari-" tvingar fram riktiga Safari (samma som Carflow).
function openInRealBrowser(e: MouseEvent<HTMLAnchorElement>) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;
  e.preventDefault();
  window.location.href = e.currentTarget.href.replace(/^https:\/\//, "x-safari-https://");
}

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
  regNumber: string;
  facts: CarFacts;
}

const EMPTY_FACTS: CarFacts = { equipment: [], notes: "" };

/** Tal → text i formuläret; saknat värde (utkast) blir tomt fält. */
const numStr = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? String(x) : "");

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
      regNumber: "",
      facts: EMPTY_FACTS,
      ...prefill,
    };
  }
  return {
    make: car.make,
    model: car.model,
    year: numStr(car.year),
    title: car.title,
    highlight: car.highlight,
    bodyType: car.bodyType,
    colorName: car.colorName,
    colorHex: car.colorHex,
    mileageKm: numStr(car.mileageKm),
    fuel: car.fuel,
    gearbox: car.gearbox,
    inspected: car.inspected,
    conditionSummary: car.conditionSummary,
    highlights: car.highlights,
    thingsToNote: car.thingsToNote,
    description: car.description,
    startPrice: numStr(car.startPrice),
    minIncrement: String(car.minIncrement),
    reservePrice: car.reservePrice != null ? String(car.reservePrice) : "",
    endsAt: toLocalInput(car.endsAt),
    status: car.status,
    soldPrice: car.soldPrice != null ? String(car.soldPrice) : "",
    images: car.images,
    adminNote: car.adminNote,
    regNumber: car.regNumber,
    facts: car.facts,
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
    endsAt: f.endsAt && !Number.isNaN(new Date(f.endsAt).getTime()) ? new Date(f.endsAt).toISOString() : "",
    status: f.status,
    soldPrice: f.soldPrice.trim() ? n(f.soldPrice) : undefined,
    images: f.images,
    adminNote: f.adminNote,
    regNumber: f.regNumber.trim().toUpperCase().replace(/\s/g, ""),
    facts: { ...f.facts, equipment: f.facts.equipment.filter(Boolean), notes: f.facts.notes.trim() },
  };
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  // Ett utkast får sparas halvfärdigt – då kontrolleras bara det som är ifyllt.
  const draft = f.status === "draft";
  const needed = (v: string) => !draft || v.trim() !== "";
  const year = n(f.year);
  if (!draft && !f.make.trim()) e.make = "Ange märke";
  if (!draft && !f.model.trim()) e.model = "Ange modell";
  if (needed(f.year) && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) e.year = "Ogiltig årsmodell";
  if (!draft && !f.title.trim()) e.title = "Ange en rubrik";
  if (!draft && !f.colorName.trim()) e.colorName = "Ange färg";
  if (needed(f.mileageKm) && (!Number.isInteger(n(f.mileageKm)) || n(f.mileageKm) < 0)) e.mileageKm = "Ange mätarställning";
  if (needed(f.startPrice) && (!Number.isInteger(n(f.startPrice)) || n(f.startPrice) < 0)) e.startPrice = "Ange utropspris";
  if (needed(f.minIncrement) && (!Number.isInteger(n(f.minIncrement)) || n(f.minIncrement) < 1)) e.minIncrement = "Minst 1 kr";
  if (f.reservePrice.trim() && !Number.isInteger(n(f.reservePrice))) e.reservePrice = "Ogiltigt belopp";
  if (draft && !f.endsAt) {
    /* sluttid sätts när utkastet publiceras */
  } else if (!f.endsAt || Number.isNaN(new Date(f.endsAt).getTime())) e.endsAt = "Ange sluttid";
  else if (f.status === "active" && new Date(f.endsAt).getTime() <= Date.now()) e.endsAt = "Sluttiden har redan passerat";
  if (f.status === "sold" && !Number.isInteger(n(f.soldPrice))) e.soldPrice = "Ange slutpris";
  return e;
}

/** Översätter ett registerutdrag till formulärfält. Bara uppgifter som finns skrivs över. */
function fromVehicle(v: VehicleData, f: Form): Form {
  const color = v.color ? COLORS.find((c) => v.color!.toLowerCase().startsWith(c.name.toLowerCase())) : undefined;
  const fuel = v.fuel ? (FUELS.find((x) => x.toLowerCase() === v.fuel!.toLowerCase()) ?? v.fuel) : null;
  const gearbox = v.gearbox ? (/auto/i.test(v.gearbox) ? "Automat" : /manu/i.test(v.gearbox) ? "Manuell" : v.gearbox) : null;
  const body = v.bodyType ? BODY_TYPES.find((b) => v.bodyType!.toLowerCase().includes(b.value.replace("skåpbil", "skåp"))) : undefined;
  const pick = (a: string | number | null | undefined, b: string) => (a == null || a === "" ? b : String(a));
  return {
    ...f,
    regNumber: v.regNumber || f.regNumber,
    make: pick(v.make, f.make),
    model: pick(v.model, f.model),
    year: pick(v.year, f.year),
    colorName: pick(v.color, f.colorName),
    colorHex: color?.hex ?? f.colorHex,
    fuel: fuel ?? f.fuel,
    gearbox: gearbox ?? f.gearbox,
    bodyType: body?.value ?? f.bodyType,
    mileageKm: pick(v.mileageKm, f.mileageKm),
    facts: {
      ...f.facts,
      engine: pick(v.engine, f.facts.engine ?? ""),
      trim: pick(v.trim, f.facts.trim ?? ""),
      owners: pick(v.owners, f.facts.owners ?? ""),
      firstRegistered: pick(v.firstRegistered, f.facts.firstRegistered ?? ""),
      lastInspection: pick(v.lastInspection, f.facts.lastInspection ?? ""),
      nextInspection: pick(v.nextInspection, f.facts.nextInspection ?? ""),
      horsepower: pick(v.horsepower, f.facts.horsepower ?? ""),
    },
  };
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0)));

/** Vilken bil det är – underlag för AI:ns standardutrustning. Tomma fält skickas inte. */
function vehicleInput(f: Form) {
  return clean({
    make: f.make.trim(),
    model: f.model.trim(),
    motor: f.facts.engine,
    utforande: f.facts.trim,
    arsmodell: f.year.trim(),
    kaross: BODY_TYPES.find((b) => b.value === f.bodyType)?.label,
    bransle: f.fuel,
    vaxellada: f.gearbox,
    hastkrafter: f.facts.horsepower,
    drivning: f.facts.drive,
  });
}

/** Allt vi vet om bilen – underlag för AI:ns annonstext. */
function aiInput(f: Form) {
  const km = n(f.mileageKm);
  return clean({
    ...vehicleInput(f),
    farg: f.colorName.trim(),
    matarstallning: Number.isFinite(km) ? `${km} km (${Math.round(km / 10)} mil)` : "",
    antalAgare: f.facts.owners,
    iTrafikForstaGangen: f.facts.firstRegistered,
    senastBesiktigad: f.facts.lastInspection,
    nastaBesiktningSenast: f.facts.nextInspection,
    servicehistorik: f.facts.serviceHistory,
    antalNycklar: f.facts.keys,
    dack: f.facts.tires,
    utrustning: f.facts.equipment,
    verkstadsbesiktigad: f.inspected,
    anteckningarFranSaljaren: f.facts.notes,
    // Det som redan står i annonsen tas med så att inget går förlorat när texten skrivs om.
    befintligBeskrivning: f.description.trim(),
    befintligaHojdpunkter: f.highlights,
    befintligtAttKannaTill: f.thingsToNote,
    befintligtSkick: f.conditionSummary.trim(),
  });
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

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
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
  const { toast, confirm } = useFeedback();
  const { menuItems, sheets, openDialog } = useCarActions({ onDeleted: () => navigate({ to: "/admin/bilar" }) });
  // Avslutad eller såld bil: sidan blir en arbetsyta för affären, annonsen fälls ihop.
  const dealMode = !!car && inDealMode(car);
  const [showAd, setShowAd] = useState(false);
  const [form, setForm] = useState<Form>(() => fromCar(car));
  const [baseline, setBaseline] = useState(() => JSON.stringify(car ? fromCar(car) : form));
  const [titleTouched, setTitleTouched] = useState(!!car);
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupInfo, setLookupInfo] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [equipBusy, setEquipBusy] = useState(false);
  const [blocketOpen, setBlocketOpen] = useState(false);
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
  const setFact = useCallback(<K extends keyof CarFacts>(k: K, v: CarFacts[K]) => setForm((f) => ({ ...f, facts: { ...f.facts, [k]: v } })), []);

  /**
   * AI:n fyller i standardutrustningen och listar modellens möjliga tillval.
   * Returnerar formuläret med utrustningen ifylld (eller null om det inte gick).
   */
  async function onSuggestEquipment(f: Form): Promise<Form | null> {
    setEquipBusy(true);
    try {
      const { standard, options } = await suggestStandardEquipment(vehicleInput(f));
      const apply = (cur: Form): Form => {
        // Förra AI-förslaget som handlaren inte rört tas bort innan det nya läggs till.
        const oldAi = new Set(cur.facts.standardEquipment ?? []);
        const kept = cur.facts.equipment.filter((e) => !oldAi.has(e) || standard.includes(e));
        return {
          ...cur,
          facts: { ...cur.facts, equipment: [...new Set([...kept, ...standard])], standardEquipment: standard, optionalEquipment: options },
        };
      };
      setForm(apply);
      return apply(f);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunde inte hämta utrustningen.", "error");
      return null;
    } finally {
      setEquipBusy(false);
    }
  }

  /** "Spara och hämta utrustning": fyller i utrustningen och sparar bilen om allt som krävs är ifyllt. */
  async function onSaveInfo() {
    if (!form.make.trim() || !form.model.trim()) return toast("Fyll i minst märke och modell först.", "info");
    const next = await onSuggestEquipment(form);
    if (!next) return;
    document.getElementById("utrustning")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const n = next.facts.standardEquipment?.length ?? 0;
    const o = next.facts.optionalEquipment?.length ?? 0;
    const what = `${n} standardfunktioner ifyllda och ${o} förslag på tillval`;
    if (Object.keys(validate(next)).length === 0) {
      if (await onSave(next)) toast(`Sparat – ${what}`);
    } else {
      toast(`${what[0].toUpperCase()}${what.slice(1)}. Bilen sparas när utropspris m.m. är ifyllt.`, "info");
    }
  }

  async function onLookup() {
    if (!form.regNumber.trim()) return toast("Skriv registreringsnumret först.", "info");
    setLookupBusy(true);
    try {
      const v = await lookupVehicle(form.regNumber);
      setForm((f) => fromVehicle(v, f));
      const got = [v.make && v.model && `${v.make} ${v.model}`, v.year, v.mileageKm != null && `${num(v.mileageKm / 10)} mil`, v.owners != null && `${v.owners} ägare`]
        .filter(Boolean)
        .join(" · ");
      setLookupInfo(
        `${v.readByAi ? "AI:n har läst registerutdraget" : "Hämtat från registerutdraget"}${got ? `: ${got}` : ""}. Bara det som står i mejlet är ifyllt – kontrollera och fyll i resten, tryck sedan på ”Spara och hämta utrustning”.`,
      );
      toast("Bilens uppgifter är ifyllda");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunde inte hämta uppgifterna.", "error");
    } finally {
      setLookupBusy(false);
    }
  }

  async function onWriteWithAi() {
    if (!form.make.trim() || !form.model.trim()) return toast("Fyll i minst märke och modell först.", "info");
    const hasText = form.description.trim() || form.highlight.trim() || form.highlights.length || form.thingsToNote.length;
    if (
      hasText &&
      !(await confirm({
        title: "Skriva om annonsen?",
        message: "AI:n skriver ny rubrik, säljtext och beskrivning. Det som står där nu ersätts (men tas med som underlag).",
        confirmLabel: "Skriv om",
      }))
    )
      return;
    setAiBusy(true);
    try {
      const ad = await writeAdWithAi(aiInput(form));
      setTitleTouched(true);
      setForm((f) => ({ ...f, ...ad }));
      toast("Annonsen är skriven – läs igenom och justera");
      document.getElementById("annonstext")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI:n kunde inte skriva annonsen.", "error");
    } finally {
      setAiBusy(false);
    }
  }

  // Rubriken föreslås automatiskt tills man skriver en egen
  useEffect(() => {
    if (titleTouched) return;
    const auto = [form.make, form.model, form.year].map((s) => s.trim()).filter(Boolean).join(" ");
    setForm((f) => (f.title === auto ? f : { ...f, title: auto }));
  }, [form.make, form.model, form.year, titleTouched]);

  const onImages = useCallback((ids: string[]) => setForm((f) => ({ ...f, images: ids })), []);

  async function onSave(f: Form = form): Promise<boolean> {
    if (uploading) {
      toast("Vänta tills bilderna har laddats upp.", "info");
      return false;
    }
    const errs = validate(f);
    if (Object.keys(errs).length) {
      setShowErrors(true);
      toast(Object.values(errs)[0]!, "error");
      return false;
    }
    const saved = await run(() => save.mutateAsync({ id: car?.id, input: toInput(f) }), car ? "Ändringarna är sparade" : f.status === "active" ? "Bilen är publicerad" : "Utkastet är sparat");
    if (!saved) return false;
    setBaseline(JSON.stringify(f));
    if (!car) {
      allowLeave.current = true;
      navigate({ to: "/admin/bilar/$id", params: { id: saved.id }, replace: true });
    }
    return true;
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
      engine: form.facts.engine,
      horsepower: form.facts.horsepower,
      drive: form.facts.drive,
      trim: form.facts.trim,
    } as Car;
  }, [form, car]);

  const state = car ? carState(car) : null;
  const endsDate = new Date(form.endsAt);

  return (
    <div>
      {/* Verktygsrad */}
      <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-black/[.06] bg-ios-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          <BackLink to="/admin/bilar" from={["/admin/bilar"]} className="flex items-center text-[17px] text-ios-blue">
            <ChevronLeft size={22} className="-ml-1.5" />
            <span className="hidden sm:inline">Bilar</span>
          </BackLink>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{car ? form.title || car.title : "Ny bil"}</p>
            <p className="truncate text-[12px] text-ios-secondary">
              {uploading ? "Laddar upp bilder…" : dirty ? "Osparade ändringar" : car ? `Senast sparad ${relativeTime(car.updatedAt)}` : "Inte sparad ännu"}
            </p>
          </div>
          {state && <Pill tone={STATE_LABEL[state].tone} className="hidden sm:inline-flex">{STATE_LABEL[state].label}</Pill>}
          {car && car.status !== "draft" && (
            <a href={siteUrl(`/auktion/${car.id}`)} target="_blank" rel="noopener" className="hidden h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ios-blue hover:bg-ios-blue/10 md:flex">
              <ExternalLink size={14} /> Visa
            </a>
          )}
          {car && <ActionMenu items={menuItems(car, { includeEdit: false })} />}
          <Btn variant="primary" onClick={() => onSave()} loading={save.isPending} disabled={(!dirty && !!car) || uploading}>
            {car ? "Spara" : form.status === "active" ? "Publicera" : "Spara utkast"}
          </Btn>
        </div>
      </div>

      {dealMode && car && (
        <>
          <DealWorkspace car={car} onSell={() => openDialog({ type: "sell", car })} onRelist={() => openDialog({ type: "relist", car })} />
          <button
            type="button"
            onClick={() => setShowAd((v) => !v)}
            aria-expanded={showAd}
            className="mb-6 flex w-full items-center justify-between rounded-[14px] bg-white px-5 py-3.5 text-left shadow-ios-card transition-colors hover:bg-ios-fill2"
          >
            <span>
              <span className="block text-[15px] font-semibold">Annonsen och budhistoriken</span>
              <span className="block text-[13px] text-ios-secondary">Bilder, uppgifter, pris och alla bud</span>
            </span>
            <ChevronDown size={20} className={cn("text-ios-tertiary transition-transform duration-300 ease-ios", showAd && "rotate-180")} />
          </button>
        </>
      )}

      <div className={cn("grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]", dealMode && !showAd && "hidden", dealMode && showAd && "animate-ios-fade")}>
        <div className="space-y-6">
          <Section title="Hämta bilens uppgifter" description="Hämta allt från Transportstyrelsen i två steg – eller hoppa över och fyll i själv nedan.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-[12px] bg-ios-fill2 p-4">
                <p className="text-[15px] font-semibold">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ios-blue text-[13px] text-white">1</span>
                  Beställ registerutdrag
                </p>
                <p className="text-[13px] leading-relaxed text-ios-secondary">
                  Signera med BankID hos Transportstyrelsen och ange den här e-postadressen som mottagare:
                </p>
                <div className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2">
                  <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{LOOKUP_INBOX}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(LOOKUP_INBOX);
                        toast("E-postadressen är kopierad");
                      } catch {
                        toast("Kunde inte kopiera – skriv in adressen själv.", "error");
                      }
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-ios-fill2 px-2.5 py-1 text-[12px] font-medium text-ios-blue hover:bg-ios-fill"
                  >
                    <Copy size={12} /> Kopiera
                  </button>
                </div>
                <a
                  href={TS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openInRealBrowser}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ios-blue/10 px-4 text-[15px] font-medium text-ios-blue transition hover:bg-ios-blue/15"
                >
                  <ExternalLink size={16} /> Gå till Transportstyrelsen
                </a>
              </div>

              <div className="flex flex-col gap-3 rounded-[12px] bg-ios-fill2 p-4">
                <p className="text-[15px] font-semibold">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ios-blue text-[13px] text-white">2</span>
                  Hämta uppgifterna
                </p>
                <p className="text-[13px] leading-relaxed text-ios-secondary">
                  När mejlet har kommit (oftast inom någon minut): skriv registreringsnumret och tryck på Hämta. AI:n läser mejlet och fyller i
                  märke, modell, färg, miltal, ägare och besiktning – bara det som faktiskt står i mejlet.
                </p>
                <Input
                  value={form.regNumber}
                  onChange={(e) => set("regNumber", e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onLookup();
                    }
                  }}
                  placeholder="ABC 123"
                  maxLength={10}
                  autoCapitalize="characters"
                  aria-label="Registreringsnummer"
                  className="bg-white font-semibold tracking-wider"
                />
                <Btn variant="primary" icon={<Search size={16} />} loading={lookupBusy} onClick={onLookup} disabled={!form.regNumber.trim()}>
                  Hämta från e-post
                </Btn>
                {lookupBusy && <p className="text-center text-[12px] text-ios-secondary">Söker i inkorgen och läser registerutdraget …</p>}
              </div>
            </div>
            {lookupInfo && <p className="rounded-[12px] bg-ios-green/10 px-4 py-2.5 text-[14px] text-ios-label">{lookupInfo}</p>}
          </Section>

          <Section title="Bilder" description="Välj flera bilder på en gång. De beskärs automatiskt till 4:3 – tryck på en bild för att justera.">
            <ImageManager initial={form.images} onChange={onImages} onBusyChange={setUploading} />
          </Section>

          <Section title="Grunduppgifter">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Field label="Motor">
                <Input value={form.facts.engine ?? ""} onChange={(e) => setFact("engine", e.target.value)} placeholder="1.4 TSI" maxLength={40} />
              </Field>
            </div>
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

          <Section title="Mer om bilen" description="Ju mer du fyller i, desto bättre blir AI-texten. Allt är valfritt och syns inte på webbplatsen.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Utförande">
                <Input value={form.facts.trim ?? ""} onChange={(e) => setFact("trim", e.target.value)} placeholder="Momentum" maxLength={100} />
              </Field>
              <Field label="Hästkrafter">
                <Input inputMode="numeric" value={form.facts.horsepower ?? ""} onChange={(e) => setFact("horsepower", e.target.value)} suffix="hk" placeholder="181" maxLength={10} />
              </Field>
              <Field label="Drivning">
                <Select value={form.facts.drive ?? ""} onChange={(e) => setFact("drive", e.target.value)}>
                  <option value="">–</option>
                  {[...new Set(["Framhjulsdrift", "Bakhjulsdrift", "Fyrhjulsdrift", ...(form.facts.drive ? [form.facts.drive] : [])])].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Antal ägare">
                <Input inputMode="numeric" value={form.facts.owners ?? ""} onChange={(e) => setFact("owners", e.target.value)} placeholder="2" maxLength={10} />
              </Field>
              <Field label="Servicehistorik">
                <Select value={form.facts.serviceHistory ?? ""} onChange={(e) => setFact("serviceHistory", e.target.value)}>
                  <option value="">–</option>
                  {SERVICE_HISTORY.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Antal nycklar">
                <Input inputMode="numeric" value={form.facts.keys ?? ""} onChange={(e) => setFact("keys", e.target.value)} placeholder="2" maxLength={10} />
              </Field>
              <Field label="Senast besiktigad">
                <Input type="date" value={form.facts.lastInspection ?? ""} onChange={(e) => setFact("lastInspection", e.target.value)} />
              </Field>
              <Field label="Nästa besiktning senast">
                <Input type="date" value={form.facts.nextInspection ?? ""} onChange={(e) => setFact("nextInspection", e.target.value)} />
              </Field>
              <Field label="Däck">
                <Input value={form.facts.tires ?? ""} onChange={(e) => setFact("tires", e.target.value)} placeholder="Nya vinterdäck på fälg" maxLength={100} />
              </Field>
            </div>
            <Field label="Övrigt till AI:n" hint="Skriv fritt och kortfattat – t.ex. vad som är gjort, extrautrustning, brister och historik.">
              <TextArea
                value={form.facts.notes}
                onChange={(e) => setFact("notes", e.target.value)}
                placeholder="Kamrem bytt 2023 vid 15 000 mil. Ny koppling. Stenskott i vindrutan. Rökfri, en ägare de senaste 8 åren."
              />
            </Field>
            <div className="flex flex-col items-start gap-3 rounded-[12px] bg-gradient-to-br from-ios-blue/10 to-ios-blue/[.03] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold">Klar med bilens uppgifter?</p>
                <p className="text-[13px] text-ios-secondary">Modellens standardutrustning fylls i och du får förslag på tillval – kryssa bara i det bilen har.</p>
              </div>
              <Btn variant="primary" icon={<Sparkles size={16} />} loading={equipBusy} onClick={onSaveInfo} className="shrink-0">
                Spara och hämta utrustning
              </Btn>
            </div>
          </Section>

          <Section id="utrustning" title="Utrustning" description="Visas grupperad på annonsen och följer med till Blocket.">
            <EquipmentPicker
              value={form.facts.equipment}
              standard={form.facts.standardEquipment ?? []}
              options={form.facts.optionalEquipment ?? []}
              onChange={(v) => setFact("equipment", v)}
            />
            <div className="flex justify-end">
              <Btn
                variant="tinted"
                icon={<Sparkles size={16} />}
                disabled={aiBusy}
                onClick={() => void onWriteWithAi()}
              >
                Klar – skriv annonstexten med AI
              </Btn>
            </div>
          </Section>

          <Section id="annonstext" title="Annonstext" description="Rubrik och text som visas på annonsen och följer med till Blocket.">
            <div className="flex flex-col items-start gap-3 rounded-[12px] bg-gradient-to-br from-ios-purple/10 to-ios-blue/[.05] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold">Låt AI:n skriva annonstexten</p>
                <p className="text-[13px] text-ios-secondary">Rubrik, säljtext, beskrivning, skick, höjdpunkter och ”att känna till” utifrån allt ovan. Du kan ändra allt efteråt.</p>
              </div>
              <Btn variant="primary" icon={aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} disabled={aiBusy} onClick={onWriteWithAi} className="shrink-0">
                {aiBusy ? "Skriver …" : "Skriv annonstexten med AI"}
              </Btn>
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

          <Section title="Blocket" description="Allt du behöver för att lägga upp bilen på Blocket – färdigt att kopiera.">
            <Btn variant="tinted" icon={<Store size={16} />} onClick={() => setBlocketOpen(true)} className="w-full">
              Lägg upp på Blocket
            </Btn>
          </Section>

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
      {blocketOpen && <BlocketSheet open onClose={() => setBlocketOpen(false)} car={toInput(form)} carId={car?.id} />}
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
    <Card id="bud" padded={false} className="scroll-mt-24">
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
