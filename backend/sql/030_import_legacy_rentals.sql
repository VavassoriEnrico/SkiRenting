-- Dopo 029. Importa lo storico nelle tabelle noleggio ESISTENTI.
-- Nessun caricamento dati viene eseguito da questa migrazione.
begin;
create table if not exists public.rental_import_batches (
  id uuid primary key, source_filename text not null, source_sha256 text not null unique,
  source_headers jsonb not null, expected_rows integer not null check(expected_rows>0),
  expected_bookings integer not null check(expected_bookings>0),
  location_id uuid not null references public.locations(id),
  created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.rental_bookings
  add column if not exists is_legacy boolean not null default false,
  add column if not exists legacy_ready boolean not null default false,
  add column if not exists legacy_batch_id uuid references public.rental_import_batches(id),
  add column if not exists legacy_code text,
  add column if not exists legacy_customer_id text,
  add column if not exists legacy_customer_snapshot jsonb,
  add column if not exists legacy_paid_in_full boolean not null default false,
  add column if not exists legacy_reported_paid_amount numeric(18,2);
alter table public.rental_bookings alter column customer_id drop not null, alter column created_by drop not null;
alter table public.rental_bookings drop constraint if exists rental_bookings_status_check;
alter table public.rental_bookings drop constraint if exists rental_bookings_legacy_status;
alter table public.rental_bookings add constraint rental_bookings_legacy_status check(
  (not is_legacy and status in ('confirmed','preparing','active','completed','cancelled') and customer_id is not null and created_by is not null)
  or (is_legacy and status='imported' and legacy_batch_id is not null and legacy_code is not null
      and legacy_customer_id is not null and jsonb_typeof(legacy_customer_snapshot)='object' and legacy_reported_paid_amount is not null)
);
do $$
declare item record;
begin
  for item in select conname from pg_catalog.pg_constraint where conrelid='public.rental_bookings'::regclass
    and contype='c' and pg_catalog.pg_get_constraintdef(oid) like '%rental_kind%'
  loop execute format('alter table public.rental_bookings drop constraint %I',item.conname); end loop;
end; $$;
alter table public.rental_bookings add constraint rental_bookings_legacy_kind check(
  (not is_legacy and ((rental_kind='daily' and season_id is null) or (rental_kind='seasonal' and season_id is not null)))
  or (is_legacy and rental_kind='legacy' and season_id is null)
);
alter table public.rental_booking_items
  add column if not exists is_legacy boolean not null default false,
  add column if not exists legacy_reported_paid_amount numeric(18,2),
  add column if not exists legacy_returned_on date;
alter table public.rental_booking_items alter column rental_inventory_id drop not null, alter column amount drop not null,
  alter column brand_snapshot drop not null, alter column model_snapshot drop not null;
alter table public.rental_booking_items drop constraint if exists rental_booking_items_legacy_required;
alter table public.rental_booking_items add constraint rental_booking_items_legacy_required check(
  (is_legacy and legacy_reported_paid_amount is not null) or (not is_legacy and rental_inventory_id is not null and amount is not null)
);
alter table public.rental_booking_items drop constraint if exists rental_booking_items_brand_snapshot_check;
alter table public.rental_booking_items drop constraint if exists rental_booking_items_model_snapshot_check;
alter table public.rental_booking_items drop constraint if exists rental_booking_items_legacy_names;
alter table public.rental_booking_items add constraint rental_booking_items_legacy_names check(
  is_legacy or (brand_snapshot is not null and model_snapshot is not null and btrim(brand_snapshot)<>'' and btrim(model_snapshot)<>'')
);
drop index if exists public.rental_booking_items_physical_unique;
create unique index rental_booking_items_physical_unique on public.rental_booking_items(booking_id,rental_inventory_id)
  where not is_generic and not is_legacy;
create index if not exists rental_bookings_import_batch_idx on public.rental_bookings(legacy_batch_id);

create table if not exists public.rental_import_rows (
  batch_id uuid not null references public.rental_import_batches(id), source_row integer not null,
  booking_id uuid not null references public.rental_bookings(id),
  item_id uuid not null references public.rental_booking_items(id), raw_data jsonb not null,
  primary key(batch_id,source_row)
);
alter table public.rental_import_batches enable row level security;
alter table public.rental_import_rows enable row level security;
revoke all on public.rental_import_batches,public.rental_import_rows from public,anon,authenticated;
drop policy if exists rental_bookings_import_ready on public.rental_bookings;
create policy rental_bookings_import_ready on public.rental_bookings as restrictive for select to authenticated
  using(not is_legacy or legacy_ready);

create or replace function public.skirenting_legacy_booking_context()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_legacy then
    select location_id into new.location_id from public.rental_import_batches where id=new.legacy_batch_id;
    if not found then raise exception 'Importazione non inizializzata.'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists rental_bookings_legacy_context on public.rental_bookings;
create trigger rental_bookings_legacy_context before insert or update on public.rental_bookings
  for each row execute function public.skirenting_legacy_booking_context();

create or replace function public.skirenting_check_booking_customer()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  if new.is_legacy then return new; end if;
  if tg_op='UPDATE' and old.customer_id=new.customer_id then return new; end if;
  select deleted_at into removed from public.customers where id=new.customer_id for share;
  if not found or removed is not null then raise exception 'Cliente non più disponibile. Aggiorna l’anagrafica.'; end if;
  return new;
end; $$;

create or replace function public.skirenting_booking_item_generic_flag()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select is_legacy into new.is_legacy from public.rental_bookings where id=new.booking_id;
  if not found then raise exception 'Prenotazione inesistente.' using errcode='23503'; end if;
  if new.is_legacy then new.is_generic:=false; return new; end if;
  select is_generic into new.is_generic from public.rental_inventory where id=new.rental_inventory_id;
  if not found then raise exception 'Articolo inesistente.' using errcode='23503'; end if;
  return new;
end; $$;

create or replace function public.skirenting_check_booking_item_repair()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_legacy then return new; end if;
  perform id from public.rental_inventory where id=new.rental_inventory_id for update;
  if exists(select 1 from public.material_repairs where rental_inventory_id=new.rental_inventory_id and status='in_progress') then
    raise exception 'Articolo in riparazione. Rimuovilo e aggiungilo nuovamente confermando il completamento.';
  end if;
  return new;
end; $$;

create or replace function public.skirenting_check_visible_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz; historical boolean;
begin
  select deleted_at,is_legacy into removed,historical from public.rental_bookings where id=new.booking_id for share;
  if removed is not null then raise exception 'La prenotazione è stata eliminata. Aggiorna l’elenco.'; end if;
  if historical and tg_table_name='rental_payments' then raise exception 'I movimenti del CSV storico non sono nuovi incassi.'; end if;
  return new;
end; $$;

create or replace function public.skirenting_finalize_rental_import(p_batch_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare batch public.rental_import_batches%rowtype; item_count integer; booking_count integer; raw_count integer;
begin
  select * into batch from public.rental_import_batches where id=p_batch_id for update;
  if not found then raise exception 'Importazione non inizializzata.'; end if;
  select count(*) into booking_count from public.rental_bookings where legacy_batch_id=p_batch_id;
  select count(*) into item_count from public.rental_booking_items i join public.rental_bookings b on b.id=i.booking_id where b.legacy_batch_id=p_batch_id;
  select count(*) into raw_count from public.rental_import_rows where batch_id=p_batch_id;
  if booking_count<>batch.expected_bookings or item_count<>batch.expected_rows or raw_count<>batch.expected_rows then
    raise exception 'Importazione incompleta: prenotazioni %, articoli %, originali %.',booking_count,item_count,raw_count;
  end if;
  if exists(select 1 from public.rental_import_rows r join public.rental_booking_items i on i.id=r.item_id
    join public.rental_bookings b on b.id=r.booking_id where r.batch_id=p_batch_id and (
      b.legacy_batch_id<>r.batch_id or i.booking_id<>r.booking_id or not b.is_legacy or not i.is_legacy
      or i.code_snapshot is distinct from r.raw_data->>'barcode'
      or i.legacy_reported_paid_amount is distinct from replace(replace(r.raw_data->>'totale_pagato','.',''),',','.')::numeric)) then
    raise exception 'Collegamento delle righe originali non valido.';
  end if;
  with matches as (
    select b.id,array_agg(distinct c.customer_id) ids from public.rental_bookings b join public.customer_import_rows c
      on coalesce(c.raw_data->>'cognome','')=coalesce(b.legacy_customer_snapshot->>'cognome','')
      and coalesce(c.raw_data->>'nome','')=coalesce(b.legacy_customer_snapshot->>'nome','')
      and coalesce(c.raw_data->>'email','')=coalesce(b.legacy_customer_snapshot->>'email','')
      and coalesce(c.raw_data->>'telefono','')=coalesce(b.legacy_customer_snapshot->>'telefono','')
      and coalesce(c.raw_data->>'data_nascita','')=coalesce(b.legacy_customer_snapshot->>'data_nascita','')
      and coalesce(c.raw_data->>'lingua','')=coalesce(b.legacy_customer_snapshot->>'lingua','')
      and coalesce(c.raw_data->>'stato','')=coalesce(b.legacy_customer_snapshot->>'stato','')
    where b.legacy_batch_id=p_batch_id and b.customer_id is null group by b.id
  ) update public.rental_bookings b set customer_id=m.ids[1] from matches m where b.id=m.id and cardinality(m.ids)=1;
  update public.rental_bookings set legacy_ready=true where legacy_batch_id=p_batch_id and not legacy_ready;
  update public.rental_import_batches set completed_at=coalesce(completed_at,statement_timestamp()) where id=p_batch_id;
  return jsonb_build_object('bookings',booking_count,'items',item_count,'original_rows',raw_count,
    'bookings_without_customer_link',(select count(*) from public.rental_bookings where legacy_batch_id=p_batch_id and customer_id is null));
end; $$;
revoke all on function public.skirenting_finalize_rental_import(uuid) from public,anon,authenticated;
comment on column public.rental_bookings.is_legacy is 'Storico CSV: importi originali e politica di saldo indicata in legacy_paid_in_full. Non occupa materiale attuale.';
comment on table public.rental_import_rows is 'Provenienza amministrativa, senza duplicare le prenotazioni in un archivio operativo parallelo.';
notify pgrst,'reload schema';
commit;
