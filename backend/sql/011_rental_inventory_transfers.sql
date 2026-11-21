-- Eseguire tutto una volta dopo 007. Trasferisce un singolo esemplare noleggio.
begin;

create table public.rental_inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  rental_inventory_id uuid not null references public.rental_inventory(id) on delete restrict,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id uuid not null references public.locations(id) on delete restrict,
  created_by uuid not null references public.operator_profiles(id) on delete restrict,
  transferred_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);
create index rental_inventory_transfers_item_idx
  on public.rental_inventory_transfers(rental_inventory_id, transferred_at);
alter table public.rental_inventory_transfers enable row level security;
revoke all on public.rental_inventory_transfers from public, anon, authenticated;
grant select on public.rental_inventory_transfers to authenticated;
create policy rental_inventory_transfers_assigned_location_read
  on public.rental_inventory_transfers for select to authenticated using (
    exists (
      select 1 from public.operator_locations ol
      where ol.operator_id = (select auth.uid())
        and ol.location_id in (from_location_id, to_location_id)
    )
  );

create function public.skirenting_transfer_rental_item(
  p_item_id uuid, p_source_location_id uuid, p_target_location_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actual_location uuid; item_code text; authorized_count integer;
begin
  if p_item_id is null or p_source_location_id is null or p_target_location_id is null
     or p_source_location_id = p_target_location_id then
    raise exception 'Scegliere una sede di destinazione diversa.' using errcode = '22023';
  end if;
  perform 1 from public.operator_profiles where id = auth.uid() for key share;
  if not found then raise exception 'Operatore non autorizzato.' using errcode = '42501'; end if;
  -- Le assegnazioni non possono essere revocate nel mezzo dell'operazione.
  perform location_id from public.operator_locations
    where operator_id = auth.uid() and location_id in (p_source_location_id, p_target_location_id)
    order by location_id for key share;
  get diagnostics authorized_count = row_count;
  if authorized_count <> 2 then
    raise exception 'Accesso richiesto a entrambe le sedi.' using errcode = '42501';
  end if;

  -- Il lock e il confronto con la sede attesa impediscono trasferimenti concorrenti
  -- basati su una scheda non aggiornata. Il futuro salvataggio noleggio dovrà
  -- acquisire lo stesso lock sull'esemplare prima di assegnarlo.
  select location_id, code into actual_location, item_code
    from public.rental_inventory where id = p_item_id for update;
  if not found then raise exception 'Articolo non trovato.' using errcode = 'P0002'; end if;
  if actual_location <> p_source_location_id then
    raise exception 'Articolo già spostato: aggiornare il magazzino.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.rental_booking_items i
    join public.rental_bookings b on b.id = i.booking_id
    where i.rental_inventory_id = p_item_id and i.returned_at is null
      and b.status in ('confirmed', 'preparing', 'active')
  ) then
    raise exception 'Articolo assegnato a un noleggio aperto.' using errcode = '55000';
  end if;

  update public.rental_inventory set location_id = p_target_location_id where id = p_item_id;
  insert into public.rental_inventory_transfers
    (rental_inventory_id, from_location_id, to_location_id, created_by)
    values(p_item_id, p_source_location_id, p_target_location_id, auth.uid());
  return jsonb_build_object('id', p_item_id, 'code', item_code,
    'from_location_id', p_source_location_id, 'to_location_id', p_target_location_id);
end;
$$;
revoke all on function public.skirenting_transfer_rental_item(uuid,uuid,uuid) from public, anon;
grant execute on function public.skirenting_transfer_rental_item(uuid,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
