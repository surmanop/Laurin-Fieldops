-- Hand-over to the next task: when a task is logged Completed, an Owner or Super can name its successor.
-- The successor shows "Ready" (predecessor complete) until work is logged on it. The schedule does not move.
-- successor_uid: a master schedule activity; successor_takt: a takt cell 'tk:<wagon>|<zone>'.
-- Run after 014_foreman.sql, in Supabase › SQL editor. Safe to run again. (014 now includes the same lines,
-- so this file is only needed if 014 was run before the hand-over was added.)
alter table actuals add column if not exists successor_uid int;
alter table actuals add column if not exists successor_takt text;

-- Foremen log their own completions but don't hand over to the next task (Owner/Super only).
drop policy if exists foreman_insert_actuals on actuals;
create policy foreman_insert_actuals on actuals for insert with check (
  my_role(project) = 'Foreman' and by = auth.uid() and successor_uid is null and successor_takt is null
  and (foreman_task(project, activity_uid, wagon)
       or (activity_uid is null and coalesce(wagon, '') = '' and trade = any (my_trades(project)))));
drop policy if exists foreman_change_actuals on actuals;
create policy foreman_change_actuals on actuals for update using (my_role(project) = 'Foreman' and by = auth.uid())
  with check (my_role(project) = 'Foreman' and by = auth.uid() and successor_uid is null and successor_takt is null
    and (foreman_task(project, activity_uid, wagon) or (activity_uid is null and coalesce(wagon, '') = '' and trade = any (my_trades(project)))));
