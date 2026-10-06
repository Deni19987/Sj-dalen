import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, ArrowRight, MapPin } from "lucide-react";
import { CarCard } from "../components/CarCard";
import { PageHero } from "../components/PageHero";
import { currentPrice } from "../lib/auction";
import { useCars } from "../lib/queries";

const BODY_FILTERS = [
  { value: "alla", label: "Alla karosser" },
  { value: "kombi", label: "Kombi" },
  { value: "sedan", label: "Sedan" },
  { value: "halvkombi", label: "Halvkombi" },
  { value: "suv", label: "SUV" },
  { value: "skåpbil", label: "Skåpbil" },
];

const SELECT =
  "rounded-full border border-graphite-200 bg-white px-4 py-2 text-sm font-semibold text-graphite-700 outline-none focus:border-blue-500";

export function AuctionPage() {
  const { data: cars = [] } = useCars({ live: true });
  const [body, setBody] = useState("alla");
  const [sort, setSort] = useState("slutar-snart");

  const list = useMemo(() => {
    let result = cars.filter((c) => c.status === "active");
    if (body !== "alla") result = result.filter((c) => c.bodyType === body);
    result = [...result];
    if (sort === "slutar-snart")
      result.sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
    if (sort === "pris-lag") result.sort((a, b) => currentPrice(a) - currentPrice(b));
    if (sort === "pris-hog") result.sort((a, b) => currentPrice(b) - currentPrice(a));
    return result;
  }, [cars, body, sort]);

  return (
    <div>
      <PageHero
        kicker="Bilauktion"
        title="Bilar vi köpt in och fixat till"
        subtitle="Alla bilar är genomgångna av våra egna mekaniker innan de läggs ut. Lägg ett bud – vi hör av oss om du vinner."
      >
        <p className="mt-4 flex items-center gap-1.5 text-sm text-graphite-300">
          <MapPin size={14} className="text-blue-500" /> Alla bilar besiktigas och hämtas hos oss i Sjödalen
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
          <Link to="/auktion/salj" className="text-blue-400 hover:text-blue-300">
            Sälj din bil till oss →
          </Link>
          <Link to="/auktion/salda" className="flex items-center gap-1 text-graphite-300 hover:text-white">
            <Archive size={14} /> Se sålda bilar
          </Link>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <select value={body} onChange={(e) => setBody(e.target.value)} className={SELECT}>
            {BODY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={SELECT}>
            <option value="slutar-snart">Slutar snart</option>
            <option value="pris-lag">Pris: lägst först</option>
            <option value="pris-hog">Pris: högst först</option>
          </select>
          <span className="text-sm text-graphite-400">{list.length} bilar</span>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="text-graphite-500">Inga bilar matchar just nu filtret.</p>
            <button onClick={() => setBody("alla")} className="mt-3 font-semibold text-blue-600">
              Visa alla karosser
            </button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
        )}

        <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl bg-graphite-900 p-8 text-center sm:p-10">
          <h2 className="font-display text-lg font-extrabold uppercase tracking-tight text-white">
            Har du en bil du vill sälja?
          </h2>
          <p className="max-w-md text-graphite-300">
            Berätta om bilen så återkommer vi med ett bud – oavsett om den säljs vidare via auktionen eller ej.
          </p>
          <Link
            to="/auktion/salj"
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-600"
          >
            Sälj din bil till oss <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
