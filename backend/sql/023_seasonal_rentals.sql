-- Noleggi stagionali: eseguire dopo 022. Nessun prezzo o stagione inventati.
begin;
create table if not exists public.rental_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  return_date date not null check (isfinite(return_date)),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists rental_seasons_name_idx on public.rental_seasons(lower(btrim(name)));
create unique index if not exists rental_seasons_current_idx on public.rental_seasons(is_current) where is_current;
create table if not exists public.seasonal_rates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.material_groups(id) on delete restrict,
  single_price numeric(12,2) check (single_price between 0 and 9999999999.99),
  pack_price numeric(12,2) check (pack_price between 0 and 9999999999.99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.seasonal_rates(group_id) select id from public.material_groups on conflict(group_id) do nothing;
create or replace function public.skirenting_seasonal_rate_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.pack_price is not null and not exists (
    select 1 from public.material_groups g join public.material_categories c on c.id=g.category_id
    where g.id=new.group_id and c.detail_type in ('ski','snowboard')
  ) then raise exception 'Il prezzo pack è previsto solo per sci e snowboard.' using errcode='23514'; end if;
  new.updated_at := now(); return new;
end; $$;
drop trigger if exists seasonal_rate_guard on public.seasonal_rates;
create trigger seasonal_rate_guard before insert or update on public.seasonal_rates
  for each row execute function public.skirenting_seasonal_rate_guard();
create or replace function public.skirenting_new_group_seasonal_rate()
returns trigger language plpgsql set search_path='' as $$
begin
  insert into public.seasonal_rates(group_id) values(new.id) on conflict(group_id) do nothing;
  return new;
end; $$;
drop trigger if exists material_groups_create_seasonal_rate on public.material_groups;
create trigger material_groups_create_seasonal_rate after insert on public.material_groups
  for each row execute function public.skirenting_new_group_seasonal_rate();

alter table public.rental_bookings
  add column if not exists rental_kind text not null default 'daily',
  add column if not exists season_id uuid references public.rental_seasons(id) on delete restrict;
alter table public.rental_bookings drop constraint if exists rental_bookings_season_check;
alter table public.rental_bookings add constraint rental_bookings_season_check check (
  (rental_kind='daily' and season_id is null) or (rental_kind='seasonal' and season_id is not null)
);
alter table public.rental_booking_items
  add column if not exists seasonal_pricing text check (seasonal_pricing in ('single','pack','included')),
  add column if not exists seasonal_pack_main_id uuid references public.rental_inventory(id) on delete restrict;
comment on table public.seasonal_rates is 'Prezzi TOTALI per stagionale; null=da configurare, zero=gratuito. Pack: attrezzo, scarponi e bastoncini.';
comment on column public.rental_seasons.return_date is 'Consegna/rientro globale della stagione, proposto a tutti i nuovi stagionali. Le prenotazioni salvate conservano le proprie date.';

alter table public.rental_seasons enable row level security;
alter table public.seasonal_rates enable row level security;
revoke all on public.rental_seasons,public.seasonal_rates from public,anon,authenticated;
grant select on public.rental_seasons,public.seasonal_rates to authenticated;
grant update(single_price,pack_price) on public.seasonal_rates to authenticated;
drop policy if exists rental_seasons_read on public.rental_seasons;
create policy rental_seasons_read on public.rental_seasons for select to authenticated using (
  exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id where p.id=(select auth.uid()))
);
drop policy if exists seasonal_rates_access on public.seasonal_rates;
create policy seasonal_rates_access on public.seasonal_rates for all to authenticated using (
  exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id where p.id=(select auth.uid()))
) with check (
  exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id where p.id=(select auth.uid()))
);

create or replace function public.skirenting_save_rental_season(p_id uuid,p_name text,p_return_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.rental_seasons%rowtype;
begin
  if not exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id where p.id=auth.uid())
    then raise exception 'Operatore non autorizzato.' using errcode='42501'; end if;
  if char_length(btrim(p_name)) not between 1 and 200 or p_name is null or p_return_date is null or not isfinite(p_return_date)
    then raise exception 'Nome stagione e data di consegna richiesti.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skirenting-current-season',0));
  if p_id is not null and not exists(select 1 from public.rental_seasons where id=p_id)
    then raise exception 'Stagione non trovata.' using errcode='P0002'; end if;
  update public.rental_seasons set is_current=false where is_current and id is distinct from p_id;
  if p_id is null then
    insert into public.rental_seasons(name,return_date,is_current) values(btrim(p_name),p_return_date,true) returning * into result;
  else
    update public.rental_seasons set name=btrim(p_name),return_date=p_return_date,is_current=true where id=p_id returning * into result;
  end if;
  return to_jsonb(result);
end; $$;

create or replace function public.skirenting_seasonal_quote(p_location_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  season public.rental_seasons%rowtype;
  date_start date; ids uuid[]; used_ids uuid[] := '{}'; main_ids uuid[] := '{}';
  included jsonb := '{}'::jsonb; bundles jsonb := '[]'::jsonb; main record; boot_id uuid; pole_id uuid;
  entry record; price numeric; pricing text; lines jsonb := '[]'::jsonb; missing jsonb := '[]'::jsonb;
  total numeric := 0;
begin
  if not exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
      where p.id=auth.uid() and ol.location_id=p_location_id)
    then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  select * into season from public.rental_seasons where id=(p_data->>'season_id')::uuid and is_current;
  if not found then raise exception 'Configura o aggiorna la stagione corrente in Gestione.'; end if;
  date_start := (p_data->>'starts_on')::date;
  if date_start is null or not isfinite(date_start) or date_start>season.return_date
    or jsonb_typeof(p_data->'inventory_ids') is distinct from 'array'
    then raise exception 'Date o selezione stagionale non validi.' using errcode='22023'; end if;
  select array_agg(value::uuid order by position) into ids
    from jsonb_array_elements_text(p_data->'inventory_ids') with ordinality as selected(value,position);
  if coalesce(cardinality(ids),0)=0 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x)
    or array_position(ids,null) is not null then raise exception 'Seleziona codici distinti.' using errcode='22023'; end if;
  if (select count(*) from public.rental_inventory where id=any(ids) and location_id=p_location_id)<>cardinality(ids)
    then raise exception 'Uno o più articoli non sono nella sede selezionata.'; end if;
  if exists(select 1 from public.rental_inventory i join public.material_variants v on v.id=i.variant_id
    join public.material_groups g on g.id=i.group_id where i.id=any(ids)
    and (i.status<>'active' or not i.is_rentable or not i.is_bookable or not v.is_active or not g.is_active))
    then raise exception 'Uno o più articoli non sono abilitati al noleggio.'; end if;

  -- Riconoscimento automatico: ogni attrezzo usa i primi scarponi compatibili
  -- nell'ordine di inserimento. I bastoncini sono facoltativi per gli sci.
  for main in
    select i.id,c.detail_type from public.rental_inventory i
      join public.material_variants v on v.id=i.variant_id join public.material_categories c on c.id=v.category_id
      where i.id=any(ids) and c.detail_type in ('ski','snowboard') order by array_position(ids,i.id)
  loop
    select i.id into boot_id from public.rental_inventory i
      join public.material_variants v on v.id=i.variant_id join public.material_categories c on c.id=v.category_id
      where i.id=any(ids) and not (i.id=any(used_ids)) and c.detail_type='boots'
        and not (main.detail_type='ski' and c.code='snowboard_boots')
        and not (main.detail_type='snowboard' and c.code='ski_boots')
      order by array_position(ids,i.id) limit 1;
    if boot_id is null then continue; end if;
    pole_id := null;
    if main.detail_type='ski' then
      select i.id into pole_id from public.rental_inventory i
        join public.material_variants v on v.id=i.variant_id join public.material_categories c on c.id=v.category_id
        where i.id=any(ids) and not (i.id=any(used_ids)) and c.detail_type='poles'
        order by array_position(ids,i.id) limit 1;
    end if;
    used_ids := used_ids || array[main.id,boot_id]; main_ids := main_ids || main.id;
    included := included || jsonb_build_object(boot_id::text,main.id);
    if pole_id is not null then
      used_ids := used_ids || pole_id;
      included := included || jsonb_build_object(pole_id::text,main.id);
    end if;
    bundles := bundles || jsonb_build_array(jsonb_build_object('main_id',main.id,'boot_id',boot_id,'pole_id',pole_id));
  end loop;
  for entry in
    select i.id,i.code,g.name as group_name,v.brand,v.model,r.single_price,r.pack_price,
      coalesce(sd.length_cm::text||' cm',nd.length_cm::text||' cm',bd.size_label,hd.size_label,pd.height_cm::text||' cm',ad.size_label) as size
    from public.rental_inventory i join public.material_variants v on v.id=i.variant_id
    join public.material_groups g on g.id=i.group_id left join public.seasonal_rates r on r.group_id=i.group_id
    left join public.ski_details sd on sd.variant_id=v.id left join public.snowboard_details nd on nd.variant_id=v.id
    left join public.boot_details bd on bd.variant_id=v.id left join public.helmet_details hd on hd.variant_id=v.id
    left join public.pole_details pd on pd.variant_id=v.id left join public.accessory_details ad on ad.variant_id=v.id
    where i.id=any(ids) order by i.id
  loop
    if entry.id=any(main_ids) then pricing:='pack'; price:=entry.pack_price;
    elsif included ? entry.id::text then pricing:='included'; price:=0;
    else pricing:='single'; price:=entry.single_price; end if;
    if price is null then missing:=missing||jsonb_build_array(entry.code); else total:=total+price; end if;
    lines:=lines||jsonb_build_array(jsonb_build_object('inventory_id',entry.id,'code',entry.code,'brand',entry.brand,'model',entry.model,
      'group_name',entry.group_name,'size',entry.size,'daily_price',null,'amount',price,'price_mode',pricing,
      'pack_main_id',case when pricing='pack' then entry.id::text else included->>entry.id::text end));
  end loop;
  return jsonb_build_object('season',to_jsonb(season),'bundles',bundles,
    'starts_on',date_start,'ends_on',season.return_date,'days',season.return_date-date_start+1,'items',lines,
    'hotel',null,'promotion',null,'discount_percent',0,'subtotal',case when jsonb_array_length(missing)=0 then total end,
    'discount_amount',case when jsonb_array_length(missing)=0 then 0 end,'total',case when jsonb_array_length(missing)=0 then total end,
    'missing_rate_codes',missing);
end; $$;

create or replace function public.skirenting_confirm_seasonal_rental(p_location_id uuid,p_booking_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  booking public.rental_bookings%rowtype;
  ids uuid[]; date_start date; date_end date; days integer; locked_count integer;
  customer_id uuid; discount numeric := 0; subtotal numeric := 0; total numeric; paid numeric := 0;
  payment jsonb; method text; paid_time timestamptz; expected numeric; booking_notes text; quote jsonb;
begin
  if p_booking_id is null or p_location_id is null or p_data is null
     or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Richiesta incompleta.' using errcode = '22023';
  end if;
  booking_notes := nullif(btrim(p_data->>'notes'),'');
  if length(booking_notes) > 5000 or (p_data ? 'notes'
     and jsonb_typeof(p_data->'notes') not in ('string','null')) then
    raise exception 'Note prenotazione non valide.' using errcode = '22023';
  end if;
  perform 1 from public.operator_profiles where id = auth.uid() for key share;
  if not found then raise exception 'Operatore non autorizzato.' using errcode = '42501'; end if;
  perform 1 from public.operator_locations
    where operator_id = auth.uid() and location_id = p_location_id for key share;
  if not found then raise exception 'Sede non autorizzata.' using errcode = '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_booking_id::text, 0));
  select * into booking from public.rental_bookings where id = p_booking_id;
  if found then
    if booking.created_by <> auth.uid() or booking.location_id <> p_location_id or booking.rental_kind <> 'seasonal' then
      raise exception 'Richiesta non autorizzata.' using errcode = '42501';
    end if;
    if booking.confirmation_hash is distinct from pg_catalog.md5(p_data::text) then
      raise exception 'Il noleggio % è già confermato con dati diversi. Verifica prima di riprovare.', booking.booking_number;
    end if;
  else
    date_start := (p_data->>'starts_on')::date;
    select return_date into date_end from public.rental_seasons where id=(p_data->>'season_id')::uuid and is_current for share;
    if date_end is distinct from (p_data->>'expected_return_date')::date then raise exception 'La data globale è cambiata. Aggiorna lo stagionale.'; end if;
    customer_id := (p_data->>'customer_id')::uuid;
    expected := (p_data->>'expected_total')::numeric;
    if date_start is null or date_end is null or not isfinite(date_start)
       or not isfinite(date_end) or date_end < date_start or customer_id is null
       or expected is null or not (expected >= 0 and expected < 'Infinity'::numeric)
       or jsonb_typeof(p_data->'inventory_ids') is distinct from 'array' then
      raise exception 'Date, cliente, materiale o importo non validi.' using errcode = '22023';
    end if;
    days := date_end - date_start + 1;
    select array_agg(value::uuid order by value::uuid) into ids
      from jsonb_array_elements_text(p_data->'inventory_ids');
    if coalesce(cardinality(ids),0) = 0
       or cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
      raise exception 'Selezione materiale vuota o duplicata.' using errcode = '22023';
    end if;

    -- Stesso lock del trasferimento: serializza assegnazioni concorrenti.
    perform id from public.rental_inventory
      where id = any(ids) and location_id = p_location_id order by id for update;
    get diagnostics locked_count = row_count;
    if locked_count <> cardinality(ids) then
      raise exception 'Uno o più articoli non sono più nella sede selezionata.';
    end if;
    perform 1 from public.rental_inventory i
      join public.material_groups g on g.id = i.group_id
      join public.material_variants v on v.id = i.variant_id
      where i.id = any(ids) for share of g,v;
    if exists (select 1 from public.rental_inventory i
      join public.material_groups g on g.id = i.group_id
      join public.material_variants v on v.id = i.variant_id
      where i.id = any(ids) and (i.status <> 'active' or not i.is_rentable
        or not i.is_bookable or not g.is_active or not v.is_active)) then
      raise exception 'Uno o più articoli non sono abilitati al noleggio.';
    end if;
    if exists (
      select 1 from public.rental_booking_items i
      join public.rental_bookings b on b.id = i.booking_id
      where i.rental_inventory_id = any(ids) and i.returned_at is null and (
        i.delivered_at is not null or b.status = 'active'
        or (b.status in ('confirmed','preparing') and b.starts_on <= date_end and b.ends_on >= date_start)
      )
    ) then raise exception 'Uno o più articoli sono già assegnati nel periodo scelto o non sono ancora rientrati.'; end if;

    perform r.id from public.seasonal_rates r where r.group_id in (
      select i.group_id from public.rental_inventory i where i.id=any(ids)
    ) order by r.group_id for share;
    quote:=public.skirenting_seasonal_quote(p_location_id,p_data);
    if jsonb_array_length(quote->'missing_rate_codes')>0 then raise exception 'Completa le tariffe stagionali prima di confermare.'; end if;
    total:=(quote->>'total')::numeric;
    if expected<>total then raise exception 'Listino stagionale cambiato. Aggiorna i prezzi prima di confermare.'; end if;
    payment := p_data->'payment';
    if payment is not null and payment <> 'null'::jsonb then
      if jsonb_typeof(payment) <> 'object' then raise exception 'Pagamento non valido.' using errcode = '22023'; end if;
      paid := (payment->>'amount')::numeric; method := btrim(payment->>'payment_method');
      paid_time := (payment->>'paid_at')::timestamptz;
      if paid is null or not (paid > 0 and paid <= total and paid <= 9999999999.99)
         or coalesce(length(method),0) not between 1 and 200 or paid_time is null
         or not isfinite(paid_time) or (payment->>'paid_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
        raise exception 'Importo, metodo o data del pagamento non validi.' using errcode = '22023';
      end if;
    end if;

    insert into public.rental_bookings(id,customer_id,location_id,starts_on,ends_on,discount_percent,created_by,confirmation_hash,notes,rental_kind,season_id)
      values(p_booking_id,customer_id,p_location_id,date_start,date_end,0,auth.uid(),pg_catalog.md5(p_data::text),booking_notes,'seasonal',(p_data->>'season_id')::uuid);
    insert into public.rental_booking_items(booking_id,rental_inventory_id,code_snapshot,brand_snapshot,model_snapshot,size_snapshot,daily_price,amount,seasonal_pricing,seasonal_pack_main_id)
      select p_booking_id,(x->>'inventory_id')::uuid,x->>'code',x->>'brand',x->>'model',x->>'size',null,(x->>'amount')::numeric,x->>'price_mode',(x->>'pack_main_id')::uuid
      from jsonb_array_elements(quote->'items') x;
    if payment is not null and payment<>'null'::jsonb then
      insert into public.rental_payments(booking_id,payment_method,amount,paid_at,created_by,notes)
        values(p_booking_id,method,paid,paid_time,auth.uid(),nullif(payment->>'notes',''));
    end if;
  end if;

  select * into booking from public.rental_bookings where id = p_booking_id;
  select coalesce(sum(amount),0) into subtotal from public.rental_booking_items where booking_id = p_booking_id;
  select coalesce(sum(amount),0) into paid from public.rental_payments where booking_id = p_booking_id;
  total := round(subtotal*(100-booking.discount_percent)/100,2);
  return jsonb_build_object('id',booking.id,'booking_number',booking.booking_number,
    'starts_on',booking.starts_on,'ends_on',booking.ends_on,'status',booking.status,
    'total',total,'paid_amount',paid,'balance',total-paid,'notes',booking.notes,'rental_kind',booking.rental_kind);
end;
$$;
revoke all on function public.skirenting_confirm_seasonal_rental(uuid,uuid,jsonb) from public, anon;
grant execute on function public.skirenting_confirm_seasonal_rental(uuid,uuid,jsonb) to authenticated;
revoke all on function public.skirenting_save_rental_season(uuid,text,date) from public,anon;
grant execute on function public.skirenting_save_rental_season(uuid,text,date) to authenticated;
revoke all on function public.skirenting_seasonal_quote(uuid,jsonb) from public,anon;
grant execute on function public.skirenting_seasonal_quote(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
