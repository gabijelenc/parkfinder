#!/usr/bin/env node
'use strict';

/* ==========================================================================
   parkFinder Sprint 2B — Automated Pure Domain Acceptance Suite (Node.js)
   Tests smart recommendations determinism & value normalization, low availability
   <=2 threshold (no false urgency), up-to-3 garage comparator, average hourly
   rate, offline destination search, and illustrative gallery/review provenance.
   ========================================================================== */

const assert = require('assert');
const Core = require('../core-booking.js');

const results = [];

function runTest(id, description, fn) {
  try {
    const actual = fn();
    results.push({ id, description, status: 'PASS', actual });
    console.log(`[PASS] ${id}: ${description} -> ${actual}`);
  } catch (err) {
    results.push({ id, description, status: 'FAIL', actual: err && err.message ? err.message : String(err) });
    console.error(`[FAIL] ${id}: ${description} -> ${err && err.message ? err.message : err}`);
  }
}

const TUE = '2026-12-15';
const FRI = '2026-12-18';
const SAT = '2026-12-19';

// S2B-D01: Deterministic recommendations & equal-weight value score normalization; ineligible excluded
runTest('S2B-D01', 'Recommendations are deterministic, normalize price/distance 50/50, and exclude ineligible garages', () => {
  const interval = Core.validateInterval({ arrivalDate: TUE, departureDate: TUE, arrival: '10:00', departure: '12:00', allowPast: true });
  const evals = {};
  Core.DEFAULT_GARAGES.forEach((g) => {
    evals[g.id] = Core.evaluateGarageEligibility(g, interval, 'van', []);
  });
  // With van, Colegiales (moto/car), Palermo Soho (max 2.0m), Recoleta (max 1.95m), San Telmo (max 2.1m) are ineligible!
  const distMap = {
    'garage-puerto-madero': 1.93,
    'garage-obelisco': 0.37,
    'parqueon-hospital-italiano': 4.10,
    'garage-chacarita': 5.54
  };
  const r1 = Core.computeRecommendations(Core.DEFAULT_GARAGES, evals, (g) => distMap[g.id] ?? 3.0);
  const r2 = Core.computeRecommendations(Core.DEFAULT_GARAGES, evals, (g) => distMap[g.id] ?? 3.0);
  assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2), 'Recommendations must be deterministic');
  assert.strictEqual(r1.eligibleCount, 4, 'Only 4 garages are eligible for van');
  assert.strictEqual(r1.lowestTotal, 'garage-chacarita');
  assert.strictEqual(r1.closest, 'garage-obelisco');
  assert.strictEqual(r1.highestRating, 'garage-puerto-madero');

  // Verify exact normalized value score math for Obelisco vs Chacarita vs Puerto Madero vs Hospital Italiano
  const sOb = r1.scoresByGarageId['garage-obelisco'];
  const sCh = r1.scoresByGarageId['garage-chacarita'];
  // Obelisco: dist=0.37 (min -> 0), price=6000*2*1.55=18600 in [10850, 20150] -> normPrice=(18600-10850)/(20150-10850)=0.8333 -> score=0.4167
  // Chacarita: price=min -> 0, dist=max -> 1 -> score=0.5000
  assert.ok(sOb.normDistance === 0 && Math.abs(sOb.valueScore - 0.4167) < 0.001, `Unexpected Obelisco valueScore: ${JSON.stringify(sOb)}`);
  assert.strictEqual(sCh.valueScore, 0.5);
  assert.strictEqual(r1.bestValue, 'garage-obelisco');
  assert.strictEqual(r1.byGarageId['garage-colegiales'], undefined, 'Ineligible garage must not receive recommendations');
  return `eligible=${r1.eligibleCount}, bestValue=${r1.bestValue}(${sOb.valueScore}), lowest=${r1.lowestTotal}, closest=${r1.closest}`;
});

// S2B-D02: Low availability threshold <=2 actual free bays (no false urgency)
runTest('S2B-D02', 'Low availability badge triggers strictly for 1..2 eligible free bays and never for 0 or >=3', () => {
  const interval = Core.validateInterval({ arrivalDate: TUE, departureDate: TUE, arrival: '10:00', departure: '12:00', allowPast: true });
  const makeG = (id, spaces) => ({
    id, name: id, ratePerHour: 5000, totalSpaces: spaces, open24: true,
    acceptedVehicleTypes: ['car'], maxHeightM: 2.2, rating: { score: 4.5, reviewCount: 10 }
  });
  const garages = [makeG('g-0', 1), makeG('g-1', 1), makeG('g-2', 2), makeG('g-3', 3), makeG('g-50', 50)];
  // Fill g-0 with 1 active booking so availableSpaces === 0
  const bookings = [{
    id: 'B-FILL', status: 'confirmed', garageId: 'g-0',
    arrivalDate: TUE, departureDate: TUE, arrival: '10:00', departure: '12:00', vehicleType: 'car'
  }];
  const evals = {};
  garages.forEach((g) => { evals[g.id] = Core.evaluateGarageEligibility(g, interval, 'car', bookings); });

  const rec = Core.computeRecommendations(garages, evals, () => 1.0);
  assert.deepStrictEqual(rec.lowAvailabilityIds.sort(), ['g-1', 'g-2']);
  assert.ok(!rec.lowAvailabilityIds.includes('g-0'), 'Full garage (0 free) must not be marked low_availability');
  assert.ok(!rec.lowAvailabilityIds.includes('g-3'), '3 free bays must not trigger false urgency');
  assert.ok(!rec.lowAvailabilityIds.includes('g-50'), '50 free bays must not trigger false urgency');
  return `lowAvail=[${rec.lowAvailabilityIds.join(',')}], threshold=${Core.RECOMMENDATION_POLICY.lowAvailabilityThreshold}`;
});

// S2B-D03: Comparator up to 3 garages under identical interval & vehicle; rejects 4th
runTest('S2B-D03', 'Comparator evaluates up to 3 garages under same interval/vehicle, highlights best metrics, rejects 4th', () => {
  const interval = Core.validateInterval({ arrivalDate: FRI, departureDate: SAT, arrival: '22:00', departure: '02:00', allowPast: true });
  const chosen3 = [Core.DEFAULT_GARAGES[0], Core.DEFAULT_GARAGES[2], Core.DEFAULT_GARAGES[7]]; // PM, Obelisco, Chacarita (all 24h)
  const evals = {};
  chosen3.forEach((g) => { evals[g.id] = Core.evaluateGarageEligibility(g, interval, 'suv', []); });

  const cmp = Core.buildComparisonMatrix(chosen3, evals, interval, 'suv', (g) => (g.id === 'garage-obelisco' ? 0.4 : 2.5));
  assert.strictEqual(cmp.ok, true);
  assert.strictEqual(cmp.items.length, 3);
  assert.strictEqual(cmp.vehicleType, 'suv');
  assert.strictEqual(cmp.highlights.lowestPriceId, 'garage-chacarita');
  assert.strictEqual(cmp.highlights.closestId, 'garage-obelisco');
  assert.strictEqual(cmp.highlights.highestRatingId, 'garage-puerto-madero');
  assert.strictEqual(cmp.highlights.mostCapacityId, 'garage-obelisco');
  assert.strictEqual(cmp.items[2].amenities.valet, 'unknown', 'Tri-state unknown amenity preserved in comparator');

  // Reject 4th garage
  const cmp4 = Core.buildComparisonMatrix(Core.DEFAULT_GARAGES.slice(0, 4), evals, interval, 'suv', () => 1);
  assert.strictEqual(cmp4.ok, false);
  assert.strictEqual(cmp4.code, 'COMPARE_LIMIT_EXCEEDED');

  // Empty rejected
  const cmp0 = Core.buildComparisonMatrix([], evals, interval, 'suv', () => 1);
  assert.strictEqual(cmp0.ok, false);
  assert.strictEqual(cmp0.code, 'COMPARE_EMPTY');

  return `ok3=${cmp.code}, lowest=${cmp.highlights.lowestPriceId}, closest=${cmp.highlights.closestId}, four=${cmp4.code}`;
});

// S2B-D04: Average hourly price reflects dynamic multipliers & overnight proration
runTest('S2B-D04', 'Average hourly rate computes accurately from dynamic quote total and duration', () => {
  const interval = Core.validateInterval({ arrivalDate: FRI, departureDate: SAT, arrival: '22:00', departure: '02:00', allowPast: true });
  const obelisco = Core.DEFAULT_GARAGES.find((g) => g.id === 'garage-obelisco');
  const q = Core.calculateDynamicQuote(obelisco, interval, 'car', []);
  // 4h total = 6000 * (1 + 1 + 1.1 + 1.1) = 25200 -> avg = 6300/h
  const avg = Core.getAverageHourlyRate(q, obelisco.ratePerHour);
  assert.strictEqual(q.totalArs, 25200);
  assert.strictEqual(avg, 6300);
  return `total=${q.totalArs}, hours=${q.durationHours}, avgHourly=${avg}`;
});

// S2B-D05: Offline destination search supports zones, POIs, businesses, favorites & recents accent-insensitively
runTest('S2B-D05', 'Offline destination search matches POIs, businesses, favorites and recents with accent folding', () => {
  const favs = [{ id: 'fav-1', label: 'Oficina Microcentro', coords: [-34.602, -58.375] }];
  const recs = [{ id: 'rec-1', label: 'Teatro Colón', coords: [-34.6011, -58.3831] }];

  const q1 = Core.searchDestinations('teatro colon', { favorites: favs, recents: recs });
  assert.ok(q1.length >= 1 && q1[0].label === 'Teatro Colón', 'Accent-insensitive POI match failed');
  assert.strictEqual(q1[0].group, 'recent', 'Recent match should appear first and deduplicate catalog duplicate');
  assert.strictEqual(q1.filter((x) => x.label === 'Teatro Colón').length, 1, 'Duplicate destination must be deduplicated');

  const q2 = Core.searchDestinations('galerias pacifico', { favorites: favs, recents: recs });
  assert.ok(q2.some((x) => x.id === 'biz-galerias-pacifico' && x.group === 'business'));

  const q3 = Core.searchDestinations('oficina', { favorites: favs, recents: recs });
  assert.strictEqual(q3[0].group, 'favorite');

  return `colonGroup=${q1[0].group}(deduped=1), bizHit=${q2[0].id}, favHit=${q3[0].label}`;
});

// S2B-D06: Local illustrative SVG gallery & synthetic demo reviews provenance across all 8 garages
runTest('S2B-D06', 'All 8 garages include local illustrative SVG galleries and demo-provenance reviews without Google attribution', () => {
  assert.strictEqual(Core.DEFAULT_GARAGES.length, 8);
  Core.DEFAULT_GARAGES.forEach((g) => {
    assert.ok(typeof g.mainImage === 'string' && g.mainImage.startsWith('assets/garages/') && g.mainImage.endsWith('.svg'), `Bad mainImage on ${g.id}`);
    assert.ok(Array.isArray(g.gallery) && g.gallery.length >= 3, `Expected >=3 gallery items on ${g.id}`);
    g.gallery.forEach((ph) => {
      assert.strictEqual(ph.provenance, 'illustrative_svg_demo');
      assert.ok(ph.src.startsWith('assets/garages/') && ph.src.endsWith('.svg'));
    });
    assert.ok(Array.isArray(g.demoReviews) && g.demoReviews.length >= 3, `Expected >=3 demo reviews on ${g.id}`);
    g.demoReviews.forEach((rev) => {
      assert.strictEqual(rev.provenance, 'synthetic_demo');
      assert.ok(!/google/i.test(rev.textEs + rev.textEn + rev.author), 'No Google attribution allowed');
      assert.ok(/demo/i.test(rev.author), `Synthetic author label expected on ${g.id}, got ${rev.author}`);
    });
  });
  return `garages=8, minGallery=3, minReviews=3, allLocalSvgAndDemoProvenance=true`;
});

const passed = results.filter((r) => r.status === 'PASS').length;
console.log(`\nSprint 2B Domain Summary: ${passed}/${results.length} tests passed.`);
if (passed !== results.length) {
  process.exit(1);
}
