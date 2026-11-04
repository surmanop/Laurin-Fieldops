-- Daily site headcount per trade (Day screen › Manpower on site). Owners and supers record it; same read rules as the field logs.
create table manpower (
  project text references projects(code) on delete cascade,
  day date not null,
  trade text not null,
  headcount int not null check (headcount between 0 and 2000),
  by uuid references auth.users(id) default auth.uid(),
  at timestamptz not null default now(),
  primary key (project, day, trade)
);
alter table manpower enable row level security;
create policy read_manpower on manpower for select using (my_role(project) is not null);
create policy field_write_manpower on manpower for all using (my_role(project) in ('Owner', 'Super')) with check (my_role(project) in ('Owner', 'Super'));
create policy public_read_manpower on manpower for select to anon, authenticated using (project = 'WCHS');
alter publication supabase_realtime add table manpower;
