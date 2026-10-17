import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowUp, Car, ChevronLeft, ExternalLink, HandCoins, Inbox as InboxIcon, Mail, MailWarning, Phone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../../lib/cn";
import { useSettings } from "../../lib/queries";
import { adminKeys, chatAdminApi, chatKeys, useConversations, type Conversation, type EmailOutcome, type StaffChatMessage } from "../api";
import { siteUrl, telHref } from "../helpers";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Segmented, useRun } from "../ui";

const timeShort = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
const who = (c: Conversation) => c.name || c.email;
const KIND_LABEL: Record<Conversation["kind"], string | null> = { chat: null, contact: "Kontaktformulär", sell: "Vill sälja bil" };

function Initial({ c, size = "md" }: { c: Conversation; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        c.kind === "sell" ? "bg-ios-orange" : "bg-ios-blue",
        size === "lg" ? "h-10 w-10 text-[16px]" : "h-11 w-11 text-[17px]",
      )}
    >
      {who(c).trim().charAt(0).toUpperCase()}
      {c.customerOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-ios-green" />}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Listan                                                               */
/* ------------------------------------------------------------------ */

function ConversationList({ items, activeId }: { items: Conversation[]; activeId?: string }) {
  return (
    <ul className="divide-y divide-black/[.06] overflow-hidden rounded-[14px] bg-white shadow-ios-card">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            to="/admin/inkorg/$id"
            params={{ id: c.id }}
            className={cn("flex items-center gap-3 px-4 py-3 transition-colors active:bg-ios-fill2", activeId === c.id ? "bg-ios-blue/[.07]" : "hover:bg-black/[.02]")}
          >
            <Initial c={c} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("truncate text-[15px]", c.unread ? "font-semibold" : "font-medium")}>{who(c)}</p>
                <span className={cn("shrink-0 text-[12px]", c.unread ? "font-semibold text-ios-blue" : "text-ios-tertiary")}>{timeShort(c.lastMessageAt)}</span>
              </div>
              {(c.car || KIND_LABEL[c.kind]) && (
                <p className="truncate text-[12px] font-medium text-ios-secondary">{c.car?.title ?? KIND_LABEL[c.kind]}</p>
              )}
              <div className="flex items-center gap-2">
                <p className={cn("line-clamp-1 flex-1 text-[14px]", c.unread ? "text-ios-label" : "text-ios-secondary")}>
                  {c.customerTyping ? <span className="italic text-ios-blue">skriver…</span> : <>{c.lastSender === "staff" && "Du: "}{c.lastBody}</>}
                </p>
                {c.unread > 0 && (
                  <span className="min-w-[20px] rounded-full bg-ios-blue px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{c.unread}</span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* En konversation                                                      */
/* ------------------------------------------------------------------ */

const EMAIL_NOTE: Record<EmailOutcome, { text: string; warn?: boolean } | null> = {
  sent: { text: "Kunden har fått ett mejl om svaret" },
  online: null,
  already: { text: "Kunden har redan fått ett mejl – nästa skickas när kunden varit tillbaka i chatten" },
  not_connected: { text: "E-post är inte ansluten – kunden får inget mejl. Anslut Gmail under Inställningar.", warn: true },
  failed: { text: "Mejlet till kunden kunde inte skickas. Kontrollera e-posten under Inställningar.", warn: true },
};

function useThread(id: string) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<StaffChatMessage[]>([]);
  const [error, setError] = useState<unknown>(null);
  const last = useRef<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    setConv(null);
    setMessages([]);
    last.current = null;
    let first = true;
    const tick = async () => {
      try {
        const r = await chatAdminApi.thread(id, last.current);
        if (stop) return;
        setConv(r.conversation);
        if (r.messages.length) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const fresh = r.messages.filter((m) => !ids.has(m.id));
            return [...prev.filter((m) => !(m.pending && fresh.some((f) => f.body === m.body && f.sender === "staff"))), ...fresh];
          });
          last.current = r.messages[r.messages.length - 1].created_at;
        }
        // Läst: uppdatera listan och menyns siffra direkt
        if (first) {
          first = false;
          qc.invalidateQueries({ queryKey: chatKeys.list("open") });
          qc.invalidateQueries({ queryKey: adminKeys.overview });
        }
        setError(null);
      } catch (e) {
        if (!stop) setError(e);
      }
      if (!stop) timer = setTimeout(tick, document.visibilityState === "visible" ? 2500 : 10_000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, qc]);

  const send = useCallback(
    async (text: string) => {
      const temp: StaffChatMessage = { id: `tmp-${Date.now()}`, sender: "staff", body: text, created_at: new Date().toISOString(), pending: true };
      setMessages((m) => [...m, temp]);
      try {
        const r = await chatAdminApi.send(id, text);
        setMessages((m) => (m.some((x) => x.id === r.message.id) ? m.filter((x) => x.id !== temp.id) : m.map((x) => (x.id === temp.id ? r.message : x))));
        last.current = r.message.created_at;
        qc.invalidateQueries({ queryKey: chatKeys.list("open") });
        return r.email;
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        throw e;
      }
    },
    [id, qc],
  );

  return { conv, messages, error, send };
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const { conv, messages, error, send } = useThread(id);
  const { data: settings } = useSettings();
  // ?utkast=… – ett färdigt meddelande (t.ex. betalningsuppgifter till köparen) att ändra och skicka
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get("utkast") ?? "");
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("utkast")) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    input.current?.focus();
  }, []);
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);
  const lastTyping = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const run = useRun();
  const qc = useQueryClient();
  const quick = settings?.chat.quickReplies ?? [];

  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages.length, conv?.customerTyping]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      const outcome = await send(t);
      setNote(EMAIL_NOTE[outcome]);
    } catch (err) {
      setText(t);
      setNote({ text: err instanceof Error ? err.message : "Kunde inte skicka.", warn: true });
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      submit();
    }
  }

  async function toggleArchive() {
    if (!conv) return;
    const next = conv.status === "open" ? "archived" : "open";
    const ok = await run(() => chatAdminApi.setStatus(conv.id, next), next === "archived" ? "Chatten är arkiverad" : "Chatten är flyttad till Aktiva");
    if (ok) {
      qc.invalidateQueries({ queryKey: ["admin", "chats"] });
      if (next === "archived") onBack();
    }
  }

  const lastStaff = [...messages].reverse().find((m) => m.sender === "staff" && !m.pending);
  const seenId = lastStaff && conv?.customerReadAt && new Date(conv.customerReadAt) >= new Date(lastStaff.created_at) ? lastStaff.id : null;

  return (
    <div className="fixed inset-0 z-50 flex animate-ios-sheet flex-col bg-ios-bg lg:static lg:z-auto lg:h-[calc(100dvh-260px)] lg:min-h-[480px] lg:overflow-hidden lg:rounded-[18px] lg:bg-white lg:shadow-ios-card">
      {/* Huvud */}
      <header className="flex items-center gap-3 border-b border-black/[.06] bg-white/85 px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl lg:px-5">
        <button type="button" onClick={onBack} aria-label="Tillbaka till inkorgen" className="flex h-9 items-center gap-0.5 pr-1 text-[17px] text-ios-blue lg:hidden">
          <ChevronLeft size={24} /> Inkorg
        </button>
        {conv && (
          <>
            <Initial c={conv} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{who(conv)}</p>
              <p className={cn("truncate text-[12px]", conv.customerOnline ? "text-ios-green" : "text-ios-secondary")}>
                {conv.customerTyping ? "skriver…" : conv.customerOnline ? "Online nu" : conv.email}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleArchive}
              aria-label={conv.status === "open" ? "Arkivera" : "Flytta till Aktiva"}
              title={conv.status === "open" ? "Arkivera" : "Flytta till Aktiva"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ios-blue hover:bg-ios-blue/10"
            >
              {conv.status === "open" ? <Archive size={19} /> : <ArchiveRestore size={19} />}
            </button>
          </>
        )}
      </header>

      {/* Om kunden / bilen */}
      {conv && (conv.car || conv.kind === "sell" || conv.phone) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[.06] bg-white px-4 py-2 text-[13px] lg:px-5">
          {conv.car && (
            <a href={siteUrl(`/auktion/${conv.car.id}`)} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-full bg-ios-fill2 px-3 py-1 font-medium text-ios-label">
              <Car size={14} className="text-ios-blue" /> {conv.car.title} <ExternalLink size={12} className="text-ios-tertiary" />
            </a>
          )}
          {conv.kind === "sell" && conv.details.make && (
            <span className="flex items-center gap-1.5 rounded-full bg-ios-orange/10 px-3 py-1 font-medium text-ios-label">
              <HandCoins size={14} className="text-ios-orange" /> {conv.details.make} {conv.details.model} {conv.details.year}
              {conv.details.mileageKm != null && ` · ${conv.details.mileageKm.toLocaleString("sv-SE")} mil`}
            </span>
          )}
          {conv.phone && (
            <a href={telHref(conv.phone)} className="flex items-center gap-1.5 rounded-full bg-ios-fill2 px-3 py-1 font-medium text-ios-blue">
              <Phone size={14} /> {conv.phone}
            </a>
          )}
          <a href={`mailto:${conv.email}`} className="flex items-center gap-1.5 rounded-full bg-ios-fill2 px-3 py-1 font-medium text-ios-blue">
            <Mail size={14} /> E-post
          </a>
        </div>
      )}

      {/* Meddelanden */}
      <div ref={list} className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-4 lg:px-5">
        {!conv && !error && <LoadingBlock />}
        {error != null && !conv && <ErrorBlock error={error} />}
        {messages.map((m, i) => {
          const mine = m.sender === "staff";
          const gap = i > 0 && new Date(m.created_at).getTime() - new Date(messages[i - 1].created_at).getTime() > 30 * 60_000;
          return (
            <div key={m.id}>
              {(i === 0 || gap) && (
                <p className="py-2 text-center text-[11px] font-medium text-ios-tertiary">
                  {new Date(m.created_at).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <div className={cn("flex animate-ios-fade flex-col", mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug",
                    mine ? "rounded-br-md bg-ios-blue text-white" : "rounded-bl-md bg-white text-ios-label shadow-[0_0_0_.5px_rgba(0,0,0,.06)] lg:bg-ios-fill2 lg:shadow-none",
                    m.pending && "opacity-60",
                  )}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 px-1 text-[11px] text-ios-tertiary">
                  {m.pending ? "Skickar…" : clock(m.created_at)}
                  {m.id === seenId && " · Läst"}
                </span>
              </div>
            </div>
          );
        })}
        {conv && messages.length === 0 && (
          <p className="mx-auto max-w-[280px] py-10 text-center text-[14px] text-ios-tertiary">
            Skriv det första meddelandet – {conv.name ? conv.name.split(" ")[0] : "kunden"} får det även på mejl med en länk till chatten.
          </p>
        )}
        {conv?.customerTyping && (
          <div className="flex animate-ios-fade">
            <span className="flex items-center gap-1 rounded-[18px] rounded-bl-md bg-white px-3.5 py-3 lg:bg-ios-fill2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-ios-tertiary" style={{ animationDelay: `${i * 0.16}s` }} />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Skriv */}
      <form onSubmit={submit} className="border-t border-black/[.06] bg-white/85 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:px-4">
        {note && (
          <p className={cn("mb-1.5 flex items-center gap-1.5 px-1 text-[12px]", note.warn ? "text-ios-orange" : "text-ios-secondary")}>
            {note.warn ? <MailWarning size={14} className="shrink-0" /> : <Mail size={14} className="shrink-0" />} {note.text}
          </p>
        )}
        {quick.length > 0 && !text && (
          <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setText(q);
                  input.current?.focus();
                }}
                className="max-w-[260px] shrink-0 truncate rounded-full border border-ios-blue/25 px-3 py-1.5 text-[13px] text-ios-blue transition-colors hover:bg-ios-blue/10"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-[22px] border border-black/[.1] bg-white py-1 pl-4 pr-1">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (Date.now() - lastTyping.current > 3000) {
                lastTyping.current = Date.now();
                chatAdminApi.typing(id).catch(() => {});
              }
            }}
            onKeyDown={onKey}
            rows={1}
            maxLength={2000}
            placeholder={conv ? `Svara ${conv.name ? conv.name.split(" ")[0] : "kunden"}` : "Svara"}
            aria-label="Svar"
            className="max-h-36 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-snug outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Skicka"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ios-blue text-white transition-[transform,opacity] duration-150 active:scale-90 disabled:opacity-30"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidan                                                                */
/* ------------------------------------------------------------------ */

export function InboxPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const [status, setStatus] = useState<"open" | "archived">("open");
  const { data, isLoading, error, refetch } = useConversations(status);
  const items = data?.conversations ?? [];
  const unread = items.filter((c) => c.unread > 0).length;
  const back = () => navigate({ to: "/admin/inkorg" });

  return (
    <div>
      <PageHeader title="Inkorg" subtitle={unread ? `${unread} ${unread === 1 ? "chatt väntar" : "chattar väntar"} på svar` : "Chattar, kontaktformuläret och ”Sälj din bil”"} />
      {data && !data.mailConnected && (
        <Link
          to="/admin/installningar"
          hash="epost"
          className="mb-4 flex items-center gap-2 rounded-[14px] bg-ios-orange/10 px-4 py-3 text-[14px] text-ios-label"
        >
          <MailWarning size={18} className="shrink-0 text-ios-orange" />
          <span className="flex-1">Anslut din Gmail så får kunderna dina svar på mejl när de lämnat sajten.</span>
          <span className="font-medium text-ios-blue">Anslut</span>
        </Link>
      )}
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn(id && "hidden lg:block")}>
          <Segmented
            className="mb-3"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Aktiva" },
              { value: "archived", label: "Arkiverade" },
            ]}
          />
          {error && <ErrorBlock error={error} retry={() => refetch()} />}
          {isLoading && <LoadingBlock />}
          {data && items.length === 0 && (
            <EmptyState
              icon={<InboxIcon size={26} />}
              title={status === "open" ? "Inga chattar" : "Inget arkiverat"}
              text={status === "open" ? "När en kund skriver i chatten, kontaktformuläret eller ”Sälj din bil” hamnar det här." : undefined}
            />
          )}
          {items.length > 0 && <ConversationList items={items} activeId={id} />}
        </div>
        <div className={cn(!id && "hidden lg:block")}>
          {id ? (
            <Thread key={id} id={id} onBack={back} />
          ) : (
            <div className="flex h-[calc(100dvh-260px)] min-h-[480px] items-center justify-center rounded-[18px] bg-white text-[15px] text-ios-tertiary shadow-ios-card">
              Välj en chatt
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
