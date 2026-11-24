-- Eliminazione logica degli esemplari noleggio: conserva storico e codici.
-- Eseguire dopo 031, in un'unica query nel SQL Editor.
begin;
alter table public.rental_inventory
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.operator_profiles(id) on delete restrict;

create or replace function public.skirenting_archive_rental_items(p_location_id uuid,p_item_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[]; item_count integer;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and 500
    or array_position(p_item_ids,null) is not null then
    raise exception 'Selezionare da 1 a 500 esemplari.' using errcode='22023';
  end if;
  select array_agg(distinct id order by id) into ids from unnest(p_item_ids) as id;
  perform id from public.rental_inventory where id=any(ids) and location_id=p_location_id order by id for update;
  if exists(select 1 from public.rental_inventory where id=any(ids) and is_generic) then
    raise exception 'Il materiale generico condiviso non può essere eliminato.' using errcode='22023';
  end if;
  select count(*) into item_count from public.rental_inventory where id=any(ids) and location_id=p_location_id;
  if item_count<>cardinality(ids) then raise exception 'Articolo non trovato nella sede selezionata.' using errcode='P0002'; end if;
  if exists(select 1 from public.rental_booking_items bi join public.rental_bookings b on b.id=bi.booking_id
    where bi.rental_inventory_id=any(ids) and bi.returned_at is null and b.deleted_at is null
      and not b.is_legacy and b.status<>'cancelled') then
    raise exception 'Un esemplare è assegnato a un noleggio o ancora da riconsegnare.' using errcode='55000';
  end if;
  if exists(select 1 from public.material_repairs where rental_inventory_id=any(ids) and status='in_progress') then
    raise exception 'Un esemplare ha una riparazione aperta. Concludila prima di eliminarlo.' using errcode='55000';
  end if;
  update public.rental_inventory set deleted_at=coalesce(deleted_at,now()),deleted_by=coalesce(deleted_by,auth.uid()),
    status='retired',is_rentable=false,is_bookable=false where id=any(ids);
  return jsonb_build_object('item_ids',ids);
end; $$;
revoke all on function public.skirenting_archive_rental_items(uuid,uuid[]) from public,anon;
grant execute on function public.skirenting_archive_rental_items(uuid,uuid[]) to authenticated;

-- Vecchi riferimenti restano consultabili, ma non si creano nuovi utilizzi.
create or replace function public.skirenting_check_archived_rental_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  if tg_op='UPDATE' and new.rental_inventory_id is not distinct from old.rental_inventory_id then return new; end if;
  select deleted_at into removed from public.rental_inventory where id=new.rental_inventory_id for key share;
  if removed is not null then raise exception 'Articolo eliminato dal magazzino.' using errcode='55000'; end if;
  return new;
end; $$;
drop trigger if exists rental_booking_item_archived_reference on public.rental_booking_items;
create trigger rental_booking_item_archived_reference before insert or update of rental_inventory_id
  on public.rental_booking_items for each row execute function public.skirenting_check_archived_rental_reference();
drop trigger if exists material_repair_archived_reference on public.material_repairs;
create trigger material_repair_archived_reference before insert or update of rental_inventory_id
  on public.material_repairs for each row execute function public.skirenting_check_archived_rental_reference();

create or replace function public.skirenting_keep_archived_rental_item()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.deleted_at is not null and new.deleted_at is not null and (
    new.location_id<>old.location_id or new.status<>'retired' or new.is_rentable or new.is_bookable) then
    raise exception 'Articolo eliminato dal magazzino.' using errcode='55000';
  end if;
  return new;
end; $$;
drop trigger if exists rental_inventory_keep_archived on public.rental_inventory;
create trigger rental_inventory_keep_archived before update on public.rental_inventory
  for each row execute function public.skirenting_keep_archived_rental_item();
notify pgrst,'reload schema';
commit;
