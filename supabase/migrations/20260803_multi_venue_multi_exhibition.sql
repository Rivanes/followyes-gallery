-- Berryboy Art Gallery — Stage 12D2
-- Multi-Venue / Multi-Exhibition data architecture.
-- Apply in a staging Supabase project first. This migration does not remove legacy gallery_state.

begin;

create extension if not exists pgcrypto;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','published','hidden','archived')),
  cover_media_id uuid,
  published_version_id uuid,
  draft_version_id uuid,
  previous_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venue_versions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  version_number text not null,
  manifest jsonb,
  manifest_url text,
  manifest_bucket text not null default 'venue-runtime',
  manifest_path text,
  schema_version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','published','previous','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, version_number),
  check (manifest is not null or nullif(manifest_url, '') is not null or nullif(manifest_path, '') is not null)
);

alter table public.venues
  drop constraint if exists venues_published_version_id_fkey,
  drop constraint if exists venues_draft_version_id_fkey,
  drop constraint if exists venues_previous_version_id_fkey;
alter table public.venues
  add constraint venues_published_version_id_fkey foreign key (published_version_id) references public.venue_versions(id) on delete set null,
  add constraint venues_draft_version_id_fkey foreign key (draft_version_id) references public.venue_versions(id) on delete set null,
  add constraint venues_previous_version_id_fkey foreign key (previous_version_id) references public.venue_versions(id) on delete set null;

create table if not exists public.venue_assets (
  id uuid primary key default gen_random_uuid(),
  venue_version_id uuid not null references public.venue_versions(id) on delete cascade,
  asset_id text not null,
  role text not null check (role in ('walls','floor','ceiling','props','building','collision','navigation','decorations')),
  storage_bucket text,
  storage_path text,
  public_url text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  file_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (venue_version_id, asset_id)
);

create table if not exists public.exhibitions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  subtitle text not null default '',
  short_description text not null default '',
  long_description text not null default '',
  cover_media_id uuid,
  mobile_cover_media_id uuid,
  logo_media_id uuid,
  status text not null default 'draft' check (status in ('draft','scheduled','published','hidden','archived')),
  display_order integer not null default 0,
  button_label text not null default 'Enter gallery',
  curator text not null default '',
  start_date timestamptz,
  end_date timestamptz,
  scheduled_at timestamptz,
  theme jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.exhibition_states (
  exhibition_id uuid primary key,
  venue_id uuid not null references public.venues(id) on delete restrict,
  draft_venue_version_id uuid,
  draft_state jsonb,
  draft_revision bigint not null default 0 check (draft_revision >= 0),
  draft_updated_at timestamptz,
  published_venue_version_id uuid,
  published_state jsonb,
  published_revision bigint not null default 0 check (published_revision >= 0),
  published_at timestamptz,
  previous_venue_version_id uuid,
  previous_state jsonb,
  previous_revision bigint not null default 0 check (previous_revision >= 0),
  previous_published_at timestamptz,
  schema_version integer not null default 1,
  lock_version bigint not null default 0 check (lock_version >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((draft_state is null and draft_venue_version_id is null) or (draft_state is not null and draft_venue_version_id is not null)),
  check ((published_state is null and published_venue_version_id is null) or (published_state is not null and published_venue_version_id is not null)),
  check ((previous_state is null and previous_venue_version_id is null) or (previous_state is not null and previous_venue_version_id is not null))
);

-- Composite constraints prevent an Exhibition state from pointing at another Venue's version.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venue_versions_id_venue_key' and conrelid = 'public.venue_versions'::regclass) then
    alter table public.venue_versions add constraint venue_versions_id_venue_key unique (id, venue_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exhibitions_id_venue_key' and conrelid = 'public.exhibitions'::regclass) then
    alter table public.exhibitions add constraint exhibitions_id_venue_key unique (id, venue_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exhibition_states_exhibition_venue_fkey' and conrelid = 'public.exhibition_states'::regclass) then
    alter table public.exhibition_states add constraint exhibition_states_exhibition_venue_fkey
      foreign key (exhibition_id, venue_id) references public.exhibitions(id, venue_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exhibition_states_draft_version_venue_fkey' and conrelid = 'public.exhibition_states'::regclass) then
    alter table public.exhibition_states add constraint exhibition_states_draft_version_venue_fkey
      foreign key (draft_venue_version_id, venue_id) references public.venue_versions(id, venue_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exhibition_states_published_version_venue_fkey' and conrelid = 'public.exhibition_states'::regclass) then
    alter table public.exhibition_states add constraint exhibition_states_published_version_venue_fkey
      foreign key (published_venue_version_id, venue_id) references public.venue_versions(id, venue_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exhibition_states_previous_version_venue_fkey' and conrelid = 'public.exhibition_states'::regclass) then
    alter table public.exhibition_states add constraint exhibition_states_previous_version_venue_fkey
      foreign key (previous_venue_version_id, venue_id) references public.venue_versions(id, venue_id) on delete restrict;
  end if;
end $$;

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('platform','venue','exhibition')),
  owner_id uuid,
  media_type text not null,
  storage_bucket text not null default 'platform-media',
  original_path text,
  desktop_avif_path text,
  mobile_avif_path text,
  preview_avif_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (owner_type = 'platform' and owner_id is null)
    or (owner_type in ('venue','exhibition') and owner_id is not null)
  ),
  check (
    nullif(original_path, '') is not null or
    nullif(desktop_avif_path, '') is not null or
    nullif(mobile_avif_path, '') is not null or
    nullif(preview_avif_path, '') is not null
  )
);

create table if not exists public.media_usages (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_library(id) on delete cascade,
  owner_type text not null check (owner_type in ('venue','exhibition','site')),
  owner_id uuid not null,
  entity_type text not null default 'state',
  entity_id text not null,
  usage_role text not null default 'state-reference',
  created_at timestamptz not null default now(),
  unique (media_id, owner_type, owner_id, entity_type, entity_id, usage_role)
);

create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  biography text not null default '',
  photo_media_id uuid references public.media_library(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exhibition_authors (
  exhibition_id uuid not null references public.exhibitions(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  display_order integer not null default 0,
  role_label text not null default '',
  primary key (exhibition_id, author_id)
);

create table if not exists public.platform_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_admin','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.venue_memberships (
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('venue_admin','viewer')),
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

create table if not exists public.exhibition_memberships (
  exhibition_id uuid not null references public.exhibitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('curator','viewer')),
  created_at timestamptz not null default now(),
  primary key (exhibition_id, user_id)
);

create table if not exists public.exhibition_audit_log (
  id bigint generated always as identity primary key,
  exhibition_id uuid references public.exhibitions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  revision bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exhibitions_public_order_idx on public.exhibitions(status, display_order, created_at);
create index if not exists exhibition_states_venue_idx on public.exhibition_states(venue_id);
create index if not exists venue_versions_lookup_idx on public.venue_versions(venue_id, version_number);
create index if not exists media_usages_media_idx on public.media_usages(media_id);
create index if not exists media_usages_owner_idx on public.media_usages(owner_type, owner_id);
create index if not exists media_library_paths_idx on public.media_library(storage_bucket, original_path, desktop_avif_path, mobile_avif_path, preview_avif_path);

-- Deferred FKs for media references.
alter table public.venues drop constraint if exists venues_cover_media_id_fkey;
alter table public.venues add constraint venues_cover_media_id_fkey foreign key (cover_media_id) references public.media_library(id) on delete set null;
alter table public.exhibitions drop constraint if exists exhibitions_cover_media_id_fkey;
alter table public.exhibitions drop constraint if exists exhibitions_mobile_cover_media_id_fkey;
alter table public.exhibitions drop constraint if exists exhibitions_logo_media_id_fkey;
alter table public.exhibitions add constraint exhibitions_cover_media_id_fkey foreign key (cover_media_id) references public.media_library(id) on delete set null;
alter table public.exhibitions add constraint exhibitions_mobile_cover_media_id_fkey foreign key (mobile_cover_media_id) references public.media_library(id) on delete set null;
alter table public.exhibitions add constraint exhibitions_logo_media_id_fkey foreign key (logo_media_id) references public.media_library(id) on delete set null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_memberships
    where user_id = p_user_id and role = 'platform_admin'
  );
$$;

create or replace function public.can_edit_venue(p_venue_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(p_user_id) or exists (
    select 1 from public.venue_memberships
    where venue_id = p_venue_id and user_id = p_user_id and role = 'venue_admin'
  );
$$;

create or replace function public.can_edit_exhibition(p_exhibition_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(p_user_id)
    or exists (
      select 1
      from public.exhibitions e
      join public.venue_memberships vm on vm.venue_id = e.venue_id
      where e.id = p_exhibition_id and vm.user_id = p_user_id and vm.role = 'venue_admin'
    )
    or exists (
      select 1 from public.exhibition_memberships em
      where em.exhibition_id = p_exhibition_id and em.user_id = p_user_id and em.role = 'curator'
    );
$$;


create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Public catalog. It exposes no draft state.
create or replace function public.list_published_exhibitions()
returns table (
  id uuid,
  slug text,
  title text,
  subtitle text,
  short_description text,
  long_description text,
  status text,
  display_order integer,
  button_label text,
  curator text,
  start_date timestamptz,
  end_date timestamptz,
  scheduled_at timestamptz,
  database_venue_id uuid,
  venue_slug text,
  venue_name text,
  cover_media_id uuid,
  mobile_cover_media_id uuid,
  logo_media_id uuid,
  theme jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.title, e.subtitle, e.short_description, e.long_description,
         e.status, e.display_order, e.button_label, e.curator, e.start_date, e.end_date,
         e.scheduled_at, e.venue_id, v.slug, v.name, e.cover_media_id,
         e.mobile_cover_media_id, e.logo_media_id, e.theme
  from public.exhibitions e
  join public.venues v on v.id = e.venue_id
  join public.exhibition_states es on es.exhibition_id = e.id
  where (e.status = 'published' or (e.status = 'scheduled' and e.scheduled_at is not null and e.scheduled_at <= now()))
    and es.published_state is not null
    and es.published_venue_version_id is not null
    and (e.start_date is null or e.start_date <= now())
    and (e.end_date is null or e.end_date >= now())
  order by e.display_order, e.created_at;
$$;

-- Public runtime resolver. Only the selected published snapshot is returned.
create or replace function public.resolve_published_exhibition(
  p_exhibition_id uuid default null,
  p_exhibition_slug text default null
)
returns table (
  id uuid,
  slug text,
  title text,
  subtitle text,
  short_description text,
  long_description text,
  status text,
  display_order integer,
  button_label text,
  curator text,
  start_date timestamptz,
  end_date timestamptz,
  scheduled_at timestamptz,
  database_venue_id uuid,
  venue_slug text,
  venue_name text,
  database_venue_version_id uuid,
  venue_version_number text,
  manifest jsonb,
  manifest_url text,
  manifest_bucket text,
  manifest_path text,
  published_state jsonb,
  published_revision bigint,
  published_at timestamptz,
  lock_version bigint,
  cover_media_id uuid,
  mobile_cover_media_id uuid,
  logo_media_id uuid,
  theme jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.title, e.subtitle, e.short_description, e.long_description,
         e.status, e.display_order, e.button_label, e.curator, e.start_date, e.end_date,
         e.scheduled_at, e.venue_id, v.slug, v.name, vv.id, vv.version_number,
         vv.manifest, vv.manifest_url, vv.manifest_bucket, vv.manifest_path, es.published_state,
         es.published_revision, es.published_at, es.lock_version, e.cover_media_id,
         e.mobile_cover_media_id, e.logo_media_id, e.theme
  from public.exhibitions e
  join public.venues v on v.id = e.venue_id
  join public.exhibition_states es on es.exhibition_id = e.id
  join public.venue_versions vv on vv.id = es.published_venue_version_id and vv.venue_id = e.venue_id
  where (e.status = 'published' or (e.status = 'scheduled' and e.scheduled_at is not null and e.scheduled_at <= now()))
    and es.published_state is not null
    and (p_exhibition_id is null or e.id = p_exhibition_id)
    and (p_exhibition_slug is null or e.slug = p_exhibition_slug)
    and (p_exhibition_id is not null or p_exhibition_slug is not null)
    and (e.start_date is null or e.start_date <= now())
    and (e.end_date is null or e.end_date >= now())
  limit 1;
$$;

create or replace function public.save_exhibition_draft(
  p_exhibition_id uuid,
  p_expected_draft_revision bigint,
  p_expected_lock_version bigint,
  p_venue_id uuid,
  p_venue_version_id uuid,
  p_state jsonb
)
returns table (draft_revision bigint, lock_version bigint, draft_updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.exhibition_states%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to edit exhibition' using errcode = '42501';
  end if;
  if not exists (select 1 from public.exhibitions where id = p_exhibition_id and venue_id = p_venue_id) then
    raise exception 'exhibition venue mismatch' using errcode = '23514';
  end if;
  if not exists (select 1 from public.venue_versions where id = p_venue_version_id and venue_id = p_venue_id) then
    raise exception 'venue version mismatch' using errcode = '23514';
  end if;

  select * into v_row from public.exhibition_states where exhibition_id = p_exhibition_id for update;
  if not found then
    if coalesce(p_expected_draft_revision, 0) <> 0 or coalesce(p_expected_lock_version, 0) <> 0 then
      raise exception 'revision conflict' using errcode = '40001';
    end if;
    insert into public.exhibition_states (
      exhibition_id, venue_id, draft_venue_version_id, draft_state, draft_revision,
      draft_updated_at, lock_version, updated_by, updated_at
    ) values (
      p_exhibition_id, p_venue_id, p_venue_version_id, p_state, 1,
      v_now, 1, auth.uid(), v_now
    ) returning * into v_row;
  else
    if v_row.draft_revision <> coalesce(p_expected_draft_revision, 0)
       or v_row.lock_version <> coalesce(p_expected_lock_version, 0) then
      raise exception 'revision conflict' using errcode = '40001';
    end if;
    update public.exhibition_states
       set venue_id = p_venue_id,
           draft_venue_version_id = p_venue_version_id,
           draft_state = p_state,
           draft_revision = draft_revision + 1,
           draft_updated_at = v_now,
           lock_version = lock_version + 1,
           updated_by = auth.uid(),
           updated_at = v_now
     where exhibition_id = p_exhibition_id
     returning * into v_row;
  end if;

  update public.exhibitions set venue_id = p_venue_id, updated_at = v_now where id = p_exhibition_id;
  insert into public.exhibition_audit_log(exhibition_id,user_id,action,revision)
  values (p_exhibition_id,auth.uid(),'save_draft',v_row.draft_revision);
  return query select v_row.draft_revision, v_row.lock_version, v_row.draft_updated_at;
end;
$$;

create or replace function public.publish_exhibition_state(
  p_exhibition_id uuid,
  p_expected_draft_revision bigint,
  p_expected_lock_version bigint
)
returns table (
  draft_revision bigint,
  published_revision bigint,
  previous_revision bigint,
  lock_version bigint,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.exhibition_states%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to publish exhibition' using errcode = '42501';
  end if;
  select * into v_row from public.exhibition_states where exhibition_id = p_exhibition_id for update;
  if not found or v_row.draft_state is null or v_row.draft_venue_version_id is null then
    raise exception 'draft is empty' using errcode = '23514';
  end if;
  if v_row.draft_revision <> p_expected_draft_revision or v_row.lock_version <> p_expected_lock_version then
    raise exception 'revision conflict' using errcode = '40001';
  end if;

  update public.exhibition_states
     set previous_venue_version_id = published_venue_version_id,
         previous_state = case when published_state is null then null else jsonb_set(published_state,'{channel}','"previous"'::jsonb,true) end,
         previous_revision = published_revision,
         previous_published_at = published_at,
         published_venue_version_id = draft_venue_version_id,
         published_state = jsonb_set(draft_state,'{channel}','"published"'::jsonb,true),
         published_revision = draft_revision,
         published_at = v_now,
         lock_version = lock_version + 1,
         updated_by = auth.uid(),
         updated_at = v_now
   where exhibition_id = p_exhibition_id
   returning * into v_row;

  update public.exhibitions set status = 'published', updated_at = v_now where id = p_exhibition_id;
  insert into public.exhibition_audit_log(exhibition_id,user_id,action,revision)
  values (p_exhibition_id,auth.uid(),'publish',v_row.published_revision);
  return query select v_row.draft_revision, v_row.published_revision, v_row.previous_revision, v_row.lock_version, v_row.published_at;
end;
$$;

create or replace function public.rollback_exhibition_state(
  p_exhibition_id uuid,
  p_expected_lock_version bigint
)
returns table (published_revision bigint, previous_revision bigint, lock_version bigint, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.exhibition_states%rowtype;
  v_now timestamptz := now();
  v_current_state jsonb;
  v_current_version uuid;
  v_current_revision bigint;
  v_current_published_at timestamptz;
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to rollback exhibition' using errcode = '42501';
  end if;
  select * into v_row from public.exhibition_states where exhibition_id = p_exhibition_id for update;
  if not found or v_row.previous_state is null or v_row.previous_venue_version_id is null then
    raise exception 'previous state is empty' using errcode = '23514';
  end if;
  if v_row.lock_version <> p_expected_lock_version then
    raise exception 'lock conflict' using errcode = '40001';
  end if;

  v_current_state := v_row.published_state;
  v_current_version := v_row.published_venue_version_id;
  v_current_revision := v_row.published_revision;
  v_current_published_at := v_row.published_at;

  update public.exhibition_states
     set published_state = jsonb_set(previous_state,'{channel}','"published"'::jsonb,true),
         published_venue_version_id = previous_venue_version_id,
         published_revision = previous_revision,
         published_at = v_now,
         previous_state = case when v_current_state is null then null else jsonb_set(v_current_state,'{channel}','"previous"'::jsonb,true) end,
         previous_venue_version_id = v_current_version,
         previous_revision = v_current_revision,
         previous_published_at = v_current_published_at,
         lock_version = lock_version + 1,
         updated_by = auth.uid(),
         updated_at = v_now
   where exhibition_id = p_exhibition_id
   returning * into v_row;

  insert into public.exhibition_audit_log(exhibition_id,user_id,action,revision)
  values (p_exhibition_id,auth.uid(),'rollback',v_row.published_revision);
  return query select v_row.published_revision, v_row.previous_revision, v_row.lock_version, v_row.published_at;
end;
$$;

create or replace function public.register_exhibition_media(
  p_exhibition_id uuid,
  p_media_id uuid,
  p_media_type text,
  p_bucket text,
  p_original_path text,
  p_desktop_avif_path text,
  p_mobile_avif_path text,
  p_preview_avif_path text,
  p_entity_type text,
  p_entity_id text,
  p_usage_role text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to register exhibition media' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.media_library
    where id = p_media_id
      and (owner_type is distinct from 'exhibition' or owner_id is distinct from p_exhibition_id)
  ) then
    raise exception 'media id belongs to another owner' using errcode = '23505';
  end if;

  insert into public.media_library (
    id, owner_type, owner_id, media_type, storage_bucket, original_path,
    desktop_avif_path, mobile_avif_path, preview_avif_path, metadata, created_by
  ) values (
    p_media_id, 'exhibition', p_exhibition_id, p_media_type, coalesce(nullif(p_bucket,''),'platform-media'),
    p_original_path, p_desktop_avif_path, p_mobile_avif_path, p_preview_avif_path,
    coalesce(p_metadata,'{}'::jsonb), auth.uid()
  )
  on conflict (id) do update set
    media_type = excluded.media_type,
    storage_bucket = excluded.storage_bucket,
    original_path = excluded.original_path,
    desktop_avif_path = excluded.desktop_avif_path,
    mobile_avif_path = excluded.mobile_avif_path,
    preview_avif_path = excluded.preview_avif_path,
    metadata = public.media_library.metadata || excluded.metadata,
    updated_at = now(),
    deleted_at = null;

  insert into public.media_usages(media_id,owner_type,owner_id,entity_type,entity_id,usage_role)
  values (p_media_id,'exhibition',p_exhibition_id,coalesce(nullif(p_entity_type,''),'state'),coalesce(nullif(p_entity_id,''),p_media_id::text),coalesce(nullif(p_usage_role,''),'state-reference'))
  on conflict do nothing;
  return p_media_id;
end;
$$;

create or replace function public.sync_exhibition_media_usages(
  p_exhibition_id uuid,
  p_usages jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage jsonb;
  v_media_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to synchronize exhibition media' using errcode = '42501';
  end if;
  delete from public.media_usages where owner_type = 'exhibition' and owner_id = p_exhibition_id;
  for v_usage in select value from jsonb_array_elements(coalesce(p_usages,'[]'::jsonb)) loop
    v_media_id := public.try_uuid(v_usage->>'media_id');
    if v_media_id is not null and exists (
      select 1 from public.media_library
      where id = v_media_id
        and (owner_type = 'exhibition' and owner_id = p_exhibition_id or owner_type = 'platform')
        and deleted_at is null
    ) then
      insert into public.media_usages(media_id,owner_type,owner_id,entity_type,entity_id,usage_role)
      values (
        v_media_id,
        'exhibition',
        p_exhibition_id,
        coalesce(nullif(v_usage->>'entity_type',''),'state'),
        coalesce(nullif(v_usage->>'entity_id',''),v_media_id::text),
        coalesce(nullif(v_usage->>'usage_role',''),'state-reference')
      ) on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.detach_media_usage(
  p_media_id uuid,
  p_owner_type text,
  p_owner_id uuid,
  p_entity_type text default null,
  p_entity_id text default null,
  p_usage_role text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if p_owner_type is distinct from 'exhibition' or p_owner_id is null then
    raise exception 'only exhibition media usages can be detached by this RPC' using errcode = '42501';
  end if;
  if auth.uid() is null or not public.can_edit_exhibition(p_owner_id, auth.uid()) then
    raise exception 'not allowed to detach media usage' using errcode = '42501';
  end if;
  delete from public.media_usages
   where media_id = p_media_id and owner_type = 'exhibition' and owner_id = p_owner_id
     and (p_entity_type is null or entity_type = p_entity_type)
     and (p_entity_id is null or entity_id = p_entity_id)
     and (p_usage_role is null or usage_role = p_usage_role);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Returns only paths owned by the active Exhibition and unused everywhere.
-- Unknown paths outside exhibitions/{exhibitionId}/ fail closed.
create or replace function public.filter_deletable_media_paths(
  p_exhibition_id uuid,
  p_bucket text,
  p_paths text[]
)
returns table(path text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to inspect media references' using errcode = '42501';
  end if;

  return query
  select candidate.path
  from unnest(coalesce(p_paths,array[]::text[])) candidate(path)
  where (
      candidate.path like ('exhibitions/' || p_exhibition_id::text || '/%')
      or exists (
        select 1 from public.media_library owned
        where owned.owner_type = 'exhibition'
          and owned.owner_id = p_exhibition_id
          and owned.storage_bucket = p_bucket
          and candidate.path in (owned.original_path,owned.desktop_avif_path,owned.mobile_avif_path,owned.preview_avif_path)
      )
    )
    and not exists (
      select 1
      from public.media_library m
      where m.deleted_at is null
        and m.storage_bucket = p_bucket
        and candidate.path in (m.original_path,m.desktop_avif_path,m.mobile_avif_path,m.preview_avif_path)
        and (
          m.owner_type is distinct from 'exhibition'
          or m.owner_id is distinct from p_exhibition_id
          or exists (select 1 from public.media_usages u where u.media_id = m.id)
        )
    );
end;
$$;

create or replace function public.confirm_deleted_media_paths(
  p_exhibition_id uuid,
  p_bucket text,
  p_paths text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.can_edit_exhibition(p_exhibition_id, auth.uid()) then
    raise exception 'not allowed to confirm media deletion' using errcode = '42501';
  end if;
  update public.media_library m
     set deleted_at = now(), updated_at = now()
   where m.owner_type = 'exhibition'
     and m.owner_id = p_exhibition_id
     and m.storage_bucket = p_bucket
     and not exists (select 1 from public.media_usages u where u.media_id = m.id)
     and exists (
       select 1 from unnest(coalesce(p_paths,array[]::text[])) p(path)
       where p.path in (m.original_path,m.desktop_avif_path,m.mobile_avif_path,m.preview_avif_path)
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Seed/migrate the current Berryboy state without overwriting any D2 row.
create or replace function public.migrate_legacy_berryboy_main()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_id uuid;
  v_version_id uuid;
  v_exhibition_id uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_state jsonb;
  v_previous jsonb;
  v_revision bigint := 1;
begin
  if auth.uid() is null or not public.is_platform_admin(auth.uid()) then
    raise exception 'platform admin required' using errcode = '42501';
  end if;
  if to_regclass('public.gallery_state') is null then
    raise exception 'legacy gallery_state table not found' using errcode = '42P01';
  end if;
  execute 'select state from public.gallery_state where id = $1 order by updated_at desc nulls last limit 1' into v_state using 'main';
  execute 'select state from public.gallery_state where id = $1 order by updated_at desc nulls last limit 1' into v_previous using 'main_previous';
  if v_state is null then
    raise exception 'legacy gallery_state/main record not found' using errcode = 'P0002';
  end if;
  if coalesce(v_state#>>'{saveIntegrity,revision}','') ~ '^[0-9]+$' then
    v_revision := greatest(1, (v_state#>>'{saveIntegrity,revision}')::bigint);
  end if;

  insert into public.venues(slug,name,status)
  values ('berryboy-main','Berryboy Main','published')
  on conflict (slug) do update set updated_at = now()
  returning id into v_venue_id;

  insert into public.venue_versions(venue_id,version_number,manifest_url,status,created_by)
  values (v_venue_id,'v1','./venues/berryboy-main/versions/v1/manifest.json','published',auth.uid())
  on conflict (venue_id,version_number) do update set status = 'published', updated_at = now()
  returning id into v_version_id;

  update public.venues set published_version_id=v_version_id,draft_version_id=v_version_id,updated_at=now() where id=v_venue_id;

  insert into public.exhibitions(id,venue_id,slug,title,status,created_by)
  values (v_exhibition_id,v_venue_id,'berryboy-main','Berryboy Art Gallery','published',auth.uid())
  on conflict (id) do update set venue_id=v_venue_id,updated_at=now();

  insert into public.exhibition_states(
    exhibition_id,venue_id,draft_venue_version_id,draft_state,draft_revision,draft_updated_at,
    published_venue_version_id,published_state,published_revision,published_at,
    previous_venue_version_id,previous_state,previous_revision,previous_published_at,
    lock_version,updated_by
  ) values (
    v_exhibition_id,v_venue_id,v_version_id,v_state,v_revision,now(),
    v_version_id,v_state,v_revision,now(),
    case when v_previous is null then null else v_version_id end,v_previous,case when v_previous is null then 0 else 1 end,case when v_previous is null then null else now() end,
    1,auth.uid()
  ) on conflict (exhibition_id) do nothing;

  return v_exhibition_id;
end;
$$;

-- updated_at triggers
DO $$
declare t text;
begin
  foreach t in array array['venues','venue_versions','exhibitions','media_library','authors'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_'||t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', 'trg_'||t||'_updated_at', t);
  end loop;
end $$;

-- RLS: public runtime goes through the two SECURITY DEFINER functions above.
alter table public.venues enable row level security;
alter table public.venue_versions enable row level security;
alter table public.venue_assets enable row level security;
alter table public.exhibitions enable row level security;
alter table public.exhibition_states enable row level security;
alter table public.media_library enable row level security;
alter table public.media_usages enable row level security;
alter table public.authors enable row level security;
alter table public.exhibition_authors enable row level security;
alter table public.platform_memberships enable row level security;
alter table public.venue_memberships enable row level security;
alter table public.exhibition_memberships enable row level security;
alter table public.exhibition_audit_log enable row level security;

-- Authenticated editor policies. No anonymous direct state-table access.
drop policy if exists venues_editor_select on public.venues;
create policy venues_editor_select on public.venues for select to authenticated using (
  public.can_edit_venue(id)
  or exists (
    select 1 from public.exhibitions e
    where e.venue_id = venues.id and public.can_edit_exhibition(e.id)
  )
);
drop policy if exists venue_versions_editor_all on public.venue_versions;
drop policy if exists venue_versions_editor_select on public.venue_versions;
drop policy if exists venue_versions_admin_insert on public.venue_versions;
drop policy if exists venue_versions_admin_update on public.venue_versions;
drop policy if exists venue_versions_admin_delete on public.venue_versions;
create policy venue_versions_editor_select on public.venue_versions for select to authenticated using (
  public.can_edit_venue(venue_id)
  or exists (
    select 1 from public.exhibition_states es
    where es.venue_id = venue_versions.venue_id
      and venue_versions.id in (es.draft_venue_version_id, es.published_venue_version_id, es.previous_venue_version_id)
      and public.can_edit_exhibition(es.exhibition_id)
  )
);
create policy venue_versions_admin_insert on public.venue_versions for insert to authenticated with check (public.can_edit_venue(venue_id));
create policy venue_versions_admin_update on public.venue_versions for update to authenticated using (public.can_edit_venue(venue_id)) with check (public.can_edit_venue(venue_id));
create policy venue_versions_admin_delete on public.venue_versions for delete to authenticated using (public.can_edit_venue(venue_id));
drop policy if exists venue_assets_editor_all on public.venue_assets;
create policy venue_assets_editor_all on public.venue_assets for all to authenticated using (exists(select 1 from public.venue_versions vv where vv.id=venue_version_id and public.can_edit_venue(vv.venue_id))) with check (exists(select 1 from public.venue_versions vv where vv.id=venue_version_id and public.can_edit_venue(vv.venue_id)));
drop policy if exists exhibitions_editor_all on public.exhibitions;
create policy exhibitions_editor_all on public.exhibitions for all to authenticated using (public.can_edit_exhibition(id) or public.can_edit_venue(venue_id)) with check (public.can_edit_venue(venue_id) or public.is_platform_admin());
drop policy if exists exhibition_states_editor_select on public.exhibition_states;
create policy exhibition_states_editor_select on public.exhibition_states for select to authenticated using (public.can_edit_exhibition(exhibition_id));
drop policy if exists media_library_editor_select on public.media_library;
create policy media_library_editor_select on public.media_library for select to authenticated using (owner_type='platform' or (owner_type='exhibition' and public.can_edit_exhibition(owner_id)) or (owner_type='venue' and public.can_edit_venue(owner_id)));
drop policy if exists media_usages_editor_select on public.media_usages;
create policy media_usages_editor_select on public.media_usages for select to authenticated using (owner_type='exhibition' and public.can_edit_exhibition(owner_id));
drop policy if exists authors_authenticated_select on public.authors;
create policy authors_authenticated_select on public.authors for select to authenticated using (true);
drop policy if exists audit_editor_select on public.exhibition_audit_log;
create policy audit_editor_select on public.exhibition_audit_log for select to authenticated using (exhibition_id is null and public.is_platform_admin() or public.can_edit_exhibition(exhibition_id));

revoke all on public.exhibition_states from anon;
revoke all on public.exhibitions from anon;
revoke all on public.venue_versions from anon;

revoke all on function public.list_published_exhibitions() from public, anon, authenticated;
revoke all on function public.resolve_published_exhibition(uuid,text) from public, anon, authenticated;
revoke all on function public.save_exhibition_draft(uuid,bigint,bigint,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.publish_exhibition_state(uuid,bigint,bigint) from public, anon, authenticated;
revoke all on function public.rollback_exhibition_state(uuid,bigint) from public, anon, authenticated;
revoke all on function public.register_exhibition_media(uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.sync_exhibition_media_usages(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.detach_media_usage(uuid,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.filter_deletable_media_paths(uuid,text,text[]) from public, anon, authenticated;
revoke all on function public.confirm_deleted_media_paths(uuid,text,text[]) from public, anon, authenticated;
revoke all on function public.migrate_legacy_berryboy_main() from public, anon, authenticated;
revoke all on function public.is_platform_admin(uuid) from public, anon, authenticated;
revoke all on function public.can_edit_venue(uuid,uuid) from public, anon, authenticated;
revoke all on function public.can_edit_exhibition(uuid,uuid) from public, anon, authenticated;
revoke all on function public.try_uuid(text) from public, anon, authenticated;

grant execute on function public.list_published_exhibitions() to anon, authenticated;
grant execute on function public.resolve_published_exhibition(uuid,text) to anon, authenticated;
grant execute on function public.save_exhibition_draft(uuid,bigint,bigint,uuid,uuid,jsonb) to authenticated;
grant execute on function public.publish_exhibition_state(uuid,bigint,bigint) to authenticated;
grant execute on function public.rollback_exhibition_state(uuid,bigint) to authenticated;
grant execute on function public.register_exhibition_media(uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.sync_exhibition_media_usages(uuid,jsonb) to authenticated;
grant execute on function public.detach_media_usage(uuid,text,uuid,text,text,text) to authenticated;
grant execute on function public.filter_deletable_media_paths(uuid,text,text[]) to authenticated;
grant execute on function public.confirm_deleted_media_paths(uuid,text,text[]) to authenticated;
grant execute on function public.migrate_legacy_berryboy_main() to authenticated;
grant execute on function public.is_platform_admin(uuid) to authenticated;
grant execute on function public.can_edit_venue(uuid,uuid) to authenticated;
grant execute on function public.can_edit_exhibition(uuid,uuid) to authenticated;
grant execute on function public.try_uuid(text) to authenticated;

-- Storage buckets and path ownership. Existing objects are not moved automatically.
insert into storage.buckets (id, name, public, file_size_limit)
values ('platform-media','platform-media',true,104857600)
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('venue-runtime','venue-runtime',true,524288000)
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit;


drop policy if exists d2_public_storage_read on storage.objects;
create policy d2_public_storage_read
on storage.objects for select to public
using (bucket_id in ('platform-media','venue-runtime'));

drop policy if exists d2_platform_media_insert on storage.objects;
create policy d2_platform_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='platform-media' and (
    (
      (storage.foldername(name))[1]='exhibitions'
      and public.try_uuid((storage.foldername(name))[2]) is not null
      and public.can_edit_exhibition(public.try_uuid((storage.foldername(name))[2]))
    )
    or (
      (storage.foldername(name))[1]='media-library'
      and public.is_platform_admin()
    )
  )
);

drop policy if exists d2_platform_media_update on storage.objects;
-- No UPDATE policy: media paths are immutable. Replacement creates a new mediaId/path.
drop policy if exists d2_platform_media_delete on storage.objects;
create policy d2_platform_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id='platform-media'
  and (storage.foldername(name))[1]='exhibitions'
  and public.try_uuid((storage.foldername(name))[2]) is not null
  and public.can_edit_exhibition(public.try_uuid((storage.foldername(name))[2]))
  and exists (
    select 1
    from public.filter_deletable_media_paths(
      public.try_uuid((storage.foldername(name))[2]),
      bucket_id,
      array[name]
    ) deletable
    where deletable.path = name
  )
);
drop policy if exists d2_venue_runtime_insert on storage.objects;
create policy d2_venue_runtime_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='venue-runtime'
  and (storage.foldername(name))[1]='venues'
  and exists (
    select 1 from public.venues v
    where v.slug=(storage.foldername(name))[2]
      and public.can_edit_venue(v.id)
  )
);

drop policy if exists d2_venue_runtime_update on storage.objects;
drop policy if exists d2_venue_runtime_delete on storage.objects;
-- No UPDATE/DELETE policies: Venue versions are immutable. Create a new versionId instead.
commit;
