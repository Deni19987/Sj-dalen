import { useEffect, useState } from "react";
import { KeyRound, LogOut, Megaphone, Plus, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useSettings } from "../../lib/queries";
import type { SiteSettings } from "../../lib/types";
import { logout, useSaveSettings } from "../api";
import { Btn, Card, Field, Input, LoadingBlock, PageHeader, Segmented, Toggle, useRun } from "../ui";

export function SettingsPage() {
  const { data, isPlaceholderData } = useSettings();
  if (!data || isPlaceholderData) return <LoadingBlock />;
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const save = useSaveSettings();
  const run = useRun();
  const dirty = JSON.stringify(s) !== baseline;
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const setAnn = (patch: Partial<SiteSettings["announcement"]>) => setS((x) => ({ ...x, announcement: { ...x.announcement, ...patch } }));

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  async function onSave() {
    const saved = await run(() => save.mutateAsync(s), "Inställningarna är sparade – syns på webbplatsen inom en minut");
    if (saved) {
      setS(saved);
      setBaseline(JSON.stringify(saved));
    }
  }

  const a = s.announcement;

  return (
    <div>
      <PageHeader
        title="Inställningar"
        subtitle="Uppgifter som visas på hela webbplatsen"
        actions={
          <Btn variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
            Spara
          </Btn>
        }
      />

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

        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                <Megaphone size={18} className="text-ios-blue" /> Notisbanner
              </h2>
              <p className="text-[13px] text-ios-secondary">En rad högst upp på alla sidor – t.ex. semesterstängt eller en ny bil på auktion.</p>
            </div>
            <Toggle checked={a.enabled} onChange={(v) => setAnn({ enabled: v })} />
          </div>
          <div className={cn("mt-4 grid gap-4 transition-opacity sm:grid-cols-[1fr_260px]", !a.enabled && "opacity-50")}>
            <Field label="Text" hint={`${a.text.length}/200`}>
              <Input value={a.text} maxLength={200} onChange={(e) => setAnn({ text: e.target.value })} placeholder="Vi har semesterstängt v. 29–31" />
            </Field>
            <Field label="Länk (valfri)" hint="T.ex. /auktion eller https://…">
              <Input value={a.link} onChange={(e) => setAnn({ link: e.target.value })} placeholder="/auktion" />
            </Field>
          </div>
          <div className={cn("mt-4 flex flex-wrap items-center gap-4", !a.enabled && "opacity-50")}>
            <Segmented
              value={a.tone}
              onChange={(tone) => setAnn({ tone })}
              options={[
                { value: "info", label: "Blå" },
                { value: "warning", label: "Gul" },
              ]}
            />
          </div>
          <div className="mt-4">
            <p className="mb-1.5 px-1 text-[13px] font-medium text-ios-secondary">Förhandsvisning</p>
            <div className="overflow-hidden rounded-[12px] ring-1 ring-black/[.06]">
              <div className={cn("flex items-center justify-center gap-2 px-4 py-2 text-center font-sans text-sm font-semibold", a.tone === "warning" ? "bg-amber-400 text-graphite-900" : "bg-blue-500 text-white")}>
                <Megaphone size={15} /> {a.text || "Din text här"} {a.link && "→"}
              </div>
              <div className="h-10 bg-white" />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <KeyRound size={18} className="text-ios-secondary" /> Inloggning
          </h2>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ios-secondary">
            Lösenordet till admin sätts med miljövariabeln <code className="rounded bg-ios-fill px-1 text-[13px]">ADMIN_PASSWORD</code> i Netlify (Site configuration →
            Environment variables). När du byter lösenord loggas alla enheter ut automatiskt.
          </p>
          <Btn className="mt-4" variant="destructive" icon={<LogOut size={16} />} onClick={logout}>
            Logga ut på den här enheten
          </Btn>
        </Card>
      </div>
    </div>
  );
}
