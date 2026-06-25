create table if not exists public.frames (
  id integer primary key check (id between 1 and 12),
  image_path text,
  updated_at timestamptz default now()
);

insert into public.frames (id)
select generate_series(1, 12)
on conflict (id) do nothing;

alter table public.frames enable row level security;

drop policy if exists "Qualquer pessoa pode ver os quadros" on public.frames;
create policy "Qualquer pessoa pode ver os quadros"
on public.frames
for select
using (true);

drop policy if exists "Admin pode atualizar os quadros" on public.frames;
create policy "Admin pode atualizar os quadros"
on public.frames
for all
to authenticated
using (lower(auth.jwt() ->> 'email') = lower('troque-pelo-email-da-admin@example.com'))
with check (lower(auth.jwt() ->> 'email') = lower('troque-pelo-email-da-admin@example.com'));

insert into storage.buckets (id, name, public)
values ('artes', 'artes', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Qualquer pessoa pode ver as artes" on storage.objects;
create policy "Qualquer pessoa pode ver as artes"
on storage.objects
for select
using (bucket_id = 'artes');

drop policy if exists "Admin pode enviar artes" on storage.objects;
create policy "Admin pode enviar artes"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artes'
  and lower(auth.jwt() ->> 'email') = lower('troque-pelo-email-da-admin@example.com')
);

drop policy if exists "Admin pode remover artes" on storage.objects;
create policy "Admin pode remover artes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artes'
  and lower(auth.jwt() ->> 'email') = lower('troque-pelo-email-da-admin@example.com')
);
