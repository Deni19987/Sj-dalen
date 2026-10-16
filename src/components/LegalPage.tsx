import type { ReactNode } from "react";
import { PageHero } from "./PageHero";

/** Gemensam layout för villkor och integritetspolicy: rubrik, ingress och numrerade avsnitt. */
export function LegalPage({
  kicker,
  title,
  updated,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <PageHero kicker={kicker} title={title} subtitle={`Gäller från ${updated}`} />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {intro}
        <div className="space-y-10">{children}</div>
      </div>
    </div>
  );
}

export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section id={`p${n}`} className="scroll-mt-24">
      <h2 className="font-display text-xl font-bold text-graphite-900">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-graphite-700 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

/** Framhävd ruta för det allra viktigaste (t.ex. att budet är bindande). */
export function LegalCallout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-10 rounded-2xl border-l-4 border-blue-500 bg-blue-50 p-5">
      <p className="font-display font-bold text-graphite-900">{title}</p>
      <div className="mt-2 space-y-2 leading-relaxed text-graphite-700">{children}</div>
    </div>
  );
}
