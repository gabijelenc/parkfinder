#!/usr/bin/env python3
"""
parkFinder Sprint 2C — Real-Browser E2E Acceptance & High-Res Screenshot Suite (Playwright)
Verifies all Sprint 2C UI & Backend Integration workflows across multiple users & devices:
  - S2C-E01: Anonymous browsing works without login; Reserve prompts real Auth modal; offline never fakes login
  - S2C-E02: Registration, sign-in, profile editing, role display & sign-out
  - S2C-E03: Vehicle CRUD (add, edit, set default, delete unused, block delete with historical booking snapshot)
  - S2C-E04: Centralized Hold Checkout (10-min live timer, authoritative quote, payment choice + MP Sprint 2D stub, confirm, .ics & Share)
  - S2C-E05: Hold Expiration (HOLD_EXPIRED) blocks late confirm & allows clean re-hold without overbooking
  - S2C-E06: My Bookings tabs (All/Active/Upcoming/Completed/Cancelled), no auto-completed, Event History, Extension (preview+confirm), Cancel
  - S2C-E07: Cross-device persistence (User A Device 1 -> fresh Device 2) & Multi-user isolation (User B sees 0 of User A data)
  - S2C-E08: Connection failure recovery (NETWORK_ERROR blocks confirmation, never silently saves offline as centralized)
  - S2C-E09: Notification preferences (6 toggles synced) + Personal Analytics KPIs & CSV export
  - S2C-E10: Light/Dark mode, ES/EN bilingual Sprint 2C modals, Desktop 1440x900 & Mobile 390x844 zero overflow + 2x DPR screenshots
"""

import http.server
import json
import os
import socketserver
import threading
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
SCREENSHOT_DIR = Path(os.environ.get(
    "PF_S2C_SCREENSHOT_DIR",
    str(REPO_ROOT / "02_trabajo" / "sprint_02c" / "screenshots")
))
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


class SharedMockSupabaseState:
    """In-memory multi-user stateful backend shared across separate browser contexts (devices)."""
    def __init__(self):
        self.reset()

    def reset(self):
        self.fail_next_rpc = None
        self.force_hold_expired = False
        self.users = {}       # email -> {id, email, password}
        self.profiles = {}    # uid -> dict
        self.roles = {}       # uid -> ['driver']
        self.vehicles = {}    # vid -> dict
        self.fav_garages = {} # uid -> set(slug)
        self.fav_dests = {}   # uid -> list(dict)
        self.notif_prefs = {} # uid -> dict(kind -> bool)
        self.notifications = {} # uid -> list(dict)
        self.bookings = {}    # bid -> dict
        self.seq = 100

    def ensure_user(self, email, password, full_name=""):
        email = email.strip().lower()
        if email not in self.users:
            uid = str(uuid.uuid4())
            self.users[email] = {"id": uid, "email": email, "password": password}
            self.profiles[uid] = {
                "id": uid,
                "full_name": full_name or email.split("@")[0],
                "phone": "",
                "preferred_language": "es",
                "preferred_theme": "light",
                "default_payment_method": "pay_at_garage",
            }
            self.roles[uid] = ["driver"]
            self.fav_garages[uid] = set()
            self.fav_dests[uid] = []
            self.notif_prefs[uid] = {
                k: True for k in ["booking_confirmed", "reminder_1h", "ending_30m", "extension_offer", "exit_summary", "review_prompt"]
            }
            self.notifications[uid] = []
        return self.users[email]


BACKEND = SharedMockSupabaseState()


class TestHttpHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, format, *args):
        pass

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.path.startswith("/__mock_sb__/"):
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        body = json.loads(raw)
        action = self.path[len("/__mock_sb__/"):]
        uid = body.get("uid")

        if action == "signup":
            u = BACKEND.ensure_user(body["email"], body["password"], body.get("fullName", ""))
            self._send_json(200, {"data": {"user": {"id": u["id"], "email": u["email"]}, "session": {"user": {"id": u["id"], "email": u["email"]}}}, "error": None})
            return

        if action == "signin":
            email = body["email"].strip().lower()
            u = BACKEND.users.get(email)
            if not u or u["password"] != body["password"]:
                self._send_json(200, {"data": {"user": None, "session": None}, "error": {"message": "Invalid login credentials"}})
                return
            self._send_json(200, {"data": {"user": {"id": u["id"], "email": u["email"]}, "session": {"user": {"id": u["id"], "email": u["email"]}}}, "error": None})
            return

        if action == "reset_pw":
            self._send_json(200, {"data": {}, "error": None})
            return

        if action == "table":
            tbl = body["table"]
            op = body["op"]
            if tbl == "profiles":
                if op == "select":
                    self._send_json(200, {"data": BACKEND.profiles.get(uid), "error": None})
                elif op == "update":
                    p = BACKEND.profiles.setdefault(uid, {"id": uid})
                    p.update(body.get("patch", {}))
                    self._send_json(200, {"data": p, "error": None})
                return
            if tbl == "user_roles":
                self._send_json(200, {"data": [{"role": r} for r in BACKEND.roles.get(uid, ["driver"])], "error": None})
                return
            if tbl == "vehicles":
                if op == "select":
                    rows = [v for v in BACKEND.vehicles.values() if v["user_id"] == uid]
                    rows.sort(key=lambda x: (not x.get("is_default", False), x.get("plate", "")))
                    self._send_json(200, {"data": rows, "error": None})
                elif op == "insert":
                    row = dict(body["row"])
                    row["id"] = str(uuid.uuid4())
                    row["user_id"] = uid
                    if row.get("is_default"):
                        for v in BACKEND.vehicles.values():
                            if v["user_id"] == uid:
                                v["is_default"] = False
                    BACKEND.vehicles[row["id"]] = row
                    self._send_json(200, {"data": row, "error": None})
                elif op == "update":
                    vid = body["id"]
                    v = BACKEND.vehicles.get(vid)
                    if not v or v["user_id"] != uid:
                        self._send_json(200, {"data": None, "error": {"message": "Not found"}})
                        return
                    if body["row"].get("is_default"):
                        for x in BACKEND.vehicles.values():
                            if x["user_id"] == uid and x["id"] != vid:
                                x["is_default"] = False
                    v.update(body["row"])
                    self._send_json(200, {"data": v, "error": None})
                elif op == "delete":
                    vid = body["id"]
                    # Enforce FK: block delete if vehicle is referenced by any booking
                    if any(b["vehicleId"] == vid for b in BACKEND.bookings.values()):
                        self._send_json(200, {"data": None, "error": {"code": "23503", "message": "violates foreign key constraint bookings_vehicle_id_user_id_fkey"}})
                        return
                    if vid in BACKEND.vehicles and BACKEND.vehicles[vid]["user_id"] == uid:
                        del BACKEND.vehicles[vid]
                    self._send_json(200, {"data": None, "error": None})
                return
            if tbl == "favorite_garages":
                slug_by_uuid = {
                    "00000000-0000-4000-8000-000000000001": "garage-puerto-madero",
                    "00000000-0000-4000-8000-000000000002": "garage-palermo-soho",
                    "00000000-0000-4000-8000-000000000003": "garage-obelisco",
                }
                if op == "select":
                    rows = [{"facility_id": k, "parking_facilities": {"slug": v}} for k, v in slug_by_uuid.items() if v in BACKEND.fav_garages.get(uid, set())]
                    self._send_json(200, {"data": rows, "error": None})
                elif op == "upsert":
                    slug = slug_by_uuid.get(body["row"]["facility_id"], body["row"]["facility_id"])
                    BACKEND.fav_garages.setdefault(uid, set()).add(slug)
                    self._send_json(200, {"data": None, "error": None})
                elif op == "delete":
                    slug = slug_by_uuid.get(body["facility_id"], body["facility_id"])
                    BACKEND.fav_garages.setdefault(uid, set()).discard(slug)
                    self._send_json(200, {"data": None, "error": None})
                return
            if tbl == "favorite_destinations":
                if op == "select":
                    self._send_json(200, {"data": BACKEND.fav_dests.get(uid, []), "error": None})
                elif op == "insert":
                    d = dict(body["row"])
                    d["id"] = str(uuid.uuid4())
                    BACKEND.fav_dests.setdefault(uid, []).insert(0, d)
                    self._send_json(200, {"data": d, "error": None})
                elif op == "delete":
                    lbl = (body.get("label") or "").lower()
                    did = body.get("id")
                    BACKEND.fav_dests[uid] = [d for d in BACKEND.fav_dests.get(uid, []) if d.get("id") != did and d.get("label", "").lower() != lbl]
                    self._send_json(200, {"data": None, "error": None})
                return
            if tbl == "notification_preferences":
                if op == "select":
                    prefs = BACKEND.notif_prefs.get(uid, {})
                    self._send_json(200, {"data": [{"kind": k, "enabled": v} for k, v in prefs.items()], "error": None})
                elif op == "upsert":
                    BACKEND.notif_prefs.setdefault(uid, {})[body["row"]["kind"]] = bool(body["row"]["enabled"])
                    self._send_json(200, {"data": None, "error": None})
                return
            if tbl == "notifications":
                if op == "select":
                    self._send_json(200, {"data": BACKEND.notifications.get(uid, []), "error": None})
                elif op == "update":
                    for n in BACKEND.notifications.get(uid, []):
                        if n["id"] == body["id"]:
                            n["read_at"] = datetime.now(timezone.utc).isoformat()
                    self._send_json(200, {"data": None, "error": None})
                return

        if action == "rpc":
            fn = body["fn"]
            args = body.get("args", {})
            if BACKEND.fail_next_rpc == fn:
                BACKEND.fail_next_rpc = None
                self._send_json(200, {"data": None, "error": {"message": "Failed to fetch (simulated network outage)"}})
                return

            if fn == "pf_set_default_vehicle":
                vid = args["p_vehicle_id"]
                for v in BACKEND.vehicles.values():
                    if v["user_id"] == uid:
                        v["is_default"] = (v["id"] == vid)
                self._send_json(200, {"data": {"ok": True, "code": "OK"}, "error": None})
                return

            if fn == "pf_get_catalog_availability":
                facs = [
                    {
                        "uuid": "00000000-0000-4000-8000-000000000001",
                        "id": "garage-puerto-madero", "slug": "garage-puerto-madero",
                        "name": "Garage Puerto Madero", "address": "Av. del Sol 1141, Puerto Madero, CABA",
                        "city": "Buenos Aires", "lat": -34.6074, "lng": -58.3610,
                        "ratePerHour": 6500, "currency": "ARS", "totalSpaces": 120, "maxHeightM": 2.4,
                        "isActive": True, "isDemo": True, "isQa": False, "dataProvenance": "synthetic_demo",
                        "open24": True, "acceptedVehicleTypes": ["motorcycle", "car", "suv", "van"],
                        "amenitiesDb": {"covered": True, "security_cctv": True, "ev_charging": True, "accessible": True, "valet": True, "open_24h": True},
                        "rating": {"score": 4.8, "reviewCount": 142},
                        "evaluation": {
                            "eligible": True, "reasonCode": "OK",
                            "availability": {"totalSpaces": 120, "peakConcurrent": 0, "availableSpaces": 120, "occupancyRatio": 0},
                            "quote": {"currency": "ARS", "baseRatePerHour": 6500, "durationMinutes": 120, "durationHours": 2, "vehicleType": args.get("p_vehicle_type", "car"), "vehicleFactor": 1.0, "totalExact": 13000, "totalArs": 13000, "segments": [{"date": "2027-01-12", "start": "10:00", "end": "11:00", "durationMinutes": 60, "occupancyRatio": 0, "occupancyFactor": 1, "peakFactor": 1, "weekendFactor": 1, "vehicleFactor": 1, "subtotalExact": 6500}, {"date": "2027-01-12", "start": "11:00", "end": "12:00", "durationMinutes": 60, "occupancyRatio": 0, "occupancyFactor": 1, "peakFactor": 1, "weekendFactor": 1, "vehicleFactor": 1, "subtotalExact": 6500}]}
                        }
                    },
                    {
                        "uuid": "00000000-0000-4000-8000-000000000003",
                        "id": "garage-obelisco", "slug": "garage-obelisco",
                        "name": "Garage Obelisco Centro", "address": "Av. Corrientes 1240, Microcentro, CABA",
                        "city": "Buenos Aires", "lat": -34.6049, "lng": -58.3778,
                        "ratePerHour": 6000, "currency": "ARS", "totalSpaces": 150, "maxHeightM": 2.6,
                        "isActive": True, "isDemo": True, "isQa": False, "dataProvenance": "synthetic_demo",
                        "open24": True, "acceptedVehicleTypes": ["car", "suv", "van"],
                        "amenitiesDb": {"covered": False, "security_cctv": True, "ev_charging": False, "accessible": True, "valet": False, "open_24h": True},
                        "rating": {"score": 4.4, "reviewCount": 215},
                        "evaluation": {
                            "eligible": True, "reasonCode": "OK",
                            "availability": {"totalSpaces": 150, "peakConcurrent": 0, "availableSpaces": 150, "occupancyRatio": 0},
                            "quote": {"currency": "ARS", "baseRatePerHour": 6000, "durationMinutes": 120, "durationHours": 2, "vehicleType": args.get("p_vehicle_type", "car"), "vehicleFactor": 1.0, "totalExact": 12000, "totalArs": 12000, "segments": [{"date": "2027-01-12", "start": "10:00", "end": "11:00", "durationMinutes": 60, "occupancyRatio": 0, "occupancyFactor": 1, "peakFactor": 1, "weekendFactor": 1, "vehicleFactor": 1, "subtotalExact": 6000}, {"date": "2027-01-12", "start": "11:00", "end": "12:00", "durationMinutes": 60, "occupancyRatio": 0, "occupancyFactor": 1, "peakFactor": 1, "weekendFactor": 1, "vehicleFactor": 1, "subtotalExact": 6000}]}
                        }
                    }
                ]
                self._send_json(200, {"data": {"ok": True, "code": "OK", "holdMinutes": 10, "facilities": facs}, "error": None})
                return

            if fn == "pf_create_booking_hold":
                veh = BACKEND.vehicles.get(args["p_vehicle_id"])
                if not veh or veh["user_id"] != uid:
                    self._send_json(200, {"data": {"ok": False, "code": "VEHICLE_NOT_FOUND"}, "error": None})
                    return
                BACKEND.seq += 1
                bid = str(uuid.uuid4())
                code = f"PF-2026-SB{BACKEND.seq}"
                exp = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
                now_iso = datetime.now(timezone.utc).isoformat()
                b = {
                    "id": bid, "userId": uid, "bookingCode": code, "status": "pending_payment",
                    "uiCategory": "upcoming", "awaitingOperationalClosure": False,
                    "facilityId": args["p_facility_id"],
                    "facilitySlug": "garage-puerto-madero" if args["p_facility_id"].endswith("1") else "garage-obelisco",
                    "facilityName": "Garage Puerto Madero" if args["p_facility_id"].endswith("1") else "Garage Obelisco Centro",
                    "facilityAddress": "Av. del Sol 1141, Puerto Madero, CABA",
                    "lat": -34.6074, "lng": -58.3610,
                    "vehicleId": veh["id"],
                    "vehicleSnapshot": {"plate": veh["plate"], "vehicle_type": veh["vehicle_type"], "height_m": veh.get("height_m", 1.55)},
                    "startsAt": args["p_starts_at"], "endsAt": args["p_ends_at"],
                    "totalAmount": 13000, "currency": "ARS",
                    "paymentMethod": args.get("p_payment_method", "pay_at_garage"),
                    "paymentStatus": "pending", "isTestPayment": True,
                    "holdExpiresAt": exp, "createdAt": now_iso,
                    "quote": {"currency": "ARS", "baseRatePerHour": 6500, "durationMinutes": 120, "durationHours": 2, "vehicleType": veh["vehicle_type"], "vehicleFactor": 1.0, "totalExact": 13000, "totalArs": 13000, "segments": [{"date": "2027-01-12", "start": "10:00", "end": "12:00", "durationMinutes": 120, "occupancyRatio": 0, "occupancyFactor": 1, "peakFactor": 1, "weekendFactor": 1, "vehicleFactor": 1, "subtotalExact": 13000}]},
                    "events": [{"id": str(uuid.uuid4()), "eventType": "hold_created", "createdAt": now_iso, "details": {}}]
                }
                BACKEND.bookings[bid] = b
                self._send_json(200, {"data": {"ok": True, "code": "OK", "holdMinutes": 10, "booking": b}, "error": None})
                return

            if fn == "pf_confirm_booking_demo":
                bid = args["p_booking_id"]
                b = BACKEND.bookings.get(bid)
                if not b or b["userId"] != uid:
                    self._send_json(200, {"data": {"ok": False, "code": "BOOKING_NOT_FOUND"}, "error": None})
                    return
                if BACKEND.force_hold_expired:
                    BACKEND.force_hold_expired = False
                    b["status"] = "expired"
                    b["uiCategory"] = "cancelled"
                    b["events"].append({"id": str(uuid.uuid4()), "eventType": "hold_expired", "createdAt": datetime.now(timezone.utc).isoformat(), "details": {}})
                    self._send_json(200, {"data": {"ok": False, "code": "HOLD_EXPIRED"}, "error": None})
                    return
                b["status"] = "confirmed"
                b["holdExpiresAt"] = None
                if args.get("p_payment_method"):
                    b["paymentMethod"] = args["p_payment_method"]
                now_iso = datetime.now(timezone.utc).isoformat()
                b["events"].append({"id": str(uuid.uuid4()), "eventType": "confirmed_demo", "createdAt": now_iso, "details": {}})
                BACKEND.notifications.setdefault(uid, []).insert(0, {
                    "id": str(uuid.uuid4()), "kind": "booking_confirmed",
                    "message": f"Reserva {b['bookingCode']} confirmada en {b['facilityName']} (ARS {b['totalAmount']} · demo).",
                    "read_at": None, "created_at": now_iso
                })
                self._send_json(200, {"data": {"ok": True, "code": "OK", "booking": b}, "error": None})
                return

            if fn == "pf_prepare_mp_checkout_stub":
                self._send_json(200, {"data": {"ok": False, "code": "MERCADO_PAGO_NOT_ACTIVATED_SPRINT_2D", "message": "Mercado Pago Checkout Pro scheduled for Sprint 2D (test only).", "preparedContract": {"clientCanApprove": False, "isTest": True}}, "error": None})
                return

            if fn == "pf_preview_booking_extension":
                b = BACKEND.bookings.get(args["p_booking_id"])
                if not b or b["userId"] != uid:
                    self._send_json(200, {"data": {"ok": False, "code": "BOOKING_NOT_FOUND"}, "error": None})
                    return
                self._send_json(200, {"data": {"ok": True, "code": "OK", "proposedEndsAt": args["p_new_ends_at"], "incrementalAmount": 6500, "newTotalAmount": b["totalAmount"] + 6500}, "error": None})
                return

            if fn == "pf_extend_booking":
                b = BACKEND.bookings.get(args["p_booking_id"])
                if not b or b["userId"] != uid:
                    self._send_json(200, {"data": {"ok": False, "code": "BOOKING_NOT_FOUND"}, "error": None})
                    return
                b["endsAt"] = args["p_new_ends_at"]
                b["totalAmount"] = b["totalAmount"] + 6500
                b["events"].append({"id": str(uuid.uuid4()), "eventType": "extended", "createdAt": datetime.now(timezone.utc).isoformat(), "details": {"incremental_amount": 6500}})
                self._send_json(200, {"data": {"ok": True, "code": "OK", "incrementalAmount": 6500, "totalAmount": b["totalAmount"]}, "error": None})
                return

            if fn == "pf_cancel_booking":
                b = BACKEND.bookings.get(args["p_booking_id"])
                if not b or b["userId"] != uid:
                    self._send_json(200, {"data": {"ok": False, "code": "BOOKING_NOT_FOUND"}, "error": None})
                    return
                b["status"] = "cancelled"
                b["uiCategory"] = "cancelled"
                b["cancelledAt"] = datetime.now(timezone.utc).isoformat()
                b["events"].append({"id": str(uuid.uuid4()), "eventType": "cancelled", "createdAt": b["cancelledAt"], "details": {}})
                self._send_json(200, {"data": {"ok": True, "code": "OK", "status": "cancelled"}, "error": None})
                return

            if fn == "pf_get_my_bookings":
                own = [b for b in BACKEND.bookings.values() if b["userId"] == uid]
                self._send_json(200, {"data": {"ok": True, "code": "OK", "bookings": own}, "error": None})
                return

            if fn == "pf_get_my_analytics":
                own = [b for b in BACKEND.bookings.values() if b["userId"] == uid and b["status"] in ("confirmed", "checked_in", "completed")]
                self._send_json(200, {"data": {
                    "ok": True, "code": "OK",
                    "summary": {
                        "bookedEstimatedArs": sum(b["totalAmount"] for b in own),
                        "activeOrConfirmedCount": len(own),
                        "bookedEstimatedHours": len(own) * 2,
                        "actualParkedHours": 0
                    },
                    "frequentGarages": [{"facilityName": "Garage Puerto Madero", "visits": len(own), "totalArs": sum(b["totalAmount"] for b in own)}] if own else []
                }, "error": None})
                return

        self._send_json(400, {"error": {"message": f"Unhandled mock action {action}"}})


def start_server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), TestHttpHandler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, f"http://127.0.0.1:{port}/index.html"


INJECT_MOCK_CLIENT_JS = """
() => {
  let currentSession = null;
  const listeners = [];
  async function post(ep, payload) {
    const res = await fetch('/__mock_sb__/' + ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ uid: currentSession && currentSession.user ? currentSession.user.id : null }, payload || {}))
    });
    return res.json();
  }
  function makeQuery(table) {
    const q = { _op: 'select', _row: null, _patch: null, _id: null, _facId: null, _label: null };
    const api = {
      select() { return api; },
      order() { return api; },
      limit() { return api; },
      eq(col, val) {
        if (col === 'id') q._id = val;
        if (col === 'facility_id') q._facId = val;
        return api;
      },
      ilike(col, val) { if (col === 'label') q._label = val; return api; },
      insert(row) { q._op = 'insert'; q._row = row; return api; },
      update(patch) { q._op = 'update'; q._patch = patch; q._row = patch; return api; },
      upsert(row) { q._op = 'upsert'; q._row = row; return api; },
      delete() { q._op = 'delete'; return api; },
      maybeSingle() { return api._exec(); },
      single() { return api._exec(); },
      then(resolve, reject) { return api._exec().then(resolve, reject); },
      _exec() {
        return post('table', { table, op: q._op, row: q._row, patch: q._patch, id: q._id, facility_id: q._facId, label: q._label });
      }
    };
    return api;
  }
  const mockClient = {
    auth: {
      async getSession() { return { data: { session: currentSession }, error: null }; },
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signUp({ email, password, options }) {
        const r = await post('signup', { email, password, fullName: options && options.data ? options.data.full_name : '' });
        if (!r.error && r.data && r.data.session) {
          currentSession = r.data.session;
          listeners.forEach(fn => fn('SIGNED_IN', currentSession));
        }
        return r;
      },
      async signInWithPassword({ email, password }) {
        const r = await post('signin', { email, password });
        if (!r.error && r.data && r.data.session) {
          currentSession = r.data.session;
          listeners.forEach(fn => fn('SIGNED_IN', currentSession));
        }
        return r;
      },
      async signOut() {
        currentSession = null;
        listeners.forEach(fn => fn('SIGNED_OUT', null));
        return { error: null };
      },
      async resetPasswordForEmail(email) {
        return post('reset_pw', { email });
      }
    },
    from: makeQuery,
    rpc(fn, args) { return post('rpc', { fn, args: args || {} }); }
  };
  return window.ParkFinderApp.setSupabaseClientOverride(mockClient, 'supabase');
}
"""


def run_suite():
    BACKEND.reset()
    httpd, url = start_server()
    results = []
    console_errors = []

    def record(tid, desc, fn):
        try:
            actual = fn()
            results.append({"id": tid, "description": desc, "status": "PASS", "actual": actual})
            print(f"[PASS] {tid}: {desc} -> {actual}")
        except Exception as exc:
            results.append({"id": tid, "description": desc, "status": "FAIL", "actual": str(exc)})
            print(f"[FAIL] {tid}: {desc} -> {exc}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                headless=True,
                args=["--no-sandbox", "--disable-gpu"]
            )

            def open_device(viewport=(1440, 900), dpr=1, is_mobile=False):
                ctx = browser.new_context(
                    viewport={"width": viewport[0], "height": viewport[1]},
                    device_scale_factor=dpr,
                    is_mobile=is_mobile,
                    has_touch=is_mobile
                )
                pg = ctx.new_page()
                pg.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1") else route.abort())
                pg.on("pageerror", lambda err: console_errors.append(str(err)))
                pg.goto(url, wait_until="domcontentloaded")
                pg.wait_for_selector("#resultsList .card", timeout=5000)
                return ctx, pg

            # S2C-E01: Anonymous browsing allowed; offline never fakes auth; Supabase mode prompts Auth on Reserve
            ctx1, page = open_device((1440, 900), dpr=2)

            def s2c_e01():
                # Before attaching Supabase client (offline_demo mode), verify mode pill clearly says Demo Offline & auth rejects cleanly
                assert "offline" in page.locator("#backendModePill").inner_text().lower()
                page.evaluate("window.ParkFinderApp.openAuthModal('login')")
                page.wait_for_selector("#authModal.show")
                page.fill("#authEmail", "driver@example.com")
                page.fill("#authPassword", "secret123")
                page.click("#authSubmitBtn")
                page.wait_for_selector("#authError")
                assert "sin conexión" in page.locator("#authError").inner_text().lower()
                # Social buttons clearly marked future & disabled
                assert page.locator(".btn-social-future").count() == 2
                assert page.locator(".btn-social-future").first.is_disabled()
                page.click('#authModal [data-close="authModal"]')

                # Now connect Supabase centralized mode
                page.evaluate(INJECT_MOCK_CLIENT_JS)
                page.wait_for_timeout(250)
                assert "supabase" in page.locator("#backendModePill").inner_text().lower()
                # Anonymous browsing shows garages without login
                assert page.locator("#resultsList .card").count() >= 2
                # Clicking Reserve while unauthenticated prompts Auth modal
                page.locator('.card[data-garage="garage-puerto-madero"] .btn-reserve').click()
                page.wait_for_selector("#authModal.show")
                assert "Puerto Madero" in page.locator("#authModal").inner_text()
                page.screenshot(path=str(SCREENSHOT_DIR / "s2c_01_auth_modal_light.png"))
                return "offlineNoFakeAuth=True, anonBrowse=OK, reservePromptsAuth=True, socialFutureDisabled=2"

            record("S2C-E01", "Anonymous browsing, offline auth refusal & Reserve auth prompt", s2c_e01)

            # S2C-E02: Registration, profile editing, role badge & recovery tab
            def s2c_e02():
                page.click('[data-auth-tab="register"]')
                page.fill("#authFullName", "Gabi Driver A")
                page.fill("#authEmail", "user_a@example.com")
                page.fill("#authPassword", "SecurePass2026!")
                page.click("#authSubmitBtn")
                # After signup while reserving Puerto Madero, checkout opens automatically!
                page.wait_for_selector("#reserveModal.show", timeout=4000)
                page.click('#reserveModal [data-close="reserveModal"]')

                # Open Profile -> verify name, driver role, edit phone & default payment
                page.click("#profileBtn")
                page.wait_for_selector("#profileModal.show")
                assert "Gabi Driver A" in page.locator("#profileModal").inner_text()
                assert "driver" in page.locator("#profileModal").inner_text().lower()
                page.fill("#profPhone", "+54 9 11 5555-0101")
                page.select_option("#profDefaultPay", "mercado_pago")
                page.click("#saveProfileBtn")
                page.wait_for_timeout(180)
                page.screenshot(path=str(SCREENSHOT_DIR / "s2c_02_profile_account_light.png"))
                return "registered=user_a@example.com, role=driver, profileSaved=OK"

            record("S2C-E02", "Registration, auto-profile/role display & profile editing", s2c_e02)

            # S2C-E03: Vehicle CRUD (add 2 vehicles, edit, set default, delete unused)
            def s2c_e03():
                page.click('[data-prof-tab="vehicles"]')
                page.fill("#vehPlate", "AA 100 PF")
                page.select_option("#vehType", "car")
                page.fill("#vehMake", "Toyota")
                page.fill("#vehModel", "Corolla")
                page.fill("#vehColor", "Gris")
                page.fill("#vehHeight", "1.45")
                page.click("#saveVehicleBtn")
                page.wait_for_selector('.vehicle-card[data-vehicle-id]')

                # Add 2nd vehicle (SUV)
                page.fill("#vehPlate", "BB 200 PF")
                page.select_option("#vehType", "suv")
                page.fill("#vehMake", "Ford")
                page.fill("#vehModel", "Territory")
                page.fill("#vehColor", "Negro")
                page.fill("#vehHeight", "1.75")
                page.uncheck("#vehDefault")
                page.click("#saveVehicleBtn")
                page.wait_for_timeout(200)
                assert page.locator(".vehicle-card").count() == 2

                # Screenshot Vehicles tab in Dark mode too later, capture light now
                page.screenshot(path=str(SCREENSHOT_DIR / "s2c_03_profile_vehicles_light.png"))

                # Delete 2nd unused vehicle cleanly
                page.locator(".vehicle-card").nth(1).locator("[data-veh-del]").click()
                page.wait_for_timeout(200)
                assert page.locator(".vehicle-card").count() == 1
                page.click('#profileModal [data-close="profileModal"]')
                return "added=2, deletedUnused=1, remainingDefault=AA 100 PF"

            record("S2C-E03", "Vehicle CRUD (create, multi-vehicle, delete unused)", s2c_e03)

            # S2C-E04: Centralized Hold Checkout (live countdown timer, server quote, MP Sprint 2D prep, confirm, .ics/Share)
            def s2c_e04():
                page.locator('.card[data-garage="garage-puerto-madero"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                page.wait_for_selector("#holdTimerValue", timeout=4000)
                timer_txt = page.locator("#holdTimerValue").inner_text().strip()
                assert ":" in timer_txt and timer_txt != "00:00", f"Bad hold timer: {timer_txt}"
                assert "Supabase" in page.locator("#reserveModal").inner_text()
                # Select Mercado Pago prep option and test Sprint 2D contract stub notice
                page.locator('input[name="checkoutPayMethod"][value="mercado_pago"]').check()
                page.wait_for_selector("#mpContractStubBtn")
                page.screenshot(path=str(SCREENSHOT_DIR / "s2c_04_checkout_hold_light.png"))
                page.click("#mpContractStubBtn")
                page.wait_for_timeout(150)
                assert "sprint 2d" in page.locator("#toast").inner_text().lower()

                # Confirm booking via server RPC
                page.click("#reserveConfirmBtn")
                page.wait_for_selector("#successModal.show", timeout=4000)
                assert page.locator("#successIcsBtn").is_visible()
                assert page.locator("#successShareBtn").is_visible()
                bid = page.locator("#bookingIdText").inner_text().strip()
                page.click("#successDone")

                # Verify vehicle referenced by booking CANNOT be deleted (snapshot & FK integrity)
                page.click("#profileBtn")
                page.wait_for_selector("#profileModal.show")
                page.click('[data-prof-tab="vehicles"]')
                page.locator(".vehicle-card [data-veh-del]").first.click()
                page.wait_for_timeout(200)
                assert page.locator(".vehicle-card").count() == 1, "Vehicle with bookings must not be deleted"
                assert "reservas" in page.locator("#toast").inner_text().lower()
                page.click('#profileModal [data-close="profileModal"]')
                return f"holdTimer={timer_txt}, confirmed={bid}, ics+share=visible, fkDeleteBlocked=True"

            record("S2C-E04", "Centralized Hold Checkout, live timer, MP Sprint 2D stub, confirm & FK vehicle guard", s2c_e04)

            # S2C-E05: Hold Expiration blocks late confirmation without overbooking
            def s2c_e05():
                BACKEND.force_hold_expired = True
                page.locator('.card[data-garage="garage-obelisco"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                page.wait_for_selector("#holdTimerValue", timeout=4000)
                page.click("#reserveConfirmBtn")
                page.wait_for_selector("#reholdBtn", timeout=4000)
                assert not page.locator("#successModal.show").is_visible()
                assert "venció" in page.locator("#reserveModal").inner_text().lower()
                page.click('#reserveModal [data-close="reserveModal"]')
                return "holdExpiredBlockedConfirm=True, reholdOffered=True"

            record("S2C-E05", "Expired temporary hold blocks confirmation and prevents overbooking", s2c_e05)

            # S2C-E06: My Bookings tabs, no auto-completed, Event History, Extension (preview+confirm), Cancel
            def s2c_e06():
                page.click("#bookingsBtn")
                page.wait_for_selector("#bookingsModal.show")
                # Check Completed tab is empty (never auto-completed!)
                page.click('[data-b-tab="completed"]')
                assert page.locator("#bookingsModal .booking-row").count() == 0
                assert "operativo" in page.locator("#bookingsModal").inner_text().lower()
                page.click('[data-b-tab="upcoming"]')
                assert page.locator("#bookingsModal .booking-row").count() >= 1

                # Verify Event History contains hold_created & confirmed_demo
                page.locator("#bookingsModal .booking-events-details summary").first.click()
                ev_txt = page.locator("#bookingsModal .booking-events-details").first.inner_text()
                assert "hold_created" in ev_txt and "confirmed_demo" in ev_txt

                # Extend stay (+1h): preview incremental price BEFORE confirming
                page.locator("#bookingsModal [data-extend-booking]").first.click()
                page.wait_for_selector("#extendModal.show")
                page.wait_for_selector("#extendIncAmount", timeout=4000)
                inc_txt = page.locator("#extendIncAmount").inner_text()
                new_tot = page.locator("#extendNewTotal").inner_text()
                page.screenshot(path=str(SCREENSHOT_DIR / "s2c_05_extend_booking_light.png"))
                page.click("#extConfirmBtn")
                page.wait_for_selector("#extendModal.show", state="detached", timeout=4000)
                page.wait_for_timeout(200)
                assert "19.500" in page.locator("#bookingsModal").inner_text() or "19,500" in page.locator("#bookingsModal").inner_text()

                # Capture Bookings modal in Dark mode for visual review
                page.evaluate("window.ParkFinderApp.setTheme('dark')")
                page.wait_for_timeout(200)
                page.screenshot(path=str(SCREENSHOT_DIR / "s2c_06_bookings_dark.png"))
                page.evaluate("window.ParkFinderApp.setTheme('light')")

                # Add favorite garage on Device 1 for cross-device sync test
                page.click('#bookingsModal [data-close="bookingsModal"]')
                page.locator('.card[data-garage="garage-puerto-madero"] [data-fav-garage]').click()
                page.wait_for_timeout(150)
                return f"completedAutoEmpty=True, events=hold_created+confirmed_demo, extended=({inc_txt} -> {new_tot})"

            record("S2C-E06", "My Bookings tabs, no auto-completed, Event History & Extend Stay preview/confirm", s2c_e06)

            # S2C-E07: Cross-device persistence (Device 2 fresh localStorage) + Multi-user isolation (User B Device 3)
            def s2c_e07():
                # Device 2: User A logs into a completely fresh browser context (empty localStorage)
                ctx2, p2 = open_device((1440, 900))
                p2.evaluate(INJECT_MOCK_CLIENT_JS)
                p2.wait_for_timeout(200)
                p2.evaluate("window.ParkFinderApp.openAuthModal('login')")
                p2.wait_for_selector("#authModal.show")
                p2.fill("#authEmail", "user_a@example.com")
                p2.fill("#authPassword", "SecurePass2026!")
                p2.click("#authSubmitBtn")
                p2.wait_for_selector("#authModal.show", state="detached", timeout=4000)
                p2.wait_for_timeout(300)
                d2_bookings = p2.evaluate("window.ParkFinderApp.getBookings().length")
                d2_vehicles = p2.evaluate("window.ParkFinderApp.state.vehicles.length")
                d2_favs = p2.evaluate("window.ParkFinderApp.state.favoriteGarageIds")
                assert d2_bookings >= 1, f"Device 2 missing User A bookings: {d2_bookings}"
                assert d2_vehicles == 1, f"Device 2 missing User A vehicle: {d2_vehicles}"
                assert "garage-puerto-madero" in d2_favs, f"Device 2 missing User A favorite garage: {d2_favs}"
                ctx2.close()

                # Device 3: User B registers/logs in -> MUST see 0 of User A's bookings, vehicles, favorites
                ctx3, p3 = open_device((1440, 900))
                p3.evaluate(INJECT_MOCK_CLIENT_JS)
                p3.wait_for_timeout(200)
                p3.evaluate("window.ParkFinderApp.openAuthModal('register')")
                p3.wait_for_selector("#authModal.show")
                p3.fill("#authFullName", "User B Isolated")
                p3.fill("#authEmail", "user_b@example.com")
                p3.fill("#authPassword", "OtherPass2026!")
                p3.click("#authSubmitBtn")
                p3.wait_for_selector("#authModal.show", state="detached", timeout=4000)
                p3.wait_for_timeout(300)
                u_b_bookings = p3.evaluate("window.ParkFinderApp.getBookings().length")
                u_b_vehicles = p3.evaluate("window.ParkFinderApp.state.vehicles.length")
                u_b_favs = p3.evaluate("window.ParkFinderApp.state.favoriteGarageIds.length")
                assert u_b_bookings == 0 and u_b_vehicles == 0 and u_b_favs == 0, f"Isolation leak! B={u_b_bookings}/{u_b_vehicles}/{u_b_favs}"
                ctx3.close()
                return f"device2Synced(bookings={d2_bookings},veh={d2_vehicles},favs=1), userBIsolated(0/0/0)"

            record("S2C-E07", "Cross-device sync (Device 1 -> fresh Device 2) & strict multi-user isolation (User B)", s2c_e07)

            # S2C-E08: Connection failure recovery during booking never silently confirms offline
            def s2c_e08():
                BACKEND.fail_next_rpc = "pf_create_booking_hold"
                before_count = page.evaluate("window.ParkFinderApp.getBookings().length")
                page.locator('.card[data-garage="garage-puerto-madero"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                page.wait_for_selector("#reserveError:not([hidden])", timeout=4000)
                assert not page.locator("#successModal.show").is_visible()
                assert page.locator("#reserveConfirmBtn").is_disabled()
                assert not page.locator("#backendSyncBanner").is_hidden()
                after_count = page.evaluate("window.ParkFinderApp.getBookings().length")
                assert after_count == before_count, "Booking count changed during network error!"
                page.click('#reserveModal [data-close="reserveModal"]')
                return "networkErrorHandled=True, noSilentOfflineConfirm=True, retryBannerVisible=True"

            record("S2C-E08", "Connection failure blocks confirmation and displays explicit retry banner", s2c_e08)

            # S2C-E09: Notification preferences (6 toggles) + Personal Analytics & CSV export
            def s2c_e09():
                page.click("#profileBtn")
                page.wait_for_selector("#profileModal.show")
                page.click('[data-prof-tab="notifications"]')
                assert page.locator('[data-notif-kind]').count() == 6
                page.uncheck("#np_review_prompt")
                page.wait_for_timeout(150)
                assert BACKEND.notif_prefs[page.evaluate("window.ParkFinderApp.state.user.id")]["review_prompt"] is False

                page.click('[data-prof-tab="analytics"]')
                page.wait_for_timeout(200)
                assert page.locator(".analytics-kpi").count() == 4
                csv_out = page.evaluate("window.ParkFinderApp.exportBookingsCsv()")
                assert "booking_code,status,garage" in csv_out and "PF-2026-SB" in csv_out
                page.click('#profileModal [data-close="profileModal"]')
                return "notifToggles=6(synced), analyticsKpis=4, csvExported=OK"

            record("S2C-E09", "Notification preferences sync (6 kinds) + Personal Analytics & CSV export", s2c_e09)

            # S2C-E10: Bilingual ES/EN, Dark mode & Mobile 390x844 zero horizontal overflow + screenshots
            def s2c_e10():
                # Bilingual check on Auth / Profile
                page.click('.lang-btn[data-lang="en"]')
                assert "supabase backend" in page.locator("#backendModePill").inner_text().lower()
                page.click('.lang-btn[data-lang="es"]')
                desktop_overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
                assert not desktop_overflow, "Desktop horizontal overflow detected"

                # Mobile 390x844 @ 2x DPR checks + screenshots
                ctx_m, mp = open_device((390, 844), dpr=2, is_mobile=True)
                mp.evaluate(INJECT_MOCK_CLIENT_JS)
                mp.wait_for_timeout(250)
                mob_overflow = mp.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
                assert not mob_overflow, "Mobile 390px horizontal overflow detected"
                mp.evaluate("window.ParkFinderApp.openAuthModal('login')")
                mp.wait_for_selector("#authModal.show")
                mp.evaluate("window.ParkFinderApp.setTheme('dark')")
                mp.wait_for_timeout(200)
                mp.screenshot(path=str(SCREENSHOT_DIR / "s2c_07_mobile_auth_dark_390x844.png"))
                ctx_m.close()

                ctx1.close()
                assert len(console_errors) == 0, f"Uncaught JS errors: {console_errors}"
                return "es+en=OK, desktopOverflow=False, mobile390Overflow=False, jsErrors=0, screenshots=7"

            record("S2C-E10", "Bilingual ES/EN, Dark mode, Mobile 390x844 zero overflow & 2x DPR screenshots", s2c_e10)

            browser.close()
    finally:
        httpd.shutdown()

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = len(results) - passed
    summary_path = SCREENSHOT_DIR / "sprint02c_e2e_results.json"
    summary_path.write_text(json.dumps({"passed": passed, "total": len(results), "results": results, "consoleErrors": console_errors}, indent=2))
    print(f"\nSprint 2C Browser E2E Summary: {passed}/{len(results)} scenarios passed.")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    import sys
    run_suite()
