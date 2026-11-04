-- Tasks the schedule rules couldn't place, put into zones by the team (Owners and Supers).
-- Keyed by MS Project unique ID so placements carry over when an updated schedule is loaded.
create table zone_placements (
  project text references projects(code) on delete cascade,
  schedule_uid int not null,
  zones text[] not null check (cardinality(zones) > 0),
  by uuid references auth.users(id) default auth.uid(),
  at timestamptz not null default now(),
  primary key (project, schedule_uid)
);
alter table zone_placements enable row level security;
create policy read_zone_placements on zone_placements for select using (my_role(project) is not null);
create policy field_write_zone_placements on zone_placements for all using (my_role(project) in ('Owner', 'Super')) with check (my_role(project) in ('Owner', 'Super'));
create policy public_read_zone_placements on zone_placements for select to anon, authenticated using (project = 'WCHS');
alter publication supabase_realtime add table zone_placements;
