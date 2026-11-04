-- A person on a temporary password (set by an owner, see api/set-temp-password.js) has no project rights
-- until they set their own password: my_role() returns null while the sign-in token carries temp_password=true.
-- The app shows only the "set your own password" screen in that state; this makes the database agree.
create or replace function my_role(p text) returns text language sql stable security definer set search_path = public as $$
  select m.role from memberships m
  where m.project = p and m.user_id = auth.uid()
    and coalesce(auth.jwt() -> 'user_metadata' ->> 'temp_password', 'false') <> 'true'
$$;
