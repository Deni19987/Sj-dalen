import { useEffect, useState } from "react";
import { Bell, BellOff, Share, SquarePlus } from "lucide-react";
import { pushApi, type PushTopic } from "./api";
import {
  currentSubscription,
  enablePush,
  disablePush,
  isPushSupported,
  needsHomeScreen,
  registerPushServiceWorker,
  restorePushAfterSignIn,
  TOPIC_GROUPS,
  TOPIC_LABELS,
} from "./push";
import { Btn, Card, Sheet, Toggle, useFeedback, useRun } from "./ui";

const ALL_TOPICS = Object.keys(TOPIC_LABELS) as PushTopic[];

/** Så lägger man till admin på hemskärmen i Safari (krävs för notiser på iPhone). */
function HomeScreenSteps() {
  return (
    <ol className="space-y-3 text-[15px] text-ios-label">
      <li className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ios-fill text-ios-blue">
          <Share size={17} />
        </span>
        Tryck på Dela-knappen i Safari
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ios-fill text-ios-blue">
          <SquarePlus size={17} />
        </span>
        Välj ”Lägg till på hemskärmen”
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ios-fill text-ios-blue">
          <Bell size={17} />
        </span>
        Öppna Sjödalen Admin från hemskärmen och slå på notiser
      </li>
    </ol>
  );
}

type State = "loading" | "unsupported" | "homescreen" | "denied" | "off" | "on";

/** Kortet under Inställningar: slå på/av notiser på den här enheten och välj vad den ska få. */
export function PushSettingsCard() {
  const [state, setState] = useState<State>("loading");
  const [topics, setTopics] = useState<PushTopic[]>(ALL_TOPICS);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const { toast } = useFeedback();

  useEffect(() => {
    (async () => {
      if (needsHomeScreen()) return setState("homescreen");
      if (!isPushSupported()) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        await registerPushServiceWorker();
        const sub = await currentSubscription();
        if (!sub) return setState("off");
        const s = await pushApi.status(sub.endpoint);
        // Prenumerationen finns i telefonen men inte på servern (t.ex. borttagen) – visa som avstängd.
        setEndpoint(s.subscribed ? sub.endpoint : null);
        setTopics(s.topics);
        setState(s.subscribed ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const s = await enablePush(topics);
      setTopics(s.topics);
      setEndpoint((await currentSubscription())?.endpoint ?? null);
      setState("on");
      toast("Notiser är påslagna på den här enheten");
    } catch (e) {
      if (Notification.permission === "denied") setState("denied");
      toast(e instanceof Error ? e.message : "Kunde inte slå på notiser", "error");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const ok = await run(() => disablePush(), "Notiser är avstängda på den här enheten");
    if (ok !== undefined) {
      setEndpoint(null);
      setState("off");
    }
    setBusy(false);
  }

  async function toggleTopic(t: PushTopic, on: boolean) {
    if (!endpoint) return;
    const next = on ? [...topics, t] : topics.filter((x) => x !== t);
    setTopics(next);
    const s = await run(() => pushApi.setTopics(endpoint, next));
    setTopics(s ? s.topics : topics);
  }

  return (
    <Card className="lg:col-span-2">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Bell size={18} className="text-ios-blue" /> Notiser på den här enheten
      </h2>
      <p className="text-[13px] text-ios-secondary">Få en notis i mobilen direkt när något nytt kommer in – även när appen är stängd.</p>

      <div className="mt-4">
        {state === "loading" && <p className="text-[14px] text-ios-tertiary">Kontrollerar…</p>}
        {state === "homescreen" && (
          <div className="rounded-[14px] bg-ios-fill2 p-4">
            <p className="mb-3 text-[14px] text-ios-secondary">På iPhone fungerar notiser när admin ligger på hemskärmen:</p>
            <HomeScreenSteps />
          </div>
        )}
        {state === "unsupported" && (
          <p className="text-[14px] text-ios-secondary">Den här webbläsaren kan inte ta emot notiser. Prova Safari på iPhone eller Chrome på Android och datorn.</p>
        )}
        {state === "denied" && (
          <p className="text-[14px] text-ios-secondary">
            Notiser är blockerade för admin på den här enheten. Tillåt dem i telefonens eller webbläsarens inställningar och ladda om sidan.
          </p>
        )}
        {state === "off" && (
          <Btn variant="primary" icon={<Bell size={16} />} onClick={turnOn} loading={busy}>
            Slå på notiser
          </Btn>
        )}
        {state === "on" && (
          <div className="space-y-4">
            <p className="text-[13px] text-ios-secondary">Välj vilka notiser den här enheten ska få.</p>
            {TOPIC_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-ios-tertiary">{g.title}</p>
                <div className="divide-y divide-black/[.06] rounded-[14px] bg-ios-fill2 px-4">
                  {g.topics.map((t) => (
                    <div key={t} className="py-2.5">
                      <Toggle
                        checked={topics.includes(t)}
                        onChange={(v) => toggleTopic(t, v)}
                        label={TOPIC_LABELS[t].label}
                        description={TOPIC_LABELS[t].description}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn size="sm" variant="plain" onClick={() => endpoint && run(() => pushApi.test(endpoint), "Testnotisen är skickad")}>
                Skicka en testnotis
              </Btn>
              <Btn size="sm" variant="destructive" icon={<BellOff size={15} />} onClick={turnOff} loading={busy}>
                Stäng av notiser
              </Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

const SHOWN_COUNT_KEY = "sjodalen-push-prompt-count";
const SESSION_FLAG_KEY = "sjodalen-push-prompt-seen";
const MAX_PROMPTS = 2;
const DONE = 99;

const shownCount = () => Number.parseInt(localStorage.getItem(SHOWN_COUNT_KEY) ?? "0", 10) || 0;
const setShownCount = (n: number) => localStorage.setItem(SHOWN_COUNT_KEY, String(n));

/**
 * Fråga efter inloggning (som i Carflow): högst två gånger per enhet och en gång per inloggning.
 * På iPhone i Safari visas i stället hur man lägger admin på hemskärmen.
 */
export function PushPrompt() {
  const [mode, setMode] = useState<"enable" | "homescreen" | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await restorePushAfterSignIn()) return;
        if (sessionStorage.getItem(SESSION_FLAG_KEY) || shownCount() >= MAX_PROMPTS) return;
        let next: "enable" | "homescreen";
        if (needsHomeScreen()) next = "homescreen";
        else if (!isPushSupported() || Notification.permission === "denied") return;
        else {
          if (Notification.permission === "granted" && (await currentSubscription())) return setShownCount(DONE);
          next = "enable";
        }
        if (cancelled) return;
        // Räknas när den visas, så att även en stängd flik räknas som en gång.
        sessionStorage.setItem(SESSION_FLAG_KEY, "1");
        setShownCount(shownCount() + 1);
        setMode(next);
      } catch {
        /* privat läge e.d. – fråga inte */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onEnable() {
    setBusy(true);
    try {
      await enablePush();
      setShownCount(DONE);
      toast("Notiser är påslagna");
      setMode(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunde inte slå på notiser", "error");
      setMode(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={mode !== null}
      onClose={() => setMode(null)}
      size="sm"
      footer={
        mode === "enable" ? (
          <div className="flex flex-col gap-2">
            <Btn variant="primary" size="lg" className="w-full" onClick={onEnable} loading={busy}>
              Slå på notiser
            </Btn>
            <Btn variant="plain" className="w-full" onClick={() => setMode(null)}>
              Inte nu
            </Btn>
          </div>
        ) : (
          <Btn variant="primary" size="lg" className="w-full" onClick={() => setMode(null)}>
            Okej
          </Btn>
        )
      }
    >
      <div className="px-5 pb-2 pt-6 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ios-blue/10 text-ios-blue">
          <Bell size={26} />
        </span>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">
          {mode === "homescreen" ? "Lägg admin på hemskärmen" : "Få notiser i mobilen"}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[15px] text-ios-secondary">
          {mode === "homescreen"
            ? "Då öppnas admin som en app, och du kan få en notis direkt vid nya bud, bokningar och meddelanden."
            : "Få en notis direkt vid nya bud, bokningar och meddelanden – även när appen är stängd. Du väljer vad du vill få under Inställningar."}
        </p>
        {mode === "homescreen" && (
          <div className="mt-5 text-left">
            <HomeScreenSteps />
          </div>
        )}
      </div>
    </Sheet>
  );
}
