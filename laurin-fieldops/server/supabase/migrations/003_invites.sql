-- Add people by email before they ever sign in. Owners add them on Setup › People and roles.
-- On their first sign-in (new account) the invite turns into a membership with the role set here.
create table invites (
  project text references projects(code) on delete cascade,
  email text not null check (email = lower(email)),
  display_name text not null,
  role text not null check (role in ('Owner', 'Super', 'Viewer')),
  invited_at timestamptz not null default now(),
  invited_by uuid default auth.uid(),
  primary key (project, email)
);
alter table invites enable row level security;
create policy owner_all_invites on invites for all using (my_role(project) = 'Owner') with check (my_role(project) = 'Owner');

-- Owner adds a person. If they already have an account (signed in before), they get access now;
-- otherwise the email waits in invites until their first sign-in.
create function invite_member(p_project text, p_email text, p_name text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); uid uuid;
begin
  if my_role(p_project) is distinct from 'Owner' then raise exception 'Only an owner can add people'; end if;
  if p_role not in ('Owner', 'Super', 'Viewer') then raise exception 'Role must be Owner, Super or Viewer'; end if;
  if position('@' in e) < 2 or position('.' in split_part(e, '@', 2)) = 0 or e like '% %' then raise exception 'That is not an email address'; end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid is not null then
    insert into memberships (project, user_id, display_name, role) values (p_project, uid, coalesce(nullif(trim(p_name), ''), e), p_role)
      on conflict (project, user_id) do update set role = excluded.role, display_name = excluded.display_name;
    delete from invites where project = p_project and email = e;
    return 'member';
  end if;
  insert into invites (project, email, display_name, role) values (p_project, e, coalesce(nullif(trim(p_name), ''), e), p_role)
    on conflict (project, email) do update set role = excluded.role, display_name = excluded.display_name;
  return 'invited';
end $$;
revoke all on function invite_member(text, text, text, text) from public, anon;
grant execute on function invite_member(text, text, text, text) to authenticated;

-- First sign-in: a new account whose email has invites becomes a member of those projects.
create function claim_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then return new; end if;
  insert into memberships (project, user_id, display_name, role)
    select project, new.id, display_name, role from invites where email = lower(new.email)
    on conflict (project, user_id) do nothing;
  delete from invites where email = lower(new.email);
  return new;
end $$;
revoke all on function claim_invites() from public, anon, authenticated;
create trigger claim_invites_on_signup after insert on auth.users for each row execute function claim_invites();
