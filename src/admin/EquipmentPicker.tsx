// Utrustningschecklista i bilredigeringen: grupperad, förifylld av AI (standardutrustning)
// och kompletteras av handlaren med tillval.
import { useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { cn } from "../lib/cn";
import { ALL_EQUIPMENT, EQUIPMENT_GROUPS, OTHER_GROUP } from "../lib/equipment";
import { Btn, Input } from "./ui";

interface Props {
  value: string[];
  standard: string[];
  onChange: (value: string[]) => void;
  onSuggest: () => void;
  suggesting: boolean;
}

export function EquipmentPicker({ value, standard, onChange, onSuggest, suggesting }: Props) {
  const [draft, setDraft] = useState("");
  const selected = new Set(value);
  const fromAi = new Set(standard);
  const known = new Set(ALL_EQUIPMENT);
  const custom = value.filter((v) => !known.has(v));
  const groups = [...EQUIPMENT_GROUPS, ...(custom.length ? [{ name: OTHER_GROUP, items: custom }] : [])];

  const toggle = (item: string) => onChange(selected.has(item) ? value.filter((v) => v !== item) : [...value, item]);
  const add = () => {
    const item = draft.trim().replace(/\s+/g, " ");
    if (!item) return;
    const match = ALL_EQUIPMENT.find((e) => e.toLowerCase() === item.toLowerCase()) ?? item;
    if (!selected.has(match)) onChange([...value, match.slice(0, 60)]);
    setDraft("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[12px] bg-ios-fill2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[13px] leading-snug text-ios-secondary">
          <p className="text-[15px] font-semibold text-ios-label">
            {value.length} valda
            {standard.length > 0 && <span className="font-normal text-ios-secondary"> · {standard.filter((s) => selected.has(s)).length} standard från AI</span>}
          </p>
          <p>
            AI:n bockar i det som är standard på modellen. <span className="inline-flex items-center gap-0.5 font-medium text-ios-purple"><Sparkles size={11} />-märkta</span> kommer från AI – kontrollera
            dem och lägg till bilens tillval själv.
          </p>
        </div>
        <Btn variant="tinted" size="sm" icon={<Sparkles size={14} />} loading={suggesting} onClick={onSuggest} className="shrink-0">
          {standard.length ? "Hämta standard igen" : "Fyll i standardutrustning"}
        </Btn>
      </div>

      {groups.map((g) => (
        <div key={g.name}>
          <p className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-ios-tertiary">
            {g.name}
            <span className="ml-1.5 font-normal normal-case tracking-normal">{g.items.filter((i) => selected.has(i)).length || ""}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((item) => {
              const on = selected.has(item);
              const ai = fromAi.has(item);
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={on}
                  title={ai ? "Standard enligt AI – kontrollera på bilen" : undefined}
                  onClick={() => toggle(item)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
                    on ? (ai ? "bg-ios-purple text-white" : "bg-ios-blue text-white") : "bg-ios-fill2 text-ios-label hover:bg-ios-fill",
                  )}
                >
                  {on && (ai ? <Sparkles size={12} /> : <Check size={12} strokeWidth={3} />)}
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
