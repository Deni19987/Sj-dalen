import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useSettings } from "../../lib/queries";
import type { SiteSettings } from "../../lib/types";
import { useSaveSettings } from "../api";
import { Btn, Card, Field, Input, LoadingBlock, useRun } from "../ui";

type ContactFields = Pick<SiteSettings, "phone" | "email" | "address" | "hours" | "company" | "auction">;
type AuctionNumber = "paymentDays" | "pickupDays" | "storageFee" | "cancelAfterDays";

const pick = ({ phone, email, address, hours, company, auction }: SiteSettings): ContactFields => ({
  phone,
  email,
  address,
  hours,
  company,
  auction,
});

/** Kontaktuppgifter, öppettider, företagsuppgifter och auktionsvillkorens siffror (fliken Kontakt på Innehåll). */
export function ContactInfo() {
  const { data, isPlaceholderData } = useSettings();
  if (!data || isPlaceholderData) return <LoadingBlock />;
  return <ContactInfoForm settings={data} />;
}

function ContactInfoForm({ settings }: { settings: SiteSettings }) {
  const [s, setS] = useState<ContactFields>(() => pick(settings));
  const [baseline, setBaseline] = useState(() => JSON.stringify(pick(settings)));
  const save = useSaveSettings();
  const run = useRun();
  const dirty = JSON.stringify(s) !== baseline;
  const set = <K extends keyof ContactFields>(k: K, v: ContactFields[K]) => setS((x) => ({ ...x, [k]: v }));
  const setCompany = (patch: Partial<ContactFields["company"]>) => setS((x) => ({ ...x, company: { ...x.company, ...patch } }));
  const setAuction = (k: AuctionNumber, v: string) =>
    setS((x) => ({ ...x, auction: { ...x.auction, [k]: v === "" ? ("" as unknown as number) : Number(v) } }));
  const auctionChanged = (["paymentDays", "pickupDays", "storageFee", "cancelAfterDays"] as const).some(
    (k) => s.auction[k] !== settings.auction[k],
  );

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  async function onSave() {
    // Övriga inställningar (notisbannern) skickas med oförändrade.
    const saved = await run(() => save.mutateAsync({ ...settings, ...s }), "Uppgifterna är sparade – syns på webbplatsen inom en minut");
    if (saved) {
      setS(pick(saved));
      setBaseline(JSON.stringify(pick(saved)));
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-[17px] font-semibold">Kontaktuppgifter</h2>
          <p className="text-[13px] text-ios-secondary">Visas i sidfoten, på kontaktsidan och Om oss.</p>
          <div className="mt-4 space-y-4">
            <Field label="Telefon">
              <Input type="tel" value={s.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="E-post">
              <Input type="email" value={s.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Adress">
              <Input value={s.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="text-[17px] font-semibold">Öppettider</h2>
          <p className="text-[13px] text-ios-secondary">T.ex. ”Mån–fre” och ”07.30–17.00”.</p>
          <div className="mt-4 space-y-2">
            {s.hours.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={h.label} placeholder="Dag" onChange={(e) => set("hours", s.hours.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input value={h.value} placeholder="Tid" onChange={(e) => set("hours", s.hours.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button type="button" aria-label="Ta bort rad" onClick={() => set("hours", s.hours.filter((_, j) => j !== i))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-tertiary hover:bg-ios-red/10 hover:text-ios-red">
                  <X size={16} />
                </button>
              </div>
            ))}
            <Btn size="sm" variant="plain" icon={<Plus size={15} />} onClick={() => set("hours", [...s.hours, { label: "", value: "" }])} disabled={s.hours.length >= 10}>
              Lägg till rad
            </Btn>
          </div>
        </Card>

        <Card>
          <h2 className="text-[17px] font-semibold">Företagsuppgifter</h2>
          <p className="text-[13px] text-ios-secondary">Visas i sidfoten, auktionsvillkoren och integritetspolicyn.</p>
          <div className="mt-4 space-y-4">
            <Field label="Företagsnamn" hint="Som det är registrerat hos Bolagsverket.">
              <Input value={s.company.name} onChange={(e) => setCompany({ name: e.target.value })} />
            </Field>
            <Field label="Organisationsnummer">
              <Input value={s.company.orgNumber} placeholder="556123-4567" onChange={(e) => setCompany({ orgNumber: e.target.value })} />
            </Field>
            <Field label="Momsregistreringsnummer (om ni har ett)">
              <Input value={s.company.vatNumber} placeholder="SE556123456701" onChange={(e) => setCompany({ vatNumber: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="text-[17px] font-semibold">Auktionsvillkor</h2>
          <p className="text-[13px] text-ios-secondary">Siffrorna som står i auktionsvillkoren om betalning och hämtning.</p>
          <div className="mt-4 grid grid-cols-2 items-end gap-4">
            <Field label="Betalning inom (bankdagar)">
              <Input type="number" inputMode="numeric" min={1} max={30} value={s.auction.paymentDays} onChange={(e) => setAuction("paymentDays", e.target.value)} />
            </Field>
            <Field label="Hämtning inom (dagar)">
              <Input type="number" inputMode="numeric" min={1} max={60} value={s.auction.pickupDays} onChange={(e) => setAuction("pickupDays", e.target.value)} />
            </Field>
            <Field label="Förvaringsavgift (kr/dygn)">
              <Input type="number" inputMode="numeric" min={0} max={10000} value={s.auction.storageFee} onChange={(e) => setAuction("storageFee", e.target.value)} />
            </Field>
            <Field label="Köpet kan hävas efter (dagar)">
              <Input type="number" inputMode="numeric" min={7} max={180} value={s.auction.cancelAfterDays} onChange={(e) => setAuction("cancelAfterDays", e.target.value)} />
            </Field>
          </div>
          {auctionChanged && (
            <p className="mt-4 rounded-[12px] bg-ios-orange/10 px-3 py-2.5 text-[13px] text-ios-label">
              När du sparar får villkoren ett nytt datum. Ändringen gäller bud som läggs från och med nu – bud som redan
              lagts gäller enligt villkoren budgivaren godkände.
            </p>
          )}
        </Card>
      </div>
      <div className="mt-6 flex justify-end">
        <Btn variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
          Spara
        </Btn>
      </div>
    </div>
  );
}
