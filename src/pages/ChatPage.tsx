import { useEffect, useState } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { ChatView } from "../components/chat/ChatView";
import { Logo } from "../components/Logo";
import { chatApi, rememberChat } from "../lib/chat";
import { useSettings } from "../lib/queries";

const route = getRouteApi("/chatt/$token");

/** Länken i mejlen ("Öppna chatten och svara") leder hit. */
export function ChatPage() {
  const { token } = route.useParams();
  const { data: settings } = useSettings();
  const [car, setCar] = useState<{ id: string; title: string } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    chatApi
      .peek(token)
      .then((s) => {
        setCar(s.car);
        rememberChat({ token, carId: s.car?.id ?? null, title: s.car?.title ?? "Chatt med verkstaden" });
      })
      .catch(() => setMissing(true));
  }, [token]);

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      {car ? (
        <Link to="/auktion/$id" params={{ id: car.id }} className="inline-flex items-center gap-1 text-sm font-semibold text-graphite-500 hover:text-graphite-900">
          <ChevronLeft size={16} /> {car.title}
        </Link>
      ) : (
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-graphite-500 hover:text-graphite-900">
          <ChevronLeft size={16} /> Till startsidan
        </Link>
      )}
      <div className="mt-4 flex h-[calc(100dvh-180px)] min-h-[460px] animate-ios-sheet flex-col overflow-hidden rounded-[24px] bg-white shadow-card">
        <header className="flex items-center gap-3 border-b border-graphite-100 px-4 py-3">
          <Logo className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold text-graphite-900">{settings?.company.name || "Sjödalen Bilar"}</p>
            <p className="truncate text-[12px] text-graphite-500">{car?.title ?? "Chatt med verkstaden"}</p>
          </div>
        </header>
        {missing ? (
          <p className="p-8 text-center text-graphite-500">Chatten hittades inte. Kontrollera länken i mejlet.</p>
        ) : (
          <ChatView token={token} carId={car?.id ?? null} carTitle={car?.title ?? null} onStarted={() => {}} />
        )}
      </div>
    </div>
  );
}
