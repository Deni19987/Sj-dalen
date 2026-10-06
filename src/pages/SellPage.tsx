import { useState, type FormEvent } from "react";
import { CircleCheck, HandCoins } from "lucide-react";
import { Button } from "../components/Button";
import { PageHero } from "../components/PageHero";
import { useCreateSellRequest } from "../lib/queries";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THIS_YEAR = new Date().getFullYear();
const INPUT =
  "w-full rounded-lg border border-graphite-200 px-3 py-2.5 outline-none focus:border-blue-500";

function Field({
  label,
  className = "block text-sm",
  ...input
}: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={className}>
      <span className="mb-1 block font-semibold text-graphite-700">{label}</span>
      <input {...input} className={INPUT} />
    </label>
  );
}

export function SellPage() {
  const send = useCreateSellRequest();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const yearNum = Number(year);
  const mileageNum = Number(mileage);
  const valid =
    !!make.trim() &&
    !!model.trim() &&
    yearNum >= 1970 &&
    yearNum <= THIS_YEAR + 1 &&
    mileageNum >= 0 &&
    name.trim().length > 1 &&
    phone.trim().length >= 6 &&
    EMAIL_RE.test(email);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || send.isPending) return;
    send.mutate({
      make: make.trim(),
      model: model.trim(),
      year: yearNum,
      mileageKm: mileageNum,
      description: description.trim(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
  }

  if (send.isSuccess)
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white">
          <CircleCheck size={32} />
        </span>
        <h1 className="mt-6 font-display text-3xl font-extrabold uppercase tracking-tight text-graphite-900">
          Tack!
        </h1>
        <p className="mt-3 text-graphite-600">
          Vi går igenom uppgifterna och återkommer inom 24 timmar med ett bud på {make} {model}.
        </p>
        <Button to="/auktion" className="mt-8" variant="outline">
          Till bilauktionen
        </Button>
      </div>
    );

  return (
    <div>
      <PageHero
        kicker="Sälj din bil"
        title="Sälj din bil till oss"
        subtitle="Berätta om bilen så återkommer vi med ett bud – oavsett om den sedan säljs vidare via auktionen eller ej."
      />
      <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6 px-4 py-14 sm:px-6">
        <div className="rounded-2xl bg-white p-6 shadow-card">
          <h2 className="mb-4 flex items-center gap-2 font-display font-bold text-graphite-900">
            <HandCoins size={18} className="text-blue-500" /> Om bilen
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Märke *" value={make} onChange={(e) => setMake(e.target.value)} placeholder="t.ex. Volvo" />
            <Field label="Modell *" value={model} onChange={(e) => setModel(e.target.value)} placeholder="t.ex. V70" />
            <Field
              label="Årsmodell *"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2016"
            />
            <Field
              label="Miltal (km) *"
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="120000"
            />
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-semibold text-graphite-700">Skick &amp; övrigt</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Skador, servicehistorik, varför du säljer m.m."
              className={INPUT}
            />
          </label>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-card">
          <h2 className="mb-4 font-display font-bold text-graphite-900">Dina uppgifter</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Namn *" value={name} onChange={(e) => setName(e.target.value)} />
            <Field label="Telefon *" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Field
              label="E-post *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block text-sm sm:col-span-2"
            />
          </div>
        </div>

        <Button type="submit" size="lg" disabled={!valid || send.isPending} className="w-full sm:w-auto">
          Skicka till oss
        </Button>
        {send.isError && <p className="text-sm font-semibold text-red-600">{send.error.message}</p>}
      </form>
    </div>
  );
}
