// "Lägg upp på Blocket": allt som behövs för Blocket-annonsen, i samma ordning som Blockets
// formulär, med en kopieringsknapp per fält och en knapp som sparar alla bilder.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, PanelRightOpen, RotateCcw } from "lucide-react";
import { imageUrl } from "../lib/api";
import { cn } from "../lib/cn";
import { groupEquipment } from "../lib/equipment";
import { num } from "./helpers";
import type { CarInput } from "./api";
import { Btn, Field, Input, Sheet, Toggle, useFeedback } from "./ui";

const BLOCKET_URL = "https://www.blocket.se/";

const BODY_LABEL: Record<string, string> = { kombi: "Kombi", sedan: "Sedan", halvkombi: "Halvkombi", suv: "SUV", skåpbil: "Skåpbil" };

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Äldre webbläsare / ej säker anslutning
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useFeedback();
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ios-secondary">{label}</p>
        <p className={multiline ? "mt-0.5 max-h-40 overflow-y-auto whitespace-pre-line text-[14px]" : "mt-0.5 truncate text-[15px]"}>{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } else toast("Kunde inte kopiera – markera texten och kopiera själv.", "error");
        }}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ios-fill2 px-3 text-[13px] font-medium text-ios-blue transition hover:bg-ios-fill"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Kopierat" : "Kopiera"}
      </button>
    </div>
  );
}

/** Blocket-beskrivningen: huvudtext + punktlistor (Blocket visar ren text). */
export function blocketDescription(car: CarInput, auctionUrl?: string) {
  const parts = [car.description.trim()];
  if (car.highlights.length) parts.push(`Höjdpunkter:\n${car.highlights.map((h) => `• ${h}`).join("\n")}`);
  const groups = groupEquipment(car.facts.equipment);
  if (groups.length) parts.push(`Utrustning:\n${groups.map((g) => `${g.name}: ${g.items.join(", ")}`).join("\n")}`);
  if (car.thingsToNote.length) parts.push(`Bra att veta:\n${car.thingsToNote.map((h) => `• ${h}`).join("\n")}`);
  if (auctionUrl) parts.push(`Bilen säljs på auktion hos Sjödalen Bilar. Se fler bilder och lägg ditt bud här: ${auctionUrl}`);
  return parts.filter(Boolean).join("\n\n");
}

/** Fälten i ungefär samma ordning som i Blockets formulär. */
export function blocketRows(car: CarInput, price: string): [string, string][] {
  const mil = Number.isFinite(car.mileageKm) ? Math.round(car.mileageKm / 10) : NaN;
  return [
    ["Registreringsnummer", car.regNumber],
    ["Rubrik", car.title],
    ["Pris (kr)", price.replace(/\s/g, "")],
    ["Märke", car.make],
    ["Modell", [car.model, car.facts.engine, car.facts.trim].filter(Boolean).join(" ")],
    ["Modellår", Number.isFinite(car.year) ? String(car.year) : ""],
    ["Miltal", Number.isFinite(mil) ? String(mil) : ""],
    ["Bränsle", car.fuel],
    ["Växellåda", car.gearbox],
    ["Biltyp", BODY_LABEL[car.bodyType] ?? ""],
    ["Färg", car.colorName],
    ["Hästkrafter", car.facts.horsepower ?? ""],
    ["Drivning", car.facts.drive ?? ""],
  ];
}

/* ------------------------------------------------------------------ */
/* Avbockningslista för utrustningen                                    */
/* ------------------------------------------------------------------ */

/** Vilka punkter som är ikryssade på Blocket. Sparas i webbläsaren och delas med popup-fönstret. */
function useDone(carId?: string) {
  const key = `sjodalen-blocket-done-${carId ?? "ny"}`;
  const read = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  }, [key]);
  const [done, setDone] = useState<string[]>(read);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === key && setDone(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, read]);
  const update = (next: string[]) => {
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* privat läge – listan gäller bara i det här fönstret */
    }
  };
  return [done, update] as const;
}

export function EquipmentChecklist({ equipment, carId }: { equipment: string[]; carId?: string }) {
  const [done, setDone] = useDone(carId);
  const groups = groupEquipment(equipment);
  if (!groups.length) return <p className="text-[14px] text-ios-secondary">Ingen utrustning vald ännu.</p>;
  const doneSet = new Set(done.filter((d) => equipment.includes(d)));
  const toggle = (item: string) => setDone(doneSet.has(item) ? [...doneSet].filter((d) => d !== item) : [...doneSet, item]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ios-fill">
          <div className="h-full rounded-full bg-ios-green transition-all" style={{ width: `${(doneSet.size / equipment.length) * 100}%` }} />
        </div>
        <span className="text-[13px] font-medium tabular-nums text-ios-secondary">
          {doneSet.size} av {equipment.length}
        </span>
        {doneSet.size > 0 && (
          <button type="button" onClick={() => setDone([])} className="flex items-center gap-1 text-[13px] text-ios-blue" title="Börja om">
            <RotateCcw size={13} /> Börja om
          </button>
        )}
      </div>
      {groups.map((g) => (
        <div key={g.name}>
          <p className="mb-1 px-1 text-[12px] font-semibold uppercase tracking-wide text-ios-tertiary">{g.name}</p>
          <div className="divide-y divide-black/[.05] overflow-hidden rounded-[12px] bg-white">
            {g.items.map((item) => {
              const on = doneSet.has(item);
              return (
                <button key={item} type="button" onClick={() => toggle(item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-black/[.02]">
                  <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-ios-green bg-ios-green text-white" : "border-ios-separator")}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className={cn("text-[15px] transition", on && "text-ios-tertiary line-through")}>{item}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Öppnar checklistan i ett smalt eget fönster som kan ligga bredvid Blocket. */
export function openBlocketWindow(carId: string) {
  const w = 440;
  const h = Math.min(window.screen.availHeight - 40, 900);
  const left = Math.max(0, window.screen.availWidth - w - 20);
  window.open(`/admin/bilar/${encodeURIComponent(carId)}/blocket`, "sjodalen-blocket", `popup,width=${w},height=${h},left=${left},top=20`);
}

export function BlocketSheet({ open, onClose, car, carId }: { open: boolean; onClose: () => void; car: CarInput; carId?: string }) {
  const { toast } = useFeedback();
  const [price, setPrice] = useState(() => String(car.reservePrice ?? car.startPrice ?? ""));
  const [linkAuction, setLinkAuction] = useState(false);
  const [saving, setSaving] = useState(false);

  const auctionUrl = carId && typeof window !== "undefined" ? `${window.location.origin}/auktion/${carId}` : undefined;
  const description = useMemo(() => blocketDescription(car, linkAuction ? auctionUrl : undefined), [car, linkAuction, auctionUrl]);
  const rows = blocketRows(car, price);

  const everything = [
    car.title,
    "",
    ...rows.filter(([k, v]) => v && k !== "Rubrik").map(([k, v]) => `${k}: ${k === "Miltal" ? `${num(Number(v))} mil` : v}`),
    "",
    description,
  ].join("\n");


  async function saveImages() {
    if (!car.images.length) return toast("Bilen har inga bilder ännu.", "info");
    setSaving(true);
    try {
      const name = (car.regNumber || car.title || "bil").replace(/[^a-zA-Z0-9åäöÅÄÖ-]+/g, "-");
      const files = await Promise.all(
        car.images.map(async (id, i) => {
          const res = await fetch(imageUrl(id, "main"));
          if (!res.ok) throw new Error("Kunde inte hämta bilderna.");
          const blob = await res.blob();
          return new File([blob], `${name}-${String(i + 1).padStart(2, "0")}.jpg`, { type: blob.type || "image/jpeg" });
        }),
      );
      // På mobilen: dela till Bilder/Filer. På datorn: ladda ner filerna.
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files }).catch(() => undefined);
      } else {
        for (const f of files) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
          await new Promise((r) => setTimeout(r, 250));
        }
        toast(`${files.length} bilder sparade i Hämtade filer`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunde inte spara bilderna.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Lägg upp på Blocket" size="lg" footer={<Btn onClick={onClose}>Klar</Btn>}>
      <div className="space-y-5 p-5">
        {carId && (
          <button
            type="button"
            onClick={() => openBlocketWindow(carId)}
            className="hidden w-full items-center gap-3 rounded-[12px] bg-ios-indigo/10 px-4 py-3 text-left transition hover:bg-ios-indigo/15 md:flex"
          >
            <PanelRightOpen size={22} className="shrink-0 text-ios-indigo" />
            <span>
              <span className="block text-[15px] font-semibold text-ios-label">Öppna som eget fönster bredvid Blocket</span>
              <span className="block text-[13px] text-ios-secondary">Ett smalt fönster med allt att kopiera och utrustningen att bocka av medan du fyller i Blocket.</span>
            </span>
          </button>
        )}

        <ol className="space-y-1.5 rounded-[12px] bg-ios-blue/[.07] px-4 py-3 text-[14px] leading-relaxed">
          <li>
            <b>1.</b> Spara bilderna nedan och öppna Blocket (logga in med företagskontot).
          </li>
          <li>
            <b>2.</b> Välj ”Lägg in annons” → Bilar. Skriv in registreringsnumret – Blocket fyller då i det mesta om bilen.
          </li>
          <li>
            <b>3.</b> Kopiera rubrik, pris och beskrivning hit nedifrån och klistra in. Ladda upp bilderna.
          </li>
          <li>
            <b>4.</b> Gå igenom utrustningen längst ned: kryssa i den på Blocket och tryck här så stryks den.
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Btn variant="tinted" icon={<Download size={16} />} loading={saving} onClick={saveImages}>
            Spara alla bilder ({car.images.length})
          </Btn>
          <Btn variant="tinted" icon={<ExternalLink size={16} />} onClick={() => window.open(BLOCKET_URL, "_blank", "noopener")}>
            Öppna Blocket
          </Btn>
          <Btn
            variant="primary"
            icon={<Copy size={16} />}
            onClick={async () => ((await copyText(everything)) ? toast("Hela annonsen är kopierad") : toast("Kunde inte kopiera.", "error"))}
          >
            Kopiera allt
          </Btn>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Pris på Blocket" hint="Förifyllt med reservationspris eller utropspris – ändra fritt.">
            <Input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} suffix="kr" />
          </Field>
          <div className="rounded-[12px] bg-ios-fill2 px-4 py-3">
            <Toggle
              checked={linkAuction}
              onChange={setLinkAuction}
              label="Hänvisa till auktionen"
              description={carId ? "Lägger till en länk till budgivningen sist i texten. Kontrollera att Blockets regler tillåter länken." : "Spara bilen först för att få en länk."}
            />
          </div>
        </div>

        <div className="divide-y divide-black/[.05] rounded-[12px] bg-white px-4">
          {rows.map(([label, value]) => (
            <CopyRow key={label} label={label} value={value} />
          ))}
          <CopyRow label="Beskrivning" value={description} multiline />
        </div>

        <div>
          <h3 className="mb-2 text-[17px] font-semibold">Utrustning att bocka i på Blocket</h3>
          <EquipmentChecklist equipment={car.facts.equipment} carId={carId} />
        </div>
      </div>
    </Sheet>
  );
}
