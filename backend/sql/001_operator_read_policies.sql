-- Da eseguire nel SQL Editor del progetto Supabase DOPO aver creato le tre tabelle.
-- Non modifica profili, sedi o collegamenti già inseriti.
begin;

alter table public.operator_profiles enable row level security;
alter table public.locations enable row level security;
alter table public.operator_locations enable row level security;

grant select on public.operator_profiles, public.locations, public.operator_locations
  to authenticated;

drop policy if exists operator_profiles_read_self on public.operator_profiles;
create policy operator_profiles_read_self on public.operator_profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists operator_locations_read_self on public.operator_locations;
create policy operator_locations_read_self on public.operator_locations
  for select to authenticated
  using (operator_id = (select auth.uid()));

drop policy if exists locations_read_assigned on public.locations;
create policy locations_read_assigned on public.locations
  for select to authenticated
  using (
    exists (
      select 1 from public.operator_locations ol
      where ol.location_id = locations.id
        and ol.operator_id = (select auth.uid())
    )
  );

commit;
