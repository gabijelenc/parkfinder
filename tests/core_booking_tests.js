#!/usr/bin/env node
'use strict';

const assert = require('assert');
const Core = require('../core-booking.js');

const FUTURE_WEEKDAY = '2026-12-15';  // Tuesday in America/Argentina/Buenos_Aires
const FUTURE_SATURDAY = '2026-12-19'; // Saturday in America/Argentina/Buenos_Aires

function makeCap1Garage(overrides) {
  return Object.assign({
    id: 'test-cap-1',
    name: 'Test Garage Cap 1',
    address: 'Lavalle 900, CABA',
    ratePerHour: 6000,
    totalSpaces: 1,
    techado: true,
    open24: false,
    operatingHours: { open: '07:00', close: '22:00' },
    acceptedVehicleTypes: ['motorcycle', 'car'],
    maxHeightM: 1.80,
    dataProvenance: 'synthetic_qa'
  }, overrides || {});
}

function makeCap2Garage(overrides) {
  return Object.assign({
    id: 'test-cap-2',
    name: 'Test Garage Cap 2',
    address: 'Av. 9 de Julio 1050, CABA',
    ratePerHour: 6000,
    totalSpaces: 2,
    techado: true,
    open24: true,
    operatingHours: { open: '00:00', close: '24:00' },
    acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
    maxHeightM: 2.50,
    dataProvenance: 'synthetic_qa'
  }, overrides || {});
}

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

runTest('T01', 'Capacity 1; adjacent half-open intervals 08:00-11:00 and 11:00-13:00 both accepted', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't01');
  const g = makeCap1Garage();
  const r1 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 101 AA', storageAdapter: store, allowPast: true });
  const r2 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '11:00', departure: '13:00', vehicleType: 'car', plate: 'AA 102 AA', storageAdapter: store, allowPast: true });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r1.booking.startAt, '2026-12-15T08:00:00-03:00');
  assert.strictEqual(r1.booking.endAt, '2026-12-15T11:00:00-03:00');
  assert.strictEqual(r2.booking.startAt, '2026-12-15T11:00:00-03:00');
  assert.strictEqual(r2.booking.endAt, '2026-12-15T13:00:00-03:00');
  assert.strictEqual(store.read().data.length, 2);
  return `b1=${r1.booking.id}, b2=${r2.booking.id}`;
});

runTest('T02', 'Capacity 1; overlapping 08:00-11:00 then 10:00-12:00 rejects second', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't02');
  const g = makeCap1Garage();
  const r1 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '11:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  const r2 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.code, 'NO_AVAILABILITY');
  assert.strictEqual(store.read().data.length, 1);
  return `first=OK, second=${r2.code}`;
});

runTest('T03', 'Capacity 2; existing 08:00-09:00 and 10:00-11:00; request 08:00-11:00 accepts exactly 1 extra', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't03');
  const g = makeCap2Garage();
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '09:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).ok, true);
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '10:00', departure: '11:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).ok, true);
  const reqInterval = Core.validateInterval({ date: FUTURE_WEEKDAY, arrival: '08:00', departure: '11:00', allowPast: true });
  const avail = Core.getIntervalAvailability(g, reqInterval, store.read().data);
  assert.strictEqual(avail.peakConcurrent, 1, 'Peak concurrent must be 1, not sum=2');
  assert.strictEqual(avail.availableSpaces, 1);
  const extra1 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '11:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  const extra2 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '11:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  assert.strictEqual(extra1.ok, true);
  assert.strictEqual(extra2.ok, false);
  assert.strictEqual(extra2.code, 'NO_AVAILABILITY');
  return `peakBefore=1, availBefore=1, extra1=OK, extra2=${extra2.code}`;
});

runTest('T04', 'Cancel active booking releases interval capacity and retains audit status', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't04');
  const g = makeCap1Garage();
  const r1 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '11:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  const blocked = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '09:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  assert.strictEqual(blocked.ok, false);
  const cancelRes = Core.cancelBookingById(r1.booking.id, store, 'user_cancelled');
  assert.strictEqual(cancelRes.ok, true);
  assert.strictEqual(cancelRes.booking.status, 'cancelled');
  assert.ok(cancelRes.booking.cancelledAt);
  const r2 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '09:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  assert.strictEqual(r2.ok, true);
  const ledger = store.read().data;
  assert.strictEqual(ledger.length, 2, 'Cancelled booking must remain in ledger for audit');
  assert.strictEqual(ledger.find(b => b.id === r1.booking.id).status, 'cancelled');
  return `cancelled=${r1.booking.id}, rebooked=${r2.booking.id}, ledgerLen=${ledger.length}`;
});

runTest('T05', 'Reject invalid date/time, negative/zero duration, incompatible vehicle/height, out-of-hours', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't05');
  const g = makeCap1Garage();
  assert.strictEqual(Core.createBooking({ garage: g, date: '2026-02-30', arrival: '08:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).code, 'INVALID_DATE');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '25:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).code, 'INVALID_ARRIVAL_TIME');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '11:00', departure: '09:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).code, 'NON_POSITIVE_DURATION');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '10:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).code, 'NON_POSITIVE_DURATION');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '10:00', vehicleType: 'suv', storageAdapter: store, allowPast: true }).code, 'VEHICLE_TYPE_NOT_ACCEPTED');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '08:00', departure: '10:00', vehicleType: 'car', vehicleHeightM: 2.05, storageAdapter: store, allowPast: true }).code, 'HEIGHT_EXCEEDS_CLEARANCE');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '06:00', departure: '08:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).code, 'OUT_OF_HOURS');
  assert.strictEqual(Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '21:00', departure: '23:00', vehicleType: 'car', storageAdapter: store, allowPast: true }).code, 'OUT_OF_HOURS');
  assert.strictEqual(store.read().data.length, 0);
  return 'All 8 invalid cases rejected cleanly';
});

runTest('T06', 'Dynamic hourly segment quote (peak, weekend, occupancy, vehicle) with single final rounding', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't06');
  const g = makeCap2Garage({ ratePerHour: 6000 });
  // 1 booking in 09:00-10:00 -> 50% occupancy (factor 1.20) in 09-10, 0% (1.00) in 10-11
  Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '09:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  const interval = Core.validateInterval({ date: FUTURE_WEEKDAY, arrival: '09:00', departure: '11:00', allowPast: true });
  const qCar = Core.calculateDynamicQuote(g, interval, 'car', store.read().data);
  const qSuv = Core.calculateDynamicQuote(g, interval, 'suv', store.read().data);
  assert.strictEqual(qCar.segments.length, 2);
  assert.strictEqual(qCar.segments[0].peakFactor, 1.15);
  assert.strictEqual(qCar.segments[0].occupancyFactor, 1.20);
  assert.strictEqual(qCar.segments[1].peakFactor, 1.00);
  assert.strictEqual(qCar.segments[1].occupancyFactor, 1.00);
  assert.strictEqual(qCar.totalArs, 14280);
  assert.strictEqual(qSuv.totalArs, 18564);

  // Test >=75% occupancy tier (1.40) on cap 4 with 3 existing bookings
  const g4 = makeCap2Garage({ id: 'cap4', totalSpaces: 4, ratePerHour: 5000 });
  const s4 = Core.createStorageAdapter(Core.createMemoryStorage(), 't06-occ75');
  for (let i = 0; i < 3; i++) {
    Core.createBooking({ garage: g4, date: FUTURE_WEEKDAY, arrival: '11:00', departure: '12:00', vehicleType: 'car', storageAdapter: s4, allowPast: true });
  }
  const q75 = Core.calculateDynamicQuote(g4, Core.validateInterval({ date: FUTURE_WEEKDAY, arrival: '11:00', departure: '12:00', allowPast: true }), 'car', s4.read().data);
  assert.strictEqual(q75.segments[0].occupancyFactor, 1.40);
  assert.strictEqual(q75.totalArs, 7000);

  // Test single final rounding vs per-segment rounding
  const fracGarage = makeCap2Garage({ ratePerHour: 1001 });
  const satInt = Core.validateInterval({ date: FUTURE_SATURDAY, arrival: '10:00', departure: '12:00', allowPast: true });
  const qFrac = Core.calculateDynamicQuote(fracGarage, satInt, 'motorcycle', []);
  assert.strictEqual(qFrac.segments[0].weekendFactor, 1.10);
  assert.strictEqual(qFrac.totalArs, 1431); // 715.715 * 2 = 1431.43 -> 1431 (not 716+716=1432)
  return `car=${qCar.totalArs}, suv=${qSuv.totalArs}, occ75=${q75.totalArs}, singleRound=${qFrac.totalArs}`;
});

runTest('T07', 'Changing garage rate after confirmation does not change stored booking price', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't07');
  const g = makeCap2Garage({ ratePerHour: 6000 });
  const r1 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  assert.strictEqual(r1.booking.cost, 12000);
  g.ratePerHour = 15000;
  const persisted = store.read().data.find(b => b.id === r1.booking.id);
  assert.strictEqual(persisted.cost, 12000);
  assert.strictEqual(persisted.quote.baseRatePerHour, 6000);
  assert.strictEqual(persisted.quote.totalArs, 12000);
  return `locked=${persisted.cost}, newGarageRate=${g.ratePerHour}`;
});

runTest('T08', 'Storage write failure prevents durable confirmation and returns explicit error', () => {
  const failing = {
    getItem: () => '[]',
    setItem: () => { throw new Error('QuotaExceededError'); }
  };
  const store = Core.createStorageAdapter(failing, 't08');
  const res = Core.createBooking({ garage: makeCap2Garage(), date: FUTURE_WEEKDAY, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, 'STORAGE_WRITE_FAILED');
  return `ok=${res.ok}, code=${res.code}`;
});

runTest('T10', 'Rapid repeated submission with same modal token creates at most 1 booking', () => {
  const store = Core.createStorageAdapter(Core.createMemoryStorage(), 't10');
  const guard = Core.createSubmissionGuard();
  const g = makeCap2Garage();
  const token = 'modal-token-abc';
  const r1 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, submissionGuard: guard, submissionToken: token, allowPast: true });
  const r2 = Core.createBooking({ garage: g, date: FUTURE_WEEKDAY, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, submissionGuard: guard, submissionToken: token, allowPast: true });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.code, 'DUPLICATE_SUBMISSION');
  assert.strictEqual(store.read().data.length, 1);
  return `first=OK, second=${r2.code}, count=1`;
});

runTest('LEGACY', 'Legacy V1 booking records normalize cleanly without data loss', () => {
  const legacyV1 = {
    id: 'PF-2026-V1OK',
    garageId: 'garage-obelisco',
    garage: 'Garage Obelisco Centro',
    address: 'Av. Corrientes 1240, Microcentro, CABA',
    plate: 'AB 123 CD',
    date: FUTURE_WEEKDAY,
    arrival: '10:00',
    hours: 2,
    cost: 12000,
    createdAt: '2026-11-25T10:00:00.000Z',
    payment: 'simulado'
  };
  const norm = Core.normalizeBooking(legacyV1);
  assert.strictEqual(norm.status, 'confirmed');
  assert.strictEqual(norm.vehicleType, 'car');
  assert.strictEqual(norm.departure, '12:00');
  assert.strictEqual(norm.durationMinutes, 120);
  assert.strictEqual(norm.cost, 12000);
  assert.strictEqual(norm.startAt, '2026-12-15T10:00:00-03:00');
  assert.strictEqual(norm.endAt, '2026-12-15T12:00:00-03:00');
  return `normalized=${norm.id} (${norm.arrival}-${norm.departure})`;
});

console.log(`\nSummary: ${results.filter(r => r.status === 'PASS').length}/${results.length} core tests passed.`);
