-- Eseguire tutto dopo 013. Registra incassi già ricevuti, senza collegamenti alla cassa.
begin;
create or replace function public.skirenting_register_rental_payment(
  p_location_id uuid, p_booking_id uuid, p_payment_id uuid, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  booking public.rental_bookings%rowtype;
  previous public.rental_payments%rowtype;
  amount numeric; method text; paid_time timestamptz; notes text;
  subtotal numeric; total numeric; paid numeric;
begin
  if p_location_id is null or p_booking_id is null or p_payment_id is null
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Richiesta incompleta.' using errcode = '22023';
  end if;
  amount := (p_data->>'amount')::numeric;
  method := nullif(btrim(p_data->>'payment_method'),'');
  paid_time := (p_data->>'paid_at')::timestamptz;
  notes := nullif(btrim(p_data->>'notes'),'');
  if amount is null or not (amount > 0 and amount <= 9999999999.99)
     or round(amount,2) <> amount or method is null or length(method) > 200
     or paid_time is null or not isfinite(paid_time) or length(notes) > 5000 then
    raise exception 'Dati pagamento non validi.' using errcode = '22023';
  end if;
  perform 1 from public.operator_profiles where id = auth.uid() for key share;
  if not found then raise exception 'Operatore non autorizzato.' using errcode = '42501'; end if;
  perform 1 from public.operator_locations
    where operator_id = auth.uid() and location_id = p_location_id for key share;
  if not found then raise exception 'Sede non autorizzata.' using errcode = '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_payment_id::text, 0));
  select * into booking from public.rental_bookings
    where id = p_booking_id and location_id = p_location_id for update;
  if not found then raise exception 'Noleggio non trovato in questa sede.' using errcode = 'P0002'; end if;
  select * into previous from public.rental_payments where id = p_payment_id;
  if found then
    if previous.booking_id <> p_booking_id or previous.created_by <> auth.uid()
       or previous.amount <> amount or previous.payment_method <> method
       or previous.paid_at <> paid_time or previous.notes is distinct from notes then
      raise exception 'ID pagamento già usato con dati diversi.' using errcode = 'P0001';
    end if;
    return jsonb_build_object('booking_id', p_booking_id);
  end if;
  -- Un noleggio concluso può avere ancora un residuo: contano materiale e saldo.
  if booking.status = 'cancelled' then
    raise exception 'Il noleggio è annullato: non è possibile registrare il pagamento.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rental_booking_items where booking_id = p_booking_id)
     or exists (select 1 from public.rental_booking_items where booking_id = p_booking_id and returned_at is null) then
    raise exception 'Completa il rientro del materiale prima di registrare il saldo da questa pagina.' using errcode = 'P0001';
  end if;
  select coalesce(sum(i.amount),0) into subtotal from public.rental_booking_items i where i.booking_id = p_booking_id;
  select coalesce(sum(p.amount),0) into paid from public.rental_payments p where p.booking_id = p_booking_id;
  total := round(subtotal*(100-booking.discount_percent)/100,2);
  if paid >= total or amount > total-paid then
    raise exception 'L’importo supera il saldo residuo aggiornato. Aggiorna i rientri.' using errcode = 'P0001';
  end if;
  insert into public.rental_payments(id,booking_id,payment_method,amount,paid_at,created_by,notes)
    values(p_payment_id,p_booking_id,method,amount,paid_time,auth.uid(),notes);
  update public.rental_bookings set status = case when paid+amount >= total or booking.status = 'completed' then 'completed' else 'active' end
    where id = p_booking_id;
  return jsonb_build_object('booking_id', p_booking_id);
end;
$$;
revoke all on function public.skirenting_register_rental_payment(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.skirenting_register_rental_payment(uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
