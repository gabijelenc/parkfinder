#!/usr/bin/env python3
"""
ParkFinder Sprint 01 — Real-Browser E2E Acceptance Suite (Playwright)
Executes T01 through T10 + ES/EN + responsive mobile + sandbox isolation
directly against index.html served over local HTTP.
"""

import http.server
import json
import os
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
SCREENSHOT_DIR = Path(os.environ.get("PF_SCREENSHOT_DIR", str(REPO_ROOT / "tests" / "screenshots")))
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, format, *args):
        pass


def start_server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, f"http://127.0.0.1:{port}/index.html"


def set_search(page, date_str, arrival, departure, vehicle="car"):
    page.fill("#dateInput", date_str)
    page.dispatch_event("#dateInput", "change")
    page.fill("#arrivalInput", arrival)
    page.dispatch_event("#arrivalInput", "change")
    page.fill("#departureInput", departure)
    page.dispatch_event("#departureInput", "change")
    page.select_option("#vehicleSel", vehicle)
    page.dispatch_event("#vehicleSel", "change")


def book_garage_via_ui(page, garage_id, plate="AA 123 BB"):
    btn = page.locator(f'.card[data-garage="{garage_id}"] .btn-reserve')
    btn.click()
    page.wait_for_selector("#reserveModal.show", timeout=3000)
    page.fill("#plateInput", plate)
    page.click("#reserveConfirmBtn")
    page.wait_for_selector("#successModal.show", timeout=3000)
    booking_id = page.locator("#bookingIdText").inner_text().strip()
    locked_total = page.locator("#successLockedTotal").inner_text().strip()
    page.click("#successDone")
    page.wait_for_selector("#successModal.show", state="detached", timeout=3000)
    return booking_id, locked_total


def run_suite():
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
            context = browser.new_context(viewport={"width": 1366, "height": 900})
            page = context.new_page()

            # Block external network calls to keep tests fast, deterministic, and offline-safe
            def route_handler(route):
                req_url = route.request.url
                if req_url.startswith("http://127.0.0.1"):
                    route.continue_()
                else:
                    route.abort()

            page.route("**/*", route_handler)
            page.on("pageerror", lambda err: console_errors.append(str(err)))

            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("#resultsList .card", timeout=5000)

            # Capture initial desktop UI screenshot (normal mode)
            page.screenshot(path=str(SCREENSHOT_DIR / "01_desktop_normal_es.png"), full_page=True)

            # Seed one real user booking in normal mode to verify sandbox isolation preserves user data!
            set_search(page, "2026-12-16", "10:00", "12:00", "car")
            real_bid, _ = book_garage_via_ui(page, "garage-obelisco", "US 999 ER")

            # Enter isolated QA Sandbox (capacity 1 & capacity 2 garages)
            page.click("#statusBtn")
            page.wait_for_selector("#statusModal.show")
            page.click("#enterSandboxBtn")
            page.wait_for_selector("#sandboxBanner:not([hidden])")

            # T01: capacity 1, reserve 08:00-11:00 and 11:00-13:00; both accepted
            def t01():
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "08:00", "11:00", "car")
                b1, _ = book_garage_via_ui(page, "qa-cap1-centro", "T01 001")
                set_search(page, "2026-12-15", "11:00", "13:00", "car")
                b2, _ = book_garage_via_ui(page, "qa-cap1-centro", "T01 002")
                count = page.evaluate("window.ParkFinderApp.getBookings().length")
                assert count == 2, f"Expected 2 bookings, got {count}"
                return f"b1={b1}, b2={b2}, sandboxBookings={count}"

            record("T01", "Cap 1 adjacent intervals 08:00-11:00 & 11:00-13:00 accepted", t01)

            # T02: capacity 1, reserve 08:00-11:00 then 10:00-12:00; reject second
            def t02():
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "08:00", "11:00", "car")
                b1, _ = book_garage_via_ui(page, "qa-cap1-centro", "T02 001")
                set_search(page, "2026-12-15", "10:00", "12:00", "car")
                card = page.locator('.card[data-garage="qa-cap1-centro"]')
                assert card.get_attribute("data-eligible") == "false"
                assert card.get_attribute("data-reason") == "NO_AVAILABILITY"
                assert card.locator(".btn-reserve").is_disabled()
                count = page.evaluate("window.ParkFinderApp.getBookings().length")
                assert count == 1
                return f"b1={b1}, secondBlocked=NO_AVAILABILITY, count={count}"

            record("T02", "Cap 1 overlapping 08:00-11:00 then 10:00-12:00 rejected", t02)

            # T03: capacity 2, existing 08:00-09:00 and 10:00-11:00; request 08:00-11:00 -> accept exactly 1 extra
            def t03():
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "08:00", "09:00", "car")
                book_garage_via_ui(page, "qa-cap2-obelisco", "T03 001")
                set_search(page, "2026-12-15", "10:00", "11:00", "car")
                book_garage_via_ui(page, "qa-cap2-obelisco", "T03 002")
                set_search(page, "2026-12-15", "08:00", "11:00", "car")
                avail_text = page.locator('.card[data-garage="qa-cap2-obelisco"] .stats').inner_text()
                assert "1 / 2" in avail_text, f"Expected 1 / 2 available, got: {avail_text}"
                extra1, _ = book_garage_via_ui(page, "qa-cap2-obelisco", "T03 003")
                # Now 08:00-11:00 must show 0 / 2 and be disabled
                card = page.locator('.card[data-garage="qa-cap2-obelisco"]')
                assert card.get_attribute("data-eligible") == "false"
                assert card.get_attribute("data-reason") == "NO_AVAILABILITY"
                assert card.locator(".btn-reserve").is_disabled()
                return f"availBefore=1/2, extra1={extra1}, extra2=blocked(0/2)"

            record("T03", "Cap 2 peak concurrent overlaps allow exactly 1 extra booking", t03)

            # T04: cancel active booking releases interval & retains audit status
            def t04():
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "08:00", "11:00", "car")
                b1, _ = book_garage_via_ui(page, "qa-cap1-centro", "T04 001")
                assert page.locator('.card[data-garage="qa-cap1-centro"] .btn-reserve').is_disabled()
                page.click("#bookingsBtn")
                page.wait_for_selector("#bookingsModal.show")
                page.click(f'[data-cancel-booking="{b1}"]')
                # Audit row must remain visible with status cancelled
                row = page.locator(f'.booking-row[data-booking-id="{b1}"]')
                assert row.get_attribute("data-booking-status") == "cancelled"
                page.screenshot(path=str(SCREENSHOT_DIR / "04_bookings_audit_cancelled.png"))
                page.click('#bookingsModal [data-close="bookingsModal"]')
                # Capacity released -> can book again!
                assert not page.locator('.card[data-garage="qa-cap1-centro"] .btn-reserve').is_disabled()
                b2, _ = book_garage_via_ui(page, "qa-cap1-centro", "T04 002")
                return f"cancelled={b1}(retained), rebooked={b2}"

            record("T04", "Cancel booking releases interval and retains cancelled audit status", t04)

            # T05: reject invalid date/time, negative duration, incompatible vehicle and out-of-hours
            def t05():
                page.click("#sandboxResetBtn")
                # Negative duration
                set_search(page, "2026-12-15", "12:00", "10:00", "car")
                assert not page.locator("#intervalError").is_hidden()
                # Invalid empty date
                set_search(page, "", "08:00", "10:00", "car")
                assert not page.locator("#intervalError").is_hidden()
                # Incompatible vehicle (SUV at qa-cap1-centro which only accepts moto/car, max 1.80m)
                set_search(page, "2026-12-15", "08:00", "10:00", "suv")
                assert page.locator("#intervalError").is_hidden()
                card1 = page.locator('.card[data-garage="qa-cap1-centro"]')
                assert card1.get_attribute("data-eligible") == "false"
                assert card1.get_attribute("data-reason") == "VEHICLE_TYPE_NOT_ACCEPTED"
                assert card1.locator(".btn-reserve").is_disabled()
                # Out-of-hours (21:00-23:00 at qa-cap1-centro which operates 07:00-22:00)
                set_search(page, "2026-12-15", "21:00", "23:00", "car")
                assert card1.get_attribute("data-eligible") == "false"
                assert card1.get_attribute("data-reason") == "OUT_OF_HOURS"
                assert card1.locator(".btn-reserve").is_disabled()
                return "negDuration=blocked, invalidDate=blocked, suvIncompatible=blocked, outOfHours=blocked"

            record("T05", "Reject invalid date, negative duration, incompatible vehicle & out-of-hours", t05)

            # T06: hourly segment dynamic quote (peak/occupancy/vehicle) displayed in modal + car vs SUV
            def t06():
                page.click("#sandboxResetBtn")
                # Add 1 booking 09:00-10:00 on cap 2 -> 50% occupancy in 09-10
                set_search(page, "2026-12-15", "09:00", "10:00", "car")
                book_garage_via_ui(page, "qa-cap2-obelisco", "T06 001")
                # Quote for Car 09:00-11:00
                set_search(page, "2026-12-15", "09:00", "11:00", "car")
                car_card_price = page.locator('.card[data-garage="qa-cap2-obelisco"] .price strong').inner_text()
                # Quote for SUV 09:00-11:00
                set_search(page, "2026-12-15", "09:00", "11:00", "suv")
                suv_card_price = page.locator('.card[data-garage="qa-cap2-obelisco"] .price strong').inner_text()
                assert car_card_price != suv_card_price
                # Open reserve modal and verify transparent segment table
                page.locator('.card[data-garage="qa-cap2-obelisco"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                rows = page.locator("#reserveModal .quote-table tbody tr").count()
                total_modal = page.locator("#reserveQuoteTotal").inner_text()
                assert rows == 2, f"Expected 2 hourly segments, got {rows}"
                assert "18.564" in total_modal or "18,564" in total_modal, f"Unexpected SUV total: {total_modal}"
                page.screenshot(path=str(SCREENSHOT_DIR / "02_reserve_modal_dynamic_quote.png"))
                page.click('#reserveModal [data-close="reserveModal"]')
                return f"car={car_card_price}, suv={suv_card_price}, segments={rows}, modalTotal={total_modal}"

            record("T06", "Transparent hourly segment quote (peak+occupancy+vehicle) & Car vs SUV", t06)

            # T07: changing rate after confirmation cannot change stored price
            def t07():
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "10:00", "12:00", "car")
                bid, locked_before = book_garage_via_ui(page, "qa-cap2-obelisco", "T07 001")
                # Mutate garage rate after confirmation
                page.evaluate("""() => {
                    const g = window.ParkFinderApp.SANDBOX_GARAGES.find(x => x.id === 'qa-cap2-obelisco');
                    g.ratePerHour = 15000;
                    window.ParkFinderApp.renderResults(false);
                }""")
                new_card_price = page.locator('.card[data-garage="qa-cap2-obelisco"] .price strong').inner_text()
                page.click("#bookingsBtn")
                page.wait_for_selector("#bookingsModal.show")
                stored_ui_price = page.locator(f'.booking-row[data-booking-id="{bid}"] .booking-locked-total').inner_text()
                page.click('#bookingsModal [data-close="bookingsModal"]')
                # Restore original sandbox rate
                page.evaluate("""() => {
                    const g = window.ParkFinderApp.SANDBOX_GARAGES.find(x => x.id === 'qa-cap2-obelisco');
                    g.ratePerHour = 6000;
                }""")
                assert stored_ui_price == locked_before, f"Locked price changed! {locked_before} -> {stored_ui_price}"
                assert new_card_price != stored_ui_price
                return f"lockedBefore={locked_before}, lockedAfterRateChange={stored_ui_price}, newCardQuote={new_card_price}"

            record("T07", "Rate change after confirmation preserves locked booking price", t07)

            # T08: storage failure prevents durable confirmation + displays error; normal reload persists bookings
            def t08():
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "10:00", "12:00", "car")
                page.locator('.card[data-garage="qa-cap2-obelisco"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                # Inject failing storage backend
                page.evaluate("""() => {
                    window.ParkFinderApp.setStorageBackend({
                        getItem: () => '[]',
                        setItem: () => { throw new Error('QuotaExceededError simulated'); }
                    });
                }""")
                page.click("#reserveConfirmBtn")
                assert not page.locator("#successModal.show").is_visible(), "Success modal must NOT open on storage failure"
                assert not page.locator("#reserveError").is_hidden(), "Inline storage error must be visible"
                err_text = page.locator("#reserveError").inner_text()
                page.screenshot(path=str(SCREENSHOT_DIR / "05_storage_failure_error.png"))
                page.evaluate("window.ParkFinderApp.restoreStorageBackend()")
                page.click('#reserveModal [data-close="reserveModal"]')

                # Also verify persistence across full page reload in normal mode
                page.click("#sandboxExitBtn")
                page.reload(wait_until="domcontentloaded")
                page.wait_for_selector("#resultsList .card", timeout=5000)
                persisted_ids = page.evaluate("window.ParkFinderApp.getBookings().map(b => b.id)")
                assert real_bid in persisted_ids, f"Real user booking {real_bid} lost after reload/sandbox! Got {persisted_ids}"
                return f"storageErrShown='{err_text[:45]}...', reloadPersisted={real_bid}"

            record("T08", "Storage failure blocks confirmation & shows error; normal bookings persist across reload & sandbox", t08)

            # T09: map unavailable (offline mode + Leaflet blocked); list & bookings remain accessible
            def t09():
                page.check("#offlineSwitch")
                assert not page.locator("#offlineBanner").is_hidden()
                assert not page.locator("#mapDown").is_hidden()
                assert page.locator("#resultsList .card").count() == 8
                set_search(page, "2026-12-17", "10:00", "12:00", "motorcycle")
                bid, _ = book_garage_via_ui(page, "garage-puerto-madero", "T09 001")
                page.screenshot(path=str(SCREENSHOT_DIR / "03_offline_fallback.png"))
                page.uncheck("#offlineSwitch")
                return f"offlineBannerVisible=True, listCards=8, bookedWhileOffline={bid}"

            record("T09", "Map unavailable / offline fallback keeps list, pricing and bookings functional", t09)

            # T10: rapid repeated confirm creates at most 1 booking + local scope disclosure visible
            def t10():
                page.click("#statusBtn")
                page.wait_for_selector("#statusModal.show")
                page.click("#enterSandboxBtn")
                page.click("#sandboxResetBtn")
                set_search(page, "2026-12-15", "10:00", "12:00", "car")
                page.locator('.card[data-garage="qa-cap2-obelisco"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                modal_text = page.locator("#reserveModal").inner_text()
                assert "localStorage" in modal_text, "Local storage scope disclosure missing in reserve modal"
                # Rapidly invoke doReserve() 3 times synchronously in same modal session
                res_codes = page.evaluate("""() => {
                    const r1 = window.ParkFinderApp.doReserve();
                    const r2 = window.ParkFinderApp.doReserve();
                    const r3 = window.ParkFinderApp.doReserve();
                    return [r1.code, r2.code, r3.code];
                }""")
                count = page.evaluate("window.ParkFinderApp.getBookings().length")
                assert count == 1, f"Expected 1 booking on rapid repeat confirm, got {count}"
                assert res_codes[0] == "OK" and res_codes[1] == "DUPLICATE_SUBMISSION"
                page.click("#successDone")
                return f"codes={res_codes}, createdCount={count}, disclosurePresent=True"

            record("T10", "Rapid repeated confirm creates <=1 booking & local-only scope disclosed", t10)

            # Extra check: Bilingual EN switch + Responsive Mobile viewport (390x844) + zero uncaught JS errors
            def ui_i18n_responsive():
                page.click("#sandboxExitBtn")
                page.click('.lang-btn[data-lang="en"]')
                assert page.locator("html").get_attribute("lang") == "en"
                assert "Where are you parking?" in page.locator(".search-card").inner_text()
                page.set_viewport_size({"width": 390, "height": 844})
                page.wait_for_timeout(150)
                has_horiz_overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
                page.screenshot(path=str(SCREENSHOT_DIR / "06_mobile_en_390px.png"), full_page=True)
                assert not has_horiz_overflow, "Horizontal overflow detected on 390px mobile viewport"
                assert len(console_errors) == 0, f"Uncaught page errors: {console_errors}"
                return "lang=en, mobile390Overflow=False, uncaughtErrors=0"

            record("UI-I18N-RESP", "Bilingual EN switch, 390px mobile layout (no overflow), zero uncaught JS errors", ui_i18n_responsive)

            browser.close()
    finally:
        httpd.shutdown()

    passed = sum(1 for r in results if r["status"] == "PASS")
    print(f"\nBrowser E2E Summary: {passed}/{len(results)} scenarios passed.")
    out_json = SCREENSHOT_DIR / "e2e_results.json"
    out_json.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    if passed != len(results):
        sys.exit(1)


if __name__ == "__main__":
    run_suite()
