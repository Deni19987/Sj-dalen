import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, HelpCircle, Pencil, Plus, Star, Trash2, Wrench } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Faq, Review, Service, ServiceCategory } from "../../lib/types";
import { useContent, useDeleteContent, useReorderContent, useSaveContent, type ContentType } from "../api";
import { kr } from "../helpers";
import { Btn, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, PageHeader, Pill, Segmented, Select, Sheet, TextArea, Toggle, useFeedback, useRun } from "../ui";

const CATEGORIES: ServiceCategory[] = ["Underhåll", "Reparation", "Besiktning", "Däck", "Övrigt"];

export function ContentPage() {
  const { data, isLoading, error, refetch } = useContent();
  const [tab, setTab] = useState<ContentType>("services");
  const [editing, setEditing] = useState<{ type: ContentType; item: Service | Faq | Review | null } | null>(null);

  return (
    <div>
      <PageHeader
        title="Innehåll"
        subtitle="Texter och priser som visas på webbplatsen. Ändringar syns inom en minut."
        actions={
          <Btn variant="primary" icon={<Plus size={17} />} onClick={() => setEditing({ type: tab, item: null })}>
            {tab === "services" ? "Ny tjänst" : tab === "faqs" ? "Ny fråga" : "Nytt omdöme"}
          </Btn>
        }
      />
      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "services", label: "Tjänster & priser" },
          { value: "faqs", label: "Vanliga frågor" },
          { value: "reviews", label: "Omdömen" },
        ]}
      />

      {error && <ErrorBlock error={error} retry={() => refetch()} />}
      {isLoading && <LoadingBlock />}

      {data && tab === "services" && (
        <OrderedList
          type="services"
          items={data.services}
          empty={{ icon: <Wrench size={26} />, title: "Inga tjänster" }}
          onEdit={(item) => setEditing({ type: "services", item })}
          render={(s: Service) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold">{s.name}</p>
                <Pill>{s.category}</Pill>
                {s.popular && <Pill tone="blue">Populär</Pill>}
              </div>
              <p className="line-clamp-1 text-[13px] text-ios-secondary">{s.description}</p>
              <p className="mt-0.5 text-[13px] font-medium tabular-nums">
                {s.priceTo ? `${kr(s.priceFrom)} – ${kr(s.priceTo)}` : `från ${kr(s.priceFrom)}`} · {s.durationMin} min
              </p>
            </>
          )}
        />
      )}
      {data && tab === "faqs" && (
        <OrderedList
          type="faqs"
          items={data.faqs}
          empty={{ icon: <HelpCircle size={26} />, title: "Inga frågor" }}
          onEdit={(item) => setEditing({ type: "faqs", item })}
          render={(f: Faq) => (
            <>
              <p className="text-[15px] font-semibold">{f.question}</p>
              <p className="line-clamp-2 text-[13px] text-ios-secondary">{f.answer}</p>
            </>
          )}
        />
      )}
      {data && tab === "reviews" && (
        <OrderedList
          type="reviews"
          items={data.reviews}
          empty={{ icon: <Star size={26} />, title: "Inga omdömen" }}
          onEdit={(item) => setEditing({ type: "reviews", item })}
          render={(r: Review) => (
            <>
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-semibold">{r.name}</p>
                <span className="flex text-ios-orange">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={12} className={i < r.rating ? "fill-current" : "text-ios-separator"} />
                  ))}
                </span>
              </div>
              <p className="line-clamp-2 text-[13px] text-ios-secondary">{r.text}</p>
            </>
          )}
        />
      )}

      {editing?.type === "services" && <ServiceSheet item={editing.item as Service | null} onClose={() => setEditing(null)} />}
      {editing?.type === "faqs" && <FaqSheet item={editing.item as Faq | null} onClose={() => setEditing(null)} />}
      {editing?.type === "reviews" && <ReviewSheet item={editing.item as Review | null} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OrderedList<T extends { id: string }>({
  type,
  items,
  render,
  onEdit,
  empty,
}: {
  type: ContentType;
  items: T[];
  render: (item: T) => ReactNode;
  onEdit: (item: T) => void;
  empty: { icon: ReactNode; title: string };
}) {
  const reorder = useReorderContent(type);
  const del = useDeleteContent(type);
  const run = useRun();
  const { confirm } = useFeedback();
  const [order, setOrder] = useState<string[] | null>(null);
  const ids = order ?? items.map((i) => i.id);
  const sorted = ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) as T[];
  // Nya poster (som inte finns i lokal ordning) läggs sist
  for (const i of items) if (!ids.includes(i.id)) sorted.push(i);

  async function move(index: number, dir: -1 | 1) {
    const next = sorted.map((i) => i.id);
    const [x] = next.splice(index, 1);
    next.splice(index + dir, 0, x);
    setOrder(next);
    await run(() => reorder.mutateAsync(next));
  }

  async function remove(item: T) {
    const ok = await confirm({ title: "Ta bort?", message: "Posten tas bort från webbplatsen.", confirmLabel: "Ta bort", destructive: true });
    if (ok && (await run(() => del.mutateAsync(item.id), "Borttagen")) !== undefined) setOrder((o) => o?.filter((id) => id !== item.id) ?? null);
  }

  if (sorted.length === 0)
    return (
      <Card>
        <EmptyState icon={empty.icon} title={empty.title} />
      </Card>
    );

  return (
    <Card padded={false} className="divide-y divide-black/[.05] overflow-hidden">
      {sorted.map((item, i) => (
        <div key={item.id} className="group flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex flex-col">
            <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-ios-tertiary hover:text-ios-blue disabled:opacity-20">
              <ChevronUp size={16} />
            </button>
            <button type="button" aria-label="Flytta ned" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-ios-tertiary hover:text-ios-blue disabled:opacity-20">
              <ChevronDown size={16} />
            </button>
          </div>
          <button type="button" onClick={() => onEdit(item)} className="min-w-0 flex-1 text-left">
            {render(item)}
          </button>
          <div className="flex shrink-0 gap-1">
            <Btn size="icon" variant="plain" aria-label="Redigera" onClick={() => onEdit(item)}>
              <Pencil size={16} />
            </Btn>
            <Btn size="icon" variant="plain" aria-label="Ta bort" onClick={() => remove(item)} className="text-ios-red hover:bg-ios-red/10">
              <Trash2 size={16} />
            </Btn>
          </div>
        </div>
      ))}
    </Card>
  );
}

function EditSheet({ title, onClose, onSave, saving, valid, children }: { title: string; onClose: () => void; onSave: () => void; saving: boolean; valid: boolean; children: ReactNode }) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Btn onClick={onClose}>Avbryt</Btn>
          <Btn variant="primary" loading={saving} disabled={!valid} onClick={onSave}>
            Spara
          </Btn>
        </>
      }
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave();
        }}
      >
        {children}
      </form>
    </Sheet>
  );
}

function ServiceSheet({ item, onClose }: { item: Service | null; onClose: () => void }) {
  const save = useSaveContent("services");
  const run = useRun();
  const [f, setF] = useState({
    name: item?.name ?? "",
    category: item?.category ?? ("Underhåll" as ServiceCategory),
    description: item?.description ?? "",
    priceFrom: item ? String(item.priceFrom) : "",
    priceTo: item?.priceTo != null ? String(item.priceTo) : "",
    durationMin: item ? String(item.durationMin) : "60",
    popular: item?.popular ?? false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const valid = !!f.name.trim() && !!f.description.trim() && f.priceFrom !== "" && Number(f.durationMin) >= 5;

  async function onSave() {
    const ok = await run(
      () =>
        save.mutateAsync({
          id: item?.id,
          data: { ...f, priceFrom: Number(f.priceFrom), priceTo: f.priceTo === "" ? null : Number(f.priceTo), durationMin: Number(f.durationMin) },
        }),
      item ? "Tjänsten är uppdaterad" : "Tjänsten är tillagd",
    );
    if (ok !== undefined) onClose();
  }

  return (
    <EditSheet title={item ? "Redigera tjänst" : "Ny tjänst"} onClose={onClose} onSave={onSave} saving={save.isPending} valid={valid}>
      <Field label="Namn">
        <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
      </Field>
      <Field label="Kategori">
        <Select value={f.category} onChange={(e) => set("category", e.target.value as ServiceCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Beskrivning">
        <TextArea value={f.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Pris från">
          <Input type="number" inputMode="numeric" value={f.priceFrom} onChange={(e) => set("priceFrom", e.target.value)} suffix="kr" />
        </Field>
        <Field label="Pris till">
          <Input type="number" inputMode="numeric" value={f.priceTo} onChange={(e) => set("priceTo", e.target.value)} suffix="kr" placeholder="–" />
        </Field>
        <Field label="Tid">
          <Input type="number" inputMode="numeric" value={f.durationMin} onChange={(e) => set("durationMin", e.target.value)} suffix="min" />
        </Field>
      </div>
      <div className="rounded-[12px] bg-white px-4 py-3">
        <Toggle checked={f.popular} onChange={(v) => set("popular", v)} label="Populär" description="Lyfts fram på startsidan och tjänstesidan" />
      </div>
    </EditSheet>
  );
}

function FaqSheet({ item, onClose }: { item: Faq | null; onClose: () => void }) {
  const save = useSaveContent("faqs");
  const run = useRun();
  const [question, setQuestion] = useState(item?.question ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  async function onSave() {
    const ok = await run(() => save.mutateAsync({ id: item?.id, data: { question, answer } }), item ? "Frågan är uppdaterad" : "Frågan är tillagd");
    if (ok !== undefined) onClose();
  }
  return (
    <EditSheet title={item ? "Redigera fråga" : "Ny fråga"} onClose={onClose} onSave={onSave} saving={save.isPending} valid={!!question.trim() && !!answer.trim()}>
      <Field label="Fråga">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
      </Field>
      <Field label="Svar">
        <TextArea value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </Field>
    </EditSheet>
  );
}

function ReviewSheet({ item, onClose }: { item: Review | null; onClose: () => void }) {
  const save = useSaveContent("reviews");
  const run = useRun();
  const [name, setName] = useState(item?.name ?? "");
  const [rating, setRating] = useState(item?.rating ?? 5);
  const [text, setText] = useState(item?.text ?? "");
  const [date, setDate] = useState((item?.date ?? new Date().toISOString()).slice(0, 10));
  async function onSave() {
    const ok = await run(
      () => save.mutateAsync({ id: item?.id, data: { name, rating, text, date: new Date(`${date}T12:00:00`).toISOString() } }),
      item ? "Omdömet är uppdaterat" : "Omdömet är tillagt",
    );
    if (ok !== undefined) onClose();
  }
  return (
    <EditSheet title={item ? "Redigera omdöme" : "Nytt omdöme"} onClose={onClose} onSave={onSave} saving={save.isPending} valid={!!name.trim() && !!text.trim() && !!date}>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Namn">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anna S." autoFocus />
        </Field>
        <Field label="Datum">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Betyg">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} stjärnor`} onClick={() => setRating(n)} className="p-1">
              <Star size={28} className={cn("transition", n <= rating ? "fill-ios-orange text-ios-orange" : "text-ios-separator")} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Omdöme">
        <TextArea value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </EditSheet>
  );
}
