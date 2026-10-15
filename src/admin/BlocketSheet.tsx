// "Lägg upp på Blocket": allt som behövs för Blocket-annonsen, i samma ordning som Blockets
// formulär, med en kopieringsknapp per fält och en knapp som sparar alla bilder.
import { useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { imageUrl } from "../lib/api";
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

function CopyRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
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
  if (car.facts.equipment.length) parts.push(`Utrustning:\n${car.facts.equipment.map((h) => `• ${h}`).join("\n")}`);
  if (car.thingsToNote.length) parts.push(`Bra att veta:\n${car.thingsToNote.map((h) => `• ${h}`).join("\n")}`);
  if (auctionUrl) parts.push(`Bilen säljs på auktion hos Sjödalen Bilar. Se fler bilder och lägg ditt bud här: ${auctionUrl}`);
  return parts.filter(Boolean).join("\n\n");
}

export function BlocketSheet({ open, onClose, car, carId }: { open: boolean; onClose: () => void; car: CarInput; carId?: string }) {
  const { toast } = useFeedback();
  const [price, setPrice] = useState(() => String(car.reservePrice ?? car.startPrice ?? ""));
  const [linkAuction, setLinkAuction] = useState(false);
  const [saving, setSaving] = useState(false);

  const auctionUrl = carId && typeof window !== "undefined" ? `${window.location.origin}/auktion/${carId}` : undefined;
  const description = useMemo(() => blocketDescription(car, linkAuction ? auctionUrl : undefined), [car, linkAuction, auctionUrl]);
  const mil = Number.isFinite(car.mileageKm) ? Math.round(car.mileageKm / 10) : NaN;

  const rows: [string, string][] = [
    ["Registreringsnummer", car.regNumber],
    ["Rubrik", car.title],
    ["Pris (kr)", price.replace(/\s/g, "")],
    ["Märke", car.make],
    ["Modell", [car.model, car.facts.trim].filter(Boolean).join(" ")],
    ["Modellår", Number.isFinite(car.year) ? String(car.year) : ""],
    ["Miltal", Number.isFinite(mil) ? String(mil) : ""],
    ["Bränsle", car.fuel],
    ["Växellåda", car.gearbox],
    ["Biltyp", BODY_LABEL[car.bodyType] ?? ""],
    ["Färg", car.colorName],
    ["Hästkrafter", car.facts.horsepower ?? ""],
    ["Drivning", car.facts.drive ?? ""],
  ];

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
      </div>
    </Sheet>
  );
}
