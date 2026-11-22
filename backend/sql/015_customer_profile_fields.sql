-- Eseguire tutto dopo 006. Rieseguibile: non importa clienti e non cancella dati.
begin;
alter table public.customers
  add column if not exists birth_date date,
  add column if not exists skill_level text,
  add column if not exists language text,
  add column if not exists country_code text;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.customers'::regclass and conname='customers_birth_date_valid') then
    alter table public.customers add constraint customers_birth_date_valid
      check (birth_date is null or (isfinite(birth_date) and birth_date <= (now() at time zone 'Europe/Rome')::date));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.customers'::regclass and conname='customers_skill_level_valid') then
    alter table public.customers add constraint customers_skill_level_valid
      check (skill_level is null or skill_level in ('beginner','intermediate','expert'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.customers'::regclass and conname='customers_language_valid') then
    alter table public.customers add constraint customers_language_valid
      check (language is null or language ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.customers'::regclass and conname='customers_country_code_valid') then
    alter table public.customers add constraint customers_country_code_valid
      check (country_code is null or country_code ~ '^[A-Z]{2}$');
  end if;
end;
$$;
comment on column public.customers.birth_date is 'Data di nascita facoltativa. L’età si calcola, non si salva.';
comment on column public.customers.skill_level is 'Livello: beginner=principiante, intermediate=intermedio, expert=esperto.';
comment on column public.customers.language is 'Codice lingua di due lettere maiuscole. I codici legacy conservano il significato del gestionale di origine.';
comment on column public.customers.country_code is 'Codice paese di due lettere maiuscole; non implica cittadinanza.';
-- Permessi e policy di 006 rimangono invariati. Albergo e sconto restano sulla prenotazione.
notify pgrst, 'reload schema';
commit;
