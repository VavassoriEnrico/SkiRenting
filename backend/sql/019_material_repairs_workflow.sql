-- Dopo 018 e 007. Le riparazioni si concludono con conferma prima del nuovo noleggio.
begin;
alter table public.material_repairs add column if not exists completed_by uuid
  references public.operator_profiles(id) on delete restrict;

create or replace function public.skirenting_create_material_repair(
  p_location_id uuid, p_repair_id uuid, p_code text, p_repair_type text, p_notes text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare item public.rental_inventory%rowtype; previous public.material_repairs%rowtype;
  kind text; today date := (statement_timestamp() at time zone 'Europe/Rome')::date;
begin
  p_code := btrim(p_code); p_notes := nullif(btrim(p_notes),'');
  if p_location_id is null or p_repair_id is null or p_code is null or p_code=''
     or length(p_code)>200 or p_repair_type is null
     or p_repair_type not in ('edges','wax','edges_and_wax','other') or length(p_notes)>5000 then
    raise exception 'Dati riparazione non validi.' using errcode='22023';
  end if;
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_repair_id::text,0));
  select * into item from public.rental_inventory where code=p_code and location_id=p_location_id for update;
  if not found then raise exception 'Codice non trovato in questa sede.' using errcode='P0002'; end if;
  select * into previous from public.material_repairs where id=p_repair_id;
  if found then
    if previous.rental_inventory_id<>item.id or previous.created_by<>auth.uid()
       or previous.repair_type<>p_repair_type or previous.notes is distinct from p_notes then
      raise exception 'Richiesta già utilizzata con dati diversi.' using errcode='P0001';
    end if;
    return jsonb_build_object('id',previous.id,'rental_inventory_id',item.id);
  end if;
  select c.detail_type into kind from public.material_variants v
    join public.material_categories c on c.id=v.category_id where v.id=item.variant_id;
  if kind is null or kind not in ('ski','snowboard') then
    raise exception 'La riparazione è prevista per sci e snowboard.' using errcode='22023';
  end if;
  if item.status<>'active' or not item.is_rentable or not item.is_bookable
     or exists (select 1 from public.material_repairs where rental_inventory_id=item.id and status='in_progress') then
    raise exception 'Articolo già in manutenzione o non abilitato al noleggio.' using errcode='P0001';
  end if;
  if exists (select 1 from public.rental_booking_items i join public.rental_bookings b on b.id=i.booking_id
    where i.rental_inventory_id=item.id and i.returned_at is null and
      (i.delivered_at is not null or b.status='active' or
       (b.status in ('confirmed','preparing') and b.starts_on<=today and b.ends_on>=today))) then
    raise exception 'Articolo assegnato a un noleggio in corso: registrare prima il rientro.' using errcode='P0001';
  end if;
  insert into public.material_repairs(id,rental_inventory_id,repair_type,notes,created_by,sent_at)
    values(p_repair_id,item.id,p_repair_type,p_notes,auth.uid(),statement_timestamp());
  update public.rental_inventory set status='maintenance' where id=item.id;
  return jsonb_build_object('id',p_repair_id,'rental_inventory_id',item.id);
end;
$$;

create or replace function public.skirenting_complete_material_repair(
  p_location_id uuid, p_repair_id uuid, p_item_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare item public.rental_inventory%rowtype; repair public.material_repairs%rowtype;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  select * into item from public.rental_inventory where id=p_item_id and location_id=p_location_id for update;
  if not found then raise exception 'Articolo non trovato in questa sede.' using errcode='P0002'; end if;
  select * into repair from public.material_repairs where id=p_repair_id and rental_inventory_id=item.id for update;
  if not found then raise exception 'Riparazione non trovata.' using errcode='P0002'; end if;
  if repair.status='cancelled' or exists (select 1 from public.material_repairs
    where rental_inventory_id=item.id and status='in_progress' and id<>p_repair_id) then
    raise exception 'Riparazione cambiata. Annulla e ripeti la ricerca del materiale.' using errcode='P0001';
  end if;
  if item.status not in ('active','maintenance') or not item.is_rentable or not item.is_bookable
     or exists (select 1 from public.material_variants v join public.material_groups g on g.id=item.group_id
       where v.id=item.variant_id and (not v.is_active or not g.is_active)) then
    raise exception 'Articolo non abilitato al noleggio.' using errcode='P0001';
  end if;
  if exists (select 1 from public.rental_booking_items i join public.rental_bookings b on b.id=i.booking_id
    where i.rental_inventory_id=item.id and i.returned_at is null and (i.delivered_at is not null or b.status='active')) then
    raise exception 'Articolo già consegnato e non ancora rientrato.' using errcode='P0001';
  end if;
  if repair.status='completed' and item.status<>'active' then
    raise exception 'Articolo nuovamente in manutenzione. Ripeti la ricerca.' using errcode='P0001';
  end if;
  if repair.status='in_progress' then
    update public.material_repairs set status='completed',completed_at=clock_timestamp(),completed_by=auth.uid()
      where id=p_repair_id;
    if item.status='maintenance' then update public.rental_inventory set status='active' where id=item.id; end if;
  end if;
  return jsonb_build_object('id',p_repair_id,'rental_inventory_id',item.id);
end;
$$;

-- Anche una richiesta diretta al backend non può assegnare un articolo con lavori aperti.
create or replace function public.skirenting_check_booking_item_repair()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform id from public.rental_inventory where id=new.rental_inventory_id for update;
  if exists (select 1 from public.material_repairs where rental_inventory_id=new.rental_inventory_id and status='in_progress') then
    raise exception 'Articolo in riparazione. Rimuovilo e aggiungilo nuovamente confermando il completamento.' using errcode='P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists rental_booking_items_repair_closed on public.rental_booking_items;
create trigger rental_booking_items_repair_closed before insert or update of rental_inventory_id
  on public.rental_booking_items for each row execute function public.skirenting_check_booking_item_repair();

revoke all on function public.skirenting_create_material_repair(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.skirenting_complete_material_repair(uuid,uuid,uuid) from public,anon;
revoke all on function public.skirenting_check_booking_item_repair() from public,anon,authenticated;
grant execute on function public.skirenting_create_material_repair(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.skirenting_complete_material_repair(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
