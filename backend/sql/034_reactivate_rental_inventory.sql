-- Riattiva un esemplare dismesso nella stessa sede, conservando ID e storico.
-- Eseguire dopo 033 nel SQL Editor.
begin;
create or replace function public.skirenting_reactivate_rental_item(p_location_id uuid,p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.rental_inventory%rowtype;
begin
  perform 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() and ol.location_id=p_location_id for key share of p,ol;
  if not found then raise exception 'Sede non autorizzata.' using errcode='42501'; end if;
  select * into item from public.rental_inventory where id=p_item_id and location_id=p_location_id for update;
  if not found then raise exception 'Articolo non trovato nella sede selezionata.' using errcode='P0002'; end if;
  if item.is_generic then raise exception 'Il materiale generico condiviso non può essere riattivato da qui.' using errcode='22023'; end if;
  -- Un ritentativo dopo il successo non modifica uno stato cambiato nel frattempo.
  if item.deleted_at is null and item.status<>'retired' then
    return jsonb_build_object('id',item.id,'code',item.code,'location_id',item.location_id);
  end if;
  if exists(select 1 from public.material_repairs where rental_inventory_id=item.id and status='in_progress')
    or not exists(select 1 from public.material_variants v join public.material_groups g on g.id=item.group_id
      where v.id=item.variant_id and v.is_active and g.is_active) then
    raise exception 'Riparazione aperta o modello/gruppo disabilitato.' using errcode='55000';
  end if;
  update public.rental_inventory set status='active',is_rentable=true,is_bookable=true,
    deleted_at=null,deleted_by=null where id=item.id;
  return jsonb_build_object('id',item.id,'code',item.code,'location_id',item.location_id);
end; $$;
revoke all on function public.skirenting_reactivate_rental_item(uuid,uuid) from public,anon;
grant execute on function public.skirenting_reactivate_rental_item(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
