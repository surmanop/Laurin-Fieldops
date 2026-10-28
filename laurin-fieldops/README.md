# Laurin Field Ops

Takt planning, Last Planner (WWP, 6-week lookahead, constraints, PPC), daily actuals, a construction tracker and a 3D zone model for Laurin projects. One app and one database serve every project; WCHS is loaded first.

## What's in this repository

| Folder | What it is |
| --- | --- |
| `src/` | The web app (React). Screens: Day, Weekly plan, 6-week lookahead, Takt plan, 3D zones, Tracker, Schedule import, Setup. |
| `src/logic/` | The rules: working days, takt forecast and slip, zone placement, MS Project XML reading. Shared by every screen. |
| `src/data/` | Two interchangeable data layers. `supabaseAdapter.js` = live database. `demoAdapter.js` = data kept in the browser for the demo. |
| `src/auth/` | `microsoftAuth.js` = Laurin Microsoft 365 sign-in. `demoAuth.js` = role picker for the demo. |
| `src/seed/wchs.json` | WCHS data: 51 zones with traced outlines, 163 rooms, 735 activities (October Update), takt plan, tracker, trades. |
| `server/supabase/migrations/` | Database tables (`001_schema.sql`) and who-can-do-what rules (`002_security.sql`). |
| `server/supabase/seed.sql` | Loads WCHS into the database. Rebuild with `npm run seed`. |
| `server/importer/` | Loads a new `.mpp` schedule straight from MS Project (uses MPXJ). |
| `server/functions/friday-summary/` | Friday email: PPC, misses by reason, constraints coming due. Sent from Outlook through Microsoft Graph. |

## Roles

| Role | Can |
| --- | --- |
| Owner | Everything: schedule import, marking work “Not happening” (pushes the schedule), takt plan, zones and Areas, trades, people |
| Super | Log actuals, add and close commitments and constraints, update the tracker |
| Viewer | Read everything |

The database enforces these rules (row-level security), so a Viewer can't write even outside the app.

## Run it on your computer

Requires Node.js 20+.

```
npm install
npm run dev -- --mode demo      # demo data, role picker, opens at http://localhost:5173
```

## Going live (about half a day, once)

1. **Database.** Create a project at supabase.com (pick the Canada region if offered). In its SQL editor run `server/supabase/migrations/001_schema.sql`, then `002_security.sql`, then `server/supabase/seed.sql`.
2. **Microsoft sign-in** (your Microsoft 365 admin, about 15 minutes). In the Entra admin center: App registrations › New registration › name `Laurin Field Ops`, single tenant, redirect URI `https://<your-supabase-project>.supabase.co/auth/v1/callback`. Create a client secret. In Supabase › Authentication › Providers › Azure, paste the client ID, secret and `https://login.microsoftonline.com/<tenant-id>` and turn it on.
3. **Hosting.** Connect this repository to Vercel or Azure Static Web Apps. Build command `npm run build`, output folder `dist`. Set the environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase › Settings › API) and `VITE_PROJECT=WCHS`. Add the site's address to Supabase › Authentication › URL configuration.
4. **First owner.** Sign in once with Microsoft, copy your user id from Supabase › Authentication › Users, and run:
   `insert into memberships values ('WCHS', '<your-user-id>', 'Peter', 'Owner');`
   After that, add people in the app under Setup (or the same insert with role `Super` or `Viewer`).
5. **Friday email** (optional). Deploy `server/functions/friday-summary` as a Supabase Edge Function with the secrets `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SENDER` (the mailbox it sends from), `MS_RECIPIENTS` (comma-separated), `PROJECT`. The Entra app needs the Microsoft Graph application permission `Mail.Send` with admin consent. Schedule it with Supabase Cron for Fridays at 15:00 Calgary time.

Prices and plan limits for Supabase, Vercel and Azure change; check them before choosing. Nothing here was priced.

## Monthly schedule update

- In the app: Schedule import › upload the MS Project XML (File › Save As › XML). Review what moved, then Apply update.
- Or from the `.mpp` directly: `python server/importer/import_schedule.py WCHS "<file>.mpp"` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set (needs Java 11+ and `pip install mpxj supabase`).

Both place activities into zones with the rules shown on the Schedule import screen. Tested on the October Update: all 735 activities and all 1,029 logic links come through exactly as the original WCHS build. Field logs, commitments and constraints are never touched by an import.

## Adding a project

Insert the project, its zones, rooms, Area mapping and placement rules (same shape as `seed.sql`), then a takt plan. Every screen filters by project.

## Marking work “Not happening”

Owners can mark any scheduled activity or takt wagon-zone as not happening, from Day, Weekly plan, 6-week lookahead, Takt plan or 3D zones. Enter the working days to push (or the earliest date it can start) and a reason; the drawer shows the effect on Occupancy, Substantial Completion and the takt train before you save.

The push runs through the schedule's own logic links, imported from MS Project (1,029 links on WCHS: finish-to-start, start-to-start and finish-to-finish, with lags). Each successor moves by however much of the push its slack can't absorb; the whole bar moves and its duration stays the same. Lags MS Project stores in elapsed days are counted as working days. Code: `src/logic/forecast.js`. Every change is listed on the Schedule import screen with who made it and why, and can be removed to undo it. Loading the next schedule update clears them by default, since the new schedule should already include them.

## How the takt forecast works

Wagon *i* enters train position *p* in takt period *p + i*. A cell's forecast start is the latest of its planned start, the same wagon finishing the previous zone, and the previous wagon finishing this zone. Lost days stretch the cell: each "Not worked" actual = 1 day, "Partial / behind" = ½ day, a missed commitment with no actuals logged that week = 1 day, rounded up, plus any days an owner pushes the wagon-zone with “Not happening”. Zones where a wagon doesn't apply pass through with no time. Code: `src/logic/takt.js`.

## Known limits

- Zone outlines in the 3D view were traced from the takt zone drawings (rev 4) and are approximate. A Revit/IFC model would replace them.
- Seven tracker rooms have no zone yet: 129, 141, 147B, 147C, 150B, 172, 173.
- Second Floor Area 1 is not mapped to zones, so its activities show as "not placed".
- Working offline (logging with no signal) is not built yet.
