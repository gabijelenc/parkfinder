/* ==========================================================================
   parkFinder — Sprint 2C Driver Backend Integration & Enhanced UX Controller
   Integrates Supabase Auth, RLS Profiles/Vehicles/Favorites/Notifications,
   Authoritative Hold/Confirm/Cancel/Extend Booking Engine, Calendar (.ics),
   Share, Personal Analytics/CSV, and Mercado Pago Sprint 2D Preparation.
   Preserves 100% of Urban Tech Design System & Sprint 1/2A/2B compatibility.
   ========================================================================== */

(function (root) {
  'use strict';

  var S2C_I18N = {
    es: {
      mode: {
        supabase: 'Backend Supabase · Centralizado',
        offline: 'Demo Offline · Solo local',
        pending: 'Supabase · Migraciones pendientes',
        retrying: 'Conectando…',
        retryBtn: 'Reintentar conexión',
        pendingTitle: 'Backend Supabase detectado · Migraciones Sprint 2C pendientes',
        pendingText: 'Ejecutá 01_backend_migration.sql y 02_demo_seed.sql en Supabase SQL Editor para activar el catálogo y motor centralizado. Mientras tanto podés explorar en Modo Demo Offline (local).',
        netErrorTitle: 'Sin conexión con el servidor Supabase',
        netErrorText: 'No se pudo completar la operación en el servidor. No se confirmó ninguna reserva centralizada. Verificá tu conexión e intentá nuevamente.'
      },
      auth: {
        title: 'Tu cuenta parkFinder',
        subtitle: 'Autenticación segura con Supabase Auth para reservas, vehículos y favoritos sincronizados.',
        subtitleForReserve: 'Iniciá sesión o creá tu cuenta para reservar en {garage}. Explorar sigue siendo libre.',
        tabLogin: 'Iniciar sesión',
        tabRegister: 'Crear cuenta',
        tabRecovery: 'Recuperar clave',
        emailLabel: 'Correo electrónico',
        passwordLabel: 'Contraseña',
        nameLabel: 'Nombre completo',
        loginBtn: 'Ingresar',
        registerBtn: 'Crear cuenta',
        recoveryBtn: 'Enviar enlace de recuperación',
        logoutBtn: 'Cerrar sesión',
        signInCta: 'Iniciar sesión / Crear cuenta',
        socialTitle: 'Próximas integraciones de acceso (no activadas aún)',
        googleFuture: 'Google · Próximamente',
        appleFuture: 'Apple · Próximamente',
        confirmEmailNotice: 'Cuenta creada. Revisá tu correo electrónico para confirmar el acceso y luego iniciá sesión.',
        recoverySent: 'Si el correo está registrado, enviamos un enlace de recuperación mediante Supabase Auth.',
        signedInToast: 'Sesión iniciada como {email}.',
        signedOutToast: 'Sesión cerrada correctamente.',
        offlineBlocked: 'El servicio de autenticación real (Supabase Auth) no está disponible sin conexión. No se puede simular un inicio de sesión.',
        weakPassword: 'La contraseña debe tener al menos 6 caracteres.',
        invalidEmail: 'Ingresá un correo electrónico válido.'
      },
      profile2c: {
        tabAccount: 'Cuenta',
        tabVehicles: 'Vehículos',
        tabNotifications: 'Notificaciones',
        tabAnalytics: 'Métricas',
        guestTitle: 'Visitante (sin sesión iniciada)',
        guestDesc: 'Podés buscar y comparar libremente. Iniciá sesión para sincronizar perfil, vehículos, favoritos y reservas en Supabase.',
        rolesLabel: 'Roles asignados',
        fullName: 'Nombre completo',
        phone: 'Teléfono (opcional)',
        defaultPayment: 'Preferencia de pago',
        payGarage: 'Pagar en cochera (demo)',
        payMp: 'Mercado Pago Checkout Pro (prep. Sprint 2D)',
        saveProfileBtn: 'Guardar perfil',
        profileSaved: 'Perfil actualizado y sincronizado.',
        vehiclesEmpty: 'Todavía no cargaste vehículos. Agregá uno para reservar más rápido.',
        addVehicleTitle: 'Agregar vehículo',
        editVehicleTitle: 'Editar vehículo',
        plate: 'Patente',
        make: 'Marca',
        model: 'Modelo',
        color: 'Color',
        type: 'Tipo de vehículo',
        heightM: 'Altura (m)',
        setDefaultLabel: 'Usar como vehículo predeterminado',
        defaultBadge: 'Predeterminado',
        makeDefaultBtn: 'Predeterminar',
        editBtn: 'Editar',
        deleteBtn: 'Eliminar',
        saveVehicleBtn: 'Guardar vehículo',
        cancelEditBtn: 'Cancelar edición',
        vehicleSaved: 'Vehículo guardado correctamente.',
        vehicleDeleted: 'Vehículo eliminado.',
        vehicleHasBookings: 'No se puede eliminar este vehículo porque tiene reservas históricas asociadas (se preservan sus snapshots).',
        duplicatePlate: 'Ya tenés un vehículo registrado con esa patente.',
        notifTitle: 'Preferencias de notificaciones',
        notifSubtitle: 'Sincronizadas con tu cuenta. Simulación in-app (sin push en segundo plano).',
        notifInboxTitle: 'Notificaciones recientes',
        notifInboxEmpty: 'Sin notificaciones todavía.',
        notifMarkRead: 'Marcar leída',
        notifKinds: {
          booking_confirmed: 'Confirmación de reserva',
          reminder_1h: 'Recordatorio 1 hora antes',
          ending_30m: 'Aviso 30 minutos antes de finalizar',
          extension_offer: 'Oferta y confirmación de extensión',
          exit_summary: 'Resumen de salida',
          review_prompt: 'Solicitud de reseña'
        },
        analyticsTitle: 'Resumen personal de uso',
        analyticsNote: 'Distingue montos reservados estimados (demo), pagos simulados y horas estacionadas reales (solo cuando exista evento operativo en Sprint 3).',
        kpiBookedArs: 'Reservado estimado (demo)',
        kpiBookingsCount: 'Reservas confirmadas',
        kpiBookedHours: 'Horas reservadas (est.)',
        kpiActualHours: 'Horas estacionadas reales',
        frequentGarages: 'Estacionamientos frecuentes',
        exportCsvBtn: 'Exportar historial CSV',
        csvExported: 'Historial exportado en formato CSV.'
      },
      checkout: {
        holdActive: 'Reserva temporal activa · Plaza bloqueada en servidor',
        holdExpiring: 'Tu reserva temporal vence pronto',
        holdExpired: 'La reserva temporal venció y la plaza fue liberada para evitar sobreventa.',
        reholdBtn: 'Recotizar y crear nueva reserva temporal',
        selectVehicle: 'Vehículo para esta reserva',
        quickAddVehicle: '+ Cargar vehículo rápido',
        paymentChoiceTitle: 'Medio de pago (Sprint 2C · demostración)',
        payGarageTitle: 'Pagar en cochera',
        payGarageDesc: 'Abonás al llegar (sin cobro online).',
        payMpTitle: 'Mercado Pago (Prep. Sprint 2D)',
        payMpDesc: 'Simulación demo · sin tarjeta ni cobro real.',
        mpNotice: 'No se ingresan datos de tarjetas ni se procesan pagos reales. El cliente nunca puede aprobar una transacción.',
        mpContractBtn: 'Ver contrato técnico Sprint 2D',
        serverScopeBadge: 'Backend Supabase · Demo',
        serverScopeNote: 'Disponibilidad, bloqueo de plaza, reserva temporal (10 min propuestos) y precio dinámico calculados con autoridad en PostgreSQL. Pago simulado de demostración.',
        offlineScopeBadge: 'Modo Demo Offline (solo local)',
        offlineScopeNote: 'Sin conexión con Supabase. Esta reserva se guarda únicamente en localStorage para demostración local y NO constituye una reserva centralizada.',
        creatingHold: 'Reservando plaza temporalmente…',
        confirming: 'Confirmando reserva…',
        holdCreatedToast: 'Plaza bloqueada temporalmente por {mins} minutos.'
      },
      bookings2c: {
        tabAll: 'Todas ({n})',
        tabActive: 'Activas ({n})',
        tabUpcoming: 'Próximas ({n})',
        tabCompleted: 'Completadas ({n})',
        tabCancelled: 'Canceladas ({n})',
        activeSpotlight: 'Estadía activa',
        remainingLabel: 'Restante estimado: {rem}',
        completedEmptyNote: 'Las reservas solo pasan a Completadas mediante un evento operativo válido de check-out (Sprint 3), nunca de forma automática por horario.',
        awaitingClosure: 'Horario transcurrido · pendiente de cierre operativo',
        statusPending: 'Hold temporal',
        statusActive: 'Activa',
        statusConfirmed: 'Confirmada',
        statusCompleted: 'Completada',
        statusCancelled: 'Cancelada',
        statusExpired: 'Vencida',
        extendBtn: 'Extender',
        shareBtn: 'Compartir',
        icsBtn: 'Calendario (.ics)',
        eventsToggle: 'Historial de eventos ({n})',
        sharedToast: 'Detalles de la reserva copiados para compartir.',
        icsToast: 'Archivo de calendario (.ics) descargado.'
      },
      extend: {
        title: 'Extender estadía',
        subtitle: 'Verificamos disponibilidad en servidor y te mostramos el importe incremental antes de confirmar.',
        currentEnd: 'Salida actual (BA)',
        newEndDate: 'Nueva fecha de salida',
        newEndTime: 'Nueva hora de salida',
        previewBtn: 'Verificar disponibilidad y cotizar',
        confirmBtn: 'Confirmar extensión',
        incrementalLabel: 'Importe incremental (ARS)',
        newTotalLabel: 'Nuevo total confirmado (ARS)',
        preservedNote: 'La cotización original se conserva intacta y el cambio queda registrado en el historial de eventos.',
        extendedToast: 'Reserva {code} extendida correctamente (+{inc}).'
      }
    },
    en: {
      mode: {
        supabase: 'Supabase Backend · Centralized',
        offline: 'Offline Demo · Local only',
        pending: 'Supabase · Migrations pending',
        retrying: 'Connecting…',
        retryBtn: 'Retry connection',
        pendingTitle: 'Supabase backend reachable · Sprint 2C migrations pending',
        pendingText: 'Run 01_backend_migration.sql and 02_demo_seed.sql in Supabase SQL Editor to enable the centralized catalog and booking engine. Meanwhile you can explore in Offline Demo Mode (local).',
        netErrorTitle: 'Connection lost with Supabase server',
        netErrorText: 'The server operation could not complete. No centralized booking was confirmed. Check your connection and retry.'
      },
      auth: {
        title: 'Your parkFinder account',
        subtitle: 'Secure authentication via Supabase Auth for synchronized bookings, vehicles, and favorites.',
        subtitleForReserve: 'Sign in or create an account to book {garage}. Browsing stays free without login.',
        tabLogin: 'Sign in',
        tabRegister: 'Create account',
        tabRecovery: 'Reset password',
        emailLabel: 'Email address',
        passwordLabel: 'Password',
        nameLabel: 'Full name',
        loginBtn: 'Sign in',
        registerBtn: 'Create account',
        recoveryBtn: 'Send recovery link',
        logoutBtn: 'Sign out',
        signInCta: 'Sign in / Create account',
        socialTitle: 'Upcoming sign-in providers (not yet activated)',
        googleFuture: 'Google · Coming soon',
        appleFuture: 'Apple · Coming soon',
        confirmEmailNotice: 'Account created. Check your inbox to confirm your email and then sign in.',
        recoverySent: 'If the email is registered, a password recovery link has been sent via Supabase Auth.',
        signedInToast: 'Signed in as {email}.',
        signedOutToast: 'Signed out successfully.',
        offlineBlocked: 'Real authentication (Supabase Auth) is unavailable offline. Sign-in is never simulated.',
        weakPassword: 'Password must be at least 6 characters long.',
        invalidEmail: 'Please enter a valid email address.'
      },
      profile2c: {
        tabAccount: 'Account',
        tabVehicles: 'Vehicles',
        tabNotifications: 'Notifications',
        tabAnalytics: 'Analytics',
        guestTitle: 'Guest (not signed in)',
        guestDesc: 'You can search and compare freely. Sign in to sync profile, vehicles, favorites, and bookings with Supabase.',
        rolesLabel: 'Assigned roles',
        fullName: 'Full name',
        phone: 'Phone (optional)',
        defaultPayment: 'Payment preference',
        payGarage: 'Pay at garage (demo)',
        payMp: 'Mercado Pago Checkout Pro (Sprint 2D prep)',
        saveProfileBtn: 'Save profile',
        profileSaved: 'Profile updated and synced.',
        vehiclesEmpty: 'No saved vehicles yet. Add one for faster bookings.',
        addVehicleTitle: 'Add vehicle',
        editVehicleTitle: 'Edit vehicle',
        plate: 'License plate',
        make: 'Make',
        model: 'Model',
        color: 'Color',
        type: 'Vehicle type',
        heightM: 'Height (m)',
        setDefaultLabel: 'Set as default vehicle',
        defaultBadge: 'Default',
        makeDefaultBtn: 'Set default',
        editBtn: 'Edit',
        deleteBtn: 'Delete',
        saveVehicleBtn: 'Save vehicle',
        cancelEditBtn: 'Cancel edit',
        vehicleSaved: 'Vehicle saved.',
        vehicleDeleted: 'Vehicle deleted.',
        vehicleHasBookings: 'Cannot delete this vehicle because historical bookings reference it (snapshots preserved).',
        duplicatePlate: 'You already have a vehicle with that license plate.',
        notifTitle: 'Notification preferences',
        notifSubtitle: 'Synced with your account. In-app simulation only (no background push).',
        notifInboxTitle: 'Recent notifications',
        notifInboxEmpty: 'No notifications yet.',
        notifMarkRead: 'Mark read',
        notifKinds: {
          booking_confirmed: 'Booking confirmation',
          reminder_1h: '1-hour prior reminder',
          ending_30m: '30-minute ending notice',
          extension_offer: 'Extension offer & confirmation',
          exit_summary: 'Exit summary',
          review_prompt: 'Review request'
        },
        analyticsTitle: 'Personal usage analytics',
        analyticsNote: 'Distinguishes booked estimated totals (demo), simulated payments, and actual parked hours (only counted after operational check-out in Sprint 3).',
        kpiBookedArs: 'Booked estimated (demo)',
        kpiBookingsCount: 'Confirmed bookings',
        kpiBookedHours: 'Booked hours (est.)',
        kpiActualHours: 'Actual parked hours',
        frequentGarages: 'Frequent garages',
        exportCsvBtn: 'Export CSV history',
        csvExported: 'Booking history exported as CSV.'
      },
      checkout: {
        holdActive: 'Temporary hold active · Space locked on server',
        holdExpiring: 'Your temporary hold is expiring soon',
        holdExpired: 'Temporary hold expired and space was released to prevent overbooking.',
        reholdBtn: 'Re-quote & create new hold',
        selectVehicle: 'Vehicle for this booking',
        quickAddVehicle: '+ Quick-add vehicle',
        paymentChoiceTitle: 'Payment method (Sprint 2C · demo)',
        payGarageTitle: 'Pay at garage',
        payGarageDesc: 'Pay upon arrival (no online charge).',
        payMpTitle: 'Mercado Pago (Sprint 2D prep)',
        payMpDesc: 'Demo simulation · no card or real charge.',
        mpNotice: 'No card details are collected and no real payments are processed. Clients can never mark a transaction approved.',
        mpContractBtn: 'View Sprint 2D technical contract',
        serverScopeBadge: 'Supabase Backend · Demo',
        serverScopeNote: 'Availability, space locking, temporary hold (10 min proposed) and dynamic price are computed authoritatively in PostgreSQL. Simulated demo payment.',
        offlineScopeBadge: 'Offline Demo Mode (local only)',
        offlineScopeNote: 'Disconnected from Supabase. Stored in localStorage for local demonstration only — NOT a centralized server booking.',
        creatingHold: 'Holding space on server…',
        confirming: 'Confirming booking…',
        holdCreatedToast: 'Space held temporarily for {mins} minutes.'
      },
      bookings2c: {
        tabAll: 'All ({n})',
        tabActive: 'Active ({n})',
        tabUpcoming: 'Upcoming ({n})',
        tabCompleted: 'Completed ({n})',
        tabCancelled: 'Cancelled ({n})',
        activeSpotlight: 'Active stay',
        remainingLabel: 'Estimated remaining: {rem}',
        completedEmptyNote: 'Bookings only move to Completed after a valid operational check-out event (Sprint 3), never automatically by elapsed time.',
        awaitingClosure: 'Window elapsed · awaiting operational closure',
        statusPending: 'Temporary hold',
        statusActive: 'Active',
        statusConfirmed: 'Confirmed',
        statusCompleted: 'Completed',
        statusCancelled: 'Cancelled',
        statusExpired: 'Expired',
        extendBtn: 'Extend',
        shareBtn: 'Share',
        icsBtn: 'Calendar (.ics)',
        eventsToggle: 'Event history ({n})',
        sharedToast: 'Booking details copied for sharing.',
        icsToast: 'Calendar file (.ics) downloaded.'
      },
      extend: {
        title: 'Extend stay',
        subtitle: 'We verify server availability and show the incremental price before you confirm.',
        currentEnd: 'Current check-out (BA)',
        newEndDate: 'New departure date',
        newEndTime: 'New departure time',
        previewBtn: 'Check availability & quote',
        confirmBtn: 'Confirm extension',
        incrementalLabel: 'Incremental price (ARS)',
        newTotalLabel: 'New confirmed total (ARS)',
        preservedNote: 'The original locked quote is preserved and the change is logged in the event timeline.',
        extendedToast: 'Booking {code} extended (+{inc}).'
      }
    }
  };

  var host = null; // Wired from index.html via ParkFinderSprint2C.attach(ctx)
  var editingVehicleId = null;
  var extendState = { booking: null, preview: null, newDate: '', newTime: '' };
  var serverRefreshSeq = 0;

  function ts(key, vars) {
    var lang = (host && host.state && host.state.lang === 'en') ? 'en' : 'es';
    var parts = key.split('.');
    var node = S2C_I18N[lang];
    for (var i = 0; i < parts.length; i++) {
      node = node && node[parts[i]];
    }
    var out = typeof node === 'string' ? node : key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      });
    }
    return out;
  }

  function Sb() {
    return root.ParkFinderSupabase;
  }

  function Core() {
    return root.ParkFinderCore;
  }

  function isServerMode() {
    return !!(host && host.state.backendMode === 'supabase' && !host.state.offline);
  }

  /* ------------------------- Mode Pill & Sync Banner ------------------------- */

  function updateBackendModeUi() {
    if (!host) return;
    var pill = host.q('#backendModePill');
    var syncBanner = host.q('#backendSyncBanner');
    var mode = host.state.offline ? 'offline_demo' : (host.state.backendMode || 'offline_demo');

    if (pill) {
      pill.classList.remove('is-supabase', 'is-offline', 'is-pending');
      if (mode === 'supabase') {
        pill.classList.add('is-supabase');
        pill.innerHTML = '<i class="mode-pill-dot" aria-hidden="true"></i><span>' + host.escapeHtml(ts('mode.supabase')) + '</span>';
      } else if (mode === 'schema_pending') {
        pill.classList.add('is-pending');
        pill.innerHTML = '<i class="mode-pill-dot" aria-hidden="true"></i><span>' + host.escapeHtml(ts('mode.pending')) + '</span>';
      } else {
        pill.classList.add('is-offline');
        pill.innerHTML = '<i class="mode-pill-dot" aria-hidden="true"></i><span>' + host.escapeHtml(ts('mode.offline')) + '</span>';
      }
    }

    if (syncBanner) {
      if (mode === 'schema_pending' && !host.state.offline) {
        syncBanner.hidden = false;
        var titleEl = host.q('#backendSyncTitle', syncBanner);
        var textEl = host.q('#backendSyncText', syncBanner);
        if (titleEl) titleEl.textContent = ts('mode.pendingTitle');
        if (textEl) textEl.textContent = ts('mode.pendingText');
      } else if (host.state.backendNetError) {
        syncBanner.hidden = false;
        var t2 = host.q('#backendSyncTitle', syncBanner);
        var x2 = host.q('#backendSyncText', syncBanner);
        if (t2) t2.textContent = ts('mode.netErrorTitle');
        if (x2) x2.textContent = ts('mode.netErrorText');
      } else {
        syncBanner.hidden = true;
      }
    }

    // Update profile nav indicator when signed in
    var profBtn = host.q('#profileBtn');
    if (profBtn) {
      var dot = host.q('.nav-user-dot', profBtn);
      if (host.state.user) {
        if (!dot) {
          dot = document.createElement('i');
          dot.className = 'nav-user-dot';
          dot.setAttribute('aria-hidden', 'true');
          profBtn.appendChild(dot);
        }
      } else if (dot) {
        dot.remove();
      }
    }
  }

  /* ------------------------- Bootstrap & Server Catalog Refresh ------------------------- */

  async function initBackend(options) {
    if (!host || !Sb()) return;
    if (host.state.offline) {
      host.state.backendMode = 'offline_demo';
      updateBackendModeUi();
      return { ok: false, mode: 'offline_demo' };
    }

    // Default to a future BA slot when probing so future-date constraints pass cleanly
    var probeStart = new Date(Date.now() + 24 * 3600000);
    probeStart.setUTCMinutes(0, 0, 0);
    var probeEnd = new Date(probeStart.getTime() + 2 * 3600000);

    var initRes = await Sb().init({
      skipProbe: !!(options && options.skipProbe),
      probeStartsAt: probeStart.toISOString(),
      probeEndsAt: probeEnd.toISOString()
    });

    host.state.backendMode = initRes.mode || 'offline_demo';
    host.state.backendNetError = null;
    updateBackendModeUi();

    if (initRes.session && initRes.session.user) {
      host.state.session = initRes.session;
      host.state.user = initRes.session.user;
    }

    if (host.state.backendMode === 'supabase') {
      // Ensure initial search interval is in the future in BA time so immediate booking works cleanly
      ensureFutureDefaultInterval();
      if (host.state.user) {
        await hydrateSignedInUser(host.state.user.id);
      }
      await refreshCatalogFromServer();
    }

    Sb().onAuthChange(function (event, session) {
      host.state.session = session || null;
      host.state.user = session && session.user ? session.user : null;
      updateBackendModeUi();
      if (event === 'SIGNED_IN' && host.state.user && host.state.backendMode === 'supabase') {
        hydrateSignedInUser(host.state.user.id).then(function () {
          refreshCatalogFromServer();
        });
      } else if (event === 'SIGNED_OUT') {
        clearSignedInUserState();
        refreshCatalogFromServer();
      }
    });

    return initRes;
  }

  function ensureFutureDefaultInterval() {
    if (!host || !host.state.interval || !host.state.interval.valid) return;
    if (host.state.interval.startMs <= Date.now() + 5 * 60000) {
      var tomorrowBa = Core().addDaysToDateStr(Core().getTodayInBuenosAires(), 1);
      host.q('#dateInput').value = tomorrowBa;
      host.q('#departureDateInput').value = tomorrowBa;
      host.state.lastSyncedArrivalDate = tomorrowBa;
      host.q('#arrivalInput').value = '10:00';
      host.q('#departureInput').value = '12:00';
      host.readForm();
    }
  }

  function clearSignedInUserState() {
    host.state.session = null;
    host.state.user = null;
    host.state.profile = null;
    host.state.roles = [];
    host.state.vehicles = [];
    host.state.selectedVehicleId = null;
    host.state.notifications = [];
    host.state.serverBookings = [];
    host.state.analytics = null;
    host.updateBookingsCount();
    updateBackendModeUi();
  }

  async function hydrateSignedInUser(userId) {
    if (!isServerMode() || !userId) return;
    var bundle = await Sb().loadUserBundle(userId);
    if (bundle.ok) {
      host.state.profile = bundle.profile;
      host.state.roles = bundle.roles || ['driver'];
      host.state.vehicles = bundle.vehicles || [];
      host.state.notificationPreferences = bundle.notificationPreferences || {};
      host.state.notifications = bundle.notifications || [];

      var defVeh = host.state.vehicles.find(function (v) { return v.is_default; }) || host.state.vehicles[0];
      if (defVeh) {
        host.state.selectedVehicleId = defVeh.id;
      }

      if (bundle.profile) {
        if (bundle.profile.preferred_theme && bundle.profile.preferred_theme !== host.state.theme) {
          host.applyTheme(bundle.profile.preferred_theme, true);
        }
        if (bundle.profile.preferred_language && bundle.profile.preferred_language !== host.state.lang) {
          host.setLanguage(bundle.profile.preferred_language, true);
        }
      }

      // Sync favorite garages & destinations from Supabase (centralized truth)
      host.state.favoriteGarageIds = (bundle.favoriteGarages || [])
        .map(function (fg) { return fg.slug; })
        .filter(Boolean);
      host.state.favoriteDestinations = bundle.favoriteDestinations || [];
      host.updateFavoritesCount();
    }

    await refreshServerBookings();
    updateBackendModeUi();
  }

  async function refreshServerBookings() {
    if (!isServerMode() || !host.state.user) return;
    var res = await Sb().getMyBookings(Core());
    if (res.ok) {
      host.state.serverBookings = res.bookings || [];
      host.state.bookings = host.state.serverBookings;
      host.state.backendNetError = null;
      host.updateBookingsCount();
    } else if (res.code === 'NETWORK_ERROR') {
      host.state.backendNetError = res.message || 'Network error';
    }
    updateBackendModeUi();
  }

  async function refreshCatalogFromServer() {
    if (!isServerMode()) return;
    host.readForm();
    if (!host.state.interval || !host.state.interval.valid) return;
    var seq = ++serverRefreshSeq;
    var selVeh = host.state.vehicles.find(function (v) { return v.id === host.state.selectedVehicleId; });
    var heightM = selVeh && selVeh.vehicle_type === host.state.vehicleType && selVeh.height_m
      ? Number(selVeh.height_m)
      : null;

    var res = await Sb().fetchCatalogAvailability({
      startsAt: host.state.interval.startAt,
      endsAt: host.state.interval.endAt,
      vehicleType: host.state.vehicleType,
      vehicleHeightM: heightM,
      includeQa: !!host.state.sandboxMode
    }, Core());

    if (seq !== serverRefreshSeq) return; // Ignore stale response

    if (res.ok) {
      host.state.backendNetError = null;
      if (host.state.sandboxMode) {
        host.state.serverQaGarages = res.facilities.filter(function (f) { return f.isQa; });
      } else {
        host.state.serverGarages = res.facilities.filter(function (f) { return !f.isQa; });
      }
      host.renderResults(false, true);
    } else if (res.code === 'NETWORK_ERROR') {
      host.state.backendNetError = res.message || 'Network error';
    }
    updateBackendModeUi();
  }

  /* ------------------------- Authentication Modal ------------------------- */

  function openAuthModal(initialTab, pendingGarage) {
    if (!host) return;
    host.state.authTab = initialTab || 'login';
    if (pendingGarage) {
      host.state.pendingReserveGarageId = pendingGarage.id;
      host.state.pendingReserveGarageName = pendingGarage.name;
    } else if (!initialTab) {
      host.state.pendingReserveGarageId = null;
      host.state.pendingReserveGarageName = null;
    }
    renderAuthModal();
    host.openModal('authModal');
  }

  function renderAuthModal(feedback) {
    var container = host.q('#authModal');
    if (!container) return;
    var tab = host.state.authTab || 'login';
    var subText = host.state.pendingReserveGarageName
      ? ts('auth.subtitleForReserve', { garage: host.state.pendingReserveGarageName })
      : ts('auth.subtitle');

    var feedbackHtml = '';
    if (feedback && feedback.error) {
      feedbackHtml = '<div id="authError" class="modal-error" role="alert">' + host.escapeHtml(feedback.error) + '</div>';
    } else if (feedback && feedback.success) {
      feedbackHtml = '<div id="authSuccess" class="modal-success-box" role="status">' + host.escapeHtml(feedback.success) + '</div>';
    }

    var formHtml = '';
    if (tab === 'login') {
      formHtml =
        '<form id="authLoginForm" class="auth-form" novalidate>' +
          '<div class="form-field"><label for="authEmail">' + host.escapeHtml(ts('auth.emailLabel')) + '</label>' +
            '<input id="authEmail" type="email" autocomplete="email" required placeholder="driver@example.com" /></div>' +
          '<div class="form-field"><label for="authPassword">' + host.escapeHtml(ts('auth.passwordLabel')) + '</label>' +
            '<input id="authPassword" type="password" autocomplete="current-password" required placeholder="••••••••" /></div>' +
          '<button type="submit" id="authSubmitBtn" class="btn btn-primary">' + host.escapeHtml(ts('auth.loginBtn')) + '</button>' +
        '</form>';
    } else if (tab === 'register') {
      formHtml =
        '<form id="authRegisterForm" class="auth-form" novalidate>' +
          '<div class="form-field"><label for="authFullName">' + host.escapeHtml(ts('auth.nameLabel')) + '</label>' +
            '<input id="authFullName" type="text" autocomplete="name" required placeholder="Nombre y apellido" /></div>' +
          '<div class="form-field"><label for="authEmail">' + host.escapeHtml(ts('auth.emailLabel')) + '</label>' +
            '<input id="authEmail" type="email" autocomplete="email" required placeholder="nombre@ejemplo.com" /></div>' +
          '<div class="form-field"><label for="authPassword">' + host.escapeHtml(ts('auth.passwordLabel')) + '</label>' +
            '<input id="authPassword" type="password" autocomplete="new-password" minlength="6" required placeholder="Mínimo 6 caracteres" /></div>' +
          '<button type="submit" id="authSubmitBtn" class="btn btn-primary">' + host.escapeHtml(ts('auth.registerBtn')) + '</button>' +
        '</form>';
    } else {
      formHtml =
        '<form id="authRecoveryForm" class="auth-form" novalidate>' +
          '<div class="form-field"><label for="authEmail">' + host.escapeHtml(ts('auth.emailLabel')) + '</label>' +
            '<input id="authEmail" type="email" autocomplete="email" required placeholder="driver@example.com" /></div>' +
          '<button type="submit" id="authSubmitBtn" class="btn btn-primary">' + host.escapeHtml(ts('auth.recoveryBtn')) + '</button>' +
        '</form>';
    }

    container.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">' +
        '<div class="modal-head">' +
          '<div>' +
            '<h3 id="authModalTitle">' + host.escapeHtml(ts('auth.title')) + '</h3>' +
            '<p class="modal-sub">' + host.escapeHtml(subText) + '</p>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-close="authModal" aria-label="' + host.escapeHtml(host.t('common.close')) + '">×</button>' +
        '</div>' +

        '<div class="auth-tabs" role="tablist">' +
          '<button type="button" class="auth-tab" role="tab" data-auth-tab="login" aria-selected="' + (tab === 'login') + '">' + host.escapeHtml(ts('auth.tabLogin')) + '</button>' +
          '<button type="button" class="auth-tab" role="tab" data-auth-tab="register" aria-selected="' + (tab === 'register') + '">' + host.escapeHtml(ts('auth.tabRegister')) + '</button>' +
          '<button type="button" class="auth-tab" role="tab" data-auth-tab="recovery" aria-selected="' + (tab === 'recovery') + '">' + host.escapeHtml(ts('auth.tabRecovery')) + '</button>' +
        '</div>' +

        feedbackHtml +
        formHtml +

        '<div class="auth-social-box">' +
          '<span class="muted small">' + host.escapeHtml(ts('auth.socialTitle')) + '</span>' +
          '<div class="auth-social-row">' +
            '<button type="button" class="btn-social-future" disabled aria-disabled="true">' + host.escapeHtml(ts('auth.googleFuture')) + '</button>' +
            '<button type="button" class="btn-social-future" disabled aria-disabled="true">' + host.escapeHtml(ts('auth.appleFuture')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    Array.prototype.forEach.call(container.querySelectorAll('[data-auth-tab]'), function (btn) {
      btn.addEventListener('click', function () {
        host.state.authTab = btn.getAttribute('data-auth-tab');
        renderAuthModal();
      });
    });

    var loginForm = host.q('#authLoginForm', container);
    if (loginForm) {
      loginForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (host.state.offline || !Sb().getClient()) {
          renderAuthModal({ error: ts('auth.offlineBlocked') });
          return;
        }
        var email = (host.q('#authEmail', container).value || '').trim();
        var password = host.q('#authPassword', container).value || '';
        if (!email || email.indexOf('@') === -1) { renderAuthModal({ error: ts('auth.invalidEmail') }); return; }
        var btn = host.q('#authSubmitBtn', container);
        btn.disabled = true;
        var res = await Sb().signIn({ email: email, password: password });
        if (!res.ok) {
          renderAuthModal({ error: res.message || ts('auth.offlineBlocked') });
          return;
        }
        host.state.session = res.session;
        host.state.user = res.user;
        await hydrateSignedInUser(res.user.id);
        await refreshCatalogFromServer();
        host.closeModal('authModal');
        host.toast(ts('auth.signedInToast', { email: res.user.email || email }), 'ok');
        if (host.state.pendingReserveGarageId) {
          var gid = host.state.pendingReserveGarageId;
          host.state.pendingReserveGarageId = null;
          host.state.pendingReserveGarageName = null;
          var target = host.findGarageById(gid);
          if (target) host.selectGarage(target);
        }
      });
    }

    var regForm = host.q('#authRegisterForm', container);
    if (regForm) {
      regForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (host.state.offline || !Sb().getClient()) {
          renderAuthModal({ error: ts('auth.offlineBlocked') });
          return;
        }
        var fullName = (host.q('#authFullName', container).value || '').trim();
        var email = (host.q('#authEmail', container).value || '').trim();
        var password = host.q('#authPassword', container).value || '';
        if (!email || email.indexOf('@') === -1) { renderAuthModal({ error: ts('auth.invalidEmail') }); return; }
        if (password.length < 6) { renderAuthModal({ error: ts('auth.weakPassword') }); return; }
        var btn = host.q('#authSubmitBtn', container);
        btn.disabled = true;
        var res = await Sb().signUp({
          email: email,
          password: password,
          fullName: fullName,
          preferredLanguage: host.state.lang,
          preferredTheme: host.state.theme
        });
        if (!res.ok) {
          renderAuthModal({ error: res.message || ts('auth.offlineBlocked') });
          return;
        }
        if (res.session && res.user) {
          host.state.session = res.session;
          host.state.user = res.user;
          await hydrateSignedInUser(res.user.id);
          await refreshCatalogFromServer();
          host.closeModal('authModal');
          host.toast(ts('auth.signedInToast', { email: res.user.email || email }), 'ok');
          if (host.state.pendingReserveGarageId) {
            var gid = host.state.pendingReserveGarageId;
            host.state.pendingReserveGarageId = null;
            host.state.pendingReserveGarageName = null;
            var g = host.findGarageById(gid);
            if (g) host.selectGarage(g);
          }
        } else {
          renderAuthModal({ success: ts('auth.confirmEmailNotice') });
        }
      });
    }

    var recForm = host.q('#authRecoveryForm', container);
    if (recForm) {
      recForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (host.state.offline || !Sb().getClient()) {
          renderAuthModal({ error: ts('auth.offlineBlocked') });
          return;
        }
        var email = (host.q('#authEmail', container).value || '').trim();
        if (!email || email.indexOf('@') === -1) { renderAuthModal({ error: ts('auth.invalidEmail') }); return; }
        var res = await Sb().resetPassword(email);
        if (!res.ok) {
          renderAuthModal({ error: res.message });
          return;
        }
        renderAuthModal({ success: ts('auth.recoverySent') });
      });
    }
  }

  /* ------------------------- Profile, Vehicles, Notifications & Analytics Modal ------------------------- */

  function renderProfileModal2C() {
    var container = host.q('#profileModal');
    if (!container) return;
    var tab = host.state.profileTab || 'account';
    var user = host.state.user;
    var prof = host.state.profile || {};
    var roles = host.state.roles && host.state.roles.length ? host.state.roles : ['driver'];
    var initials = ((prof.full_name || (user && user.email) || 'PF').trim().slice(0, 2)).toUpperCase();

    var tabContent = '';
    if (tab === 'account') {
      var accountSection = user
        ? '<div class="account-card">' +
            '<div class="account-meta">' +
              '<div class="account-avatar" aria-hidden="true">' + host.escapeHtml(initials) + '</div>' +
              '<div class="account-meta-text">' +
                '<strong>' + host.escapeHtml(prof.full_name || user.email) + '</strong>' +
                '<span>' + host.escapeHtml(user.email || '') + ' · ' + host.escapeHtml(ts('profile2c.rolesLabel')) + ': ' + host.escapeHtml(roles.join(', ')) + '</span>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-danger-ghost btn-sm" id="profileSignOutBtn">' + host.escapeHtml(ts('auth.logoutBtn')) + '</button>' +
          '</div>' +
          '<form id="profileEditForm" class="auth-form" style="margin-bottom:14px">' +
            '<div class="form-grid-2">' +
              '<div class="form-field"><label for="profFullName">' + host.escapeHtml(ts('profile2c.fullName')) + '</label>' +
                '<input id="profFullName" type="text" value="' + host.escapeHtml(prof.full_name || '') + '" /></div>' +
              '<div class="form-field"><label for="profPhone">' + host.escapeHtml(ts('profile2c.phone')) + '</label>' +
                '<input id="profPhone" type="tel" value="' + host.escapeHtml(prof.phone || '') + '" placeholder="+54 9 11 …" /></div>' +
            '</div>' +
            '<div class="form-field"><label for="profDefaultPay">' + host.escapeHtml(ts('profile2c.defaultPayment')) + '</label>' +
              '<select id="profDefaultPay">' +
                '<option value="pay_at_garage"' + (prof.default_payment_method !== 'mercado_pago' ? ' selected' : '') + '>' + host.escapeHtml(ts('profile2c.payGarage')) + '</option>' +
                '<option value="mercado_pago"' + (prof.default_payment_method === 'mercado_pago' ? ' selected' : '') + '>' + host.escapeHtml(ts('profile2c.payMp')) + '</option>' +
              '</select></div>' +
            '<button type="submit" class="btn btn-primary btn-sm" id="saveProfileBtn">' + host.escapeHtml(ts('profile2c.saveProfileBtn')) + '</button>' +
          '</form>'
        : '<div class="account-card">' +
            '<div class="account-meta">' +
              '<div class="account-avatar" aria-hidden="true">PF</div>' +
              '<div class="account-meta-text">' +
                '<strong>' + host.escapeHtml(ts('profile2c.guestTitle')) + '</strong>' +
                '<span>' + host.escapeHtml(ts('profile2c.guestDesc')) + '</span>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-primary btn-sm" id="profileSignInBtn">' + host.escapeHtml(ts('auth.signInCta')) + '</button>' +
          '</div>';

      tabContent =
        accountSection +
        '<div class="pref-row">' +
          '<div><strong>' + host.escapeHtml(host.t('profile.appearance')) + '</strong><div class="muted small">' + host.escapeHtml(host.t('profile.appearanceDesc')) + '</div></div>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="profileThemeBtn">' + host.escapeHtml(host.state.theme === 'dark' ? host.t('theme.light') : host.t('theme.dark')) + '</button>' +
        '</div>' +
        '<div class="pref-row">' +
          '<div><strong>' + host.escapeHtml(host.t('profile.language')) + '</strong><div class="muted small">' + host.escapeHtml(host.t('profile.languageDesc')) + '</div></div>' +
          '<div style="display:flex;gap:6px">' +
            '<button type="button" class="btn btn-sm ' + (host.state.lang === 'es' ? 'btn-primary' : 'btn-secondary') + '" data-prof-lang="es">ES</button>' +
            '<button type="button" class="btn btn-sm ' + (host.state.lang === 'en' ? 'btn-primary' : 'btn-secondary') + '" data-prof-lang="en">EN</button>' +
          '</div>' +
        '</div>';
    } else if (tab === 'vehicles') {
      if (!user && isServerMode()) {
        tabContent = '<div class="booking-empty"><p>' + host.escapeHtml(ts('profile2c.guestDesc')) + '</p>' +
          '<button type="button" class="btn btn-primary btn-sm" id="vehSignInBtn" style="margin-top:8px">' + host.escapeHtml(ts('auth.signInCta')) + '</button></div>';
      } else {
        var vehicles = host.state.vehicles || [];
        var editTarget = editingVehicleId ? vehicles.find(function (v) { return v.id === editingVehicleId; }) : null;
        var listHtml = vehicles.length === 0
          ? '<div class="booking-empty"><p>' + host.escapeHtml(ts('profile2c.vehiclesEmpty')) + '</p></div>'
          : '<div class="vehicle-list">' + vehicles.map(function (v) {
              var desc = [v.make, v.model, v.color].filter(Boolean).join(' · ');
              var hStr = v.height_m ? Number(v.height_m).toFixed(2) + ' m' : '—';
              return '<div class="vehicle-card' + (v.is_default ? ' is-default' : '') + '" data-vehicle-id="' + host.escapeHtml(v.id) + '">' +
                '<div class="vehicle-card-info">' +
                  '<strong>' + host.escapeHtml(v.plate) + ' · ' + host.escapeHtml(host.t('vehicle.' + v.vehicle_type)) +
                    (v.is_default ? ' <span class="badge badge-func">' + host.escapeHtml(ts('profile2c.defaultBadge')) + '</span>' : '') +
                  '</strong>' +
                  '<span>' + host.escapeHtml((desc || '—') + ' · ' + ts('profile2c.heightM') + ': ' + hStr) + '</span>' +
                '</div>' +
                '<div class="vehicle-card-actions">' +
                  (!v.is_default ? '<button type="button" class="btn btn-secondary btn-sm" data-veh-default="' + host.escapeHtml(v.id) + '">' + host.escapeHtml(ts('profile2c.makeDefaultBtn')) + '</button>' : '') +
                  '<button type="button" class="btn btn-ghost btn-sm" data-veh-edit="' + host.escapeHtml(v.id) + '">' + host.escapeHtml(ts('profile2c.editBtn')) + '</button>' +
                  '<button type="button" class="btn btn-danger-ghost btn-sm" data-veh-del="' + host.escapeHtml(v.id) + '">' + host.escapeHtml(ts('profile2c.deleteBtn')) + '</button>' +
                '</div>' +
              '</div>';
            }).join('') + '</div>';

        var formTitle = editTarget ? ts('profile2c.editVehicleTitle') : ts('profile2c.addVehicleTitle');
        tabContent =
          listHtml +
          '<form id="vehicleForm" class="auth-form" style="padding-top:10px;border-top:1px dashed var(--border-strong)">' +
            '<div class="detail-section-title">' + host.escapeHtml(formTitle) + '</div>' +
            '<div id="vehicleFormError" class="modal-error" role="alert" hidden></div>' +
            '<div class="form-grid-2">' +
              '<div class="form-field"><label for="vehPlate">' + host.escapeHtml(ts('profile2c.plate')) + '</label>' +
                '<input id="vehPlate" type="text" maxlength="12" required value="' + host.escapeHtml(editTarget ? editTarget.plate : '') + '" placeholder="AA 123 BB" /></div>' +
              '<div class="form-field"><label for="vehType">' + host.escapeHtml(ts('profile2c.type')) + '</label>' +
                '<select id="vehType">' +
                  ['motorcycle', 'car', 'suv', 'van'].map(function (vt) {
                    var sel = (editTarget ? editTarget.vehicle_type : host.state.vehicleType) === vt ? ' selected' : '';
                    return '<option value="' + vt + '"' + sel + '>' + host.escapeHtml(host.t('vehicle.option.' + vt)) + '</option>';
                  }).join('') +
                '</select></div>' +
              '<div class="form-field"><label for="vehMake">' + host.escapeHtml(ts('profile2c.make')) + '</label>' +
                '<input id="vehMake" type="text" value="' + host.escapeHtml(editTarget && editTarget.make ? editTarget.make : '') + '" placeholder="Toyota" /></div>' +
              '<div class="form-field"><label for="vehModel">' + host.escapeHtml(ts('profile2c.model')) + '</label>' +
                '<input id="vehModel" type="text" value="' + host.escapeHtml(editTarget && editTarget.model ? editTarget.model : '') + '" placeholder="Corolla" /></div>' +
              '<div class="form-field"><label for="vehColor">' + host.escapeHtml(ts('profile2c.color')) + '</label>' +
                '<input id="vehColor" type="text" value="' + host.escapeHtml(editTarget && editTarget.color ? editTarget.color : '') + '" placeholder="Gris" /></div>' +
              '<div class="form-field"><label for="vehHeight">' + host.escapeHtml(ts('profile2c.heightM')) + '</label>' +
                '<input id="vehHeight" type="number" step="0.05" min="0.50" max="4.00" value="' + host.escapeHtml(editTarget && editTarget.height_m ? editTarget.height_m : Core().VEHICLE_TYPES[host.state.vehicleType].defaultHeightM) + '" /></div>' +
            '</div>' +
            '<label class="notif-pref-row" for="vehDefault">' +
              '<span>' + host.escapeHtml(ts('profile2c.setDefaultLabel')) + '</span>' +
              '<input id="vehDefault" type="checkbox"' + ((editTarget ? editTarget.is_default : vehicles.length === 0) ? ' checked' : '') + ' />' +
            '</label>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<button type="submit" class="btn btn-primary btn-sm" id="saveVehicleBtn">' + host.escapeHtml(ts('profile2c.saveVehicleBtn')) + '</button>' +
              (editTarget ? '<button type="button" class="btn btn-ghost btn-sm" id="cancelVehicleEditBtn">' + host.escapeHtml(ts('profile2c.cancelEditBtn')) + '</button>' : '') +
            '</div>' +
          '</form>';
      }
    } else if (tab === 'notifications') {
      var prefs = host.state.notificationPreferences || {};
      var kindsHtml = Sb().NOTIFICATION_KINDS.map(function (k) {
        var checked = prefs[k] !== false;
        return '<label class="notif-pref-row" for="np_' + k + '">' +
          '<span>' + host.escapeHtml(ts('profile2c.notifKinds.' + k)) + '</span>' +
          '<input type="checkbox" id="np_' + k + '" data-notif-kind="' + k + '"' + (checked ? ' checked' : '') + ' />' +
        '</label>';
      }).join('');

      var inbox = host.state.notifications || [];
      var inboxHtml = inbox.length === 0
        ? '<p class="muted small">' + host.escapeHtml(ts('profile2c.notifInboxEmpty')) + '</p>'
        : '<div class="notif-inbox">' + inbox.map(function (n) {
            return '<div class="notif-item' + (!n.read_at ? ' is-unread' : '') + '">' +
              '<div><div>' + host.escapeHtml(n.message) + '</div><div class="muted small">' + host.escapeHtml((n.created_at || '').slice(0, 16).replace('T', ' ')) + '</div></div>' +
              (!n.read_at ? '<button type="button" class="btn btn-ghost btn-sm" data-mark-read="' + host.escapeHtml(n.id) + '">' + host.escapeHtml(ts('profile2c.notifMarkRead')) + '</button>' : '') +
            '</div>';
          }).join('') + '</div>';

      tabContent =
        '<div class="detail-section-title">' + host.escapeHtml(ts('profile2c.notifTitle')) + '</div>' +
        '<p class="muted small" style="margin-bottom:10px">' + host.escapeHtml(ts('profile2c.notifSubtitle')) + '</p>' +
        '<div class="notif-pref-list">' + kindsHtml + '</div>' +
        '<div class="detail-section-title">' + host.escapeHtml(ts('profile2c.notifInboxTitle')) + '</div>' +
        inboxHtml;
    } else if (tab === 'analytics') {
      var list = host.getBookings();
      var summary = computeLocalOrServerAnalytics(list, host.state.analytics);
      var freqHtml = summary.frequentGarages.length === 0
        ? '<p class="muted small">—</p>'
        : '<div class="fav-list">' + summary.frequentGarages.map(function (fg) {
            return '<div class="fav-item"><div class="fav-item-body"><strong>' + host.escapeHtml(fg.facilityName) + '</strong><span>' + fg.visits + ' · ' + host.formatArs(fg.totalArs) + '</span></div></div>';
          }).join('') + '</div>';

      tabContent =
        '<div class="detail-section-title">' + host.escapeHtml(ts('profile2c.analyticsTitle')) + '</div>' +
        '<p class="muted small" style="margin-bottom:10px">' + host.escapeHtml(ts('profile2c.analyticsNote')) + '</p>' +
        '<div class="analytics-kpis">' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(ts('profile2c.kpiBookedArs')) + '</span><strong>' + host.formatArs(summary.bookedEstimatedArs) + '</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(host.state.lang === 'en' ? 'Pending payment' : 'Pendiente de pago') + '</span><strong>' + host.formatArs(summary.amountPendingArs) + '</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(host.state.lang === 'en' ? 'Simulated demo paid' : 'Pagado simulado demo') + '</span><strong>' + host.formatArs(summary.simulatedPaidArs) + '</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(host.state.lang === 'en' ? 'Externally approved' : 'Aprobado por proveedor') + '</span><strong>' + host.formatArs(summary.externallyApprovedArs) + '</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(host.state.lang === 'en' ? 'Refunded' : 'Reembolsado') + '</span><strong>' + host.formatArs(summary.refundedArs) + '</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(ts('profile2c.kpiBookingsCount')) + '</span><strong>' + summary.activeOrConfirmedCount + '</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(ts('profile2c.kpiBookedHours')) + '</span><strong>' + summary.bookedEstimatedHours + ' h</strong></div>' +
          '<div class="analytics-kpi"><span>' + host.escapeHtml(ts('profile2c.kpiActualHours')) + '</span><strong>' + (summary.actualParkedHours === null ? (host.state.lang === 'en' ? 'Unavailable' : 'No disponible') : summary.actualParkedHours + ' h') + '</strong></div>' +
        '</div>' +
        '<div class="detail-section-title">' + host.escapeHtml(ts('profile2c.frequentGarages')) + '</div>' +
        freqHtml +
        '<div style="margin-top:12px">' +
          '<button type="button" class="btn btn-secondary btn-sm" id="exportCsvBtn">' + host.escapeHtml(ts('profile2c.exportCsvBtn')) + '</button>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">' +
        '<div class="modal-head">' +
          '<div>' +
            '<h3 id="profileModalTitle">' + host.escapeHtml(host.t('profile.title')) + '</h3>' +
            '<p class="modal-sub">' + host.escapeHtml(isServerMode() ? ts('mode.supabase') : ts('mode.offline')) + '</p>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-close="profileModal" aria-label="' + host.escapeHtml(host.t('common.close')) + '">×</button>' +
        '</div>' +

        '<div class="profile-tabs" role="tablist">' +
          '<button type="button" class="profile-tab" role="tab" data-prof-tab="account" aria-selected="' + (tab === 'account') + '">' + host.escapeHtml(ts('profile2c.tabAccount')) + '</button>' +
          '<button type="button" class="profile-tab" role="tab" data-prof-tab="vehicles" aria-selected="' + (tab === 'vehicles') + '">' + host.escapeHtml(ts('profile2c.tabVehicles')) + '</button>' +
          '<button type="button" class="profile-tab" role="tab" data-prof-tab="notifications" aria-selected="' + (tab === 'notifications') + '">' + host.escapeHtml(ts('profile2c.tabNotifications')) + '</button>' +
          '<button type="button" class="profile-tab" role="tab" data-prof-tab="analytics" aria-selected="' + (tab === 'analytics') + '">' + host.escapeHtml(ts('profile2c.tabAnalytics')) + '</button>' +
        '</div>' +

        tabContent +

        '<div class="modal-actions">' +
          '<button class="btn btn-primary" type="button" data-close="profileModal">' + host.escapeHtml(host.t('common.done')) + '</button>' +
        '</div>' +
      '</div>';

    // Wire tab switching
    Array.prototype.forEach.call(container.querySelectorAll('[data-prof-tab]'), function (btn) {
      btn.addEventListener('click', function () {
        host.state.profileTab = btn.getAttribute('data-prof-tab');
        if (host.state.profileTab === 'analytics' && isServerMode() && host.state.user) {
          Sb().getMyAnalytics().then(function (r) {
            if (r && r.ok) host.state.analytics = r;
            renderProfileModal2C();
          });
        } else {
          renderProfileModal2C();
        }
      });
    });

    // Wire Account controls
    var themeBtn = host.q('#profileThemeBtn', container);
    if (themeBtn) themeBtn.addEventListener('click', host.toggleTheme);
    Array.prototype.forEach.call(container.querySelectorAll('[data-prof-lang]'), function (btn) {
      btn.addEventListener('click', function () { host.setLanguage(btn.getAttribute('data-prof-lang')); });
    });
    var signInBtn = host.q('#profileSignInBtn', container) || host.q('#vehSignInBtn', container);
    if (signInBtn) {
      signInBtn.addEventListener('click', function () {
        host.closeModal('profileModal');
        openAuthModal('login');
      });
    }
    var signOutBtn = host.q('#profileSignOutBtn', container);
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async function () {
        await Sb().signOut();
        clearSignedInUserState();
        host.toast(ts('auth.signedOutToast'), 'ok');
        renderProfileModal2C();
      });
    }
    var profForm = host.q('#profileEditForm', container);
    if (profForm) {
      profForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var patch = {
          full_name: host.q('#profFullName', container).value,
          phone: host.q('#profPhone', container).value,
          default_payment_method: host.q('#profDefaultPay', container).value,
          preferred_language: host.state.lang,
          preferred_theme: host.state.theme
        };
        if (isServerMode() && host.state.user) {
          var r = await Sb().updateProfile(host.state.user.id, patch);
          if (!r.ok) { host.toast(r.message || 'Error', 'err'); return; }
          host.state.profile = r.profile;
        }
        host.toast(ts('profile2c.profileSaved'), 'ok');
        renderProfileModal2C();
      });
    }

    // Wire Vehicle CRUD
    var vehTypeSel = host.q('#vehType', container);
    if (vehTypeSel) {
      vehTypeSel.addEventListener('change', function () {
        var spec = Core().VEHICLE_TYPES[vehTypeSel.value];
        if (spec && host.q('#vehHeight', container)) {
          host.q('#vehHeight', container).value = spec.defaultHeightM;
        }
      });
    }
    var vehForm = host.q('#vehicleForm', container);
    if (vehForm) {
      vehForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var errBox = host.q('#vehicleFormError', container);
        var payload = {
          id: editingVehicleId || null,
          plate: host.q('#vehPlate', container).value,
          make: host.q('#vehMake', container).value,
          model: host.q('#vehModel', container).value,
          color: host.q('#vehColor', container).value,
          vehicle_type: host.q('#vehType', container).value,
          height_m: host.q('#vehHeight', container).value,
          is_default: host.q('#vehDefault', container).checked
        };
        if (isServerMode() && host.state.user) {
          var res = await Sb().saveVehicle(host.state.user.id, payload);
          if (!res.ok) {
            errBox.textContent = res.code === 'DUPLICATE_PLATE' ? ts('profile2c.duplicatePlate') : (res.message || res.code);
            errBox.hidden = false;
            return;
          }
          editingVehicleId = null;
          await hydrateSignedInUser(host.state.user.id);
          host.toast(ts('profile2c.vehicleSaved'), 'ok');
          renderProfileModal2C();
        } else {
          // Offline demo local vehicle list (explicitly non-centralized)
          var plate = String(payload.plate || '').trim().toUpperCase();
          if (!plate || plate.length < 4) { errBox.textContent = 'Patente inválida'; errBox.hidden = false; return; }
          var list = (host.state.vehicles || []).slice();
          if (payload.is_default) list.forEach(function (x) { x.is_default = false; });
          if (payload.id) {
            list = list.map(function (x) { return x.id === payload.id ? Object.assign({}, x, payload, { plate: plate }) : x; });
          } else {
            list.push(Object.assign({}, payload, { id: 'local-veh-' + Date.now(), plate: plate }));
          }
          host.state.vehicles = list;
          editingVehicleId = null;
          host.toast(ts('profile2c.vehicleSaved'), 'ok');
          renderProfileModal2C();
        }
      });
    }
    var cancelEditBtn = host.q('#cancelVehicleEditBtn', container);
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', function () { editingVehicleId = null; renderProfileModal2C(); });
    }
    Array.prototype.forEach.call(container.querySelectorAll('[data-veh-edit]'), function (btn) {
      btn.addEventListener('click', function () { editingVehicleId = btn.getAttribute('data-veh-edit'); renderProfileModal2C(); });
    });
    Array.prototype.forEach.call(container.querySelectorAll('[data-veh-default]'), function (btn) {
      btn.addEventListener('click', async function () {
        var vid = btn.getAttribute('data-veh-default');
        if (isServerMode() && host.state.user) {
          await Sb().setDefaultVehicle(vid);
          await hydrateSignedInUser(host.state.user.id);
        } else {
          host.state.vehicles.forEach(function (v) { v.is_default = (v.id === vid); });
        }
        renderProfileModal2C();
      });
    });
    Array.prototype.forEach.call(container.querySelectorAll('[data-veh-del]'), function (btn) {
      btn.addEventListener('click', async function () {
        var vid = btn.getAttribute('data-veh-del');
        if (isServerMode() && host.state.user) {
          var res = await Sb().deleteVehicle(host.state.user.id, vid);
          if (!res.ok) {
            host.toast(res.code === 'VEHICLE_HAS_BOOKINGS' ? ts('profile2c.vehicleHasBookings') : (res.message || res.code), 'warn');
            return;
          }
          await hydrateSignedInUser(host.state.user.id);
        } else {
          host.state.vehicles = host.state.vehicles.filter(function (v) { return v.id !== vid; });
        }
        host.toast(ts('profile2c.vehicleDeleted'), 'ok');
        renderProfileModal2C();
      });
    });

    // Wire Notification preferences & inbox
    Array.prototype.forEach.call(container.querySelectorAll('[data-notif-kind]'), function (cb) {
      cb.addEventListener('change', async function () {
        var k = cb.getAttribute('data-notif-kind');
        host.state.notificationPreferences[k] = cb.checked;
        if (isServerMode() && host.state.user) {
          await Sb().setNotificationPreference(host.state.user.id, k, cb.checked);
        }
      });
    });
    Array.prototype.forEach.call(container.querySelectorAll('[data-mark-read]'), function (btn) {
      btn.addEventListener('click', async function () {
        var nid = btn.getAttribute('data-mark-read');
        if (isServerMode() && host.state.user) {
          await Sb().markNotificationRead(host.state.user.id, nid);
          await hydrateSignedInUser(host.state.user.id);
          renderProfileModal2C();
        }
      });
    });

    // Wire CSV Export
    var csvBtn = host.q('#exportCsvBtn', container);
    if (csvBtn) {
      csvBtn.addEventListener('click', function () {
        exportBookingsCsv();
      });
    }
  }

  function computeLocalOrServerAnalytics(bookings, serverAnalytics) {
    if (serverAnalytics && serverAnalytics.ok && serverAnalytics.summary) {
      return {
        bookedEstimatedArs: Number(serverAnalytics.summary.bookedEstimatedArs || 0),
        amountPendingArs: Number(serverAnalytics.summary.amountPendingArs || 0),
        simulatedPaidArs: Number(serverAnalytics.summary.simulatedPaidArs || 0),
        externallyApprovedArs: Number(serverAnalytics.summary.externallyApprovedArs || 0),
        refundedArs: Number(serverAnalytics.summary.refundedArs || 0),
        activeOrConfirmedCount: Number(serverAnalytics.summary.activeOrConfirmedCount || 0),
        bookedEstimatedHours: Number(serverAnalytics.summary.bookedEstimatedHours || 0),
        actualParkedHours: null,
        frequentGarages: serverAnalytics.frequentGarages || []
      };
    }
    var active = (bookings || []).filter(function (b) { return b.status === 'confirmed' || b.status === 'checked_in' || b.status === 'completed'; });
    var ars = 0;
    var hrs = 0;
    var byGarage = {};
    active.forEach(function (b) {
      var c = Number(b.cost || b.totalAmount || 0);
      var h = Number(b.hours || (b.durationMinutes ? b.durationMinutes / 60 : 0));
      ars += c;
      hrs += h;
      var key = b.garage || b.garageId || 'Garage';
      if (!byGarage[key]) byGarage[key] = { facilityName: key, visits: 0, totalArs: 0 };
      byGarage[key].visits++;
      byGarage[key].totalArs += c;
    });
    var freq = Object.keys(byGarage).map(function (k) { return byGarage[k]; })
      .sort(function (a, b) { return b.visits - a.visits; }).slice(0, 5);
    return {
      bookedEstimatedArs: Math.round(ars),
      amountPendingArs: 0,
      simulatedPaidArs: 0,
      externallyApprovedArs: 0,
      refundedArs: 0,
      activeOrConfirmedCount: active.length,
      bookedEstimatedHours: Math.round(hrs * 100) / 100,
      actualParkedHours: null,
      frequentGarages: freq
    };
  }

  function triggerDownload(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  function exportBookingsCsv() {
    var csv = Sb().buildBookingsCsv(host.getBookings());
    triggerDownload('parkfinder-bookings.csv', csv, 'text/csv;charset=utf-8;');
    host.toast(ts('profile2c.csvExported'), 'ok');
    return csv;
  }

  function downloadBookingIcs(booking) {
    var ics = Sb().buildBookingIcs(booking);
    var code = (booking && (booking.bookingCode || booking.id)) || 'booking';
    triggerDownload('parkfinder-' + code + '.ics', ics, 'text/calendar;charset=utf-8;');
    host.toast(ts('bookings2c.icsToast'), 'ok');
    return ics;
  }

  function shareBooking(booking) {
    var text = Sb().buildBookingShareText(booking, host.state.lang);
    if (navigator.share) {
      navigator.share({ title: 'parkFinder', text: text }).catch(function () {
        host.copyText(text);
        host.toast(ts('bookings2c.sharedToast'), 'ok');
      });
    } else {
      host.copyText(text);
      host.toast(ts('bookings2c.sharedToast'), 'ok');
    }
    return text;
  }

  /* ------------------------- Centralized Server Hold & Confirm Checkout ------------------------- */

  function stopHoldCountdown() {
    if (host && host.state.holdCountdownTimer) {
      clearInterval(host.state.holdCountdownTimer);
      host.state.holdCountdownTimer = null;
    }
  }

  function formatRemainingMMSS(ms) {
    var secs = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function openServerReserveModal(garage) {
    stopHoldCountdown();
    host.state.currentGarage = garage;
    host.state.activeHold = null;
    host.state.checkoutPaymentMethod = (host.state.profile && host.state.profile.default_payment_method) || 'pay_at_garage';
    host.state.checkoutIdempotencyKey = Sb().generateUuidV4();
    renderServerReserveModal(garage);
    host.openModal('reserveModal');

    // Automatically create temporary hold if user already has a matching vehicle
    var matchingVeh = pickBestVehicleForCheckout();
    if (matchingVeh) {
      host.state.selectedVehicleId = matchingVeh.id;
      createHoldForCurrentCheckout(garage, matchingVeh.id);
    }
  }

  function pickBestVehicleForCheckout() {
    var vehicles = host.state.vehicles || [];
    if (vehicles.length === 0) return null;
    var exactDefault = vehicles.find(function (v) { return v.is_default && v.vehicle_type === host.state.vehicleType; });
    if (exactDefault) return exactDefault;
    var exactAny = vehicles.find(function (v) { return v.vehicle_type === host.state.vehicleType; });
    if (exactAny) return exactAny;
    return vehicles.find(function (v) { return v.is_default; }) || vehicles[0];
  }

  async function createHoldForCurrentCheckout(garage, vehicleId) {
    stopHoldCountdown();
    var container = host.q('#reserveModal');
    var errBox = host.q('#reserveError', container);
    if (errBox) errBox.hidden = true;

    var confirmBtn = host.q('#reserveConfirmBtn', container);
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = ts('checkout.creatingHold'); }

    var res = await Sb().createBookingHold({
      facilityId: garage.uuid,
      vehicleId: vehicleId,
      startsAt: host.state.interval.startAt,
      endsAt: host.state.interval.endAt,
      paymentMethod: host.state.checkoutPaymentMethod || 'pay_at_garage',
      idempotencyKey: host.state.checkoutIdempotencyKey
    });

    if (!res.ok) {
      host.state.activeHold = null;
      if (res.code === 'NETWORK_ERROR') {
        host.state.backendNetError = res.message;
        updateBackendModeUi();
      }
      renderServerReserveModal(garage, { errorCode: res.code, errorMessage: mapServerError(res) });
      return res;
    }

    host.state.activeHold = res.booking;
    host.toast(ts('checkout.holdCreatedToast', { mins: res.holdMinutes || 10 }), 'ok');
    renderServerReserveModal(garage);
    startHoldCountdown(garage);
    return res;
  }

  function startHoldCountdown(garage) {
    stopHoldCountdown();
    if (!host.state.activeHold || !host.state.activeHold.holdExpiresAt) return;
    var expiresMs = Date.parse(host.state.activeHold.holdExpiresAt);
    function tick() {
      var left = expiresMs - Date.now();
      var timerEl = host.q('#holdTimerValue');
      var banner = host.q('#holdBanner');
      var confirmBtn = host.q('#reserveConfirmBtn');
      if (!timerEl || !banner) { stopHoldCountdown(); return; }
      if (left <= 0) {
        stopHoldCountdown();
        timerEl.textContent = '00:00';
        banner.classList.remove('is-expiring');
        banner.classList.add('is-expired');
        if (confirmBtn) confirmBtn.disabled = true;
        renderServerReserveModal(garage, { holdExpired: true });
        return;
      }
      timerEl.textContent = formatRemainingMMSS(left);
      if (left <= 120000) banner.classList.add('is-expiring');
    }
    tick();
    host.state.holdCountdownTimer = setInterval(tick, 1000);
  }

  function mapServerError(res) {
    if (!res) return 'Error';
    var code = res.code;
    if (code === 'NETWORK_ERROR') return ts('mode.netErrorText');
    if (code === 'HOLD_EXPIRED') return ts('checkout.holdExpired');
    if (code === 'QUOTE_EXPIRED' || code === 'QUOTE_STALE' || code === 'QUOTE_CHANGED') return host.state.lang === 'en' ? 'The extension quote changed or expired. Request a new quote and accept the updated amount.' : 'La cotización de extensión cambió o venció. Solicitá una nueva y aceptá el importe actualizado.';
    if (code === 'PAYMENT_INCREMENT_REQUIRED') return host.state.lang === 'en' ? 'Prepaid bookings require a separately verified incremental payment before extension.' : 'Las reservas prepagas requieren un pago incremental verificado antes de extenderse.';
    if (code === 'PAYMENT_METHOD_MISMATCH') return host.state.lang === 'en' ? 'The payment method cannot be changed after creating the hold.' : 'No se puede cambiar el medio de pago después de crear la retención.';
    if (code === 'PAST_START_TIME') return host.t('validation.PAST_DATE');
    if (code === 'NO_AVAILABILITY' || code === 'OUT_OF_HOURS' || code === 'VEHICLE_TYPE_NOT_ACCEPTED' || code === 'HEIGHT_EXCEEDS_CLEARANCE' || code === 'EXCEEDS_MAX_DURATION') {
      return host.t('validation.' + code, {
        vehicle: host.t('vehicle.' + (res.vehicleType || host.state.vehicleType)),
        open: res.details && res.details.open ? res.details.open : '',
        close: res.details && res.details.close ? res.details.close : '',
        max: res.maxHeightM ? Number(res.maxHeightM).toFixed(2) : Core().MAX_DURATION_HOURS
      });
    }
    return res.message || code;
  }

  function renderServerReserveModal(garage, opts) {
    var options = opts || {};
    var container = host.q('#reserveModal');
    if (!container) return;

    var ev = garage.serverEvaluation || Core().evaluateGarageEligibility(garage, host.state.interval, host.state.vehicleType, []);
    var hold = host.state.activeHold;
    var quote = (hold && hold.quote) ? hold.quote : ev.quote;
    var vehicles = host.state.vehicles || [];
    var payMethod = host.state.checkoutPaymentMethod || 'pay_at_garage';
    if (payMethod === 'mercado_pago') { payMethod = 'pay_at_garage'; host.state.checkoutPaymentMethod = payMethod; }
    var holdExpired = !!options.holdExpired || (hold && hold.holdExpiresAt && Date.parse(hold.holdExpiresAt) <= Date.now());

    var holdHtml = '';
    if (holdExpired) {
      holdHtml =
        '<div id="holdBanner" class="hold-banner is-expired">' +
          '<span>' + host.escapeHtml(ts('checkout.holdExpired')) + '</span>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="reholdBtn">' + host.escapeHtml(ts('checkout.reholdBtn')) + '</button>' +
        '</div>';
    } else if (hold) {
      var rem = formatRemainingMMSS(Date.parse(hold.holdExpiresAt) - Date.now());
      holdHtml =
        '<div id="holdBanner" class="hold-banner">' +
          '<span>' + host.escapeHtml(ts('checkout.holdActive')) + ' · <code>' + host.escapeHtml(hold.bookingCode) + '</code></span>' +
          '<span class="hold-timer-pill" id="holdTimerValue">' + rem + '</span>' +
        '</div>';
    }

    var vehHtml = '';
    if (vehicles.length > 0) {
      vehHtml =
        '<div class="form-field" style="margin-bottom:10px">' +
          '<label for="checkoutVehicleSel">' + host.escapeHtml(ts('checkout.selectVehicle')) + '</label>' +
          '<select id="checkoutVehicleSel">' +
            vehicles.map(function (v) {
              var sel = v.id === host.state.selectedVehicleId ? ' selected' : '';
              return '<option value="' + host.escapeHtml(v.id) + '"' + sel + '>' +
                host.escapeHtml(v.plate + ' · ' + host.t('vehicle.' + v.vehicle_type) + (v.make ? ' ' + v.make : '') + (v.model ? ' ' + v.model : '') + (v.height_m ? ' (' + Number(v.height_m).toFixed(2) + ' m)' : '')) +
              '</option>';
            }).join('') +
          '</select>' +
        '</div>';
    } else {
      vehHtml =
        '<div class="qa-panel" style="margin-bottom:12px">' +
          '<div class="detail-section-title">' + host.escapeHtml(ts('checkout.quickAddVehicle')) + '</div>' +
          '<div class="form-grid-2">' +
            '<div class="form-field"><label for="plateInput">' + host.escapeHtml(ts('profile2c.plate')) + '</label>' +
              '<input id="plateInput" type="text" maxlength="12" value="' + host.generatePlate() + '" /></div>' +
            '<div class="form-field"><label for="quickVehType">' + host.escapeHtml(ts('profile2c.type')) + '</label>' +
              '<select id="quickVehType">' +
                ['motorcycle', 'car', 'suv', 'van'].map(function (vt) {
                  return '<option value="' + vt + '"' + (vt === host.state.vehicleType ? ' selected' : '') + '>' + host.escapeHtml(host.t('vehicle.' + vt)) + '</option>';
                }).join('') +
              '</select></div>' +
            '<div class="form-field"><label for="quickVehMake">' + host.escapeHtml(ts('profile2c.make')) + '</label>' +
              '<input id="quickVehMake" type="text" placeholder="Toyota" /></div>' +
            '<div class="form-field"><label for="quickVehHeight">' + host.escapeHtml(ts('profile2c.heightM')) + '</label>' +
              '<input id="quickVehHeight" type="number" step="0.05" value="' + Core().VEHICLE_TYPES[host.state.vehicleType].defaultHeightM + '" /></div>' +
          '</div>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="quickSaveVehBtn" style="margin-top:8px">' + host.escapeHtml(ts('profile2c.saveVehicleBtn')) + '</button>' +
        '</div>';
    }

    var payHtml =
      '<div class="detail-section-title">' + host.escapeHtml(ts('checkout.paymentChoiceTitle')) + '</div>' +
      '<div class="payment-options">' +
        '<label class="payment-option' + (payMethod === 'pay_at_garage' ? ' is-selected' : '') + '">' +
          '<input type="radio" name="checkoutPayMethod" value="pay_at_garage"' + (payMethod === 'pay_at_garage' ? ' checked' : '') + ' />' +
          '<div><strong>' + host.escapeHtml(ts('checkout.payGarageTitle')) + '</strong><span>' + host.escapeHtml(ts('checkout.payGarageDesc')) + '</span></div>' +
        '</label>' +
        '<label class="payment-option' + (payMethod === 'demo_simulated' ? ' is-selected' : '') + '">' +
          '<input type="radio" name="checkoutPayMethod" value="demo_simulated"' + (payMethod === 'demo_simulated' ? ' checked' : '') + ' />' +
          '<div><strong>' + host.escapeHtml(host.state.lang === 'en' ? 'Simulated demo payment' : 'Pago simulado de demostración') + '</strong><span>' + host.escapeHtml(host.state.lang === 'en' ? 'Marked as a test simulation; no provider approval or real charge.' : 'Identificado como simulación; sin aprobación de proveedor ni cobro real.') + '</span></div>' +
        '</label>' +
      '</div>' +
      '<div class="detail-footer-note" style="margin-bottom:10px">' + host.escapeHtml(host.state.lang === 'en' ? 'Mercado Pago Test is pending Sprint 2D activation. It cannot confirm bookings in this demo.' : 'Mercado Pago Test queda pendiente de activación en Sprint 2D. No confirma reservas en esta demo.') + '</div>';

    var canConfirm = !!(hold && !holdExpired && !options.errorMessage);

    container.innerHTML =
      '<div class="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="reserveTitle">' +
        '<div class="modal-head">' +
          '<div>' +
            '<h3 id="reserveTitle">' + host.escapeHtml(host.t('reserve.title')) + '</h3>' +
            '<p class="modal-sub">' + host.escapeHtml(garage.name) + ' · ' + host.escapeHtml(garage.address) + '</p>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-close="reserveModal" aria-label="' + host.escapeHtml(host.t('common.close')) + '">×</button>' +
        '</div>' +

        holdHtml +

        '<div class="summary-grid">' +
          '<div><span>' + host.escapeHtml(host.t('reserve.checkIn')) + '</span><strong>' + host.escapeHtml(host.state.interval.arrivalDate + ' · ' + host.state.interval.arrival) + '</strong></div>' +
          '<div><span>' + host.escapeHtml(host.t('reserve.checkOut')) + '</span><strong>' + host.escapeHtml(host.state.interval.departureDate + ' · ' + host.state.interval.departure) + '</strong></div>' +
          '<div><span>' + host.escapeHtml(host.t('reserve.duration')) + '</span><strong>' + host.escapeHtml(host.formatDuration(host.state.interval.durationMinutes)) + '</strong></div>' +
          '<div><span>' + host.escapeHtml(host.t('reserve.spotsNow')) + '</span><strong id="reserveAvail">' + (ev && ev.availability ? ev.availability.availableSpaces : '—') + ' / ' + garage.totalSpaces + '</strong></div>' +
        '</div>' +

        host.buildQuoteBreakdownHtml(quote) +

        '<div id="reserveError" class="modal-error" role="alert"' + (options.errorMessage ? '' : ' hidden') + '>' +
          (options.errorMessage ? host.escapeHtml(options.errorMessage) : '') +
        '</div>' +

        vehHtml +
        payHtml +

        '<div class="modal-notes">' +
          '<span class="badge badge-func">' + host.escapeHtml(ts('checkout.serverScopeBadge')) + '</span>' +
          '<span>' + host.escapeHtml(ts('checkout.serverScopeNote')) + '</span>' +
        '</div>' +

        '<div class="modal-actions">' +
          '<button class="btn btn-ghost" type="button" data-close="reserveModal">' + host.escapeHtml(host.t('common.cancel')) + '</button>' +
          '<button id="reserveConfirmBtn" class="btn btn-primary" type="button"' + (!canConfirm ? ' disabled' : '') + '>' +
            host.escapeHtml(host.t('reserve.confirm')) +
          '</button>' +
        '</div>' +
      '</div>';

    // Wire vehicle selector change -> cancel previous hold if any & create new hold for chosen vehicle
    var vehSel = host.q('#checkoutVehicleSel', container);
    if (vehSel) {
      vehSel.addEventListener('change', async function () {
        if (host.state.activeHold && host.state.activeHold.id) {
          await Sb().cancelBooking(host.state.activeHold.id, 'vehicle_changed_in_checkout');
        }
        host.state.selectedVehicleId = vehSel.value;
        host.state.checkoutIdempotencyKey = Sb().generateUuidV4();
        createHoldForCurrentCheckout(garage, vehSel.value);
      });
    }

    var quickBtn = host.q('#quickSaveVehBtn', container);
    if (quickBtn) {
      quickBtn.addEventListener('click', async function () {
        var r = await Sb().saveVehicle(host.state.user.id, {
          plate: host.q('#plateInput', container).value,
          make: host.q('#quickVehMake', container).value,
          vehicle_type: host.q('#quickVehType', container).value,
          height_m: host.q('#quickVehHeight', container).value,
          is_default: true
        });
        if (!r.ok) {
          var eb = host.q('#reserveError', container);
          if (eb) { eb.textContent = r.message || r.code; eb.hidden = false; }
          return;
        }
        await hydrateSignedInUser(host.state.user.id);
        host.state.selectedVehicleId = r.vehicle.id;
        host.state.checkoutIdempotencyKey = Sb().generateUuidV4();
        createHoldForCurrentCheckout(garage, r.vehicle.id);
      });
    }

    Array.prototype.forEach.call(container.querySelectorAll('input[name="checkoutPayMethod"]'), function (rad) {
      rad.addEventListener('change', async function () {
        var previous = host.state.activeHold;
        host.state.checkoutPaymentMethod = rad.value;
        if (previous && previous.paymentMethod !== rad.value) {
          var cancelled = await Sb().cancelBooking(previous.id, 'payment_method_changed');
          if (!cancelled.ok) { renderServerReserveModal(garage, { errorMessage: mapServerError(cancelled) }); return; }
          host.state.activeHold = null;
          host.state.checkoutIdempotencyKey = Sb().generateUuidV4();
          renderServerReserveModal(garage);
          await createHoldForCurrentCheckout(garage, host.state.selectedVehicleId);
          return;
        }
        renderServerReserveModal(garage, options);
      });
    });

    var mpStubBtn = host.q('#mpContractStubBtn', container);
    if (mpStubBtn && hold) {
      mpStubBtn.addEventListener('click', async function () {
        var stub = await Sb().prepareMercadoPagoStub(hold.id);
        host.toast(stub.message || stub.code, 'warn');
      });
    }

    var reholdBtn = host.q('#reholdBtn', container);
    if (reholdBtn) {
      reholdBtn.addEventListener('click', function () {
        host.state.checkoutIdempotencyKey = Sb().generateUuidV4();
        if (host.state.selectedVehicleId) {
          createHoldForCurrentCheckout(garage, host.state.selectedVehicleId);
        }
      });
    }

    var confirmBtn = host.q('#reserveConfirmBtn', container);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function () {
        if (!host.state.activeHold) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = ts('checkout.confirming');
        var res = await Sb().confirmBookingDemo(host.state.activeHold.id, host.state.checkoutPaymentMethod);
        if (!res.ok) {
          if (res.code === 'HOLD_EXPIRED') {
            stopHoldCountdown();
            renderServerReserveModal(garage, { holdExpired: true, errorMessage: ts('checkout.holdExpired') });
          } else {
            if (res.code === 'NETWORK_ERROR') {
              host.state.backendNetError = res.message;
              updateBackendModeUi();
            }
            renderServerReserveModal(garage, { errorMessage: mapServerError(res) });
          }
          return;
        }
        stopHoldCountdown();
        host.state.activeHold = null;
        var mapped = Sb().mapServerBookingToUi(res.booking, Core());
        await refreshServerBookings();
        await refreshCatalogFromServer();
        host.closeModal('reserveModal');
        host.openSuccessModal(mapped);
        host.toast(host.t('toast.reserved'), 'ok');
      });
    }
  }

  /* ------------------------- Enhanced Bookings Modal (Status Tabs + Extend + Events + ICS/Share) ------------------------- */

  function classifyBookingCategory(b) {
    if (b.uiCategory) return b.uiCategory;
    if (b.status === 'completed') return 'completed';
    if (b.status === 'cancelled' || b.status === 'expired' || b.status === 'no_show') return 'cancelled';
    if (b.status === 'checked_in') return 'active';
    var nowMs = Date.now();
    if (b.status === 'confirmed' && Number.isFinite(b.startMs) && Number.isFinite(b.endMs) && nowMs >= b.startMs && nowMs < b.endMs) {
      return 'active';
    }
    return 'upcoming';
  }

  function renderBookingsModal2C() {
    var container = host.q('#bookingsModal');
    if (!container) return;
    var all = host.getBookings();
    host.state.bookings = all;
    host.updateBookingsCount();

    var counts = { all: all.length, active: 0, upcoming: 0, completed: 0, cancelled: 0 };
    all.forEach(function (b) {
      var cat = classifyBookingCategory(b);
      if (counts[cat] !== undefined) counts[cat]++;
    });

    var tab = host.state.bookingsTab || 'all';
    var filtered = tab === 'all' ? all : all.filter(function (b) { return classifyBookingCategory(b) === tab; });

    // Active stay spotlight card if any booking is currently active
    var activeItem = all.find(function (b) { return classifyBookingCategory(b) === 'active'; });
    var spotlightHtml = '';
    if (activeItem && (tab === 'all' || tab === 'active')) {
      var remMin = Math.max(0, Math.round((activeItem.endMs - Date.now()) / 60000));
      spotlightHtml =
        '<div class="active-spotlight">' +
          '<div>' +
            '<span class="badge badge-func">' + host.escapeHtml(ts('bookings2c.activeSpotlight')) + '</span>' +
            '<h4 style="margin-top:6px">' + host.escapeHtml(activeItem.garage) + '</h4>' +
            '<div class="muted small">' + host.escapeHtml((activeItem.bookingCode || activeItem.id) + ' · ' + activeItem.plate) + '</div>' +
            '<div class="muted small" style="margin-top:4px">' + host.escapeHtml(ts('bookings2c.remainingLabel', { rem: host.formatDuration(remMin) })) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-primary btn-sm" data-view-qr="' + host.escapeHtml(activeItem.id) + '">' + host.escapeHtml(host.t('bookings.viewQr')) + '</button>' +
            (activeItem.paymentMethod !== 'mercado_pago' && activeItem.paymentMethod !== 'demo_simulated' ? '<button type="button" class="btn btn-secondary btn-sm" data-extend-booking="' + host.escapeHtml(activeItem.id) + '">' + host.escapeHtml(ts('bookings2c.extendBtn')) + '</button>' : '') +
          '</div>' +
        '</div>';
    }

    var bodyHtml = '';
    if (filtered.length === 0) {
      var emptyMsg = tab === 'completed' ? ts('bookings2c.completedEmptyNote') : host.t('bookings.emptyText');
      bodyHtml =
        '<div class="booking-empty">' +
          '<strong>' + host.escapeHtml(host.t('bookings.emptyTitle')) + '</strong>' +
          '<p>' + host.escapeHtml(emptyMsg) + '</p>' +
        '</div>';
    } else {
      bodyHtml = '<div class="bookings-list">' + filtered.map(function (b) {
        var isCancelled = b.status === 'cancelled' || b.status === 'expired' || b.status === 'no_show';
        var isCompleted = b.status === 'completed';
        var isPending = b.status === 'pending_payment';
        var canMutate = !isCancelled && !isCompleted;

        var statusBadge = isCancelled
          ? '<span class="badge badge-danger">' + host.escapeHtml(b.status === 'expired' ? ts('bookings2c.statusExpired') : host.t('bookings.statusCancelled')) + '</span>'
          : (isCompleted
              ? '<span class="badge badge-func">' + host.escapeHtml(ts('bookings2c.statusCompleted')) + '</span>'
              : (isPending
                  ? '<span class="badge badge-simulado">' + host.escapeHtml(ts('bookings2c.statusPending')) + '</span>'
                  : '<span class="badge badge-func">' + host.escapeHtml(host.t('bookings.statusConfirmed')) + '</span>'));

        var scopeBadge = b.persistenceScope === 'supabase_centralized'
          ? '<span class="badge badge-func">Supabase</span>'
          : '<span class="badge badge-simulado">Local Demo</span>';

        var quoteLine = b.quote
          ? '<div class="booking-quote-summary">' +
              host.escapeHtml(host.t('bookings.quoteSummary', {
                base: host.formatArs(b.quote.baseRatePerHour),
                vehicle: host.t('vehicle.' + b.vehicleType),
                vf: Number(b.quote.vehicleFactor || 1).toFixed(2),
                segs: (b.quote.segments || []).length
              })) +
            '</div>'
          : '';

        var awaitingNote = b.awaitingOperationalClosure
          ? '<div class="muted small" style="margin-top:4px">' + host.escapeHtml(ts('bookings2c.awaitingClosure')) + '</div>'
          : '';

        var eventsHtml = Array.isArray(b.events) && b.events.length > 0
          ? '<details class="booking-events-details"><summary>' + host.escapeHtml(ts('bookings2c.eventsToggle', { n: b.events.length })) + '</summary>' +
              b.events.map(function (ev) {
                return '<div class="booking-event-row"><span>' + host.escapeHtml(ev.eventType) + '</span><span>' + host.escapeHtml((ev.createdAt || '').slice(0, 19).replace('T', ' ')) + '</span></div>';
              }).join('') +
            '</details>'
          : '';

        var dirUrl = Core().buildExternalDirectionsUrl({ lat: b.lat, lng: b.lng });
        var actions = isCancelled
          ? '<span class="muted small">' + host.escapeHtml(host.t('bookings.cancelledAudit', {
              at: b.cancelledAt ? b.cancelledAt.slice(0, 19).replace('T', ' ') + ' UTC' : '—'
            })) + '</span>'
          : (dirUrl ? '<a class="btn btn-ghost btn-sm" href="' + host.escapeHtml(dirUrl) + '" target="_blank" rel="noopener noreferrer">' + host.escapeHtml(host.t('map.directionsShort')) + '</a>' : '') +
            '<button class="btn btn-ghost btn-sm" type="button" data-ics-booking="' + host.escapeHtml(b.id) + '">' + host.escapeHtml(ts('bookings2c.icsBtn')) + '</button>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-share-booking="' + host.escapeHtml(b.id) + '">' + host.escapeHtml(ts('bookings2c.shareBtn')) + '</button>' +
            (canMutate && !isPending && b.paymentMethod !== 'mercado_pago' && b.paymentMethod !== 'demo_simulated' ? '<button class="btn btn-secondary btn-sm" type="button" data-extend-booking="' + host.escapeHtml(b.id) + '">' + host.escapeHtml(ts('bookings2c.extendBtn')) + '</button>' : '') +
            '<button class="btn btn-secondary btn-sm" type="button" data-view-qr="' + host.escapeHtml(b.id) + '">' + host.escapeHtml(host.t('bookings.viewQr')) + '</button>' +
            (canMutate ? '<button class="btn btn-danger-ghost btn-sm" type="button" data-cancel-booking="' + host.escapeHtml(b.id) + '">' + host.escapeHtml(host.t('bookings.cancel')) + '</button>' : '');

        return '' +
          '<div class="booking-row' + (isCancelled ? ' is-cancelled' : '') + '" data-booking-id="' + host.escapeHtml(b.id) + '" data-booking-status="' + host.escapeHtml(b.status) + '">' +
            '<div class="booking-row-top">' +
              '<div><h4>' + host.escapeHtml(b.garage) + '</h4><span class="bid">' + host.escapeHtml(b.bookingCode || b.id) + '</span> ' + scopeBadge + '</div>' +
              statusBadge +
            '</div>' +
            '<div class="booking-meta">' +
              '<div><span>' + host.escapeHtml(host.t('bookings.dateTime')) + '</span><strong>' + host.escapeHtml(host.formatIntervalLabel(b)) + ' (' + host.escapeHtml(host.formatDuration(b.durationMinutes)) + ')</strong></div>' +
              '<div><span>' + host.escapeHtml(host.t('bookings.vehicle')) + '</span><strong>' + host.escapeHtml(host.t('vehicle.' + b.vehicleType)) + '</strong></div>' +
              '<div><span>' + host.escapeHtml(host.t('bookings.plate')) + '</span><strong>' + host.escapeHtml(b.plate) + '</strong></div>' +
              '<div><span>' + host.escapeHtml(host.t('bookings.total')) + '</span><strong class="booking-locked-total">' + host.formatArs(b.cost) + '</strong></div>' +
            '</div>' +
            quoteLine +
            awaitingNote +
            eventsHtml +
            '<div class="booking-actions">' + actions + '</div>' +
          '</div>';
      }).join('') + '</div>';
    }

    container.innerHTML =
      '<div class="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="bookingsTitle">' +
        '<div class="modal-head">' +
          '<div><h3 id="bookingsTitle">' + host.escapeHtml(host.t('bookings.title')) + '</h3><p class="modal-sub">' + host.escapeHtml(isServerMode() ? ts('mode.supabase') : host.t('bookings.subtitle')) + '</p></div>' +
          '<button class="icon-btn" type="button" data-close="bookingsModal" aria-label="' + host.escapeHtml(host.t('common.close')) + '">×</button>' +
        '</div>' +

        '<div class="booking-tabs" role="tablist">' +
          '<button type="button" class="booking-tab" role="tab" data-b-tab="all" aria-selected="' + (tab === 'all') + '">' + host.escapeHtml(ts('bookings2c.tabAll', { n: counts.all })) + '</button>' +
          '<button type="button" class="booking-tab" role="tab" data-b-tab="active" aria-selected="' + (tab === 'active') + '">' + host.escapeHtml(ts('bookings2c.tabActive', { n: counts.active })) + '</button>' +
          '<button type="button" class="booking-tab" role="tab" data-b-tab="upcoming" aria-selected="' + (tab === 'upcoming') + '">' + host.escapeHtml(ts('bookings2c.tabUpcoming', { n: counts.upcoming })) + '</button>' +
          '<button type="button" class="booking-tab" role="tab" data-b-tab="completed" aria-selected="' + (tab === 'completed') + '">' + host.escapeHtml(ts('bookings2c.tabCompleted', { n: counts.completed })) + '</button>' +
          '<button type="button" class="booking-tab" role="tab" data-b-tab="cancelled" aria-selected="' + (tab === 'cancelled') + '">' + host.escapeHtml(ts('bookings2c.tabCancelled', { n: counts.cancelled })) + '</button>' +
        '</div>' +

        spotlightHtml +
        bodyHtml +

        '<div class="modal-actions">' +
          '<button class="btn btn-secondary" type="button" data-close="bookingsModal">' + host.escapeHtml(host.t('common.close')) + '</button>' +
        '</div>' +
      '</div>';

    Array.prototype.forEach.call(container.querySelectorAll('[data-b-tab]'), function (btn) {
      btn.addEventListener('click', function () {
        host.state.bookingsTab = btn.getAttribute('data-b-tab');
        renderBookingsModal2C();
      });
    });

    Array.prototype.forEach.call(container.querySelectorAll('[data-view-qr]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-view-qr');
        var booking = host.getBookings().find(function (b) { return b.id === id; });
        if (booking) host.openBookingQr(booking);
      });
    });

    Array.prototype.forEach.call(container.querySelectorAll('[data-ics-booking]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ics-booking');
        var booking = host.getBookings().find(function (b) { return b.id === id; });
        if (booking) downloadBookingIcs(booking);
      });
    });

    Array.prototype.forEach.call(container.querySelectorAll('[data-share-booking]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-share-booking');
        var booking = host.getBookings().find(function (b) { return b.id === id; });
        if (booking) shareBooking(booking);
      });
    });

    Array.prototype.forEach.call(container.querySelectorAll('[data-extend-booking]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-extend-booking');
        var booking = host.getBookings().find(function (b) { return b.id === id; });
        if (booking) openExtendModal(booking);
      });
    });

    Array.prototype.forEach.call(container.querySelectorAll('[data-cancel-booking]'), function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-cancel-booking');
        var booking = host.getBookings().find(function (b) { return b.id === id; });
        if (booking && booking.persistenceScope === 'supabase_centralized' && isServerMode()) {
          btn.disabled = true;
          var r = await Sb().cancelBooking(booking.uuid, 'user_cancelled');
          if (r.ok) {
            await refreshServerBookings();
            await refreshCatalogFromServer();
            host.toast(host.t('bookings.canceled', { id: booking.bookingCode || booking.id, garage: booking.garage }), 'ok');
          } else {
            host.toast(mapServerError(r), 'err');
          }
          renderBookingsModal2C();
        } else {
          var res = host.cancelBookingLocal(id);
          if (res && res.ok) host.toast(host.t('bookings.canceled', { id: res.booking.id, garage: res.booking.garage }), 'ok');
          else if (res && !res.ok) host.toast(host.t('toast.storageError', { err: res.error || res.code }), 'err');
          renderBookingsModal2C();
        }
      });
    });
  }

  /* ------------------------- Booking Extension Modal ------------------------- */

  function openExtendModal(booking) {
    var nextMs = booking.endMs + 3600000; // default +1h
    var parts = Core().getBuenosAiresLocalParts(nextMs);
    extendState = {
      booking: booking,
      preview: null,
      error: null,
      newDate: parts.dateStr,
      newTime: parts.timeStr
    };
    renderExtendModal();
    host.openModal('extendModal');
    previewExtensionNow();
  }

  async function previewExtensionNow() {
    var b = extendState.booking;
    if (!b) return;
    var depMins = Core().parseTimeMinutes(extendState.newTime, false);
    if (depMins === null) { extendState.error = host.t('validation.INVALID_DEPARTURE_TIME'); renderExtendModal(); return; }
    var newEndIso = Core().toBuenosAiresIso(extendState.newDate, depMins);
    var newEndMs = Date.parse(newEndIso);
    if (!Number.isFinite(newEndMs) || newEndMs <= b.endMs) {
      extendState.error = host.t('validation.NON_POSITIVE_DURATION');
      extendState.preview = null;
      renderExtendModal();
      return;
    }

    if (b.persistenceScope === 'supabase_centralized' && isServerMode()) {
      var res = await Sb().previewBookingExtension(b.uuid, newEndIso);
      if (!res.ok) {
        extendState.error = mapServerError(res);
        extendState.preview = null;
      } else {
        extendState.error = null;
        extendState.preview = res;
      }
      renderExtendModal();
    } else {
      // Offline demo local extension preview
      var garage = host.findGarageById(b.garageId);
      var extInterval = Core().validateInterval({
        arrivalDate: b.departureDate || b.date,
        departureDate: extendState.newDate,
        arrival: b.departure,
        departure: extendState.newTime,
        allowPast: true
      });
      var totalMins = Math.round((newEndMs - b.startMs) / 60000);
      if (!extInterval.valid || totalMins > Core().MAX_DURATION_MINUTES) {
        extendState.error = host.t('validation.EXCEEDS_MAX_DURATION', { max: Core().MAX_DURATION_HOURS });
        extendState.preview = null;
      } else if (garage) {
        var others = host.getBookings().filter(function (x) { return x.id !== b.id; });
        var ev = Core().evaluateGarageEligibility(garage, extInterval, b.vehicleType, others);
        if (!ev.eligible) {
          extendState.error = host.reasonMessage(ev);
          extendState.preview = null;
        } else {
          extendState.error = null;
          extendState.preview = {
            ok: true,
            proposedEndsAt: newEndIso,
            incrementalAmount: ev.quote.totalArs,
            newTotalAmount: Number(b.cost || 0) + ev.quote.totalArs,
            incrementalQuote: ev.quote
          };
        }
      }
      renderExtendModal();
    }
  }

  async function confirmExtensionNow() {
    var b = extendState.booking;
    var p = extendState.preview;
    if (!b || !p || !p.ok) return;

    if (b.persistenceScope === 'supabase_centralized' && isServerMode()) {
      var res = await Sb().extendBooking(b.uuid, p.quoteId);
      if (!res.ok) {
        extendState.error = mapServerError(res);
        renderExtendModal();
        return;
      }
      await refreshServerBookings();
      await refreshCatalogFromServer();
      host.closeModal('extendModal');
      host.toast(ts('extend.extendedToast', { code: b.bookingCode || b.id, inc: host.formatArs(res.incrementalAmount) }), 'ok');
      renderBookingsModal2C();
    } else {
      // Offline demo local extension
      var adapter = host.activeStorageAdapter();
      var readRes = adapter.read();
      if (!readRes.ok) { host.toast(readRes.error, 'err'); return; }
      var newEndMs = Date.parse(p.proposedEndsAt);
      var ep = Core().getBuenosAiresLocalParts(newEndMs);
      var updatedList = readRes.data.map(function (item) {
        if (item.id !== b.id) return item;
        var dur = Math.round((newEndMs - item.startMs) / 60000);
        var events = (item.events || []).concat([{
          eventType: 'extended',
          createdAt: new Date().toISOString(),
          details: { previousEndsAt: item.endAt, newEndsAt: p.proposedEndsAt, incrementalAmount: p.incrementalAmount }
        }]);
        return Object.assign({}, item, {
          departureDate: ep.dateStr,
          departure: ep.timeStr,
          endAt: p.proposedEndsAt,
          endMs: newEndMs,
          durationMinutes: dur,
          hours: dur / 60,
          cost: p.newTotalAmount,
          events: events
        });
      });
      var wr = adapter.write(updatedList);
      if (!wr.ok) { host.toast(wr.error, 'err'); return; }
      host.state.bookings = updatedList;
      host.closeModal('extendModal');
      host.renderResults(false);
      renderBookingsModal2C();
      host.toast(ts('extend.extendedToast', { code: b.id, inc: host.formatArs(p.incrementalAmount) }), 'ok');
    }
  }

  function renderExtendModal() {
    var container = host.q('#extendModal');
    if (!container || !extendState.booking) return;
    var b = extendState.booking;
    var p = extendState.preview;

    container.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="extendTitle">' +
        '<div class="modal-head">' +
          '<div>' +
            '<h3 id="extendTitle">' + host.escapeHtml(ts('extend.title')) + '</h3>' +
            '<p class="modal-sub">' + host.escapeHtml((b.bookingCode || b.id) + ' · ' + b.garage) + '</p>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-close="extendModal" aria-label="' + host.escapeHtml(host.t('common.close')) + '">×</button>' +
        '</div>' +

        '<div class="summary-grid" style="margin-bottom:12px">' +
          '<div><span>' + host.escapeHtml(ts('extend.currentEnd')) + '</span><strong>' + host.escapeHtml((b.departureDate || b.date) + ' · ' + b.departure) + '</strong></div>' +
          '<div><span>' + host.escapeHtml(host.t('bookings.total')) + '</span><strong>' + host.formatArs(b.cost) + '</strong></div>' +
        '</div>' +

        '<div style="display:flex;gap:6px;margin-bottom:10px">' +
          '<button type="button" class="preset-btn" data-ext-add="30">+30 min</button>' +
          '<button type="button" class="preset-btn" data-ext-add="60">+1 h</button>' +
          '<button type="button" class="preset-btn" data-ext-add="120">+2 h</button>' +
        '</div>' +

        '<div class="form-grid-2" style="margin-bottom:10px">' +
          '<div class="form-field"><label for="extDate">' + host.escapeHtml(ts('extend.newEndDate')) + '</label>' +
            '<input id="extDate" type="date" value="' + host.escapeHtml(extendState.newDate) + '" /></div>' +
          '<div class="form-field"><label for="extTime">' + host.escapeHtml(ts('extend.newEndTime')) + '</label>' +
            '<input id="extTime" type="time" value="' + host.escapeHtml(extendState.newTime) + '" /></div>' +
        '</div>' +

        (extendState.error ? '<div id="extendError" class="modal-error" role="alert">' + host.escapeHtml(extendState.error) + '</div>' : '') +

        (p && p.ok
          ? '<div class="extend-preview-box">' +
              '<div style="display:flex;justify-content:space-between"><span>' + host.escapeHtml(ts('extend.incrementalLabel')) + '</span><strong id="extendIncAmount">+' + host.formatArs(p.incrementalAmount) + '</strong></div>' +
              '<div style="display:flex;justify-content:space-between"><span>' + host.escapeHtml(ts('extend.newTotalLabel')) + '</span><strong id="extendNewTotal">' + host.formatArs(p.newTotalAmount) + '</strong></div>' +
              '<div class="muted small">' + host.escapeHtml(ts('extend.preservedNote')) + '</div>' +
              (p.quoteExpiresAt ? '<div class="muted small">' + host.escapeHtml((host.state.lang === 'en' ? 'Server quote valid until ' : 'Cotización válida hasta ') + new Date(p.quoteExpiresAt).toLocaleTimeString()) + '</div>' : '') +
            '</div>'
          : '') +

        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-close="extendModal">' + host.escapeHtml(host.t('common.cancel')) + '</button>' +
          '<button type="button" class="btn btn-secondary" id="extPreviewBtn">' + host.escapeHtml(ts('extend.previewBtn')) + '</button>' +
          '<button type="button" class="btn btn-primary" id="extConfirmBtn"' + (!(p && p.ok) ? ' disabled' : '') + '>' + host.escapeHtml(ts('extend.confirmBtn')) + '</button>' +
        '</div>' +
      '</div>';

    Array.prototype.forEach.call(container.querySelectorAll('[data-ext-add]'), function (btn) {
      btn.addEventListener('click', function () {
        var mins = Number(btn.getAttribute('data-ext-add'));
        var parts = Core().getBuenosAiresLocalParts(b.endMs + mins * 60000);
        extendState.newDate = parts.dateStr;
        extendState.newTime = parts.timeStr;
        previewExtensionNow();
      });
    });

    host.q('#extDate', container).addEventListener('change', function (ev) { extendState.newDate = ev.target.value; extendState.preview = null; extendState.error = null; renderExtendModal(); });
    host.q('#extTime', container).addEventListener('change', function (ev) { extendState.newTime = ev.target.value; extendState.preview = null; extendState.error = null; renderExtendModal(); });
    host.q('#extPreviewBtn', container).addEventListener('click', previewExtensionNow);
    host.q('#extConfirmBtn', container).addEventListener('click', confirmExtensionNow);
  }

  /* ------------------------- Public Module Interface ------------------------- */

  root.ParkFinderSprint2C = {
    I18N: S2C_I18N,
    ts: ts,
    attach: function (ctx) {
      host = ctx;
      updateBackendModeUi();
    },
    isServerMode: isServerMode,
    initBackend: initBackend,
    updateBackendModeUi: updateBackendModeUi,
    refreshCatalogFromServer: refreshCatalogFromServer,
    refreshServerBookings: refreshServerBookings,
    hydrateSignedInUser: hydrateSignedInUser,
    openAuthModal: openAuthModal,
    renderAuthModal: renderAuthModal,
    renderProfileModal2C: renderProfileModal2C,
    openServerReserveModal: openServerReserveModal,
    stopHoldCountdown: stopHoldCountdown,
    renderBookingsModal2C: renderBookingsModal2C,
    openExtendModal: openExtendModal,
    downloadBookingIcs: downloadBookingIcs,
    shareBooking: shareBooking,
    exportBookingsCsv: exportBookingsCsv
  };
})(typeof self !== 'undefined' ? self : this);
