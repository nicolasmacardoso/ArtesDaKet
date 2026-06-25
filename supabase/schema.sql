create table if not exists public.frames (
  id integer primary key check (id between 1 and 12),
  title text,
  image_path text,
  updated_at timestamptz default now()
);

alter table public.frames
add column if not exists title text;

insert into public.frames (id)
select generate_series(1, 12)
on conflict (id) do nothing;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.frames enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

drop policy if exists "Admin pode ver o próprio acesso" on public.admin_users;
create policy "Admin pode ver o próprio acesso"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

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
using (public.is_admin())
with check (public.is_admin());

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
  and public.is_admin()
);

drop policy if exists "Admin pode remover artes" on storage.objects;
create policy "Admin pode remover artes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artes'
  and public.is_admin()
);
