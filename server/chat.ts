// Chatt mellan kunder och verkstaden.
//
// Kunden har ingen inloggning: varje konversation har en hemlig token som sparas i webbläsaren
// och skickas med i mejlen ("Öppna chatten"). Kontaktformuläret och "Sälj din bil" startar också
// en konversation, så att personalen svarar på allt från samma ställe (Inkorg i admin).
// Netlify Functions kan inte hålla öppna anslutningar, så båda sidor frågar efter nytt var 2–3 s
// medan chatten är öppen. Närvaro och "skriver…" räknas från när respektive sida senast hörde av sig.

import { body, EMAIL_RE, HttpError, json, NO_CACHE, runStatements, str, type Query } from "./http";
import { getMailAccount, sendMail, siteOrigin } from "./mail";
import { sendPush } from "./push";

type Env = Record<string, string | undefined>;

/** Sidan räknas som "inne i chatten" så länge den frågat efter nytt inom så här lång tid. */
const ONLINE_MS = 20_000;
const TYPING_MS = 6_000;
const MAX_BODY = 2000;
const DEFAULT_ESTIMATE_MIN = 2;

export const CHAT_SCHEMA = `
create table if not exists public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  token              text not null unique,
  kind               text not null default 'chat' check (kind in ('chat','contact','sell')),
  name               text not null default '',
  email              text not null,
  phone              text not null default '',
  car_id             text references public.cars(id) on delete set null,
  details            jsonb not null default '{}',
  status             text not null default 'open' check (status in ('open','archived')),
  created_at         timestamptz not null default now(),
  last_message_at    timestamptz not null default now(),
  customer_seen_at   timestamptz,
  customer_typing_at timestamptz,
  customer_read_at   timestamptz,
  staff_seen_at      timestamptz,
  staff_typing_at    timestamptz,
  staff_read_at      timestamptz,
  last_email_at      timestamptz,
  legacy_ref         text unique
);
create index if not exists conversations_last_idx on public.conversations(last_message_at desc);

create table if not exists public.conversation_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender           text not null check (sender in ('customer','staff')),
  body             text not null check (char_length(body) between 1 and 4000),
  created_at       timestamptz not null default now()
);
create index if not exists conversation_messages_conv_idx on public.conversation_messages(conversation_id, created_at);

-- Kontaktmeddelanden och säljförfrågningar från före chatten blir konversationer (körs om utan dubbletter).
insert into public.conversations (token, kind, name, email, details, status, created_at, last_message_at, staff_read_at, legacy_ref)
select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'contact', name, email, '{}',
       case when status = 'archived' then 'archived' else 'open' end, created_at, created_at,
       case when status = 'new' then null else now() end, 'contact:' || id
  from public.contact_messages
on conflict (legacy_ref) do nothing;
insert into public.conversation_messages (conversation_id, sender, body, created_at)
select c.id, 'customer', m.message, m.created_at
  from public.contact_messages m join public.conversations c on c.legacy_ref = 'contact:' || m.id
 where not exists (select 1 from public.conversation_messages x where x.conversation_id = c.id);

insert into public.conversations (token, kind, name, email, phone, details, status, created_at, last_message_at, staff_read_at, legacy_ref)
select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'sell', name, email, phone,
       jsonb_build_object('make', make, 'model', model, 'year', year, 'mileageKm', mileage_km),
       case when status = 'archived' then 'archived' else 'open' end, created_at, created_at,
       case when status = 'new' then null else now() end, 'sell:' || id
  from public.sell_requests
on conflict (legacy_ref) do nothing;
insert into public.conversation_messages (conversation_id, sender, body, created_at)
select c.id, 'customer',
       coalesce(nullif(m.description, ''), 'Jag vill sälja min bil: ' || m.make || ' ' || m.model || ' ' || m.year || '.'), m.created_at
  from public.sell_requests m join public.conversations c on c.legacy_ref = 'sell:' || m.id
 where not exists (select 1 from public.conversation_messages x where x.conversation_id = c.id);
`;

let schemaReady: Promise<unknown> | null = null;
export function ensureChatSchema(query: Query) {
  schemaReady ??= runStatements(query, CHAT_SCHEMA).catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
const recent = (ts: unknown, ms: number) => !!ts && Date.now() - new Date(ts as string).getTime() < ms;
const short = (s: string, max = 120) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

async function siteSettings(query: Query) {
  return (await query("select value from settings where key = 'site'"))[0]?.value ?? {};
}
const staffName = (site: any) => String(site?.chat?.staffName || "").trim() || "Verkstaden";
const companyName = (site: any) => String(site?.company?.name || "").trim() || "Sjödalen Bilar AB";

/* ------------------------------------------------------------------ */
/* Svarstid                                                             */
/* ------------------------------------------------------------------ */

let estimateCache: { at: number; minutes: number } | null = null;
/** Median av hur snabbt verkstaden svarat på kundens första meddelande efter ett svar (senaste 60 dagarna). */
async function responseEstimate(query: Query) {
  if (estimateCache && Date.now() - estimateCache.at < 5 * 60_000) return estimateCache.minutes;
  const rows = await query(`
    select percentile_cont(0.5) within group (order by extract(epoch from (r.created_at - m.created_at))) as median, count(*)::int as n
      from conversation_messages m
      join lateral (select s.created_at from conversation_messages s
                     where s.conversation_id = m.conversation_id and s.sender = 'staff' and s.created_at > m.created_at
                     order by s.created_at limit 1) r on true
     where m.sender = 'customer' and m.created_at > now() - interval '60 days'
       and not exists (
         select 1 from conversation_messages p
          where p.conversation_id = m.conversation_id and p.sender = 'customer' and p.created_at < m.created_at
            and p.created_at > coalesce((select max(q.created_at) from conversation_messages q
                                          where q.conversation_id = m.conversation_id and q.sender = 'staff'
                                            and q.created_at < m.created_at), '-infinity'))`);
  const { median, n } = rows[0] ?? {};
  const minutes = n >= 3 && median ? Math.max(1, Math.round(Number(median) / 60)) : DEFAULT_ESTIMATE_MIN;
  estimateCache = { at: Date.now(), minutes };
  return minutes;
}

/* ------------------------------------------------------------------ */
/* Gemensamt                                                            */
/* ------------------------------------------------------------------ */

const MESSAGE_COLS = "id::text, sender, body, created_at";

async function messagesAfter(query: Query, convId: string, after: string | null) {
  return after
    ? query(`select ${MESSAGE_COLS} from conversation_messages where conversation_id = $1 and created_at > $2::timestamptz order by created_at`, [convId, after])
    : query(`select ${MESSAGE_COLS} from conversation_messages where conversation_id = $1 order by created_at`, [convId]);
}

function validAfter(v: string | null) {
  return v && !Number.isNaN(Date.parse(v)) ? v : null;
}

function messageBody(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new HttpError(400, "Skriv ett meddelande.");
  if (s.length > MAX_BODY) throw new HttpError(400, `Meddelandet får vara högst ${MAX_BODY} tecken.`);
  return s;
}

async function notifyStaff(query: Query, env: Env, conv: Record<string, any>, text: string, isNew: boolean) {
  // Personalen som redan har just den här chatten öppen behöver ingen notis.
  if (recent(conv.staff_seen_at, ONLINE_MS)) return;
  const who = conv.name || conv.email;
  const car = conv.car_id ? (await query("select title from cars where id = $1", [conv.car_id]))[0]?.title : null;
  await sendPush(query, env, conv.kind === "sell" ? "sell" : "chat", {
    title: conv.kind === "sell" && isNew ? `Vill sälja sin bil: ${who}` : car ? `${who} · ${car}` : who,
    body: short(text),
    url: `/admin/inkorg/${conv.id}`,
    tag: `chat-${conv.id}`,
  });
}

/** Startar en konversation. Används av chatten, kontaktformuläret och "Sälj din bil". */
export async function startConversation(
  query: Query,
  env: Env,
  input: { kind: "chat" | "contact" | "sell"; email: string; name?: string; phone?: string; carId?: string | null; details?: object; message: string },
) {
  await ensureChatSchema(query);
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Ange en giltig e-postadress.");
  const carId = input.carId ? (await query("select id from cars where id = $1 and status <> 'draft'", [input.carId]))[0]?.id ?? null : null;
  const rows = await query(
    `insert into conversations (token, kind, name, email, phone, car_id, details, customer_seen_at, customer_read_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now()) returning *`,
    [newToken(), input.kind, (input.name ?? "").trim().slice(0, 120), email, (input.phone ?? "").trim().slice(0, 40), carId, JSON.stringify(input.details ?? {})],
  );
  const conv = rows[0];
  await query("insert into conversation_messages (conversation_id, sender, body) values ($1, 'customer', $2)", [conv.id, input.message]);
  await notifyStaff(query, env, conv, input.message, true);
  return conv as { id: string; token: string };
}

/* ------------------------------------------------------------------ */
/* Kundens API: /api/chat …                                             */
/* ------------------------------------------------------------------ */

async function byToken(query: Query, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, "Chatten hittades inte.");
  const conv = (await query("select * from conversations where token = $1", [token]))[0];
  if (!conv) throw new HttpError(404, "Chatten hittades inte.");
  return conv;
}

export async function handleChatPublic(req: Request, parts: string[], query: Query, env: Env): Promise<Response> {
  await ensureChatSchema(query);
  const [token, action] = parts;
  const url = new URL(req.url);

  // Starta en ny chatt
  if (!token && req.method === "POST") {
    const b = await body(req);
    const conv = await startConversation(query, env, {
      kind: "chat",
      email: str(b.email, "e-post", { max: 254 })!,
      name: typeof b.name === "string" ? b.name : "",
      carId: typeof b.carId === "string" ? b.carId : null,
      message: messageBody(b.message),
    });
    return json({ token: conv.token }, 201, NO_CACHE);
  }

  // Svarstid och verkstadens namn innan någon chatt startats
  if (token === "info" && req.method === "GET") {
    const site = await siteSettings(query);
    return json({ staffName: staffName(site), estimateMinutes: await responseEstimate(query) }, 200, NO_CACHE);
  }

  if (!token) throw new HttpError(404, "Hittades inte.");
  const conv = await byToken(query, token);

  if (!action && req.method === "GET") {
    // ?peek=1: bara kolla efter nya svar (flytande chattknappen) utan att markera som läst
    const peek = url.searchParams.get("peek") === "1";
    if (!peek) await query("update conversations set customer_seen_at = now(), customer_read_at = now() where id = $1", [conv.id]);
    const site = await siteSettings(query);
    const messages = peek ? [] : await messagesAfter(query, conv.id, validAfter(url.searchParams.get("after")));
    const unread = (
      await query(
        "select count(*)::int as n from conversation_messages where conversation_id = $1 and sender = 'staff' and created_at > coalesce($2::timestamptz, '-infinity')",
        [conv.id, conv.customer_read_at],
      )
    )[0].n;
    const car = conv.car_id ? (await query("select id, title from cars where id = $1", [conv.car_id]))[0] ?? null : null;
    return json(
      {
        email: conv.email,
        name: conv.name,
        car,
        messages,
        unread,
        staff: {
          name: staffName(site),
          online: recent(conv.staff_seen_at, ONLINE_MS),
          typing: recent(conv.staff_typing_at, TYPING_MS),
          // Senaste svaret som verkstaden läst – för "Läst" under kundens meddelanden
          readAt: conv.staff_read_at,
        },
        estimateMinutes: await responseEstimate(query),
      },
      200,
      NO_CACHE,
    );
  }

  if (action === "messages" && req.method === "POST") {
    const text = messageBody((await body(req)).message);
    const msg = (
      await query(
        `insert into conversation_messages (conversation_id, sender, body) values ($1, 'customer', $2) returning ${MESSAGE_COLS}`,
        [conv.id, text],
      )
    )[0];
    await query(
      "update conversations set last_message_at = now(), status = 'open', customer_seen_at = now(), customer_read_at = now(), customer_typing_at = null where id = $1",
      [conv.id],
    );
    await notifyStaff(query, env, conv, text, false);
    return json(msg, 201, NO_CACHE);
  }

  if (action === "typing" && req.method === "POST") {
    await query("update conversations set customer_typing_at = now(), customer_seen_at = now() where id = $1", [conv.id]);
    return json({ ok: true }, 200, NO_CACHE);
  }

  throw new HttpError(404, "Hittades inte.");
}

/* ------------------------------------------------------------------ */
/* Personalens API: /api/admin/chats …                                  */
/* ------------------------------------------------------------------ */

const LIST_SQL = `
  select c.id::text, c.kind, c.name, c.email, c.phone, c.status, c.details, c.created_at, c.last_message_at,
         c.customer_seen_at, c.customer_typing_at, c.car_id, car.title as car_title,
         (select body from conversation_messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_body,
         (select sender from conversation_messages m where m.conversation_id = c.id order by created_at desc limit 1) as last_sender,
         (select count(*)::int from conversation_messages m
           where m.conversation_id = c.id and m.sender = 'customer' and m.created_at > coalesce(c.staff_read_at, '-infinity')) as unread
    from conversations c left join cars car on car.id = c.car_id`;

export async function unreadConversations(query: Query) {
  await ensureChatSchema(query);
  return (
    await query(`select count(*)::int as n from conversations c where c.status = 'open' and exists (
      select 1 from conversation_messages m where m.conversation_id = c.id and m.sender = 'customer'
         and m.created_at > coalesce(c.staff_read_at, '-infinity'))`)
  )[0].n as number;
}

function shapeConversation(r: Record<string, any>) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    details: r.details ?? {},
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    car: r.car_id ? { id: r.car_id, title: r.car_title } : null,
    lastBody: r.last_body ?? "",
    lastSender: r.last_sender ?? "customer",
    unread: r.unread ?? 0,
    customerOnline: recent(r.customer_seen_at, ONLINE_MS),
    customerTyping: recent(r.customer_typing_at, TYPING_MS),
  };
}

export async function handleChatAdmin(req: Request, id: string | undefined, action: string | undefined, query: Query, env: Env) {
  await ensureChatSchema(query);
  const url = new URL(req.url);

  if (!id && req.method === "GET") {
    const status = url.searchParams.get("status") === "archived" ? "archived" : "open";
    const rows = await query(`${LIST_SQL} where c.status = $1 order by c.last_message_at desc limit 300`, [status]);
    const mail = await getMailAccount(query);
    return json({ conversations: rows.map(shapeConversation), mailConnected: !!mail }, 200, NO_CACHE);
  }
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Chatten hittades inte.");
  const exists = (await query("select id from conversations where id = $1", [id]))[0];
  if (!exists) throw new HttpError(404, "Chatten hittades inte.");

  if (!action && req.method === "GET") {
    await query("update conversations set staff_seen_at = now(), staff_read_at = now() where id = $1", [id]);
    const conv = (await query(`${LIST_SQL} where c.id = $1`, [id]))[0];
    const raw = (await query("select customer_read_at from conversations where id = $1", [id]))[0];
    const messages = await messagesAfter(query, id, validAfter(url.searchParams.get("after")));
    return json({ conversation: { ...shapeConversation(conv), customerReadAt: raw.customer_read_at }, messages }, 200, NO_CACHE);
  }

  if (!action && req.method === "PATCH") {
    const b = await body(req);
    if (b.status !== "open" && b.status !== "archived") throw new HttpError(400, "Ogiltig status.");
    await query("update conversations set status = $2 where id = $1", [id, b.status]);
    return json({ ok: true }, 200, NO_CACHE);
  }

  if (action === "typing" && req.method === "POST") {
    await query("update conversations set staff_typing_at = now(), staff_seen_at = now() where id = $1", [id]);
    return json({ ok: true }, 200, NO_CACHE);
  }

  if (action === "messages" && req.method === "POST") {
    const text = messageBody((await body(req)).message);
    const msg = (
      await query(`insert into conversation_messages (conversation_id, sender, body) values ($1, 'staff', $2) returning ${MESSAGE_COLS}`, [id, text])
    )[0];
    const conv = (
      await query(
        `update conversations set last_message_at = now(), staff_seen_at = now(), staff_read_at = now(), staff_typing_at = null
          where id = $1 returning *`,
        [id],
      )
    )[0];
    const email = await emailCustomerIfAway(req, query, env, conv, text);
    return json({ message: msg, email }, 201, NO_CACHE);
  }

  throw new HttpError(404, "Hittades inte.");
}

/**
 * Mejlar kunden om svaret – bara om kunden inte har chatten öppen, och bara ett mejl per gång
 * kunden varit borta (inget nytt mejl förrän kunden varit tillbaka i chatten).
 * Returnerar vad som hände, så att admin kan visa det under meddelandet.
 */
async function emailCustomerIfAway(req: Request, query: Query, env: Env, conv: Record<string, any>, text: string) {
  if (recent(conv.customer_seen_at, ONLINE_MS)) return "online" as const;
  if (conv.last_email_at && (!conv.customer_seen_at || new Date(conv.last_email_at) > new Date(conv.customer_seen_at)))
    return "already" as const;
  const site = await siteSettings(query);
  const car = conv.car_id ? (await query("select title from cars where id = $1", [conv.car_id]))[0]?.title : null;
  const r = await sendMail(query, env, {
    to: conv.email,
    fromName: companyName(site),
    subject: car ? `Svar om ${car}` : `Svar från ${companyName(site)}`,
    heading: "Du har fått ett svar",
    paragraphs: [conv.name ? `Hej ${String(conv.name).split(" ")[0]}!` : "Hej!", car ? `Vi har svarat på din fråga om ${car}.` : "Vi har svarat på ditt meddelande."],
    quote: { from: staffName(site), text: short(text, 1500) },
    button: { label: "Öppna chatten och svara", url: `${siteOrigin(req)}/chatt/${conv.token}` },
    footer: `Du får det här mejlet för att du chattat med ${companyName(site)}. Svara gärna i chatten, så hamnar allt på ett ställe.`,
  });
  if (!r.ok) return r.error === "E-post är inte ansluten." ? ("not_connected" as const) : ("failed" as const);
  await query("update conversations set last_email_at = now() where id = $1", [conv.id]);
  return "sent" as const;
}
