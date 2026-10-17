// Kundens sida av chatten (se server/chat.ts). Chattarna sparas i webbläsaren så att kunden
// kommer tillbaka till samma konversation; länken i mejlen (/chatt/<token>) lägger till den.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface ChatMessage {
  id: string;
  sender: "customer" | "staff";
  body: string;
  created_at: string;
  /** Skickas just nu (visas direkt, ersätts när servern svarat) */
  pending?: boolean;
}

export interface ChatSnapshot {
  email: string;
  name: string;
  car: { id: string; title: string } | null;
  messages: ChatMessage[];
  unread: number;
  staff: { name: string; online: boolean; typing: boolean; readAt: string | null };
  estimateMinutes: number;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/chat${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error("Ingen anslutning. Kontrollera nätet och försök igen.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Något gick fel. Försök igen.");
  return data as T;
}

export const chatApi = {
  info: () => call<{ staffName: string; estimateMinutes: number }>("/info"),
  start: (b: { email: string; message: string; carId?: string | null }) => call<{ token: string }>("", { method: "POST", body: b }),
  get: (token: string, after?: string | null) => call<ChatSnapshot>(`/${token}${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  peek: (token: string) => call<ChatSnapshot>(`/${token}?peek=1`),
  send: (token: string, message: string) => call<ChatMessage>(`/${token}/messages`, { method: "POST", body: { message } }),
  typing: (token: string) => call<{ ok: true }>(`/${token}/typing`, { method: "POST" }),
};

export function estimateText(minutes: number) {
  if (minutes < 60) return `inom ~${minutes} min`;
  const h = Math.round(minutes / 60);
  return h < 24 ? `inom ~${h} ${h === 1 ? "timme" : "timmar"}` : "inom ett dygn";
}

/* ------------------------------------------------------------------ */
/* Sparade chattar i webbläsaren                                        */
/* ------------------------------------------------------------------ */

export interface StoredChat {
  token: string;
  carId: string | null;
  title: string;
  at: number;
}

const KEY = "sjodalen-chats";
const EMAIL_KEY = "sjodalen-chat-email";
const listeners = new Set<() => void>();
let cache: StoredChat[] | null = null;

function read(): StoredChat[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

export function rememberChat(c: Omit<StoredChat, "at">) {
  const list = [{ ...c, at: Date.now() }, ...read().filter((x) => x.token !== c.token)].slice(0, 10);
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* privat läge – chatten finns kvar tills fliken stängs */
  }
  listeners.forEach((l) => l());
}

export function useStoredChats() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => [] as StoredChat[],
  );
}

export const chatForCar = (carId: string | null) => read().find((c) => c.carId === carId) ?? null;

export function savedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignorera */
  }
}

/* ------------------------------------------------------------------ */
/* En öppen chatt: hämtar nytt var 2,5 s (10 s när fliken är dold)      */
/* ------------------------------------------------------------------ */

export function useChat(token: string | null) {
  const [snap, setSnap] = useState<ChatSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const lastTyping = useRef(0);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !ids.has(m.id));
      // Ett eget meddelande som skickats klart ersätter den tillfälliga bubblan.
      const kept = prev.filter((m) => !(m.pending && fresh.some((f) => f.sender === m.sender && f.body === m.body)));
      return [...kept, ...fresh];
    });
    last.current = incoming[incoming.length - 1].created_at;
  }, []);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    setMessages([]);
    last.current = null;
    const tick = async () => {
      try {
        const s = await chatApi.get(token, last.current);
        if (stop) return;
        setSnap(s);
        merge(s.messages);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Kunde inte hämta chatten.");
      }
      if (!stop) timer = setTimeout(tick, document.visibilityState === "visible" ? 2500 : 10_000);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, merge]);

  const send = useCallback(
    async (text: string) => {
      if (!token) return;
      const temp: ChatMessage = { id: `tmp-${Date.now()}`, sender: "customer", body: text, created_at: new Date().toISOString(), pending: true };
      setMessages((m) => [...m, temp]);
      try {
        const saved = await chatApi.send(token, text);
        setMessages((m) => (m.some((x) => x.id === saved.id) ? m.filter((x) => x.id !== temp.id) : m.map((x) => (x.id === temp.id ? saved : x))));
        last.current = saved.created_at;
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        throw e;
      }
    },
    [token],
  );

  const typing = useCallback(() => {
    if (!token || Date.now() - lastTyping.current < 3000) return;
    lastTyping.current = Date.now();
    chatApi.typing(token).catch(() => {});
  }, [token]);

  return { snap, messages, error, send, typing };
}
