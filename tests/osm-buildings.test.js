import test from 'node:test';
import assert from 'node:assert/strict';
import { excludedBuildingReason, footprintSignature, reconcileBuildings } from '../scripts/osm-buildings.mjs';

const outer = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
const inner = [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]];
const building = (id, tags = {}, points = outer) => ({
  element: { type: 'way', id, tags: { building: 'yes', ...tags } },
  shape: { rings: [{ role: 'outer', points }] },
});
const relation = (id, members) => ({
  element: { type: 'relation', id, tags: { building: 'yes', type: 'multipolygon' }, members },
  shape: { rings: [{ role: 'outer', points: outer }, { role: 'inner', points: inner }] },
});

test('non-buildings, construction, proposals and explicitly removed buildings are excluded', () => {
  for (const tags of [
    {}, { building: 'no' }, { building: 'construction' }, { building: 'proposed' }, { building: 'planned' },
    { building: 'yes', construction: 'apartments' }, { building: 'yes', proposed: 'yes' },
    ...['demolished', 'removed', 'destroyed', 'razed', 'ruins'].map((building) => ({ building })),
    ...['demolished', 'removed', 'destroyed', 'razed'].flatMap((state) => [
      { building: 'yes', [state]: 'yes' }, { building: 'yes', [`${state}:building`]: 'warehouse' },
    ]),
  ]) {
    assert.ok(excludedBuildingReason(tags), JSON.stringify(tags));
    const result = reconcileBuildings([building(1, { building: undefined, ...tags })]);
    assert.equal(result.selected.size, 0);
    assert.equal(result.excluded.length, 1);
  }
});

test('standing structures are retained despite disused occupants or old project end dates', () => {
  for (const tags of [
    { building: 'yes' }, { building: 'roof' }, { building: 'abandoned' },
    { building: 'yes', disused: 'yes', end_date: '1998' },
    { building: 'yes', demolished: 'no', 'demolished:building': 'no', construction: 'no' },
  ]) {
    assert.equal(excludedBuildingReason(tags), null);
    assert.equal(reconcileBuildings([building(1, tags)]).selected.size, 1);
  }
});

test('identical footprints reconcile independent of start point, winding, and ring order', () => {
  const shifted = [...outer.slice(2, -1), ...outer.slice(0, 3)];
  assert.equal(footprintSignature(building(1).shape.rings), footprintSignature(building(2, {}, shifted.reverse()).shape.rings));
  const withHole = relation(3, []).shape.rings;
  assert.equal(footprintSignature(withHole), footprintSignature([...withHole].reverse()));
  assert.notEqual(footprintSignature(withHole), footprintSignature(building(1).shape.rings));
  const result = reconcileBuildings([building(1), building(2, { height: '30' }, shifted)]);
  assert.deepEqual([...result.selected.keys()], ['way/2']);
  assert.deepEqual(result.excluded, [{ id: 'way/1', reason: 'duplicate footprint', representedBy: 'way/2' }]);
  assert.deepEqual([...reconcileBuildings([building(1), building(2, { height: '30' })], new Set([1])).selected.keys()], ['way/1']);
});

test('multipolygons own their outer members but not independent courtyard buildings', () => {
  const parent = relation(3, [{ type: 'way', ref: 1, role: 'outer' }, { type: 'way', ref: 2, role: 'inner' }]);
  const result = reconcileBuildings([building(1), building(2, {}, inner), parent]);
  assert.deepEqual([...result.selected.keys()], ['relation/3', 'way/2']);
  assert.deepEqual(result.excluded, [{ id: 'way/1', reason: 'represented by multipolygon', representedBy: 'relation/3' }]);
  const duplicate = { ...building(4), element: { ...building(4).element, type: 'relation', members: [] } };
  assert.deepEqual([...reconcileBuildings([building(1), duplicate]).selected.keys()], ['relation/4']);
});

test('duplicate OSM IDs fail explicitly even for excluded or multipolygon-owned objects', () => {
  assert.throws(() => reconcileBuildings([building(1), building(1)]), /Duplicate OSM object/);
  assert.throws(() => reconcileBuildings([building(1, { building: 'no' }), building(1)]), /Duplicate OSM object/);
  assert.throws(() => reconcileBuildings([
    relation(2, [{ type: 'way', ref: 1 }]), building(1), building(1),
  ]), /Duplicate OSM object/);
});
