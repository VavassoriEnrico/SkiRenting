-- Creazione iniziale: eseguire TUTTO una volta nel SQL Editor di Supabase.
-- Richiede 001 (operatori/sedi), 002 (materiale) e 006 (clienti).
-- Non importa prenotazioni o pagamenti e non cambia le giacenze esistenti.
-- Il collegamento del modulo e le funzioni di scrittura saranno aggiunti dopo.
begin;

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Nomi provvisori richiesti per la prima versione. Nessuno sconto automatico.
insert into public.hotels(name) values ('Albergo 1'), ('Albergo 2');

create table public.rental_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number bigint generated always as identity unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  hotel_id uuid references public.hotels(id) on delete restrict,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'preparing', 'active', 'completed', 'cancelled')),
  discount_percent numeric(5,2) not null default 0
    check (discount_percent between 0 and 100),
  notes text,
  created_by uuid not null references public.operator_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (isfinite(starts_on) and isfinite(ends_on))
);
comment on column public.rental_bookings.booking_number is
  'Progressivo globale tra le sedi, può avere salti. Non è un numero di documento fiscale.';
comment on column public.rental_bookings.status is
  'confirmed=prenotato; preparing=in preparazione; active=consegnato; completed=concluso; cancelled=annullato.';
comment on column public.rental_bookings.discount_percent is
  'Sconto effettivamente applicato alla prenotazione; non cambia con le future convenzioni alberghiere.';
create index rental_bookings_customer_idx on public.rental_bookings(customer_id);
create index rental_bookings_location_period_idx on public.rental_bookings(location_id, starts_on, ends_on);
create index rental_bookings_hotel_idx on public.rental_bookings(hotel_id);

create table public.rental_booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.rental_bookings(id) on delete restrict,
  rental_inventory_id uuid not null references public.rental_inventory(id) on delete restrict,
  code_snapshot text not null check (btrim(code_snapshot) <> ''),
  brand_snapshot text not null check (btrim(brand_snapshot) <> ''),
  model_snapshot text not null check (btrim(model_snapshot) <> ''),
  size_snapshot text,
  daily_price numeric(12,2) check (daily_price between 0 and 9999999999.99),
  amount numeric(12,2) not null check (amount between 0 and 9999999999.99),
  delivered_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, rental_inventory_id),
  check (returned_at is null or (delivered_at is not null and returned_at >= delivered_at)),
  check (delivered_at is null or isfinite(delivered_at)),
  check (returned_at is null or isfinite(returned_at))
);
comment on column public.rental_booking_items.amount is
  'Importo dell’articolo per tutto il periodo, prima dello sconto complessivo. Deve essere esplicito: zero è gratuito, non sconosciuto.';
comment on column public.rental_booking_items.daily_price is
  'Tariffa giornaliera applicata per la durata scelta, facoltativa se il prezzo è concordato a corpo. Non viene aggiornata dal listino.';
comment on column public.rental_booking_items.code_snapshot is
  'Codice originale al momento della prenotazione: conservarlo anche se il materiale cambia o viene venduto.';
create index rental_booking_items_inventory_idx on public.rental_booking_items(rental_inventory_id);

create table public.rental_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.rental_bookings(id) on delete restrict,
  payment_method text not null check (btrim(payment_method) <> ''),
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999999.99),
  paid_at timestamptz not null default now() check (isfinite(paid_at)),
  created_by uuid not null references public.operator_profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);
comment on column public.rental_payments.paid_at is
  'Data e ora effettive del pagamento ricevuto, con fuso orario. Distinte dalla data di registrazione created_at.';
comment on table public.rental_payments is
  'Registrazioni manuali di incassi già ricevuti, senza transazioni o collegamento alla cassa. Più righe consentono acconti e saldo.';
comment on column public.rental_payments.payment_method is
  'Metodo effettivo del pagamento; elenco definitivo da concordare, senza valori preimpostati.';
create index rental_payments_booking_paid_idx on public.rental_payments(booking_id, paid_at);
create index rental_payments_paid_at_idx on public.rental_payments(paid_at);

create function public.skirenting_rental_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger hotels_updated_at before update on public.hotels
  for each row execute function public.skirenting_rental_updated_at();
create trigger rental_bookings_updated_at before update on public.rental_bookings
  for each row execute function public.skirenting_rental_updated_at();
create trigger rental_booking_items_updated_at before update on public.rental_booking_items
  for each row execute function public.skirenting_rental_updated_at();

-- Prima fase: solo consultazione. Il futuro salvataggio transazionale dovrà
-- verificare sede degli articoli, sovrapposizioni delle date e importi complessivi.
-- Nessun INSERT/UPDATE/DELETE diretto da account operatore su queste tabelle.
alter table public.hotels enable row level security;
alter table public.rental_bookings enable row level security;
alter table public.rental_booking_items enable row level security;
alter table public.rental_payments enable row level security;
revoke all on public.hotels, public.rental_bookings, public.rental_booking_items,
  public.rental_payments from public, anon, authenticated;
grant select on public.hotels, public.rental_bookings, public.rental_booking_items,
  public.rental_payments to authenticated;
revoke all on sequence public.rental_bookings_booking_number_seq from public, anon, authenticated;

create policy hotels_operator_read on public.hotels for select to authenticated using (
  exists (
    select 1 from public.operator_profiles p
    join public.operator_locations ol on ol.operator_id = p.id
    where p.id = (select auth.uid())
  )
);
create policy rental_bookings_assigned_location_read on public.rental_bookings
  for select to authenticated using (
    exists (
      select 1 from public.operator_locations ol
      where ol.operator_id = (select auth.uid()) and ol.location_id = rental_bookings.location_id
    )
  );
create policy rental_booking_items_assigned_location_read on public.rental_booking_items
  for select to authenticated using (
    exists (select 1 from public.rental_bookings b where b.id = rental_booking_items.booking_id)
  );
create policy rental_payments_assigned_location_read on public.rental_payments
  for select to authenticated using (
    exists (select 1 from public.rental_bookings b where b.id = rental_payments.booking_id)
  );

notify pgrst, 'reload schema';
commit;
