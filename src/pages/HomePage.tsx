import { Link } from "@tanstack/react-router";
import { ArrowRight, Award, Calendar, Gavel, PhoneCall, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "../components/Button";
import { CarCard } from "../components/CarCard";
import { CarIllustration } from "../components/CarIllustration";
import { SectionTitle } from "../components/SectionTitle";
import { Stars } from "../components/Stars";
import { useCars, useReviews, useServices } from "../lib/queries";

const REASONS = [
  {
    icon: PhoneCall,
    title: "Vi ringer innan det kostar mer",
    text: "Upptäcker vi något extra under jobbet hör vi alltid av oss innan vi fixar det – aldrig en överraskning på notan.",
  },
  {
    icon: Wrench,
    title: "Alla märken, ett stopp",
    text: "Från vardagsservice till större reparationer – oavsett om det står Volvo eller Volkswagen på grillen.",
  },
  {
    icon: ShieldCheck,
    title: "Bilar vi själva besiktigat",
    text: "Bilarna på vår auktion är genomgångna av våra egna mekaniker innan de läggs ut – inte bara en snabb koll.",
  },
  {
    icon: Award,
    title: "Kunder som kommer tillbaka",
    text: "Många av våra bilköpare är först och främst verkstadskunder – och tvärtom.",
  },
];

export function HomePage() {
  const { data: services = [] } = useServices();
  const { data: cars = [] } = useCars();
  const { data: reviews = [] } = useReviews();

  const popular = services.filter((s) => s.popular);
  const endingSoon = cars
    .filter((c) => c.status === "active")
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
    .slice(0, 3);

  return (
    <div>
      <section className="relative overflow-hidden bg-white px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-500">Bilverkstad i Sjödalen</p>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-tight text-graphite-900 sm:text-5xl">
              Vi lagar din bil.
              <br />
              Och säljer några till.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-graphite-600">
              Sjödalen Bilar sköter service och reparationer på alla bilmärken – och lägger ut
              verkstadsbesiktigade bilar vi själva köpt in på vår egen bilauktion.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/boka" size="lg">
                Boka tid <ArrowRight size={18} />
              </Button>
              <Button to="/auktion" size="lg" variant="outline">
                Se bilar till salu
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold text-graphite-500">
              <span>Alla märken</span>
              <span>Certifierade mekaniker</span>
              <span>Öppet mån–lör</span>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-3xl bg-graphite-100 p-10">
              <CarIllustration colorHex="#2563A6" bodyType="kombi" className="w-full" />
            </div>
            <div className="absolute -bottom-4 left-6 rounded-xl bg-white px-4 py-3 shadow-lifted sm:left-10">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-500" />
                <span className="text-sm font-bold text-graphite-900">Verkstadsbesiktigad</span>
              </div>
              <p className="text-xs text-graphite-500">Kontrollerad innan den läggs ut på auktion</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-graphite-50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionTitle kicker="Vanligast bokat" title="Populära tjänster" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((s) => (
              <Link
                key={s.id}
                to="/tjanster"
                className="flex flex-col rounded-2xl bg-white p-5 shadow-card transition-shadow hover:shadow-lifted"
              >
                <h3 className="font-display font-bold text-graphite-900">{s.name}</h3>
                <p className="mt-1 flex-1 text-sm text-graphite-500">{s.description}</p>
                <p className="mt-4 text-sm font-bold text-blue-600">från {s.priceFrom.toLocaleString("sv-SE")} kr</p>
              </Link>
            ))}
          </div>
          <div className="mt-6">
            <Button to="/tjanster" variant="ghost">
              Se alla tjänster <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionTitle kicker="Varför Sjödalen Bilar" title="Verkstaden som ger raka besked" />
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {REASONS.map((r) => (
              <div key={r.title} className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                  <r.icon size={22} />
                </span>
                <div>
                  <h3 className="font-display font-bold text-graphite-900">{r.title}</h3>
                  <p className="mt-1 text-graphite-600">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-graphite-900 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle kicker="Bilauktion" title="Bilar vi köpt in och fixat till" dark />
            <span className="flex items-center gap-2 text-sm font-semibold text-graphite-300">
              <Gavel size={16} className="text-blue-500" /> Ny bil in nästan varje vecka
            </span>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {endingSoon.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button to="/auktion">
              Se alla bilar <ArrowRight size={16} />
            </Button>
            <Link to="/auktion/salj" className="text-sm font-semibold text-graphite-300 hover:text-white">
              Vill du sälja din bil till oss? →
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-graphite-50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionTitle kicker="Omdömen" title="Vad kunderna säger" />
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {reviews.slice(0, 3).map((r) => (
              <div key={r.id} className="rounded-2xl bg-white p-6 shadow-card">
                <Stars rating={r.rating} />
                <p className="mt-3 text-graphite-700">"{r.text}"</p>
                <p className="mt-4 text-sm font-bold text-graphite-900">{r.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-500 px-4 py-14 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-white sm:text-3xl">
              Boka in bilen redan idag
            </h2>
            <p className="mt-1 text-white/90">Ledig tid inom några dagar – boka direkt online.</p>
          </div>
          <Button to="/boka" variant="dark" size="lg">
            <Calendar size={18} /> Boka tid
          </Button>
        </div>
      </section>
    </div>
  );
}
