# Setting up Laurin Field Ops for another project

Source snapshot: GitHub `surmanop/Laurin-Fieldops`, commit `ef6ae3f` (Nov 25, 2026). Everything the live WCHS app runs is in this folder.
Not included: `node_modules/` and `dist/` (rebuilt by `npm install` / `npm run build`), and any keys or passwords (those live in Vercel and Supabase settings only).

There are two ways to do it. Pick one before starting.

| | A. Same app and database, add a project | B. Separate copy (own repo, database, site) |
| --- | --- | --- |
| Database | Existing Supabase project; rows are tagged by project code | New Supabase project |
| Site | A second Vercel project from the same repo, `VITE_PROJECT=<CODE>` | New repo + new Vercel project |
| Code changes | The WCHS-specific items below only | The WCHS-specific items below, plus rename/branding if wanted |
| Shared | People sign in once; trade list is shared by all projects (`trades` table has no project column) | Nothing shared |

## WCHS-specific items to change (both options)

| What | Where |
| --- | --- |
| Project code fallback `'WCHS'` | `src/data/supabaseAdapter.js` line 6, `api/set-temp-password.js` line 29 (set `VITE_PROJECT` in Vercel and these are not used) |
| Public "view without signing in" is hard-wired to `'WCHS'` | `server/supabase/migrations/004_public_view.sql`, `005_manpower.sql` (line 14), `008_zone_placements.sql` (line 14). For a new project either add the same policies with the new code or leave it sign-in only |
| Zone board train names | `src/screens/Day.jsx` line 12 (`TRAINS`). Zones whose train isn't listed still show, after the listed ones |
| Tracker column order | `src/data/supabaseAdapter.js` line 30 (`TASK_ORDER`). Tasks not listed go to the end, alphabetically |
| Floor plan images used by the zone map | `src/assets/plan-l1.jpg`, `plan-l2.jpg` (imported in `src/ui/common.jsx` line 6). Zone label positions are `plan_l1` / `plan_l2` in the `zones` table, in % of the image [x, y] |
| 3D zone outlines | `geometry` in the `zones` table (traced from the WCHS takt zone drawings) |
| Demo data | `src/seed/wchs.json` (demo build only) |
| Database seed | `server/supabase/seed.sql` = WCHS project, zones, rooms, Area mapping, rules, activities. Rebuild from a new seed JSON with `npm run seed` (`scripts/make-seed-sql.mjs`) |

## Project data the app needs (per project)

All tables carry a `project` column (see `server/supabase/migrations/001_schema.sql` for exact columns):

1. `projects`: one row (code, name, address, status date).
2. `zones`: code, level, rooms description, train, train position, sort order; optional Area, plan label positions, 3D outline.
3. `rooms`: room number, zone, and the tracker tasks via `room_tasks`.
4. `area_zones` and `zone_rules`: how schedule groups/Areas map to zones (used by Schedule import).
5. `takt_settings` (one row) and `wagons`: can be set up afterwards on the Takt plan screen.
6. `calendar_exceptions`: shutdowns/holidays.
7. Schedule: import the MS Project XML on the Schedule import screen once the above exists.
8. People: first Owner by SQL (see README step 4), then Setup › People and roles.

## Option A steps

1. In Supabase › SQL editor, insert the new project's rows (items 1-4, 6 above) using `seed.sql` as the pattern, with the new code instead of `WCHS`.
2. Insert yourself as Owner: `insert into memberships (project, user_id, display_name, role) values ('<CODE>', '<your user id>', 'Peter', 'Owner');`
3. Vercel › New project › same GitHub repo, root `laurin-fieldops`, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same as WCHS), `VITE_PROJECT=<CODE>`, and `SUPABASE_SERVICE_ROLE_KEY` if you want temporary passwords. Add the new site address in Supabase › Authentication › URL configuration.
4. Change the WCHS-specific code items above in a way that works for both projects, or they will apply to both sites (same code).

## Option B steps

1. New GitHub repo with this folder; new Supabase project.
2. Run every file in `server/supabase/migrations/` in number order (001 → 015), then your own seed SQL.
3. Microsoft sign-in, hosting and first Owner: README "Going live" steps 2-4.
4. Change the WCHS-specific items above.

## Not verified here

- Option A with two live projects has not been run; every screen and database rule filters by project code, but a second project has never been loaded.
- The `trades` table is shared across projects (no project column), so Option A projects share one trade list.
- Whether the Friday email function (`server/functions/friday-summary`) is deployed for WCHS was not checked.
