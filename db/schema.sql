-- Sjödalen Bilar – databasschema (Neon / Postgres)
-- Körs med `npm run db:setup` (eller klistra in i Neon Console → SQL Editor).
-- Kan köras flera gånger.

-- =====================================================================
-- Publikt innehåll
-- =====================================================================

create table if not exists public.services (
  id            text primary key,
  category      text not null check (category in ('Underhåll','Reparation','Besiktning','Däck','Övrigt')),
  name          text not null,
  description   text not null,
  price_from    integer not null check (price_from >= 0),
  price_to      integer check (price_to >= price_from),
  duration_min  integer not null check (duration_min > 0),
  popular       boolean not null default false,
  sort_order    integer not null default 0
);

create table if not exists public.cars (
  id                 text primary key,
  make               text not null,
  model              text not null,
  year               integer not null,
  title              text not null,
  highlight          text not null default '',
  body_type          text not null check (body_type in ('kombi','suv','sedan','halvkombi','skåpbil')),
  color_name         text not null,
  color_hex          text not null,
  mileage_km         integer not null check (mileage_km >= 0),
  fuel               text not null,
  gearbox            text not null,
  inspected          boolean not null default true,
  condition_summary  text not null default '',
  highlights         text[] not null default '{}',
  things_to_note     text[] not null default '{}',
  description        text not null default '',
  start_price        integer not null check (start_price >= 0),
  min_increment      integer not null check (min_increment > 0),
  ends_at            timestamptz not null,
  status             text not null default 'active',
  sold_price         integer,
  extended           boolean not null default false,
  created_at         timestamptz not null default now()
);

create table if not exists public.bids (
  id          uuid primary key default gen_random_uuid(),
  car_id      text not null references public.cars(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  amount      integer not null check (amount > 0),
  created_at  timestamptz not null default now()
);
create index if not exists bids_car_id_idx on public.bids(car_id);

create table if not exists public.reviews (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  rating      integer not null check (rating between 1 and 5),
  text        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.faqs (
  id          text primary key default gen_random_uuid()::text,
  question    text not null,
  answer      text not null,
  sort_order  integer not null default 0
);

-- =====================================================================
-- Inkommande ärenden från besökare (läses bara av verkstaden)
-- =====================================================================

create table if not exists public.bookings (
  id          text primary key default ('bok_' || gen_random_uuid()::text),
  service_id  text not null references public.services(id),
  service_name text not null,
  date        date not null,
  time        text not null check (time in ('08:00','09:00','10:00','11:00','13:00','14:00','15:00')),
  name        text not null check (char_length(name) between 2 and 120),
  phone       text not null check (char_length(phone) between 6 and 40),
  email       text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  reg_number  text check (char_length(reg_number) <= 10),
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now()
);
-- En bokning per tid och dag (förhindrar dubbelbokning)
create unique index if not exists bookings_slot_uidx on public.bookings(date, time);

create table if not exists public.sell_requests (
  id           uuid primary key default gen_random_uuid(),
  make         text not null check (char_length(make) between 1 and 60),
  model        text not null check (char_length(model) between 1 and 60),
  year         integer not null check (year >= 1970),
  mileage_km   integer not null check (mileage_km >= 0),
  description  text not null default '' check (char_length(description) <= 4000),
  name         text not null check (char_length(name) between 2 and 120),
  phone        text not null check (char_length(phone) between 6 and 40),
  email        text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  created_at   timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  email       text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  message     text not null check (char_length(message) between 4 and 5000),
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Admin: bilder, inställningar och statusfält (kan köras om på befintlig databas)
-- =====================================================================

-- Bilar: utkast (syns inte publikt), bilder och reservationspris
alter table public.cars drop constraint if exists cars_status_check;
alter table public.cars add constraint cars_status_check check (status in ('draft','active','sold'));
alter table public.cars add column if not exists images        text[] not null default '{}';
alter table public.cars add column if not exists reserve_price integer check (reserve_price >= 0);
alter table public.cars add column if not exists admin_note    text not null default '';
alter table public.cars add column if not exists updated_at    timestamptz not null default now();
alter table public.cars add column if not exists sold_at       timestamptz;

-- Budgivarens kontaktuppgifter (visas bara i admin)
alter table public.bids add column if not exists email text;
alter table public.bids add column if not exists phone text;

-- Bilder: själva filerna ligger i Netlify Blobs, här finns metadata
create table if not exists public.images (
  id          text primary key,
  width       integer not null,
  height      integer not null,
  bytes       integer not null default 0,
  crop        jsonb,
  created_at  timestamptz not null default now()
);

-- Inkorg: status och anteckning på meddelanden och säljförfrågningar
alter table public.contact_messages add column if not exists status text not null default 'new';
alter table public.contact_messages add column if not exists note   text not null default '';
alter table public.sell_requests    add column if not exists status text not null default 'new';
alter table public.sell_requests    add column if not exists note   text not null default '';
alter table public.contact_messages drop constraint if exists contact_messages_status_check;
alter table public.contact_messages add constraint contact_messages_status_check check (status in ('new','read','archived'));
alter table public.sell_requests drop constraint if exists sell_requests_status_check;
alter table public.sell_requests add constraint sell_requests_status_check check (status in ('new','read','archived'));

-- Bokningar: status. Avbokade tider blir lediga igen.
alter table public.bookings add column if not exists status text not null default 'booked';
alter table public.bookings add column if not exists note   text not null default '';
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('booked','done','cancelled','no_show'));
drop index if exists public.bookings_slot_uidx;
create unique index if not exists bookings_slot_active_uidx on public.bookings(date, time) where status <> 'cancelled';

-- Adminkonton (huvudkontot kommer från ADMIN_EMAIL/ADMIN_PASSWORD i Netlify, se server/auth.ts)
create table if not exists public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email) and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name           text not null default '' check (char_length(name) <= 80),
  password_hash  text not null,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

-- Webbplatsinställningar (kontaktuppgifter, öppettider, notisbanner …)
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- Funktioner (anropas från API:t i netlify/functions)
-- =====================================================================

-- Lägg bud: validerar minsta bud och förlänger auktionen 5 min vid sena bud.
drop function if exists public.place_bid(text, text, integer);
create or replace function public.place_bid(
  p_car_id text, p_name text, p_amount integer, p_email text default null, p_phone text default null
)
returns json
language plpgsql
as $$
declare
  v_car     public.cars%rowtype;
  v_current integer;
  v_min     integer;
  v_extend  boolean;
begin
  if p_name is null or btrim(p_name) = '' then
    return json_build_object('ok', false, 'message', 'Ange ditt namn.');
  end if;

  select * into v_car from public.cars where id = p_car_id for update;
  if not found then
    return json_build_object('ok', false, 'message', 'Bilen hittades inte.');
  end if;

  if v_car.status <> 'active' or v_car.ends_at <= now() then
    return json_build_object('ok', false, 'message', 'Auktionen är avslutad.');
  end if;

  select coalesce(max(amount), v_car.start_price) into v_current from public.bids where car_id = p_car_id;
  v_min := v_current + v_car.min_increment;

  if p_amount is null or p_amount < v_min then
    return json_build_object(
      'ok', false,
      'message', 'Budet måste vara minst ' || replace(to_char(v_min, 'FM999G999G999'), ',', ' ') || ' kr.'
    );
  end if;

  insert into public.bids (car_id, name, amount, email, phone)
  values (p_car_id, left(btrim(p_name), 80), p_amount,
          nullif(left(btrim(p_email), 254), ''), nullif(left(btrim(p_phone), 40), ''));

  v_extend := v_car.ends_at - now() <= interval '5 minutes';
  if v_extend then
    update public.cars set ends_at = now() + interval '5 minutes', extended = true where id = p_car_id;
  end if;

  return json_build_object(
    'ok', true,
    'extended', v_extend,
    'message', case when v_extend
      then 'Ditt bud är registrerat! Eftersom det kom precis innan sluttid förlängde vi auktionen 5 minuter.'
      else 'Ditt bud är registrerat!' end
  );
end;
$$;

-- Skapa bokning och returnera bokningsnummer
create or replace function public.create_booking(
  p_service_id text, p_date date, p_time text, p_name text, p_phone text, p_email text,
  p_reg_number text default null, p_notes text default null
)
returns json
language plpgsql
as $$
declare
  v_service public.services%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_service from public.services where id = p_service_id;
  if not found then
    raise exception 'Okänd tjänst.';
  end if;
  if p_date <= current_date then
    raise exception 'Välj ett datum från och med i morgon.';
  end if;

  insert into public.bookings (service_id, service_name, date, time, name, phone, email, reg_number, notes)
  values (p_service_id, v_service.name, p_date, p_time, btrim(p_name), btrim(p_phone), btrim(p_email),
          nullif(btrim(p_reg_number), ''), nullif(btrim(p_notes), ''))
  returning * into v_booking;

  return json_build_object('id', v_booking.id, 'created_at', v_booking.created_at);
exception
  when unique_violation then
    raise exception 'Tiden hann tyvärr bli bokad av någon annan. Välj en annan tid.';
end;
$$;

-- Upptagna tider ett visst datum (utan personuppgifter)
create or replace function public.booked_slots(p_date date)
returns table (slot text)
language sql
stable
as $$
  select b.time as slot from public.bookings b where b.date = p_date and b.status <> 'cancelled';
$$;
