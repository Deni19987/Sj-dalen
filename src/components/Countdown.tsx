import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { timeLeft } from "../lib/format";

export function Countdown({ endsAt, compact = false }: { endsAt: string; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = timeLeft(endsAt, now);
  if (t.ended) return <span className="font-semibold text-graphite-500">Auktionen är avslutad</span>;

  const unit = (value: number, label: string) => (
    <div key={label} className="flex flex-col items-center">
      <span className={cn("font-display font-extrabold tabular-nums", compact ? "text-lg" : "text-2xl sm:text-3xl")}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-graphite-400">{label}</span>
    </div>
  );

  return (
    <div className="flex items-center gap-3">
      {t.days > 0 && unit(t.days, "dagar")}
      {unit(t.hours, "tim")}
      {unit(t.minutes, "min")}
      {!compact && unit(t.seconds, "sek")}
    </div>
  );
}
