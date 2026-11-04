-- members_view must follow memberships' row security (team names and roles are not public).
-- 001_schema.sql creates it with security_invoker, but the live view was missing the option (fixed Nov 4, 2026).
alter view members_view set (security_invoker = true);
