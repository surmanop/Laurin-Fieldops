-- Laurin Field Ops: database schema (PostgreSQL / Supabase).
-- Every table carries `project` so one database serves every job.

create table projects (
  code text primary key,
  name text not null,
  address text,
  status_date date
);

create table memberships (            -- who can use which project, and as what
  project text references projects(code) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('Owner', 'Super', 'Viewer')),
  primary key (project, user_id)
);
create view members_view with (security_invoker = true) as select project, user_id, display_name, role from memberships;  -- respects memberships row security

create table trades (name text primary key, sort_order int not null default 0);

create table zones (
  project text references projects(code) on delete cascade,
  zone_code text not null,
  level text not null,               -- L1, L2, L1+L2
  rooms text,
  train text,
  train_position int,
  area text,
  sort_order int,
  plan_l1 numeric[],                 -- label position on the L1 plan image, % [x, y]
  plan_l2 numeric[],
  geometry jsonb,                    -- traced outline for the 3D view
  primary key (project, zone_code)
);

create table rooms (
  project text references projects(code) on delete cascade,
  room text not null,
  room_name text,
  floor text,
  zone_code text,
  primary key (project, room)
);

create table area_zones (             -- which takt zones each schedule Area covers
  project text references projects(code) on delete cascade,
  area text not null,
  schedule_group text,
  zone_code text not null,
  primary key (project, area, zone_code)
);

create table zone_rules (             -- places schedule activities into zones by group / name
  id bigserial primary key,
  project text references projects(code) on delete cascade,
  priority int not null default 100,
  schedule_group text not null,
  name_pattern text,                  -- case-insensitive regex, blank = any name
  floor text,
  zones text[] not null,
  basis text
);

create table calendar_exceptions (
  id bigserial primary key,
  project text references projects(code) on delete cascade,
  name text not null,
  from_date date not null,
  to_date date not null
);

create table schedule_versions (
  id bigserial primary key,
  project text references projects(code) on delete cascade,
  name text not null,
  status_date date,
  activity_count int,
  loaded_at timestamptz not null default now(),
  loaded_by uuid references auth.users(id)
);

create table activities (
  project text references projects(code) on delete cascade,
  schedule_uid int not null,
  name text not null,
  path text,
  start date not null,
  finish date not null,
  pct numeric,
  milestone boolean default false,
  critical boolean default false,
  trade text,
  category text not null check (category in ('zone', 'areawide', 'unplaced', 'site')),
  zones text[] default '{}',
  area text,
  bucket text,
  basis text,
  preds jsonb default '[]',          -- logic links: [[predecessor uid, 'FS'|'SS'|'FF', lag working days], ...]
  primary key (project, schedule_uid)
);
create index on activities (project, start, finish);

create table takt_settings (
  project text primary key references projects(code) on delete cascade,
  train_start date not null,
  takt_days int not null check (takt_days between 1 and 20),
  train_order text[] not null,
  baseline_note text
);

create table wagons (
  project text references projects(code) on delete cascade,
  wagon_id text not null,
  sequence int not null,
  name text not null,
  trade text,
  schedule_match text[] default '{}',
  skip_zones text[] default '{}',
  primary key (project, wagon_id)
);

create table wagon_tasks (            -- which tracker tasks prove each wagon done (plan vs field)
  project text references projects(code) on delete cascade,
  wagon_id text not null,
  task text not null,
  primary key (project, wagon_id, task)
);

create table room_tasks (             -- the construction tracker
  project text references projects(code) on delete cascade,
  room text not null,
  task text not null,
  status text not null default 'Not started' check (status in ('Not started', 'Ready', 'Incomplete Progress', 'Complete', 'N/A')),
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz default now(),
  primary key (project, room, task)
);
create index on room_tasks (project, task);

create table actuals (
  id uuid primary key default gen_random_uuid(),
  project text references projects(code) on delete cascade,
  day date not null,
  zone text not null,
  activity_uid int,
  wagon text default '',
  activity_name text,
  status text not null check (status in ('Worked as planned', 'Partial / behind', 'Not worked', 'Completed', 'Unscheduled work')),
  trade text, crew int, pct int, notes text,
  by uuid references auth.users(id) default auth.uid(),
  at timestamptz default now()
);
create index on actuals (project, day);

create table commitments (
  id uuid primary key default gen_random_uuid(),
  project text references projects(code) on delete cascade,
  week date not null,
  zone text not null,
  activity_uid int,
  wagon text default '',
  activity_name text,
  what text not null,
  trade text, committed_by text, due text,
  status text not null default 'Open' check (status in ('Open', 'Complete', 'Not complete')),
  reason text default '',
  by uuid references auth.users(id) default auth.uid(),
  at timestamptz default now(),
  updated_by uuid, updated_at timestamptz
);
create index on commitments (project, week);

create table constraints (
  id uuid primary key default gen_random_uuid(),
  project text references projects(code) on delete cascade,
  zone text not null,
  activity_uid int,
  wagon text default '',
  activity_name text,
  activity_start text,
  type text not null,
  trade text,
  what text not null,
  responsible text,
  need_by date not null,
  status text not null default 'Open' check (status in ('Open', 'Cleared')),
  cleared_on text default '',
  by uuid references auth.users(id) default auth.uid(),
  at timestamptz default now(),
  updated_by uuid
);
create index on constraints (project, status, need_by);

create table schedule_adjustments (   -- "Not happening": pushes an activity or takt cell; the app forecasts through the logic links
  id uuid primary key default gen_random_uuid(),
  project text references projects(code) on delete cascade,
  target_uid int,                     -- master schedule activity
  target_takt text,                   -- or a takt cell, 'tk:<wagon>|<zone>'
  name text, path text,
  days int not null check (days > 0),
  reason text not null,
  note text,
  from_start date,
  by uuid references auth.users(id) default auth.uid(),
  at timestamptz default now(),
  check ((target_uid is null) <> (target_takt is null))
);
