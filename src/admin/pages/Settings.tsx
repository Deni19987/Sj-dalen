import { useEffect, useState } from "react";
import { KeyRound, LogOut, Megaphone, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useSettings } from "../../lib/queries";
import type { SiteSettings } from "../../lib/types";
import { logout, useChangePassword, useCreateUser, useDeleteUser, useSaveSettings, useSession, useUsers, type AdminUser } from "../api";
import { mailTime } from "../helpers";
import { Btn, Card, Field, Input, LoadingBlock, PageHeader, Pill, Segmented, Sheet, Skeleton, Toggle, useFeedback, useRun } from "../ui";

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

        <UsersCard />
      </div>
    </div>
  );
}

function UsersCard() {
  const session = useSession();
  const { data: users, isLoading } = useUsers();
  const del = useDeleteUser();
  const run = useRun();
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function remove(u: AdminUser) {
    const ok = await confirm({
      title: `Ta bort ${u.email}?`,
      message: "Kontot kan inte längre logga in. Det går inte att ångra.",
      confirmLabel: "Ta bort",
      destructive: true,
    });
    if (ok) run(() => del.mutateAsync(u.id), "Kontot är borttaget");
  }

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <Users size={18} className="text-ios-blue" /> Användare
          </h2>
          <p className="text-[13px] text-ios-secondary">Alla konton har full tillgång till admin.</p>
        </div>
        <Btn size="sm" variant="tinted" icon={<UserPlus size={15} />} onClick={() => setAdding(true)}>
          Lägg till användare
        </Btn>
      </div>

      <div className="mt-4 divide-y divide-black/[.05] overflow-hidden rounded-[14px] bg-ios-fill2/60">
        {isLoading && <Skeleton className="m-3 h-10" />}
        {users?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#7c7c80] text-[15px] font-semibold text-white">
              {u.email.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                <span className="truncate">{u.name && !u.owner ? `${u.name} · ${u.email}` : u.email}</span>
                {u.owner && <Pill tone="blue">Huvudkonto</Pill>}
                {session?.email === u.email && <Pill>Du</Pill>}
              </p>
              <p className="text-[12px] text-ios-tertiary">
                {u.owner ? "Styrs av ADMIN_EMAIL och ADMIN_PASSWORD i Netlify" : u.lastLoginAt ? `Senast inloggad ${mailTime(u.lastLoginAt).toLowerCase()}` : "Har inte loggat in än"}
              </p>
            </div>
            {!u.owner && session?.email !== u.email && (
              <Btn size="icon" variant="plain" aria-label={`Ta bort ${u.email}`} onClick={() => remove(u)} className="text-ios-red hover:bg-ios-red/10">
                <Trash2 size={16} />
              </Btn>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {session && !session.owner && (
          <Btn icon={<KeyRound size={16} />} onClick={() => setChangingPassword(true)}>
            Byt mitt lösenord
          </Btn>
        )}
        <Btn variant="destructive" icon={<LogOut size={16} />} onClick={logout}>
          Logga ut på den här enheten
        </Btn>
      </div>
      {session?.owner && (
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ios-tertiary">
          Du är inloggad med huvudkontot. Dess lösenord byts med <code className="rounded bg-ios-fill px-1">ADMIN_PASSWORD</code> i Netlify
          (Site configuration → Environment variables) – då loggas huvudkontot ut på alla enheter.
        </p>
      )}

      {adding && <AddUserSheet onClose={() => setAdding(false)} />}
      {changingPassword && <ChangePasswordSheet onClose={() => setChangingPassword(false)} />}
    </Card>
  );
}

function AddUserSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const run = useRun();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 8;

  async function save() {
    if (!valid) return;
    if ((await run(() => create.mutateAsync({ email: email.trim(), name: name.trim(), password }), "Kontot är skapat")) !== undefined) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ny användare"
      size="sm"
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn variant="primary" loading={create.isPending} disabled={!valid} onClick={save}>
            Skapa konto
          </Btn>
        </>
      }
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="E-post">
          <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Namn (valfritt)">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Lösenord" hint="Minst 8 tecken. Ge det till personen på ett säkert sätt.">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const change = useChangePassword();
  const run = useRun();
  const { toast } = useFeedback();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const valid = !!current && next.length >= 8 && next === repeat;

  async function save() {
    if (!valid) return;
    if ((await run(() => change.mutateAsync({ current, next }))) !== undefined) {
      toast("Lösenordet är bytt – logga in igen med det nya");
      onClose();
      logout(); // gamla inloggningar slutar gälla när lösenordet byts
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Byt lösenord"
      size="sm"
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn variant="primary" loading={change.isPending} disabled={!valid} onClick={save}>
            Byt lösenord
          </Btn>
        </>
      }
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Nuvarande lösenord">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </Field>
        <Field label="Nytt lösenord" hint="Minst 8 tecken.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Upprepa nytt lösenord" hint={repeat && next !== repeat ? "Lösenorden matchar inte." : undefined}>
          <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
