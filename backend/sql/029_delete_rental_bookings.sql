-- Eseguire dopo 028. Rimozione logica dei noleggi attuali e storici.
begin;
alter table public.rental_bookings
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.operator_profiles(id) on delete restrict;
comment on column public.rental_bookings.deleted_at is
  'Prenotazione rimossa dagli elenchi. Righe materiale, rientri e pagamenti conservati.';

create or replace function public.skirenting_delete_rental_booking(p_location_id uuid,p_booking_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare booking public.rental_bookings%rowtype;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  perform i.id from public.rental_inventory i where i.id in (
    select bi.rental_inventory_id from public.rental_booking_items bi join public.rental_bookings b on b.id=bi.booking_id
    where b.id=p_booking_id and b.location_id=p_location_id) order by i.id for update;
  select * into booking from public.rental_bookings where id=p_booking_id and location_id=p_location_id for update;
  if not found then raise exception 'Prenotazione non trovata in questa sede.' using errcode='P0002'; end if;
  if booking.deleted_at is not null then return; end if;
  update public.rental_bookings set deleted_at=statement_timestamp(),deleted_by=auth.uid() where id=p_booking_id;
end; $$;
revoke all on function public.skirenting_delete_rental_booking(uuid,uuid) from public,anon;
grant execute on function public.skirenting_delete_rental_booking(uuid,uuid) to authenticated;

-- Serializza la rimozione con pagamenti e rientri: una riga nascosta non viene più modificata.
create or replace function public.skirenting_check_visible_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  select deleted_at into removed from public.rental_bookings where id=new.booking_id for share;
  if removed is not null then raise exception 'La prenotazione è stata eliminata. Aggiorna l’elenco.'; end if;
  return new;
end; $$;
drop trigger if exists rental_items_visible_booking on public.rental_booking_items;
create trigger rental_items_visible_booking before insert or update on public.rental_booking_items
  for each row execute function public.skirenting_check_visible_booking();
drop trigger if exists rental_payments_visible_booking on public.rental_payments;
create trigger rental_payments_visible_booking before insert or update on public.rental_payments
  for each row execute function public.skirenting_check_visible_booking();

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
  booking_notes text; ski_id uuid; has_poles boolean; ski_ids uuid[];
  generic_id uuid; generic_quantity integer; pair integer; pole_index integer:=0; pole_pairs integer; assigned_ski uuid;
  main_pack_ids uuid[]:='{}'; boot_mains jsonb:='{}'::jsonb; main record; boot_id uuid;
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
    if booking.deleted_at is not null then raise exception 'La prenotazione è stata eliminata.'; end if;
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
    select array_agg(value::uuid order by position) into ids
      from jsonb_array_elements_text(p_data->'inventory_ids') with ordinality selected(value,position);
    if coalesce(cardinality(ids),0) = 0
       or cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
      raise exception 'Selezione materiale vuota o duplicata.' using errcode = '22023';
    end if;

    select id into generic_id from public.rental_inventory where id=any(ids) and is_generic;
    generic_quantity:=coalesce((p_data->>'pole_quantity')::integer,1);
    if generic_quantity<1 or generic_quantity>1000 or (generic_quantity>1 and generic_id is null) then
      raise exception 'Quantità bastoncini non valida.' using errcode='22023'; end if;
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
      join public.rental_bookings b on b.id = i.booking_id and b.deleted_at is null
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
    select array_agg(i.id order by position) into ski_ids
      from jsonb_array_elements_text(p_data->'inventory_ids') with ordinality selected(value,position)
      join public.rental_inventory i on i.id=value::uuid join public.material_variants v on v.id=i.variant_id
      join public.material_categories c on c.id=v.category_id where c.code='ski';
    select coalesce(sum(case when i.is_generic then generic_quantity else 1 end),0) into pole_pairs
      from public.rental_inventory i join public.material_variants v on v.id=i.variant_id
      join public.material_categories c on c.id=v.category_id where i.id=any(ids) and c.code='poles';
    -- I pack sono riconosciuti dai codici selezionati, senza riutilizzare scarponi.
    for main in
      select i.id,c.code from public.rental_inventory i join public.material_variants v on v.id=i.variant_id
      join public.material_categories c on c.id=v.category_id
      where i.id=any(ids) and c.code in ('ski','snowboard') order by array_position(ids,i.id)
    loop
      select i.id into boot_id from public.rental_inventory i join public.material_variants v on v.id=i.variant_id
        join public.material_categories c on c.id=v.category_id
        where i.id=any(ids) and not (boot_mains ? i.id::text)
          and c.code=case when main.code='ski' then 'ski_boots' else 'snowboard_boots' end
        order by array_position(ids,i.id) limit 1;
      if boot_id is not null then
        main_pack_ids:=main_pack_ids||main.id;
        boot_mains:=boot_mains||jsonb_build_object(boot_id::text,main.id);
      end if;
    end loop;
    perform r.id from public.rental_rates r where r.group_id in (
      select i.group_id from public.rental_inventory i where i.id = any(ids)
    ) order by r.group_id for share;
    for entry in
      select i.id, i.is_generic, i.code, i.group_id, v.brand, v.model, c.code as category_code,
        coalesce(sd.length_cm::text || ' cm', nd.length_cm::text || ' cm', bd.size_label,
          hd.size_label, pd.height_cm::text || ' cm', ad.size_label) as size_label,
        case when days = 1 then r.daily_price_1_day when days = 2 then r.daily_price_2_days
          when days = 3 then r.daily_price_3_days when days = 4 then r.daily_price_4_days
          when days = 5 then r.daily_price_5_days when days = 6 then r.daily_price_6_days
          else r.daily_price_7_plus_days end as rate,
        case when days=1 then r.pack_price_1_day when days=2 then r.pack_price_2_days
          when days=3 then r.pack_price_3_days when days=4 then r.pack_price_4_days
          when days=5 then r.pack_price_5_days when days=6 then r.pack_price_6_days
          else r.pack_price_7_plus_days end as pack_rate
      from public.rental_inventory i join public.material_variants v on v.id = i.variant_id
      join public.material_categories c on c.id=v.category_id
      left join public.rental_rates r on r.group_id = i.group_id
      left join public.ski_details sd on sd.variant_id = v.id
      left join public.snowboard_details nd on nd.variant_id = v.id
      left join public.boot_details bd on bd.variant_id = v.id
      left join public.helmet_details hd on hd.variant_id = v.id
      left join public.pole_details pd on pd.variant_id = v.id
      left join public.accessory_details ad on ad.variant_id = v.id
      where i.id = any(ids) order by array_position(ids,i.id)
    loop
      for pair in 1..case when entry.is_generic then generic_quantity else 1 end loop
        assigned_ski:=(boot_mains->>entry.id::text)::uuid;
        if entry.category_code='poles' then
          pole_index:=pole_index+1; assigned_ski:=ski_ids[pole_index];
        end if;
        price := case when assigned_ski is not null then 0 when entry.id=any(main_pack_ids) then entry.pack_rate else entry.rate end;
        if price is null then raise exception 'Tariffa non configurata per l’articolo %.', entry.code; end if;
        line_total := price * days; subtotal := subtotal + line_total;
        lines := lines || jsonb_build_array(jsonb_build_object('id',entry.id,'code',entry.code,
          'brand',entry.brand,'model',entry.model,'size',entry.size_label,'price',price,'amount',line_total,
          'pricing',case when assigned_ski is not null then 'included' when entry.id=any(main_pack_ids) then 'pack' else 'single' end,
          'pack_main_id',case when entry.id=any(main_pack_ids) or (entry.category_code='ski' and array_position(ski_ids,entry.id)<=pole_pairs)
            then entry.id else assigned_ski end));
      end loop;
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
revoke all on function public.skirenting_confirm_rental_booking(uuid,uuid,jsonb) from public,anon;
grant execute on function public.skirenting_confirm_rental_booking(uuid,uuid,jsonb) to authenticated;

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
    if booking.deleted_at is not null then raise exception 'La prenotazione è stata eliminata.'; end if;
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
      join public.rental_bookings b on b.id = i.booking_id and b.deleted_at is null
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
revoke all on function public.skirenting_confirm_seasonal_rental(uuid,uuid,jsonb) from public,anon;
grant execute on function public.skirenting_confirm_seasonal_rental(uuid,uuid,jsonb) to authenticated;

create or replace function public.skirenting_transfer_rental_item(
  p_item_id uuid, p_source_location_id uuid, p_target_location_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actual_location uuid; item_code text; authorized_count integer;
begin
  if p_item_id is null or p_source_location_id is null or p_target_location_id is null
     or p_source_location_id = p_target_location_id then
    raise exception 'Scegliere una sede di destinazione diversa.' using errcode = '22023';
  end if;
  perform 1 from public.operator_profiles where id = auth.uid() for key share;
  if not found then raise exception 'Operatore non autorizzato.' using errcode = '42501'; end if;
  -- Le assegnazioni non possono essere revocate nel mezzo dell'operazione.
  perform location_id from public.operator_locations
    where operator_id = auth.uid() and location_id in (p_source_location_id, p_target_location_id)
    order by location_id for key share;
  get diagnostics authorized_count = row_count;
  if authorized_count <> 2 then
    raise exception 'Accesso richiesto a entrambe le sedi.' using errcode = '42501';
  end if;

  -- Il lock e il confronto con la sede attesa impediscono trasferimenti concorrenti
  -- basati su una scheda non aggiornata. Il futuro salvataggio noleggio dovrà
  -- acquisire lo stesso lock sull'esemplare prima di assegnarlo.
  select location_id, code into actual_location, item_code
    from public.rental_inventory where id = p_item_id for update;
  if not found then raise exception 'Articolo non trovato.' using errcode = 'P0002'; end if;
  if actual_location <> p_source_location_id then
    raise exception 'Articolo già spostato: aggiornare il magazzino.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.rental_booking_items i
    join public.rental_bookings b on b.id = i.booking_id and b.deleted_at is null
    where i.rental_inventory_id = p_item_id and i.returned_at is null
      and b.status in ('confirmed', 'preparing', 'active')
  ) then
    raise exception 'Articolo assegnato a un noleggio aperto.' using errcode = '55000';
  end if;

  update public.rental_inventory set location_id = p_target_location_id where id = p_item_id;
  insert into public.rental_inventory_transfers
    (rental_inventory_id, from_location_id, to_location_id, created_by)
    values(p_item_id, p_source_location_id, p_target_location_id, auth.uid());
  return jsonb_build_object('id', p_item_id, 'code', item_code,
    'from_location_id', p_source_location_id, 'to_location_id', p_target_location_id);
end;
$$;
revoke all on function public.skirenting_transfer_rental_item(uuid,uuid,uuid) from public,anon;
grant execute on function public.skirenting_transfer_rental_item(uuid,uuid,uuid) to authenticated;

create or replace function public.skirenting_create_material_repair(
  p_location_id uuid, p_repair_id uuid, p_code text, p_repair_type text, p_notes text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare item public.rental_inventory%rowtype; previous public.material_repairs%rowtype;
  kind text; today date := (statement_timestamp() at time zone 'Europe/Rome')::date;
begin
  p_code := btrim(p_code); p_notes := nullif(btrim(p_notes),'');
  if p_location_id is null or p_repair_id is null or p_code is null or p_code=''
     or length(p_code)>200 or p_repair_type is null
     or p_repair_type not in ('edges','wax','edges_and_wax','other') or length(p_notes)>5000 then
    raise exception 'Dati riparazione non validi.' using errcode='22023';
  end if;
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_repair_id::text,0));
  select * into item from public.rental_inventory where code=p_code and location_id=p_location_id for update;
  if not found then raise exception 'Codice non trovato in questa sede.' using errcode='P0002'; end if;
  select * into previous from public.material_repairs where id=p_repair_id;
  if found then
    if previous.rental_inventory_id<>item.id or previous.created_by<>auth.uid()
       or previous.repair_type<>p_repair_type or previous.notes is distinct from p_notes then
      raise exception 'Richiesta già utilizzata con dati diversi.' using errcode='P0001';
    end if;
    return jsonb_build_object('id',previous.id,'rental_inventory_id',item.id);
  end if;
  select c.detail_type into kind from public.material_variants v
    join public.material_categories c on c.id=v.category_id where v.id=item.variant_id;
  if kind is null or kind not in ('ski','snowboard') then
    raise exception 'La riparazione è prevista per sci e snowboard.' using errcode='22023';
  end if;
  if item.status<>'active' or not item.is_rentable or not item.is_bookable
     or exists (select 1 from public.material_repairs where rental_inventory_id=item.id and status='in_progress') then
    raise exception 'Articolo già in manutenzione o non abilitato al noleggio.' using errcode='P0001';
  end if;
  if exists (select 1 from public.rental_booking_items i join public.rental_bookings b on b.id=i.booking_id and b.deleted_at is null
    where i.rental_inventory_id=item.id and i.returned_at is null and
      (i.delivered_at is not null or b.status='active' or
       (b.status in ('confirmed','preparing') and b.starts_on<=today and b.ends_on>=today))) then
    raise exception 'Articolo assegnato a un noleggio in corso: registrare prima il rientro.' using errcode='P0001';
  end if;
  insert into public.material_repairs(id,rental_inventory_id,repair_type,notes,created_by,sent_at)
    values(p_repair_id,item.id,p_repair_type,p_notes,auth.uid(),statement_timestamp());
  update public.rental_inventory set status='maintenance' where id=item.id;
  return jsonb_build_object('id',p_repair_id,'rental_inventory_id',item.id);
end;
$$;
revoke all on function public.skirenting_create_material_repair(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.skirenting_create_material_repair(uuid,uuid,text,text,text) to authenticated;

create or replace function public.skirenting_complete_material_repair(
  p_location_id uuid, p_repair_id uuid, p_item_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare item public.rental_inventory%rowtype; repair public.material_repairs%rowtype;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  select * into item from public.rental_inventory where id=p_item_id and location_id=p_location_id for update;
  if not found then raise exception 'Articolo non trovato in questa sede.' using errcode='P0002'; end if;
  select * into repair from public.material_repairs where id=p_repair_id and rental_inventory_id=item.id for update;
  if not found then raise exception 'Riparazione non trovata.' using errcode='P0002'; end if;
  if repair.status='cancelled' or exists (select 1 from public.material_repairs
    where rental_inventory_id=item.id and status='in_progress' and id<>p_repair_id) then
    raise exception 'Riparazione cambiata. Annulla e ripeti la ricerca del materiale.' using errcode='P0001';
  end if;
  if item.status not in ('active','maintenance') or not item.is_rentable or not item.is_bookable
     or exists (select 1 from public.material_variants v join public.material_groups g on g.id=item.group_id
       where v.id=item.variant_id and (not v.is_active or not g.is_active)) then
    raise exception 'Articolo non abilitato al noleggio.' using errcode='P0001';
  end if;
  if exists (select 1 from public.rental_booking_items i join public.rental_bookings b on b.id=i.booking_id and b.deleted_at is null
    where i.rental_inventory_id=item.id and i.returned_at is null and (i.delivered_at is not null or b.status='active')) then
    raise exception 'Articolo già consegnato e non ancora rientrato.' using errcode='P0001';
  end if;
  if repair.status='completed' and item.status<>'active' then
    raise exception 'Articolo nuovamente in manutenzione. Ripeti la ricerca.' using errcode='P0001';
  end if;
  if repair.status='in_progress' then
    update public.material_repairs set status='completed',completed_at=clock_timestamp(),completed_by=auth.uid()
      where id=p_repair_id;
    if item.status='maintenance' then update public.rental_inventory set status='active' where id=item.id; end if;
  end if;
  return jsonb_build_object('id',p_repair_id,'rental_inventory_id',item.id);
end;
$$;
revoke all on function public.skirenting_complete_material_repair(uuid,uuid,uuid) from public,anon;
grant execute on function public.skirenting_complete_material_repair(uuid,uuid,uuid) to authenticated;

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
    from public.rental_booking_items i join public.rental_bookings b on b.id = i.booking_id and b.deleted_at is null
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
revoke all on function public.skirenting_register_rental_return(uuid,uuid,text) from public,anon;
grant execute on function public.skirenting_register_rental_return(uuid,uuid,text) to authenticated;

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
  select * into booking from public.rental_bookings where id=p_booking_id and location_id=p_location_id and deleted_at is null for update;
  if not found then raise exception 'Noleggio non trovato in questa sede.' using errcode='P0002'; end if;
  if booking.status not in ('confirmed','preparing','active') or booking.starts_on>(returned_time at time zone 'Europe/Rome')::date then
    raise exception 'Il noleggio non è aperto o non è ancora iniziato.'; end if;
  select bi.* into item from public.rental_booking_items bi join public.rental_inventory i on i.id=bi.rental_inventory_id
    where bi.booking_id=p_booking_id and i.is_generic and i.code=p_code and bi.returned_at is null order by bi.created_at,bi.id limit 1 for update of bi;
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
notify pgrst, 'reload schema';
commit;
