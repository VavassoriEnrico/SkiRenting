-- Eseguire tutto nel SQL Editor, dopo 001 e 002 (004 è facoltativo).
-- Aggiunge il salvataggio atomico del solo materiale NOLEGGIO.
-- Nessuna chiave service_role: la funzione controlla l'operatore e la sede.
begin;

alter table public.material_categories
  add column if not exists detail_type text not null default 'accessory'
  check (detail_type in ('ski','snowboard','boots','helmet','poles','goggles','accessory'));
update public.material_categories set detail_type = case
  when code in ('ski','snowboard','helmet','poles','goggles') then code
  when code in ('ski_boots','snowboard_boots') then 'boots'
  else 'accessory' end
where code in ('ski','snowboard','helmet','poles','goggles','ski_boots','snowboard_boots',
               'snowshoes','avalanche','sled');

-- Le nuove categorie possono usare gli stessi campi di una famiglia esistente.
-- I trigger già installati continuano a richiamare questa funzione.
create or replace function public.skirenting_check_detail_category()
returns trigger language plpgsql set search_path = '' as $$
declare actual_type text; expected_type text;
begin
  select c.detail_type into actual_type from public.material_variants v
    join public.material_categories c on c.id = v.category_id where v.id = new.variant_id;
  expected_type := case tg_table_name
    when 'ski_details' then 'ski' when 'snowboard_details' then 'snowboard'
    when 'boot_details' then 'boots' when 'helmet_details' then 'helmet'
    when 'pole_details' then 'poles' when 'goggle_details' then 'goggles'
    when 'accessory_details' then 'accessory' end;
  if actual_type is null or actual_type is distinct from expected_type then
    raise exception 'Dettagli incompatibili con la categoria.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.skirenting_create_rental_item(p_location_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  category_id uuid; group_id uuid; variant_id uuid; item_id uuid;
  category_type text; detail_table text; allowed_keys text[];
  details jsonb; variant_data jsonb; category_data jsonb; group_name text;
  item_code text; brand_name text; model_name text; variant_year smallint;
begin
  -- Verificato anche quando la funzione viene chiamata direttamente dalla Data API.
  if auth.uid() is null then
    raise exception 'Accesso richiesto.' using errcode = '42501';
  end if;
  perform 1 from public.operator_profiles p
    join public.operator_locations ol on ol.operator_id = p.id
    where p.id = auth.uid() and ol.location_id = p_location_id
    for key share of p, ol;
  if not found then
    raise exception 'Sede non autorizzata.' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Dati articolo mancanti.' using errcode = '22023';
  end if;
  if ((p_data->>'category_id') is null) = ((p_data->>'new_category') is null)
    or ((p_data->>'group_id') is null) = ((p_data->>'new_group') is null)
    or ((p_data->>'variant_id') is null) = ((p_data->>'new_variant') is null) then
    raise exception 'Scegliere una voce esistente oppure una nuova.' using errcode = '22023';
  end if;
  item_code := btrim(p_data->>'code');
  if item_code is null or length(item_code) not between 1 and 200 then
    raise exception 'Codice obbligatorio.' using errcode = '22023';
  end if;

  -- Serializza gli inserimenti del catalogo: due richieste simultanee non creano
  -- due varianti identiche né due gruppi che differiscono solo per maiuscole.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skirenting_create_rental_item', 0));
  if exists (select 1 from public.rental_inventory r where r.code = item_code) then
    raise exception 'Codice già presente.' using errcode = '23505';
  end if;

  if p_data->>'category_id' is not null then
    category_id := (p_data->>'category_id')::uuid;
    select c.detail_type into category_type from public.material_categories c where c.id = category_id;
    if not found then raise exception 'Categoria inesistente.' using errcode = '22023'; end if;
  else
    category_data := p_data->'new_category';
    if p_data->>'group_id' is not null or p_data->>'variant_id' is not null
       or jsonb_typeof(category_data) <> 'object'
       or coalesce(category_data->>'code', '') !~ '^[a-z][a-z0-9_]{0,59}$'
       or coalesce(length(btrim(category_data->>'name')), 0) not between 1 and 200 then
      raise exception 'Nuova categoria non valida.' using errcode = '22023';
    end if;
    category_type := category_data->>'detail_type';
    if category_type is null or category_type not in ('ski','snowboard','boots','helmet','poles','goggles','accessory') then
      raise exception 'Scegliere i campi della categoria.' using errcode = '22023';
    end if;
    if exists (select 1 from public.material_categories c where lower(btrim(c.name)) = lower(btrim(category_data->>'name'))) then
      raise exception 'Categoria già presente.' using errcode = '23505';
    end if;
    insert into public.material_categories(code,name,detail_type)
      values(category_data->>'code',btrim(category_data->>'name'),category_type) returning id into category_id;
  end if;

  if p_data->>'group_id' is not null then
    group_id := (p_data->>'group_id')::uuid;
    if not exists (select 1 from public.material_groups g where g.id = group_id
                   and g.category_id = category_id and g.is_active) then
      raise exception 'Gruppo non compatibile o disattivato.' using errcode = '22023';
    end if;
  else
    group_name := btrim(p_data->>'new_group');
    if coalesce(length(group_name),0) not between 1 and 200 then
      raise exception 'Nome gruppo obbligatorio.' using errcode = '22023';
    end if;
    select g.id into group_id from public.material_groups g where g.category_id = category_id
      and lower(btrim(g.name)) = lower(group_name) and g.is_active order by g.id limit 1;
    if group_id is null then
      insert into public.material_groups(category_id,name) values(category_id,group_name) returning id into group_id;
    end if;
  end if;

  detail_table := case category_type when 'ski' then 'ski_details' when 'snowboard' then 'snowboard_details'
    when 'boots' then 'boot_details' when 'helmet' then 'helmet_details' when 'poles' then 'pole_details'
    when 'goggles' then 'goggle_details' when 'accessory' then 'accessory_details' end;
  if p_data->>'variant_id' is not null then
    variant_id := (p_data->>'variant_id')::uuid;
    if not exists (select 1 from public.material_variants v where v.id = variant_id
                   and v.category_id = category_id and v.is_active) then
      raise exception 'Modello non compatibile o disattivato.' using errcode = '22023';
    end if;
  else
    variant_data := p_data->'new_variant';
    brand_name := btrim(variant_data->>'brand'); model_name := btrim(variant_data->>'model');
    variant_year := (variant_data->>'year')::smallint;
    if coalesce(length(brand_name),0) not between 1 and 200
       or coalesce(length(model_name),0) not between 1 and 200
       or jsonb_typeof(variant_data->'details') is distinct from 'object' then
      raise exception 'Marca, modello e caratteristiche richiesti.' using errcode = '22023';
    end if;
    details := jsonb_strip_nulls(variant_data->'details');
    allowed_keys := case category_type
      when 'ski' then array['length_cm'] when 'snowboard' then array['length_cm']
      when 'boots' then array['size_label']
      when 'helmet' then array['size_label'] when 'poles' then array['height_cm']
      when 'goggles' then array['lens'] when 'accessory' then array['size_label'] end;
    if exists (select 1 from jsonb_object_keys(details) k where not (k = any(allowed_keys))) then
      raise exception 'Caratteristiche incompatibili con la categoria.' using errcode = '22023';
    end if;
    -- Riutilizza una variante identica, senza alterare i modelli già a magazzino.
    execute format('select v.id from public.material_variants v left join public.%I d on d.variant_id = v.id
      where v.category_id = $1 and v.brand = $2 and v.model = $3 and v.year is not distinct from $4
      and jsonb_strip_nulls(coalesce(to_jsonb(d) - ''variant_id'' - ''radius_m'' - ''style'' - ''shoe_size_eu'' - ''foot_length_cm'' - ''sole_length_mm'' - ''size_system'' - ''color'', ''{}''::jsonb)) = $5
      and v.is_active order by v.id limit 1', detail_table)
      into variant_id using category_id, brand_name, model_name, variant_year, details;
    if variant_id is null then
      insert into public.material_variants(category_id,brand,model,year)
        values(category_id,brand_name,model_name,variant_year) returning id into variant_id;
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', detail_table, detail_table)
        using details || jsonb_build_object('variant_id',variant_id);
    end if;
  end if;

  insert into public.rental_inventory(variant_id,group_id,location_id,code,serial_number,status,
    is_rentable,is_bookable,purchase_price,legacy_sold_price,notes)
  values(variant_id,group_id,p_location_id,item_code,nullif(btrim(p_data->>'serial_number'),''),
    coalesce(p_data->>'status','active'),coalesce((p_data->>'is_rentable')::boolean,true),
    coalesce((p_data->>'is_bookable')::boolean,true),(p_data->>'purchase_price')::numeric,
    (p_data->>'legacy_sold_price')::numeric,nullif(p_data->>'notes','')) returning id into item_id;
  return jsonb_build_object('id',item_id,'category_id',category_id,'group_id',group_id,
    'variant_id',variant_id,'code',item_code);
end;
$$;

revoke all on function public.skirenting_create_rental_item(uuid,jsonb) from public, anon;
grant execute on function public.skirenting_create_rental_item(uuid,jsonb) to authenticated;
-- Restano assenti permessi/policy di INSERT, UPDATE e DELETE diretti sulle tabelle.
notify pgrst, 'reload schema';
commit;
