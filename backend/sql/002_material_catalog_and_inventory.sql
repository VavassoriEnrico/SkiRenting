-- SkiRenting: catalogo materiale e magazzini (11 novembre 2026).
-- Eseguire UNA VOLTA nel SQL Editor del progetto Supabase.
-- Richiede locations, operator_profiles e operator_locations già create.
-- Non modifica queste tre tabelle e non importa automaticamente i 23 PDF.
-- Niente tariffe: i gruppi originali vengono conservati senza prezzi.
-- Tutto è in una transazione: se una query fallisce, non applicare pezzi isolati.

begin;

-- Non creare una sede duplicata: verificare quella già presente.
do $$
begin
  if (select count(*) from public.locations where lower(btrim(name)) = 'madesimo') <> 1 then
    raise exception 'Deve esistere esattamente una sede Madesimo in public.locations.';
  end if;
end;
$$;

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(btrim(code)) and code <> ''),
  name text not null unique check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

-- Categorie fisiche: non confondere con i gruppi tariffari dei PDF.
insert into public.material_categories (code, name) values
  ('ski', 'Sci'),
  ('snowboard', 'Snowboard'),
  ('ski_boots', 'Scarponi sci'),
  ('snowboard_boots', 'Scarponi snowboard'),
  ('helmet', 'Caschi'),
  ('snowshoes', 'Ciaspole'),
  ('avalanche', 'ARVA / ARTVA'),
  ('sled', 'Bob / slittini'),
  ('poles', 'Bastoncini'),
  ('goggles', 'Maschere');

create table public.material_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.material_categories(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

-- Gruppi originali dei 23 documenti. Nessuna tariffa viene dedotta dai PDF.
insert into public.material_groups (category_id, name)
select c.id, original.group_name
from (values
  ('ski_boots', 'SCARPONI BABY 4 GANCI'),
  ('ski', 'ALLMOUNTAIN'),
  ('avalanche', 'ARVA'),
  ('sled', 'BOB'),
  ('helmet', 'CASCO'),
  ('snowshoes', 'CIASPOLE'),
  ('ski_boots', 'ALPINISMO'),
  ('ski_boots', 'SCARPONI ADULTI +'),
  ('ski', 'RACE'),
  ('ski', 'FREESTYLE BABY'),
  ('ski', 'FREERIDE BABY'),
  ('ski', 'FREERIDE'),
  ('ski_boots', 'SCARPONI ADULTI'),
  ('ski_boots', 'SCARPONI BABY'),
  ('ski_boots', 'SCARPONI DALBELLO'),
  ('snowboard_boots', 'SCARPONI SNOW ADULTO'),
  ('snowboard_boots', 'SCARPONI SNOW BABY'),
  ('ski', 'BABY'),
  ('snowboard', 'SUPERMATIC'),
  ('snowboard', 'SPLITBOARD'),
  ('snowboard', 'SNOWBOARD BABY'),
  ('snowboard', 'SNOWBOARD POWDER'),
  ('snowboard', 'SNOWBOARD ADULTO')
) as original(category_code, group_name)
join public.material_categories c on c.code = original.category_code;

-- Una riga per variante: stesso modello, ma misura/anno/caratteristiche diverse
-- possono avere ID diversi. Qui NON ci sono codici degli esemplari o quantità.
create table public.material_variants (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.material_categories(id) on delete restrict,
  brand text not null check (btrim(brand) <> ''),
  model text not null check (btrim(model) <> ''),
  year smallint check (year between 1900 and 9999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.material_variants.year is
  'ANNO originale del gestionale; non implica automaticamente anno di acquisto.';
create index material_variants_category_idx on public.material_variants(category_id);
create index material_variants_brand_model_idx on public.material_variants(brand, model);

-- I dettagli hanno lo stesso ID della variante: un rapporto uno-a-uno.
-- I campi sconosciuti possono restare null, senza inventare misure.
create table public.ski_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  length_cm numeric(6,2) check (length_cm > 0)
);

create table public.snowboard_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  length_cm numeric(6,2) check (length_cm > 0)
);

create table public.boot_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  size_label text
);
comment on column public.boot_details.size_label is
  'Misura originale, per esempio 24.5. Conservarla senza convertirla automaticamente.';

create table public.helmet_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  size_label text
);

create table public.pole_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  height_cm numeric(6,2) check (height_cm > 0)
);

create table public.goggle_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  lens text
);

-- Ciaspole, ARVA e bob condividono la misura testuale (es. Taglia unica).
create table public.accessory_details (
  variant_id uuid primary key references public.material_variants(id) on delete cascade,
  size_label text
);

-- Il gruppo è sull'esemplare: può cambiare classificazione tariffaria senza
-- duplicare la variante fisica. Il codice rimane testo e può contenere + e zeri.
create table public.rental_inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.material_variants(id) on delete restrict,
  group_id uuid not null references public.material_groups(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  code text not null unique check (code = btrim(code) and code <> ''),
  serial_number text,
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'retired', 'sold', 'lost')),
  is_rentable boolean not null default true,
  is_bookable boolean not null default true,
  purchase_price numeric(12,2) check (purchase_price >= 0),
  legacy_sold_price numeric(12,2) check (legacy_sold_price >= 0),
  legacy_status text,
  notes text,
  source_file text,
  source_page integer check (source_page > 0),
  source_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.rental_inventory.serial_number is
  'S/N originale, distinto dal codice a barre e dalla misura.';
comment on column public.rental_inventory.legacy_sold_price is
  'PRZ VENDUTO originale, se valorizzato. Non è una tariffa né sostituisce il futuro storico vendite.';
comment on column public.rental_inventory.source_data is
  'Valori originali dell’export per tracciabilità: misura, anno, marca, modello, stato e prezzi.';
comment on column public.rental_inventory.status is
  'Stato del bene. La disponibilità nel periodo dipenderà anche dalle prenotazioni.';
create index rental_inventory_location_idx on public.rental_inventory(location_id);
create index rental_inventory_variant_idx on public.rental_inventory(variant_id);
create index rental_inventory_group_idx on public.rental_inventory(group_id);

-- Magazzino vendita separato: nessun articolo dei PDF vi è copiato automaticamente.
create table public.sale_inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.material_variants(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  price numeric(12,2) check (price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, location_id)
);
create index sale_inventory_location_idx on public.sale_inventory(location_id);
comment on column public.sale_inventory.price is
  'Prezzo unitario di vendita. Null significa non ancora definito, non zero.';

-- Una categoria assegnata a gruppo/variante non può essere cambiata: evita
-- incoerenze con i dettagli e con gli esemplari già referenziati.
create function public.skirenting_keep_material_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is distinct from old.category_id then
    raise exception 'La categoria non può essere cambiata: creare un nuovo gruppo o variante.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger material_variants_keep_category before update of category_id
  on public.material_variants for each row
  execute function public.skirenting_keep_material_category();
create trigger material_groups_keep_category before update of category_id
  on public.material_groups for each row
  execute function public.skirenting_keep_material_category();

create function public.skirenting_check_detail_category()
returns trigger language plpgsql set search_path = '' as $$
declare actual_code text;
begin
  select c.code into actual_code
  from public.material_variants v
  join public.material_categories c on c.id = v.category_id
  where v.id = new.variant_id;
  if actual_code is null or not (actual_code = any(tg_argv)) then
    raise exception 'Tabella % non compatibile con la categoria della variante.', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ski_details_category before insert or update of variant_id
  on public.ski_details for each row
  execute function public.skirenting_check_detail_category('ski');
create trigger snowboard_details_category before insert or update of variant_id
  on public.snowboard_details for each row
  execute function public.skirenting_check_detail_category('snowboard');
create trigger boot_details_category before insert or update of variant_id
  on public.boot_details for each row
  execute function public.skirenting_check_detail_category('ski_boots', 'snowboard_boots');
create trigger helmet_details_category before insert or update of variant_id
  on public.helmet_details for each row
  execute function public.skirenting_check_detail_category('helmet');
create trigger pole_details_category before insert or update of variant_id
  on public.pole_details for each row
  execute function public.skirenting_check_detail_category('poles');
create trigger goggle_details_category before insert or update of variant_id
  on public.goggle_details for each row
  execute function public.skirenting_check_detail_category('goggles');
create trigger accessory_details_category before insert or update of variant_id
  on public.accessory_details for each row
  execute function public.skirenting_check_detail_category('snowshoes', 'avalanche', 'sled');

create function public.skirenting_check_rental_group()
returns trigger language plpgsql set search_path = '' as $$
declare variant_category uuid; group_category uuid;
begin
  select category_id into variant_category from public.material_variants where id = new.variant_id;
  select category_id into group_category from public.material_groups where id = new.group_id;
  if variant_category is null or group_category is null or variant_category <> group_category then
    raise exception 'Il gruppo e la variante devono appartenere alla stessa categoria.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger rental_inventory_check_group before insert or update of variant_id, group_id
  on public.rental_inventory for each row
  execute function public.skirenting_check_rental_group();

create function public.skirenting_material_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger material_variants_updated_at before update on public.material_variants
  for each row execute function public.skirenting_material_updated_at();
create trigger rental_inventory_updated_at before update on public.rental_inventory
  for each row execute function public.skirenting_material_updated_at();
create trigger sale_inventory_updated_at before update on public.sale_inventory
  for each row execute function public.skirenting_material_updated_at();

-- Catalogo condiviso tra le sedi, leggibile dagli account con un profilo operatore.
-- Per ora nessuna scrittura dal browser: popolare dal SQL/Table Editor di Supabase.
alter table public.material_categories enable row level security;
grant select on public.material_categories to authenticated;
create policy material_categories_operator_read on public.material_categories
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.material_groups enable row level security;
grant select on public.material_groups to authenticated;
create policy material_groups_operator_read on public.material_groups
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.material_variants enable row level security;
grant select on public.material_variants to authenticated;
create policy material_variants_operator_read on public.material_variants
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.ski_details enable row level security;
grant select on public.ski_details to authenticated;
create policy ski_details_operator_read on public.ski_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.snowboard_details enable row level security;
grant select on public.snowboard_details to authenticated;
create policy snowboard_details_operator_read on public.snowboard_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.boot_details enable row level security;
grant select on public.boot_details to authenticated;
create policy boot_details_operator_read on public.boot_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.helmet_details enable row level security;
grant select on public.helmet_details to authenticated;
create policy helmet_details_operator_read on public.helmet_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.pole_details enable row level security;
grant select on public.pole_details to authenticated;
create policy pole_details_operator_read on public.pole_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.goggle_details enable row level security;
grant select on public.goggle_details to authenticated;
create policy goggle_details_operator_read on public.goggle_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );
alter table public.accessory_details enable row level security;
grant select on public.accessory_details to authenticated;
create policy accessory_details_operator_read on public.accessory_details
  for select to authenticated using (
    exists (select 1 from public.operator_profiles p where p.id = (select auth.uid()))
  );

-- Le giacenze sono leggibili soltanto nelle sedi autorizzate.
alter table public.rental_inventory enable row level security;
grant select on public.rental_inventory to authenticated;
create policy rental_inventory_assigned_location_read on public.rental_inventory
  for select to authenticated using (
    exists (
      select 1 from public.operator_locations ol
      where ol.operator_id = (select auth.uid()) and ol.location_id = rental_inventory.location_id
    )
  );
alter table public.sale_inventory enable row level security;
grant select on public.sale_inventory to authenticated;
create policy sale_inventory_assigned_location_read on public.sale_inventory
  for select to authenticated using (
    exists (
      select 1 from public.operator_locations ol
      where ol.operator_id = (select auth.uid()) and ol.location_id = sale_inventory.location_id
    )
  );

commit;

-- Controlli finali (le giacenze restano vuote fino al caricamento degli esemplari).
select c.name as categoria, count(g.id) as gruppi
from public.material_categories c
left join public.material_groups g on g.category_id = c.id
group by c.id, c.name order by c.name;

select id, name from public.locations where lower(btrim(name)) = 'madesimo';
