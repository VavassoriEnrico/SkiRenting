-- Creazione iniziale: eseguire tutto UNA VOLTA nel SQL Editor di Supabase.
-- Richiede le tabelle operator_profiles/operator_locations e le policy di 001.
-- I clienti sono condivisi tra le sedi della stessa azienda.
-- Albergo e relativo sconto saranno dati della singola prenotazione.
begin;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  phone text,
  email text,
  notes text,
  document_path text check (document_path is null or btrim(document_path) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.customers.phone is
  'Testo: conservare prefisso internazionale e zeri iniziali. Non è univoco.';
comment on column public.customers.email is
  'Recapito facoltativo, non univoco: più persone possono condividere la stessa email.';
comment on column public.customers.document_path is
  'Percorso del file in un futuro bucket privato Supabase Storage, non un URL pubblico o firmato.';

create index customers_name_idx on public.customers (lower(last_name), lower(first_name));
create index customers_phone_idx on public.customers (phone);
create index customers_email_idx on public.customers (lower(email));

create function public.skirenting_customer_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.skirenting_customer_updated_at();

alter table public.customers enable row level security;
-- Revoca anche eventuali permessi assegnati automaticamente dal progetto.
revoke all on public.customers from anon, authenticated;
grant select, insert, update on public.customers to authenticated;

-- Vale per lettura, inserimento e aggiornamento. Non è concessa la cancellazione.
-- Il cliente non appartiene a una sede: ogni operatore configurato con almeno
-- una sede può consultare e aggiornare l'anagrafica condivisa.
create policy customers_operator_access on public.customers
  for all to authenticated
  using (
    exists (
      select 1 from public.operator_profiles p
      join public.operator_locations ol on ol.operator_id = p.id
      where p.id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.operator_profiles p
      join public.operator_locations ol on ol.operator_id = p.id
      where p.id = (select auth.uid())
    )
  );

commit;
