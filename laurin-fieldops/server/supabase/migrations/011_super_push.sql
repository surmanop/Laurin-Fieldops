-- Supers can push the schedule ("Not happening") when they log an actual as "Not worked".
-- Adding a push only; changing or removing pushes stays Owner-only (owner_write_schedule_adjustments).
create policy super_insert_schedule_adjustments on schedule_adjustments for insert with check (my_role(project) in ('Owner', 'Super'));
