// Utrustningschecklista i bilredigeringen.
// Modellens standardutrustning är förifylld och modellens tillval visas som förslag (okryssade),
// så att handlaren bara behöver kryssa i det just den här bilen har.
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { ALL_EQUIPMENT, EQUIPMENT_GROUPS } from "../lib/equipment";
import { Input } from "./ui";

interface Props {
  value: string[];
  standard: string[];
  options: string[];
  onChange: (value: string[]) => void;
}

function Chip({ item, on, onClick }: { item: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
        on ? "bg-ios-blue text-white" : "bg-ios-fill2 text-ios-label ring-1 ring-inset ring-black/[.06] hover:bg-ios-fill",
      )}
    >
      {on ? <Check size={12} strokeWidth={3} /> : <Plus size={12} className="text-ios-tertiary" />}
      {item}
    </button>
  );
}

function Group({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-ios-tertiary">{title}</p>
      {hint && <p className="-mt-1 mb-2 px-1 text-[13px] text-ios-secondary">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function EquipmentPicker({ value, standard, options, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const selected = new Set(value);
  const hasSuggestions = standard.length > 0 || options.length > 0;

  const shown = new Set([...standard, ...options]);
  const known = new Set(ALL_EQUIPMENT);
  const custom = value.filter((v) => !known.has(v) && !shown.has(v));
  // Resten av katalogen (det som varken är standard eller tillval för modellen)
  const rest = EQUIPMENT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !shown.has(i)) })).filter((g) => g.items.length);
  const restSelected = rest.reduce((n, g) => n + g.items.filter((i) => selected.has(i)).length, 0);

  const toggle = (item: string) => onChange(selected.has(item) ? value.filter((v) => v !== item) : [...value, item]);
  const add = () => {
    const item = draft.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!item) return;
    const match = ALL_EQUIPMENT.find((e) => e.toLowerCase() === item.toLowerCase()) ?? item;
    if (!selected.has(match)) onChange([...value, match]);
    setDraft("");
  };

  const restGroups = rest.map((g) => (
    <Group key={g.name} title={g.name}>
      {g.items.map((item) => (
        <Chip key={item} item={item} on={selected.has(item)} onClick={() => toggle(item)} />
      ))}
    </Group>
  ));

  return (
    <div className="space-y-5">
      <p className="rounded-[12px] bg-ios-fill2 px-4 py-3 text-[14px] text-ios-label">
        <b>{value.length} valda.</b>{" "}
        {hasSuggestions ? (
          <span className="text-ios-secondary">Standardutrustningen är ifylld. Kryssa i bilens tillval bland förslagen nedan.</span>
        ) : (
          <span className="text-ios-secondary">Tryck på ”Spara och hämta utrustning” ovan så fylls modellens standardutrustning i och du får förslag på tillval.</span>
        )}
      </p>

      {hasSuggestions ? (
        <>
          {standard.length > 0 && (
            <Group title={`Standardutrustning (${standard.filter((s) => selected.has(s)).length}/${standard.length})`} hint="Avmarkera det som saknas på bilen.">
              {standard.map((item) => (
                <Chip key={item} item={item} on={selected.has(item)} onClick={() => toggle(item)} />
              ))}
            </Group>
          )}
          {options.length > 0 && (
            <Group title="Förslag på tillval" hint="Kryssa i det som den här bilen har.">
              {options.map((item) => (
                <Chip key={item} item={item} on={selected.has(item)} onClick={() => toggle(item)} />
              ))}
            </Group>
          )}
          <div>
            <button type="button" onClick={() => setShowAll((s) => !s)} className="flex items-center gap-1 px-1 text-[14px] font-medium text-ios-blue" aria-expanded={showAll}>
              Övrig utrustning{restSelected ? ` (${restSelected} valda)` : ""}
              <ChevronDown size={16} className={cn("transition-transform", showAll && "rotate-180")} />
            </button>
            {showAll && <div className="mt-3 space-y-4">{restGroups}</div>}
          </div>
        </>
      ) : (
        restGroups
      )}

      {custom.length > 0 && (
        <Group title="Egna tillägg">
          {custom.map((item) => (
            <Chip key={item} item={item} on onClick={() => toggle(item)} />
          ))}
        </Group>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Annat tillval, t.ex. Webasto eller Vinterhjul på fälg"
          maxLength={60}
        />
        <button type="button" aria-label="Lägg till utrustning" onClick={add} disabled={!draft.trim()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ios-blue text-white transition disabled:bg-ios-fill disabled:text-ios-tertiary">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
