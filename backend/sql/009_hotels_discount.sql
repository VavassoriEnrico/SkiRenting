-- Eseguire tutto dopo 008. Nessuno sconto viene applicato ai noleggi esistenti.
begin;

alter table public.hotels
  add column if not exists discount numeric(5,2) not null default 0
  check (discount between 0 and 100);
comment on column public.hotels.discount is
  'Sconto percentuale della convenzione: 15 significa 15%. Il noleggio conserverà la percentuale effettivamente applicata.';
grant insert (discount), update (discount) on public.hotels to authenticated;

notify pgrst, 'reload schema';
commit;
