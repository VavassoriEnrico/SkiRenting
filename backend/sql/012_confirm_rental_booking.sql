-- Eseguire tutto dopo 007, 009 e 010. Nessuna scrittura diretta dalle tabelle.
begin;
alter table public.rental_bookings add column if not exists confirmation_hash text;
comment on column public.rental_bookings.confirmation_hash is
  'Impronta della richiesta: lo stesso ID può essere ritentato senza duplicare noleggio o pagamento.';

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
  booking_notes text;
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

    if hotel_id is not null then
      select h.discount into discount from public.hotels h where h.id = hotel_id and h.is_active for share;
      if not found then raise exception 'Albergo non più attivo. Aggiorna la selezione.'; end if;
    end if;
    perform r.id from public.rental_rates r where r.group_id in (
      select i.group_id from public.rental_inventory i where i.id = any(ids)
    ) order by r.group_id for share;
    for entry in
      select i.id, i.code, i.group_id, v.brand, v.model,
        coalesce(sd.length_cm::text || ' cm', nd.length_cm::text || ' cm', bd.size_label,
          hd.size_label, pd.height_cm::text || ' cm', ad.size_label) as size_label,
        case when days = 1 then r.daily_price_1_day when days = 2 then r.daily_price_2_days
          when days = 3 then r.daily_price_3_days when days = 4 then r.daily_price_4_days
          when days = 5 then r.daily_price_5_days when days = 6 then r.daily_price_6_days
          else r.daily_price_7_plus_days end as rate
      from public.rental_inventory i join public.material_variants v on v.id = i.variant_id
      left join public.rental_rates r on r.group_id = i.group_id
      left join public.ski_details sd on sd.variant_id = v.id
      left join public.snowboard_details nd on nd.variant_id = v.id
      left join public.boot_details bd on bd.variant_id = v.id
      left join public.helmet_details hd on hd.variant_id = v.id
      left join public.pole_details pd on pd.variant_id = v.id
      left join public.accessory_details ad on ad.variant_id = v.id
      where i.id = any(ids) order by i.id
    loop
      price := entry.rate;
      if price is null then raise exception 'Tariffa non configurata per l’articolo %.', entry.code; end if;
      line_total := price * days; subtotal := subtotal + line_total;
      lines := lines || jsonb_build_array(jsonb_build_object('id',entry.id,'code',entry.code,
        'brand',entry.brand,'model',entry.model,'size',entry.size_label,'price',price,'amount',line_total));
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
      hotel_id,discount_percent,created_by,confirmation_hash,notes)
      values(p_booking_id,customer_id,p_location_id,date_start,date_end,hotel_id,discount,
        auth.uid(),pg_catalog.md5(p_data::text),booking_notes);
    insert into public.rental_booking_items(booking_id,rental_inventory_id,code_snapshot,
      brand_snapshot,model_snapshot,size_snapshot,daily_price,amount)
      select p_booking_id,(x->>'id')::uuid,x->>'code',x->>'brand',x->>'model',x->>'size',
        (x->>'price')::numeric,(x->>'amount')::numeric from jsonb_array_elements(lines) x;
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
revoke all on function public.skirenting_confirm_rental_booking(uuid,uuid,jsonb) from public, anon;
grant execute on function public.skirenting_confirm_rental_booking(uuid,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
