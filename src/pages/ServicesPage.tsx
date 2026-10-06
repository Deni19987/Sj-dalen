import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleDot, ClipboardCheck, Clock, Settings, Sparkles, Wrench } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { useServices } from "../lib/queries";
import type { ServiceCategory } from "../lib/types";

const CATEGORIES: ServiceCategory[] = ["Underhåll", "Reparation", "Besiktning", "Däck", "Övrigt"];
const CATEGORY_ICONS = {
  Underhåll: Wrench,
  Reparation: Settings,
  Besiktning: ClipboardCheck,
  Däck: CircleDot,
  Övrigt: Sparkles,
};

export function ServicesPage() {
  const { data: services = [] } = useServices();

  return (
    <div>
      <PageHero
        kicker="Tjänster"
        title="Allt din bil behöver"
        subtitle="Priserna nedan är riktpriser – exakt kostnad beror på bilmodell och vad vi hittar. Vi ringer alltid innan vi gör något som kostar extra."
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="space-y-14">
          {CATEGORIES.map((category) => {
            const items = services.filter((s) => s.category === category);
            if (items.length === 0) return null;
            const Icon = CATEGORY_ICONS[category];
            return (
              <section key={category}>
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white">
                    <Icon size={18} />
                  </span>
                  <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-graphite-900">
                    {category}
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {items.map((s) => (
                    <div key={s.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-card">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display font-bold text-graphite-900">{s.name}</h3>
                        {s.popular && (
                          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                            Vanligt
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex-1 text-sm text-graphite-500">{s.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-graphite-100 pt-3">
                        <div>
                          <p className="font-display text-lg font-extrabold text-graphite-900">
                            från {s.priceFrom.toLocaleString("sv-SE")} kr
                          </p>
                          <p className="flex items-center gap-1 text-xs text-graphite-400">
                            <Clock size={12} /> ca {s.durationMin} min
                          </p>
                        </div>
                        <Link
                          to="/boka"
                          search={{ service: s.id }}
                          className="flex items-center gap-1 rounded-full bg-graphite-900 px-4 py-2 text-sm font-semibold text-white hover:bg-graphite-800"
                        >
                          Boka <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-14 rounded-2xl bg-graphite-900 p-8 text-center sm:p-10">
          <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-white">
            Osäker på vad bilen behöver?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-graphite-300">
            Boka en felsökning så berättar vi vad som är fel och vad det kostar att laga – innan vi gör något.
          </p>
          <Link
            to="/boka"
            search={{ service: "svc-diagnos" }}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-600"
          >
            Boka felsökning <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
