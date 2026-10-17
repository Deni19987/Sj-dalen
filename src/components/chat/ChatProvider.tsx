import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { MessageCircle, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { chatApi, chatForCar, rememberChat, useStoredChats } from "../../lib/chat";
import { useSettings } from "../../lib/queries";
import { Logo } from "../Logo";
import { ChatView } from "./ChatView";

interface OpenArgs {
  carId?: string | null;
  carTitle?: string | null;
  token?: string;
}

const ChatContext = createContext<{ openChat: (a?: OpenArgs) => void }>({ openChat: () => {} });
export const useChatPanel = () => useContext(ChatContext);

/** Chattpanelen: helskärm på mobil, ett fönster nere till höger på dator. */
function Panel({ args, onClose }: { args: OpenArgs; onClose: () => void }) {
  const { data: settings } = useSettings();
  const [token, setToken] = useState<string | null>(args.token ?? chatForCar(args.carId ?? null)?.token ?? null);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    // Mobil: lås sidan bakom helskärmschatten
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    const prev = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  return (
    <div
      role="dialog"
      aria-label="Chatt med verkstaden"
      className={cn(
        "fixed inset-0 z-[60] flex origin-bottom-right flex-col bg-white transition-[opacity,transform] duration-200 ease-ios",
        "sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100dvh-48px))] sm:w-[380px] sm:overflow-hidden sm:rounded-[24px] sm:shadow-ios-sheet",
        closing ? "translate-y-3 scale-95 opacity-0" : "animate-chat-open",
      )}
    >
      <header className="flex items-center gap-3 border-b border-graphite-100 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <Logo className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-graphite-900">{settings?.company.name || "Sjödalen Bilar"}</p>
          <p className="truncate text-[12px] text-graphite-500">{args.carTitle ?? "Vi svarar här och via e-post"}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Stäng chatten"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-graphite-100 text-graphite-600 transition-colors hover:bg-graphite-200"
        >
          <X size={18} />
        </button>
      </header>
      <ChatView
        token={token}
        carId={args.carId ?? null}
        carTitle={args.carTitle ?? null}
        onStarted={(t) => setToken(t)}
      />
    </div>
  );
}

/** Flytande knapp – bara när kunden har en pågående chatt, med prick vid nytt svar. */
function Launcher({ onOpen }: { onOpen: (a: OpenArgs) => void }) {
  const chats = useStoredChats();
  const latest = chats[0];
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!latest) return;
    let stop = false;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      chatApi
        .peek(latest.token)
        .then((s) => !stop && setUnread(s.unread))
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [latest]);

  if (!latest) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setUnread(0);
        onOpen({ token: latest.token, carId: latest.carId, carTitle: latest.carId ? latest.title : null });
      }}
      aria-label={unread ? `Chatten – ${unread} nya svar` : "Öppna chatten"}
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 animate-ios-pop items-center justify-center rounded-full bg-blue-500 text-white shadow-lifted transition-transform duration-150 hover:bg-blue-600 active:scale-95"
    >
      <MessageCircle size={24} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[11px] font-bold">
          {unread}
        </span>
      )}
    </button>
  );
}

export function ChatProvider({ children, hideLauncher }: { children: ReactNode; hideLauncher?: boolean }) {
  const [open, setOpen] = useState<OpenArgs | null>(null);
  const openChat = useCallback((a: OpenArgs = {}) => setOpen(a), []);

  // Om chatten öppnats med en token (t.ex. från mejlet) ska den finnas kvar i webbläsaren.
  useEffect(() => {
    if (open?.token) rememberChat({ token: open.token, carId: open.carId ?? null, title: open.carTitle ?? "Chatt med verkstaden" });
  }, [open]);

  return (
    <ChatContext.Provider value={{ openChat }}>
      {children}
      {open ? <Panel args={open} onClose={() => setOpen(null)} /> : !hideLauncher && <Launcher onOpen={openChat} />}
    </ChatContext.Provider>
  );
}
