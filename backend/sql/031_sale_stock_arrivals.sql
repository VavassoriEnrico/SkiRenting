-- Eseguire nel SQL Editor dopo 030. Carichi vendita per quantità, senza codici pezzo.
begin;

alter table public.sale_inventory
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.operator_profiles(id) on delete restrict;

create table if not exists public.sale_variant_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  category_label text check (category_label is null or length(btrim(category_label)) between 1 and 200)
);
alter table public.sale_variant_details enable row level security;
grant select on public.sale_variant_details to authenticated;
drop policy if exists sale_variant_details_operator_read on public.sale_variant_details;
create policy sale_variant_details_operator_read on public.sale_variant_details for select to authenticated
  using (exists(select 1 from public.operator_profiles where id=(select auth.uid())));

create table if not exists public.sale_stock_arrivals (
  id uuid primary key,
  inventory_id uuid not null references public.sale_inventory(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  purchase_price numeric(12,2) check (purchase_price >= 0),
  price numeric(12,2) check (price >= 0),
  received_on date not null check (isfinite(received_on)),
  notes text,
  created_by uuid not null references public.operator_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  request_data jsonb not null,
  result jsonb not null
);
create index if not exists sale_stock_arrivals_inventory_idx on public.sale_stock_arrivals(inventory_id);
alter table public.sale_stock_arrivals enable row level security;
grant select on public.sale_stock_arrivals to authenticated;
drop policy if exists sale_stock_arrivals_location_read on public.sale_stock_arrivals;
create policy sale_stock_arrivals_location_read on public.sale_stock_arrivals for select to authenticated
  using (exists(select 1 from public.operator_locations ol
    where ol.operator_id=(select auth.uid()) and ol.location_id=sale_stock_arrivals.location_id));

create or replace function public.skirenting_register_sale_arrival(p_location_id uuid, p_request_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  category_id uuid; variant_id uuid; inventory_id uuid;
  category_type text; detail_table text; allowed_keys text[];
  details jsonb; variant_data jsonb; brand_name text; model_name text; category_label text;
  variant_year smallint; quantity integer; price numeric; purchase_price numeric; received_on date;
  stored public.sale_stock_arrivals%rowtype; quantity_after integer; price_after numeric; result jsonb;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto.' using errcode='42501'; end if;
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Dati arrivo mancanti.' using errcode='22023';
  end if;
  -- Stesso lock del catalogo noleggio: il riuso delle varianti resta coerente.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skirenting_create_rental_item',0));
  select * into stored from public.sale_stock_arrivals where id=p_request_id;
  if found then
    if stored.location_id<>p_location_id or stored.request_data<>p_data then
      raise exception 'Identificativo arrivo già utilizzato con dati diversi.' using errcode='23505';
    end if;
    return stored.result;
  end if;
  if ((p_data->>'variant_id') is null)=((p_data->>'new_variant') is null) then
    raise exception 'Scegliere un modello esistente oppure nuovo.' using errcode='22023';
  end if;
  category_id:=(p_data->>'category_id')::uuid;
  select c.detail_type into category_type from public.material_categories c where c.id=category_id;
  if not found then raise exception 'Tipo materiale inesistente.' using errcode='22023'; end if;
  if coalesce(p_data->>'quantity','') !~ '^[0-9]+$' then
    raise exception 'Quantità intera positiva richiesta.' using errcode='22023';
  end if;
  quantity:=(p_data->>'quantity')::integer;
  price:=(p_data->>'price')::numeric;
  purchase_price:=(p_data->>'purchase_price')::numeric;
  received_on:=(p_data->>'received_on')::date;
  if quantity not between 1 and 1000000 or received_on is null or not isfinite(received_on)
    or price<0 or price>9999999999.99 or price<>round(price,2)
    or purchase_price<0 or purchase_price>9999999999.99 or purchase_price<>round(purchase_price,2)
    or length(coalesce(p_data->>'notes',''))>5000 then
    raise exception 'Controllare quantità, prezzi e data arrivo.' using errcode='22023';
  end if;
  detail_table:=case category_type when 'ski' then 'ski_details' when 'snowboard' then 'snowboard_details'
    when 'boots' then 'boot_details' when 'helmet' then 'helmet_details' when 'poles' then 'pole_details'
    when 'goggles' then 'goggle_details' when 'accessory' then 'accessory_details' end;
  if p_data->>'variant_id' is not null then
    variant_id:=(p_data->>'variant_id')::uuid;
    if not exists(select 1 from public.material_variants v where v.id=variant_id
      and v.category_id=category_id and v.is_active) then
      raise exception 'Modello non compatibile o disattivato.' using errcode='22023';
    end if;
  else
    variant_data:=p_data->'new_variant';
    brand_name:=btrim(variant_data->>'brand'); model_name:=btrim(variant_data->>'model');
    variant_year:=(variant_data->>'year')::smallint;
    category_label:=nullif(btrim(variant_data->>'category_label'),'');
    if coalesce(length(brand_name),0) not between 1 and 200
      or coalesce(length(model_name),0) not between 1 and 200
      or length(category_label)>200
      or jsonb_typeof(variant_data->'details') is distinct from 'object' then
      raise exception 'Marca, modello e caratteristiche richiesti.' using errcode='22023';
    end if;
    details:=jsonb_strip_nulls(variant_data->'details');
    allowed_keys:=case category_type when 'ski' then array['length_cm'] when 'snowboard' then array['length_cm']
      when 'boots' then array['size_label'] when 'helmet' then array['size_label'] when 'poles' then array['height_cm']
      when 'goggles' then array['lens'] when 'accessory' then array['size_label'] end;
    if detail_table is null or exists(select 1 from jsonb_object_keys(details) k where not(k=any(allowed_keys))) then
      raise exception 'Caratteristiche incompatibili con il tipo di materiale.' using errcode='22023';
    end if;
    execute format('select v.id from public.material_variants v
      left join public.%I d on d.variant_id=v.id left join public.sale_variant_details sd on sd.variant_id=v.id
      where v.category_id=$1 and lower(btrim(v.brand))=lower($2) and lower(btrim(v.model))=lower($3)
      and v.year is not distinct from $4 and v.is_active
      and lower(sd.category_label) is not distinct from lower($6)
      and jsonb_strip_nulls(coalesce(to_jsonb(d)-''variant_id''-''radius_m''-''style''-''shoe_size_eu''-''foot_length_cm''-''sole_length_mm''-''size_system''-''color'',''{}''::jsonb))=$5
      order by v.id limit 1',detail_table)
      into variant_id using category_id,brand_name,model_name,variant_year,details,category_label;
    if variant_id is null then
      insert into public.material_variants(category_id,brand,model,year)
        values(category_id,brand_name,model_name,variant_year) returning id into variant_id;
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1)',detail_table,detail_table)
        using details||jsonb_build_object('variant_id',variant_id);
      insert into public.sale_variant_details(variant_id,category_label) values(variant_id,category_label);
    end if;
  end if;
  insert into public.sale_inventory as stock(variant_id,location_id,quantity,price)
    values(variant_id,p_location_id,quantity,price)
    on conflict on constraint sale_inventory_variant_id_location_id_key do update
      set quantity=case when stock.deleted_at is null then stock.quantity+excluded.quantity else excluded.quantity end,
          price=coalesce(excluded.price,stock.price), deleted_at=null, deleted_by=null
    returning id,stock.quantity,stock.price into inventory_id,quantity_after,price_after;
  result:=jsonb_build_object('id',p_request_id,'inventory_id',inventory_id,'variant_id',variant_id,
    'category_id',category_id,'quantity_added',quantity,'quantity',quantity_after,'price',price_after);
  insert into public.sale_stock_arrivals(id,inventory_id,location_id,quantity,purchase_price,price,received_on,notes,created_by,request_data,result)
    values(p_request_id,inventory_id,p_location_id,quantity,purchase_price,price_after,received_on,
      nullif(btrim(p_data->>'notes'),''),auth.uid(),p_data,result);
  return result;
end; $$;
revoke all on function public.skirenting_register_sale_arrival(uuid,uuid,jsonb) from public,anon;
grant execute on function public.skirenting_register_sale_arrival(uuid,uuid,jsonb) to authenticated;
create or replace function public.skirenting_archive_sale_stock(p_location_id uuid, p_inventory_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare archived_id uuid;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skirenting_create_rental_item',0));
  update public.sale_inventory
    set deleted_at=coalesce(deleted_at,now()), deleted_by=coalesce(deleted_by,auth.uid())
    where id=p_inventory_id and location_id=p_location_id returning id into archived_id;
  if not found then raise exception 'Articolo non trovato in questa sede.' using errcode='P0002'; end if;
  return archived_id;
end; $$;
revoke all on function public.skirenting_archive_sale_stock(uuid,uuid) from public,anon;
grant execute on function public.skirenting_archive_sale_stock(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
