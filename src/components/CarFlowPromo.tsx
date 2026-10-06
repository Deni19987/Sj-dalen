// "CarFlow"-sektionen som visas mellan <main> och <footer> på Hem och Tjänster.
// Stilarna (.cf-*) ligger i index.css och är oförändrade från originalet.

type Tone = "info" | "warning" | "success" | "muted";

interface TimelineItem {
  tone: Tone;
  icon: string;
  title: string;
  desc?: string;
  time?: string;
  badge?: string;
  dim?: boolean;
}

const TONE_CLASS: Record<Tone, string> = { info: "info", warning: "warn", success: "ok", muted: "muted" };

const DONE: TimelineItem[] = [
  { tone: "info", icon: "🚗", title: "Bil inlämnad", desc: "Din bil har tagits emot hos oss.", time: "mån 08:14" },
  { tone: "info", icon: "🔍", title: "Felsökning påbörjad", desc: "Vi har påbörjat felsökning och diagnostisering.", time: "mån 09:02" },
  { tone: "info", icon: "⚙️", title: "Pågående arbete", desc: "Arbete pågår just nu på ditt fordon.", time: "mån 13:40" },
  { tone: "success", icon: "🏁", title: "Jobb klart", desc: "Allt arbete är klart. Din bil är redo att hämtas.", time: "tis 10:15" },
];

const PROGRESS: TimelineItem[] = [
  { tone: "info", icon: "🚗", title: "Bil inlämnad", desc: "Din bil har tagits emot hos oss.", time: "mån 08:14" },
  { tone: "info", icon: "🔍", title: "Felsökning påbörjad", desc: "Vi har påbörjat felsökning av ditt fordon.", time: "mån 09:02" },
  {
    tone: "warning",
    icon: "⚠️",
    title: "Offert",
    desc: "Vi har hittat mer som behöver göras. Vi väntar på ditt godkännande.",
    time: "mån 09:45",
    badge: "Åtgärd krävs",
  },
  { tone: "muted", icon: "🏁", title: "Jobb klart", dim: true },
];

function CarFlowLogo() {
  return (
    <svg viewBox="0 0 40 40" width="20" height="20" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="40" height="40" rx="10" fill="#4f46e5" />
      <path d="M26 12 C18 10 11 15 11 20 C11 25 18 30 26 28" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <line x1="20" y1="17" x2="30" y2="17" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="21" x2="30" y2="21" strokeWidth="2.5" stroke="white" strokeLinecap="round" />
    </svg>
  );
}

function Phone({ items }: { items: TimelineItem[] }) {
  return (
    <div className="cf-phone-wrap">
      <div className="cf-phone">
        <div className="cf-screen">
          <div className="cf-screen-header">
            <div>
              <div className="cf-reg">ABC 123</div>
              <div className="cf-model">Volvo V60</div>
            </div>
            <CarFlowLogo />
          </div>
          <div className="cf-tabs">
            <div className="cf-tab active">Uppdateringar</div>
            <div className="cf-tab">Chatt (2)</div>
          </div>
          <div className="cf-timeline">
            {items.map((it, i) => (
              <div key={it.title} className={"cf-titem" + (it.dim ? " dim" : "")}>
                <div className="cf-rail">
                  <div className={"cf-icon " + TONE_CLASS[it.tone]}>{it.icon}</div>
                  {i < items.length - 1 && <div className="cf-rail-line" />}
                </div>
                <div className="cf-tbody">
                  <div className="cf-ttitle">
                    <span>{it.title}</span>
                    {it.badge && <span className="cf-badge">{it.badge}</span>}
                  </div>
                  {it.desc && <div className="cf-tdesc">{it.desc}</div>}
                  {it.time && <div className="cf-ttime">{it.time}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CONTENT = {
  home: {
    eyebrow: "Nyhet",
    title: "Håll koll på bilen hela vägen till klar",
    desc: "När du lämnar in bilen hos oss får du en länk direkt via sms till din egen sida. Där ser du varje steg i verkstaden i realtid och kan chatta med oss – inga fler ovissa telefonsamtal för att höra hur det går.",
    list: [
      ["📲", "Du får en sms-länk så fort bilen är inlämnad"],
      ["📋", "Se status och uppdateringar dygnet runt"],
      ["✅", "Godkänn offerter direkt i mobilen"],
    ],
    phone: DONE,
  },
  tjanster: {
    eyebrow: "Så funkar det",
    title: "Lämna in bilen – följ resten från mobilen",
    desc: "Så fort du lämnat in bilen hos vår verkstad får du en sms-länk till din personliga sida. Du ser direkt när felsökningen startar, får en offert att godkänna om vi hittar mer som behöver åtgärdas, och en notis så fort bilen är klar att hämta.",
    list: [
      ["🚗", "Bil inlämnad – vi bekräftar direkt i din sms-länk"],
      ["🔍", "Felsökning och offert – godkänn med ett klick"],
      ["🏁", "Notis när bilen är klar att hämta"],
    ],
    phone: PROGRESS,
  },
};

export function CarFlowPromo({ variant }: { variant: "home" | "tjanster" }) {
  const c = CONTENT[variant];
  return (
    <div className="cf-promo" id={variant === "home" ? "cf-promo-home" : "cf-promo-tjanster"}>
      <div className="cf-promo-inner">
        <div className="cf-promo-text">
          <span className="cf-promo-eyebrow">{c.eyebrow}</span>
          <h2 className="cf-promo-title">{c.title}</h2>
          <p className="cf-promo-desc">{c.desc}</p>
          <ul className="cf-promo-list">
            {c.list.map(([icon, text]) => (
              <li key={text}>
                <span className="cf-dot">{icon}</span>
                {text}
              </li>
            ))}
          </ul>
          <div className="cf-promo-brand">
            <CarFlowLogo />
            <span>
              Drivs av <b>CarFlow</b> – vårt digitala kundverktyg
            </span>
          </div>
        </div>
        <Phone items={c.phone} />
      </div>
    </div>
  );
}
