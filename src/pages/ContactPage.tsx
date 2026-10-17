import { useState, type FormEvent } from "react";
import { CircleCheck, Clock, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "../components/Button";
import { PageHero } from "../components/PageHero";
import { useChatPanel } from "../components/chat/ChatProvider";
import { rememberChat, saveEmail } from "../lib/chat";
import { telHref } from "../lib/format";
import { useCreateContactMessage, useSettings } from "../lib/queries";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT =
  "w-full rounded-lg border border-graphite-200 px-3 py-2.5 outline-none focus:border-blue-500";

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const send = useCreateContactMessage();
  const { openChat } = useChatPanel();
  const { data: settings } = useSettings();
  const valid = name.trim().length > 1 && EMAIL_RE.test(email) && message.trim().length > 3;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || send.isPending) return;
    send.mutate(
      { name: name.trim(), email: email.trim(), message: message.trim() },
      {
        onSuccess: ({ token }) => {
          if (!token) return;
          saveEmail(email.trim());
          rememberChat({ token, carId: null, title: "Chatt med verkstaden" });
        },
      },
    );
  }

  return (
    <div>
      <PageHero kicker="Kontakt" title="Vi svarar oftast inom en arbetsdag" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="space-y-5 rounded-2xl bg-white p-6 shadow-card">
            <div className="flex items-start gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <p className="font-semibold text-graphite-900">Besöksadress</p>
                <p className="text-graphite-600">{settings?.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone size={20} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <p className="font-semibold text-graphite-900">Telefon</p>
                <a href={telHref(settings?.phone ?? "")} className="text-graphite-600 hover:text-blue-600">
                  {settings?.phone}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail size={20} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <p className="font-semibold text-graphite-900">E-post</p>
                <a href={`mailto:${settings?.email}`} className="text-graphite-600 hover:text-blue-600">
                  {settings?.email}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock size={20} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <p className="font-semibold text-graphite-900">Öppettider</p>
                {settings?.hours.map((h, i) => (
                  <p key={i} className="text-graphite-600">
                    {h.label} {h.value}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex h-40 items-center justify-center rounded-2xl bg-graphite-100">
            <p className="px-6 text-center text-sm text-graphite-400">
              [Karta läggs till här – t.ex. Google Maps med verkstadens adress]
            </p>
          </div>
        </div>

        <div className="lg:col-span-3">
          {send.isSuccess ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-white p-10 text-center shadow-card">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white">
                <CircleCheck size={28} />
              </span>
              <h2 className="mt-5 font-display text-xl font-extrabold uppercase tracking-tight text-graphite-900">
                Tack för ditt meddelande!
              </h2>
              <p className="mt-2 max-w-sm text-graphite-600">
                Vi svarar i chatten här på sajten. Lämnar du sidan skickar vi svaret till {email.trim()}.
              </p>
              {send.data?.token ? (
                <Button className="mt-6" onClick={() => openChat({ token: send.data.token })}>
                  Fortsätt i chatten
                </Button>
              ) : (
                <Button
                  className="mt-6"
                  onClick={() => {
                    send.reset();
                    setName("");
                    setEmail("");
                    setMessage("");
                  }}
                >
                  Skicka ett till meddelande
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="rounded-2xl bg-white p-6 shadow-card sm:p-8">
              <h2 className="font-display text-lg font-extrabold uppercase tracking-tight text-graphite-900">
                Skicka ett meddelande
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-graphite-700">Namn *</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-graphite-700">E-post *</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={INPUT}
                  />
                </label>
              </div>
              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-semibold text-graphite-700">Meddelande *</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  required
                  className={INPUT}
                />
              </label>
              <Button type="submit" disabled={!valid || send.isPending} className="mt-5">
                Skicka meddelande
              </Button>
              {send.isError && <p className="mt-3 text-sm font-semibold text-red-600">{send.error.message}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
