import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { CarCard } from "../components/CarCard";
import { PageHero } from "../components/PageHero";
import { useCars } from "../lib/queries";

export function SoldPage() {
  const { data: cars, isLoading } = useCars();
  const sold = (cars ?? [])
    .filter((c) => c.status === "sold")
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());

  return (
    <div>
      <PageHero
        kicker="Referenser"
        title="Sålda bilar"
        subtitle="Ett urval av bilar som redan hittat en ny ägare via vår auktion."
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Link
          to="/auktion"
          className="mb-8 inline-flex items-center gap-1 text-sm font-semibold text-graphite-500 hover:text-graphite-900"
        >
          <ChevronLeft size={16} /> Till pågående auktioner
        </Link>
        {isLoading ? null : sold.length === 0 ? (
          <p className="text-graphite-500">Inga sålda bilar att visa än.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sold.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
