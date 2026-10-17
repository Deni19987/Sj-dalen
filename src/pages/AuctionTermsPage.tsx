import { Link } from "@tanstack/react-router";
import { LegalCallout, LegalPage, LegalSection } from "../components/LegalPage";
import { AUCTION_DEFAULTS, termsEffectiveDate } from "../lib/auction";
import { formatLongDate } from "../lib/format";
import { useSettings } from "../lib/queries";

export function AuctionTermsPage() {
  const { data: settings } = useSettings();
  const company = settings?.company.name || "Sjödalen Bilar AB";
  const a = settings?.auction ?? AUCTION_DEFAULTS;

  return (
    <LegalPage
      kicker="Bilauktion"
      title="Auktionsvillkor"
      updated={formatLongDate(termsEffectiveDate(settings?.auction))}
      intro={
        <LegalCallout title="Ditt bud är bindande">
          <p>
            När du lägger ett bud förbinder du dig att köpa bilen för det beloppet om du har högst bud när
            auktionen tar slut. <strong>Ett lagt bud kan inte dras tillbaka eller ändras.</strong> Läs igenom
            bilens beskrivning noga, och kom gärna och titta på bilen innan du budar.
          </p>
          <p>
            Är du privatperson har du enligt lag ångerrätt på själva köpet efter att auktionen avslutats – se{" "}
            <a href="#p9" className="font-semibold text-blue-600 hover:underline">punkt 9</a>.
          </p>
        </LegalCallout>
      }
    >
      <LegalSection n={1} title="Om villkoren">
        <p>
          Villkoren gäller när du lägger bud på och köper bilar på {company}s bilauktion på den här webbplatsen.
          Säljare är {company}
          {settings?.company.orgNumber && <> (org.nr {settings.company.orgNumber})</>}. Bilarna på auktionen är bilar
          vi själva äger.
        </p>
        <p>
          Genom att kryssa i rutan vid budformuläret godkänner du villkoren. Vi sparar vilken version av villkoren
          du godkände och när, tillsammans med ditt bud.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Vem kan lägga bud">
        <ul>
          <li>Du ska vara minst 18 år och lägga bud i eget namn.</li>
          <li>Du ska ange korrekt namn, e-postadress och telefonnummer så att vi kan nå dig.</li>
          <li>
            Budar du för ett företag ska du ha rätt att företräda företaget. Ange det när vi kontaktar dig, så skrivs
            köpet på företaget.
          </li>
          <li>Vi kan stryka bud och neka budgivare som lämnat felaktiga uppgifter eller inte följt villkoren.</li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="Så går budgivningen till">
        <ul>
          <li>Varje bil har ett utropspris, en minsta höjning och en sluttid som visas på bilens sida.</li>
          <li>Ditt bud måste vara minst lika högt som det minsta nästa bud som visas.</li>
          <li>
            Läggs ett bud mindre än 5 minuter före sluttiden förlängs auktionen med 5 minuter, så att alla hinner
            svara.
          </li>
          <li>Högst bud när tiden gått ut vinner.</li>
          <li>Bara ditt namn visas i budhistoriken. E-post och telefon ser bara vi.</li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Budet är bindande">
        <p>
          Ett bud är ett bindande erbjudande att köpa bilen. Du kan inte dra tillbaka eller sänka ett bud efter att
          du lagt det, och det gäller tills auktionen avslutats.
        </p>
        <p>
          Har du skrivit fel belopp – kontakta oss direkt
          {settings?.phone ? ` på ${settings.phone}` : ""}. Vi bedömer varje fall för sig, men vi är inte skyldiga
          att stryka ett bud.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Reservationspris">
        <p>
          Vissa bilar har ett reservationspris, ett lägsta pris som vi är beredda att sälja för. På bilens sida
          står det om reservationspriset är uppnått eller inte, men inte beloppet.
        </p>
        <p>
          Når högsta budet inte upp till reservationspriset är vi inte skyldiga att sälja. Ditt bud är då fortsatt
          bindande i två arbetsdagar efter att auktionen avslutats, så att vi kan välja att ändå godta det. Hör vi
          inte av oss inom den tiden är du inte längre bunden.
        </p>
      </LegalSection>

      <LegalSection n={6} title="När du vunnit">
        <ul>
          <li>Vi kontaktar dig senast nästa vardag efter auktionens slut med betalningsuppgifter.</li>
          <li>Ditt vinnande bud är priset för bilen. Det tillkommer ingen avgift på budet.</li>
          <li>
            Betalning sker med banköverföring och ska vara oss tillhanda inom {a.paymentDays}{" "}
            {a.paymentDays === 1 ? "bankdag" : "bankdagar"} från att du fått betalningsuppgifterna.
          </li>
          <li>Bilen lämnas ut när betalningen kommit in.</li>
        </ul>
      </LegalSection>

      <LegalSection n={7} title="Hämtning och ägarbyte">
        <ul>
          <li>
            Bilen hämtas hos oss{settings?.address ? ` på ${settings.address}` : " i Sjödalen"} inom {a.pickupDays}{" "}
            {a.pickupDays === 1 ? "dag" : "dagar"} från att betalningen kommit in. Boka tid med oss.
          </li>
          <li>Vi gör ägarbytet tillsammans med dig vid hämtningen. Bilen ska vara trafikförsäkrad från ägarbytet – ordna det innan du kör iväg.</li>
          <li>
            {a.storageFee > 0 && <>Hämtas bilen inte i tid tar vi ut en förvaringsavgift på {a.storageFee} kr per påbörjat dygn. </>}
            Är bilen inte hämtad inom {a.cancelAfterDays} dagar har vi rätt att häva köpet och sälja bilen till någon
            annan.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={8} title="Om köpet inte fullföljs">
        <p>
          Betalar du inte i tid, eller hämtar du inte bilen, har vi rätt att häva köpet. Vi kan då erbjuda bilen till
          den som hade näst högst bud eller lägga ut den på nytt, och neka dig att lägga bud i framtiden.
        </p>
        <p>
          Köper du som företag har vi dessutom rätt till ersättning för våra kostnader och för en eventuell
          prisskillnad om bilen säljs för ett lägre belopp. Är du privatperson och vill inte fullfölja köpet ska du
          i stället använda ångerrätten enligt punkt 9.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Ångerrätt för privatpersoner">
        <p>
          Eftersom budgivningen sker på nätet har du som privatperson enligt lagen om distansavtal{" "}
          <strong>14 dagars ångerrätt</strong> på köpet. Ångerrätten gäller köpet efter att auktionen avslutats –
          det ändrar inte att budet är bindande under auktionen.
        </p>
        <ul>
          <li>Ångerfristen börjar den dag du får bilen i din besittning.</li>
          <li>
            Vill du ångra köpet ska du meddela oss tydligt inom fristen, t.ex. per e-post
            {settings?.email ? ` till ${settings.email}` : ""}. Du kan använda Konsumentverkets standardformulär för
            ångerrätt, men det är inte ett krav.
          </li>
          <li>Du ska lämna tillbaka bilen hos oss inom 14 dagar från att du meddelat oss. Du står själv för kostnaden att ta bilen tillbaka.</li>
          <li>
            Vi betalar tillbaka hela beloppet inom 14 dagar från att vi fått ditt meddelande, men får vänta tills vi
            fått tillbaka bilen.
          </li>
          <li>
            Bilen ska lämnas tillbaka i samma skick. Har bilen använts mer än vad som behövs för att undersöka den –
            t.ex. körts längre sträckor eller fått skador – kan du behöva ersätta oss för värdeminskningen.
          </li>
        </ul>
        <p>Ångerrätten gäller inte om du köper bilen för ett företag eller i din näringsverksamhet.</p>
      </LegalSection>

      <LegalSection n={10} title="Bilens skick och undersökning">
        <p>
          Alla bilar är genomgångna i vår verkstad innan de läggs ut. Det vi kontrollerat, åtgärdat och känner till
          om bilens skick står på bilens sida. Bilarna är begagnade, och normalt slitage efter ålder och körsträcka
          ska räknas med.
        </p>
        <p>
          Läs beskrivningen och titta på bilderna noga innan du budar. Vill du se eller provköra bilen innan –
          kontakta oss så bokar vi en tid.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Fel på bilen och reklamation">
        <p>
          Är du privatperson gäller konsumentköplagen. Det betyder att du kan reklamera fel som fanns när du fick
          bilen, upp till tre år efter köpet. Ett fel som visar sig inom två år räknas som att det fanns från början,
          om inte vi kan visa något annat eller det är oförenligt med felets art – till exempel normalt slitage.
          Reklamera så snart du upptäckt felet. Hör av dig inom två månader så är det alltid i tid.
        </p>
        <p>
          Köper du som företag gäller köplagen. Bilen säljs då i befintligt skick, och du har en skyldighet att
          undersöka bilen före köpet.
        </p>
        <p>Det finns ingen garanti utöver det lagen ger, om det inte står något annat på bilens sida.</p>
      </LegalSection>

      <LegalSection n={12} title="Tekniska fel">
        <p>
          Skulle ett tekniskt fel påverka budgivningen – till exempel att bud inte kunnat registreras eller att fel
          sluttid visats – har vi rätt att förlänga, avbryta eller starta om auktionen. Vi kan också avbryta en
          auktion om bilen skadas eller säljs på annat sätt innan auktionen avslutats.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Personuppgifter">
        <p>
          Vi behandlar dina uppgifter för att kunna genomföra budgivningen och köpet. Läs mer i vår{" "}
          <Link to="/integritet" className="font-semibold text-blue-600 hover:underline">
            integritetspolicy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection n={14} title="Tvister">
        <p>
          Svensk lag gäller. Kontakta oss först om något inte blivit som det skulle – vi vill alltid försöka lösa det
          tillsammans. Är du privatperson och vi inte blir överens kan du vända dig till Allmänna
          reklamationsnämnden (arn.se). Tvister som inte löses på annat sätt avgörs av allmän domstol.
        </p>
      </LegalSection>

      <LegalSection n={15} title="Kontakt">
        <p>
          {company}
          {settings?.company.orgNumber && <><br />Org.nr: {settings.company.orgNumber}</>}
          {settings?.company.vatNumber && <><br />Momsreg.nr: {settings.company.vatNumber}</>}
          {settings?.address && <><br />{settings.address}</>}
          {settings?.phone && <><br />Telefon: {settings.phone}</>}
          {settings?.email && <><br />E-post: {settings.email}</>}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
