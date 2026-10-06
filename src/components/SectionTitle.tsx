import { cn } from "../lib/cn";

export function SectionTitle({
  kicker,
  title,
  subtitle,
  align = "left",
  dark = false,
  className,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {kicker && (
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-500">{kicker}</p>
      )}
      <h2
        className={cn(
          "font-display text-3xl font-extrabold uppercase tracking-tight sm:text-4xl",
          dark ? "text-white" : "text-graphite-900",
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "mt-3 max-w-2xl text-lg leading-relaxed",
            align === "center" && "mx-auto",
            dark ? "text-graphite-300" : "text-graphite-600",
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
