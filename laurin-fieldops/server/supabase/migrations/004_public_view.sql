-- Visitors can view WCHS without signing in. Editing still needs a sign-in and a membership (002_security.sql).
-- Not public: memberships / members_view (team names and roles) and invites.
do $$ declare t text; begin foreach t in array array['zones','rooms','area_zones','zone_rules','calendar_exceptions','schedule_versions','activities','takt_settings','wagons','wagon_tasks','room_tasks','actuals','commitments','constraints','schedule_adjustments'] loop execute format('create policy public_read_%1$s on %1$I for select to anon, authenticated using (project = %2$L)', t, 'WCHS'); end loop; end $$;
create policy public_read_projects on projects for select to anon, authenticated using (code = 'WCHS');
create policy public_read_trades on trades for select to anon using (true);
