-- Dopo 015 (e 007 per i noleggi). Rieseguibile, non cancella righe esistenti.
begin;
alter table public.customers
  add column if not exists is_legacy boolean not null default false,
  add column if not exists deleted_at timestamptz;
comment on column public.customers.deleted_at is
  'Cancellazione logica: cliente nascosto dall’anagrafica, riferimenti storici conservati.';
-- I flag amministrativi non sono scrivibili tramite le API REST degli operatori.
revoke insert,update on public.customers from authenticated;
grant insert(id,first_name,last_name,phone,email,notes,document_path,created_at,updated_at,
             birth_date,skill_level,language,country_code),
      update(id,first_name,last_name,phone,email,notes,document_path,created_at,updated_at,
             birth_date,skill_level,language,country_code)
  on public.customers to authenticated;

create or replace function public.skirenting_delete_customer(p_customer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_deleted_at timestamptz;
begin
  perform 1 from public.operator_profiles p
    join public.operator_locations ol on ol.operator_id=p.id
    where p.id=auth.uid() for key share of p,ol;
  if not found then raise exception 'Operatore non autorizzato.' using errcode='42501'; end if;
  select deleted_at into current_deleted_at from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Cliente non trovato.' using errcode='P0002'; end if;
  if current_deleted_at is null then
    update public.customers set deleted_at=statement_timestamp() where id=p_customer_id;
  end if;
end;
$$;
revoke all on function public.skirenting_delete_customer(uuid) from public,anon;
grant execute on function public.skirenting_delete_customer(uuid) to authenticated;

-- Un cliente eliminato rimane nello storico ma non può iniziare nuovi noleggi.
-- Il lock coordina l'inserimento della prenotazione con la cancellazione.
create or replace function public.skirenting_check_booking_customer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare customer_deleted_at timestamptz;
begin
  if tg_op='UPDATE' and old.customer_id=new.customer_id then return new; end if;
  select deleted_at into customer_deleted_at from public.customers where id=new.customer_id for share;
  if not found or customer_deleted_at is not null then
    raise exception 'Cliente non più disponibile. Aggiorna l’anagrafica.' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.skirenting_check_booking_customer() from public,anon,authenticated;
drop trigger if exists rental_bookings_customer_available on public.rental_bookings;
create trigger rental_bookings_customer_available before insert or update of customer_id
  on public.rental_bookings for each row execute function public.skirenting_check_booking_customer();
notify pgrst, 'reload schema';
commit;
