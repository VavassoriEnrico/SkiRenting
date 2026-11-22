-- Eseguire tutto dopo 012. Registrazione atomica per codice, senza incassi automatici.
begin;

-- La consegna separata non è ancora implementata: non inventare una data di consegna
-- quando si registra un rientro. Se presente, la consegna deve precedere il rientro.
do $$
declare c record;
begin
  for c in select conname from pg_catalog.pg_constraint
    where conrelid = 'public.rental_booking_items'::regclass and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%returned_at%'
      and pg_catalog.pg_get_constraintdef(oid) like '%delivered_at%'
  loop
    execute format('alter table public.rental_booking_items drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.rental_booking_items add constraint rental_items_return_chronology
  check (returned_at is null or delivered_at is null or returned_at >= delivered_at);
alter table public.rental_booking_items add column if not exists returned_by uuid
  references public.operator_profiles(id) on delete restrict;

create table if not exists public.rental_return_requests (
  id uuid primary key,
  location_id uuid not null references public.locations(id),
  code text not null,
  booking_id uuid not null references public.rental_bookings(id),
  item_id uuid not null references public.rental_booking_items(id),
  operator_id uuid not null references public.operator_profiles(id),
  created_at timestamptz not null default now()
);
alter table public.rental_return_requests enable row level security;
revoke all on public.rental_return_requests from public, anon, authenticated;

create or replace function public.skirenting_register_rental_return(
  p_location_id uuid, p_request_id uuid, p_code text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  previous public.rental_return_requests%rowtype;
  inventory_id uuid; booking_id uuid; item_id uuid; matches integer;
  booking public.rental_bookings%rowtype;
  subtotal numeric; paid numeric; total numeric;
  today date := (statement_timestamp() at time zone 'Europe/Rome')::date;
  returned_time timestamptz := statement_timestamp();
begin
  p_code := btrim(p_code);
  if p_location_id is null or p_request_id is null or p_code is null
     or p_code = '' or length(p_code) > 200 then
    raise exception 'Codice o richiesta non validi.' using errcode = '22023';
  end if;
  perform 1 from public.operator_profiles where id = auth.uid() for key share;
  if not found then raise exception 'Operatore non autorizzato.' using errcode = '42501'; end if;
  perform 1 from public.operator_locations
    where operator_id = auth.uid() and location_id = p_location_id for key share;
  if not found then raise exception 'Sede non autorizzata.' using errcode = '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into previous from public.rental_return_requests where id = p_request_id;
  if found then
    if previous.location_id <> p_location_id or previous.operator_id <> auth.uid() or previous.code <> p_code then
      raise exception 'Richiesta di rientro già usata con dati diversi.' using errcode = 'P0001';
    end if;
    return jsonb_build_object('booking_id', previous.booking_id);
  end if;

  -- Stesso ordine di lock di conferma e trasferimento: prima l'esemplare.
  select id into inventory_id from public.rental_inventory
    where location_id = p_location_id and code = p_code for update;
  if not found then raise exception 'Codice non trovato in questa sede.' using errcode = 'P0002'; end if;

  select count(*), (array_agg(i.booking_id))[1] into matches, booking_id
    from public.rental_booking_items i join public.rental_bookings b on b.id = i.booking_id
    where i.rental_inventory_id = inventory_id and i.returned_at is null
      and b.location_id = p_location_id and b.status in ('confirmed','preparing','active')
      and b.starts_on <= today;
  if matches = 0 then
    raise exception 'Nessun noleggio aperto per questo codice: già rientrato o non ancora in corso.' using errcode = 'P0001';
  end if;
  if matches > 1 then
    raise exception 'Codice assegnato a più noleggi aperti: verificare le prenotazioni.' using errcode = 'P0001';
  end if;

  select * into booking from public.rental_bookings where id = booking_id for update;
  select id into item_id from public.rental_booking_items
    where rental_inventory_id = inventory_id and rental_booking_items.booking_id = booking_id
      and returned_at is null for update;
  if not found or booking.status not in ('confirmed','preparing','active') then
    raise exception 'Noleggio aggiornato da un altro operatore. Aggiorna la pagina.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rental_booking_items
      where id = item_id and delivered_at > returned_time) then
    raise exception 'La data di consegna è successiva al rientro.' using errcode = '22023';
  end if;
  update public.rental_booking_items set returned_at = returned_time, returned_by = auth.uid() where id = item_id;
  select coalesce(sum(amount),0) into subtotal from public.rental_booking_items where rental_booking_items.booking_id = booking_id;
  select coalesce(sum(amount),0) into paid from public.rental_payments where rental_payments.booking_id = booking_id;
  total := round(subtotal*(100-booking.discount_percent)/100,2);
  update public.rental_bookings set status = case
    when not exists (select 1 from public.rental_booking_items
      where rental_booking_items.booking_id = booking_id and returned_at is null) and paid >= total
      then 'completed' else 'active' end where id = booking_id;
  insert into public.rental_return_requests(id,location_id,code,booking_id,item_id,operator_id)
    values(p_request_id,p_location_id,p_code,booking_id,item_id,auth.uid());
  return jsonb_build_object('booking_id', booking_id);
end;
$$;
revoke all on function public.skirenting_register_rental_return(uuid,uuid,text) from public, anon;
grant execute on function public.skirenting_register_rental_return(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
