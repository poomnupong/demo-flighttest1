import { createHash } from 'node:crypto';

export function excludedBuildingReason(tags) {
  const building = tags.building?.toLowerCase();
  if (!building || building === 'no') return 'not a building';
  if (['construction', 'proposed', 'planned'].includes(building)
    || ['construction', 'proposed', 'planned'].some((state) => tags[state] && tags[state] !== 'no')) return 'construction or proposal';
  if (['demolished', 'razed', 'removed', 'destroyed', 'ruins'].includes(building)) return 'removed structure';
  for (const state of ['demolished', 'razed', 'removed', 'destroyed']) {
    if (tags[state] === 'yes' || (tags[`${state}:building`] && tags[`${state}:building`] !== 'no')) return 'removed structure';
  }
  // Disused occupants and old project end dates do not mean the building is gone.
  return null;
}

export function footprintSignature(rings) {
  const boundaries = rings.map(({ role, points }) => {
    const edges = [];
    for (let i = 1; i < points.length; i++) {
      edges.push([points[i - 1].join(','), points[i].join(',')].sort().join(':'));
    }
    return `${role}:${edges.sort().join(';')}`;
  }).sort().join('|');
  return createHash('sha256').update(boundaries).digest('hex');
}

export function reconcileBuildings(candidates, landmarkIds = new Set()) {
  const excluded = [], active = [], seenIds = new Set();
  for (const candidate of candidates) {
    const id = `${candidate.element.type}/${candidate.element.id}`;
    if (seenIds.has(id)) throw new Error(`Duplicate OSM object in snapshot: ${id}`);
    seenIds.add(id);
    const reason = excludedBuildingReason(candidate.element.tags);
    if (reason) excluded.push({ id, reason });
    else active.push(candidate);
  }
  const memberOwners = new Map();
  for (const { element } of active) if (element.type === 'relation') {
    for (const member of element.members) {
      if (member.type === 'way' && (!member.role || member.role === 'outer')) memberOwners.set(member.ref, `relation/${element.id}`);
    }
  }
  const priority = ({ element }) => (landmarkIds.has(element.id) ? 4 : 0)
    + (element.type === 'relation' ? 2 : 0) + (element.tags.height ? 1 : 0);
  active.sort((a, b) => priority(b) - priority(a) || a.element.id - b.element.id);
  const seenFootprints = new Map(), selected = new Map();
  for (const candidate of active) {
    const { element, shape } = candidate, id = `${element.type}/${element.id}`;
    const owner = element.type === 'way' && memberOwners.get(element.id);
    if (owner) { excluded.push({ id, reason: 'represented by multipolygon', representedBy: owner }); continue; }
    const signature = footprintSignature(shape.rings), duplicate = seenFootprints.get(signature);
    if (duplicate) { excluded.push({ id, reason: 'duplicate footprint', representedBy: duplicate }); continue; }
    seenFootprints.set(signature, id);
    selected.set(id, candidate);
  }
  return { selected, excluded };
}
