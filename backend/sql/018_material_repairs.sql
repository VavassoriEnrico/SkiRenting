-- Eseguire tutto dopo 002_material_catalog_and_inventory.sql.
-- Crea lo storico; invio/completamento e blocco del materiale saranno collegati dopo.
begin;

create table if not exists public.material_repairs (
  id uuid primary key default gen_random_uuid(),
  rental_inventory_id uuid not null references public.rental_inventory(id) on delete restrict,
  repair_type text not null
    check (repair_type in ('edges','wax','edges_and_wax','other')),
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','cancelled')),
  sent_at timestamptz not null default now() check (isfinite(sent_at)),
  completed_at timestamptz check (completed_at is null or isfinite(completed_at)),
  notes text check (notes is null or length(notes) <= 5000),
  created_by uuid not null default auth.uid()
    references public.operator_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_repairs_completion_status check (
    (status='completed' and completed_at is not null)
    or (status<>'completed' and completed_at is null)
  ),
  constraint material_repairs_date_order check (completed_at is null or completed_at >= sent_at)
);

-- Un solo intervento aperto per esemplare; lamine+sciolina vale un intervento.
create unique index if not exists material_repairs_one_open_per_item_idx
  on public.material_repairs(rental_inventory_id) where status='in_progress';
create index if not exists material_repairs_item_completed_idx
  on public.material_repairs(rental_inventory_id,completed_at desc);

comment on column public.material_repairs.rental_inventory_id is
  'Singolo esemplare (paio di sci o snowboard), non il modello o la variante.';
comment on column public.material_repairs.repair_type is
  'edges=lamine; wax=sciolina; edges_and_wax=lamine e sciolina; other=altro.';
comment on column public.material_repairs.status is
  'in_progress=in lavorazione; completed=completata; cancelled=annullata.';
comment on column public.material_repairs.completed_at is
  'Completamento effettivo: riferimento per contare i noleggi successivi alla manutenzione.';

-- Riutilizza il trigger timestamp già presente sul materiale.
drop trigger if exists material_repairs_updated_at on public.material_repairs;
create trigger material_repairs_updated_at before update on public.material_repairs
  for each row execute function public.skirenting_material_updated_at();

alter table public.material_repairs enable row level security;
revoke all on public.material_repairs from public,anon,authenticated;
grant select on public.material_repairs to authenticated;
drop policy if exists material_repairs_assigned_location_read on public.material_repairs;
create policy material_repairs_assigned_location_read on public.material_repairs
  for select to authenticated using (
    exists (
      select 1 from public.rental_inventory i
      join public.operator_locations ol on ol.location_id=i.location_id
      where i.id=rental_inventory_id and ol.operator_id=(select auth.uid())
    )
  );

-- Nessuna scrittura diretta degli operatori: la futura funzione transazionale
-- coordinerà manutenzione, prenotazioni e stato dell'esemplare.
notify pgrst, 'reload schema';
commit;
