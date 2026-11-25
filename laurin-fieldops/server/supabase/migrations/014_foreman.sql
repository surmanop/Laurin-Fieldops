-- Trade foremen: a Foreman is tied to one or more trades (names from the trade list / schedule resources).
-- On tasks of their trade(s) they can: log actuals, confirm completion, request an extension, enter manpower
-- for their own trade, close commitments, and raise constraints. Everything else is read only.
-- "Their task" = a schedule activity whose resources (activities.trade, comma-separated) include one of their
-- trades, or a takt wagon whose trade is one of theirs. Tasks with resource 'ALL' or no resource stay Owner/Super.
-- Extensions from a foreman don't move the schedule: they wait in extension_requests until an Owner or Super
-- approves (decide_extension), which adds the extension to schedule_adjustments.
-- Run once in Supabase › SQL editor. Safe to run again.

-- 1. Roles and trades on memberships / invites
alter table memberships drop constraint if exists memberships_role_check;
alter table memberships add constraint memberships_role_check check (role in ('Owner', 'Super', 'Foreman', 'Viewer'));
alter table memberships add column if not exists trades text[] not null default '{}';
alter table invites drop constraint if exists invites_role_check;
alter table invites add constraint invites_role_check check (role in ('Owner', 'Super', 'Foreman', 'Viewer'));
alter table invites add column if not exists trades text[] not null default '{}';

create or replace view members_view with (security_invoker = true) as
  select project, user_id, display_name, role, trades from memberships;

-- 2. Helpers
create or replace function my_trades(p text) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select m.trades from memberships m where m.project = p and m.user_id = auth.uid() and m.role = 'Foreman'), '{}')
$$;
-- Is this schedule activity / takt wagon one of the caller's trades?
create or replace function foreman_task(p text, p_uid int, p_wagon text) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_uid is not null then exists (select 1 from activities a where a.project = p and a.schedule_uid = p_uid
                                        and string_to_array(coalesce(a.trade, ''), ', ') && my_trades(p))
    when coalesce(p_wagon, '') <> '' then exists (select 1 from wagons w where w.project = p and w.wagon_id = p_wagon
                                        and w.trade = any (my_trades(p)))
    else false end
$$;

-- 3. Field data for foremen
drop policy if exists foreman_insert_actuals on actuals;
create policy foreman_insert_actuals on actuals for insert with check (
  my_role(project) = 'Foreman' and by = auth.uid()
  and (foreman_task(project, activity_uid, wagon)
       or (activity_uid is null and coalesce(wagon, '') = '' and trade = any (my_trades(project)))));
drop policy if exists foreman_change_actuals on actuals;
create policy foreman_change_actuals on actuals for update using (my_role(project) = 'Foreman' and by = auth.uid())
  with check (my_role(project) = 'Foreman' and by = auth.uid()
    and (foreman_task(project, activity_uid, wagon) or (activity_uid is null and coalesce(wagon, '') = '' and trade = any (my_trades(project)))));
drop policy if exists foreman_delete_actuals on actuals;
create policy foreman_delete_actuals on actuals for delete using (my_role(project) = 'Foreman' and by = auth.uid());

drop policy if exists foreman_manpower on manpower;
create policy foreman_manpower on manpower for all
  using (my_role(project) = 'Foreman' and trade = any (my_trades(project)))
  with check (my_role(project) = 'Foreman' and trade = any (my_trades(project)));

-- Close (update) commitments of their trade or task; creating and deleting stay Owner/Super.
drop policy if exists foreman_update_commitments on commitments;
create policy foreman_update_commitments on commitments for update
  using (my_role(project) = 'Foreman' and (trade = any (my_trades(project)) or foreman_task(project, activity_uid, wagon)))
  with check (my_role(project) = 'Foreman' and (trade = any (my_trades(project)) or foreman_task(project, activity_uid, wagon)));

-- Raise constraints for their trade or task; clearing stays Owner/Super.
drop policy if exists foreman_insert_constraints on constraints;
create policy foreman_insert_constraints on constraints for insert with check (
  my_role(project) = 'Foreman' and by = auth.uid() and (trade = any (my_trades(project)) or foreman_task(project, activity_uid, wagon)));

-- 4. Extension requests
create table if not exists extension_requests (
  id uuid primary key default gen_random_uuid(),
  project text references projects(code) on delete cascade,
  target_uid int, target_takt text,
  name text, path text, trade text,
  days int not null check (days > 0),
  from_finish date, new_finish date,
  reason text not null, note text default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  requested_by uuid references auth.users(id) default auth.uid(),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id), decided_at timestamptz, decision_note text default '',
  check ((target_uid is null) <> (target_takt is null))
);
alter table extension_requests enable row level security;
drop policy if exists read_extension_requests on extension_requests;
create policy read_extension_requests on extension_requests for select using (my_role(project) is not null);
drop policy if exists foreman_insert_extension_requests on extension_requests;
create policy foreman_insert_extension_requests on extension_requests for insert with check (
  my_role(project) in ('Owner', 'Super', 'Foreman') and requested_by = auth.uid() and status = 'Pending'
  and (my_role(project) <> 'Foreman'
       or foreman_task(project, target_uid, case when target_takt like 'tk:%' then split_part(substr(target_takt, 4), '|', 1) end)));
-- The requester can withdraw their own pending request.
drop policy if exists withdraw_extension_requests on extension_requests;
create policy withdraw_extension_requests on extension_requests for delete using (requested_by = auth.uid() and status = 'Pending');

-- Owner/Super decide. Approving adds the extension to the schedule (finish moves; successors follow).
create or replace function decide_extension(p_id uuid, p_approve boolean, p_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare r extension_requests;
begin
  select * into r from extension_requests where id = p_id for update;
  if r.id is null then raise exception 'No such request'; end if;
  if my_role(r.project) not in ('Owner', 'Super') then raise exception 'Only an owner or super can approve extensions'; end if;
  if r.status <> 'Pending' then raise exception 'Already %', lower(r.status); end if;
  if p_approve then
    insert into schedule_adjustments (project, target_uid, target_takt, name, path, days, reason, note, from_start, by, at)
    values (r.project, r.target_uid, r.target_takt, r.name, r.path, r.days, 'Extended: ' || r.reason,
            trim(both ' ' from coalesce(r.note, '') || case when coalesce(p_note, '') <> '' then ' (approved: ' || p_note || ')' else '' end),
            null, auth.uid(), now());
  end if;
  update extension_requests set status = case when p_approve then 'Approved' else 'Rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '') where id = p_id;
  return case when p_approve then 'Approved' else 'Rejected' end;
end $$;
revoke all on function decide_extension(uuid, boolean, text) from public, anon;
grant execute on function decide_extension(uuid, boolean, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table extension_requests;
exception when duplicate_object then null; end $$;

-- 5. Adding people as Foreman (with trades)
create or replace function invite_member(p_project text, p_email text, p_name text, p_role text, p_trades text[]) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); uid uuid; t text[] := case when p_role = 'Foreman' then coalesce(p_trades, '{}') else '{}' end;
begin
  if my_role(p_project) is distinct from 'Owner' then raise exception 'Only an owner can add people'; end if;
  if p_role not in ('Owner', 'Super', 'Foreman', 'Viewer') then raise exception 'Role must be Owner, Super, Foreman or Viewer'; end if;
  if position('@' in e) < 2 or position('.' in split_part(e, '@', 2)) = 0 or e like '% %' then raise exception 'That is not an email address'; end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid is not null then
    insert into memberships (project, user_id, display_name, role, trades) values (p_project, uid, coalesce(nullif(trim(p_name), ''), e), p_role, t)
      on conflict (project, user_id) do update set role = excluded.role, display_name = excluded.display_name, trades = excluded.trades;
    delete from invites where project = p_project and email = e;
    return 'member';
  end if;
  insert into invites (project, email, display_name, role, trades) values (p_project, e, coalesce(nullif(trim(p_name), ''), e), p_role, t)
    on conflict (project, email) do update set role = excluded.role, display_name = excluded.display_name, trades = excluded.trades;
  return 'invited';
end $$;
revoke all on function invite_member(text, text, text, text, text[]) from public, anon;
grant execute on function invite_member(text, text, text, text, text[]) to authenticated;

create or replace function claim_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then return new; end if;
  insert into memberships (project, user_id, display_name, role, trades)
    select project, new.id, display_name, role, trades from invites where email = lower(new.email)
    on conflict (project, user_id) do nothing;
  delete from invites where email = lower(new.email);
  return new;
end $$;
