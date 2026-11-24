-- Foto documento: bucket PRIVATO, massimo 5 MiB, JPEG/PNG/WebP.
-- Richiede le migrazioni precedenti. Nessun file viene salvato nel database.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-documents','customer-documents',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.skirenting_customer_document_access(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.operator_profiles p join public.operator_locations ol on ol.operator_id=p.id
    where p.id=(select auth.uid()))
    and exists(select 1 from public.customers c where c.id::text=split_part(object_name,'/',1) and c.deleted_at is null)
$$;
revoke all on function public.skirenting_customer_document_access(text) from public,anon;
grant execute on function public.skirenting_customer_document_access(text) to authenticated;
drop policy if exists customer_documents_read on storage.objects;
create policy customer_documents_read on storage.objects for select to authenticated
  using(bucket_id='customer-documents' and public.skirenting_customer_document_access(name));
drop policy if exists customer_documents_insert on storage.objects;
create policy customer_documents_insert on storage.objects for insert to authenticated
  with check(bucket_id='customer-documents' and public.skirenting_customer_document_access(name));
drop policy if exists customer_documents_delete on storage.objects;
create policy customer_documents_delete on storage.objects for delete to authenticated
  using(bucket_id='customer-documents' and public.skirenting_customer_document_access(name));
notify pgrst,'reload schema';
commit;
