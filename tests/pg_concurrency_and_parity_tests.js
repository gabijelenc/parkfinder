#!/usr/bin/env node
'use strict';

/**
 * parkFinder Sprint 2C — PostgreSQL Multi-Session Concurrency & JS-vs-SQL Pricing Parity Suite
 *
 * Verifies:
 *   1. True parallel multi-session transactional locking on the last available parking space
 *      (PG-CONC-01: 10 parallel sessions on cap-1; PG-CONC-02: 8 parallel sessions on last space of cap-2;
 *       PG-CONC-03: parallel late-confirm vs new-hold after TTL expiry).
 *   2. 100% parity between JavaScript dynamic pricing (core-booking.js) and PostgreSQL 17
 *      dynamic pricing (public.pf_calculate_quote_internal) across 12 scenarios (vehicles, peak,
 *      occupancy tiers <50%/50-74%/>=75%, weekend, Fri->Sat & Sun->Mon overnight transitions,
 *      fractional minutes, 48h multi-day, and single final rounding).
 *
 * Zero npm dependencies: executes parallel psql sessions via PG_DOCKER_CONTAINER (default: pf-pg17)
 * or direct psql when DATABASE_URL is provided.
 */

const { spawn } = require('child_process');
const path = require('path');
const Core = require(path.resolve(__dirname, '..', 'core-booking.js'));

const DOCKER_CONTAINER = process.env.PG_DOCKER_CONTAINER || 'pf-pg17';
const DATABASE_URL = process.env.DATABASE_URL || '';

function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const cmd = DATABASE_URL ? 'psql' : 'docker';
    const args = DATABASE_URL
      ? ['-v', 'ON_ERROR_STOP=1', '-t', '-A', DATABASE_URL]
      : ['exec', '-i', DOCKER_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-U', 'postgres', '-d', 'parkfinder'];

    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql exited ${code}: ${stderr.trim() || stdout.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

function sqlLiteral(val) {
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function cleanupTestUsers(userIds) {
  const inList = userIds.map(sqlLiteral).join(',');
  await runPsql(`
    DELETE FROM public.notifications WHERE user_id IN (${inList});
    DELETE FROM public.booking_access_tokens WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (${inList}));
    DELETE FROM public.payment_events WHERE payment_id IN (SELECT id FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (${inList})));
    DELETE FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (${inList}));
    DELETE FROM public.booking_events WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id IN (${inList}));
    DELETE FROM public.bookings WHERE user_id IN (${inList});
    DELETE FROM public.vehicles WHERE user_id IN (${inList});
    DELETE FROM public.notification_preferences WHERE user_id IN (${inList});
    DELETE FROM public.audit_logs WHERE actor_id IN (${inList});
    DELETE FROM auth.users WHERE id IN (${inList});
  `);
}

async function seedConcurrentUsers(count, prefix) {
  const users = [];
  for (let i = 1; i <= count; i++) {
    const hex = String(i).padStart(12, '0');
    const uid = `cc${prefix}0000-0000-4000-8000-${hex}`;
    users.push({ uid, email: `conc_${prefix}_${i}@example.com`, plate: `CN ${String(i).padStart(3, '0')} ${prefix.toUpperCase()}` });
  }
  await cleanupTestUsers(users.map((u) => u.uid));

  const sql = users.map((u) => `
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (${sqlLiteral(u.uid)}, ${sqlLiteral(u.email)}, '{"full_name":"Conc Driver"}'::jsonb);
    INSERT INTO public.vehicles (user_id, plate, make, model, vehicle_type, height_m, is_default)
    VALUES (${sqlLiteral(u.uid)}, ${sqlLiteral(u.plate)}, 'Test', 'Car', 'car', 1.50, true);
  `).join('\n');
  await runPsql(`BEGIN;\n${sql}\nCOMMIT;`);

  const rows = await runPsql(`
    SELECT v.user_id || '|' || v.id
      FROM public.vehicles v
     WHERE v.user_id IN (${users.map((u) => sqlLiteral(u.uid)).join(',')})
     ORDER BY v.user_id;
  `);
  const vehByUser = {};
  rows.split('\n').filter(Boolean).forEach((line) => {
    const [uid, vid] = line.split('|');
    vehByUser[uid] = vid;
  });
  return users.map((u) => ({ ...u, vehicleId: vehByUser[u.uid] }));
}

async function getFacilityId(slug) {
  return runPsql(`SELECT id FROM public.parking_facilities WHERE slug = ${sqlLiteral(slug)} LIMIT 1;`);
}

async function fireHoldInSession(user, facilityId, startsAt, endsAt) {
  const out = await runPsql(`
    BEGIN;
    SELECT set_config('request.jwt.claims', ${sqlLiteral(JSON.stringify({ sub: user.uid, role: 'authenticated' }))}, true);
    SELECT set_config('request.jwt.claim.sub', ${sqlLiteral(user.uid)}, true);
    SELECT public.pf_create_booking_hold(
      ${sqlLiteral(facilityId)}::uuid,
      ${sqlLiteral(user.vehicleId)}::uuid,
      ${sqlLiteral(startsAt)}::timestamptz,
      ${sqlLiteral(endsAt)}::timestamptz,
      'pay_at_garage',
      NULL
    )::text;
    COMMIT;
  `);
  const lines = out.split('\n').filter(Boolean);
  const jsonLine = lines.slice().reverse().find((l) => l.startsWith('{'));
  return JSON.parse(jsonLine);
}

async function main() {
  let passed = 0;
  let failed = 0;

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

  const allUserIds = [];

  try {
    const facCap1 = await getFacilityId('qa-cap1-centro');
    const facCap2 = await getFacilityId('qa-cap2-obelisco');
    const fac24h = await getFacilityId('qa-cap1-24h');
    const facPM = await getFacilityId('garage-puerto-madero');
    const facChac = await getFacilityId('garage-chacarita');

    // PG-CONC-01: 10 parallel PostgreSQL sessions racing for capacity-1 garage
    await test('PG-CONC-01', '10 parallel sessions racing for last space on capacity-1 garage', async () => {
      const users = await seedConcurrentUsers(10, '01');
      users.forEach((u) => allUserIds.push(u.uid));

      const startIso = '2027-02-10T09:00:00-03:00';
      const endIso = '2027-02-10T11:00:00-03:00';

      const results = await Promise.all(
        users.map((u) => fireHoldInSession(u, facCap1, startIso, endIso))
      );

      const winners = results.filter((r) => r.ok === true);
      const rejected = results.filter((r) => r.ok === false && r.code === 'NO_AVAILABILITY');
      const dbCount = Number(await runPsql(`
        SELECT COUNT(*) FROM public.bookings
         WHERE facility_id = ${sqlLiteral(facCap1)}::uuid
           AND starts_at = ${sqlLiteral(startIso)}::timestamptz
           AND status IN ('pending_payment','confirmed','checked_in');
      `));

      if (winners.length !== 1 || rejected.length !== 9 || dbCount !== 1) {
        throw new Error(`Expected 1 winner / 9 NO_AVAILABILITY / 1 DB row; got winners=${winners.length}, rejected=${rejected.length}, dbCount=${dbCount}`);
      }
      return `winners=1 (${winners[0].booking.bookingCode}), rejected=9 (NO_AVAILABILITY), dbRows=1`;
    });

    // PG-CONC-02: 8 parallel sessions racing for the 2nd (last) space on capacity-2 garage
    await test('PG-CONC-02', '8 parallel sessions racing for last remaining space (1/2) on capacity-2 garage', async () => {
      const users = await seedConcurrentUsers(9, '02');
      users.forEach((u) => allUserIds.push(u.uid));

      const startIso = '2027-02-11T10:00:00-03:00';
      const endIso = '2027-02-11T12:00:00-03:00';

      // Occupy 1 of 2 spaces first
      const first = await fireHoldInSession(users[0], facCap2, startIso, endIso);
      if (!first.ok) throw new Error(`Seed booking failed: ${JSON.stringify(first)}`);

      // Now 8 parallel drivers race for the last remaining space
      const racers = users.slice(1);
      const results = await Promise.all(
        racers.map((u) => fireHoldInSession(u, facCap2, startIso, endIso))
      );

      const winners = results.filter((r) => r.ok === true);
      const rejected = results.filter((r) => r.ok === false && r.code === 'NO_AVAILABILITY');
      const dbCount = Number(await runPsql(`
        SELECT COUNT(*) FROM public.bookings
         WHERE facility_id = ${sqlLiteral(facCap2)}::uuid
           AND starts_at = ${sqlLiteral(startIso)}::timestamptz
           AND status IN ('pending_payment','confirmed','checked_in');
      `));

      if (winners.length !== 1 || rejected.length !== 7 || dbCount !== 2) {
        throw new Error(`Expected 1 winner / 7 NO_AVAILABILITY / 2 DB rows; got winners=${winners.length}, rejected=${rejected.length}, dbCount=${dbCount}`);
      }
      return `preBooked=1, winners=1, rejected=7 (NO_AVAILABILITY), totalDbRows=2/2`;
    });

    // PG-CONC-03: Parallel late-confirm vs 5 new holds right after hold TTL expires
    await test('PG-CONC-03', 'Parallel late confirm vs 5 concurrent rebooks after hold expiry prevents overbooking', async () => {
      const users = await seedConcurrentUsers(6, '03');
      users.forEach((u) => allUserIds.push(u.uid));

      const startIso = '2027-02-12T23:00:00-03:00';
      const endIso = '2027-02-13T01:00:00-03:00';

      const origHold = await fireHoldInSession(users[0], fac24h, startIso, endIso);
      if (!origHold.ok) throw new Error(`Initial hold failed: ${JSON.stringify(origHold)}`);

      // Expire the original hold
      await runPsql(`UPDATE public.bookings SET hold_expires_at = now() - interval '30 seconds' WHERE id = ${sqlLiteral(origHold.booking.id)}::uuid;`);

      const lateConfirmPromise = (async () => {
        const out = await runPsql(`
          BEGIN;
          SELECT set_config('request.jwt.claims', ${sqlLiteral(JSON.stringify({ sub: users[0].uid, role: 'authenticated' }))}, true);
          SELECT set_config('request.jwt.claim.sub', ${sqlLiteral(users[0].uid)}, true);
          SELECT public.pf_confirm_booking_demo(${sqlLiteral(origHold.booking.id)}::uuid, 'pay_at_garage')::text;
          COMMIT;
        `);
        const jsonLine = out.split('\n').filter(Boolean).slice().reverse().find((l) => l.startsWith('{'));
        return JSON.parse(jsonLine);
      })();

      const rebookPromises = users.slice(1).map((u) => fireHoldInSession(u, fac24h, startIso, endIso));
      const [lateRes, ...rebookRes] = await Promise.all([lateConfirmPromise, ...rebookPromises]);

      const rebookWinners = rebookRes.filter((r) => r.ok === true);
      const dbActive = Number(await runPsql(`
        SELECT COUNT(*) FROM public.bookings
         WHERE facility_id = ${sqlLiteral(fac24h)}::uuid
           AND starts_at = ${sqlLiteral(startIso)}::timestamptz
           AND status IN ('pending_payment','confirmed','checked_in');
      `));

      if (lateRes.ok !== false || !['HOLD_EXPIRED', 'INVALID_BOOKING_TRANSITION'].includes(lateRes.code) || rebookWinners.length !== 1 || dbActive !== 1) {
        throw new Error(`Unexpected race result: late=${JSON.stringify(lateRes)}, winners=${rebookWinners.length}, dbActive=${dbActive}`);
      }
      return `lateConfirm=${lateRes.code}, newHoldWinners=1/5, activeDbRows=1`;
    });

    // -------------------------------------------------------------------------
    // JS (core-booking.js) vs PostgreSQL (pf_calculate_quote_internal) Pricing Parity
    // -------------------------------------------------------------------------
    const parityUsers = await seedConcurrentUsers(2, '04');
    parityUsers.forEach((u) => allUserIds.push(u.uid));

    const parityScenarios = [
      { id: 'PG-PARITY-01', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-02', depDate: '2027-03-02', arr: '10:00', dep: '12:00', veh: 'car', note: 'Weekday off-peak car' },
      { id: 'PG-PARITY-02', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-02', depDate: '2027-03-02', arr: '08:00', dep: '10:00', veh: 'motorcycle', note: 'Morning peak motorcycle (x0.65 x1.15)' },
      { id: 'PG-PARITY-03', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-02', depDate: '2027-03-02', arr: '17:00', dep: '20:00', veh: 'suv', note: 'Evening peak SUV (x1.30 x1.15)' },
      { id: 'PG-PARITY-04', slug: 'garage-chacarita',     facId: facChac, arrDate: '2027-03-02', depDate: '2027-03-02', arr: '16:30', dep: '20:15', veh: 'van', note: 'Fractional minutes spanning off-peak & evening peak van' },
      { id: 'PG-PARITY-05', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-06', depDate: '2027-03-06', arr: '08:00', dep: '11:00', veh: 'car', note: 'Saturday morning peak + off-peak' },
      { id: 'PG-PARITY-06', slug: 'garage-chacarita',     facId: facChac, arrDate: '2027-03-07', depDate: '2027-03-07', arr: '17:15', dep: '19:45', veh: 'motorcycle', note: 'Sunday evening peak fractional minutes single rounding' },
      { id: 'PG-PARITY-07', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-05', depDate: '2027-03-06', arr: '22:00', dep: '02:00', veh: 'suv', note: 'Overnight Fri->Sat weekend boundary' },
      { id: 'PG-PARITY-08', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-07', depDate: '2027-03-08', arr: '22:00', dep: '02:00', veh: 'van', note: 'Overnight Sun->Mon weekday return' },
      { id: 'PG-PARITY-09', slug: 'garage-puerto-madero', facId: facPM, arrDate: '2027-03-05', depDate: '2027-03-07', arr: '10:00', dep: '10:00', veh: 'car', note: '48h multi-day Fri->Sun crossing peaks & weekend' }
    ];

    for (const sc of parityScenarios) {
      await test(sc.id, `JS vs PostgreSQL quote parity (${sc.note})`, async () => {
        const garage = Core.DEFAULT_GARAGES.find((g) => g.id === sc.slug);
        const interval = Core.validateInterval({
          arrivalDate: sc.arrDate, departureDate: sc.depDate,
          arrival: sc.arr, departure: sc.dep, allowPast: true
        });
        const jsQ = Core.calculateDynamicQuote(garage, interval, sc.veh, []);
        const pgRaw = await runPsql(`
          SELECT public.pf_calculate_quote_internal(
            ${sqlLiteral(sc.facId)}::uuid,
            ${sqlLiteral(interval.startAt)}::timestamptz,
            ${sqlLiteral(interval.endAt)}::timestamptz,
            ${sqlLiteral(sc.veh)}
          )::text;
        `);
        const pgQ = JSON.parse(pgRaw);

        if (pgQ.totalArs !== jsQ.totalArs) {
          throw new Error(`totalArs mismatch! JS=${jsQ.totalArs} vs PG=${pgQ.totalArs} (JS exact=${jsQ.totalExact}, PG exact=${pgQ.totalExact})`);
        }
        if (Math.abs(pgQ.totalExact - jsQ.totalExact) > 0.01) {
          throw new Error(`totalExact drift! JS=${jsQ.totalExact} vs PG=${pgQ.totalExact}`);
        }
        if (pgQ.segments.length !== jsQ.segments.length) {
          throw new Error(`Segment count mismatch! JS=${jsQ.segments.length} vs PG=${pgQ.segments.length}`);
        }
        return `JS=${jsQ.totalArs} === PG=${pgQ.totalArs} ARS (${pgQ.segments.length} segments, exact=${jsQ.totalExact.toFixed(2)})`;
      });
    }

    // PG-PARITY-10: Occupancy 50% tier parity (1/2 booked on qa-cap2-obelisco during 09:00-10:00)
    await test('PG-PARITY-10', 'JS vs PostgreSQL quote parity with 50% occupancy + peak hour', async () => {
      const occStart = '2027-03-10T09:00:00-03:00';
      const occEnd = '2027-03-10T10:00:00-03:00';
      const hold = await fireHoldInSession(parityUsers[0], facCap2, occStart, occEnd);
      if (!hold.ok) throw new Error('Failed to seed 50% occupancy booking');

      const qaGarage = { id: 'qa-cap2-obelisco', ratePerHour: 6000, totalSpaces: 2 };
      const jsBookings = [{ id: 'B1', status: 'confirmed', garageId: 'qa-cap2-obelisco', startAt: occStart, endAt: occEnd }];
      const interval = Core.validateInterval({ arrivalDate: '2027-03-10', departureDate: '2027-03-10', arrival: '09:00', departure: '11:00', allowPast: true });
      const jsQ = Core.calculateDynamicQuote(qaGarage, interval, 'suv', jsBookings);
      const pgQ = JSON.parse(await runPsql(`
        SELECT public.pf_calculate_quote_internal(
          ${sqlLiteral(facCap2)}::uuid,
          ${sqlLiteral(interval.startAt)}::timestamptz,
          ${sqlLiteral(interval.endAt)}::timestamptz,
          'suv'
        )::text;
      `));
      if (pgQ.totalArs !== jsQ.totalArs || pgQ.totalArs !== 18564) {
        throw new Error(`Mismatch: JS=${jsQ.totalArs}, PG=${pgQ.totalArs}`);
      }
      return `JS=${jsQ.totalArs} === PG=${pgQ.totalArs} ARS (50% occ x1.20 + peak x1.15 + SUV x1.30)`;
    });

    // PG-PARITY-11: Occupancy >=75% tier parity (2/2 full on qa-cap2-obelisco -> 100% occupancy x1.40)
    await test('PG-PARITY-11', 'JS vs PostgreSQL quote parity with >=75% occupancy tier (x1.40)', async () => {
      const occStart = '2027-03-10T09:00:00-03:00';
      const occEnd = '2027-03-10T10:00:00-03:00';
      const hold2 = await fireHoldInSession(parityUsers[1], facCap2, occStart, occEnd);
      if (!hold2.ok) throw new Error('Failed to seed 100% occupancy booking');

      const qaGarage = { id: 'qa-cap2-obelisco', ratePerHour: 6000, totalSpaces: 2 };
      const jsBookings = [
        { id: 'B1', status: 'confirmed', garageId: 'qa-cap2-obelisco', startAt: occStart, endAt: occEnd },
        { id: 'B2', status: 'confirmed', garageId: 'qa-cap2-obelisco', startAt: occStart, endAt: occEnd }
      ];
      const interval = Core.validateInterval({ arrivalDate: '2027-03-10', departureDate: '2027-03-10', arrival: '09:00', departure: '10:00', allowPast: true });
      const jsQ = Core.calculateDynamicQuote(qaGarage, interval, 'car', jsBookings);
      const pgQ = JSON.parse(await runPsql(`
        SELECT public.pf_calculate_quote_internal(
          ${sqlLiteral(facCap2)}::uuid,
          ${sqlLiteral(interval.startAt)}::timestamptz,
          ${sqlLiteral(interval.endAt)}::timestamptz,
          'car'
        )::text;
      `));
      // 6000 * 1.00 * 1.40 * 1.15 * 1.00 = 9660
      if (pgQ.totalArs !== jsQ.totalArs || pgQ.totalArs !== 9660) {
        throw new Error(`Mismatch: JS=${jsQ.totalArs}, PG=${pgQ.totalArs}`);
      }
      return `JS=${jsQ.totalArs} === PG=${pgQ.totalArs} ARS (>=75% occ x1.40 + peak x1.15)`;
    });

    // PG-PARITY-12: Single final rounding verification on fractional hourly rate (1001 ARS/h)
    await test('PG-PARITY-12', 'JS vs PostgreSQL single final rounding parity on odd rate (1001 ARS/h)', async () => {
      await runPsql(`UPDATE public.parking_facilities SET base_hourly_rate = 1001 WHERE id = ${sqlLiteral(fac24h)}::uuid;`);
      try {
        const qaGarage = { id: 'qa-cap1-24h', ratePerHour: 1001, totalSpaces: 1 };
        const interval = Core.validateInterval({ arrivalDate: '2027-03-06', departureDate: '2027-03-06', arrival: '10:00', departure: '12:00', allowPast: true });
        const jsQ = Core.calculateDynamicQuote(qaGarage, interval, 'motorcycle', []);
        const pgQ = JSON.parse(await runPsql(`
          SELECT public.pf_calculate_quote_internal(
            ${sqlLiteral(fac24h)}::uuid,
            ${sqlLiteral(interval.startAt)}::timestamptz,
            ${sqlLiteral(interval.endAt)}::timestamptz,
            'motorcycle'
          )::text;
        `));
        // 1001 * 0.65 * 1.10 * 2 = 1431.43 -> single final round = 1431 (per-segment round would be 1432)
        if (pgQ.totalArs !== 1431 || jsQ.totalArs !== 1431) {
          throw new Error(`Rounding mismatch: JS=${jsQ.totalArs}, PG=${pgQ.totalArs}`);
        }
        return `JS=${jsQ.totalArs} === PG=${pgQ.totalArs} ARS (exact=1431.43, single final round verified)`;
      } finally {
        await runPsql(`UPDATE public.parking_facilities SET base_hourly_rate = 5000 WHERE id = ${sqlLiteral(fac24h)}::uuid;`);
      }
    });

  } finally {
    if (allUserIds.length > 0) {
      await cleanupTestUsers(allUserIds);
    }
  }

  console.log(`\nPostgreSQL Concurrency & Parity Summary: ${passed}/${passed + failed} tests passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
