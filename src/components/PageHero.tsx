import type { ReactNode } from "react";

export function PageHero({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="bg-graphite-900 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-500">{kicker}</p>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        {subtitle && <p className="mt-4 max-w-2xl text-lg text-graphite-300">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
