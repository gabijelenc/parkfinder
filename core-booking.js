/* ==========================================================================
   ParkFinder Core Booking Engine (Sprint 01: PF-01, PF-02, PF-03, PF-04)
   Pure, zero-dependency domain logic shared between browser UI (index.html)
   and automated acceptance tests.
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ParkFinderCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIMEZONE = 'America/Argentina/Buenos_Aires';
  var UTC_OFFSET = '-03:00';
  var UTC_OFFSET_MINUTES = -180; // Argentina does not observe DST (UTC-3 fixed)
  var MS_PER_MINUTE = 60000;
  var MS_PER_HOUR = 3600000;

  /* Proposed demo defaults per 01_fuentes/reglas_negocio_v01.md (R04).
     Pending formal team sign-off before production use. */
  var VEHICLE_TYPES = Object.freeze({
    motorcycle: Object.freeze({ id: 'motorcycle', factor: 0.65, defaultHeightM: 1.30 }),
    car: Object.freeze({ id: 'car', factor: 1.00, defaultHeightM: 1.55 }),
    suv: Object.freeze({ id: 'suv', factor: 1.30, defaultHeightM: 1.85 }),
    van: Object.freeze({ id: 'van', factor: 1.55, defaultHeightM: 2.20 })
  });

  var VEHICLE_TYPE_LIST = Object.freeze(['motorcycle', 'car', 'suv', 'van']);

  var PRICING_POLICY = Object.freeze({
    version: 'pf-v2-proposed-hourly-proration',
    currency: 'ARS',
    rounding: 'single_final_round',
    peakFactor: 1.15,
    peakHours: Object.freeze([
      Object.freeze([8, 10]),
      Object.freeze([17, 20])
    ]),
    weekendFactor: 1.10,
    weekendDays: Object.freeze([0, 6]), // Sunday (0), Saturday (6)
    occupancyTiers: Object.freeze([
      Object.freeze({ maxExclusive: 0.50, factor: 1.00, label: '<50%' }),
      Object.freeze({ maxExclusive: 0.75, factor: 1.20, label: '50–74%' }),
      Object.freeze({ maxExclusive: Infinity, factor: 1.40, label: '>=75%' })
    ]),
    vehicleFactors: Object.freeze({
      motorcycle: 0.65,
      car: 1.00,
      suv: 1.30,
      van: 1.55
    })
  });

  /* Synthetic garage catalog (Buenos Aires / CABA).
     Preserves all 8 V1 garages while adding operating hours, accepted vehicle
     types, max clearance height, and explicit synthetic provenance. */
  var DEFAULT_GARAGES = [
    {
      id: 'garage-puerto-madero',
      name: 'Garage Puerto Madero',
      address: 'Av. del Sol 1141, Puerto Madero, CABA',
      lat: -34.6074,
      lng: -58.3610,
      ratePerHour: 6500,
      totalSpaces: 120,
      techado: true,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 2.40,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-palermo-soho',
      name: 'Garage Palermo Soho',
      address: 'Gurruchaga 1500, Palermo Soho, CABA',
      lat: -34.5885,
      lng: -58.4290,
      ratePerHour: 5600,
      totalSpaces: 80,
      techado: true,
      open24: false,
      operatingHours: { open: '07:00', close: '22:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv'],
      maxHeightM: 2.00,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-obelisco',
      name: 'Garage Obelisco Centro',
      address: 'Av. Corrientes 1240, Microcentro, CABA',
      lat: -34.6049,
      lng: -58.3778,
      ratePerHour: 6000,
      totalSpaces: 150,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['car', 'suv', 'van'],
      maxHeightM: 2.60,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-recoleta',
      name: 'Garage Recoleta Centro',
      address: 'Av. Santa Fe 1500, Recoleta, CABA',
      lat: -34.5975,
      lng: -58.3895,
      ratePerHour: 6200,
      totalSpaces: 90,
      techado: true,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['car', 'suv'],
      maxHeightM: 1.95,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'parqueon-hospital-italiano',
      name: 'Parqueón Hospital Italiano',
      address: 'Tte. Gral. Perón 4190, Almagro, CABA',
      lat: -34.6076,
      lng: -58.4262,
      ratePerHour: 4800,
      totalSpaces: 100,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 3.00,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'parqueon-san-telmo',
      name: 'Parqueón San Telmo',
      address: 'Av. Defensa 830, San Telmo, CABA',
      lat: -34.6146,
      lng: -58.3730,
      ratePerHour: 4500,
      totalSpaces: 60,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv'],
      maxHeightM: 2.10,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-colegiales',
      name: 'Garage Colegiales',
      address: 'Av. Federico Lacroze 2200, Colegiales, CABA',
      lat: -34.5739,
      lng: -58.4552,
      ratePerHour: 3900,
      totalSpaces: 70,
      techado: true,
      open24: false,
      operatingHours: { open: '07:00', close: '21:00' },
      acceptedVehicleTypes: ['motorcycle', 'car'],
      maxHeightM: 1.80,
      dataProvenance: 'synthetic_demo'
    },
    {
      id: 'garage-chacarita',
      name: 'Garage Chacarita',
      address: 'Av. Corrientes 6150, Chacarita, CABA',
      lat: -34.5919,
      lng: -58.4403,
      ratePerHour: 3500,
      totalSpaces: 55,
      techado: false,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 2.80,
      dataProvenance: 'synthetic_demo'
    }
  ];

  /* ------------------------- Date & Time (Buenos Aires UTC-3) ------------------------- */

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getBuenosAiresLocalParts(epochMs) {
    var shifted = new Date(epochMs + UTC_OFFSET_MINUTES * MS_PER_MINUTE);
    var year = shifted.getUTCFullYear();
    var month = shifted.getUTCMonth() + 1;
    var day = shifted.getUTCDate();
    var hour = shifted.getUTCHours();
    var minute = shifted.getUTCMinutes();
    var dayOfWeek = shifted.getUTCDay();
    return {
      year: year,
      month: month,
      day: day,
      hour: hour,
      minute: minute,
      dayOfWeek: dayOfWeek,
      dateStr: year + '-' + pad2(month) + '-' + pad2(day),
      timeStr: pad2(hour) + ':' + pad2(minute)
    };
  }

  function getTodayInBuenosAires(referenceNow) {
    var nowMs = referenceNow instanceof Date
      ? referenceNow.getTime()
      : (typeof referenceNow === 'number' ? referenceNow : Date.now());
    return getBuenosAiresLocalParts(nowMs).dateStr;
  }

  function parseDateParts(dateStr) {
    if (typeof dateStr !== 'string') return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return null;
    var year = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var day = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() + 1 !== month ||
      check.getUTCDate() !== day
    ) {
      return null;
    }
    return { year: year, month: month, day: day };
  }

  function parseTimeMinutes(timeStr, allow2400) {
    if (typeof timeStr !== 'string') return null;
    var match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
    if (!match) return null;
    var hh = parseInt(match[1], 10);
    var mm = parseInt(match[2], 10);
    var ss = match[3] !== undefined ? parseInt(match[3], 10) : 0;
    if (ss !== 0) return null;
    if (allow2400 && hh === 24 && mm === 0) return 1440;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function formatMinutesToHHMM(totalMinutes) {
    var m = Math.max(0, Math.round(totalMinutes));
    if (m === 1440) return '24:00';
    var wrapped = m % 1440;
    var hh = Math.floor(wrapped / 60);
    var mm = wrapped % 60;
    return pad2(hh) + ':' + pad2(mm);
  }

  function toBuenosAiresEpochMs(dateStr, timeMinutes) {
    var parts = parseDateParts(dateStr);
    if (!parts || !Number.isFinite(timeMinutes)) return NaN;
    var midnightUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
    // BA local time is UTC-3, so UTC epoch = local + 3 hours
    return midnightUtcMs + (timeMinutes - UTC_OFFSET_MINUTES) * MS_PER_MINUTE;
  }

  function toBuenosAiresIso(dateStr, timeMinutes) {
    var epochMs = toBuenosAiresEpochMs(dateStr, timeMinutes);
    if (!Number.isFinite(epochMs)) return null;
    var local = getBuenosAiresLocalParts(epochMs);
    return local.dateStr + 'T' + local.timeStr + ':00' + UTC_OFFSET;
  }

  /* ------------------------- Interval Validation (PF-01) ------------------------- */

  function validateInterval(params) {
    var input = params || {};
    var date = typeof input.date === 'string' ? input.date.trim() : '';
    var arrival = typeof input.arrival === 'string' ? input.arrival.trim() : '';
    var departure = typeof input.departure === 'string' ? input.departure.trim() : '';

    var dateParts = parseDateParts(date);
    if (!dateParts) {
      return { valid: false, code: 'INVALID_DATE' };
    }

    var startMinutes = parseTimeMinutes(arrival, false);
    if (startMinutes === null) {
      return { valid: false, code: 'INVALID_ARRIVAL_TIME' };
    }

    var endMinutes = null;
    if (departure) {
      endMinutes = parseTimeMinutes(departure, true);
      if (endMinutes === null) {
        return { valid: false, code: 'INVALID_DEPARTURE_TIME' };
      }
    } else if (input.hours !== undefined && input.hours !== null && input.hours !== '') {
      var hoursNum = Number(input.hours);
      if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
        return { valid: false, code: 'NON_POSITIVE_DURATION' };
      }
      endMinutes = Math.round(startMinutes + hoursNum * 60);
      if (endMinutes > 1440) {
        return { valid: false, code: 'EXCEEDS_SAME_DAY' };
      }
    } else {
      return { valid: false, code: 'INVALID_DEPARTURE_TIME' };
    }

    var durationMinutes = endMinutes - startMinutes;
    if (durationMinutes <= 0) {
      return { valid: false, code: 'NON_POSITIVE_DURATION' };
    }

    var startMs = toBuenosAiresEpochMs(date, startMinutes);
    var endMs = toBuenosAiresEpochMs(date, endMinutes);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return { valid: false, code: 'INVALID_INTERVAL' };
    }

    if (input.allowPast === false) {
      var todayBa = getTodayInBuenosAires(input.referenceNow);
      if (date < todayBa) {
        return { valid: false, code: 'PAST_DATE' };
      }
    }

    return {
      valid: true,
      code: 'OK',
      date: date,
      arrival: formatMinutesToHHMM(startMinutes),
      departure: formatMinutesToHHMM(endMinutes),
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      durationMinutes: durationMinutes,
      durationHours: durationMinutes / 60,
      startMs: startMs,
      endMs: endMs,
      startAt: toBuenosAiresIso(date, startMinutes),
      endAt: toBuenosAiresIso(date, endMinutes),
      timezone: TIMEZONE
    };
  }

  /* ------------------------- Operating Hours & Vehicle Compatibility (PF-01, PF-03) ------------------------- */

  function getGarageOperatingMinutes(garage) {
    if (!garage) return { openMinutes: 0, closeMinutes: 1440, open: '00:00', close: '24:00', open24: true };
    if (garage.open24) {
      return { openMinutes: 0, closeMinutes: 1440, open: '00:00', close: '24:00', open24: true };
    }
    var hours = garage.operatingHours || { open: '07:00', close: '22:00' };
    var openMinutes = parseTimeMinutes(hours.open, false);
    var closeMinutes = parseTimeMinutes(hours.close, true);
    if (openMinutes === null) openMinutes = 420;
    if (closeMinutes === null) closeMinutes = 1320;
    return {
      openMinutes: openMinutes,
      closeMinutes: closeMinutes,
      open: formatMinutesToHHMM(openMinutes),
      close: formatMinutesToHHMM(closeMinutes),
      open24: false
    };
  }

  function isWithinOperatingHours(garage, interval) {
    if (!garage || !interval || !interval.valid) {
      return { compatible: false, code: 'INVALID_INTERVAL' };
    }
    var op = getGarageOperatingMinutes(garage);
    if (op.open24) {
      return { compatible: true, code: 'OK', open: op.open, close: op.close };
    }
    var ok = interval.startMinutes >= op.openMinutes && interval.endMinutes <= op.closeMinutes;
    return {
      compatible: ok,
      code: ok ? 'OK' : 'OUT_OF_HOURS',
      open: op.open,
      close: op.close
    };
  }

  function validateVehicleCompatibility(garage, vehicleType, vehicleHeightM) {
    var spec = VEHICLE_TYPES[vehicleType];
    if (!spec) {
      return {
        compatible: false,
        code: 'INVALID_VEHICLE_TYPE',
        vehicleType: vehicleType
      };
    }
    if (!garage) {
      return {
        compatible: false,
        code: 'INVALID_GARAGE',
        vehicleType: vehicleType
      };
    }
    var accepted = Array.isArray(garage.acceptedVehicleTypes)
      ? garage.acceptedVehicleTypes
      : VEHICLE_TYPE_LIST;
    if (accepted.indexOf(vehicleType) === -1) {
      return {
        compatible: false,
        code: 'VEHICLE_TYPE_NOT_ACCEPTED',
        vehicleType: vehicleType,
        acceptedVehicleTypes: accepted.slice(),
        maxHeightM: garage.maxHeightM
      };
    }

    var effectiveHeight = Number.isFinite(Number(vehicleHeightM)) && Number(vehicleHeightM) > 0
      ? Number(vehicleHeightM)
      : spec.defaultHeightM;

    if (Number.isFinite(garage.maxHeightM) && effectiveHeight > garage.maxHeightM + 1e-9) {
      return {
        compatible: false,
        code: 'HEIGHT_EXCEEDS_CLEARANCE',
        vehicleType: vehicleType,
        vehicleHeightM: effectiveHeight,
        maxHeightM: garage.maxHeightM,
        acceptedVehicleTypes: accepted.slice()
      };
    }

    return {
      compatible: true,
      code: 'OK',
      vehicleType: vehicleType,
      vehicleHeightM: effectiveHeight,
      maxHeightM: garage.maxHeightM,
      acceptedVehicleTypes: accepted.slice()
    };
  }

  /* ------------------------- Booking Normalization & Peak Concurrency (PF-01, PF-02) ------------------------- */

  function normalizeBooking(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var startMs = NaN;
    var endMs = NaN;

    if (typeof raw.startAt === 'string' && typeof raw.endAt === 'string') {
      startMs = Date.parse(raw.startAt);
      endMs = Date.parse(raw.endAt);
    }

    var date = raw.date;
    var arrival = raw.arrival;
    var departure = raw.departure;
    var durationMinutes = Number(raw.durationMinutes);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      // Backwards compatibility with V1 bookings: { date, arrival, hours }
      var derived = validateInterval({
        date: date,
        arrival: arrival,
        departure: departure,
        hours: raw.hours,
        allowPast: true
      });
      if (derived.valid) {
        startMs = derived.startMs;
        endMs = derived.endMs;
        date = derived.date;
        arrival = derived.arrival;
        departure = derived.departure;
        durationMinutes = derived.durationMinutes;
      }
    } else {
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        durationMinutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
      }
      if (!date || !arrival) {
        var sp = getBuenosAiresLocalParts(startMs);
        date = date || sp.dateStr;
        arrival = arrival || sp.timeStr;
      }
      if (!departure) {
        var ep = getBuenosAiresLocalParts(endMs);
        departure = ep.dateStr !== date && ep.timeStr === '00:00' ? '24:00' : ep.timeStr;
      }
    }

    var normalizedStatus = raw.status === 'cancelled' || raw.status === 'canceled'
      ? 'cancelled'
      : 'confirmed';

    var hours = Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes / 60
      : (Number(raw.hours) || 1);

    var lockedCost = raw.quote && Number.isFinite(Number(raw.quote.totalArs))
      ? Number(raw.quote.totalArs)
      : (Number(raw.cost) || 0);

    return Object.assign({}, raw, {
      status: normalizedStatus,
      vehicleType: VEHICLE_TYPES[raw.vehicleType] ? raw.vehicleType : 'car',
      date: date || '',
      arrival: arrival || '10:00',
      departure: departure || formatMinutesToHHMM((parseTimeMinutes(arrival || '10:00', false) || 600) + Math.round(hours * 60)),
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : Math.round(hours * 60),
      hours: hours,
      startMs: startMs,
      endMs: endMs,
      startAt: raw.startAt || (Number.isFinite(startMs) ? getBuenosAiresLocalParts(startMs).dateStr + 'T' + getBuenosAiresLocalParts(startMs).timeStr + ':00' + UTC_OFFSET : null),
      endAt: raw.endAt || (Number.isFinite(endMs) ? getBuenosAiresLocalParts(endMs).dateStr + 'T' + getBuenosAiresLocalParts(endMs).timeStr + ':00' + UTC_OFFSET : null),
      timezone: raw.timezone || TIMEZONE,
      cost: lockedCost
    });
  }

  /* Half-open interval sweep-line: computes maximum simultaneous active bookings
     for garageId within [startMs, endMs).
     On timestamp ties, departures (-1) are processed before arrivals (+1) so
     adjacent half-open bookings [08:00, 11:00) and [11:00, 13:00) never overlap. */
  function getPeakConcurrentBookings(garageId, startMs, endMs, bookings) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return 0;
    }
    var list = Array.isArray(bookings) ? bookings : [];
    var events = [];

    for (var i = 0; i < list.length; i++) {
      var b = normalizeBooking(list[i]);
      if (!b) continue;
      if (b.status !== 'confirmed') continue;
      if (b.garageId !== garageId) continue;
      if (!Number.isFinite(b.startMs) || !Number.isFinite(b.endMs)) continue;
      // Half-open intersection test: [b.startMs, b.endMs) ∩ [startMs, endMs) != ∅
      if (b.startMs < endMs && startMs < b.endMs) {
        var clippedStart = Math.max(b.startMs, startMs);
        var clippedEnd = Math.min(b.endMs, endMs);
        if (clippedStart < clippedEnd) {
          events.push({ time: clippedStart, delta: 1 });
          events.push({ time: clippedEnd, delta: -1 });
        }
      }
    }

    if (events.length === 0) return 0;

    events.sort(function (a, b) {
      if (a.time !== b.time) return a.time - b.time;
      // End (-1) before Start (+1) for half-open [start, end)
      return a.delta - b.delta;
    });

    var current = 0;
    var peak = 0;
    for (var j = 0; j < events.length; j++) {
      current += events[j].delta;
      if (current > peak) peak = current;
    }
    return peak;
  }

  function getIntervalAvailability(garage, interval, bookings) {
    var totalSpaces = garage && Number.isFinite(Number(garage.totalSpaces))
      ? Math.max(0, Math.floor(Number(garage.totalSpaces)))
      : 0;
    if (!garage || !interval || !interval.valid) {
      return {
        totalSpaces: totalSpaces,
        peakConcurrent: 0,
        availableSpaces: 0,
        occupancyRatio: totalSpaces > 0 ? 0 : 1
      };
    }
    var peakConcurrent = getPeakConcurrentBookings(garage.id, interval.startMs, interval.endMs, bookings);
    var availableSpaces = Math.max(0, totalSpaces - peakConcurrent);
    var occupancyRatio = totalSpaces > 0 ? Math.min(1, peakConcurrent / totalSpaces) : 1;
    return {
      totalSpaces: totalSpaces,
      peakConcurrent: peakConcurrent,
      availableSpaces: availableSpaces,
      occupancyRatio: occupancyRatio
    };
  }

  /* ------------------------- Dynamic Pricing Engine (PF-04, R04) ------------------------- */

  function getOccupancyFactor(occupancyRatio) {
    var r = Number.isFinite(occupancyRatio) ? occupancyRatio : 0;
    if (r < 0.50) return 1.00;
    if (r < 0.75) return 1.20;
    return 1.40;
  }

  function isPeakHour(localHour) {
    for (var i = 0; i < PRICING_POLICY.peakHours.length; i++) {
      var range = PRICING_POLICY.peakHours[i];
      if (localHour >= range[0] && localHour < range[1]) return true;
    }
    return false;
  }

  function isWeekendDay(dayOfWeek) {
    return PRICING_POLICY.weekendDays.indexOf(dayOfWeek) !== -1;
  }

  /* Splits [startMs, endMs) along Buenos Aires local clock-hour boundaries. */
  function segmentIntervalByHour(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return [];
    }
    var segments = [];
    var cursor = startMs;
    while (cursor < endMs) {
      var local = getBuenosAiresLocalParts(cursor);
      var minsIntoHour = local.minute;
      var nextHourBoundary = cursor + (60 - minsIntoHour) * MS_PER_MINUTE;
      var segEnd = Math.min(endMs, nextHourBoundary);
      var endLocal = getBuenosAiresLocalParts(segEnd);
      var endTimeLabel = endLocal.dateStr !== local.dateStr && endLocal.timeStr === '00:00'
        ? '24:00'
        : endLocal.timeStr;
      var durationMinutes = Math.round((segEnd - cursor) / MS_PER_MINUTE);

      segments.push({
        startMs: cursor,
        endMs: segEnd,
        date: local.dateStr,
        start: local.timeStr,
        end: endTimeLabel,
        localHour: local.hour,
        dayOfWeek: local.dayOfWeek,
        durationMinutes: durationMinutes,
        durationHours: durationMinutes / 60
      });
      cursor = segEnd;
    }
    return segments;
  }

  /* Computes transparent dynamic quote per hourly segment and rounds the final
     ARS amount exactly once (R04, T06). */
  function calculateDynamicQuote(garage, interval, vehicleType, bookings, quotedAtIso) {
    if (!garage || !interval || !interval.valid) return null;
    var vehicleSpec = VEHICLE_TYPES[vehicleType] || VEHICLE_TYPES.car;
    var baseRatePerHour = Number(garage.ratePerHour) || 0;
    var totalSpaces = Math.max(0, Math.floor(Number(garage.totalSpaces) || 0));
    var rawSegments = segmentIntervalByHour(interval.startMs, interval.endMs);

    var totalExact = 0;
    var baseSubtotal = baseRatePerHour * interval.durationHours;
    var peakSegmentsCount = 0;
    var weekendSegmentsCount = 0;
    var maxOccupancyFactor = 1.00;
    var maxOccupancyRatio = 0;

    var detailedSegments = rawSegments.map(function (seg) {
      var peakInSeg = getPeakConcurrentBookings(garage.id, seg.startMs, seg.endMs, bookings);
      var occRatio = totalSpaces > 0 ? Math.min(1, peakInSeg / totalSpaces) : 1;
      var occupancyFactor = getOccupancyFactor(occRatio);
      var peakFactor = isPeakHour(seg.localHour) ? PRICING_POLICY.peakFactor : 1.00;
      var weekendFactor = isWeekendDay(seg.dayOfWeek) ? PRICING_POLICY.weekendFactor : 1.00;
      var vehicleFactor = vehicleSpec.factor;

      if (peakFactor > 1) peakSegmentsCount++;
      if (weekendFactor > 1) weekendSegmentsCount++;
      if (occupancyFactor > maxOccupancyFactor) maxOccupancyFactor = occupancyFactor;
      if (occRatio > maxOccupancyRatio) maxOccupancyRatio = occRatio;

      var combinedMultiplier = vehicleFactor * occupancyFactor * peakFactor * weekendFactor;
      var subtotalExact = baseRatePerHour * seg.durationHours * combinedMultiplier;
      totalExact += subtotalExact;

      return {
        start: seg.start,
        end: seg.end,
        durationMinutes: seg.durationMinutes,
        durationHours: seg.durationHours,
        peakConcurrent: peakInSeg,
        occupancyRatio: occRatio,
        occupancyFactor: occupancyFactor,
        peakFactor: peakFactor,
        weekendFactor: weekendFactor,
        vehicleFactor: vehicleFactor,
        combinedMultiplier: combinedMultiplier,
        subtotalExact: subtotalExact
      };
    });

    var totalArs = Math.round(totalExact);
    var effectiveMultiplier = baseSubtotal > 0 ? totalExact / baseSubtotal : 1;

    return {
      currency: PRICING_POLICY.currency,
      policyVersion: PRICING_POLICY.version,
      rounding: PRICING_POLICY.rounding,
      quotedAt: quotedAtIso || new Date().toISOString(),
      baseRatePerHour: baseRatePerHour,
      durationMinutes: interval.durationMinutes,
      durationHours: interval.durationHours,
      baseSubtotal: baseSubtotal,
      vehicleType: vehicleSpec.id,
      vehicleFactor: vehicleSpec.factor,
      hasPeak: peakSegmentsCount > 0,
      peakSegmentsCount: peakSegmentsCount,
      hasWeekend: weekendSegmentsCount > 0,
      weekendSegmentsCount: weekendSegmentsCount,
      maxOccupancyRatio: maxOccupancyRatio,
      maxOccupancyFactor: maxOccupancyFactor,
      effectiveMultiplier: effectiveMultiplier,
      totalExact: totalExact,
      totalArs: totalArs,
      segments: detailedSegments
    };
  }

  function cloneQuoteSnapshot(quote) {
    if (!quote) return null;
    return JSON.parse(JSON.stringify(quote));
  }

  /* ------------------------- Full Garage Eligibility ------------------------- */

  function evaluateGarageEligibility(garage, interval, vehicleType, bookings, vehicleHeightM) {
    if (!interval || !interval.valid) {
      return {
        eligible: false,
        reasonCode: interval ? interval.code : 'INVALID_INTERVAL',
        hoursCheck: { compatible: false, code: 'INVALID_INTERVAL' },
        vehicleCheck: validateVehicleCompatibility(garage, vehicleType, vehicleHeightM),
        availability: { totalSpaces: garage.totalSpaces, peakConcurrent: 0, availableSpaces: 0, occupancyRatio: 0 },
        quote: null
      };
    }

    var hoursCheck = isWithinOperatingHours(garage, interval);
    var vehicleCheck = validateVehicleCompatibility(garage, vehicleType, vehicleHeightM);
    var availability = getIntervalAvailability(garage, interval, bookings);
    var quote = calculateDynamicQuote(garage, interval, vehicleType, bookings);

    var eligible = true;
    var reasonCode = 'OK';
    if (!hoursCheck.compatible) {
      eligible = false;
      reasonCode = hoursCheck.code;
    } else if (!vehicleCheck.compatible) {
      eligible = false;
      reasonCode = vehicleCheck.code;
    } else if (availability.availableSpaces <= 0) {
      eligible = false;
      reasonCode = 'NO_AVAILABILITY';
    }

    return {
      eligible: eligible,
      reasonCode: reasonCode,
      hoursCheck: hoursCheck,
      vehicleCheck: vehicleCheck,
      availability: availability,
      quote: quote
    };
  }

  /* ------------------------- Durable Local Storage Adapter (PF-02, T08) ------------------------- */

  function createStorageAdapter(storageImpl, storageKey) {
    return {
      key: storageKey,
      read: function () {
        try {
          if (!storageImpl || typeof storageImpl.getItem !== 'function') {
            return { ok: false, error: 'Storage backend unavailable', data: [] };
          }
          var raw = storageImpl.getItem(storageKey);
          if (!raw) return { ok: true, data: [] };
          var parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            return { ok: true, data: [] };
          }
          return {
            ok: true,
            data: parsed.map(normalizeBooking).filter(Boolean)
          };
        } catch (err) {
          return {
            ok: false,
            error: err && err.message ? err.message : String(err),
            data: []
          };
        }
      },
      write: function (list) {
        try {
          if (!storageImpl || typeof storageImpl.setItem !== 'function') {
            return { ok: false, error: 'Storage backend unavailable' };
          }
          var serialized = JSON.stringify(list);
          storageImpl.setItem(storageKey, serialized);
          // Read-back durability verification
          if (typeof storageImpl.getItem === 'function') {
            var verify = storageImpl.getItem(storageKey);
            if (verify !== serialized) {
              return { ok: false, error: 'Storage verification mismatch' };
            }
          }
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err && err.message ? err.message : String(err)
          };
        }
      }
    };
  }

  function createMemoryStorage() {
    var map = {};
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
      },
      setItem: function (k, v) {
        map[k] = String(v);
      },
      removeItem: function (k) {
        delete map[k];
      }
    };
  }

  /* ------------------------- Submission Guard & Booking Lifecycle (PF-02, T04, T07, T08, T10) ------------------------- */

  function createSubmissionGuard() {
    var inFlight = false;
    var consumedTokens = {};
    return {
      isInFlight: function () { return inFlight; },
      hasConsumed: function (token) { return !!(token && consumedTokens[token]); },
      acquire: function (token) {
        if (inFlight) return { ok: false, code: 'SUBMISSION_IN_PROGRESS' };
        if (token && consumedTokens[token]) return { ok: false, code: 'DUPLICATE_SUBMISSION' };
        inFlight = true;
        return { ok: true };
      },
      complete: function (token, succeeded) {
        if (succeeded && token) consumedTokens[token] = true;
        inFlight = false;
      },
      reset: function () {
        inFlight = false;
        consumedTokens = {};
      }
    };
  }

  function defaultGenerateBookingId(existing) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var taken = {};
    (existing || []).forEach(function (b) { if (b && b.id) taken[b.id] = true; });
    var id = '';
    do {
      id = 'PF-2026-';
      for (var i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (taken[id]);
    return id;
  }

  function createBooking(options) {
    var opts = options || {};
    var guard = opts.submissionGuard || null;
    var token = opts.submissionToken || null;

    if (guard) {
      var lock = guard.acquire(token);
      if (!lock.ok) {
        return { ok: false, code: lock.code };
      }
    }

    var succeeded = false;
    try {
      var garage = opts.garage;
      if (!garage) {
        return { ok: false, code: 'NO_GARAGE_SELECTED' };
      }

      var interval = opts.interval && opts.interval.valid !== undefined
        ? opts.interval
        : validateInterval({
            date: opts.date,
            arrival: opts.arrival,
            departure: opts.departure,
            hours: opts.hours,
            allowPast: opts.allowPast,
            referenceNow: opts.referenceNow
          });

      if (!interval || !interval.valid) {
        return { ok: false, code: interval ? interval.code : 'INVALID_INTERVAL' };
      }

      var hoursCheck = isWithinOperatingHours(garage, interval);
      if (!hoursCheck.compatible) {
        return { ok: false, code: hoursCheck.code, details: hoursCheck };
      }

      var vehicleCheck = validateVehicleCompatibility(garage, opts.vehicleType || 'car', opts.vehicleHeightM);
      if (!vehicleCheck.compatible) {
        return { ok: false, code: vehicleCheck.code, details: vehicleCheck };
      }

      var storage = opts.storageAdapter;
      if (!storage) {
        return { ok: false, code: 'STORAGE_UNAVAILABLE' };
      }

      // Fresh read at confirmation time (PF-02 revalidation)
      var readRes = storage.read();
      if (!readRes.ok) {
        return { ok: false, code: 'STORAGE_READ_FAILED', error: readRes.error };
      }
      var existing = readRes.data;

      var availability = getIntervalAvailability(garage, interval, existing);
      if (availability.availableSpaces <= 0) {
        return { ok: false, code: 'NO_AVAILABILITY', availability: availability };
      }

      var quote = calculateDynamicQuote(garage, interval, vehicleCheck.vehicleType, existing);
      var frozenQuote = cloneQuoteSnapshot(quote);
      var idGen = typeof opts.generateId === 'function' ? opts.generateId : defaultGenerateBookingId;
      var plate = String(opts.plate || '').trim().toUpperCase() || 'AA 000 AA';

      var booking = {
        id: idGen(existing),
        status: 'confirmed',
        garageId: garage.id,
        garage: garage.name,
        address: garage.address,
        plate: plate,
        vehicleType: vehicleCheck.vehicleType,
        vehicleHeightM: vehicleCheck.vehicleHeightM,
        date: interval.date,
        arrival: interval.arrival,
        departure: interval.departure,
        durationMinutes: interval.durationMinutes,
        hours: interval.durationHours,
        startAt: interval.startAt,
        endAt: interval.endAt,
        timezone: TIMEZONE,
        cost: frozenQuote.totalArs,
        quote: frozenQuote,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
        payment: 'simulado',
        source: opts.source || 'user',
        persistenceScope: 'browser_local_storage'
      };

      var nextBookings = [booking].concat(existing);
      var writeRes = storage.write(nextBookings);
      if (!writeRes.ok) {
        return {
          ok: false,
          code: 'STORAGE_WRITE_FAILED',
          error: writeRes.error
        };
      }

      succeeded = true;
      return {
        ok: true,
        code: 'OK',
        booking: booking,
        bookings: nextBookings,
        availabilityAfter: getIntervalAvailability(garage, interval, nextBookings)
      };
    } finally {
      if (guard) {
        guard.complete(token, succeeded);
      }
    }
  }

  function cancelBookingById(bookingId, storageAdapter, reason) {
    if (!storageAdapter) {
      return { ok: false, code: 'STORAGE_UNAVAILABLE' };
    }
    var readRes = storageAdapter.read();
    if (!readRes.ok) {
      return { ok: false, code: 'STORAGE_READ_FAILED', error: readRes.error };
    }
    var list = readRes.data.slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === bookingId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return { ok: false, code: 'BOOKING_NOT_FOUND' };
    }
    if (list[idx].status === 'cancelled') {
      return { ok: false, code: 'ALREADY_CANCELLED', booking: list[idx] };
    }

    var updated = Object.assign({}, list[idx], {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason || 'user_cancelled'
    });
    list[idx] = updated;

    var writeRes = storageAdapter.write(list);
    if (!writeRes.ok) {
      return { ok: false, code: 'STORAGE_WRITE_FAILED', error: writeRes.error };
    }

    return {
      ok: true,
      code: 'OK',
      booking: updated,
      bookings: list
    };
  }

  /* ------------------------- Built-in Isolated QA Scenario Runner (T01–T10) ------------------------- */

  function runCoreAcceptanceScenarios() {
    var results = [];
    var futureWeekday = '2026-12-15'; // Tuesday in BA
    var futureSaturday = '2026-12-19'; // Saturday in BA

    var testGarageCap1 = {
      id: 'qa-garage-cap-1',
      name: 'QA Garage Cap 1',
      address: 'Test 100, CABA',
      ratePerHour: 6000,
      totalSpaces: 1,
      techado: true,
      open24: false,
      operatingHours: { open: '07:00', close: '22:00' },
      acceptedVehicleTypes: ['motorcycle', 'car'],
      maxHeightM: 1.80,
      dataProvenance: 'synthetic_qa'
    };

    var testGarageCap2 = {
      id: 'qa-garage-cap-2',
      name: 'QA Garage Cap 2',
      address: 'Test 200, CABA',
      ratePerHour: 6000,
      totalSpaces: 2,
      techado: true,
      open24: true,
      operatingHours: { open: '00:00', close: '24:00' },
      acceptedVehicleTypes: ['motorcycle', 'car', 'suv', 'van'],
      maxHeightM: 2.50,
      dataProvenance: 'synthetic_qa'
    };

    // T01: capacity 1, reserve 08:00–11:00 and 11:00–13:00; both accepted
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t01');
      var r1 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 101 AA', storageAdapter: store, allowPast: true });
      var r2 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '11:00', departure: '13:00', vehicleType: 'car', plate: 'AA 102 AA', storageAdapter: store, allowPast: true });
      var pass = r1.ok && r2.ok && store.read().data.length === 2;
      results.push({
        id: 'T01',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'b1=' + r1.code + ', b2=' + r2.code + ', stored=' + store.read().data.length
      });
    })();

    // T02: capacity 1, reserve 08:00–11:00 then 10:00–12:00; reject second
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t02');
      var r1 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 201 AA', storageAdapter: store, allowPast: true });
      var r2 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', plate: 'AA 202 AA', storageAdapter: store, allowPast: true });
      var pass = r1.ok && !r2.ok && r2.code === 'NO_AVAILABILITY' && store.read().data.length === 1;
      results.push({
        id: 'T02',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'b1=' + r1.code + ', b2=' + r2.code + ', stored=' + store.read().data.length
      });
    })();

    // T03: capacity 2, existing 08:00–09:00 and 10:00–11:00; request 08:00–11:00 -> accept exactly 1 extra
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t03');
      var e1 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '08:00', departure: '09:00', vehicleType: 'car', plate: 'AA 301 AA', storageAdapter: store, allowPast: true });
      var e2 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '11:00', vehicleType: 'car', plate: 'AA 302 AA', storageAdapter: store, allowPast: true });
      var interval = validateInterval({ date: futureWeekday, arrival: '08:00', departure: '11:00', allowPast: true });
      var availBefore = getIntervalAvailability(testGarageCap2, interval, store.read().data);
      var extra1 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 303 AA', storageAdapter: store, allowPast: true });
      var extra2 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 304 AA', storageAdapter: store, allowPast: true });
      var pass = e1.ok && e2.ok && availBefore.peakConcurrent === 1 && availBefore.availableSpaces === 1 && extra1.ok && !extra2.ok && extra2.code === 'NO_AVAILABILITY';
      results.push({
        id: 'T03',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'peakBefore=' + availBefore.peakConcurrent + ', availBefore=' + availBefore.availableSpaces + ', extra1=' + extra1.code + ', extra2=' + extra2.code
      });
    })();

    // T04: cancel active booking and release interval; retain audit status
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t04');
      var r1 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '11:00', vehicleType: 'car', plate: 'AA 401 AA', storageAdapter: store, allowPast: true });
      var blocked = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '09:00', departure: '10:00', vehicleType: 'car', plate: 'AA 402 AA', storageAdapter: store, allowPast: true });
      var cancelRes = cancelBookingById(r1.booking.id, store, 'qa_test');
      var r2 = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '09:00', departure: '10:00', vehicleType: 'car', plate: 'AA 403 AA', storageAdapter: store, allowPast: true });
      var ledger = store.read().data;
      var cancelledRecord = ledger.find(function (b) { return b.id === r1.booking.id; });
      var pass = r1.ok && !blocked.ok && cancelRes.ok && r2.ok && cancelledRecord && cancelledRecord.status === 'cancelled' && !!cancelledRecord.cancelledAt;
      results.push({
        id: 'T04',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'blocked=' + blocked.code + ', cancel=' + cancelRes.code + ', rebook=' + r2.code + ', retainedStatus=' + (cancelledRecord ? cancelledRecord.status : 'missing')
      });
    })();

    // T05: reject invalid date/time, negative duration, incompatible vehicle and out-of-hours
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t05');
      var badDate = createBooking({ garage: testGarageCap1, date: '2026-02-30', arrival: '08:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var badTime = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '25:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var negDur = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '12:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var badVeh = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '10:00', vehicleType: 'suv', storageAdapter: store, allowPast: true });
      var badHeight = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '08:00', departure: '10:00', vehicleType: 'car', vehicleHeightM: 2.10, storageAdapter: store, allowPast: true });
      var outHours = createBooking({ garage: testGarageCap1, date: futureWeekday, arrival: '21:00', departure: '23:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var pass = !badDate.ok && badDate.code === 'INVALID_DATE' &&
        !badTime.ok && badTime.code === 'INVALID_ARRIVAL_TIME' &&
        !negDur.ok && negDur.code === 'NON_POSITIVE_DURATION' &&
        !badVeh.ok && badVeh.code === 'VEHICLE_TYPE_NOT_ACCEPTED' &&
        !badHeight.ok && badHeight.code === 'HEIGHT_EXCEEDS_CLEARANCE' &&
        !outHours.ok && outHours.code === 'OUT_OF_HOURS' &&
        store.read().data.length === 0;
      results.push({
        id: 'T05',
        status: pass ? 'PASS' : 'FAIL',
        actual: [badDate.code, badTime.code, negDur.code, badVeh.code, badHeight.code, outHours.code].join(', ')
      });
    })();

    // T06: hourly segment quote with peak/weekend/occupancy + car vs SUV + single final rounding
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t06');
      // Add 1 existing booking on 09:00-10:00 -> 50% occupancy on cap 2 (factor 1.20)
      createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '09:00', departure: '10:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var interval = validateInterval({ date: futureWeekday, arrival: '09:00', departure: '11:00', allowPast: true });
      var qCar = calculateDynamicQuote(testGarageCap2, interval, 'car', store.read().data);
      var qSuv = calculateDynamicQuote(testGarageCap2, interval, 'suv', store.read().data);
      // Seg1 (09-10): 6000 * 1.00 * 1.20 * 1.15 * 1.00 = 8280; Seg2 (10-11): 6000 * 1.00 * 1.00 * 1.00 * 1.00 = 6000 -> 14280
      // SUV: Seg1 10764 + Seg2 7800 = 18564
      // Single rounding check on fractional rate:
      var fracGarage = Object.assign({}, testGarageCap2, { ratePerHour: 1001 });
      var wkndInterval = validateInterval({ date: futureSaturday, arrival: '10:00', departure: '12:00', allowPast: true });
      // Each hour: 1001 * 0.65 * 1.00 * 1.00 * 1.10 = 715.715 -> 2h exact = 1431.43 -> single round = 1431 (per-seg round would be 716+716=1432)
      var qFrac = calculateDynamicQuote(fracGarage, wkndInterval, 'motorcycle', []);
      var pass = qCar.totalArs === 14280 && qSuv.totalArs === 18564 && qSuv.totalArs > qCar.totalArs &&
        qCar.segments.length === 2 && qCar.segments[0].peakFactor === 1.15 && qCar.segments[0].occupancyFactor === 1.20 &&
        qFrac.totalArs === 1431 && qFrac.segments[0].weekendFactor === 1.10;
      results.push({
        id: 'T06',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'car=' + qCar.totalArs + ', suv=' + qSuv.totalArs + ', singleRound=' + qFrac.totalArs + ' (exact=' + qFrac.totalExact.toFixed(2) + ')'
      });
    })();

    // T07: changing rate after confirmation cannot change stored price
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t07');
      var mutableGarage = Object.assign({}, testGarageCap2, { ratePerHour: 6000 });
      var r1 = createBooking({ garage: mutableGarage, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var originalPrice = r1.booking.cost;
      mutableGarage.ratePerHour = 12000;
      var reloaded = store.read().data.find(function (b) { return b.id === r1.booking.id; });
      var newQuote = calculateDynamicQuote(mutableGarage, validateInterval({ date: futureWeekday, arrival: '10:00', departure: '12:00', allowPast: true }), 'car', []);
      var pass = r1.ok && originalPrice === 12000 && reloaded.cost === 12000 && reloaded.quote.baseRatePerHour === 6000 && newQuote.totalArs === 24000;
      results.push({
        id: 'T07',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'locked=' + reloaded.cost + ', lockedBase=' + reloaded.quote.baseRatePerHour + ', newRateQuote=' + newQuote.totalArs
      });
    })();

    // T08: storage failure prevents durable confirmation
    (function () {
      var failingStorage = {
        getItem: function () { return '[]'; },
        setItem: function () { throw new Error('QuotaExceededError (simulated)'); }
      };
      var store = createStorageAdapter(failingStorage, 'qa.t08');
      var res = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, allowPast: true });
      var pass = !res.ok && res.code === 'STORAGE_WRITE_FAILED';
      results.push({
        id: 'T08',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'ok=' + res.ok + ', code=' + res.code + ', err=' + res.error
      });
    })();

    // T10: rapid repeated confirm with same submission token creates at most 1 booking
    (function () {
      var store = createStorageAdapter(createMemoryStorage(), 'qa.t10');
      var guard = createSubmissionGuard();
      var token = 'modal-session-1';
      var r1 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, submissionGuard: guard, submissionToken: token, allowPast: true });
      var r2 = createBooking({ garage: testGarageCap2, date: futureWeekday, arrival: '10:00', departure: '12:00', vehicleType: 'car', storageAdapter: store, submissionGuard: guard, submissionToken: token, allowPast: true });
      var pass = r1.ok && !r2.ok && r2.code === 'DUPLICATE_SUBMISSION' && store.read().data.length === 1;
      results.push({
        id: 'T10',
        status: pass ? 'PASS' : 'FAIL',
        actual: 'first=' + r1.code + ', second=' + r2.code + ', stored=' + store.read().data.length
      });
    })();

    return results;
  }

  return {
    TIMEZONE: TIMEZONE,
    UTC_OFFSET: UTC_OFFSET,
    VEHICLE_TYPES: VEHICLE_TYPES,
    VEHICLE_TYPE_LIST: VEHICLE_TYPE_LIST,
    PRICING_POLICY: PRICING_POLICY,
    DEFAULT_GARAGES: DEFAULT_GARAGES,
    getBuenosAiresLocalParts: getBuenosAiresLocalParts,
    getTodayInBuenosAires: getTodayInBuenosAires,
    parseDateParts: parseDateParts,
    parseTimeMinutes: parseTimeMinutes,
    formatMinutesToHHMM: formatMinutesToHHMM,
    toBuenosAiresEpochMs: toBuenosAiresEpochMs,
    toBuenosAiresIso: toBuenosAiresIso,
    validateInterval: validateInterval,
    getGarageOperatingMinutes: getGarageOperatingMinutes,
    isWithinOperatingHours: isWithinOperatingHours,
    validateVehicleCompatibility: validateVehicleCompatibility,
    normalizeBooking: normalizeBooking,
    getPeakConcurrentBookings: getPeakConcurrentBookings,
    getIntervalAvailability: getIntervalAvailability,
    getOccupancyFactor: getOccupancyFactor,
    isPeakHour: isPeakHour,
    isWeekendDay: isWeekendDay,
    segmentIntervalByHour: segmentIntervalByHour,
    calculateDynamicQuote: calculateDynamicQuote,
    cloneQuoteSnapshot: cloneQuoteSnapshot,
    evaluateGarageEligibility: evaluateGarageEligibility,
    createStorageAdapter: createStorageAdapter,
    createMemoryStorage: createMemoryStorage,
    createSubmissionGuard: createSubmissionGuard,
    defaultGenerateBookingId: defaultGenerateBookingId,
    createBooking: createBooking,
    cancelBookingById: cancelBookingById,
    runCoreAcceptanceScenarios: runCoreAcceptanceScenarios
  };
}));
