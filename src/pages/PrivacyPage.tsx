import { LegalPage, LegalSection } from "../components/LegalPage";
import { formatLongDate } from "../lib/format";
import { useSettings } from "../lib/queries";

/** Ändra när policyn ändras. */
const PRIVACY_VERSION = "2026-10-16";

export function PrivacyPage() {
  const { data: settings } = useSettings();

  return (
    <LegalPage
      kicker="Personuppgifter"
      title="Integritetspolicy"
      updated={formatLongDate(PRIVACY_VERSION)}
      intro={
        <p className="mb-10 text-lg leading-relaxed text-graphite-600">
          Här beskriver vi vilka uppgifter vi sparar om dig när du använder webbplatsen, varför vi gör det och vilka
          rättigheter du har. Vi samlar bara in det vi behöver, och vi säljer aldrig dina uppgifter.
        </p>
      }
    >
      <LegalSection n={1} title="Vem ansvarar för dina uppgifter">
        <p>
          {settings?.company.name || "Sjödalen Bilar AB"}
          {settings?.company.orgNumber && <> (org.nr {settings.company.orgNumber})</>} är personuppgiftsansvarig.
          {settings?.address && <> Adress: {settings.address}.</>}
          {settings?.email && <> E-post: {settings.email}.</>}
          {settings?.phone && <> Telefon: {settings.phone}.</>}
        </p>
      </LegalSection>

      <LegalSection n={2} title="Vilka uppgifter vi samlar in och varför">
        <p>
          <strong>När du lägger bud på en bil:</strong> namn, e-postadress, telefonnummer, budbelopp och tidpunkt,
          samt vilken version av auktionsvillkoren du godkänt. Vi använder uppgifterna för att genomföra auktionen,
          kontakta dig om du vinner och genomföra köpet. Ditt namn visas i bilens budhistorik, som alla kan se.
          E-post och telefon visas aldrig för andra. Grund: avtal.
        </p>
        <p>
          <strong>När du bokar tid i verkstaden:</strong> namn, telefonnummer, e-postadress, registreringsnummer och
          det du skriver under övrigt. Vi använder dem för att ta emot och utföra bokningen. Grund: avtal.
        </p>
        <p>
          <strong>När du vill sälja din bil till oss:</strong> uppgifter om bilen samt ditt namn, telefonnummer och
          e-postadress, för att kunna ge dig ett bud. Grund: berättigat intresse – du har bett oss höra av oss.
        </p>
        <p>
          <strong>När du chattar med oss eller använder kontaktformuläret:</strong> e-postadress, namn om du anger
          det, dina meddelanden och vilken bil frågan gäller. Vi ser också om du har chatten öppen just nu, så att vi
          vet om svaret når dig direkt. Vi använder uppgifterna för att svara dig – i chatten och, om du lämnat sidan,
          via e-post. Grund: berättigat intresse.
        </p>
        <p>
          <strong>E-post om dina bud:</strong> om någon bjuder över dig, och när auktionen är slut, mejlar vi dig
          om det. Grund: avtal.
        </p>
        <p>
          <strong>När du köper en bil eller en tjänst:</strong> uppgifter som behövs för betalning, kvitto och
          ägarbyte. Vi är skyldiga att spara bokföringsunderlag enligt bokföringslagen. Grund: rättslig skyldighet.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Hur länge vi sparar uppgifterna">
        <ul>
          <li>Bud från den som inte vann: högst 12 månader efter att auktionen avslutats.</li>
          <li>Bokningar, chattar, förfrågningar om att sälja bil och meddelanden: högst 24 månader efter senaste kontakt.</li>
          <li>Uppgifter som ingår i bokföringen, t.ex. vid ett köp: sju år efter utgången av det år köpet gjordes, enligt bokföringslagen.</li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Vilka som får ta del av uppgifterna">
        <p>
          Bara vi på {settings?.company.name || "Sjödalen Bilar AB"} har tillgång till dina kontaktuppgifter. Webbplatsen och databasen drivs av
          leverantörer (Netlify och Neon) som lagrar uppgifterna för vår räkning och enligt våra instruktioner. Mejl
          till dig skickas via vårt e-postkonto hos Google (Gmail). Om
          en leverantör behandlar uppgifter utanför EU/EES sker det med stöd av EU-kommissionens beslut om
          adekvat skyddsnivå eller EU:s standardavtalsklausuler.
        </p>
        <p>
          Vid köp av bil lämnar vi de uppgifter som behövs för ägarbytet till Transportstyrelsen. Vi lämnar annars
          bara ut uppgifter om lagen kräver det.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Cookies och lagring i din webbläsare">
        <p>
          Vi använder inga cookies för spårning eller marknadsföring. För att göra sidan enklare att använda
          sparar vi några uppgifter lokalt i din webbläsare – de skickas inte till oss:
        </p>
        <ul>
          <li>Namn, e-post och telefon du budat med, så att du slipper fylla i dem nästa gång.</li>
          <li>Vilka bilar du bevakar.</li>
          <li>Länken till dina chattar med oss, så att du kommer tillbaka till samma konversation.</li>
        </ul>
        <p>Du kan ta bort dem när som helst genom att rensa webbplatsdata i din webbläsare.</p>
      </LegalSection>

      <LegalSection n={6} title="Dina rättigheter">
        <p>Du har rätt att:</p>
        <ul>
          <li>få veta vilka uppgifter vi har om dig och få en kopia av dem,</li>
          <li>få felaktiga uppgifter rättade,</li>
          <li>få dina uppgifter raderade, om vi inte måste spara dem enligt lag eller för ett pågående köp,</li>
          <li>invända mot eller begära att vi begränsar behandlingen,</li>
          <li>få ut uppgifter du själv lämnat i ett maskinläsbart format.</li>
        </ul>
        <p>
          Kontakta oss{settings?.email ? ` på ${settings.email}` : ""} så hjälper vi dig. Tycker du att vi hanterar
          dina uppgifter fel kan du klaga hos Integritetsskyddsmyndigheten (imy.se).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
