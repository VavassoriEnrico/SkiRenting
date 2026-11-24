-- Carichi multipli noleggio: stesso modello, un codice per esemplare.
-- Eseguire dopo 032. Nessuna scrittura viene fatta fuori dalla transazione.
begin;
create table if not exists public.rental_stock_arrivals (
  id uuid primary key,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 500),
  created_by uuid not null references public.operator_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  request_data jsonb not null,
  units jsonb not null,
  result jsonb not null
);
alter table public.rental_stock_arrivals enable row level security;
grant select on public.rental_stock_arrivals to authenticated;
drop policy if exists rental_stock_arrivals_location_read on public.rental_stock_arrivals;
create policy rental_stock_arrivals_location_read on public.rental_stock_arrivals for select to authenticated
  using(exists(select 1 from public.operator_locations ol where ol.operator_id=(select auth.uid())
    and ol.location_id=rental_stock_arrivals.location_id));

create or replace function public.skirenting_register_rental_arrival(p_location_id uuid,p_request_id uuid,p_data jsonb,p_units jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stored public.rental_stock_arrivals%rowtype; unit jsonb; item jsonb;
  shared jsonb; items jsonb:='[]'::jsonb; result jsonb; quantity integer;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_units) is distinct from 'array' then
    raise exception 'Dati carico mancanti.' using errcode='22023';
  end if;
  quantity:=jsonb_array_length(p_units);
  if quantity not between 1 and 500 then raise exception 'Inserire da 1 a 500 esemplari.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_units) u
    where jsonb_typeof(u) is distinct from 'object' or jsonb_typeof(u->'code') is distinct from 'string'
      or coalesce(length(btrim(u->>'code')),0) not between 1 and 200)
    or quantity<>(select count(distinct lower(btrim(u->>'code'))) from jsonb_array_elements(p_units) u) then
    raise exception 'Inserire un codice diverso e non vuoto per ogni esemplare.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skirenting_create_rental_item',0));
  select * into stored from public.rental_stock_arrivals where id=p_request_id;
  if found then
    if stored.location_id<>p_location_id or stored.request_data<>p_data or stored.units<>p_units then
      raise exception 'Identificativo arrivo già utilizzato con dati diversi.' using errcode='23505';
    end if;
    return stored.result;
  end if;
  shared:=p_data;
  for unit in select value from jsonb_array_elements(p_units) loop
    item:=public.skirenting_create_rental_item(p_location_id,shared||jsonb_build_object(
      'code',btrim(unit->>'code'),'serial_number',nullif(btrim(unit->>'serial_number'),'')));
    items:=items||jsonb_build_array(item);
    -- Le eventuali nuove voci sono create una volta sola e riusate dalle altre unità.
    shared:=(p_data-'new_category'-'new_group'-'new_variant')||jsonb_build_object(
      'category_id',item->'category_id','group_id',item->'group_id','variant_id',item->'variant_id');
  end loop;
  result:=jsonb_build_object('id',p_request_id,'quantity',quantity,'items',items);
  insert into public.rental_stock_arrivals(id,location_id,quantity,created_by,request_data,units,result)
    values(p_request_id,p_location_id,quantity,auth.uid(),p_data,p_units,result);
  return result;
end; $$;
revoke all on function public.skirenting_register_rental_arrival(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.skirenting_register_rental_arrival(uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
