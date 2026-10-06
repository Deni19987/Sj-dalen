import { Link } from "@tanstack/react-router";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { telHref } from "../lib/format";
import { useSettings } from "../lib/queries";
import { Logo } from "./Logo";

export function Footer() {
  const { data: settings } = useSettings();
  if (!settings) return null;
  return (
    <footer className="bg-graphite-900 text-graphite-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-tight text-white">
            <Logo className="h-9 w-9 rounded-full ring-2 ring-blue-500" />
            Sjödalen Bilar
          </div>
          <p className="mt-4 text-sm leading-relaxed text-graphite-400">
            Bilverkstad i Sjödalen som både servar din bil och köper in, fixar och säljer bilar
            vidare via vår bilauktion.
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-white">Sidor</h3>
          <ul className="space-y-2 text-sm">
            <li><Link to="/tjanster" className="hover:text-white">Tjänster</Link></li>
            <li><Link to="/boka" className="hover:text-white">Boka tid</Link></li>
            <li><Link to="/auktion" className="hover:text-white">Bilauktion</Link></li>
            <li><Link to="/auktion/salj" className="hover:text-white">Sälj din bil till oss</Link></li>
            <li><Link to="/om-oss" className="hover:text-white">Om oss</Link></li>
            <li><Link to="/faq" className="hover:text-white">Vanliga frågor</Link></li>
            <li><Link to="/admin" className="hover:text-white">Personal</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-white">Kontakt</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-blue-500" />
              {settings.address}
            </li>
            <li className="flex items-center gap-2">
              <Phone size={16} className="shrink-0 text-blue-500" />
              <a href={telHref(settings.phone)} className="hover:text-white">{settings.phone}</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail size={16} className="shrink-0 text-blue-500" />
              <a href={`mailto:${settings.email}`} className="hover:text-white">{settings.email}</a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-white">Öppettider</h3>
          <ul className="space-y-2 text-sm">
            {settings.hours.map((h, i) => (
              <li key={i} className={`flex justify-between gap-4 ${i > 0 ? "pl-6" : ""}`}>
                <span className="flex items-center gap-2">
                  {i === 0 && <Clock size={16} className="text-blue-500" />}
                  {h.label}
                </span>
                <span>{h.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-graphite-800">
        <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-graphite-500 sm:px-6">
          <p>
            Konceptsajt för Sjödalen Bilar AB – texter, bilder, bud och recensioner på sidan är
            exempel i demonstrationssyfte.
          </p>
          <p className="mt-1">© {new Date().getFullYear()} Sjödalen Bilar AB</p>
        </div>
      </div>
    </footer>
  );
}
