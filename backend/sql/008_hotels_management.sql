-- Eseguire tutto dopo 007. Può essere ripetuto senza cancellare alberghi.
begin;

create unique index if not exists hotels_name_normalized_idx
  on public.hotels (lower(btrim(name)));
alter table public.hotels enable row level security;
grant insert (name), update (is_active) on public.hotels to authenticated;

drop policy if exists hotels_operator_insert on public.hotels;
create policy hotels_operator_insert on public.hotels for insert to authenticated
  with check (
    exists (
      select 1 from public.operator_profiles p
      join public.operator_locations ol on ol.operator_id = p.id
      where p.id = (select auth.uid())
    )
  );
drop policy if exists hotels_operator_update on public.hotels;
create policy hotels_operator_update on public.hotels for update to authenticated
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

-- Nessun DELETE: la rimozione usa is_active=false per mantenere lo storico.
notify pgrst, 'reload schema';
commit;
