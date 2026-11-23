-- Eseguire dopo 023. Pack automatici con attrezzo e scarponi compatibili.
-- Bastoncini facoltativi inclusi solo nei pack sci. Non modifica prenotazioni salvate.
begin;

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

revoke all on function public.skirenting_seasonal_quote(uuid,jsonb) from public,anon;
grant execute on function public.skirenting_seasonal_quote(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
