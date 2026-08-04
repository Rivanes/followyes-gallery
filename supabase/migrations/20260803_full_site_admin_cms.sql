begin;

-- Berryboy Art Gallery — Stage 12D3 / Full Site Admin / Venue & Exhibition CMS
-- Requires the Stage 12D2 migration. It preserves gallery_state and legacy Storage policies.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exhibition_cards (
  exhibition_id uuid primary key references public.exhibitions(id) on delete cascade,
  draft_value jsonb not null default '{}'::jsonb,
  draft_revision bigint not null default 0 check (draft_revision >= 0),
  draft_updated_at timestamptz,
  published_value jsonb,
  published_revision bigint not null default 0 check (published_revision >= 0),
  published_at timestamptz,
  previous_value jsonb,
  previous_revision bigint not null default 0 check (previous_revision >= 0),
  previous_published_at timestamptz,
  lock_version bigint not null default 0 check (lock_version >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_content (
  key text primary key check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  draft_value jsonb not null default '{}'::jsonb,
  draft_revision bigint not null default 0 check (draft_revision >= 0),
  draft_updated_at timestamptz,
  published_value jsonb,
  published_revision bigint not null default 0 check (published_revision >= 0),
  published_at timestamptz,
  previous_value jsonb,
  previous_revision bigint not null default 0 check (previous_revision >= 0),
  previous_published_at timestamptz,
  lock_version bigint not null default 0 check (lock_version >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('duplicate_media','permanent_delete')),
  entity_type text,
  entity_id uuid,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default '',
  requested_access jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','accepted','failed','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, status)
);

alter table public.venues add column if not exists archived_at timestamptz;
alter table public.venues add column if not exists validation_report jsonb not null default '{}'::jsonb;
alter table public.venue_versions add column if not exists validation_report jsonb not null default '{}'::jsonb;
alter table public.venue_versions add column if not exists validated_at timestamptz;
alter table public.venue_versions add column if not exists published_at timestamptz;
alter table public.venue_versions add column if not exists frozen_at timestamptz;
alter table public.venue_versions add column if not exists archived_at timestamptz;
alter table public.exhibitions add column if not exists archived_at timestamptz;
alter table public.media_library add column if not exists archived_at timestamptz;
alter table public.media_library add column if not exists processing_status text not null default 'ready';
alter table public.media_library add column if not exists processing_error text;
alter table public.authors add column if not exists archived_at timestamptz;

create index if not exists admin_audit_entity_idx on public.admin_audit_log(entity_type, entity_id, created_at desc);
create index if not exists cms_jobs_status_idx on public.cms_jobs(status, created_at);
create index if not exists exhibition_cards_publish_idx on public.exhibition_cards(published_at desc);
create index if not exists media_library_archive_idx on public.media_library(archived_at, media_type);

insert into public.profiles(user_id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1), '')
from auth.users
on conflict (user_id) do nothing;

insert into public.exhibition_cards(exhibition_id, draft_value, draft_revision, draft_updated_at, published_value, published_revision, published_at)
select e.id,
       jsonb_build_object(
         'schema','berryboy-exhibition-card.v1','schemaVersion',1,
         'title',e.title,'subtitle',e.subtitle,'shortDescription',e.short_description,
         'buttonLabel',e.button_label,'curator',e.curator,
         'coverMediaId',e.cover_media_id,'mobileCoverMediaId',e.mobile_cover_media_id,
         'logoMediaId',e.logo_media_id,'theme',e.theme
       ),
       1, coalesce(e.updated_at, now()),
       case when e.status in ('published','scheduled') then jsonb_build_object(
         'schema','berryboy-exhibition-card.v1','schemaVersion',1,
         'title',e.title,'subtitle',e.subtitle,'shortDescription',e.short_description,
         'buttonLabel',e.button_label,'curator',e.curator,
         'coverMediaId',e.cover_media_id,'mobileCoverMediaId',e.mobile_cover_media_id,
         'logoMediaId',e.logo_media_id,'theme',e.theme
       ) else null end,
       case when e.status in ('published','scheduled') then 1 else 0 end,
       case when e.status in ('published','scheduled') then coalesce(e.updated_at, now()) else null end
from public.exhibitions e
on conflict (exhibition_id) do nothing;

-- Preserve the already published legacy Berryboy card until a cover is uploaded in CMS.
update public.exhibitions
set theme = jsonb_set(coalesce(theme, '{}'::jsonb), '{allowCoverless}', 'true'::jsonb, true)
where slug = 'berryboy-main' and cover_media_id is null;

insert into public.site_content(key, draft_value, draft_revision, draft_updated_at, published_value, published_revision, published_at)
values (
  'homepage',
  '{"schema":"berryboy-homepage.v1","schemaVersion":1,"sections":[{"id":"hero","type":"hero","enabled":true,"displayOrder":10,"content":{"eyebrow":"Berryboy Art Gallery","title":"Exhibitions in a shared 3D platform.","description":"Choose a published exhibition and enter its dedicated virtual venue.","primaryLabel":"View exhibitions"}},{"id":"exhibitions","type":"exhibition_collection","enabled":true,"displayOrder":20,"content":{"title":"Current exhibitions","description":"Published exhibitions are loaded dynamically from Supabase.","mode":"automatic","exhibitionIds":[],"layout":"carousel","visibleCards":3}},{"id":"about","type":"about","enabled":true,"displayOrder":30,"content":{"title":"About the platform","description":"One Babylon.js engine can load multiple venues and independent exhibitions."}},{"id":"footer","type":"footer","enabled":true,"displayOrder":90,"content":{"copyright":"Berryboy Art Gallery","links":[]}}]}'::jsonb,
  1, now(),
  '{"schema":"berryboy-homepage.v1","schemaVersion":1,"sections":[{"id":"hero","type":"hero","enabled":true,"displayOrder":10,"content":{"eyebrow":"Berryboy Art Gallery","title":"Exhibitions in a shared 3D platform.","description":"Choose a published exhibition and enter its dedicated virtual venue.","primaryLabel":"View exhibitions"}},{"id":"exhibitions","type":"exhibition_collection","enabled":true,"displayOrder":20,"content":{"title":"Current exhibitions","description":"Published exhibitions are loaded dynamically from Supabase.","mode":"automatic","exhibitionIds":[],"layout":"carousel","visibleCards":3}},{"id":"about","type":"about","enabled":true,"displayOrder":30,"content":{"title":"About the platform","description":"One Babylon.js engine can load multiple venues and independent exhibitions."}},{"id":"footer","type":"footer","enabled":true,"displayOrder":90,"content":{"copyright":"Berryboy Art Gallery","links":[]}}]}'::jsonb,
  1, now()
)
on conflict (key) do nothing;

insert into public.site_content(key, draft_value, draft_revision, draft_updated_at, published_value, published_revision, published_at)
values (
  'site-settings',
  '{"schema":"berryboy-site-settings.v1","schemaVersion":1,"siteName":"Berryboy Art Gallery","defaultLocale":"en","contactEmail":"","socialLinks":[],"footerNote":""}'::jsonb,
  1, now(),
  '{"schema":"berryboy-site-settings.v1","schemaVersion":1,"siteName":"Berryboy Art Gallery","defaultLocale":"en","contactEmail":"","socialLinks":[],"footerNote":""}'::jsonb,
  1, now()
)
on conflict (key) do nothing;

create or replace function public.cms_user_is_active(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and coalesce((select active from public.profiles where user_id = p_user_id), true);
$$;

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cms_user_is_active(p_user_id) and exists (
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
  select public.cms_user_is_active(p_user_id) and (
    public.is_platform_admin(p_user_id) or exists (
      select 1 from public.venue_memberships
      where venue_id = p_venue_id and user_id = p_user_id and role = 'venue_admin'
    )
  );
$$;

create or replace function public.can_edit_exhibition(p_exhibition_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cms_user_is_active(p_user_id) and (
    public.is_platform_admin(p_user_id)
    or exists (
      select 1 from public.exhibitions e
      join public.venue_memberships vm on vm.venue_id = e.venue_id
      where e.id = p_exhibition_id and vm.user_id = p_user_id and vm.role = 'venue_admin'
    )
    or exists (
      select 1 from public.exhibition_memberships em
      where em.exhibition_id = p_exhibition_id and em.user_id = p_user_id and em.role = 'curator'
    )
  );
$$;

create or replace function public.cms_assert_platform_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'platform admin permission required' using errcode='42501'; end if;
end;
$$;

create or replace function public.cms_write_audit(p_entity_type text, p_entity_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_log(user_id, entity_type, entity_id, action, details)
  values (auth.uid(), p_entity_type, p_entity_id, p_action, coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.get_admin_context()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  insert into public.profiles(user_id, display_name, last_seen_at)
  select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), ''), now()
  from auth.users u where u.id = uid
  on conflict (user_id) do update set last_seen_at=excluded.last_seen_at, updated_at=now();

  select jsonb_build_object(
    'userId',u.id,'email',u.email,'displayName',coalesce(p.display_name,u.email,''),'active',coalesce(p.active,true),
    'platformRole',coalesce(pm.role,'viewer'),
    'venueAdminIds',coalesce((select jsonb_agg(vm.venue_id order by vm.venue_id) from public.venue_memberships vm where vm.user_id=uid and vm.role='venue_admin'),'[]'::jsonb),
    'exhibitionCuratorIds',coalesce((select jsonb_agg(em.exhibition_id order by em.exhibition_id) from public.exhibition_memberships em where em.user_id=uid and em.role='curator'),'[]'::jsonb),
    'capabilities',case
      when pm.role='platform_admin' then '["platform.manage","users.manage","site.read","site.edit","site.publish","venue.read","venue.create","venue.edit","venue.publish","venue.archive","exhibition.read","exhibition.create","exhibition.edit","exhibition.publish","exhibition.archive","media.read","media.attach","media.upload","media.delete","authors.read","authors.edit","audit.read"]'::jsonb
      when exists(select 1 from public.venue_memberships vm where vm.user_id=uid and vm.role='venue_admin') then '["site.read","venue.read","venue.edit","venue.publish","venue.archive","exhibition.read","exhibition.create","exhibition.edit","exhibition.publish","exhibition.archive","media.read","media.attach","media.upload","media.delete","authors.read","authors.edit","audit.read"]'::jsonb
      when exists(select 1 from public.exhibition_memberships em where em.user_id=uid and em.role='curator') then '["site.read","venue.read","exhibition.read","exhibition.edit","media.read","media.attach","media.upload","authors.read","authors.edit","audit.read"]'::jsonb
      else '["site.read","venue.read","exhibition.read","media.read","authors.read"]'::jsonb end
  ) into result
  from auth.users u
  left join public.profiles p on p.user_id=u.id
  left join public.platform_memberships pm on pm.user_id=u.id
  where u.id=uid;
  return result;
end;
$$;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.cms_user_is_active() then raise exception 'permission denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'counts',jsonb_build_object(
      'venues',(select count(*) from public.venues v where v.status<>'archived' and (public.can_edit_venue(v.id) or exists(select 1 from public.exhibitions e where e.venue_id=v.id and public.can_edit_exhibition(e.id)))),
      'venueVersions',(select count(*) from public.venue_versions vv where exists(select 1 from public.venues v where v.id=vv.venue_id and (public.can_edit_venue(v.id) or exists(select 1 from public.exhibitions e where e.venue_id=v.id and public.can_edit_exhibition(e.id))))),
      'publishedExhibitions',(select count(*) from public.exhibitions e where e.status='published' and public.can_edit_exhibition(e.id)),
      'draftExhibitions',(select count(*) from public.exhibitions e where e.status in ('draft','hidden','scheduled') and public.can_edit_exhibition(e.id)),
      'media',(select count(*) from public.media_library m where m.archived_at is null and (m.owner_type='platform' and public.is_platform_admin() or m.owner_type='venue' and public.can_edit_venue(m.owner_id) or m.owner_type='exhibition' and public.can_edit_exhibition(m.owner_id))),
      'attention',(select count(*) from public.venue_versions vv where vv.status='draft' and coalesce((vv.validation_report->>'valid')::boolean,false)=false and public.can_edit_venue(vv.venue_id)) +
                  (select count(*) from public.cms_jobs j where j.status='failed' and public.is_platform_admin())
    ),
    'attention',coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('type','venue-version','title',v.name||' / '||vv.version_number,'message','Venue Manifest has not passed validation.') x
      from public.venue_versions vv join public.venues v on v.id=vv.venue_id
      where vv.status='draft' and coalesce((vv.validation_report->>'valid')::boolean,false)=false and public.can_edit_venue(v.id)
      order by vv.updated_at desc limit 10
    ) q),'[]'::jsonb),
    'recentActivity',coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('action',a.action,'entityType',a.entity_type,'entityName',coalesce(e.title,v.name,a.entity_id::text),'createdAt',a.created_at) x
      from public.admin_audit_log a
      left join public.exhibitions e on a.entity_type='exhibition' and e.id=a.entity_id
      left join public.venues v on a.entity_type='venue' and v.id=a.entity_id
      where public.is_platform_admin() or (a.entity_type='venue' and public.can_edit_venue(a.entity_id)) or (a.entity_type='exhibition' and public.can_edit_exhibition(a.entity_id))
      order by a.created_at desc limit 12
    ) q),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list_venues(p_status text default null, p_search text default null)
returns table (
  id uuid, slug text, name text, description text, status text,
  published_version_id uuid, draft_version_id uuid, previous_version_id uuid,
  version_count bigint, exhibition_count bigint, updated_at timestamptz,
  versions jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id,v.slug,v.name,v.description,v.status,v.published_version_id,v.draft_version_id,v.previous_version_id,
         (select count(*) from public.venue_versions vv where vv.venue_id=v.id),
         (select count(*) from public.exhibitions e where e.venue_id=v.id and e.status<>'archived'),v.updated_at,
         coalesce((select jsonb_agg(jsonb_build_object('id',vv.id,'version_number',vv.version_number,'status',vv.status) order by vv.created_at desc) from public.venue_versions vv where vv.venue_id=v.id),'[]'::jsonb)
  from public.venues v
  where (public.can_edit_venue(v.id) or exists(select 1 from public.exhibitions e where e.venue_id=v.id and public.can_edit_exhibition(e.id)))
    and (p_status is null or v.status=p_status)
    and (p_search is null or v.name ilike '%'||p_search||'%' or v.slug ilike '%'||p_search||'%')
  order by v.name;
$$;

create or replace function public.admin_get_venue(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not (public.can_edit_venue(p_venue_id) or exists(select 1 from public.exhibitions e where e.venue_id=p_venue_id and public.can_edit_exhibition(e.id))) then raise exception 'permission denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'venue',to_jsonb(v),
    'versions',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select vv.*,
             (select count(*) from public.venue_assets va where va.venue_version_id=vv.id) asset_count,
             coalesce((select jsonb_agg(to_jsonb(va) order by va.created_at) from public.venue_assets va where va.venue_version_id=vv.id),'[]'::jsonb) assets
      from public.venue_versions vv where vv.venue_id=v.id
    ) x),'[]'::jsonb),
    'exhibitions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'slug',e.slug,'status',e.status)) from public.exhibitions e where e.venue_id=v.id),'[]'::jsonb)
  ) into result from public.venues v where v.id=p_venue_id;
  return result;
end;
$$;

create or replace function public.admin_create_venue(p_slug text, p_name text, p_description text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare rec public.venues;
begin
  perform public.cms_assert_platform_admin();
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid venue slug'; end if;
  insert into public.venues(slug,name,description,status) values (p_slug,trim(p_name),coalesce(p_description,''),'draft') returning * into rec;
  perform public.cms_write_audit('venue',rec.id,'create',jsonb_build_object('slug',rec.slug));
  return to_jsonb(rec);
end;
$$;

create or replace function public.admin_update_venue(p_venue_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare rec public.venues;
begin
  if not public.can_edit_venue(p_venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  if p_patch ? 'slug' and nullif(trim(p_patch->>'slug'),'') is distinct from (select slug from public.venues where id=p_venue_id)
     and exists(select 1 from public.venue_versions where venue_id=p_venue_id)
  then raise exception 'Venue slug is immutable after the first Venue Version is created'; end if;
  if p_patch ? 'slug' and coalesce(p_patch->>'slug','') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid venue slug'; end if;
  update public.venues set
    name=case when p_patch ? 'name' then nullif(trim(p_patch->>'name'),'') else name end,
    slug=case when p_patch ? 'slug' then nullif(trim(p_patch->>'slug'),'') else slug end,
    description=case when p_patch ? 'description' then coalesce(p_patch->>'description','') else description end,
    updated_at=now()
  where id=p_venue_id returning * into rec;
  perform public.cms_write_audit('venue',p_venue_id,'update',p_patch);
  return to_jsonb(rec);
end;
$$;

create or replace function public.admin_archive_venue(p_venue_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.venues;
begin
  if not public.can_edit_venue(p_venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  if exists(select 1 from public.exhibitions where venue_id=p_venue_id and status not in ('archived','hidden')) then raise exception 'archive exhibitions before archiving venue'; end if;
  update public.venues set status='archived',archived_at=now(),updated_at=now() where id=p_venue_id returning * into rec;
  perform public.cms_write_audit('venue',p_venue_id,'archive'); return to_jsonb(rec);
end; $$;

create or replace function public.admin_restore_venue(p_venue_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.venues;
begin
  if not public.can_edit_venue(p_venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  update public.venues set status='draft',archived_at=null,updated_at=now() where id=p_venue_id returning * into rec;
  perform public.cms_write_audit('venue',p_venue_id,'restore'); return to_jsonb(rec);
end; $$;

create or replace function public.admin_create_venue_version(p_venue_id uuid, p_version_number text, p_manifest jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare rec public.venue_versions; venue_slug text; manifest_value jsonb;
begin
  if not public.can_edit_venue(p_venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  select slug into venue_slug from public.venues where id=p_venue_id;
  if venue_slug is null then raise exception 'venue not found'; end if;
  manifest_value := coalesce(p_manifest,jsonb_build_object(
    'schema','berryboy-venue-manifest.v1','venueId',venue_slug,'versionId',p_version_number,
    'coordinateSystem',jsonb_build_object('upAxis','Y','units','meters'),
    'assets','[]'::jsonb,'spawnPoints',jsonb_build_array(jsonb_build_object('id','visitor-safe','position',jsonb_build_object('x',0,'y',1.7,'z',0),'target',jsonb_build_object('x',0,'y',1.7,'z',1),'safe',true,'visitor',true)),
    'zones','[]'::jsonb,'zoneAdjacency','[]'::jsonb,'collisionSets','[]'::jsonb,'walkableAreas','[]'::jsonb,
    'artworkAnchors','[]'::jsonb,'sculptureAnchors','[]'::jsonb,'navigationGraph',jsonb_build_object('nodes','[]'::jsonb,'edges','[]'::jsonb),
    'editableMaterials','[]'::jsonb,'lockedMaterials','[]'::jsonb,'lightingDefaults','{}'::jsonb,'mobileBudgets','{}'::jsonb,'technicalFlags','{}'::jsonb
  ));
  insert into public.venue_versions(venue_id,version_number,manifest,status,created_by)
  values(p_venue_id,trim(p_version_number),manifest_value,'draft',auth.uid()) returning * into rec;
  update public.venues set draft_version_id=rec.id,updated_at=now() where id=p_venue_id;
  perform public.cms_write_audit('venue',p_venue_id,'create-version',jsonb_build_object('versionId',rec.id,'versionNumber',rec.version_number));
  return to_jsonb(rec);
end;
$$;

create or replace function public.admin_save_venue_manifest(p_venue_version_id uuid, p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare rec public.venue_versions;
begin
  select * into rec from public.venue_versions where id=p_venue_version_id for update;
  if rec.id is null then raise exception 'venue version not found'; end if;
  if not public.can_edit_venue(rec.venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  if rec.frozen_at is not null or rec.status='published' then raise exception 'published venue versions are immutable'; end if;
  if jsonb_typeof(p_manifest)<>'object' then raise exception 'manifest must be an object'; end if;
  update public.venue_versions set manifest=p_manifest,manifest_url=null,manifest_path=null,validation_report='{}'::jsonb,validated_at=null,updated_at=now()
  where id=p_venue_version_id returning * into rec;
  perform public.cms_write_audit('venue',rec.venue_id,'save-manifest',jsonb_build_object('versionId',rec.id));
  return to_jsonb(rec);
end;
$$;

create or replace function public.admin_register_venue_asset(
  p_venue_version_id uuid, p_asset_id text, p_role text, p_storage_bucket text,
  p_storage_path text, p_public_url text default null, p_mime_type text default null, p_file_size bigint default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare vv public.venue_versions; va public.venue_assets; asset_json jsonb; assets jsonb;
begin
  select * into vv from public.venue_versions where id=p_venue_version_id for update;
  if vv.id is null then raise exception 'venue version not found'; end if;
  if not public.can_edit_venue(vv.venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  if vv.frozen_at is not null or vv.status='published' then raise exception 'published venue versions are immutable'; end if;
  if p_role not in ('walls','floor','ceiling','props','building','collision','navigation','decorations') then raise exception 'invalid asset role'; end if;
  insert into public.venue_assets(venue_version_id,asset_id,role,storage_bucket,storage_path,public_url,mime_type,file_size,metadata)
  values(p_venue_version_id,p_asset_id,p_role,p_storage_bucket,p_storage_path,nullif(p_public_url,''),p_mime_type,p_file_size,coalesce(p_metadata,'{}'::jsonb)) returning * into va;
  asset_json := jsonb_build_object(
    'assetId',p_asset_id,'role',p_role,'path',p_storage_path,'publicUrl',nullif(p_public_url,''),'storageBucket',p_storage_bucket,
    'critical',p_role in ('building','walls','floor','ceiling'),'enabled',true,'metadata',coalesce(p_metadata,'{}'::jsonb)
  );
  assets := coalesce(vv.manifest->'assets','[]'::jsonb);
  update public.venue_versions set manifest=jsonb_set(coalesce(manifest,'{}'::jsonb),'{assets}',assets||jsonb_build_array(asset_json),true),validation_report='{}'::jsonb,validated_at=null,updated_at=now()
  where id=p_venue_version_id;
  perform public.cms_write_audit('venue',vv.venue_id,'upload-asset',jsonb_build_object('versionId',vv.id,'assetId',p_asset_id,'role',p_role));
  return to_jsonb(va);
end;
$$;

create or replace function public.admin_validate_venue_version(p_venue_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare vv public.venue_versions; v public.venues; errors jsonb := '[]'::jsonb; warnings jsonb := '[]'::jsonb; report jsonb; asset_count integer;
begin
  select * into vv from public.venue_versions where id=p_venue_version_id;
  if vv.id is null then raise exception 'venue version not found'; end if;
  if not (public.can_edit_venue(vv.venue_id) or exists(select 1 from public.exhibition_states es where p_venue_version_id in (es.draft_venue_version_id,es.published_venue_version_id,es.previous_venue_version_id) and public.can_edit_exhibition(es.exhibition_id))) then raise exception 'permission denied' using errcode='42501'; end if;
  select * into v from public.venues where id=vv.venue_id;
  if vv.manifest is null or jsonb_typeof(vv.manifest)<>'object' then errors:=errors||'"Manifest must be a JSON object"'::jsonb; end if;
  if coalesce(vv.manifest->>'venueId','')<>v.slug then errors:=errors||to_jsonb('manifest.venueId must equal Venue slug'::text); end if;
  if coalesce(vv.manifest->>'versionId','')<>vv.version_number then errors:=errors||to_jsonb('manifest.versionId must equal version number'::text); end if;
  if jsonb_typeof(vv.manifest->'assets')<>'array' then errors:=errors||to_jsonb('manifest.assets must be an array'::text); end if;
  if jsonb_typeof(vv.manifest->'spawnPoints')<>'array' then
    errors:=errors||to_jsonb('manifest.spawnPoints must be an array'::text);
  elsif jsonb_array_length(vv.manifest->'spawnPoints')=0 then
    errors:=errors||to_jsonb('at least one spawn point is required'::text);
  end if;
  select count(*) into asset_count from public.venue_assets where venue_version_id=vv.id;
  if asset_count=0 then warnings:=warnings||to_jsonb('no registered Venue assets'::text); end if;
  if jsonb_typeof(vv.manifest->'assets')='array' and exists(
    select 1 from jsonb_array_elements(vv.manifest->'assets') a
    where nullif(a->>'assetId','') is null or nullif(a->>'role','') is null
      or (nullif(a->>'path','') is null and nullif(a->>'publicUrl','') is null)
  ) then errors:=errors||to_jsonb('every asset requires assetId, role and path/publicUrl'::text); end if;
  report:=jsonb_build_object('valid',jsonb_array_length(errors)=0,'errors',errors,'warnings',warnings,'assetCount',asset_count,'validatedAt',now());
  update public.venue_versions set validation_report=report,validated_at=now(),updated_at=now() where id=vv.id;
  update public.venues set validation_report=report,updated_at=now() where id=v.id;
  return report;
end;
$$;

create or replace function public.admin_publish_venue_version(p_venue_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare vv public.venue_versions; v public.venues; report jsonb; old_published uuid;
begin
  select * into vv from public.venue_versions where id=p_venue_version_id for update;
  if vv.id is null then raise exception 'venue version not found'; end if;
  if not public.can_edit_venue(vv.venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  report:=public.admin_validate_venue_version(vv.id);
  if coalesce((report->>'valid')::boolean,false)=false then raise exception 'venue validation failed: %',report->'errors'; end if;
  select * into v from public.venues where id=vv.venue_id for update;
  old_published:=v.published_version_id;
  if old_published is not null and old_published<>vv.id then update public.venue_versions set status='previous',updated_at=now() where id=old_published; end if;
  update public.venue_versions set status='published',published_at=coalesce(published_at,now()),frozen_at=coalesce(frozen_at,now()),updated_at=now() where id=vv.id;
  update public.venues set previous_version_id=case when old_published<>vv.id then old_published else previous_version_id end,published_version_id=vv.id,draft_version_id=null,status='published',updated_at=now() where id=v.id;
  perform public.cms_write_audit('venue',v.id,'publish-version',jsonb_build_object('versionId',vv.id,'previousVersionId',old_published));
  return jsonb_build_object('venueId',v.id,'publishedVersionId',vv.id,'previousVersionId',old_published,'validation',report);
end;
$$;

create or replace function public.admin_rollback_venue_version(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v public.venues; current_id uuid; previous_id uuid;
begin
  if not public.can_edit_venue(p_venue_id) then raise exception 'permission denied' using errcode='42501'; end if;
  select * into v from public.venues where id=p_venue_id for update;
  current_id:=v.published_version_id; previous_id:=v.previous_version_id;
  if previous_id is null then raise exception 'no previous venue version'; end if;
  update public.venue_versions set status='previous',updated_at=now() where id=current_id;
  update public.venue_versions set status='published',updated_at=now() where id=previous_id;
  update public.venues set published_version_id=previous_id,previous_version_id=current_id,updated_at=now() where id=p_venue_id;
  perform public.cms_write_audit('venue',p_venue_id,'rollback-version',jsonb_build_object('publishedVersionId',previous_id,'previousVersionId',current_id,'note','Exhibitions remain pinned to their explicit version until reassigned.'));
  return jsonb_build_object('publishedVersionId',previous_id,'previousVersionId',current_id,'exhibitionsReassigned',false);
end;
$$;

create or replace function public.cms_guard_frozen_venue_version()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.frozen_at is not null and (
    new.version_number is distinct from old.version_number or new.manifest is distinct from old.manifest or
    new.manifest_url is distinct from old.manifest_url or new.manifest_bucket is distinct from old.manifest_bucket or
    new.manifest_path is distinct from old.manifest_path or new.schema_version is distinct from old.schema_version
  ) then raise exception 'published venue versions are immutable'; end if;
  return new;
end; $$;

drop trigger if exists cms_frozen_venue_version_trigger on public.venue_versions;
create trigger cms_frozen_venue_version_trigger before update on public.venue_versions for each row execute function public.cms_guard_frozen_venue_version();

create or replace function public.cms_guard_frozen_venue_asset()
returns trigger language plpgsql set search_path=public as $$
declare frozen timestamptz; version_id uuid;
begin
  if tg_op='DELETE' then version_id:=old.venue_version_id; else version_id:=new.venue_version_id; end if;
  select frozen_at into frozen from public.venue_versions where id=version_id;
  if frozen is not null then raise exception 'assets of published Venue versions are immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

drop trigger if exists cms_frozen_venue_asset_trigger on public.venue_assets;
create trigger cms_frozen_venue_asset_trigger before insert or update or delete on public.venue_assets for each row execute function public.cms_guard_frozen_venue_asset();

create or replace function public.can_publish_exhibition(p_exhibition_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.cms_user_is_active(p_user_id) and (
    public.is_platform_admin(p_user_id) or exists(
      select 1 from public.exhibitions e join public.venue_memberships vm on vm.venue_id=e.venue_id
      where e.id=p_exhibition_id and vm.user_id=p_user_id and vm.role='venue_admin'
    )
  );
$$;

create or replace function public.admin_list_exhibitions(p_venue_id uuid default null, p_status text default null, p_search text default null)
returns table (
  id uuid, venue_id uuid, venue_name text, slug text, title text, subtitle text, short_description text,
  status text, display_order integer, curator text, scheduled_at timestamptz,
  draft_revision bigint, published_revision bigint, card_draft_revision bigint, updated_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select e.id,e.venue_id,v.name,e.slug,e.title,e.subtitle,e.short_description,e.status,e.display_order,e.curator,e.scheduled_at,
         coalesce(es.draft_revision,0),coalesce(es.published_revision,0),coalesce(ec.draft_revision,0),e.updated_at
  from public.exhibitions e join public.venues v on v.id=e.venue_id
  left join public.exhibition_states es on es.exhibition_id=e.id
  left join public.exhibition_cards ec on ec.exhibition_id=e.id
  where public.can_edit_exhibition(e.id)
    and (p_venue_id is null or e.venue_id=p_venue_id)
    and (p_status is null or e.status=p_status)
    and (p_search is null or e.title ilike '%'||p_search||'%' or e.slug ilike '%'||p_search||'%')
  order by e.display_order,e.created_at;
$$;

create or replace function public.admin_validate_exhibition(p_exhibition_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare e public.exhibitions; es public.exhibition_states; ec public.exhibition_cards; vv public.venue_versions; blockers jsonb:='[]'::jsonb; warnings jsonb:='[]'::jsonb; card jsonb;
begin
  if auth.uid() is not null and not public.can_edit_exhibition(p_exhibition_id) then raise exception 'permission denied' using errcode='42501'; end if;
  select * into e from public.exhibitions where id=p_exhibition_id;
  select * into es from public.exhibition_states where exhibition_id=p_exhibition_id;
  select * into ec from public.exhibition_cards where exhibition_id=p_exhibition_id;
  select * into vv from public.venue_versions where id=es.draft_venue_version_id;
  card:=ec.draft_value;
  if e.id is null then blockers:=blockers||to_jsonb('Exhibition record is missing'::text); end if;
  if nullif(trim(e.title),'') is null then blockers:=blockers||to_jsonb('Exhibition title is required'::text); end if;
  if e.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then blockers:=blockers||to_jsonb('Exhibition slug is invalid'::text); end if;
  if es.draft_state is null then blockers:=blockers||to_jsonb('3D draft state is missing'::text); end if;
  if vv.id is null or vv.venue_id<>e.venue_id then blockers:=blockers||to_jsonb('Draft Venue Version binding is missing or invalid'::text); end if;
  if vv.status<>'published' then blockers:=blockers||to_jsonb('The selected Venue Version must be published'::text); end if;
  if ec.exhibition_id is null then blockers:=blockers||to_jsonb('Exhibition card draft is missing'::text); end if;
  if nullif(card->>'title','') is null then blockers:=blockers||to_jsonb('Card title is required'::text); end if;
  if nullif(card->>'buttonLabel','') is null then blockers:=blockers||to_jsonb('Card button label is required'::text); end if;
  if nullif(card->>'coverMediaId','') is null and coalesce((e.theme->>'allowCoverless')::boolean,false)=false then blockers:=blockers||to_jsonb('Card cover media is required'::text); end if;
  if e.end_date is not null and e.start_date is not null and e.end_date<e.start_date then blockers:=blockers||to_jsonb('End date must not precede start date'::text); end if;
  if exists(select 1 from public.media_library m where m.owner_type='exhibition' and m.owner_id=e.id and (m.processing_status in ('uploading','processing','error') or m.deleted_at is not null or m.archived_at is not null)) then blockers:=blockers||to_jsonb('Exhibition has pending, failed or archived media'::text); end if;
  if coalesce((vv.validation_report->>'valid')::boolean,false)=false then warnings:=warnings||to_jsonb('Venue Version validation report is missing or not valid'::text); end if;
  if jsonb_typeof(es.draft_state#>'{content,tourOrder}') is distinct from 'array'
     or jsonb_array_length(es.draft_state#>'{content,tourOrder}')=0
  then warnings:=warnings||to_jsonb('Tour Order is empty'::text); end if;
  return jsonb_build_object('valid',jsonb_array_length(blockers)=0,'blockers',blockers,'warnings',warnings,'checkedAt',now());
end;
$$;

create or replace function public.admin_get_exhibition(p_exhibition_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.can_edit_exhibition(p_exhibition_id) then raise exception 'permission denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'exhibition',to_jsonb(e),'state',to_jsonb(es),'card',to_jsonb(ec),
    'validation',public.admin_validate_exhibition(e.id),
    'availableVenues',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'slug',v.slug,'name',v.name,'status',v.status,
      'versions',coalesce((select jsonb_agg(jsonb_build_object('id',vv.id,'version_number',vv.version_number,'status',vv.status) order by vv.created_at desc) from public.venue_versions vv where vv.venue_id=v.id),'[]'::jsonb)
    ) order by v.name) from public.venues v where v.status<>'archived' and (public.can_edit_venue(v.id) or v.id=e.venue_id)),'[]'::jsonb),
    'authors',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'roleLabel',ea.role_label,'displayOrder',ea.display_order) order by ea.display_order) from public.exhibition_authors ea join public.authors a on a.id=ea.author_id where ea.exhibition_id=e.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (select * from public.exhibition_audit_log where exhibition_id=e.id order by created_at desc limit 50) h),'[]'::jsonb)
  ) into result
  from public.exhibitions e
  left join public.exhibition_states es on es.exhibition_id=e.id
  left join public.exhibition_cards ec on ec.exhibition_id=e.id
  where e.id=p_exhibition_id;
  return result;
end;
$$;

create or replace function public.admin_create_exhibition(p_venue_id uuid,p_venue_version_id uuid,p_slug text,p_title text,p_patch jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare e public.exhibitions; vv public.venue_versions; card jsonb; envelope jsonb;
begin
  if not public.can_edit_venue(p_venue_id) then raise exception 'venue admin permission required' using errcode='42501'; end if;
  select * into vv from public.venue_versions where id=p_venue_version_id and venue_id=p_venue_id;
  if vv.id is null then raise exception 'venue version does not belong to venue'; end if;
  insert into public.exhibitions(venue_id,slug,title,subtitle,short_description,long_description,status,display_order,button_label,curator,start_date,end_date,theme,created_by)
  values(p_venue_id,p_slug,trim(p_title),coalesce(p_patch->>'subtitle',''),coalesce(p_patch->>'short_description',''),coalesce(p_patch->>'long_description',''),'draft',coalesce((p_patch->>'display_order')::integer,0),coalesce(nullif(p_patch->>'button_label',''),'Enter gallery'),coalesce(p_patch->>'curator',''),nullif(p_patch->>'start_date','')::timestamptz,nullif(p_patch->>'end_date','')::timestamptz,coalesce(p_patch->'theme','{}'::jsonb),auth.uid()) returning * into e;
  envelope:=jsonb_build_object('schema','berryboy-exhibition-state.v1','schemaVersion',1,'exhibitionId',e.id,'venueId',(select slug from public.venues where id=p_venue_id),'venueVersionId',vv.version_number,'channel','draft','revision',0,'basedOnRevision',0,'savedAt',now(),'savedBy',auth.uid(),'content','{}'::jsonb);
  insert into public.exhibition_states(exhibition_id,venue_id,draft_venue_version_id,draft_state,draft_revision,draft_updated_at,updated_by) values(e.id,p_venue_id,vv.id,envelope,0,now(),auth.uid());
  card:=jsonb_build_object('schema','berryboy-exhibition-card.v1','schemaVersion',1,'title',e.title,'subtitle',e.subtitle,'shortDescription',e.short_description,'buttonLabel',e.button_label,'curator',e.curator,'coverMediaId',null,'mobileCoverMediaId',null,'logoMediaId',null,'theme',e.theme);
  insert into public.exhibition_cards(exhibition_id,draft_value,draft_revision,draft_updated_at,updated_by) values(e.id,card,1,now(),auth.uid());
  perform public.cms_write_audit('exhibition',e.id,'create',jsonb_build_object('venueId',p_venue_id,'venueVersionId',vv.id));
  return to_jsonb(e);
end;
$$;

create or replace function public.admin_update_exhibition(p_exhibition_id uuid,p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare e public.exhibitions;
begin
  if not public.can_edit_exhibition(p_exhibition_id) then raise exception 'permission denied' using errcode='42501'; end if;
  update public.exhibitions set
    title=case when p_patch?'title' then nullif(trim(p_patch->>'title'),'') else title end,
    slug=case when p_patch?'slug' then nullif(trim(p_patch->>'slug'),'') else slug end,
    subtitle=case when p_patch?'subtitle' then coalesce(p_patch->>'subtitle','') else subtitle end,
    short_description=case when p_patch?'short_description' then coalesce(p_patch->>'short_description','') else short_description end,
    long_description=case when p_patch?'long_description' then coalesce(p_patch->>'long_description','') else long_description end,
    button_label=case when p_patch?'button_label' then coalesce(nullif(p_patch->>'button_label',''),'Enter gallery') else button_label end,
    curator=case when p_patch?'curator' then coalesce(p_patch->>'curator','') else curator end,
    display_order=case when p_patch?'display_order' then (p_patch->>'display_order')::integer else display_order end,
    start_date=case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::timestamptz else start_date end,
    end_date=case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::timestamptz else end_date end,
    theme=case when p_patch?'theme' then coalesce(p_patch->'theme','{}'::jsonb) else theme end,
    updated_at=now()
  where id=p_exhibition_id returning * into e;
  perform public.cms_write_audit('exhibition',p_exhibition_id,'update-details',p_patch); return to_jsonb(e);
end;
$$;

create or replace function public.cms_sync_exhibition_card_media_usages(p_exhibition_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare ec public.exhibition_cards; channel_name text; card jsonb; media_key text; media_uuid uuid;
begin
  select * into ec from public.exhibition_cards where exhibition_id=p_exhibition_id;
  delete from public.media_usages where owner_type='exhibition' and owner_id=p_exhibition_id and entity_type='exhibition-card';
  foreach channel_name in array array['draft','published','previous'] loop
    card:=case channel_name when 'draft' then ec.draft_value when 'published' then ec.published_value else ec.previous_value end;
    if card is null then continue; end if;
    foreach media_key in array array['coverMediaId','mobileCoverMediaId','logoMediaId'] loop
      begin media_uuid:=nullif(card->>media_key,'')::uuid; exception when invalid_text_representation then media_uuid:=null; end;
      if media_uuid is not null then
        insert into public.media_usages(media_id,owner_type,owner_id,entity_type,entity_id,usage_role)
        select media_uuid,'exhibition',p_exhibition_id,'exhibition-card',p_exhibition_id::text,channel_name||':'||media_key
        where exists(select 1 from public.media_library m where m.id=media_uuid and m.deleted_at is null and m.archived_at is null)
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.cms_sync_site_media_usages(p_key text)
returns void language plpgsql security definer set search_path=public as $$
declare rec public.site_content; channel_name text; document jsonb; section jsonb; media_key text; media_uuid uuid; site_owner uuid:='00000000-0000-4000-8000-000000000000'::uuid;
begin
  select * into rec from public.site_content where key=p_key;
  delete from public.media_usages where owner_type='site' and owner_id=site_owner and entity_type='site-content' and entity_id=p_key;
  foreach channel_name in array array['draft','published','previous'] loop
    document:=case channel_name when 'draft' then rec.draft_value when 'published' then rec.published_value else rec.previous_value end;
    if document is null or jsonb_typeof(document->'sections')<>'array' then continue; end if;
    for section in select value from jsonb_array_elements(document->'sections') loop
      foreach media_key in array array['backgroundMediaId','mediaId','imageMediaId','logoMediaId'] loop
        begin media_uuid:=nullif(section#>>array['content',media_key],'')::uuid; exception when invalid_text_representation then media_uuid:=null; end;
        if media_uuid is not null then
          insert into public.media_usages(media_id,owner_type,owner_id,entity_type,entity_id,usage_role)
          select media_uuid,'site',site_owner,'site-content',p_key,channel_name||':'||coalesce(section->>'id','section')||':'||media_key
          where exists(select 1 from public.media_library m where m.id=media_uuid and m.deleted_at is null and m.archived_at is null)
          on conflict do nothing;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

create or replace function public.admin_save_exhibition_card(p_exhibition_id uuid,p_card jsonb,p_expected_revision bigint default null,p_expected_lock_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ec public.exhibition_cards;
begin
  if not public.can_edit_exhibition(p_exhibition_id) then raise exception 'permission denied' using errcode='42501'; end if;
  if jsonb_typeof(p_card)<>'object' then raise exception 'card must be an object'; end if;
  if exists(
    select 1 from unnest(array[p_card->>'coverMediaId',p_card->>'mobileCoverMediaId',p_card->>'logoMediaId']) as valueset(value)
    where nullif(value,'') is not null and not exists(
      select 1 from public.media_library m where m.id=public.try_uuid(value) and m.deleted_at is null and m.archived_at is null
    )
  ) then raise exception 'card references unavailable media'; end if;
  select * into ec from public.exhibition_cards where exhibition_id=p_exhibition_id for update;
  if p_expected_revision is not null and ec.draft_revision<>p_expected_revision then raise exception 'card revision conflict' using errcode='40001'; end if;
  if p_expected_lock_version is not null and ec.lock_version<>p_expected_lock_version then raise exception 'card lock conflict' using errcode='40001'; end if;
  update public.exhibition_cards set draft_value=p_card,draft_revision=draft_revision+1,draft_updated_at=now(),lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where exhibition_id=p_exhibition_id returning * into ec;
  update public.exhibitions set cover_media_id=nullif(p_card->>'coverMediaId','')::uuid,mobile_cover_media_id=nullif(p_card->>'mobileCoverMediaId','')::uuid,logo_media_id=nullif(p_card->>'logoMediaId','')::uuid,updated_at=now() where id=p_exhibition_id;
  perform public.cms_sync_exhibition_card_media_usages(p_exhibition_id);
  perform public.cms_write_audit('exhibition',p_exhibition_id,'save-card-draft',jsonb_build_object('revision',ec.draft_revision)); return to_jsonb(ec);
end;
$$;

create or replace function public.admin_publish_exhibition_bundle(
  p_exhibition_id uuid,
  p_expected_draft_revision bigint default null,
  p_expected_card_revision bigint default null,
  p_expected_state_lock_version bigint default null,
  p_expected_card_lock_version bigint default null
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare e public.exhibitions; es public.exhibition_states; ec public.exhibition_cards; validation jsonb; now_value timestamptz:=now();
begin
  if auth.uid() is not null and not public.can_publish_exhibition(p_exhibition_id) then raise exception 'publish permission required' using errcode='42501'; end if;
  validation:=public.admin_validate_exhibition(p_exhibition_id);
  if coalesce((validation->>'valid')::boolean,false)=false then raise exception 'publication validation failed: %',validation->'blockers'; end if;
  select * into e from public.exhibitions where id=p_exhibition_id for update;
  select * into es from public.exhibition_states where exhibition_id=p_exhibition_id for update;
  select * into ec from public.exhibition_cards where exhibition_id=p_exhibition_id for update;
  if p_expected_draft_revision is not null and es.draft_revision<>p_expected_draft_revision then raise exception 'state revision conflict' using errcode='40001'; end if;
  if p_expected_card_revision is not null and ec.draft_revision<>p_expected_card_revision then raise exception 'card revision conflict' using errcode='40001'; end if;
  if p_expected_state_lock_version is not null and es.lock_version<>p_expected_state_lock_version then raise exception 'state lock conflict' using errcode='40001'; end if;
  if p_expected_card_lock_version is not null and ec.lock_version<>p_expected_card_lock_version then raise exception 'card lock conflict' using errcode='40001'; end if;

  update public.exhibition_states set
    previous_venue_version_id=published_venue_version_id,
    previous_state=case when published_state is null then null else jsonb_set(published_state,'{channel}','"previous"'::jsonb,true) end,
    previous_revision=published_revision,
    previous_published_at=published_at,
    published_venue_version_id=draft_venue_version_id,
    published_state=jsonb_set(draft_state,'{channel}','"published"'::jsonb,true),
    published_revision=draft_revision,
    published_at=now_value,
    lock_version=lock_version+1,
    updated_by=auth.uid(),updated_at=now_value
  where exhibition_id=p_exhibition_id returning * into es;

  update public.exhibition_cards set
    previous_value=published_value,previous_revision=published_revision,previous_published_at=published_at,
    published_value=draft_value,published_revision=draft_revision,published_at=now_value,
    lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now_value
  where exhibition_id=p_exhibition_id returning * into ec;

  update public.exhibitions set
    title=coalesce(nullif(ec.published_value->>'title',''),title),
    subtitle=coalesce(ec.published_value->>'subtitle',subtitle),
    short_description=coalesce(ec.published_value->>'shortDescription',short_description),
    button_label=coalesce(nullif(ec.published_value->>'buttonLabel',''),button_label),
    curator=coalesce(ec.published_value->>'curator',curator),
    cover_media_id=nullif(ec.published_value->>'coverMediaId','')::uuid,
    mobile_cover_media_id=nullif(ec.published_value->>'mobileCoverMediaId','')::uuid,
    logo_media_id=nullif(ec.published_value->>'logoMediaId','')::uuid,
    theme=coalesce(ec.published_value->'theme',theme),status='published',scheduled_at=null,updated_at=now_value
  where id=p_exhibition_id returning * into e;

  perform public.cms_sync_exhibition_card_media_usages(p_exhibition_id);
  insert into public.exhibition_audit_log(exhibition_id,user_id,action,revision,details) values(p_exhibition_id,auth.uid(),'publish-bundle',es.published_revision,jsonb_build_object('cardRevision',ec.published_revision,'validation',validation));
  perform public.cms_write_audit('exhibition',p_exhibition_id,'publish-bundle',jsonb_build_object('stateRevision',es.published_revision,'cardRevision',ec.published_revision));
  return jsonb_build_object('exhibitionId',p_exhibition_id,'publishedRevision',es.published_revision,'cardPublishedRevision',ec.published_revision,'stateLockVersion',es.lock_version,'cardLockVersion',ec.lock_version,'publishedAt',now_value);
end;
$$;

create or replace function public.admin_rollback_exhibition_bundle(p_exhibition_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare es public.exhibition_states; ec public.exhibition_cards; current_state jsonb; current_state_version uuid; current_state_revision bigint; current_state_at timestamptz; current_card jsonb; current_card_revision bigint; current_card_at timestamptz;
begin
  if not public.can_publish_exhibition(p_exhibition_id) then raise exception 'publish permission required' using errcode='42501'; end if;
  select * into es from public.exhibition_states where exhibition_id=p_exhibition_id for update;
  select * into ec from public.exhibition_cards where exhibition_id=p_exhibition_id for update;
  if es.previous_state is null or ec.previous_value is null then raise exception 'no previous publication'; end if;
  current_state:=es.published_state; current_state_version:=es.published_venue_version_id; current_state_revision:=es.published_revision; current_state_at:=es.published_at;
  current_card:=ec.published_value; current_card_revision:=ec.published_revision; current_card_at:=ec.published_at;
  update public.exhibition_states set published_state=jsonb_set(previous_state,'{channel}','"published"'::jsonb,true),published_venue_version_id=previous_venue_version_id,published_revision=previous_revision,published_at=now(),previous_state=jsonb_set(current_state,'{channel}','"previous"'::jsonb,true),previous_venue_version_id=current_state_version,previous_revision=current_state_revision,previous_published_at=current_state_at,lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where exhibition_id=p_exhibition_id returning * into es;
  update public.exhibition_cards set published_value=previous_value,published_revision=previous_revision,published_at=now(),previous_value=current_card,previous_revision=current_card_revision,previous_published_at=current_card_at,lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where exhibition_id=p_exhibition_id returning * into ec;
  update public.exhibitions set title=coalesce(nullif(ec.published_value->>'title',''),title),subtitle=coalesce(ec.published_value->>'subtitle',subtitle),short_description=coalesce(ec.published_value->>'shortDescription',short_description),button_label=coalesce(nullif(ec.published_value->>'buttonLabel',''),button_label),curator=coalesce(ec.published_value->>'curator',curator),cover_media_id=nullif(ec.published_value->>'coverMediaId','')::uuid,mobile_cover_media_id=nullif(ec.published_value->>'mobileCoverMediaId','')::uuid,logo_media_id=nullif(ec.published_value->>'logoMediaId','')::uuid,theme=coalesce(ec.published_value->'theme',theme),status='published',updated_at=now() where id=p_exhibition_id;
  perform public.cms_sync_exhibition_card_media_usages(p_exhibition_id);
  insert into public.exhibition_audit_log(exhibition_id,user_id,action,revision,details) values(p_exhibition_id,auth.uid(),'rollback-bundle',es.published_revision,jsonb_build_object('cardRevision',ec.published_revision));
  perform public.cms_write_audit('exhibition',p_exhibition_id,'rollback-bundle');
  return jsonb_build_object('publishedRevision',es.published_revision,'cardPublishedRevision',ec.published_revision,'stateLockVersion',es.lock_version,'cardLockVersion',ec.lock_version);
end;
$$;

create or replace function public.admin_schedule_exhibition(p_exhibition_id uuid,p_scheduled_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exhibitions; validation jsonb;
begin
  if not public.can_publish_exhibition(p_exhibition_id) then raise exception 'publish permission required' using errcode='42501'; end if;
  if p_scheduled_at is null or p_scheduled_at<=now() then raise exception 'scheduled time must be in the future'; end if;
  validation:=public.admin_validate_exhibition(p_exhibition_id);
  if coalesce((validation->>'valid')::boolean,false)=false then raise exception 'publication validation failed: %',validation->'blockers'; end if;
  update public.exhibitions set status='scheduled',scheduled_at=p_scheduled_at,updated_at=now() where id=p_exhibition_id returning * into e;
  perform public.cms_write_audit('exhibition',p_exhibition_id,'schedule',jsonb_build_object('scheduledAt',p_scheduled_at)); return to_jsonb(e);
end;
$$;

create or replace function public.process_due_exhibition_publications()
returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; completed integer:=0; failed integer:=0;
begin
  for item in select id from public.exhibitions where status='scheduled' and scheduled_at<=now() order by scheduled_at for update skip locked loop
    begin
      perform public.admin_publish_exhibition_bundle(item.id,null,null,null,null);
      completed:=completed+1;
    exception when others then
      failed:=failed+1;
      insert into public.admin_audit_log(user_id,entity_type,entity_id,action,details) values(null,'exhibition',item.id,'scheduled-publish-failed',jsonb_build_object('error',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('completed',completed,'failed',failed,'processedAt',now());
end;
$$;

create or replace function public.cms_rebind_spatial_state(p_state jsonb,p_exhibition_id uuid,p_venue_slug text,p_version_number text)
returns jsonb language plpgsql set search_path=public as $$
declare result jsonb:=coalesce(p_state,'{}'::jsonb); content jsonb; transformed jsonb;
begin
  content:=coalesce(result->'content',result);
  content:=content-'localLights'-'customFocus'-'tourOrder'-'navigationPath'-'pathData';
  if jsonb_typeof(content->'artworks')='array' then
    select coalesce(jsonb_agg((x-'position'-'rotation'-'scale'-'transform'-'surfaceId'-'wallId'-'anchorId')||jsonb_build_object('placementStatus','needs-anchor')),'[]'::jsonb) into transformed from jsonb_array_elements(content->'artworks') x;
    content:=jsonb_set(content,'{artworks}',transformed,true);
  end if;
  if jsonb_typeof(content->'sculptures')='array' then
    select coalesce(jsonb_agg((x-'position'-'rotation'-'scale'-'transform'-'surfaceId'-'anchorId')||jsonb_build_object('placementStatus','needs-anchor')),'[]'::jsonb) into transformed from jsonb_array_elements(content->'sculptures') x;
    content:=jsonb_set(content,'{sculptures}',transformed,true);
  end if;
  content:=jsonb_set(content,'{venueMigration}',jsonb_build_object('status','needs-anchor-assignment','migratedAt',now()),true);
  if result ? 'content' then result:=jsonb_set(result,'{content}',content,true); else result:=content; end if;
  result:=jsonb_set(result,'{exhibitionId}',to_jsonb(p_exhibition_id),true);
  result:=jsonb_set(result,'{venueId}',to_jsonb(p_venue_slug),true);
  result:=jsonb_set(result,'{venueVersionId}',to_jsonb(p_version_number),true);
  result:=jsonb_set(result,'{channel}','"draft"'::jsonb,true);
  return result;
end;
$$;

create or replace function public.admin_assign_exhibition_venue(p_exhibition_id uuid,p_venue_id uuid,p_venue_version_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exhibitions; es public.exhibition_states; vv public.venue_versions; v public.venues; new_state jsonb;
begin
  select * into e from public.exhibitions where id=p_exhibition_id for update;
  if e.id is null then raise exception 'exhibition not found'; end if;
  if not (public.can_publish_exhibition(p_exhibition_id) and public.can_edit_venue(p_venue_id)) then raise exception 'venue admin permission required' using errcode='42501'; end if;
  select * into vv from public.venue_versions where id=p_venue_version_id and venue_id=p_venue_id;
  select * into v from public.venues where id=p_venue_id;
  if vv.id is null then raise exception 'venue version does not belong to venue'; end if;
  select * into es from public.exhibition_states where exhibition_id=p_exhibition_id for update;
  new_state:=public.cms_rebind_spatial_state(es.draft_state,p_exhibition_id,v.slug,vv.version_number);
  update public.exhibition_states set venue_id=p_venue_id,draft_venue_version_id=vv.id,draft_state=new_state,draft_revision=draft_revision+1,draft_updated_at=now(),lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where exhibition_id=p_exhibition_id returning * into es;
  update public.exhibitions set venue_id=p_venue_id,status='draft',scheduled_at=null,updated_at=now() where id=p_exhibition_id returning * into e;
  perform public.cms_write_audit('exhibition',p_exhibition_id,'change-venue',jsonb_build_object('venueId',p_venue_id,'venueVersionId',vv.id,'spatialDataReset',true));
  return jsonb_build_object('exhibition',to_jsonb(e),'state',to_jsonb(es));
end;
$$;

create or replace function public.admin_duplicate_exhibition(p_exhibition_id uuid,p_slug text,p_title text,p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare source_e public.exhibitions; source_es public.exhibition_states; source_ec public.exhibition_cards; target_e public.exhibitions; target_state jsonb; media_mode text:=coalesce(p_options->>'mediaMode','references'); scope_mode text:=coalesce(p_options->>'scope','all'); job_id uuid;
begin
  if not public.can_publish_exhibition(p_exhibition_id) then raise exception 'duplicate permission required' using errcode='42501'; end if;
  select * into source_e from public.exhibitions where id=p_exhibition_id;
  select * into source_es from public.exhibition_states where exhibition_id=p_exhibition_id;
  select * into source_ec from public.exhibition_cards where exhibition_id=p_exhibition_id;
  insert into public.exhibitions(venue_id,slug,title,subtitle,short_description,long_description,status,display_order,button_label,curator,start_date,end_date,theme,created_by)
  values(source_e.venue_id,p_slug,p_title,source_e.subtitle,source_e.short_description,source_e.long_description,'draft',source_e.display_order,source_e.button_label,source_e.curator,source_e.start_date,source_e.end_date,source_e.theme,auth.uid()) returning * into target_e;
  target_state:=source_es.draft_state;
  if scope_mode<>'all' then target_state:=public.cms_rebind_spatial_state(target_state,target_e.id,(select slug from public.venues where id=source_e.venue_id),(select version_number from public.venue_versions where id=source_es.draft_venue_version_id));
  else
    target_state:=jsonb_set(coalesce(target_state,'{}'::jsonb),'{exhibitionId}',to_jsonb(target_e.id),true);
    target_state:=jsonb_set(target_state,'{channel}','"draft"'::jsonb,true);
  end if;
  insert into public.exhibition_states(exhibition_id,venue_id,draft_venue_version_id,draft_state,draft_revision,draft_updated_at,schema_version,updated_by)
  values(target_e.id,source_e.venue_id,source_es.draft_venue_version_id,target_state,source_es.draft_revision,now(),source_es.schema_version,auth.uid());
  insert into public.exhibition_cards(exhibition_id,draft_value,draft_revision,draft_updated_at,updated_by)
  values(target_e.id,jsonb_set(jsonb_set(source_ec.draft_value,'{title}',to_jsonb(p_title),true),'{schema}','"berryboy-exhibition-card.v1"'::jsonb,true),source_ec.draft_revision,now(),auth.uid());
  insert into public.exhibition_authors(exhibition_id,author_id,display_order,role_label) select target_e.id,author_id,display_order,role_label from public.exhibition_authors where exhibition_id=p_exhibition_id;
  if media_mode='references' then
    insert into public.media_usages(media_id,owner_type,owner_id,entity_type,entity_id,usage_role)
    select media_id,'exhibition',target_e.id,entity_type,entity_id,usage_role from public.media_usages where owner_type='exhibition' and owner_id=p_exhibition_id on conflict do nothing;
  else
    insert into public.cms_jobs(job_type,entity_type,entity_id,payload,requested_by) values('duplicate_media','exhibition',target_e.id,jsonb_build_object('sourceExhibitionId',p_exhibition_id,'targetExhibitionId',target_e.id,'mode','independent'),auth.uid()) returning id into job_id;
  end if;
  perform public.cms_write_audit('exhibition',target_e.id,'duplicate',jsonb_build_object('sourceExhibitionId',p_exhibition_id,'mediaMode',media_mode,'scope',scope_mode,'jobId',job_id));
  return jsonb_build_object('id',target_e.id,'slug',target_e.slug,'jobId',job_id,'message',case when job_id is null then 'Exhibition duplicated with shared media references.' else 'Exhibition created; independent media copy queued.' end);
end;
$$;

create or replace function public.admin_archive_exhibition(p_exhibition_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exhibitions;
begin
  if not public.can_publish_exhibition(p_exhibition_id) then raise exception 'archive permission required' using errcode='42501'; end if;
  update public.exhibitions set status='archived',archived_at=now(),scheduled_at=null,updated_at=now() where id=p_exhibition_id returning * into e;
  perform public.cms_write_audit('exhibition',p_exhibition_id,'archive'); return to_jsonb(e);
end; $$;

create or replace function public.admin_restore_exhibition(p_exhibition_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exhibitions;
begin
  if not public.can_publish_exhibition(p_exhibition_id) then raise exception 'restore permission required' using errcode='42501'; end if;
  update public.exhibitions set status='draft',archived_at=null,updated_at=now() where id=p_exhibition_id returning * into e;
  perform public.cms_write_audit('exhibition',p_exhibition_id,'restore'); return to_jsonb(e);
end; $$;

create or replace function public.get_public_site_content()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'homepage',(select published_value from public.site_content where key='homepage'),
    'settings',(select published_value from public.site_content where key='site-settings'),
    'media',coalesce((select jsonb_object_agg(m.id::text,jsonb_build_object(
      'id',m.id,'mediaType',m.media_type,
      'url','/storage/v1/object/public/'||m.storage_bucket||'/'||coalesce(m.desktop_avif_path,m.original_path,m.preview_avif_path),
      'mobileUrl','/storage/v1/object/public/'||m.storage_bucket||'/'||coalesce(m.mobile_avif_path,m.preview_avif_path,m.original_path),
      'metadata',m.metadata
    )) from public.media_library m where m.owner_type='platform' and m.deleted_at is null and m.archived_at is null),'{}'::jsonb),
    'publishedAt',(select greatest(max(published_at),timestamp 'epoch') from public.site_content)
  );
$$;

create or replace function public.admin_get_site_content(p_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.site_content;
begin
  if not public.is_platform_admin() then raise exception 'site permission required' using errcode='42501'; end if;
  select * into rec from public.site_content where key=p_key;
  if rec.key is null then insert into public.site_content(key,draft_value) values(p_key,'{}'::jsonb) returning * into rec; end if;
  return to_jsonb(rec);
end;
$$;

create or replace function public.admin_save_site_draft(p_key text,p_value jsonb,p_expected_revision bigint default null,p_expected_lock_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.site_content;
begin
  perform public.cms_assert_platform_admin();
  if jsonb_typeof(p_value)<>'object' then raise exception 'site content must be an object'; end if;
  insert into public.site_content(key,draft_value,draft_revision,draft_updated_at,updated_by)
  values(p_key,p_value,1,now(),auth.uid()) on conflict(key) do nothing;
  select * into rec from public.site_content where key=p_key for update;
  if p_expected_revision is not null and rec.draft_revision<>p_expected_revision then raise exception 'site revision conflict' using errcode='40001'; end if;
  if p_expected_lock_version is not null and rec.lock_version<>p_expected_lock_version then raise exception 'site lock conflict' using errcode='40001'; end if;
  update public.site_content set draft_value=p_value,draft_revision=draft_revision+1,draft_updated_at=now(),lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where key=p_key returning * into rec;
  perform public.cms_sync_site_media_usages(p_key);
  perform public.cms_write_audit('site',null,'save-draft',jsonb_build_object('key',p_key,'revision',rec.draft_revision)); return to_jsonb(rec);
end;
$$;

create or replace function public.admin_publish_site_content(p_key text,p_expected_revision bigint default null,p_expected_lock_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.site_content;
begin
  perform public.cms_assert_platform_admin();
  select * into rec from public.site_content where key=p_key for update;
  if rec.key is null then raise exception 'site content not found'; end if;
  if p_expected_revision is not null and rec.draft_revision<>p_expected_revision then raise exception 'site revision conflict' using errcode='40001'; end if;
  if p_expected_lock_version is not null and rec.lock_version<>p_expected_lock_version then raise exception 'site lock conflict' using errcode='40001'; end if;
  if p_key='homepage' and (rec.draft_value->>'schema') is distinct from 'berryboy-homepage.v1' then raise exception 'invalid homepage schema'; end if;
  update public.site_content set previous_value=published_value,previous_revision=published_revision,previous_published_at=published_at,published_value=draft_value,published_revision=draft_revision,published_at=now(),lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where key=p_key returning * into rec;
  perform public.cms_sync_site_media_usages(p_key);
  perform public.cms_write_audit('site',null,'publish',jsonb_build_object('key',p_key,'revision',rec.published_revision)); return to_jsonb(rec);
end;
$$;

create or replace function public.admin_rollback_site_content(p_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.site_content; current_value jsonb; current_revision bigint; current_at timestamptz;
begin
  perform public.cms_assert_platform_admin();
  select * into rec from public.site_content where key=p_key for update;
  if rec.previous_value is null then raise exception 'no previous site publication'; end if;
  current_value:=rec.published_value; current_revision:=rec.published_revision; current_at:=rec.published_at;
  update public.site_content set published_value=previous_value,published_revision=previous_revision,published_at=now(),previous_value=current_value,previous_revision=current_revision,previous_published_at=current_at,lock_version=lock_version+1,updated_by=auth.uid(),updated_at=now() where key=p_key returning * into rec;
  perform public.cms_sync_site_media_usages(p_key);
  perform public.cms_write_audit('site',null,'rollback',jsonb_build_object('key',p_key,'revision',rec.published_revision)); return to_jsonb(rec);
end;
$$;

create or replace function public.list_public_exhibition_cards()
returns table (
  id uuid, slug text, title text, subtitle text, short_description text, button_label text,
  curator text, status text, display_order integer, venue_name text, start_date timestamptz,
  end_date timestamptz, cover_url text, mobile_cover_url text, logo_url text, theme jsonb
)
language sql stable security definer set search_path=public,storage as $$
  select e.id,e.slug,
         coalesce(nullif(ec.published_value->>'title',''),e.title),
         coalesce(ec.published_value->>'subtitle',e.subtitle),
         coalesce(ec.published_value->>'shortDescription',e.short_description),
         coalesce(nullif(ec.published_value->>'buttonLabel',''),e.button_label),
         coalesce(ec.published_value->>'curator',e.curator),e.status,e.display_order,v.name,e.start_date,e.end_date,
         case when cover.id is null then null else '/storage/v1/object/public/'||cover.storage_bucket||'/'||coalesce(cover.desktop_avif_path,cover.original_path,cover.preview_avif_path) end,
         case when mobile.id is null then null else '/storage/v1/object/public/'||mobile.storage_bucket||'/'||coalesce(mobile.mobile_avif_path,mobile.preview_avif_path,mobile.original_path) end,
         case when logo.id is null then null else '/storage/v1/object/public/'||logo.storage_bucket||'/'||coalesce(logo.desktop_avif_path,logo.original_path,logo.preview_avif_path) end,
         coalesce(ec.published_value->'theme',e.theme)
  from public.exhibitions e
  join public.venues v on v.id=e.venue_id
  join public.exhibition_states es on es.exhibition_id=e.id and es.published_state is not null
  join public.exhibition_cards ec on ec.exhibition_id=e.id and ec.published_value is not null
  left join public.media_library cover on cover.id=nullif(ec.published_value->>'coverMediaId','')::uuid and cover.deleted_at is null and cover.archived_at is null
  left join public.media_library mobile on mobile.id=nullif(ec.published_value->>'mobileCoverMediaId','')::uuid and mobile.deleted_at is null and mobile.archived_at is null
  left join public.media_library logo on logo.id=nullif(ec.published_value->>'logoMediaId','')::uuid and logo.deleted_at is null and logo.archived_at is null
  where e.status='published' and e.archived_at is null and (e.start_date is null or e.start_date<=now()) and (e.end_date is null or e.end_date>=now())
  order by e.display_order,e.created_at;
$$;

create or replace function public.admin_list_media(p_owner_type text default null,p_owner_id uuid default null,p_media_type text default null,p_include_archived boolean default false)
returns table (
  id uuid,owner_type text,owner_id uuid,media_type text,storage_bucket text,original_path text,
  desktop_avif_path text,mobile_avif_path text,preview_avif_path text,metadata jsonb,
  processing_status text,processing_error text,usage_count bigint,created_at timestamptz,deleted_at timestamptz,archived_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select m.id,m.owner_type,m.owner_id,m.media_type,m.storage_bucket,m.original_path,m.desktop_avif_path,m.mobile_avif_path,m.preview_avif_path,m.metadata,m.processing_status,m.processing_error,
         (select count(*) from public.media_usages u where u.media_id=m.id),m.created_at,m.deleted_at,m.archived_at
  from public.media_library m
  where (p_include_archived or (m.deleted_at is null and m.archived_at is null))
    and (p_owner_type is null or m.owner_type=p_owner_type)
    and (p_owner_id is null or m.owner_id=p_owner_id)
    and (p_media_type is null or m.media_type=p_media_type)
    and (m.owner_type='platform' and public.is_platform_admin() or m.owner_type='venue' and public.can_edit_venue(m.owner_id) or m.owner_type='exhibition' and public.can_edit_exhibition(m.owner_id))
  order by m.created_at desc;
$$;

create or replace function public.admin_register_platform_media(p_media_id uuid,p_media_type text,p_storage_bucket text,p_original_path text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.media_library;
begin
  perform public.cms_assert_platform_admin();
  insert into public.media_library(id,owner_type,owner_id,media_type,storage_bucket,original_path,metadata,created_by,processing_status)
  values(p_media_id,'platform',null,p_media_type,p_storage_bucket,p_original_path,coalesce(p_metadata,'{}'::jsonb),auth.uid(),'ready') returning * into rec;
  perform public.cms_write_audit('media',rec.id,'register',jsonb_build_object('path',p_original_path)); return to_jsonb(rec);
end;
$$;

create or replace function public.admin_archive_media(p_media_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.media_library;
begin
  select * into rec from public.media_library where id=p_media_id for update;
  if rec.owner_type='platform' and not public.is_platform_admin() or rec.owner_type='venue' and not public.can_edit_venue(rec.owner_id) or rec.owner_type='exhibition' and not public.can_edit_exhibition(rec.owner_id) then raise exception 'permission denied' using errcode='42501'; end if;
  update public.media_library set archived_at=now(),updated_at=now() where id=p_media_id returning * into rec;
  perform public.cms_write_audit('media',p_media_id,'archive'); return to_jsonb(rec);
end; $$;

create or replace function public.admin_restore_media(p_media_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.media_library;
begin
  select * into rec from public.media_library where id=p_media_id;
  if rec.owner_type='platform' and not public.is_platform_admin() or rec.owner_type='venue' and not public.can_edit_venue(rec.owner_id) or rec.owner_type='exhibition' and not public.can_edit_exhibition(rec.owner_id) then raise exception 'permission denied' using errcode='42501'; end if;
  update public.media_library set archived_at=null,deleted_at=null,updated_at=now() where id=p_media_id returning * into rec;
  perform public.cms_write_audit('media',p_media_id,'restore'); return to_jsonb(rec);
end; $$;

create or replace function public.admin_request_media_delete(p_media_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.media_library; uses bigint; job public.cms_jobs;
begin
  select * into rec from public.media_library where id=p_media_id for update;
  if rec.owner_type='platform' and not public.is_platform_admin() or rec.owner_type='venue' and not public.can_edit_venue(rec.owner_id) or rec.owner_type='exhibition' and not public.can_edit_exhibition(rec.owner_id) then raise exception 'permission denied' using errcode='42501'; end if;
  select count(*) into uses from public.media_usages where media_id=p_media_id;
  if uses>0 then raise exception 'media is still referenced by % usages',uses; end if;
  insert into public.cms_jobs(job_type,entity_type,entity_id,payload,requested_by) values('permanent_delete','media',p_media_id,jsonb_build_object('bucket',rec.storage_bucket,'paths',jsonb_build_array(rec.original_path,rec.desktop_avif_path,rec.mobile_avif_path,rec.preview_avif_path)),auth.uid()) returning * into job;
  update public.media_library set deleted_at=now(),updated_at=now() where id=p_media_id;
  perform public.cms_write_audit('media',p_media_id,'request-permanent-delete',jsonb_build_object('jobId',job.id)); return to_jsonb(job);
end;
$$;

create or replace function public.admin_list_authors(p_include_archived boolean default false)
returns table(id uuid,slug text,name text,biography text,photo_media_id uuid,metadata jsonb,archived_at timestamptz,exhibition_count bigint,updated_at timestamptz)
language sql stable security definer set search_path=public as $$
  select a.id,a.slug,a.name,a.biography,a.photo_media_id,a.metadata,a.archived_at,
         (select count(*) from public.exhibition_authors ea where ea.author_id=a.id),a.updated_at
  from public.authors a
  where public.cms_user_is_active() and (p_include_archived or a.archived_at is null)
  order by a.name;
$$;

create or replace function public.admin_upsert_author(p_author_id uuid default null,p_slug text default null,p_name text default null,p_biography text default '',p_photo_media_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.authors;
begin
  if not (public.is_platform_admin() or exists(select 1 from public.venue_memberships where user_id=auth.uid() and role='venue_admin') or exists(select 1 from public.exhibition_memberships where user_id=auth.uid() and role='curator')) then raise exception 'author edit permission required' using errcode='42501'; end if;
  if p_author_id is null then
    insert into public.authors(slug,name,biography,photo_media_id,metadata) values(nullif(p_slug,''),trim(p_name),coalesce(p_biography,''),p_photo_media_id,coalesce(p_metadata,'{}'::jsonb)) returning * into rec;
    perform public.cms_write_audit('author',rec.id,'create');
  else
    update public.authors set slug=nullif(p_slug,''),name=trim(p_name),biography=coalesce(p_biography,''),photo_media_id=p_photo_media_id,metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=p_author_id returning * into rec;
    perform public.cms_write_audit('author',rec.id,'update');
  end if;
  return to_jsonb(rec);
end;
$$;

create or replace function public.admin_set_exhibition_authors(p_exhibition_id uuid,p_authors jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; assigned integer:=0;
begin
  if not public.can_edit_exhibition(p_exhibition_id) then raise exception 'permission denied' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_authors,'[]'::jsonb))<>'array' then raise exception 'authors must be an array'; end if;
  delete from public.exhibition_authors where exhibition_id=p_exhibition_id;
  for item in select value from jsonb_array_elements(coalesce(p_authors,'[]'::jsonb)) loop
    if not exists(select 1 from public.authors a where a.id=(item->>'authorId')::uuid and a.archived_at is null) then raise exception 'author not found or archived: %',item->>'authorId'; end if;
    insert into public.exhibition_authors(exhibition_id,author_id,display_order,role_label)
    values(p_exhibition_id,(item->>'authorId')::uuid,coalesce((item->>'displayOrder')::integer,assigned),coalesce(item->>'roleLabel',''));
    assigned:=assigned+1;
  end loop;
  perform public.cms_write_audit('exhibition',p_exhibition_id,'set-authors',jsonb_build_object('count',assigned));
  return jsonb_build_object('exhibitionId',p_exhibition_id,'count',assigned);
end;
$$;

create or replace function public.admin_archive_author(p_author_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.authors;
begin
  if not public.is_platform_admin() then raise exception 'platform admin permission required' using errcode='42501'; end if;
  update public.authors set archived_at=now(),updated_at=now() where id=p_author_id returning * into rec;
  perform public.cms_write_audit('author',p_author_id,'archive'); return to_jsonb(rec);
end; $$;

create or replace function public.admin_restore_author(p_author_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rec public.authors;
begin
  if not public.is_platform_admin() then raise exception 'platform admin permission required' using errcode='42501'; end if;
  update public.authors set archived_at=null,updated_at=now() where id=p_author_id returning * into rec;
  perform public.cms_write_audit('author',p_author_id,'restore'); return to_jsonb(rec);
end; $$;

create or replace function public.admin_list_users()
returns table(
  user_id uuid,email text,display_name text,active boolean,platform_role text,
  venue_roles jsonb,exhibition_roles jsonb,last_sign_in_at timestamptz,created_at timestamptz
)
language plpgsql stable security definer set search_path=public,auth as $$
begin
  perform public.cms_assert_platform_admin();
  return query
  select u.id,u.email,coalesce(p.display_name,u.raw_user_meta_data->>'display_name',split_part(u.email,'@',1),''),coalesce(p.active,true),coalesce(pm.role,'viewer'),
         coalesce((select jsonb_agg(jsonb_build_object('venueId',vm.venue_id,'role',vm.role) order by vm.venue_id) from public.venue_memberships vm where vm.user_id=u.id),'[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('exhibitionId',em.exhibition_id,'role',em.role) order by em.exhibition_id) from public.exhibition_memberships em where em.user_id=u.id),'[]'::jsonb),
         u.last_sign_in_at,u.created_at
  from auth.users u left join public.profiles p on p.user_id=u.id left join public.platform_memberships pm on pm.user_id=u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_user_access(p_user_id uuid,p_active boolean,p_platform_role text,p_venue_roles jsonb default '[]'::jsonb,p_exhibition_roles jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare item jsonb;
begin
  perform public.cms_assert_platform_admin();
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'auth user not found'; end if;
  if p_platform_role not in ('platform_admin','viewer') then raise exception 'invalid platform role'; end if;
  insert into public.profiles(user_id,active) values(p_user_id,p_active) on conflict(user_id) do update set active=excluded.active,updated_at=now();
  insert into public.platform_memberships(user_id,role) values(p_user_id,p_platform_role) on conflict(user_id) do update set role=excluded.role;
  delete from public.venue_memberships where user_id=p_user_id;
  for item in select value from jsonb_array_elements(coalesce(p_venue_roles,'[]'::jsonb)) loop
    if item->>'role' not in ('venue_admin','viewer') then raise exception 'invalid Venue role'; end if;
    insert into public.venue_memberships(venue_id,user_id,role) values((item->>'venueId')::uuid,p_user_id,item->>'role');
  end loop;
  delete from public.exhibition_memberships where user_id=p_user_id;
  for item in select value from jsonb_array_elements(coalesce(p_exhibition_roles,'[]'::jsonb)) loop
    if item->>'role' not in ('curator','viewer') then raise exception 'invalid Exhibition role'; end if;
    insert into public.exhibition_memberships(exhibition_id,user_id,role) values((item->>'exhibitionId')::uuid,p_user_id,item->>'role');
  end loop;
  perform public.cms_write_audit('user',p_user_id,'set-access',jsonb_build_object('active',p_active,'platformRole',p_platform_role,'venueRoles',p_venue_roles,'exhibitionRoles',p_exhibition_roles));
  return jsonb_build_object('userId',p_user_id,'active',p_active,'platformRole',p_platform_role);
end;
$$;

create or replace function public.admin_list_archive()
returns table(entity_type text,id uuid,name text,title text,slug text,archived_at timestamptz,reference_count bigint)
language sql stable security definer set search_path=public as $$
  select 'venue',v.id,v.name,null::text,v.slug,v.archived_at,(select count(*) from public.exhibitions e where e.venue_id=v.id)
  from public.venues v where v.status='archived' and public.can_edit_venue(v.id)
  union all
  select 'exhibition',e.id,null::text,e.title,e.slug,e.archived_at,(select count(*) from public.media_usages u where u.owner_type='exhibition' and u.owner_id=e.id)
  from public.exhibitions e where e.status='archived' and public.can_publish_exhibition(e.id)
  union all
  select 'media',m.id,null::text,coalesce(m.metadata->>'title',m.media_type),null::text,coalesce(m.archived_at,m.deleted_at),(select count(*) from public.media_usages u where u.media_id=m.id)
  from public.media_library m where (m.archived_at is not null or m.deleted_at is not null) and (m.owner_type='platform' and public.is_platform_admin() or m.owner_type='venue' and public.can_edit_venue(m.owner_id) or m.owner_type='exhibition' and public.can_edit_exhibition(m.owner_id))
  union all
  select 'author',a.id,a.name,null::text,a.slug,a.archived_at,(select count(*) from public.exhibition_authors ea where ea.author_id=a.id)
  from public.authors a where a.archived_at is not null and public.is_platform_admin();
$$;

create or replace function public.admin_restore_archived_item(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  case p_entity_type
    when 'venue' then return public.admin_restore_venue(p_entity_id);
    when 'exhibition' then return public.admin_restore_exhibition(p_entity_id);
    when 'media' then return public.admin_restore_media(p_entity_id);
    when 'author' then return public.admin_restore_author(p_entity_id);
    else raise exception 'unsupported archive entity type';
  end case;
end;
$$;

create or replace function public.admin_request_permanent_delete(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare refs bigint:=0; job public.cms_jobs;
begin
  perform public.cms_assert_platform_admin();
  case p_entity_type
    when 'venue' then select count(*) into refs from public.exhibitions where venue_id=p_entity_id;
    when 'exhibition' then select count(*) into refs from public.media_usages where owner_type='exhibition' and owner_id=p_entity_id;
    when 'author' then select count(*) into refs from public.exhibition_authors where author_id=p_entity_id;
    when 'media' then select count(*) into refs from public.media_usages where media_id=p_entity_id;
    else raise exception 'unsupported delete entity type';
  end case;
  if refs>0 then raise exception 'permanent delete blocked by % references',refs; end if;
  insert into public.cms_jobs(job_type,entity_type,entity_id,payload,requested_by) values('permanent_delete',p_entity_type,p_entity_id,jsonb_build_object('entityType',p_entity_type,'entityId',p_entity_id),auth.uid()) returning * into job;
  perform public.cms_write_audit(p_entity_type,p_entity_id,'request-permanent-delete',jsonb_build_object('jobId',job.id)); return to_jsonb(job);
end;
$$;

create or replace function public.admin_list_audit(p_entity_type text default null,p_entity_id uuid default null,p_limit integer default 100)
returns table(id bigint,user_id uuid,entity_type text,entity_id uuid,action text,details jsonb,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select a.id,a.user_id,a.entity_type,a.entity_id,a.action,a.details,a.created_at from public.admin_audit_log a
  where (p_entity_type is null or a.entity_type=p_entity_type) and (p_entity_id is null or a.entity_id=p_entity_id)
    and (public.is_platform_admin() or a.entity_type='venue' and public.can_edit_venue(a.entity_id) or a.entity_type='exhibition' and public.can_edit_exhibition(a.entity_id))
  order by a.created_at desc limit least(greatest(p_limit,1),500);
$$;

create or replace function public.admin_list_jobs()
returns table(id uuid,job_type text,entity_type text,entity_id uuid,status text,payload jsonb,result jsonb,error_message text,attempts integer,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  perform public.cms_assert_platform_admin();
  return query select j.id,j.job_type,j.entity_type,j.entity_id,j.status,j.payload,j.result,j.error_message,j.attempts,j.created_at,j.updated_at from public.cms_jobs j order by j.created_at desc limit 200;
end;
$$;

-- D3 removes direct write paths from the browser. CMS mutations use scoped SECURITY DEFINER RPCs.
drop policy if exists venue_versions_admin_insert on public.venue_versions;
drop policy if exists venue_versions_admin_update on public.venue_versions;
drop policy if exists venue_versions_admin_delete on public.venue_versions;
drop policy if exists venue_assets_editor_all on public.venue_assets;
drop policy if exists exhibitions_editor_all on public.exhibitions;

drop policy if exists venue_assets_editor_select on public.venue_assets;
create policy venue_assets_editor_select on public.venue_assets for select to authenticated using (
  exists(select 1 from public.venue_versions vv where vv.id=venue_version_id and (
    public.can_edit_venue(vv.venue_id) or exists(select 1 from public.exhibition_states es where vv.id in (es.draft_venue_version_id,es.published_venue_version_id,es.previous_venue_version_id) and public.can_edit_exhibition(es.exhibition_id))
  ))
);

drop policy if exists exhibitions_editor_select on public.exhibitions;
create policy exhibitions_editor_select on public.exhibitions for select to authenticated using (public.can_edit_exhibition(id) or public.can_edit_venue(venue_id));

alter table public.profiles enable row level security;
alter table public.exhibition_cards enable row level security;
alter table public.site_content enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.cms_jobs enable row level security;
alter table public.user_invites enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (user_id=auth.uid() or public.is_platform_admin());

drop policy if exists exhibition_cards_editor_select on public.exhibition_cards;
create policy exhibition_cards_editor_select on public.exhibition_cards for select to authenticated using (public.can_edit_exhibition(exhibition_id));

drop policy if exists site_content_admin_select on public.site_content;
create policy site_content_admin_select on public.site_content for select to authenticated using (public.is_platform_admin());

drop policy if exists admin_audit_scoped_select on public.admin_audit_log;
create policy admin_audit_scoped_select on public.admin_audit_log for select to authenticated using (
  public.is_platform_admin() or entity_type='venue' and public.can_edit_venue(entity_id) or entity_type='exhibition' and public.can_edit_exhibition(entity_id)
);

drop policy if exists cms_jobs_admin_select on public.cms_jobs;
create policy cms_jobs_admin_select on public.cms_jobs for select to authenticated using (public.is_platform_admin());

drop policy if exists user_invites_admin_select on public.user_invites;
create policy user_invites_admin_select on public.user_invites for select to authenticated using (public.is_platform_admin());

revoke insert,update,delete on public.venues from anon,authenticated;
revoke insert,update,delete on public.venue_versions from anon,authenticated;
revoke insert,update,delete on public.venue_assets from anon,authenticated;
revoke insert,update,delete on public.exhibitions from anon,authenticated;
revoke insert,update,delete on public.exhibition_cards from anon,authenticated;
revoke insert,update,delete on public.site_content from anon,authenticated;
revoke insert,update,delete on public.authors from anon,authenticated;
revoke insert,update,delete on public.platform_memberships from anon,authenticated;
revoke insert,update,delete on public.venue_memberships from anon,authenticated;
revoke insert,update,delete on public.exhibition_memberships from anon,authenticated;
revoke all on public.admin_audit_log from anon;
revoke all on public.cms_jobs from anon;
revoke all on public.user_invites from anon;

-- Updated-at triggers.
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists exhibition_cards_touch_updated_at on public.exhibition_cards;
create trigger exhibition_cards_touch_updated_at before update on public.exhibition_cards for each row execute function public.touch_updated_at();
drop trigger if exists site_content_touch_updated_at on public.site_content;
create trigger site_content_touch_updated_at before update on public.site_content for each row execute function public.touch_updated_at();
drop trigger if exists cms_jobs_touch_updated_at on public.cms_jobs;
create trigger cms_jobs_touch_updated_at before update on public.cms_jobs for each row execute function public.touch_updated_at();
drop trigger if exists user_invites_touch_updated_at on public.user_invites;
create trigger user_invites_touch_updated_at before update on public.user_invites for each row execute function public.touch_updated_at();

-- Public endpoints.
revoke all on function public.get_public_site_content() from public,anon,authenticated;
revoke all on function public.list_public_exhibition_cards() from public,anon,authenticated;
grant execute on function public.get_public_site_content() to anon,authenticated;
grant execute on function public.list_public_exhibition_cards() to anon,authenticated;

-- Authenticated CMS endpoints.
do $$
declare fn text;
begin
  foreach fn in array array[
    'get_admin_context()','admin_dashboard_summary()','admin_list_venues(text,text)','admin_get_venue(uuid)',
    'admin_create_venue(text,text,text)','admin_update_venue(uuid,jsonb)','admin_archive_venue(uuid)','admin_restore_venue(uuid)',
    'admin_create_venue_version(uuid,text,jsonb)','admin_save_venue_manifest(uuid,jsonb)',
    'admin_register_venue_asset(uuid,text,text,text,text,text,text,bigint,jsonb)','admin_validate_venue_version(uuid)',
    'admin_publish_venue_version(uuid)','admin_rollback_venue_version(uuid)',
    'admin_list_exhibitions(uuid,text,text)','admin_get_exhibition(uuid)','admin_validate_exhibition(uuid)',
    'admin_create_exhibition(uuid,uuid,text,text,jsonb)','admin_update_exhibition(uuid,jsonb)',
    'admin_save_exhibition_card(uuid,jsonb,bigint,bigint)','admin_publish_exhibition_bundle(uuid,bigint,bigint,bigint,bigint)',
    'admin_rollback_exhibition_bundle(uuid)','admin_schedule_exhibition(uuid,timestamptz)',
    'admin_assign_exhibition_venue(uuid,uuid,uuid)','admin_duplicate_exhibition(uuid,text,text,jsonb)',
    'admin_archive_exhibition(uuid)','admin_restore_exhibition(uuid)',
    'admin_get_site_content(text)','admin_save_site_draft(text,jsonb,bigint,bigint)',
    'admin_publish_site_content(text,bigint,bigint)','admin_rollback_site_content(text)',
    'admin_list_media(text,uuid,text,boolean)','admin_register_platform_media(uuid,text,text,text,jsonb)',
    'admin_archive_media(uuid)','admin_restore_media(uuid)','admin_request_media_delete(uuid)',
    'admin_list_authors(boolean)','admin_upsert_author(uuid,text,text,text,uuid,jsonb)',
    'admin_set_exhibition_authors(uuid,jsonb)','admin_archive_author(uuid)','admin_restore_author(uuid)','admin_list_users()',
    'admin_set_user_access(uuid,boolean,text,jsonb,jsonb)',
    'admin_list_archive()','admin_restore_archived_item(text,uuid)','admin_request_permanent_delete(text,uuid)',
    'admin_list_audit(text,uuid,integer)','admin_list_jobs()','can_publish_exhibition(uuid,uuid)'
  ] loop
    execute 'revoke all on function public.'||fn||' from public,anon,authenticated';
    execute 'grant execute on function public.'||fn||' to authenticated';
  end loop;
end $$;

revoke all on function public.process_due_exhibition_publications() from public,anon,authenticated;
grant execute on function public.process_due_exhibition_publications() to service_role;

-- Internal helpers are not public API.
revoke all on function public.cms_assert_platform_admin() from public,anon,authenticated;
revoke all on function public.cms_write_audit(text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.cms_rebind_spatial_state(jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.cms_sync_exhibition_card_media_usages(uuid) from public,anon,authenticated;
revoke all on function public.cms_sync_site_media_usages(text) from public,anon,authenticated;
revoke all on function public.cms_guard_frozen_venue_version() from public,anon,authenticated;
revoke all on function public.cms_guard_frozen_venue_asset() from public,anon,authenticated;
revoke all on function public.cms_user_is_active(uuid) from public,anon;
grant execute on function public.cms_user_is_active(uuid) to authenticated;

commit;
