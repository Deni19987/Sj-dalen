import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Mail } from "lucide-react";
import { cn } from "../../lib/cn";
import { chatApi, estimateText, rememberChat, savedEmail, saveEmail, useChat, type ChatMessage } from "../../lib/chat";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const time = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Idag";
  if (d.toDateString() === yesterday.toDateString()) return "Igår";
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
};

/** Grön prick + namn, och tre punkter när verkstaden skriver. */
function Avatar({ name, online }: { name: string; online: boolean }) {
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[13px] font-bold text-white">
      {name.trim().charAt(0).toUpperCase() || "V"}
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 rounded-[18px] rounded-bl-md bg-graphite-100 px-3.5 py-3" aria-label="skriver">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-graphite-500" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

function Bubble({ m, showRead }: { m: ChatMessage; showRead: boolean }) {
  const mine = m.sender === "customer";
  return (
    <div className={cn("flex animate-msg-in flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug",
          mine ? "rounded-br-md bg-blue-500 text-white" : "rounded-bl-md bg-graphite-100 text-graphite-900",
          m.pending && "opacity-60",
        )}
      >
        {m.body}
      </div>
      <span className="mt-0.5 px-1 text-[11px] text-graphite-400">
        {m.pending ? "Skickar…" : time(m.created_at)}
        {showRead && " · Läst"}
      </span>
    </div>
  );
}

/** Starta en chatt: e-post + första meddelandet. */
function StartForm({
  carId,
  carTitle,
  staffName,
  estimate,
  onStarted,
}: {
  carId: string | null;
  carTitle: string | null;
  staffName: string;
  estimate: number | null;
  onStarted: (token: string) => void;
}) {
  const [email, setEmail] = useState(savedEmail);
  const [message, setMessage] = useState(carTitle ? `Hej! Jag har en fråga om ${carTitle}: ` : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return setError("Ange din e-postadress, så att du får svaret även om du lämnar sidan.");
    if (!message.trim()) return setError("Skriv ditt meddelande.");
    setBusy(true);
    setError(null);
    try {
      const { token } = await chatApi.start({ email: em, message: message.trim(), carId });
      saveEmail(em);
      rememberChat({ token, carId, title: carTitle ?? "Chatt med verkstaden" });
      onStarted(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka. Försök igen.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <Avatar name={staffName} online={false} />
          <div className="rounded-[18px] rounded-tl-md bg-graphite-100 px-3.5 py-2.5 text-[15px] leading-snug text-graphite-900">
            Hej! Skriv din fråga{carTitle ? " om bilen" : ""} så svarar vi här i chatten.
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-graphite-700">Din e-post</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="namn@exempel.se"
            className="w-full rounded-xl border border-graphite-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-blue-500"
          />
        </label>
        <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-[13px] leading-snug text-graphite-700">
          <Mail size={15} className="mt-0.5 shrink-0 text-blue-600" />
          Lämnar du sidan skickar vi svaret till din e-post, med en länk tillbaka hit till chatten.
        </p>
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-graphite-700">Meddelande</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-graphite-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-blue-500"
          />
        </label>
        {error && <p className="text-[13px] font-semibold text-red-600">{error}</p>}
      </div>
      <div className="border-t border-graphite-100 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 py-3 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-blue-600 active:scale-[.98] disabled:opacity-60"
        >
          {busy ? "Skickar…" : "Skicka"}
        </button>
        {estimate != null && (
          <p className="mt-2 text-center text-[12px] text-graphite-500">Vi svarar vanligtvis {estimateText(estimate)}</p>
        )}
      </div>
    </form>
  );
}

/** Pågående chatt. */
function Conversation({ token }: { token: string }) {
  const { snap, messages, error, send, typing } = useChat(token);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const staff = snap?.staff;

  // Följ med nedåt när nytt kommer – om man inte själv scrollat upp för att läsa.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages.length, staff?.typing, staff?.online]);

  useEffect(() => {
    if (snap?.car || snap?.email) rememberChat({ token, carId: snap?.car?.id ?? null, title: snap?.car?.title ?? "Chatt med verkstaden" });
  }, [token, snap?.car, snap?.email]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    setSendError(null);
    atBottom.current = true;
    try {
      await send(t);
    } catch (err) {
      setText(t);
      setSendError(err instanceof Error ? err.message : "Kunde inte skicka.");
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // "Läst" under kundens senaste meddelande när verkstaden har sett det.
  const lastMine = [...messages].reverse().find((m) => m.sender === "customer" && !m.pending);
  const readId = lastMine && staff?.readAt && new Date(staff.readAt) >= new Date(lastMine.created_at) ? lastMine.id : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {snap && (
          <p className="mx-auto mb-2 flex max-w-[300px] items-center justify-center gap-1.5 text-center text-[12px] text-graphite-400">
            <Mail size={13} className="shrink-0" /> Svar skickas även till {snap.email}
          </p>
        )}
        {messages.map((m, i) => {
          const newDay = i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
          return (
            <div key={m.id}>
              {newDay && <p className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-graphite-400">{dayLabel(m.created_at)}</p>}
              <Bubble m={m} showRead={m.id === readId} />
            </div>
          );
        })}
        {!snap && !error && <p className="py-10 text-center text-[14px] text-graphite-400">Hämtar chatten…</p>}
        {error && !snap && <p className="py-10 text-center text-[14px] text-red-600">{error}</p>}

        {/* Längst ner: svarstid tills verkstaden är inne, sedan namn + grön prick, och tre punkter när hen skriver. */}
        {staff && (
          <div className="pt-2">
            {staff.typing ? (
              <div className="flex animate-msg-in items-end gap-2">
                <Avatar name={staff.name} online />
                <div>
                  <p className="mb-0.5 px-1 text-[11px] text-graphite-500">{staff.name}</p>
                  <TypingDots />
                </div>
              </div>
            ) : staff.online ? (
              <div className="flex animate-msg-in items-center justify-center gap-2 py-1 text-[12px] text-graphite-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>
                  <span className="font-semibold text-graphite-700">{staff.name}</span> är här
                </span>
              </div>
            ) : (
              <p className="py-1 text-center text-[12px] text-graphite-400">Vi svarar vanligtvis {estimateText(snap!.estimateMinutes)}</p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-graphite-100 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        {sendError && <p className="mb-1.5 px-2 text-[12px] font-semibold text-red-600">{sendError}</p>}
        <div className="flex items-end gap-2 rounded-[22px] border border-graphite-200 bg-white py-1 pl-4 pr-1 transition-colors focus-within:border-blue-500">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              typing();
            }}
            onKeyDown={onKey}
            rows={1}
            maxLength={2000}
            placeholder="Skriv ett meddelande"
            aria-label="Meddelande"
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Skicka"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-[transform,opacity] duration-150 active:scale-90 disabled:opacity-30"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}

/** Hela chattens innehåll: startformulär eller pågående konversation. */
export function ChatView({
  token,
  carId,
  carTitle,
  onStarted,
}: {
  token: string | null;
  carId: string | null;
  carTitle: string | null;
  onStarted: (token: string) => void;
}) {
  const [info, setInfo] = useState<{ staffName: string; estimateMinutes: number } | null>(null);
  useEffect(() => {
    if (!token) chatApi.info().then(setInfo).catch(() => {});
  }, [token]);
  return token ? (
    <Conversation key={token} token={token} />
  ) : (
    <StartForm carId={carId} carTitle={carTitle} staffName={info?.staffName ?? "Verkstaden"} estimate={info?.estimateMinutes ?? null} onStarted={onStarted} />
  );
}
