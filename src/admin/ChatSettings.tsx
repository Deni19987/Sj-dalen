import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Mail, MessageCircle, Plus, Unplug, X } from "lucide-react";
import { useSettings } from "../lib/queries";
import { mailApi, useMailStatus, useSaveSettings } from "./api";
import { Btn, Card, Field, Input, TextArea, useFeedback, useRun } from "./ui";

/** Namnet kunden ser i chatten och personalens snabbsvar. */
export function ChatSettingsCard() {
  const { data: settings, isPlaceholderData } = useSettings();
  const save = useSaveSettings();
  const run = useRun();
  const [name, setName] = useState("");
  const [replies, setReplies] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!settings || isPlaceholderData || loaded) return;
    setName(settings.chat.staffName);
    setReplies(settings.chat.quickReplies);
    setLoaded(true);
  }, [settings, isPlaceholderData, loaded]);

  const dirty =
    loaded && settings && (name !== settings.chat.staffName || JSON.stringify(replies) !== JSON.stringify(settings.chat.quickReplies));

  async function onSave() {
    if (!settings) return;
    await run(
      () => save.mutateAsync({ ...settings, chat: { staffName: name.trim(), quickReplies: replies.map((r) => r.trim()).filter(Boolean) } }),
      "Chattinställningarna är sparade",
    );
  }

  return (
    <Card className="lg:col-span-2">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <MessageCircle size={18} className="text-ios-blue" /> Chatten
      </h2>
      <p className="text-[13px] text-ios-secondary">Så ser du ut för kunderna när du svarar.</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Field label="Ditt namn i chatten" hint="Syns längst ner i chatten när du är inne, t.ex. ”Johan på Sjödalen”.">
          <Input value={name} maxLength={40} placeholder="Verkstaden" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-medium text-ios-secondary">Snabbsvar</p>
          <div className="space-y-2">
            {replies.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <TextArea
                  value={r}
                  rows={2}
                  maxLength={500}
                  onChange={(e) => setReplies(replies.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button
                  type="button"
                  aria-label="Ta bort snabbsvar"
                  onClick={() => setReplies(replies.filter((_, j) => j !== i))}
                  className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-tertiary hover:bg-ios-red/10 hover:text-ios-red"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <Btn size="sm" variant="plain" icon={<Plus size={15} />} onClick={() => setReplies([...replies, ""])} disabled={replies.length >= 12}>
              Lägg till snabbsvar
            </Btn>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Btn variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
          Spara
        </Btn>
      </div>
    </Card>
  );
}

/** Anslut Gmail: mejlen till kunderna skickas från verkstadens egen adress. */
export function MailCard() {
  const { data, refetch } = useMailStatus();
  const run = useRun();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Tillbaka från Google: ?epost=ansluten eller ?epost=fel&orsak=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const status = p.get("epost");
    if (!status) return;
    if (status === "ansluten") toast("Gmail är ansluten");
    else toast(p.get("orsak") ?? "Kunde inte ansluta Gmail", "error");
    if (status !== "ansluten") setShowSetup(true);
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    refetch();
  }, [toast, refetch]);

  // Länk hit med #epost (t.ex. från Inkorgen): scrolla fram kortet när det finns.
  useEffect(() => {
    if (data && window.location.hash === "#epost") document.getElementById("epost")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);

  async function connect() {
    setBusy(true);
    const r = await run(() => mailApi.connect());
    if (r) window.location.href = r.url;
    else setBusy(false);
  }

  return (
    <Card id="epost" className="scroll-mt-6 lg:col-span-2">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Mail size={18} className="text-ios-blue" /> E-post till kunderna
      </h2>
      <p className="text-[13px] text-ios-secondary">
        Svar i chatten, ”du har blivit överbjuden” och ”du har högst bud” skickas från din egen Gmail.
      </p>

      <div className="mt-4">
        {!data ? (
          <p className="text-[14px] text-ios-tertiary">Kontrollerar…</p>
        ) : data.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-ios-green/10 px-3 py-1.5 text-[14px] font-medium text-ios-label">
              <CheckCircle2 size={16} className="text-ios-green" /> {data.email}
            </span>
            <Btn size="sm" variant="plain" onClick={() => run(() => mailApi.test(), "Testmejlet är skickat till din inkorg")}>
              Skicka ett testmejl
            </Btn>
            <Btn
              size="sm"
              variant="destructive"
              icon={<Unplug size={15} />}
              onClick={async () => {
                const ok = await run(() => mailApi.disconnect(), "Gmail är bortkopplad");
                if (ok) refetch();
              }}
            >
              Koppla bort
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            <Btn variant="primary" icon={<Mail size={16} />} onClick={connect} loading={busy} disabled={!data.configured}>
              Anslut Gmail
            </Btn>
            {!data.configured && (
              <p className="text-[13px] text-ios-orange">
                Google-kopplingen saknas på servern. Samma Google-nycklar som används för registerutdrag (GMAIL_CLIENT_ID och
                GMAIL_CLIENT_SECRET) behöver finnas i Netlify.
              </p>
            )}
            <p className="text-[13px] text-ios-secondary">
              Du loggar in hos Google och godkänner att sajten får <strong>skicka</strong> e-post från din adress. Den kan inte
              läsa din inkorg. Kunderna svarar i chatten, men svar på mejlen hamnar i din vanliga inkorg.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-black/[.06] pt-3">
        <button type="button" onClick={() => setShowSetup((v) => !v)} className="text-[13px] font-medium text-ios-blue">
          {showSetup ? "Dölj" : "Fungerar inte inloggningen?"}
        </button>
        {showSetup && data && (
          <div className="mt-2 space-y-2 text-[13px] text-ios-secondary">
            <p>
              Första gången behöver adressen nedan läggas till i Google Cloud: <strong>APIs &amp; Services → Credentials</strong>,
              öppna OAuth-klienten och lägg till den under <strong>Authorized redirect URIs</strong>. Under{" "}
              <strong>OAuth consent screen</strong> ska Gmail API vara aktiverat och appen stå på <strong>In production</strong>.
            </p>
            <div className="flex items-center gap-2 rounded-[10px] bg-ios-fill2 px-3 py-2 font-mono text-[12px] text-ios-label">
              <span className="min-w-0 flex-1 truncate">{data.redirectUri}</span>
              <button
                type="button"
                aria-label="Kopiera"
                onClick={() => navigator.clipboard?.writeText(data.redirectUri).then(() => toast("Kopierad"))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-blue hover:bg-ios-blue/10"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
