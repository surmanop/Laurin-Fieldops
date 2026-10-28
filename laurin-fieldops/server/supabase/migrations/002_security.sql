-- Who may do what. Mirrors RIGHTS in src/store.jsx; the database is the real gate.
--   Owner: everything for their project.  Super: field logs + tracker.  Viewer: read only.

create function my_role(p text) returns text language sql stable security definer as $$
  select role from memberships where project = p and user_id = auth.uid()
$$;

do $$
declare t text;
begin
  foreach t in array array['zones','rooms','area_zones','zone_rules','calendar_exceptions','schedule_versions','activities','takt_settings','wagons','wagon_tasks','room_tasks','actuals','commitments','constraints','memberships','schedule_adjustments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_%1$s on %1$I for select using (my_role(project) is not null)', t);
  end loop;
end $$;

alter table projects enable row level security;
create policy read_projects on projects for select using (my_role(code) is not null);
alter table trades enable row level security;
create policy read_trades on trades for select using (auth.uid() is not null);
create policy write_trades on trades for all using (exists (select 1 from memberships where user_id = auth.uid() and role = 'Owner'));

-- Plan data: owners only
do $$
declare t text;
begin
  foreach t in array array['zones','rooms','area_zones','zone_rules','calendar_exceptions','schedule_versions','activities','takt_settings','wagons','wagon_tasks','memberships','schedule_adjustments'] loop
    execute format('create policy owner_write_%1$s on %1$I for all using (my_role(project) = ''Owner'') with check (my_role(project) = ''Owner'')', t);
  end loop;
end $$;

-- Field data: owners and supers
do $$
declare t text;
begin
  foreach t in array array['room_tasks','actuals','commitments','constraints'] loop
    execute format('create policy field_write_%1$s on %1$I for all using (my_role(project) in (''Owner'',''Super'')) with check (my_role(project) in (''Owner'',''Super''))', t);
  end loop;
end $$;

-- Owner-only bulk replacements used by the app (run as the caller, so the policies above still apply)
create function replace_wagons(p_project text, p_wagons jsonb) returns void language plpgsql as $$
begin
  delete from wagons where project = p_project;
  insert into wagons (project, wagon_id, sequence, name, trade, schedule_match, skip_zones)
  select p_project, w->>'id', ord::int, w->>'name', w->>'trade',
         array(select jsonb_array_elements_text(coalesce(w->'match','[]'))), array(select jsonb_array_elements_text(coalesce(w->'skip','[]')))
  from jsonb_array_elements(p_wagons) with ordinality as x(w, ord);
end $$;

create function replace_trades(p_trades jsonb) returns void language plpgsql as $$
begin
  delete from trades;
  insert into trades (name, sort_order) select t, ord::int from jsonb_array_elements_text(p_trades) with ordinality as x(t, ord);
end $$;

create function replace_area_zones(p_project text, p_rows jsonb) returns void language plpgsql as $$
begin
  delete from area_zones where project = p_project;
  insert into area_zones (project, area, schedule_group, zone_code)
  select p_project, r->>'area', r->>'group', r->>'zone' from jsonb_array_elements(p_rows) r;
end $$;

create function replace_activities(p_project text, p_rows jsonb, p_version jsonb, p_clear_adjustments boolean default true) returns void language plpgsql as $$
begin
  delete from activities where project = p_project;
  if p_clear_adjustments then delete from schedule_adjustments where project = p_project; end if;
  insert into activities (project, schedule_uid, name, path, start, finish, pct, milestone, critical, trade, category, zones, area, bucket, basis, preds)
  select p_project, (r->>'uid')::int, r->>'name', r->>'path', (r->>'start')::date, (r->>'finish')::date, (r->>'pct')::numeric,
         coalesce((r->>'milestone')::boolean, false), coalesce((r->>'critical')::boolean, false), r->>'trade', r->>'category',
         array(select jsonb_array_elements_text(coalesce(r->'zones','[]'))), r->>'area', r->>'bucket', r->>'basis', coalesce(r->'preds','[]')
  from jsonb_array_elements(p_rows) r;
  insert into schedule_versions (project, name, status_date, activity_count, loaded_by)
  values (p_project, p_version->>'name', nullif(p_version->>'statusDate','')::date, (p_version->>'count')::int, auth.uid());
  update projects set status_date = nullif(p_version->>'statusDate','')::date where code = p_project and p_version->>'statusDate' <> '';
end $$;

-- Realtime updates for the field logs
alter publication supabase_realtime add table actuals, commitments, constraints, room_tasks, schedule_adjustments;
