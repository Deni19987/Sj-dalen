import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Car, ChevronLeft, Inbox as InboxIcon, Mail, MailOpen, MessageSquare, Phone, Reply, Tag, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { useDeleteMessage, useMessages, useUpdateMessage, type InboxItem } from "../api";
import { fmtLongDate, mailTime, num, telHref } from "../helpers";
import { Btn, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchField, Segmented, TextArea, useFeedback, useRun } from "../ui";
import { PREFILL_KEY } from "./CarEditor";

type Folder = "inbox" | "unread" | "sell" | "archived";

const subjectOf = (m: InboxItem) => (m.kind === "sell" ? `Vill sälja: ${m.make} ${m.model} ${m.year}` : "Meddelande via kontaktformuläret");
const previewOf = (m: InboxItem) => (m.kind === "sell" ? m.description || `${num(m.mileageKm)} km` : m.message);

export function InboxPage() {
  const { data, isLoading, error, refetch } = useMessages();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const update = useUpdateMessage();

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      inbox: all.filter((m) => m.status !== "archived").length,
      unread: all.filter((m) => m.status === "new").length,
      sell: all.filter((m) => m.kind === "sell" && m.status !== "archived").length,
    };
  }, [data]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? [])
      .filter((m) =>
        folder === "archived" ? m.status === "archived" : folder === "unread" ? m.status === "new" : folder === "sell" ? m.kind === "sell" && m.status !== "archived" : m.status !== "archived",
      )
      .filter((m) => !term || `${m.name} ${m.email} ${previewOf(m)} ${subjectOf(m)}`.toLowerCase().includes(term));
  }, [data, folder, q]);

  const keyOf = (m: InboxItem) => `${m.kind}:${m.id}`;
  const selected = (data ?? []).find((m) => keyOf(m) === selectedKey) ?? null;

  // Markera som läst när meddelandet öppnas
  useEffect(() => {
    if (selected?.status === "new") update.mutate({ kind: selected.kind, id: selected.id, status: "read" });
  }, [selected?.id, selected?.kind]);

  return (
    <div>
      <div className={cn(selected && "hidden lg:block")}>
        <PageHeader title="Inkorg" subtitle={counts.unread ? `${counts.unread} olästa` : "Allt är läst"} />
      </div>

      {error && <ErrorBlock error={error} retry={() => refetch()} />}
      {isLoading && <LoadingBlock />}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* Lista */}
          <div className={cn("min-w-0", selected && "hidden lg:block")}>
            <div className="mb-3 space-y-2">
              <Segmented
                value={folder}
                onChange={(f) => {
                  setFolder(f);
                  setSelectedKey(null);
                }}
                options={[
                  { value: "inbox", label: "Inkorg" },
                  { value: "unread", label: "Olästa", count: counts.unread },
                  { value: "sell", label: "Sälj bil", count: counts.sell },
                  { value: "archived", label: "Arkiv" },
                ]}
              />
              <SearchField value={q} onChange={setQ} placeholder="Sök i meddelanden" />
            </div>
            <Card padded={false} className="overflow-hidden">
              {list.length === 0 ? (
                <EmptyState icon={<InboxIcon size={26} />} title={folder === "archived" ? "Arkivet är tomt" : "Inga meddelanden"} text={q ? "Inga träffar på sökningen." : undefined} />
              ) : (
                <ul className="max-h-[calc(100dvh-260px)] divide-y divide-black/[.05] overflow-y-auto">
                  {list.map((m) => {
                    const active = selectedKey === keyOf(m);
                    return (
                      <li key={keyOf(m)}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(keyOf(m))}
                          className={cn("flex w-full gap-3 px-4 py-3 text-left transition", active ? "bg-ios-blue text-white" : "hover:bg-ios-fill2")}
                        >
                          <span className="mt-1.5 w-2 shrink-0">{m.status === "new" && <span className={cn("block h-2 w-2 rounded-full", active ? "bg-white" : "bg-ios-blue")} />}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className={cn("truncate text-[15px]", m.status === "new" ? "font-semibold" : "font-medium")}>{m.name}</p>
                              <span className={cn("shrink-0 text-[12px]", active ? "text-white/80" : "text-ios-tertiary")}>{mailTime(m.createdAt)}</span>
                            </div>
                            <p className={cn("flex items-center gap-1 truncate text-[13px]", active ? "text-white" : "text-ios-label")}>
                              {m.kind === "sell" ? <Tag size={12} className="shrink-0" /> : <MessageSquare size={12} className="shrink-0" />}
                              {subjectOf(m)}
                            </p>
                            <p className={cn("line-clamp-2 text-[13px] leading-snug", active ? "text-white/80" : "text-ios-secondary")}>{previewOf(m)}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* Detalj */}
          <div className={cn("min-w-0", !selected && "hidden lg:block")}>
            {selected ? (
              <MessageDetail key={keyOf(selected)} m={selected} onBack={() => setSelectedKey(null)} onGone={() => setSelectedKey(null)} />
            ) : (
              <Card className="flex min-h-[400px] items-center justify-center">
                <EmptyState icon={<Mail size={26} />} title="Inget meddelande valt" />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageDetail({ m, onBack, onGone }: { m: InboxItem; onBack: () => void; onGone: () => void }) {
  const update = useUpdateMessage();
  const del = useDeleteMessage();
  const run = useRun();
  const { confirm, toast } = useFeedback();
  const navigate = useNavigate();
  const [note, setNote] = useState(m.note);

  const subject = m.kind === "sell" ? `Din ${m.make} ${m.model}` : "Ditt meddelande till Sjödalen Bilar";
  const quoted = (m.kind === "sell" ? m.description : m.message)
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const mailto = `mailto:${m.email}?subject=${encodeURIComponent(`Sv: ${subject}`)}&body=${encodeURIComponent(`Hej ${m.name.split(" ")[0]}!\n\n\n\nMed vänliga hälsningar\nSjödalen Bilar\n\n${quoted}`)}`;

  async function archive() {
    const status = m.status === "archived" ? "read" : "archived";
    const ok = await run(() => update.mutateAsync({ kind: m.kind, id: m.id, status }));
    if (ok !== undefined) {
      toast(status === "archived" ? "Flyttat till arkivet" : "Flyttat till inkorgen", "success", {
        label: "Ångra",
        onClick: () => update.mutate({ kind: m.kind, id: m.id, status: m.status }),
      });
      onGone();
    }
  }

  async function remove() {
    const ok = await confirm({ title: "Ta bort meddelandet?", message: "Det går inte att ångra.", confirmLabel: "Ta bort", destructive: true });
    if (ok && (await run(() => del.mutateAsync({ kind: m.kind, id: m.id }), "Meddelandet är borttaget")) !== undefined) onGone();
  }

  function createListing() {
    if (m.kind !== "sell") return;
    try {
      sessionStorage.setItem(
        PREFILL_KEY,
        JSON.stringify({ make: m.make, model: m.model, year: String(m.year), mileageKm: String(m.mileageKm), adminNote: `Inköpt från ${m.name}, ${m.phone}, ${m.email}` }),
      );
    } catch {
      /* förifyllning är en bekvämlighet */
    }
    navigate({ to: "/admin/bilar/ny" });
  }

  return (
    <Card padded={false} className="animate-ios-fade overflow-hidden">
      {/* Verktygsrad */}
      <div className="flex items-center gap-1 border-b border-black/[.06] px-3 py-2">
        <button type="button" onClick={onBack} className="flex items-center text-[17px] text-ios-blue lg:hidden">
          <ChevronLeft size={22} /> Inkorg
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Btn size="icon" variant="plain" aria-label={m.status === "new" ? "Markera som läst" : "Markera som oläst"} title={m.status === "new" ? "Markera som läst" : "Markera som oläst"} onClick={() => update.mutate({ kind: m.kind, id: m.id, status: m.status === "new" ? "read" : "new" })}>
            {m.status === "new" ? <MailOpen size={18} /> : <Mail size={18} />}
          </Btn>
          <Btn size="icon" variant="plain" aria-label={m.status === "archived" ? "Flytta till inkorgen" : "Arkivera"} title={m.status === "archived" ? "Flytta till inkorgen" : "Arkivera"} onClick={archive}>
            {m.status === "archived" ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </Btn>
          <Btn size="icon" variant="plain" aria-label="Ta bort" title="Ta bort" onClick={remove} className="text-ios-red hover:bg-ios-red/10">
            <Trash2 size={18} />
          </Btn>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#7c7c80] text-[17px] font-semibold text-white">{m.name.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[17px] font-semibold">{m.name}</p>
              <p className="text-[13px] text-ios-tertiary">
                {fmtLongDate(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <p className="text-[14px] text-ios-secondary">{subjectOf(m)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={mailto} className="inline-flex h-9 items-center gap-2 rounded-full bg-ios-blue px-4 text-[14px] font-medium text-white hover:bg-ios-blue-hover">
            <Reply size={15} /> Svara
          </a>
          {m.kind === "sell" && (
            <a href={telHref(m.phone)} className="inline-flex h-9 items-center gap-2 rounded-full bg-ios-blue/10 px-4 text-[14px] font-medium text-ios-blue">
              <Phone size={15} /> Ring {m.phone}
            </a>
          )}
          <a href={`mailto:${m.email}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-ios-fill px-4 text-[14px] font-medium text-ios-label">
            <Mail size={15} /> {m.email}
          </a>
        </div>

        {m.kind === "sell" && (
          <div className="rounded-[16px] bg-ios-fill2 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Märke", m.make],
                ["Modell", m.model],
                ["Årsmodell", String(m.year)],
                ["Miltal", `${num(m.mileageKm)} km`],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[12px] text-ios-tertiary">{k}</p>
                  <p className="text-[15px] font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <Btn variant="tinted" size="sm" className="mt-4" icon={<Car size={14} />} onClick={createListing}>
              Skapa annons från förfrågan
            </Btn>
          </div>
        )}

        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ios-label">
          {m.kind === "sell" ? m.description || <span className="text-ios-tertiary">Ingen beskrivning.</span> : m.message}
        </p>

        <div className="border-t border-black/[.06] pt-5">
          <p className="mb-1.5 px-1 text-[13px] font-medium text-ios-secondary">Intern anteckning</p>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== m.note && run(() => update.mutateAsync({ kind: m.kind, id: m.id, note }), "Anteckningen är sparad")}
            placeholder="T.ex. ”Ringt, återkommer på fredag”"
          />
        </div>
      </div>
    </Card>
  );
}
