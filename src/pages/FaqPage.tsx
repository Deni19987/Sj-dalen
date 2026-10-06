import { Accordion } from "../components/Accordion";
import { PageHero } from "../components/PageHero";
import { useFaqs } from "../lib/queries";

export function FaqPage() {
  const { data: faqs } = useFaqs();

  return (
    <div>
      <PageHero kicker="Vanliga frågor" title="Bra att veta" />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">{faqs && <Accordion items={faqs} />}</div>
    </div>
  );
}
