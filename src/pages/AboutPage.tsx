import { Clock, Gavel, MapPin, Wrench } from "lucide-react";
import { Button } from "../components/Button";
import { CarIllustration } from "../components/CarIllustration";
import { PageHero } from "../components/PageHero";
import { SectionTitle } from "../components/SectionTitle";
import { useSettings } from "../lib/queries";

export function AboutPage() {
  const { data: settings } = useSettings();
  return (
    <div>
      <PageHero
        kicker="Om oss"
        title="En verkstad med två ben att stå på"
        subtitle="Sjödalen Bilar AB är en verkstad först och främst – men vi köper också in, fixar och säljer bilar vidare via vår egen bilauktion."
      />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionTitle kicker="Vår historia" title="Startade som verkstad, blev lite mer" />
            <p className="mt-4 text-graphite-600">
              Sjödalen Bilar öppnade som en vanlig bilverkstad – service, reparationer och
              besiktningshjälp på alla märken. Efter hand märkte vi att vi ofta fick frågan om vi visste
              var man kunde hitta en bra begagnad bil. Svaret blev att vi började köpa in bilar själva,
              gå igenom dem i verkstaden och sälja dem vidare.
            </p>
            <p className="mt-4 text-graphite-600">
              Idag är det fortfarande samma verkstad och samma mekaniker – bilarna vi säljer är bara ett
              resultat av att vi redan gör jobbet med att skruva, kontrollera och komma underfund med vad
              en bil faktiskt är värd.
            </p>
          </div>
          <div className="rounded-3xl bg-graphite-100 p-10">
            <CarIllustration colorHex="#4A4E55" bodyType="suv" className="w-full" />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionTitle kicker="Två verksamheter" title="Verkstad och bilhandel, under samma tak" align="center" />
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-graphite-200 p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-graphite-900 text-blue-500">
                <Wrench size={22} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-graphite-900">Verkstaden</h3>
              <p className="mt-2 text-graphite-600">
                Service, reparationer, besiktningshjälp och däckhotell på alla bilmärken. Det här är
                kärnan i vad vi gör varje dag.
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white">
                <Gavel size={22} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-graphite-900">Bilauktionen</h3>
              <p className="mt-2 text-graphite-600">
                Bilar vi köper in, går igenom i verkstaden och säljer vidare via bud – med full insyn i
                vad som är kontrollerat och åtgärdat.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl bg-graphite-900 p-8 sm:grid-cols-2 sm:p-12">
          <div>
            <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-white">Hitta hit</h2>
            <ul className="mt-5 space-y-3 text-graphite-300">
              <li className="flex items-center gap-2">
                <MapPin size={18} className="text-blue-500" /> {settings?.address}
              </li>
              <li className="flex items-center gap-2">
                <Clock size={18} className="shrink-0 text-blue-500" />
                {settings?.hours
                  .filter((h) => !/stängt/i.test(h.value))
                  .map((h) => `${h.label} ${h.value}`)
                  .join(", ")}
              </li>
            </ul>
            <Button
              to="/kontakt"
              variant="outline"
              className="mt-6 border-white text-white hover:bg-white hover:text-graphite-900"
            >
              Kontakta oss
            </Button>
          </div>
          <div className="flex items-center justify-center rounded-2xl bg-graphite-800 p-6">
            <p className="text-center text-sm text-graphite-400">
              [Karta läggs till här – t.ex. Google Maps med verkstadens adress]
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
