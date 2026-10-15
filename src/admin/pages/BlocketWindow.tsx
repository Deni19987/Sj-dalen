// Smalt fönster som öppnas bredvid Blocket: allt att kopiera + utrustningen att bocka av.
import { useParams } from "@tanstack/react-router";
import { useAdminCars } from "../api";
import { blocketDescription, blocketRows, CopyRow, EquipmentChecklist } from "../BlocketSheet";
import { EmptyState, LoadingBlock } from "../ui";

export function BlocketWindowPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const cars = useAdminCars();
  const car = cars.data?.find((c) => c.id === id);

  if (cars.isLoading) return <LoadingBlock />;
  if (!car) return <EmptyState icon={null} title="Bilen hittades inte" text="Spara bilen först och öppna fönstret igen." />;

  const input = { ...car, reservePrice: car.reservePrice ?? null };
  const rows = blocketRows(input, Number.isFinite(car.reservePrice ?? car.startPrice) ? String(car.reservePrice ?? car.startPrice) : "");

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ios-tertiary">Till Blocket</p>
        <h1 className="text-[20px] font-semibold leading-tight">{car.title}</h1>
        <p className="mt-1 text-[13px] text-ios-secondary">Visar senast sparade versionen. Spara i admin och ladda om om du ändrat något.</p>
      </div>
      <div className="divide-y divide-black/[.05] rounded-[12px] bg-white px-4">
        {rows.map(([label, value]) => (
          <CopyRow key={label} label={label} value={value} />
        ))}
        <CopyRow label="Beskrivning" value={blocketDescription(input)} multiline />
      </div>
      <div>
        <h2 className="mb-2 text-[17px] font-semibold">Utrustning att bocka i</h2>
        <EquipmentChecklist equipment={car.facts.equipment} carId={car.id} />
      </div>
    </div>
  );
}
