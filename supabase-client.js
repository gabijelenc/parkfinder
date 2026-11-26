/* ==========================================================================
   parkFinder — Sprint 2C Supabase Backend Client & Sync Adapter
   Public URL & Publishable Key ONLY (never secret/service_role keys).
   - Official @supabase/supabase-js v2 client with secure session persistence
   - Centralized source of truth for catalog, availability, quotes, holds,
     bookings, vehicles, profile, favorites, and notification preferences
   - Explicit error handling & network failure recovery (never silently
     confirms offline bookings as centralized server reservations)
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ParkFinderSupabase = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUPABASE_CONFIG = Object.freeze({
    projectName: 'parkfinder-dev',
    projectRef: 'qerrmfdpxbjwmeprwrbc',
    url: 'https://qerrmfdpxbjwmeprwrbc.supabase.co',
    publishableKey: 'sb_publishable_8QDBhQ5Tm4-9HMkDL_X3RA_AzVGxNUP',
    storageKey: 'parkfinder.supabase.auth',
    businessTimezone: 'America/Argentina/Buenos_Aires',
    defaultHoldMinutes: 10
  });

  var NOTIFICATION_KINDS = Object.freeze([
    'booking_confirmed',
    'reminder_1h',
    'ending_30m',
    'extension_offer',
    'exit_summary',
    'review_prompt'
  ]);

  var client = null;
  var clientOverride = null;
  var authListenerSub = null;
  var backendMode = 'initializing'; // 'supabase' | 'offline_demo' | 'schema_pending' | 'initializing'
  var lastBackendError = null;
  var authStateListeners = [];

  function generateUuidV4() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function isNetworkError(err) {
    if (!err) return false;
    var msg = String(err.message || err.error_description || err).toLowerCase();
    return msg.indexOf('failed to fetch') !== -1 ||
      msg.indexOf('network') !== -1 ||
      msg.indexOf('load failed') !== -1 ||
      msg.indexOf('err_internet_disconnected') !== -1 ||
      msg.indexOf('timeout') !== -1 ||
      msg.indexOf('abort') !== -1;
  }

  function mapDbAmenitiesToUi(amenitiesDb) {
    var src = amenitiesDb || {};
    function tri(val) {
      if (val === true) return true;
      if (val === false) return false;
      return null;
    }
    return {
      covered: tri(src.covered),
      securityCctv: tri(src.security_cctv),
      evCharging: tri(src.ev_charging),
      accessible: tri(src.accessible),
      valet: tri(src.valet),
      open24: tri(src.open_24h)
    };
  }

  function mapServerFacilityToGarage(f, localCore) {
    var amenities = mapDbAmenitiesToUi(f.amenitiesDb);
    var hoursArr = Array.isArray(f.operatingHoursByDay) ? f.operatingHoursByDay : [];
    var is24 = !!f.open24 || (hoursArr.length > 0 && hoursArr.every(function (h) { return !!h.is24Hours; }));
    var firstNormal = hoursArr.find(function (h) { return !h.isClosed && !h.is24Hours && h.open && h.close; });
    var opHours = is24
      ? { open: '00:00', close: '24:00' }
      : (firstNormal ? { open: firstNormal.open, close: firstNormal.close } : { open: '07:00', close: '22:00' });

    // Merge local fallback media if server gallery is empty
    var localFallback = localCore && Array.isArray(localCore.DEFAULT_GARAGES)
      ? localCore.DEFAULT_GARAGES.find(function (g) { return g.id === f.slug; })
      : null;

    var gallery = Array.isArray(f.gallery) && f.gallery.length > 0
      ? f.gallery
      : (localFallback && localFallback.gallery ? localFallback.gallery : []);

    var mainImage = f.mainImage || (localFallback ? localFallback.mainImage : 'assets/garages/obelisco-main.svg');

    return {
      uuid: f.uuid,
      id: f.slug || f.id,
      slug: f.slug || f.id,
      name: f.name,
      address: f.address,
      city: f.city || 'Buenos Aires',
      lat: Number(f.lat),
      lng: Number(f.lng),
      ratePerHour: Number(f.ratePerHour),
      currency: f.currency || 'ARS',
      totalSpaces: Number(f.totalSpaces) || 0,
      maxHeightM: f.maxHeightM !== null && f.maxHeightM !== undefined ? Number(f.maxHeightM) : 2.20,
      techado: amenities.covered === true,
      open24: is24,
      operatingHours: opHours,
      operatingHoursByDay: hoursArr,
      acceptedVehicleTypes: Array.isArray(f.acceptedVehicleTypes) ? f.acceptedVehicleTypes : ['car'],
      amenities: amenities,
      rating: {
        score: f.rating && f.rating.score !== null && f.rating.score !== undefined ? Number(f.rating.score) : 4.2,
        reviewCount: f.rating ? Number(f.rating.reviewCount || 0) : 0,
        provenance: f.dataProvenance || 'synthetic_demo'
      },
      mainImage: mainImage,
      gallery: gallery,
      demoReviews: Array.isArray(f.demoReviews) && f.demoReviews.length > 0
        ? f.demoReviews
        : (localFallback && localFallback.demoReviews ? localFallback.demoReviews : []),
      isDemo: f.isDemo !== false,
      isQa: !!f.isQa,
      dataProvenance: f.dataProvenance || 'synthetic_demo',
      serverEvaluation: f.evaluation || null
    };
  }

  function mapServerBookingToUi(b, localCore) {
    var startMs = b.startsAt ? Date.parse(b.startsAt) : NaN;
    var endMs = b.endsAt ? Date.parse(b.endsAt) : NaN;
    var durMins = Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(1, Math.round((endMs - startMs) / 60000))
      : 60;

    var sp = localCore && Number.isFinite(startMs) ? localCore.getBuenosAiresLocalParts(startMs) : null;
    var ep = localCore && Number.isFinite(endMs) ? localCore.getBuenosAiresLocalParts(endMs) : null;
    var veh = b.vehicleSnapshot || {};

    return {
      uuid: b.id,
      id: b.bookingCode || b.id,
      bookingCode: b.bookingCode || b.id,
      status: b.status,
      uiCategory: b.uiCategory || (b.status === 'completed' ? 'completed' : (['cancelled', 'expired', 'no_show'].indexOf(b.status) !== -1 ? 'cancelled' : 'upcoming')),
      awaitingOperationalClosure: !!b.awaitingOperationalClosure,
      facilityId: b.facilityId,
      garageId: b.facilitySlug || b.facilityId,
      garage: b.facilityName || '',
      address: b.facilityAddress || '',
      lat: Number(b.lat),
      lng: Number(b.lng),
      spaceId: b.spaceId || null,
      spaceLabel: b.spaceLabel || null,
      vehicleId: b.vehicleId || null,
      vehicleSnapshot: veh,
      vehicleType: veh.vehicle_type || 'car',
      vehicleHeightM: veh.height_m ? Number(veh.height_m) : null,
      plate: veh.plate || '—',
      date: sp ? sp.dateStr : '',
      arrivalDate: sp ? sp.dateStr : '',
      departureDate: ep ? ep.dateStr : '',
      isOvernight: !!(sp && ep && sp.dateStr !== ep.dateStr),
      arrival: sp ? sp.timeStr : '',
      departure: ep ? ep.timeStr : '',
      durationMinutes: durMins,
      hours: durMins / 60,
      startMs: startMs,
      endMs: endMs,
      startAt: b.startsAt,
      endAt: b.endsAt,
      timezone: SUPABASE_CONFIG.businessTimezone,
      cost: Number(b.totalAmount || 0),
      totalAmount: Number(b.totalAmount || 0),
      currency: b.currency || 'ARS',
      quote: b.quote || null,
      paymentMethod: b.paymentMethod || 'pay_at_garage',
      paymentStatus: b.paymentStatus || 'pending',
      isTestPayment: b.isTestPayment !== false,
      holdExpiresAt: b.holdExpiresAt || null,
      cancelledAt: b.cancelledAt || null,
      cancellationReason: b.cancellationReason || null,
      cancellationFeeAmount: Number(b.cancellationFeeAmount || 0),
      createdAt: b.createdAt || null,
      events: Array.isArray(b.events) ? b.events : [],
      qrAccessPreview: b.qrAccessPreview || null,
      persistenceScope: 'supabase_centralized'
    };
  }

  function getClient() {
    if (clientOverride) return clientOverride;
    if (client) return client;
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: SUPABASE_CONFIG.storageKey
        }
      });
      return client;
    }
    return null;
  }

  function setClientOverride(mockClient, mode) {
    clientOverride = mockClient || null;
    if (mode) {
      backendMode = mode;
    } else if (mockClient) {
      backendMode = 'supabase';
    }
  }

  function clearClientOverride() {
    clientOverride = null;
  }

  function getBackendMode() {
    return backendMode;
  }

  function setBackendMode(mode, errMsg) {
    backendMode = mode;
    lastBackendError = errMsg || null;
  }

  function getLastError() {
    return lastBackendError;
  }

  function onAuthChange(cb) {
    if (typeof cb === 'function') authStateListeners.push(cb);
  }

  function notifyAuthListeners(event, session) {
    authStateListeners.forEach(function (fn) {
      try { fn(event, session); } catch (e) {}
    });
  }

  async function init(options) {
    var opts = options || {};
    var sb = getClient();
    if (!sb) {
      backendMode = 'offline_demo';
      lastBackendError = 'Supabase SDK unavailable (offline or blocked)';
      return { ok: false, mode: backendMode, reason: lastBackendError };
    }

    if (authListenerSub && typeof authListenerSub.unsubscribe === 'function') {
      try { authListenerSub.unsubscribe(); } catch (e) {}
    }
    if (sb.auth && typeof sb.auth.onAuthStateChange === 'function') {
      var subRes = sb.auth.onAuthStateChange(function (event, session) {
        notifyAuthListeners(event, session);
      });
      if (subRes && subRes.data && subRes.data.subscription) {
        authListenerSub = subRes.data.subscription;
      }
    }

    var session = null;
    try {
      var sessRes = await sb.auth.getSession();
      session = sessRes && sessRes.data ? sessRes.data.session : null;
    } catch (err) {
      if (isNetworkError(err)) {
        backendMode = 'offline_demo';
        lastBackendError = err.message || 'Network unreachable';
        return { ok: false, mode: backendMode, reason: lastBackendError, session: null };
      }
    }

    // Probe backend RPC availability with a lightweight future interval
    if (!opts.skipProbe) {
      var probeStart = opts.probeStartsAt || new Date(Date.now() + 86400000).toISOString();
      var probeEnd = opts.probeEndsAt || new Date(Date.now() + 93600000).toISOString();
      try {
        var rpcRes = await sb.rpc('pf_get_catalog_availability', {
          p_starts_at: probeStart,
          p_ends_at: probeEnd,
          p_vehicle_type: 'car',
          p_vehicle_height_m: null,
          p_include_qa: false
        });
        if (rpcRes.error) {
          var code = String(rpcRes.error.code || '');
          var msg = String(rpcRes.error.message || '');
          if (isNetworkError(rpcRes.error)) {
            backendMode = 'offline_demo';
            lastBackendError = msg;
            return { ok: false, mode: backendMode, reason: msg, session: session };
          }
          // PGRST202 / 42883 means Sprint 2C SQL migrations have not yet been executed on remote Supabase
          if (code === 'PGRST202' || code === '42883' || msg.indexOf('Could not find the function') !== -1) {
            backendMode = 'schema_pending';
            lastBackendError = 'Sprint 2C SQL migrations (01_backend_migration.sql & 02_demo_seed.sql) pending execution in Supabase SQL Editor.';
            return { ok: false, mode: backendMode, reason: lastBackendError, session: session };
          }
          backendMode = 'offline_demo';
          lastBackendError = msg;
          return { ok: false, mode: backendMode, reason: msg, session: session };
        }
        var data = rpcRes.data;
        if (data && data.ok && Array.isArray(data.facilities) && data.facilities.length > 0) {
          backendMode = 'supabase';
          lastBackendError = null;
          return { ok: true, mode: 'supabase', session: session, probeData: data };
        }
        // RPC exists but seed hasn't been executed yet
        if (data && data.ok && Array.isArray(data.facilities) && data.facilities.length === 0) {
          backendMode = 'schema_pending';
          lastBackendError = '02_demo_seed.sql has not been executed yet on Supabase (0 facilities seeded).';
          return { ok: false, mode: backendMode, reason: lastBackendError, session: session };
        }
      } catch (err) {
        backendMode = 'offline_demo';
        lastBackendError = err && err.message ? err.message : String(err);
        return { ok: false, mode: backendMode, reason: lastBackendError, session: session };
      }
    }

    backendMode = 'supabase';
    lastBackendError = null;
    return { ok: true, mode: 'supabase', session: session };
  }

  /* ------------------------- Authentication (Real Supabase Auth Only) ------------------------- */

  async function signUp(params) {
    var sb = getClient();
    if (!sb) return { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'Supabase Auth is unavailable offline.' };
    try {
      var res = await sb.auth.signUp({
        email: String(params.email || '').trim().toLowerCase(),
        password: String(params.password || ''),
        options: {
          data: {
            full_name: String(params.fullName || '').trim(),
            preferred_language: params.preferredLanguage === 'en' ? 'en' : 'es',
            preferred_theme: params.preferredTheme === 'dark' ? 'dark' : 'light'
          }
        }
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'AUTH_ERROR', message: res.error.message };
      }
      var user = res.data ? res.data.user : null;
      var session = res.data ? res.data.session : null;
      return {
        ok: true,
        code: session ? 'SIGNED_IN' : 'CONFIRM_EMAIL_REQUIRED',
        user: user,
        session: session
      };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'AUTH_ERROR', message: err.message || String(err) };
    }
  }

  async function signIn(params) {
    var sb = getClient();
    if (!sb) return { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'Supabase Auth is unavailable offline.' };
    try {
      var res = await sb.auth.signInWithPassword({
        email: String(params.email || '').trim().toLowerCase(),
        password: String(params.password || '')
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'INVALID_CREDENTIALS', message: res.error.message };
      }
      return {
        ok: true,
        code: 'SIGNED_IN',
        user: res.data ? res.data.user : null,
        session: res.data ? res.data.session : null
      };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'AUTH_ERROR', message: err.message || String(err) };
    }
  }

  async function signOut() {
    var sb = getClient();
    if (!sb) return { ok: true };
    try {
      var res = await sb.auth.signOut();
      if (res.error) return { ok: false, code: 'AUTH_ERROR', message: res.error.message };
      return { ok: true, code: 'SIGNED_OUT' };
    } catch (err) {
      return { ok: false, code: 'AUTH_ERROR', message: err.message || String(err) };
    }
  }

  async function resetPassword(email) {
    var sb = getClient();
    if (!sb) return { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'Supabase Auth is unavailable offline.' };
    try {
      var redirectTo = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
        ? window.location.origin + window.location.pathname
        : undefined;
      var res = await sb.auth.resetPasswordForEmail(
        String(email || '').trim().toLowerCase(),
        redirectTo ? { redirectTo: redirectTo } : undefined
      );
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'AUTH_ERROR', message: res.error.message };
      }
      return { ok: true, code: 'RECOVERY_EMAIL_SENT' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'AUTH_ERROR', message: err.message || String(err) };
    }
  }

  /* ------------------------- Catalog & Authoritative Quotes ------------------------- */

  async function fetchCatalogAvailability(params, localCore) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'OFFLINE_MODE' };
    }
    try {
      var res = await sb.rpc('pf_get_catalog_availability', {
        p_starts_at: params.startsAt,
        p_ends_at: params.endsAt,
        p_vehicle_type: params.vehicleType || 'car',
        p_vehicle_height_m: params.vehicleHeightM || null,
        p_include_qa: !!params.includeQa
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      var payload = res.data || {};
      if (!payload.ok) {
        return { ok: false, code: payload.code || 'INVALID_INTERVAL', data: payload };
      }
      var mapped = (payload.facilities || []).map(function (f) {
        return mapServerFacilityToGarage(f, localCore);
      });
      return {
        ok: true,
        code: 'OK',
        serverTime: payload.serverTime,
        holdMinutes: payload.holdMinutes || SUPABASE_CONFIG.defaultHoldMinutes,
        facilities: mapped
      };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  /* ------------------------- Profile, Vehicles, Favorites & Notifications ------------------------- */

  async function loadUserBundle(userId) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false, code: 'AUTH_REQUIRED' };
    try {
      var results = await Promise.all([
        sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
        sb.from('user_roles').select('role').eq('user_id', userId),
        sb.from('vehicles').select('*').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: true }),
        sb.from('favorite_garages').select('facility_id, parking_facilities(slug)').eq('user_id', userId),
        sb.from('favorite_destinations').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        sb.from('notification_preferences').select('kind, enabled').eq('user_id', userId),
        sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(25)
      ]);

      var profile = results[0].data || null;
      var roles = (results[1].data || []).map(function (r) { return r.role; });
      var vehicles = results[2].data || [];
      var favGarages = (results[3].data || []).map(function (fg) {
        return {
          facilityId: fg.facility_id,
          slug: fg.parking_facilities ? fg.parking_facilities.slug : null
        };
      });
      var favDests = (results[4].data || []).map(function (fd) {
        return {
          id: fd.id,
          label: fd.label,
          address: fd.address || '',
          coords: [Number(fd.latitude), Number(fd.longitude)],
          zoneId: fd.zone_id || 'custom'
        };
      });
      var notifPrefs = {};
      NOTIFICATION_KINDS.forEach(function (k) { notifPrefs[k] = true; });
      (results[5].data || []).forEach(function (np) {
        notifPrefs[np.kind] = !!np.enabled;
      });
      var notifications = results[6].data || [];

      return {
        ok: true,
        profile: profile,
        roles: roles.length > 0 ? roles : ['driver'],
        vehicles: vehicles,
        favoriteGarages: favGarages,
        favoriteDestinations: favDests,
        notificationPreferences: notifPrefs,
        notifications: notifications
      };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'LOAD_ERROR', message: err.message || String(err) };
    }
  }

  async function updateProfile(userId, patch) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false, code: 'AUTH_REQUIRED' };
    var allowed = {};
    if (patch.full_name !== undefined) allowed.full_name = String(patch.full_name || '').trim();
    if (patch.phone !== undefined) allowed.phone = String(patch.phone || '').trim() || null;
    if (patch.preferred_language === 'es' || patch.preferred_language === 'en') allowed.preferred_language = patch.preferred_language;
    if (patch.preferred_theme === 'light' || patch.preferred_theme === 'dark') allowed.preferred_theme = patch.preferred_theme;
    if (patch.default_payment_method === 'pay_at_garage' || patch.default_payment_method === 'mercado_pago') {
      allowed.default_payment_method = patch.default_payment_method;
    }
    try {
      var res = await sb.from('profiles').update(allowed).eq('id', userId).select('*').single();
      if (res.error) return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'UPDATE_ERROR', message: res.error.message };
      return { ok: true, profile: res.data };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'UPDATE_ERROR', message: err.message || String(err) };
    }
  }

  async function saveVehicle(userId, vehicle) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false, code: 'AUTH_REQUIRED' };
    var plate = String(vehicle.plate || '').trim().toUpperCase();
    if (!plate || plate.length < 4) {
      return { ok: false, code: 'INVALID_PLATE', message: 'Invalid plate' };
    }
    var vtype = vehicle.vehicle_type || 'car';
    var heightNum = vehicle.height_m !== '' && vehicle.height_m !== null && vehicle.height_m !== undefined
      ? Number(vehicle.height_m)
      : null;
    if (heightNum !== null && (!Number.isFinite(heightNum) || heightNum <= 0 || heightNum > 4.5)) {
      return { ok: false, code: 'INVALID_HEIGHT', message: 'Invalid vehicle height' };
    }

    var row = {
      user_id: userId,
      plate: plate,
      make: String(vehicle.make || '').trim() || null,
      model: String(vehicle.model || '').trim() || null,
      color: String(vehicle.color || '').trim() || null,
      vehicle_type: vtype,
      height_m: heightNum,
      is_default: !!vehicle.is_default
    };

    try {
      var res;
      if (vehicle.id) {
        res = await sb.from('vehicles').update(row).eq('id', vehicle.id).eq('user_id', userId).select('*').single();
      } else {
        res = await sb.from('vehicles').insert(row).select('*').single();
      }
      if (res.error) {
        var code = res.error.code === '23505' ? 'DUPLICATE_PLATE' : (isNetworkError(res.error) ? 'NETWORK_ERROR' : 'VEHICLE_ERROR');
        return { ok: false, code: code, message: res.error.message };
      }
      return { ok: true, vehicle: res.data };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'VEHICLE_ERROR', message: err.message || String(err) };
    }
  }

  async function deleteVehicle(userId, vehicleId) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false, code: 'AUTH_REQUIRED' };
    try {
      var res = await sb.from('vehicles').delete().eq('id', vehicleId).eq('user_id', userId);
      if (res.error) {
        if (res.error.code === '23503') {
          return { ok: false, code: 'VEHICLE_HAS_BOOKINGS', message: res.error.message };
        }
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'VEHICLE_ERROR', message: res.error.message };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'VEHICLE_ERROR', message: err.message || String(err) };
    }
  }

  async function setDefaultVehicle(vehicleId) {
    var sb = getClient();
    if (!sb) return { ok: false, code: 'SERVICE_UNAVAILABLE' };
    try {
      var res = await sb.rpc('pf_set_default_vehicle', { p_vehicle_id: vehicleId });
      if (res.error) return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      return res.data || { ok: false, code: 'UNKNOWN_ERROR' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function syncFavoriteGarage(userId, facilityUuid, isAdding) {
    var sb = getClient();
    if (!sb || !userId || !facilityUuid) return { ok: false, code: 'SKIPPED' };
    try {
      var res = isAdding
        ? await sb.from('favorite_garages').upsert({ user_id: userId, facility_id: facilityUuid }, { onConflict: 'user_id,facility_id' })
        : await sb.from('favorite_garages').delete().eq('user_id', userId).eq('facility_id', facilityUuid);
      if (res.error) return { ok: false, code: 'SYNC_ERROR', message: res.error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) };
    }
  }

  async function syncFavoriteDestination(userId, destObj, isAdding) {
    var sb = getClient();
    if (!sb || !userId || !destObj) return { ok: false, code: 'SKIPPED' };
    try {
      var res;
      if (isAdding) {
        res = await sb.from('favorite_destinations').insert({
          user_id: userId,
          label: destObj.label,
          address: destObj.address || destObj.label,
          latitude: Number(destObj.coords[0]),
          longitude: Number(destObj.coords[1]),
          zone_id: destObj.zoneId || 'custom'
        }).select('*').maybeSingle();
      } else if (destObj.id) {
        res = await sb.from('favorite_destinations').delete().eq('id', destObj.id).eq('user_id', userId);
      } else {
        res = await sb.from('favorite_destinations').delete().eq('user_id', userId).ilike('label', destObj.label);
      }
      if (res.error) return { ok: false, code: 'SYNC_ERROR', message: res.error.message };
      return { ok: true, data: res.data || null };
    } catch (err) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) };
    }
  }

  async function setNotificationPreference(userId, kind, enabled) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false, code: 'AUTH_REQUIRED' };
    try {
      var res = await sb.from('notification_preferences').upsert(
        { user_id: userId, kind: kind, enabled: !!enabled },
        { onConflict: 'user_id,kind' }
      );
      if (res.error) return { ok: false, code: 'SYNC_ERROR', message: res.error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) };
    }
  }

  async function markNotificationRead(userId, notifId) {
    var sb = getClient();
    if (!sb || !userId) return { ok: false, code: 'AUTH_REQUIRED' };
    try {
      var res = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notifId).eq('user_id', userId);
      if (res.error) return { ok: false, code: 'SYNC_ERROR', message: res.error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) };
    }
  }

  /* ------------------------- Centralized Booking Engine RPCs ------------------------- */

  async function createBookingHold(params) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_create_booking_hold', {
        p_facility_id: params.facilityId,
        p_vehicle_id: params.vehicleId,
        p_starts_at: params.startsAt,
        p_ends_at: params.endsAt,
        p_payment_method: params.paymentMethod || 'pay_at_garage',
        p_idempotency_key: params.idempotencyKey || generateUuidV4()
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      return res.data || { ok: false, code: 'EMPTY_RESPONSE' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function confirmBookingDemo(bookingId, paymentMethod) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_confirm_booking_demo', {
        p_booking_id: bookingId,
        p_payment_method: paymentMethod || null
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      return res.data || { ok: false, code: 'EMPTY_RESPONSE' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function cancelBooking(bookingId, reason) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_cancel_booking', {
        p_booking_id: bookingId,
        p_reason: reason || 'user_cancelled'
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      return res.data || { ok: false, code: 'EMPTY_RESPONSE' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function previewBookingExtension(bookingId, newEndsAt) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_preview_booking_extension', {
        p_booking_id: bookingId,
        p_new_ends_at: newEndsAt
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      return res.data || { ok: false, code: 'EMPTY_RESPONSE' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function extendBooking(bookingId, newEndsAt) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_extend_booking', {
        p_booking_id: bookingId,
        p_new_ends_at: newEndsAt
      });
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      return res.data || { ok: false, code: 'EMPTY_RESPONSE' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function getMyBookings(localCore) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE', bookings: [] };
    }
    try {
      var res = await sb.rpc('pf_get_my_bookings');
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message, bookings: [] };
      }
      var data = res.data || {};
      if (!data.ok) return { ok: false, code: data.code || 'ERROR', bookings: [] };
      return {
        ok: true,
        code: 'OK',
        serverTime: data.serverTime,
        bookings: (data.bookings || []).map(function (b) { return mapServerBookingToUi(b, localCore); })
      };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err), bookings: [] };
    }
  }

  async function getMyAnalytics() {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_get_my_analytics');
      if (res.error) {
        return { ok: false, code: isNetworkError(res.error) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: res.error.message };
      }
      return res.data || { ok: false, code: 'EMPTY_RESPONSE' };
    } catch (err) {
      return { ok: false, code: isNetworkError(err) ? 'NETWORK_ERROR' : 'RPC_ERROR', message: err.message || String(err) };
    }
  }

  async function prepareMercadoPagoStub(bookingId) {
    var sb = getClient();
    if (!sb || backendMode !== 'supabase') {
      return { ok: false, code: 'BACKEND_UNAVAILABLE' };
    }
    try {
      var res = await sb.rpc('pf_prepare_mp_checkout_stub', { p_booking_id: bookingId });
      if (res.error) return { ok: false, code: 'RPC_ERROR', message: res.error.message };
      return res.data;
    } catch (err) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) };
    }
  }

  /* ------------------------- Calendar (.ics), Share & CSV Utilities ------------------------- */

  function formatIcsUtc(isoOrMs) {
    var d = new Date(isoOrMs);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function escapeIcsText(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function buildBookingIcs(booking) {
    if (!booking) return '';
    var uid = (booking.bookingCode || booking.id || 'pf') + '@parkfinder.demo';
    var dtStart = formatIcsUtc(booking.startAt || booking.startMs);
    var dtEnd = formatIcsUtc(booking.endAt || booking.endMs);
    var dtStamp = formatIcsUtc(Date.now());
    var summary = 'parkFinder · ' + (booking.garage || 'Estacionamiento');
    var desc = [
      'Código / Code: ' + (booking.bookingCode || booking.id),
      'Vehículo / Vehicle: ' + (booking.vehicleType || 'car') + ' · ' + (booking.plate || ''),
      'Total congelado / Locked total: ARS ' + Math.round(Number(booking.cost || booking.totalAmount || 0)),
      'Modo: ' + (booking.persistenceScope === 'supabase_centralized' ? 'Supabase Demo' : 'Offline Demo')
    ].join('\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//parkFinder//Driver Booking 2C//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + escapeIcsText(uid),
      'DTSTAMP:' + dtStamp,
      'DTSTART:' + dtStart,
      'DTEND:' + dtEnd,
      'SUMMARY:' + escapeIcsText(summary),
      'LOCATION:' + escapeIcsText(booking.address || ''),
      'DESCRIPTION:' + escapeIcsText(desc),
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  function buildBookingShareText(booking, lang) {
    if (!booking) return '';
    var code = booking.bookingCode || booking.id;
    var range = (booking.arrivalDate || booking.date || '') + ' ' + (booking.arrival || '') + ' → ' +
      (booking.departureDate || booking.date || '') + ' ' + (booking.departure || '');
    var total = 'ARS ' + Math.round(Number(booking.cost || booking.totalAmount || 0));
    if (lang === 'en') {
      return 'parkFinder Booking ' + code + ' · ' + booking.garage + ' (' + booking.address + ') · ' +
        range + ' (BA UTC-3) · Plate ' + (booking.plate || '') + ' · Locked total ' + total;
    }
    return 'Reserva parkFinder ' + code + ' · ' + booking.garage + ' (' + booking.address + ') · ' +
      range + ' (BA UTC-3) · Patente ' + (booking.plate || '') + ' · Total congelado ' + total;
  }

  function csvCell(val) {
    var s = String(val === null || val === undefined ? '' : val);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildBookingsCsv(bookings) {
    var headers = [
      'booking_code', 'status', 'garage', 'address', 'starts_at_ba', 'ends_at_ba',
      'duration_hours', 'vehicle_type', 'plate', 'total_ars', 'payment_method',
      'payment_status', 'persistence_scope', 'provenance_note'
    ];
    var rows = [headers.join(',')];
    (bookings || []).forEach(function (b) {
      rows.push([
        b.bookingCode || b.id,
        b.status,
        b.garage,
        b.address,
        (b.arrivalDate || b.date || '') + ' ' + (b.arrival || ''),
        (b.departureDate || b.date || '') + ' ' + (b.departure || ''),
        Number(b.hours || (b.durationMinutes ? b.durationMinutes / 60 : 0)).toFixed(2),
        b.vehicleType || 'car',
        b.plate || '',
        Math.round(Number(b.cost || b.totalAmount || 0)),
        b.paymentMethod || 'pay_at_garage',
        b.paymentStatus || 'simulated_demo',
        b.persistenceScope || 'offline_demo',
        'booked_estimated_demo_not_real_payment'
      ].map(csvCell).join(','));
    });
    return rows.join('\r\n');
  }

  return {
    CONFIG: SUPABASE_CONFIG,
    NOTIFICATION_KINDS: NOTIFICATION_KINDS,
    generateUuidV4: generateUuidV4,
    mapDbAmenitiesToUi: mapDbAmenitiesToUi,
    mapServerFacilityToGarage: mapServerFacilityToGarage,
    mapServerBookingToUi: mapServerBookingToUi,
    getClient: getClient,
    setClientOverride: setClientOverride,
    clearClientOverride: clearClientOverride,
    getBackendMode: getBackendMode,
    setBackendMode: setBackendMode,
    getLastError: getLastError,
    onAuthChange: onAuthChange,
    init: init,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    fetchCatalogAvailability: fetchCatalogAvailability,
    loadUserBundle: loadUserBundle,
    updateProfile: updateProfile,
    saveVehicle: saveVehicle,
    deleteVehicle: deleteVehicle,
    setDefaultVehicle: setDefaultVehicle,
    syncFavoriteGarage: syncFavoriteGarage,
    syncFavoriteDestination: syncFavoriteDestination,
    setNotificationPreference: setNotificationPreference,
    markNotificationRead: markNotificationRead,
    createBookingHold: createBookingHold,
    confirmBookingDemo: confirmBookingDemo,
    cancelBooking: cancelBooking,
    previewBookingExtension: previewBookingExtension,
    extendBooking: extendBooking,
    getMyBookings: getMyBookings,
    getMyAnalytics: getMyAnalytics,
    prepareMercadoPagoStub: prepareMercadoPagoStub,
    buildBookingIcs: buildBookingIcs,
    buildBookingShareText: buildBookingShareText,
    buildBookingsCsv: buildBookingsCsv
  };
}));
