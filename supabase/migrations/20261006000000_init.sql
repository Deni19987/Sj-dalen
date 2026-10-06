-- Sjödalen Bilar – databasschema
-- Kör i Supabase: SQL Editor (eller `supabase db push` med Supabase CLI)

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
  status             text not null default 'active' check (status in ('active','sold')),
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
-- Row Level Security
-- =====================================================================

alter table public.services          enable row level security;
alter table public.cars              enable row level security;
alter table public.bids              enable row level security;
alter table public.reviews           enable row level security;
alter table public.faqs              enable row level security;
alter table public.bookings          enable row level security;
alter table public.sell_requests     enable row level security;
alter table public.contact_messages  enable row level security;

-- Alla får läsa publikt innehåll
create policy "Publik läsning" on public.services for select to anon, authenticated using (true);
create policy "Publik läsning" on public.cars     for select to anon, authenticated using (true);
create policy "Publik läsning" on public.bids     for select to anon, authenticated using (true);
create policy "Publik läsning" on public.reviews  for select to anon, authenticated using (true);
create policy "Publik läsning" on public.faqs     for select to anon, authenticated using (true);

-- Besökare får skicka in (men inte läsa) säljförfrågningar och meddelanden
create policy "Besökare kan skicka" on public.sell_requests    for insert to anon, authenticated with check (true);
create policy "Besökare kan skicka" on public.contact_messages for insert to anon, authenticated with check (true);

-- Bud och bokningar skapas bara via funktionerna nedan (ingen direkt insert-policy).

-- =====================================================================
-- Funktioner (RPC)
-- =====================================================================

-- Lägg bud: validerar minsta bud och förlänger auktionen 5 min vid sena bud.
create or replace function public.place_bid(p_car_id text, p_name text, p_amount integer)
returns json
language plpgsql
security definer
set search_path = public
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

  if v_car.status = 'sold' or v_car.ends_at <= now() then
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

  insert into public.bids (car_id, name, amount) values (p_car_id, left(btrim(p_name), 80), p_amount);

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
security definer
set search_path = public
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
security definer
set search_path = public
stable
as $$
  select b.time as slot from public.bookings b where b.date = p_date;
$$;

revoke all on function public.place_bid(text, text, integer) from public;
revoke all on function public.create_booking(text, date, text, text, text, text, text, text) from public;
revoke all on function public.booked_slots(date) from public;
grant execute on function public.place_bid(text, text, integer) to anon, authenticated;
grant execute on function public.create_booking(text, date, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.booked_slots(date) to anon, authenticated;

-- =====================================================================
-- Realtime: live-uppdatering av bud på auktionssidorna
-- =====================================================================
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.cars;
