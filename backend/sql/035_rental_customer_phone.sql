-- Il cellulare è obbligatorio quando si crea un NUOVO noleggio.
-- Non modifica i clienti storici e non blocca la loro importazione.
begin;
create or replace function public.skirenting_check_booking_customer_phone()
returns trigger language plpgsql set search_path='' as $$
declare customer_phone text;
begin
  if new.is_legacy then return new; end if;
  select phone into customer_phone from public.customers where id=new.customer_id for share;
  if nullif(btrim(customer_phone),'') is null then
    raise exception 'Inserisci il cellulare del cliente prima di confermare il noleggio.' using errcode='22023';
  end if;
  return new;
end; $$;
drop trigger if exists rental_bookings_customer_phone on public.rental_bookings;
create trigger rental_bookings_customer_phone before insert on public.rental_bookings
  for each row execute function public.skirenting_check_booking_customer_phone();
notify pgrst,'reload schema';
commit;
