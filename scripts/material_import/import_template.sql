-- SkiRenting: importazione completa dei 23 PDF (1305 esemplari).
-- Eseguire DOPO 002_material_catalog_and_inventory.sql.
-- Versione autonoma: nessuna tabella temporanea e nessun passaggio preliminare.
-- Eseguire l'intero file: il blocco DO contiene tutti i dati e importa atomicamente.
-- Tutti i nuovi esemplari vanno a Madesimo; riesecuzione senza duplicati.
-- NON cancella dati e NON ripristina sedi, stati o prezzi modificati.
-- Conserva anche i codici /, [FU2379N e GC4550%, segnalati per verifica.

do $skirenting_import$
declare
  import_rows jsonb := __PAYLOAD__::jsonb;
  expected_counts jsonb := __EXPECTED_COUNTS_JSON__::jsonb;
  variant_map jsonb := '{}'::jsonb;
  file_record record;
  incoming record;
  existing_item record;
  target_location_id uuid;
  target_category_id uuid;
  target_group_id uuid;
  target_variant_id uuid;
  candidate_ids uuid[];
  variants_created integer := 0;
  variants_reused integer := 0;
  items_created integer := 0;
  items_reused integer := 0;
begin
  perform set_config('lock_timeout', '10s', true);
  perform set_config('statement_timeout', '120s', true);

-- Serializza il caricamento rispetto ad altre scritture sullo stesso materiale.
lock table public.material_variants, public.rental_inventory,
  public.material_categories, public.material_groups,
  public.ski_details, public.snowboard_details, public.boot_details,
  public.helmet_details, public.accessory_details
  in share row exclusive mode;

  if jsonb_array_length(import_rows) <> 1305
    or (select count(distinct value->>'code') from jsonb_array_elements(import_rows)) <> 1305 then
    raise exception 'Importazione incompleta: devono esserci esattamente 1305 righe.';
  end if;
  if (select count(distinct value->>'source_file') from jsonb_array_elements(import_rows)) <> 23 then
    raise exception 'Devono essere presenti esattamente i 23 file originali.';
  end if;
  for file_record in select * from jsonb_each_text(expected_counts) loop
    if file_record.value::integer <> (
      select count(*) from jsonb_array_elements(import_rows) as r(value)
      where r.value->>'source_file' = file_record.key
    ) then
      raise exception 'Conteggio non coerente per il file %.', file_record.key;
    end if;
  end loop;

  select id into strict target_location_id
  from public.locations where lower(btrim(name)) = 'madesimo';

  for incoming in
    select * from jsonb_to_recordset(import_rows) as row_data(
      code text, category_code text, brand text, model text, year smallint,
      measure_canonical text, length_cm numeric, variant_key text,
      source_file text, source_page integer, warning text,
      group_name text, source_data jsonb
    ) order by source_file, code
  loop
    select id into strict target_category_id
    from public.material_categories where code = incoming.category_code;

    select id into strict target_group_id
    from public.material_groups
    where category_id = target_category_id and name = incoming.group_name;

    target_variant_id := (variant_map->>incoming.variant_key)::uuid;

    if target_variant_id is null then
      -- Riutilizza anche varianti inserite prima dell'importazione, incluso
      -- l'esempio dei tre sci. Una corrispondenza ambigua blocca tutto.
      select array_agg(v.id) into candidate_ids
      from public.material_variants v
      left join public.ski_details ski on ski.variant_id = v.id
      left join public.snowboard_details snow on snow.variant_id = v.id
      left join public.boot_details boots on boots.variant_id = v.id
      left join public.helmet_details helmet on helmet.variant_id = v.id
      left join public.accessory_details accessory on accessory.variant_id = v.id
      where v.category_id = target_category_id
        and v.brand = incoming.brand and v.model = incoming.model
        and v.year is not distinct from incoming.year
        and case incoming.category_code
          when 'ski' then ski.length_cm = incoming.length_cm
          when 'snowboard' then snow.length_cm = incoming.length_cm
          when 'ski_boots' then replace(btrim(boots.size_label), ',', '.') = incoming.measure_canonical
          when 'snowboard_boots' then replace(btrim(boots.size_label), ',', '.') = incoming.measure_canonical
          when 'helmet' then helmet.size_label = incoming.measure_canonical
          else accessory.size_label = incoming.measure_canonical
        end;

      if coalesce(cardinality(candidate_ids), 0) > 1 then
        raise exception 'Più varianti compatibili con % % anno % misura %. Verificare prima di importare.',
          incoming.brand, incoming.model, incoming.year, incoming.measure_canonical;
      elsif coalesce(cardinality(candidate_ids), 0) = 1 then
        target_variant_id := candidate_ids[1];
        variants_reused := variants_reused + 1;
      else
        insert into public.material_variants(category_id, brand, model, year)
        values(target_category_id, incoming.brand, incoming.model, incoming.year)
        returning id into target_variant_id;

        case incoming.category_code
          when 'ski' then
            insert into public.ski_details(variant_id, length_cm)
            values(target_variant_id, incoming.length_cm);
          when 'snowboard' then
            insert into public.snowboard_details(variant_id, length_cm)
            values(target_variant_id, incoming.length_cm);
          when 'ski_boots', 'snowboard_boots' then
            insert into public.boot_details(variant_id, size_label)
            values(target_variant_id, incoming.measure_canonical);
          when 'helmet' then
            insert into public.helmet_details(variant_id, size_label)
            values(target_variant_id, incoming.measure_canonical);
          else
            insert into public.accessory_details(variant_id, size_label)
            values(target_variant_id, incoming.measure_canonical);
        end case;
        variants_created := variants_created + 1;
      end if;

      variant_map := variant_map || jsonb_build_object(incoming.variant_key, target_variant_id);
    end if;

    select * into existing_item from public.rental_inventory where code = incoming.code;
    if found then
      if existing_item.variant_id <> target_variant_id then
        raise exception 'Codice % già presente con una variante diversa. Nessun dato è stato sovrascritto.', incoming.code;
      end if;
      if existing_item.source_data ? '__BATCH_KEY__'
        and existing_item.source_data -> '__BATCH_KEY__' <> incoming.source_data then
        raise exception 'Provenienza già registrata ma differente per codice %.', incoming.code;
      end if;
      -- Arricchisce la provenienza, preservando gruppo, sede, stato e prezzi
      -- correnti, anche dopo un trasferimento o una modifica manuale.
      if not (existing_item.source_data ? '__BATCH_KEY__') then
        update public.rental_inventory set
          source_file = coalesce(source_file, incoming.source_file),
          source_page = coalesce(source_page, incoming.source_page),
          source_data = source_data || jsonb_build_object('__BATCH_KEY__', incoming.source_data)
        where id = existing_item.id;
      end if;
      items_reused := items_reused + 1;
    else
      insert into public.rental_inventory (
        variant_id, group_id, location_id, code,
        status, is_rentable, is_bookable, legacy_status,
        notes, source_file, source_page, source_data
      ) values (
        target_variant_id, target_group_id, target_location_id, incoming.code,
        'active', true, true, 'Noleggiabile e prenotabile',
        nullif(incoming.warning, ''), incoming.source_file, incoming.source_page,
        jsonb_build_object('__BATCH_KEY__', incoming.source_data)
      );
      items_created := items_created + 1;
    end if;
  end loop;

  if (select count(*) from public.rental_inventory i
      join jsonb_to_recordset(import_rows) as r(code text, variant_key text) on r.code = i.code
      where i.variant_id = (variant_map->>r.variant_key)::uuid
        and i.source_data ? '__BATCH_KEY__') <> 1305 then
    raise exception 'Controllo finale fallito: non risultano 1305 esemplari coerenti con le fonti.';
  end if;

  raise notice 'Importazione verificata: 1305 articoli. Inseriti %, già presenti %. Varianti create %, riutilizzate %.',
    items_created, items_reused, variants_created, variants_reused;
end;
$skirenting_import$;

-- Questi riepiloghi leggono soltanto le tabelle definitive.
select f.source_file as file, f.expected_count as attesi, count(i.id) as presenti
from (values
__FILE_COUNTS__
) as f(source_file, expected_count)
left join public.rental_inventory i
  on i.source_data->'__BATCH_KEY__'->>'file' = f.source_file
group by f.source_file, f.expected_count order by f.source_file;

select count(*) as articoli_importati, count(distinct variant_id) as varianti
from public.rental_inventory where source_data ? '__BATCH_KEY__';

select l.name as sede, count(*) as articoli_importati
from public.rental_inventory i join public.locations l on l.id = i.location_id
where i.source_data ? '__BATCH_KEY__' group by l.id, l.name order by l.name;
