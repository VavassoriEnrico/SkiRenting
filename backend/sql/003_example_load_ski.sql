-- ESEMPIO FACOLTATIVO: carica SOLO 3 esemplari reali di ALLMOUNTAIN.pdf.
-- Eseguire dopo 002_material_catalog_and_inventory.sql, soltanto se questi codici
-- non sono già stati importati. Non è il caricamento completo dei 23 documenti.
-- Una ripetizione viene bloccata dal codice univoco e annulla tutta la transazione.

begin;

do $$
declare
  ski_category_id uuid;
  allmountain_group_id uuid;
  madesimo_id uuid;
  new_variant_id uuid;
begin
  select id into strict ski_category_id
  from public.material_categories where code = 'ski';

  select id into strict allmountain_group_id
  from public.material_groups
  where category_id = ski_category_id and name = 'ALLMOUNTAIN';

  select id into strict madesimo_id
  from public.locations where lower(btrim(name)) = 'madesimo';

  insert into public.material_variants (category_id, brand, model, year)
  values (ski_category_id, 'BLIZZARD', 'ANOMALY 84 R', 2025)
  returning id into new_variant_id;

  insert into public.ski_details (variant_id, length_cm)
  values (new_variant_id, 164);

  insert into public.rental_inventory (
    variant_id, group_id, location_id, code,
    legacy_status, source_file, source_page, source_data
  )
  select
    new_variant_id, allmountain_group_id, madesimo_id, original_code,
    'Noleggiabile e prenotabile', 'ALLMOUNTAIN.pdf', 1,
    jsonb_build_object(
      'CODICE', original_code,
      'TIPO', 'Sci', 'CATEGORIA', 'ALLMOUNTAIN',
      'MARCA', 'BLIZZARD', 'MODELLO', 'ANOMALY 84 R',
      'ANNO', 2025, 'MISURA', '164 cm',
      'STATO', 'Noleggiabile e prenotabile'
    )
  from unnest(array['PO445', 'PO539', 'PO540']) as original(original_code);
end;
$$;

commit;

select i.code, c.name as categoria, g.name as gruppo,
  v.brand, v.model, v.year, d.length_cm, l.name as sede
from public.rental_inventory i
join public.material_variants v on v.id = i.variant_id
join public.material_categories c on c.id = v.category_id
join public.material_groups g on g.id = i.group_id
join public.ski_details d on d.variant_id = v.id
join public.locations l on l.id = i.location_id
where i.code in ('PO445', 'PO539', 'PO540')
order by i.code;
