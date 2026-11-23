-- Eseguire dopo 026. Listino pack GIORNALIERO per sci e snowboard.
-- Conserva prezzi singoli, tariffe stagionali e prenotazioni esistenti.
begin;

alter table public.rental_rates
  add column if not exists pack_price_1_day numeric(12,2) check (pack_price_1_day between 0 and 9999999999.99),
  add column if not exists pack_price_2_days numeric(12,2) check (pack_price_2_days between 0 and 9999999999.99),
  add column if not exists pack_price_3_days numeric(12,2) check (pack_price_3_days between 0 and 9999999999.99),
  add column if not exists pack_price_4_days numeric(12,2) check (pack_price_4_days between 0 and 9999999999.99),
  add column if not exists pack_price_5_days numeric(12,2) check (pack_price_5_days between 0 and 9999999999.99),
  add column if not exists pack_price_6_days numeric(12,2) check (pack_price_6_days between 0 and 9999999999.99),
  add column if not exists pack_price_7_plus_days numeric(12,2) check (pack_price_7_plus_days between 0 and 9999999999.99);

comment on column public.rental_rates.pack_price_1_day is 'Prezzo pack al giorno per un noleggio di una giornata. Null = da configurare; zero = gratuito.';
comment on column public.rental_rates.pack_price_7_plus_days is 'Prezzo pack al giorno per tutti i giorni di un noleggio di almeno sette giorni.';

create or replace function public.skirenting_check_daily_pack_rates()
returns trigger language plpgsql set search_path='' as $$
begin
  if (new.pack_price_1_day is not null or new.pack_price_2_days is not null
      or new.pack_price_3_days is not null or new.pack_price_4_days is not null
      or new.pack_price_5_days is not null or new.pack_price_6_days is not null
      or new.pack_price_7_plus_days is not null)
    and not exists(select 1 from public.material_groups g join public.material_categories c on c.id=g.category_id
      where g.id=new.group_id and c.detail_type in ('ski','snowboard')) then
    raise exception 'Il prezzo pack è previsto solo per sci e snowboard.' using errcode='23514';
  end if;
  return new;
end; $$;
drop trigger if exists rental_rates_pack_guard on public.rental_rates;
create trigger rental_rates_pack_guard before insert or update on public.rental_rates
  for each row execute function public.skirenting_check_daily_pack_rates();

grant update(pack_price_1_day,pack_price_2_days,pack_price_3_days,pack_price_4_days,
  pack_price_5_days,pack_price_6_days,pack_price_7_plus_days) on public.rental_rates to authenticated;
notify pgrst, 'reload schema';
commit;
