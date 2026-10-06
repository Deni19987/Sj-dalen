import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";

export function Accordion({ items }: { items: { id: string; question: string; answer: string }[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-graphite-200 overflow-hidden rounded-2xl border border-graphite-200 bg-white">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-graphite-50"
              aria-expanded={open}
            >
              <span className="font-semibold text-graphite-900">{item.question}</span>
              <ChevronDown
                className={cn("h-5 w-5 shrink-0 text-blue-500 transition-transform", open && "rotate-180")}
              />
            </button>
            {open && <div className="px-5 pb-5 leading-relaxed text-graphite-600">{item.answer}</div>}
          </div>
        );
      })}
    </div>
  );
}
