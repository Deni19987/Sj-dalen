import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useSettings } from "../../lib/queries";
import type { SiteSettings } from "../../lib/types";
import { useSaveSettings } from "../api";
import { Btn, Card, Field, Input, LoadingBlock, useRun } from "../ui";

type ContactFields = Pick<SiteSettings, "phone" | "email" | "address" | "hours">;

const pick = ({ phone, email, address, hours }: SiteSettings): ContactFields => ({ phone, email, address, hours });

/** Kontaktuppgifter och öppettider (fliken på Innehåll). */
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
      </div>
      <div className="mt-6 flex justify-end">
        <Btn variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
          Spara
        </Btn>
      </div>
    </div>
  );
}
