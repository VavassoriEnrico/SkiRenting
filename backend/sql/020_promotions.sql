-- Promozioni condivise tra le sedi. Eseguire dopo 001; ripetibile senza perdere dati.
-- Non modifica prezzi, noleggi, sconti alberghi o pagamenti esistenti.
begin;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  promotion_date date,
  weekdays smallint[] not null default '{}',
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 100),
  is_active boolean not null default true,
  constraint promotions_schedule check (
    (promotion_date is not null and cardinality(weekdays) = 0)
    or (promotion_date is null and cardinality(weekdays) between 1 and 7)
  ),
  constraint promotions_weekdays_valid check (
    coalesce(array_ndims(weekdays), 1) = 1
    and array_position(weekdays, null) is null
    and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    and cardinality(weekdays) =
      (1 = any(weekdays))::integer + (2 = any(weekdays))::integer +
      (3 = any(weekdays))::integer + (4 = any(weekdays))::integer +
      (5 = any(weekdays))::integer + (6 = any(weekdays))::integer +
      (7 = any(weekdays))::integer
  )
);
comment on column public.promotions.weekdays is
  'Giorni ricorrenti: 1=lunedì, 2=martedì, ..., 7=domenica. Vuoto per una data singola.';
comment on column public.promotions.discount_percent is
  'Percentuale di sconto. Applicazione ai noleggi e cumulabilità da definire.';
comment on column public.promotions.is_active is
  'Rimozione logica: mantiene la promozione per futuri riferimenti storici.';

alter table public.promotions enable row level security;
grant select on public.promotions to authenticated;
grant insert (name, promotion_date, weekdays, discount_percent), update (is_active)
  on public.promotions to authenticated;

drop policy if exists promotions_operator_read on public.promotions;
create policy promotions_operator_read on public.promotions for select to authenticated
  using (exists (
    select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id = p.id
    where p.id = (select auth.uid())
  ));
drop policy if exists promotions_operator_insert on public.promotions;
create policy promotions_operator_insert on public.promotions for insert to authenticated
  with check (exists (
    select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id = p.id
    where p.id = (select auth.uid())
  ));
drop policy if exists promotions_operator_update on public.promotions;
create policy promotions_operator_update on public.promotions for update to authenticated
  using (exists (
    select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id = p.id
    where p.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id = p.id
    where p.id = (select auth.uid())
  ));

notify pgrst, 'reload schema';
commit;
