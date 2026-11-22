-- Dopo 015. Consente nomi vuoti solo per importazioni storiche amministrative.
-- Non importa dati da solo. I nuovi clienti continuano a richiedere nome e cognome.
begin;
alter table public.customers add column if not exists is_legacy boolean not null default false;
alter table public.customers drop constraint if exists customers_first_name_check;
alter table public.customers drop constraint if exists customers_last_name_check;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.customers'::regclass and conname='customers_names_required_for_new') then
    alter table public.customers add constraint customers_names_required_for_new
      check (is_legacy or (btrim(first_name) <> '' and btrim(last_name) <> ''));
  end if;
end;
$$;
comment on column public.customers.is_legacy is
  'Riga importata dal vecchio gestionale: può avere nomi vuoti. Non scrivibile dagli operatori.';

-- Esclude is_legacy dai permessi di scrittura degli operatori, senza cambiare RLS.
revoke insert, update on public.customers from authenticated;
grant insert(id,first_name,last_name,phone,email,notes,document_path,created_at,updated_at,
             birth_date,skill_level,language,country_code),
      update(id,first_name,last_name,phone,email,notes,document_path,created_at,updated_at,
             birth_date,skill_level,language,country_code)
  on public.customers to authenticated;

create table if not exists public.customer_import_batches (
  id uuid primary key,
  source_filename text not null,
  source_sha256 text not null unique check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_headers jsonb not null check (jsonb_typeof(source_headers)='array'),
  row_count integer not null check (row_count > 0),
  imported_at timestamptz not null default now()
);
create table if not exists public.customer_import_rows (
  batch_id uuid not null references public.customer_import_batches(id) on delete restrict,
  source_row integer not null check (source_row > 0),
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  raw_data jsonb not null check (jsonb_typeof(raw_data)='object'),
  primary key(batch_id,source_row)
);
comment on table public.customer_import_rows is
  'Archivio amministrativo: conserva tutte le colonne CSV originali, inclusi vuoti, riepiloghi del periodo, privacy e stagionale. Non crea incassi o prenotazioni.';
alter table public.customer_import_batches enable row level security;
alter table public.customer_import_rows enable row level security;
revoke all on public.customer_import_batches, public.customer_import_rows from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
