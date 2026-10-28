// Places schedule activities into zones. The rules live in the database (zoneRules, areaZones) so the
// owner can change them without code. Same logic runs in the browser (XML import) and in server/importer.
export function categorize(task, { zoneRules, areaZones }) {
  const chain = task.path ? task.path.split(' › ') : [];
  const top = chain[0] || '';
  const group = chain[chain.length - 1] || '';
  const floor = chain.includes('Second Floor') ? 'L2' : chain.includes('Main Floor') ? 'L1' : '';
  for (const r of zoneRules) {
    if (r.group !== group) continue;
    if (r.floor && r.floor !== floor) continue;
    if (r.name && !new RegExp(r.name, 'i').test(task.name)) continue;
    return { category: 'zone', zones: r.zones, area: '', bucket: '', basis: r.basis };
  }
  if (top === 'Interior' && floor === 'L1' && /^Area \d$/.test(group)) {
    const area = 'L1 ' + group;
    const zones = areaZones.filter((a) => a.area === area).map((a) => a.zone);
    if (zones.length) return { category: 'areawide', zones, area, bucket: '', basis: `Schedule 'Main Floor ${group}'; Area mapping` };
  }
  if ((top === 'Structure' || top === 'Interior') && chain.length > 1 && !chain.includes('Roofing')) {
    const fl = floor === 'L2' ? 'L2' : 'L1';
    const bucket = group === 'Washroom Final Finishes and Closeout' ? 'All washrooms · final finishes' : group.startsWith('Area') || group === 'Main Floor' || group === 'Second Floor' ? `${fl} · ${group}` : group === 'Interior Finishes' ? '' : `${fl} · ${group.replace('Level 2 ', '')}`;
    if (bucket) return { category: 'unplaced', zones: [], area: '', bucket, basis: 'Schedule tracks this by Area or group; zones not confirmed' };
  }
  return { category: 'site', zones: [], area: '', bucket: '', basis: '' };
}
