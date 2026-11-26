#!/usr/bin/env node
'use strict';

/* ==========================================================================
   ParkFinder Sprint 02 — Pure Domain Acceptance Suite (S2-T01 .. S2-T09)
   Verifies PF-05, PF-06, PF-14, and PF-01 overnight/multi-day extensions.
   ========================================================================== */

const assert = require('assert');
const Core = require('../core-booking.js');

const TUE = '2026-12-15'; // Tuesday in America/Argentina/Buenos_Aires
const WED = '2026-12-16'; // Wednesday
const FRI = '2026-12-18'; // Friday
const SAT = '2026-12-19'; // Saturday
const SUN = '2026-12-20'; // Sunday

const results = [];

function runTest(id, description, fn) {
  try {
    const detail = fn();
    results.push({ id, description, status: 'PASS', detail: detail || 'OK' });
    console.log(`[PASS] ${id}: ${description} -> ${detail || 'OK'}`);
  } catch (err) {
    results.push({ id, description, status: 'FAIL', detail: err.message });
    console.error(`[FAIL] ${id}: ${description} -> ${err.message}`);
    process.exitCode = 1;
  }
}

runTest('S2-T01', 'Combined amenity/price/rating/distance filters return only matching synthetic garages; unknown separated from no; reset restores all', () => {
  const interval = Core.validateInterval({ date: TUE, arrival: '10:00', departure: '12:00', allowPast: true });
  const evals = {};
  Core.DEFAULT_GARAGES.forEach(g => {
    evals[g.id] = Core.evaluateGarageEligibility(g, interval, 'car', []);
  });

  // Verify tri-state amenity separation: yes vs no vs unknown
  const palermo = Core.DEFAULT_GARAGES.find(g => g.id === 'garage-palermo-soho');
  assert.strictEqual(Core.getAmenityState(palermo, 'covered'), 'yes');
  assert.strictEqual(Core.getAmenityState(palermo, 'valet'), 'no');
  assert.strictEqual(Core.getAmenityState(palermo, 'accessible'), 'unknown');

  // Filtering by 'accessible' excludes BOTH 'no' and 'unknown'
  const accessibleOnly = Core.filterGarages(Core.DEFAULT_GARAGES, evals, { amenities: ['accessible'] });
  assert.ok(!accessibleOnly.some(g => g.id === 'garage-palermo-soho'), 'Unknown accessible must not match accessible filter');
  assert.ok(!accessibleOnly.some(g => g.id === 'parqueon-san-telmo'), 'No accessible must not match accessible filter');

  // Combined filter: covered + evCharging + rating >= 4.5 + maxPrice <= 15000 + distance <= 2km
  const distMap = {
    'garage-puerto-madero': 1.2,
    'garage-palermo-soho': 4.8
  };
  const combined = Core.filterGarages(Core.DEFAULT_GARAGES, evals, {
    amenities: ['covered', 'evCharging'],
    minRating: 4.5,
    maxPriceArs: 15000,
    maxDistanceKm: 2.0
  }, g => distMap[g.id] !== undefined ? distMap[g.id] : 0.8);

  assert.strictEqual(combined.length, 1);
  assert.strictEqual(combined[0].id, 'garage-puerto-madero');

  // Reset filters restores full 8 synthetic garages
  const restored = Core.filterGarages(Core.DEFAULT_GARAGES, evals, {});
  assert.strictEqual(restored.length, 8);
  return `combined=${combined[0].id}, palermoStates=(yes/no/unknown), restored=${restored.length}`;
});

runTest('S2-T02', 'Unavailable or vehicle-incompatible garages never become bookable through filters', () => {
  const interval = Core.validateInterval({ date: TUE, arrival: '10:00', departure: '12:00', allowPast: true });
  const evals = {};
  Core.DEFAULT_GARAGES.forEach(g => {
    evals[g.id] = Core.evaluateGarageEligibility(g, interval, 'van', []);
  });
  // garage-colegiales only accepts moto/car (not van) even though covered=true & rating=4.5
  const filtered = Core.filterGarages(Core.DEFAULT_GARAGES, evals, { amenities: ['covered'], minRating: 4.5 });
  const colegiales = filtered.find(g => g.id === 'garage-colegiales');
  assert.ok(colegiales, 'Display filter without onlyEligible may show garage-colegiales');
  assert.strictEqual(evals['garage-colegiales'].eligible, false);
  assert.strictEqual(evals['garage-colegiales'].reasonCode, 'VEHICLE_TYPE_NOT_ACCEPTED');

  // Booking attempt still rejected independently of filters
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 's2.t02');
  const attempt = Core.createBooking({ garage: colegiales, interval, vehicleType: 'van', storageAdapter: store, allowPast: true });
  assert.strictEqual(attempt.ok, false);
  assert.strictEqual(attempt.code, 'VEHICLE_TYPE_NOT_ACCEPTED');

  // onlyEligible filter excludes it completely
  const eligibleFiltered = Core.filterGarages(Core.DEFAULT_GARAGES, evals, { onlyEligible: true, amenities: ['covered'] });
  assert.ok(!eligibleFiltered.some(g => g.id === 'garage-colegiales'));
  return `colegialesEligible=false, createBooking=${attempt.code}, eligibleOnlyCount=${eligibleFiltered.length}`;
});

runTest('S2-T03', 'Synthetic ratings 1-5 labelled demo with no Google attribution; sorting by rating works', () => {
  Core.DEFAULT_GARAGES.forEach(g => {
    const r = Core.getGarageRating(g);
    assert.ok(r.score >= 1 && r.score <= 5, `Rating out of range on ${g.id}`);
    assert.ok(r.reviewCount > 0, `Review count missing on ${g.id}`);
    assert.strictEqual(r.provenance, 'synthetic_demo');
    assert.strictEqual(r.isDemo, true);
    assert.ok(!String(r.provenance).toLowerCase().includes('google'));
  });
  const sorted = Core.sortGarages(Core.DEFAULT_GARAGES, {}, 'rating_desc');
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].rating.score >= sorted[i].rating.score, 'Ratings not sorted descending');
  }
  return `top=${sorted[0].id} (${sorted[0].rating.score}), bottom=${sorted[sorted.length - 1].id} (${sorted[sorted.length - 1].rating.score})`;
});

runTest('S2-T04', 'External directions links validate coordinates and reject invalid coordinates', () => {
  const pm = Core.DEFAULT_GARAGES[0];
  const url = Core.buildExternalDirectionsUrl(pm);
  assert.strictEqual(url, 'https://www.google.com/maps/dir/?api=1&destination=-34.6074%2C-58.361&travelmode=driving');
  assert.strictEqual(Core.buildExternalDirectionsUrl({ lat: NaN, lng: -58.36 }), null);
  assert.strictEqual(Core.buildExternalDirectionsUrl({ lat: 95, lng: -58.36 }), null);
  assert.strictEqual(Core.buildExternalDirectionsUrl({ lat: 0, lng: 0 }), null);
  assert.strictEqual(Core.buildExternalDirectionsUrl(null), null);
  assert.strictEqual(Core.MAP_PROVIDERS.active, 'osm_leaflet');
  assert.strictEqual(Core.MAP_PROVIDERS.adapters.google_maps.status, 'proposed_not_activated');
  return `validUrl=OK, invalidCoordsRejected=4/4, activeProvider=${Core.MAP_PROVIDERS.active}`;
});

runTest('S2-T05', 'Cap 1 overnight 23:00-01:00 next day blocks 00:00-00:30, allows 01:00-02:00, cancellation releases capacity', () => {
  const g24 = {
    id: 'test-cap1-24h',
    name: 'Test Cap 1 24h',
    address: 'Av. de Mayo 780, CABA',
    lat: -34.6088,
    lng: -58.3775,
    ratePerHour: 6000,
    totalSpaces: 1,
    open24: true,
    operatingHours: { open: '00:00', close: '24:00' },
    acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
    maxHeightM: 2.40
  };
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 's2.t05');

  const r1 = Core.createBooking({
    garage: g24, arrivalDate: TUE, departureDate: WED, arrival: '23:00', departure: '01:00',
    vehicleType: 'car', plate: 'OV 001 AA', storageAdapter: store, allowPast: true
  });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.booking.startAt, '2026-12-15T23:00:00-03:00');
  assert.strictEqual(r1.booking.endAt, '2026-12-16T01:00:00-03:00');
  assert.strictEqual(r1.booking.isOvernight, true);

  // Overlapping 00:00-00:30 next day blocked
  const blocked = Core.createBooking({
    garage: g24, arrivalDate: WED, departureDate: WED, arrival: '00:00', departure: '00:30',
    vehicleType: 'car', storageAdapter: store, allowPast: true
  });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.code, 'NO_AVAILABILITY');

  // Adjacent half-open 01:00-02:00 next day permitted
  const adjacent = Core.createBooking({
    garage: g24, arrivalDate: WED, departureDate: WED, arrival: '01:00', departure: '02:00',
    vehicleType: 'car', storageAdapter: store, allowPast: true
  });
  assert.strictEqual(adjacent.ok, true);

  // Cancel overnight booking -> 00:00-00:30 becomes available
  const cancelRes = Core.cancelBookingById(r1.booking.id, store, 'user_cancelled');
  assert.strictEqual(cancelRes.ok, true);
  const rebooked = Core.createBooking({
    garage: g24, arrivalDate: WED, departureDate: WED, arrival: '00:00', departure: '00:30',
    vehicleType: 'car', storageAdapter: store, allowPast: true
  });
  assert.strictEqual(rebooked.ok, true);
  return `overnight=${r1.booking.id}, blocked0000=NO_AVAILABILITY, adjacent0100=OK, releasedAfterCancel=OK`;
});

runTest('S2-T06', 'Non-24h garage rejects overnight interval spanning closed period; 24h garage accepts overnight & multi-day', () => {
  const non24 = Core.DEFAULT_GARAGES.find(g => g.id === 'garage-palermo-soho'); // 07:00-22:00
  const open24 = Core.DEFAULT_GARAGES.find(g => g.id === 'garage-puerto-madero'); // 24h

  const overnight = Core.validateInterval({ arrivalDate: TUE, departureDate: WED, arrival: '21:00', departure: '08:00', allowPast: true });
  assert.strictEqual(overnight.valid, true);

  const non24Check = Core.isWithinOperatingHours(non24, overnight);
  assert.strictEqual(non24Check.compatible, false);
  assert.strictEqual(non24Check.code, 'OUT_OF_HOURS');
  assert.strictEqual(non24Check.spansClosedPeriod, true);

  const open24Check = Core.isWithinOperatingHours(open24, overnight);
  assert.strictEqual(open24Check.compatible, true);

  // Multi-day 48h interval also accepted by 24h garage and rejected by non-24h
  const multiDay = Core.validateInterval({ arrivalDate: TUE, departureDate: '2026-12-17', arrival: '10:00', departure: '10:00', allowPast: true });
  assert.strictEqual(multiDay.valid, true);
  assert.strictEqual(multiDay.durationHours, 48);
  assert.strictEqual(Core.isWithinOperatingHours(non24, multiDay).compatible, false);
  assert.strictEqual(Core.isWithinOperatingHours(open24, multiDay).compatible, true);
  return `non24Overnight=${non24Check.code}, open24Overnight=OK, multiDay48h=OK`;
});

runTest('S2-T07', 'Friday-to-Saturday quote applies weekend multiplier only to Saturday segments, preserves single rounding and locked price', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 's2.t07');
  const g = Object.assign({}, Core.DEFAULT_GARAGES[0], { ratePerHour: 1001 });
  // Fri 22:00 -> Sat 02:00 (4h: 2h Fri weekday + 2h Sat weekend)
  const friSat = Core.validateInterval({ arrivalDate: FRI, departureDate: SAT, arrival: '22:00', departure: '02:00', allowPast: true });
  const q = Core.calculateDynamicQuote(g, friSat, 'motorcycle', []);
  assert.strictEqual(q.segments.length, 4);
  // Fri 22-23, 23-24: weekendFactor 1.00; Sat 00-01, 01-02: weekendFactor 1.10
  assert.strictEqual(q.segments[0].date, FRI);
  assert.strictEqual(q.segments[0].weekendFactor, 1.00);
  assert.strictEqual(q.segments[1].date, FRI);
  assert.strictEqual(q.segments[1].weekendFactor, 1.00);
  assert.strictEqual(q.segments[2].date, SAT);
  assert.strictEqual(q.segments[2].weekendFactor, 1.10);
  assert.strictEqual(q.segments[3].date, SAT);
  assert.strictEqual(q.segments[3].weekendFactor, 1.10);

  // Exact sum: 2*(1001*0.65*1.0) + 2*(1001*0.65*1.1) = 1301.30 + 1431.43 = 2732.73 -> single round = 2733
  assert.strictEqual(q.totalArs, 2733);

  // Confirm booking and mutate garage rate -> locked price stays 2733
  const res = Core.createBooking({ garage: g, interval: friSat, vehicleType: 'motorcycle', storageAdapter: store, allowPast: true });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.booking.cost, 2733);
  g.ratePerHour = 9000;
  const persisted = store.read().data.find(b => b.id === res.booking.id);
  assert.strictEqual(persisted.cost, 2733);
  assert.strictEqual(persisted.quote.totalArs, 2733);
  return `friWknd=1.00, satWknd=1.10, exact=${q.totalExact.toFixed(2)}, locked=${persisted.cost}`;
});

runTest('S2-T08', 'Invalid dates, equal/reversed intervals, past dates, and >72h duration rejected with explicit codes', () => {
  assert.strictEqual(Core.validateInterval({ arrivalDate: '2026-02-30', departureDate: WED, arrival: '10:00', departure: '12:00', allowPast: true }).code, 'INVALID_DATE');
  assert.strictEqual(Core.validateInterval({ arrivalDate: TUE, departureDate: '2026-13-45', arrival: '10:00', departure: '12:00', allowPast: true }).code, 'INVALID_DEPARTURE_DATE');
  assert.strictEqual(Core.validateInterval({ arrivalDate: TUE, departureDate: TUE, arrival: '10:00', departure: '10:00', allowPast: true }).code, 'NON_POSITIVE_DURATION');
  assert.strictEqual(Core.validateInterval({ arrivalDate: WED, departureDate: TUE, arrival: '10:00', departure: '12:00', allowPast: true }).code, 'NON_POSITIVE_DURATION');
  // 72h exact is allowed; 72h 1m is rejected
  const exact72 = Core.validateInterval({ arrivalDate: TUE, departureDate: FRI, arrival: '10:00', departure: '10:00', allowPast: true });
  assert.strictEqual(exact72.valid, true);
  assert.strictEqual(exact72.durationHours, 72);
  const over72 = Core.validateInterval({ arrivalDate: TUE, departureDate: FRI, arrival: '10:00', departure: '10:01', allowPast: true });
  assert.strictEqual(over72.valid, false);
  assert.strictEqual(over72.code, 'EXCEEDS_MAX_DURATION');
  // Past date check when allowPast=false
  const past = Core.validateInterval({ arrivalDate: '2026-01-01', departureDate: '2026-01-01', arrival: '10:00', departure: '12:00', allowPast: false, referenceNow: Date.parse('2026-11-25T15:00:00-03:00') });
  assert.strictEqual(past.valid, false);
  assert.strictEqual(past.code, 'PAST_DATE');
  return 'All 7 validation edge cases passed (incl. 72h boundary & past date)';
});

runTest('S2-T09', 'Legacy V1 and Sprint 01 bookings normalize cleanly alongside Sprint 02 overnight records', () => {
  const mem = Core.createMemoryStorage();
  const store = Core.createStorageAdapter(mem, 'parkfinder.v1.bookings');
  const legacyList = [
    {
      id: 'PF-2026-V1A1',
      garageId: 'garage-obelisco',
      garage: 'Garage Obelisco Centro',
      address: 'Av. Corrientes 1240, Microcentro, CABA',
      plate: 'AA 111 AA',
      date: TUE,
      arrival: '09:00',
      hours: 2,
      cost: 12000
    },
    {
      id: 'PF-2026-S1B2',
      status: 'confirmed',
      garageId: 'garage-puerto-madero',
      garage: 'Garage Puerto Madero',
      address: 'Av. del Sol 1141, Puerto Madero, CABA',
      plate: 'BB 222 BB',
      vehicleType: 'suv',
      date: TUE,
      arrival: '14:00',
      departure: '16:00',
      durationMinutes: 120,
      hours: 2,
      startAt: '2026-12-15T14:00:00-03:00',
      endAt: '2026-12-15T16:00:00-03:00',
      cost: 16900
    }
  ];
  mem.setItem('parkfinder.v1.bookings', JSON.stringify(legacyList));
  const read = store.read();
  assert.strictEqual(read.ok, true);
  assert.strictEqual(read.data.length, 2);
  assert.strictEqual(read.data[0].arrivalDate, TUE);
  assert.strictEqual(read.data[0].departureDate, TUE);
  assert.strictEqual(read.data[0].isOvernight, false);
  assert.strictEqual(read.data[1].cost, 16900);
  return `normalized=${read.data.map(b => b.id).join(', ')}`;
});

console.log(`\nSprint 02 Domain Summary: ${results.filter(r => r.status === 'PASS').length}/${results.length} tests passed.`);
