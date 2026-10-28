"""Load an MS Project schedule (.mpp or .xml) into Laurin Field Ops.

Reads the file with MPXJ, places each activity into zones using the project's rules
(zone_rules + area_zones, the same logic as src/logic/mapping.js), and replaces the
project's activities in one transaction (replace_activities). Field logs are untouched.

    pip install mpxj supabase        # needs Java 11+ for MPXJ
    set SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...
    python import_schedule.py WCHS "WCHS Master Schedule November Update.mpp"

Run it on your PC, or deploy as an Azure Function / scheduled job that watches a SharePoint folder.
"""
import os, re, sys
import jpype, mpxj  # noqa: F401  (mpxj starts the JVM it needs)
from supabase import create_client


def read_tasks(path):
    jpype.startJVM()
    from org.mpxj.reader import UniversalProjectReader
    proj = UniversalProjectReader().read(path)
    status = proj.getProjectProperties().getStatusDate()
    out = []
    for t in proj.getTasks():
        if t.getID() is None or t.getSummary() or int(t.getOutlineLevel() or 0) == 0:
            continue
        chain, p = [], t.getParentTask()
        while p is not None and p.getParentTask() is not None and int(p.getOutlineLevel() or 0) > 1:
            chain.append(re.sub(r"\s+", " ", str(p.getName())).strip())
            p = p.getParentTask()
        preds = []
        for r in (t.getPredecessors() or []):
            p_task = r.getPredecessorTask() if hasattr(r, "getPredecessorTask") else r.getTargetTask()
            lag = r.getLag()
            preds.append([int(p_task.getUniqueID()), str(r.getType()), int(round(float(lag.getDuration()))) if lag else 0])
        out.append(dict(preds=preds, uid=int(t.getUniqueID()), name=re.sub(r"\s+", " ", str(t.getName() or "")).strip(), path=" › ".join(reversed(chain)),
                        start=str(t.getStart())[:10], finish=str(t.getFinish())[:10], pct=float(str(t.getPercentageComplete() or 0)),
                        milestone=bool(t.getMilestone()), critical=bool(t.getCritical()), trade=str(t.getResourceNames() or "") if hasattr(t, "getResourceNames") else ""))
    return (str(status)[:10] if status else ""), out


def categorize(task, rules, area_zones):
    chain = task["path"].split(" › ") if task["path"] else []
    top, group = (chain[0] if chain else ""), (chain[-1] if chain else "")
    floor = "L2" if "Second Floor" in chain else "L1" if "Main Floor" in chain else ""
    for r in rules:
        if r["schedule_group"] != group or (r["floor"] and r["floor"] != floor):
            continue
        if r["name_pattern"] and not re.search(r["name_pattern"], task["name"], re.I):
            continue
        return dict(category="zone", zones=r["zones"], area="", bucket="", basis=r["basis"] or "")
    if top == "Interior" and floor == "L1" and re.fullmatch(r"Area \d", group):
        area = "L1 " + group
        zones = [a["zone_code"] for a in area_zones if a["area"] == area]
        if zones:
            return dict(category="areawide", zones=zones, area=area, bucket="", basis=f"Schedule 'Main Floor {group}'; Area mapping")
    if top in ("Structure", "Interior") and len(chain) > 1 and "Roofing" not in chain:
        fl = "L2" if floor == "L2" else "L1"
        if group == "Washroom Final Finishes and Closeout":
            bucket = "All washrooms · final finishes"
        elif group.startswith("Area") or group in ("Main Floor", "Second Floor"):
            bucket = f"{fl} · {group}"
        elif group == "Interior Finishes":
            bucket = ""
        else:
            bucket = f"{fl} · " + group.replace("Level 2 ", "")
        if bucket:
            return dict(category="unplaced", zones=[], area="", bucket=bucket, basis="Schedule tracks this by Area or group; zones not confirmed")
    return dict(category="site", zones=[], area="", bucket="", basis="")


def main(project, path):
    db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    rules = db.table("zone_rules").select("*").eq("project", project).order("priority").execute().data
    area_zones = db.table("area_zones").select("*").eq("project", project).execute().data
    status, tasks = read_tasks(path)
    rows = [{**t, **categorize(t, rules, area_zones)} for t in tasks]
    name = os.path.splitext(os.path.basename(path))[0]
    db.rpc("replace_activities", {"p_project": project, "p_rows": rows, "p_version": {"name": name, "statusDate": status, "count": len(rows)}}).execute()
    counts = {c: sum(1 for r in rows if r["category"] == c) for c in ("zone", "areawide", "unplaced", "site")}
    print(f"Loaded {len(rows)} activities from {name} (status date {status}): {counts}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
