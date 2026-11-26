#!/usr/bin/env node
'use strict';

/**
 * parkFinder Sprint 2C — Domain & Adapter Unit Tests (Node)
 * Verifies supabase-client.js mapping, security guards (no fake offline auth,
 * no secret keys exposed), RFC 5545 .ics export, bilingual Share text, and CSV export.
 */

const fs = require('fs');
const path = require('path');
const Core = require(path.resolve(__dirname, '..', 'core-booking.js'));
const Sb = require(path.resolve(__dirname, '..', 'supabase-client.js'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function test(id, desc, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`[PASS] ${id}: ${desc} -> ${detail}`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${id}: ${desc} -> ${err.message}`);
  }
}

async function main() {
  // S2C-D01: Public config contains ONLY URL + publishable key, zero secret/service_role keys
  await test('S2C-D01', 'Public Supabase config exposes zero secret or service_role keys', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'supabase-client.js'), 'utf8');
    assert(Sb.CONFIG.url === 'https://qerrmfdpxbjwmeprwrbc.supabase.co', 'Unexpected project URL');
    assert(Sb.CONFIG.publishableKey.startsWith('sb_publishable_'), 'Expected publishable key prefix');
    assert(!src.includes('sb_secret_'), 'Secret key must never be present in frontend code');
    assert(!/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{30,}/.test(src), 'JWT service key must never be embedded');
    assert(!Object.keys(Sb.CONFIG).some((k) => /secret|service|password/i.test(k)), 'Sensitive config key found');
    return `ref=${Sb.CONFIG.projectRef}, publishableOnly=true`;
  });

  // S2C-D02: Offline auth NEVER simulates successful sign-in or sign-up
  await test('S2C-D02', 'Auth methods reject cleanly when Supabase client is unavailable (no fake login)', async () => {
    Sb.clearClientOverride();
    const rIn = await Sb.signIn({ email: 'driver@example.com', password: 'secret' });
    const rUp = await Sb.signUp({ email: 'new@example.com', password: 'password123', fullName: 'Test' });
    const rRec = await Sb.resetPassword('driver@example.com');
    assert(rIn.ok === false && rIn.code === 'SERVICE_UNAVAILABLE', `Expected SERVICE_UNAVAILABLE, got ${JSON.stringify(rIn)}`);
    assert(rUp.ok === false && rUp.code === 'SERVICE_UNAVAILABLE', `Expected SERVICE_UNAVAILABLE, got ${JSON.stringify(rUp)}`);
    assert(rRec.ok === false && rRec.code === 'SERVICE_UNAVAILABLE', `Expected SERVICE_UNAVAILABLE, got ${JSON.stringify(rRec)}`);
    return 'signIn=SERVICE_UNAVAILABLE, signUp=SERVICE_UNAVAILABLE, reset=SERVICE_UNAVAILABLE';
  });

  // S2C-D03: Tri-state amenity mapping preserves yes (true), no (false), and unknown (null)
  await test('S2C-D03', 'Server facility & tri-state amenity mapping preserves true/false/null states', async () => {
    const mapped = Sb.mapDbAmenitiesToUi({
      covered: true,
      security_cctv: true,
      ev_charging: false,
      accessible: null,
      valet: false,
      open_24h: false
    });
    assert(mapped.covered === true, 'covered should be true');
    assert(mapped.evCharging === false, 'evCharging should be false');
    assert(mapped.accessible === null, 'accessible should be null (unknown)');
    const g = Sb.mapServerFacilityToGarage({
      uuid: '11111111-1111-4111-8111-111111111111',
      slug: 'garage-palermo-soho',
      name: 'Garage Palermo Soho',
      address: 'Gurruchaga 1500',
      lat: -34.5885,
      lng: -58.429,
      ratePerHour: 5600,
      totalSpaces: 80,
      maxHeightM: 2.0,
      amenitiesDb: { covered: true, security_cctv: true, ev_charging: true, accessible: null, valet: false, open_24h: false },
      operatingHoursByDay: [{ dayOfWeek: 1, open: '07:00', close: '22:00', is24Hours: false, isClosed: false }],
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv'],
      rating: { score: 4.6, reviewCount: 98 }
    }, Core);
    assert(g.id === 'garage-palermo-soho' && g.uuid === '11111111-1111-4111-8111-111111111111');
    assert(g.amenities.accessible === null && g.open24 === false && g.operatingHours.close === '22:00');
    return 'triState(yes=true,no=false,unknown=null), hours=07:00-22:00';
  });

  // S2C-D04: Server booking mapping preserves snapshots, BA local dates, and Supabase scope
  await test('S2C-D04', 'Server booking mapping preserves vehicle snapshot, BA interval, events & scope', async () => {
    const ui = Sb.mapServerBookingToUi({
      id: '22222222-2222-4222-8222-222222222222',
      bookingCode: 'PF-2026-AB12CD',
      status: 'confirmed',
      uiCategory: 'upcoming',
      facilityId: '11111111-1111-4111-8111-111111111111',
      facilitySlug: 'garage-puerto-madero',
      facilityName: 'Garage Puerto Madero',
      facilityAddress: 'Av. del Sol 1141',
      lat: -34.6074,
      lng: -58.3610,
      startsAt: '2027-01-15T23:00:00-03:00',
      endsAt: '2027-01-16T01:00:00-03:00',
      totalAmount: 13650,
      currency: 'ARS',
      paymentMethod: 'pay_at_garage',
      vehicleSnapshot: { plate: 'AA 777 ZZ', vehicle_type: 'car', height_m: 1.50 },
      events: [{ eventType: 'hold_created', createdAt: '2027-01-10T12:00:00Z' }]
    }, Core);
    assert(ui.id === 'PF-2026-AB12CD' && ui.uuid === '22222222-2222-4222-8222-222222222222');
    assert(ui.isOvernight === true && ui.arrival === '23:00' && ui.departure === '01:00');
    assert(ui.persistenceScope === 'supabase_centralized' && ui.plate === 'AA 777 ZZ');
    return `code=${ui.id}, overnight=${ui.isOvernight}, scope=${ui.persistenceScope}`;
  });

  // S2C-D05: RFC 5545 Calendar (.ics), bilingual Share text, and CSV export
  await test('S2C-D05', 'RFC 5545 .ics calendar, ES/EN share text, and CSV export format cleanly', async () => {
    const sample = {
      id: 'PF-2026-CAL01',
      bookingCode: 'PF-2026-CAL01',
      status: 'confirmed',
      garage: 'Garage Puerto Madero',
      address: 'Av. del Sol 1141, Puerto Madero, CABA',
      arrivalDate: '2027-01-15',
      departureDate: '2027-01-15',
      arrival: '10:00',
      departure: '12:00',
      startAt: '2027-01-15T10:00:00-03:00',
      endAt: '2027-01-15T12:00:00-03:00',
      hours: 2,
      vehicleType: 'car',
      plate: 'AB 123 CD',
      cost: 13000,
      paymentMethod: 'pay_at_garage',
      paymentStatus: 'pending',
      persistenceScope: 'supabase_centralized'
    };
    const ics = Sb.buildBookingIcs(sample);
    assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT') && ics.includes('DTSTART:20270115T130000Z'), 'Invalid ICS output');
    const shareEs = Sb.buildBookingShareText(sample, 'es');
    const shareEn = Sb.buildBookingShareText(sample, 'en');
    assert(shareEs.includes('Reserva parkFinder PF-2026-CAL01') && shareEn.includes('parkFinder Booking PF-2026-CAL01'));
    const csv = Sb.buildBookingsCsv([sample]);
    assert(csv.includes('booking_code,status,garage') && csv.includes('PF-2026-CAL01') && csv.includes('booked_estimated_demo_not_real_payment'));
    return 'ics=RFC5545_OK, share(ES+EN)=OK, csv=OK';
  });

  // S2C-D06: Client cannot forge price in createBookingHold RPC payload
  await test('S2C-D06', 'createBookingHold RPC omits all client-supplied pricing/role/user_id fields', async () => {
    let capturedArgs = null;
    Sb.setClientOverride({
      rpc: async (fn, args) => {
        capturedArgs = { fn, args };
        return { data: { ok: true, code: 'OK', booking: { id: 'b1', totalAmount: 13000 } }, error: null };
      }
    }, 'supabase');
    await Sb.createBookingHold({
      facilityId: 'fac-1',
      vehicleId: 'veh-1',
      startsAt: '2027-01-15T10:00:00-03:00',
      endsAt: '2027-01-15T12:00:00-03:00',
      paymentMethod: 'pay_at_garage',
      // Attempted tampering fields that MUST be ignored:
      totalAmount: 1,
      cost: 0,
      userId: 'attacker-uid',
      role: 'admin'
    });
    Sb.clearClientOverride();
    assert(capturedArgs.fn === 'pf_create_booking_hold');
    const keys = Object.keys(capturedArgs.args);
    assert(!keys.includes('totalAmount') && !keys.includes('cost') && !keys.includes('userId') && !keys.includes('role') && !keys.includes('p_total_amount'), `Tampered field leaked: ${keys.join(',')}`);
    return `rpc=${capturedArgs.fn}, safeKeys=[${keys.join(',')}]`;
  });

  console.log(`\nSprint 2C Domain Summary: ${passed}/${passed + failed} tests passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
