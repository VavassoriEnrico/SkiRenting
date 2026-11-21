-- Eseguire tutto una volta dopo 001 e 002. Listino condiviso tra le sedi.
-- Una riga per gruppo, sette prezzi GIORNALIERI. Nessun prezzo viene inventato.
begin;

create table public.rental_rates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.material_groups(id) on delete restrict,
  daily_price_1_day numeric(12,2) check (daily_price_1_day between 0 and 9999999999.99),
  daily_price_2_days numeric(12,2) check (daily_price_2_days between 0 and 9999999999.99),
  daily_price_3_days numeric(12,2) check (daily_price_3_days between 0 and 9999999999.99),
  daily_price_4_days numeric(12,2) check (daily_price_4_days between 0 and 9999999999.99),
  daily_price_5_days numeric(12,2) check (daily_price_5_days between 0 and 9999999999.99),
  daily_price_6_days numeric(12,2) check (daily_price_6_days between 0 and 9999999999.99),
  daily_price_7_plus_days numeric(12,2) check (daily_price_7_plus_days between 0 and 9999999999.99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rental_rates is
  'Prezzi al giorno per durata del noleggio. Null = da configurare; zero = gratuito. Nessuna colonna contiene il totale del periodo.';
comment on column public.rental_rates.daily_price_7_plus_days is
  'Prezzo giornaliero per tutto il noleggio quando la durata è di almeno 7 giorni.';

insert into public.rental_rates(group_id) select id from public.material_groups;

create function public.skirenting_rental_rates_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger rental_rates_updated_at before update on public.rental_rates
  for each row execute function public.skirenting_rental_rates_updated_at();

-- I gruppi futuri avranno automaticamente una riga vuota nel listino.
-- I gruppi vengono inseriti dal SQL Editor o dalla funzione autorizzata di 005.
create function public.skirenting_new_group_rate()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.rental_rates(group_id) values(new.id);
  return new;
end;
$$;
create trigger material_groups_create_rate after insert on public.material_groups
  for each row execute function public.skirenting_new_group_rate();

alter table public.rental_rates enable row level security;
revoke all on public.rental_rates from public, anon, authenticated;
grant select on public.rental_rates to authenticated;
grant update (daily_price_1_day, daily_price_2_days, daily_price_3_days,
  daily_price_4_days, daily_price_5_days, daily_price_6_days, daily_price_7_plus_days)
  on public.rental_rates to authenticated;
create policy rental_rates_operator_access on public.rental_rates
  for all to authenticated using (
    exists (
      select 1 from public.operator_profiles p
      join public.operator_locations ol on ol.operator_id = p.id
      where p.id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.operator_profiles p
      join public.operator_locations ol on ol.operator_id = p.id
      where p.id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
commit;
