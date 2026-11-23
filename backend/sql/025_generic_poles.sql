-- Eseguire dopo 024. Codice generico 1 condiviso tra sedi e noleggi.
-- Le prenotazioni già salvate non vengono ricalcolate.
begin;

alter table public.rental_inventory add column if not exists is_generic boolean not null default false;
alter table public.rental_inventory alter column location_id drop not null;
alter table public.rental_inventory drop constraint if exists rental_inventory_generic_location;
alter table public.rental_inventory add constraint rental_inventory_generic_location
  check ((is_generic and location_id is null and code='1') or (not is_generic and location_id is not null));

create or replace function public.skirenting_check_generic_material()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.is_generic and not exists (
    select 1 from public.material_variants v join public.material_categories c on c.id=v.category_id
    where v.id=new.variant_id and c.code='poles'
  ) then raise exception 'Il codice generico 1 è riservato ai bastoncini.' using errcode='23514'; end if;
  if new.code='1' and not new.is_generic then
    raise exception 'Il codice 1 è riservato ai bastoncini generici.' using errcode='23514';
  end if;
  return new;
end; $$;
drop trigger if exists rental_inventory_generic_guard on public.rental_inventory;
create trigger rental_inventory_generic_guard before insert or update on public.rental_inventory
  for each row execute function public.skirenting_check_generic_material();

drop policy if exists rental_inventory_generic_read on public.rental_inventory;
create policy rental_inventory_generic_read on public.rental_inventory for select to authenticated using (
  is_generic and exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=(select auth.uid()))
);

do $$
declare pole_category uuid; pole_group uuid; pole_variant uuid;
begin
  if exists(select 1 from public.rental_inventory where code='1' and not is_generic) then
    raise exception 'Il codice 1 è già assegnato a un esemplare. Rinominarne il codice prima di eseguire 025.';
  end if;
  if exists(select 1 from public.rental_inventory where is_generic and code='1') then return; end if;
  select id into pole_category from public.material_categories where code='poles';
  if pole_category is null then raise exception 'Categoria bastoncini mancante: eseguire 002.'; end if;
  insert into public.material_groups(category_id,name) values(pole_category,'Bastoncini generici')
    on conflict (category_id,name) do update set name=excluded.name returning id into pole_group;
  insert into public.material_variants(category_id,brand,model) values(pole_category,'Generico','Bastoncini') returning id into pole_variant;
  insert into public.pole_details(variant_id) values(pole_variant);
  insert into public.rental_inventory(variant_id,group_id,location_id,code,is_generic)
    values(pole_variant,pole_group,null,'1',true);
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
  if (select count(*) from public.rental_inventory where id=any(ids) and (location_id=p_location_id or is_generic))<>cardinality(ids)
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
    pole_id := null;
    if main.detail_type='ski' then
      select i.id into pole_id from public.rental_inventory i
        join public.material_variants v on v.id=i.variant_id join public.material_categories c on c.id=v.category_id
        where i.id=any(ids) and not (i.id=any(used_ids)) and c.detail_type='poles'
        order by array_position(ids,i.id) limit 1;
    end if;
    if boot_id is null and pole_id is null then continue; end if;
    used_ids := used_ids || main.id;
    if boot_id is not null then
      used_ids := used_ids || boot_id; main_ids := main_ids || main.id;
      included := included || jsonb_build_object(boot_id::text,main.id);
    end if;
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
      'pack_main_id',case when pricing='pack' or entry.id::text in (select value from jsonb_each_text(included)) then entry.id::text else included->>entry.id::text end));
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
      where id = any(ids) and (location_id = p_location_id or is_generic) order by id for update;
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
      join public.rental_inventory physical on physical.id=i.rental_inventory_id
      where i.rental_inventory_id = any(ids) and not physical.is_generic and i.returned_at is null and (
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

create or replace function public.skirenting_confirm_rental_booking(
  p_location_id uuid, p_booking_id uuid, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  booking public.rental_bookings%rowtype;
  ids uuid[]; date_start date; date_end date; days integer; locked_count integer;
  hotel_id uuid; customer_id uuid; discount numeric := 0;
  subtotal numeric := 0; total numeric; paid numeric := 0;
  price numeric; line_total numeric; entry record; lines jsonb := '[]'::jsonb;
  payment jsonb; method text; paid_time timestamptz; expected numeric;
  booking_notes text; ski_id uuid; has_poles boolean;
  selected_promotion_id uuid; selected_promotion_name text; promotion_percent numeric;
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
    if booking.created_by <> auth.uid() or booking.location_id <> p_location_id then
      raise exception 'Richiesta non autorizzata.' using errcode = '42501';
    end if;
    if booking.confirmation_hash is distinct from pg_catalog.md5(p_data::text) then
      raise exception 'Il noleggio % è già confermato con dati diversi. Verifica prima di riprovare.', booking.booking_number;
    end if;
  else
    date_start := (p_data->>'starts_on')::date; date_end := (p_data->>'ends_on')::date;
    customer_id := (p_data->>'customer_id')::uuid; hotel_id := (p_data->>'hotel_id')::uuid;
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
      where id = any(ids) and (location_id = p_location_id or is_generic) order by id for update;
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
      join public.rental_inventory physical on physical.id=i.rental_inventory_id
      where i.rental_inventory_id = any(ids) and not physical.is_generic and i.returned_at is null and (
        i.delivered_at is not null or b.status = 'active'
        or (b.status in ('confirmed','preparing') and b.starts_on <= date_end and b.ends_on >= date_start)
      )
    ) then raise exception 'Uno o più articoli sono già assegnati nel periodo scelto o non sono ancora rientrati.'; end if;

    if hotel_id is not null then
      select h.discount into discount from public.hotels h where h.id = hotel_id and h.is_active for share;
      if not found then raise exception 'Albergo non più attivo. Aggiorna la selezione.'; end if;
    end if;
    -- Le promozioni sono valide solo per un noleggio di una giornata.
    -- Non si sommano tra loro né allo sconto albergo. In caso di parità vince l'albergo.
    if days = 1 then
      select p.id, p.name, p.discount_percent
        into selected_promotion_id, selected_promotion_name, promotion_percent
      from public.promotions p
      where p.is_active and p.discount_percent > discount
        and (p.promotion_date = date_start
          or (p.starts_on is not null and date_start between p.starts_on and p.ends_on)
          or (p.promotion_date is null
          and extract(isodow from date_start)::smallint = any(p.weekdays)))
      order by p.discount_percent desc, p.id limit 1 for share;
      if found then discount := promotion_percent; end if;
    end if;
    select i.id into ski_id from jsonb_array_elements_text(p_data->'inventory_ids') with ordinality selected(value,position)
      join public.rental_inventory i on i.id=value::uuid join public.material_variants v on v.id=i.variant_id
      join public.material_categories c on c.id=v.category_id where c.code='ski' order by position limit 1;
    select exists(select 1 from public.rental_inventory i join public.material_variants v on v.id=i.variant_id
      join public.material_categories c on c.id=v.category_id where i.id=any(ids) and c.code='poles') into has_poles;
    perform r.id from public.rental_rates r where r.group_id in (
      select i.group_id from public.rental_inventory i where i.id = any(ids)
    ) order by r.group_id for share;
    for entry in
      select i.id, i.code, i.group_id, v.brand, v.model, c.code as category_code,
        coalesce(sd.length_cm::text || ' cm', nd.length_cm::text || ' cm', bd.size_label,
          hd.size_label, pd.height_cm::text || ' cm', ad.size_label) as size_label,
        case when days = 1 then r.daily_price_1_day when days = 2 then r.daily_price_2_days
          when days = 3 then r.daily_price_3_days when days = 4 then r.daily_price_4_days
          when days = 5 then r.daily_price_5_days when days = 6 then r.daily_price_6_days
          else r.daily_price_7_plus_days end as rate
      from public.rental_inventory i join public.material_variants v on v.id = i.variant_id
      join public.material_categories c on c.id=v.category_id
      left join public.rental_rates r on r.group_id = i.group_id
      left join public.ski_details sd on sd.variant_id = v.id
      left join public.snowboard_details nd on nd.variant_id = v.id
      left join public.boot_details bd on bd.variant_id = v.id
      left join public.helmet_details hd on hd.variant_id = v.id
      left join public.pole_details pd on pd.variant_id = v.id
      left join public.accessory_details ad on ad.variant_id = v.id
      where i.id = any(ids) order by i.id
    loop
      price := case when ski_id is not null and entry.category_code='poles' then 0 else entry.rate end;
      if price is null then raise exception 'Tariffa non configurata per l’articolo %.', entry.code; end if;
      line_total := price * days; subtotal := subtotal + line_total;
      lines := lines || jsonb_build_array(jsonb_build_object('id',entry.id,'code',entry.code,
        'brand',entry.brand,'model',entry.model,'size',entry.size_label,'price',price,'amount',line_total,
        'pricing',case when ski_id is not null and entry.category_code='poles' then 'included' else 'single' end,
        'pack_main_id',case when ski_id is not null and (entry.category_code='poles' or (has_poles and entry.id=ski_id)) then ski_id end));
    end loop;
    total := round(subtotal * (100-discount)/100, 2);
    if expected <> total then raise exception 'Listino o sconto cambiati. Aggiorna i prezzi prima di confermare.'; end if;

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

    insert into public.rental_bookings(id,customer_id,location_id,starts_on,ends_on,
      hotel_id,discount_percent,promotion_id,promotion_name,created_by,confirmation_hash,notes)
      values(p_booking_id,customer_id,p_location_id,date_start,date_end,hotel_id,discount,selected_promotion_id,selected_promotion_name,
        auth.uid(),pg_catalog.md5(p_data::text),booking_notes);
    insert into public.rental_booking_items(booking_id,rental_inventory_id,code_snapshot,
      brand_snapshot,model_snapshot,size_snapshot,daily_price,amount,seasonal_pricing,seasonal_pack_main_id)
      select p_booking_id,(x->>'id')::uuid,x->>'code',x->>'brand',x->>'model',x->>'size',
        (x->>'price')::numeric,(x->>'amount')::numeric,x->>'pricing',(x->>'pack_main_id')::uuid from jsonb_array_elements(lines) x;
    if payment is not null and payment <> 'null'::jsonb then
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
    'total',total,'paid_amount',paid,'balance',total-paid,'notes',booking.notes);
end;
$$;


-- Il codice condiviso non identifica una prenotazione: per il rientro serve il suo ID.
create or replace function public.skirenting_register_generic_return(
  p_location_id uuid, p_request_id uuid, p_code text, p_booking_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  previous public.rental_return_requests%rowtype;
  booking public.rental_bookings%rowtype;
  item public.rental_booking_items%rowtype;
  subtotal numeric; paid numeric; total numeric;
  returned_time timestamptz := statement_timestamp();
begin
  if p_location_id is null or p_request_id is null or p_code is distinct from '1' then
    raise exception 'Richiesta di rientro non valida.' using errcode='22023'; end if;
  if not exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
      where p.id=auth.uid() and ol.location_id=p_location_id) then
    raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  if p_booking_id is null then
    raise exception 'Per il codice 1 apri la scheda del noleggio e registra il rientro dei bastoncini.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into previous from public.rental_return_requests where id=p_request_id;
  if found then
    if previous.location_id<>p_location_id or previous.operator_id<>auth.uid() or previous.code<>p_code
       or previous.booking_id<>p_booking_id then raise exception 'Richiesta già usata con dati diversi.'; end if;
    return jsonb_build_object('booking_id',previous.booking_id);
  end if;
  select * into booking from public.rental_bookings where id=p_booking_id and location_id=p_location_id for update;
  if not found then raise exception 'Noleggio non trovato in questa sede.' using errcode='P0002'; end if;
  if booking.status not in ('confirmed','preparing','active') or booking.starts_on>(returned_time at time zone 'Europe/Rome')::date then
    raise exception 'Il noleggio non è aperto o non è ancora iniziato.'; end if;
  select bi.* into item from public.rental_booking_items bi join public.rental_inventory i on i.id=bi.rental_inventory_id
    where bi.booking_id=p_booking_id and i.is_generic and i.code=p_code and bi.returned_at is null for update of bi;
  if not found then raise exception 'Bastoncini non presenti nel noleggio o già rientrati.'; end if;
  if item.delivered_at>returned_time then raise exception 'Consegna successiva al rientro.' using errcode='22023'; end if;
  update public.rental_booking_items set returned_at=returned_time,returned_by=auth.uid() where id=item.id;
  select coalesce(sum(amount),0) into subtotal from public.rental_booking_items where booking_id=p_booking_id;
  select coalesce(sum(amount),0) into paid from public.rental_payments where booking_id=p_booking_id;
  total:=round(subtotal*(100-booking.discount_percent)/100,2);
  update public.rental_bookings set status=case when not exists(
      select 1 from public.rental_booking_items where booking_id=p_booking_id and returned_at is null)
      and paid>=total then 'completed' else 'active' end where id=p_booking_id;
  insert into public.rental_return_requests(id,location_id,code,booking_id,item_id,operator_id)
    values(p_request_id,p_location_id,p_code,p_booking_id,item.id,auth.uid());
  return jsonb_build_object('booking_id',p_booking_id);
end; $$;
revoke all on function public.skirenting_register_generic_return(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.skirenting_register_generic_return(uuid,uuid,text,uuid) to authenticated;
revoke all on function public.skirenting_seasonal_quote(uuid,jsonb) from public,anon;
grant execute on function public.skirenting_seasonal_quote(uuid,jsonb) to authenticated;
revoke all on function public.skirenting_confirm_seasonal_rental(uuid,uuid,jsonb) from public,anon;
grant execute on function public.skirenting_confirm_seasonal_rental(uuid,uuid,jsonb) to authenticated;
revoke all on function public.skirenting_confirm_rental_booking(uuid,uuid,jsonb) from public,anon;
grant execute on function public.skirenting_confirm_rental_booking(uuid,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
