// Pushnotiser på den här enheten (samma flöde som i Carflow, se server/push.ts för utskicken).
import { pushApi, type PushTopic } from "./api";

export const TOPIC_LABELS: Record<PushTopic, { label: string; description: string }> = {
  bids: { label: "Nya bud", description: "Varje bud, och om auktionen förlängs av ett sent bud" },
  reserve: { label: "Reservationspris uppnått", description: "När ett bud når bilens reservationspris" },
  ending: { label: "Slutar inom en timme", description: "Med högsta bud och antal bud just då" },
  ended: { label: "Auktion avslutad", description: "Vinnaren, under reservationspris eller inga bud" },
  followup: { label: "Betalning och hämtning", description: "Påminnelse när betalning eller hämtning dröjer längre än villkoren" },
  chat: { label: "Chattmeddelanden", description: "När en kund skriver i chatten eller kontaktformuläret" },
  sell: { label: "Sälj din bil", description: "När någon vill sälja sin bil till er" },
  bookings: { label: "Nya bokningar", description: "När en kund bokar tid i verkstaden" },
};

/** Grupperna i notissektionen under Inställningar. */
export const TOPIC_GROUPS: { title: string; topics: PushTopic[] }[] = [
  { title: "Auktioner", topics: ["bids", "reserve", "ending", "ended", "followup"] },
  { title: "Kunder", topics: ["chat", "sell"] },
  { title: "Verkstad", topics: ["bookings"] },
];

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Öppnad från hemskärmen (inte i Safari/Chrome). */
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** På iPhone fungerar notiser bara när admin är tillagd på hemskärmen och öppnad därifrån. */
export const needsHomeScreen = () => isIos() && !isStandalone();

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerPushServiceWorker() {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await reg.update().catch(() => {});
  await navigator.serviceWorker.ready;
  return reg;
}

export async function currentSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Frågar om tillstånd, prenumererar och sparar enheten på servern. Kastar med ett begripligt fel. */
export async function enablePush(topics?: PushTopic[]) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted")
    throw new Error(
      perm === "denied"
        ? "Notiser är blockerade för admin. Tillåt dem i telefonens inställningar och försök igen."
        : "Du behöver tillåta notiser för att få dem.",
    );
  const reg = await registerPushServiceWorker();
  const { publicKey } = await pushApi.publicKey();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const json = sub.toJSON();
  return pushApi.subscribe({
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    userAgent: navigator.userAgent.slice(0, 500),
    topics,
  });
}

/** Stänger av notiser på enheten, både i webbläsaren och på servern. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  await pushApi.unsubscribe(endpoint);
  return true;
}

// Satt när utloggning stängde av notiserna, så att de slås på igen av sig själva vid nästa inloggning
// (användaren valde aldrig att stänga av dem). Att stänga av i Inställningar sätter den inte.
const RESTORE_KEY = "sjodalen-push-restore-on-sign-in";

/** Vid utloggning: en utloggad enhet ska aldrig få verkstadens notiser. Kastar aldrig. */
export async function disablePushOnSignOut() {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    // Spara vilka slags notiser enheten valt, så att samma val kommer tillbaka vid inloggning.
    const { topics } = await pushApi.status(sub.endpoint).catch(() => ({ topics: undefined }));
    try {
      localStorage.setItem(RESTORE_KEY, JSON.stringify(topics ?? null));
    } catch {
      /* ingen lagring – man kan slå på igen i Inställningar */
    }
    await disablePush();
  } catch (e) {
    console.warn("[push] kunde inte stänga av notiser vid utloggning", e);
  }
}

/** Efter inloggning: slå på igen om utloggningen stängde av dem och tillståndet finns kvar. */
export async function restorePushAfterSignIn() {
  try {
    const saved = localStorage.getItem(RESTORE_KEY);
    if (saved === null) return false;
    if (!isPushSupported() || Notification.permission !== "granted") return false;
    let topics: PushTopic[] | undefined;
    try {
      topics = JSON.parse(saved) ?? undefined;
    } catch {
      /* äldre värde – alla typer */
    }
    await enablePush(topics);
    localStorage.removeItem(RESTORE_KEY);
    return true;
  } catch (e) {
    console.warn("[push] kunde inte slå på notiser igen efter inloggning", e);
    return false;
  }
}
