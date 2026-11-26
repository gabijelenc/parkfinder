#!/usr/bin/env python3
"""
ParkFinder Sprint 02 — Real-Browser E2E Acceptance Suite (Playwright)
Executes S2-T01 through S2-T10 directly against index.html served over local HTTP,
verifies zero uncaught JS errors, zero horizontal overflow, and captures AFTER
comparison screenshots at desktop (1440x900) and mobile (390x844).
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
SCREENSHOT_DIR = Path(os.environ.get(
    "PF_S2_SCREENSHOT_DIR",
    str(REPO_ROOT / "02_trabajo" / "sprint_02" / "screenshots")
))
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


def set_interval(page, arr_date, arr_time, dep_date, dep_time, vehicle="car"):
    page.fill("#dateInput", arr_date)
    page.dispatch_event("#dateInput", "change")
    page.fill("#departureDateInput", dep_date)
    page.dispatch_event("#departureDateInput", "change")
    page.fill("#arrivalInput", arr_time)
    page.dispatch_event("#arrivalInput", "change")
    page.fill("#departureInput", dep_time)
    page.dispatch_event("#departureInput", "change")
    page.select_option("#vehicleSel", vehicle)
    page.dispatch_event("#vehicleSel", "change")


def book_garage(page, garage_id, plate="S2 100 AA"):
    page.locator(f'.card[data-garage="{garage_id}"] .btn-reserve').click()
    page.wait_for_selector("#reserveModal.show", timeout=3000)
    page.fill("#plateInput", plate)
    page.click("#reserveConfirmBtn")
    page.wait_for_selector("#successModal.show", timeout=3000)
    bid = page.locator("#bookingIdText").inner_text().strip()
    total = page.locator("#successLockedTotal").inner_text().strip()
    page.click("#successDone")
    page.wait_for_selector("#successModal.show", state="detached", timeout=3000)
    return bid, total


def capture_live_after_screenshots(url):
    """Captures crisp AFTER screenshots with live OSM tiles (when network allows) for fair visual comparison."""
    net_info = {"liveTilesAttempted": True, "tileResponses200": 0, "uncaughtErrors": []}
    with sync_playwright() as p:
        b = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            headless=True,
            args=["--no-sandbox", "--disable-gpu"]
        )
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda err: net_info["uncaughtErrors"].append(str(err)))
        page.on("response", lambda r: net_info.__setitem__(
            "tileResponses200",
            net_info["tileResponses200"] + (1 if "tile.openstreetmap.org" in r.url and r.status == 200 else 0)
        ))
        try:
            page.goto(url, wait_until="networkidle", timeout=15000)
        except Exception:
            page.goto(url, wait_until="domcontentloaded", timeout=10000)
        page.wait_for_selector("#resultsList .card", timeout=5000)
        page.wait_for_timeout(1200)

        # Desktop main marketplace view (above the fold + full page)
        page.screenshot(path=str(SCREENSHOT_DIR / "after_desktop_1440x900.png"), full_page=False)
        page.screenshot(path=str(SCREENSHOT_DIR / "after_desktop_full.png"), full_page=True)

        # Desktop with expanded card details showing yes/no/unknown amenities & demo provenance
        page.locator('.card[data-garage="garage-palermo-soho"] .btn-toggle-details').click()
        page.wait_for_timeout(180)
        page.locator('.card[data-garage="garage-palermo-soho"]').scroll_into_view_if_needed()
        page.screenshot(path=str(SCREENSHOT_DIR / "after_desktop_card_details.png"), full_page=False)

        # Desktop streamlined reservation modal (quote breakdown collapsed by default)
        page.locator('.card[data-garage="garage-obelisco"] .btn-reserve').click()
        page.wait_for_selector("#reserveModal.show", timeout=3000)
        page.wait_for_timeout(200)
        page.screenshot(path=str(SCREENSHOT_DIR / "after_desktop_reserve_modal.png"), full_page=False)
        page.click('#reserveModal [data-close="reserveModal"]')

        # Mobile 390x844 List view (collapsed search summary + filter chips + first card + floating map toggle)
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(350)
        page.screenshot(path=str(SCREENSHOT_DIR / "after_mobile_390x844.png"), full_page=False)
        page.screenshot(path=str(SCREENSHOT_DIR / "after_mobile_full.png"), full_page=True)

        # Mobile 390x844 Map view via floating toggle
        page.click("#mobileViewToggle")
        page.wait_for_timeout(700)
        page.screenshot(path=str(SCREENSHOT_DIR / "after_mobile_map_390x844.png"), full_page=False)

        b.close()
    return net_info


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
        # Step 1: deterministic offline-safe functional acceptance run (S2-T01..S2-T10)
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                headless=True,
                args=["--no-sandbox", "--disable-gpu"]
            )
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()

            def route_handler(route):
                if route.request.url.startswith("http://127.0.0.1"):
                    route.continue_()
                else:
                    route.abort()

            page.route("**/*", route_handler)
            page.on("pageerror", lambda err: console_errors.append(str(err)))

            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("#resultsList .card", timeout=5000)

            # Pre-seed a legacy V1 booking record on the live origin and reload (verified in S2-T09)
            page.evaluate("""() => {
                localStorage.setItem('parkfinder.v1.bookings', JSON.stringify([{
                    id: 'PF-2026-LEG1',
                    garageId: 'garage-obelisco',
                    garage: 'Garage Obelisco Centro',
                    address: 'Av. Corrientes 1240, Microcentro, CABA',
                    plate: 'LG 001 AA',
                    date: '2026-12-20',
                    arrival: '10:00',
                    hours: 2,
                    cost: 13200,
                    payment: 'simulado'
                }]));
            }""")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#resultsList .card", timeout=5000)

            # S2-T01: combined amenity/price/rating/distance filters + unknown vs no + reset
            def s2_t01():
                set_interval(page, "2026-12-15", "10:00", "2026-12-15", "12:00", "car")
                # Expand Palermo Soho details to verify yes / no / unknown separation
                page.locator('.card[data-garage="garage-palermo-soho"] .btn-toggle-details').click()
                palermo = page.locator('.card[data-garage="garage-palermo-soho"]')
                yes_txt = palermo.locator('[data-amenity-key="covered"] .amenity-state').inner_text()
                no_txt = palermo.locator('[data-amenity-key="valet"] .amenity-state').inner_text()
                unk_txt = palermo.locator('[data-amenity-key="accessible"] .amenity-state').inner_text()
                assert yes_txt != no_txt and no_txt != unk_txt and unk_txt != yes_txt, f"Expected 3 distinct states, got {yes_txt}/{no_txt}/{unk_txt}"

                # Apply combined filters: covered + evCharging + rating >= 4.5 + maxPrice <= 15000 + distance <= 2km
                page.click('#amenityFilters .chip[data-amenity="covered"]')
                page.click('#amenityFilters .chip[data-amenity="evCharging"]')
                page.select_option("#minRatingFilter", "4.5")
                page.select_option("#maxPriceFilter", "15000")
                page.select_option("#maxDistanceFilter", "2")
                # From Obelisco, Puerto Madero is ~1.93 km (covered, EV, 4.8, ARS 13.000); Palermo Soho is ~4.66 km
                cards = page.locator("#resultsList .card")
                assert cards.count() == 1, f"Expected 1 card matching combined filters, got {cards.count()}"
                assert cards.first.get_attribute("data-garage") == "garage-puerto-madero"

                # Impossible filter combo triggers no-results state with clear button
                page.select_option("#maxDistanceFilter", "0.5")
                assert page.locator("#resultsList .card").count() == 0
                assert page.locator("#emptyClearFiltersBtn").is_visible()

                # Reset restores all 8 synthetic garages
                page.click("#emptyClearFiltersBtn")
                assert page.locator("#resultsList .card").count() == 8
                return f"states=({yes_txt}/{no_txt}/{unk_txt}), combined=garage-puerto-madero, emptyResetRestored=8"

            record("S2-T01", "Combined amenity/price/rating/distance filters & unknown-vs-no + reset", s2_t01)

            # S2-T02: unavailable/vehicle-incompatible garages never become bookable through filters
            def s2_t02():
                set_interval(page, "2026-12-15", "10:00", "2026-12-15", "12:00", "van")
                page.click('#amenityFilters .chip[data-amenity="covered"]')
                card_col = page.locator('.card[data-garage="garage-colegiales"]')
                assert card_col.count() == 1
                assert card_col.get_attribute("data-eligible") == "false"
                assert card_col.get_attribute("data-reason") == "VEHICLE_TYPE_NOT_ACCEPTED"
                assert card_col.locator(".btn-reserve").is_disabled()
                # Also check onlyAvailable hides incompatible cards
                page.check("#onlyAvailable")
                assert page.locator('.card[data-garage="garage-colegiales"]').count() == 0
                page.click("#clearFiltersBtn")
                return "colegialesIncompatibleWithVan=True, reserveDisabled=True, hiddenByOnlyAvailable=True"

            record("S2-T02", "Unavailable/incompatible garages never become bookable through filters", s2_t02)

            # S2-T03: ratings explicitly demo in both languages; no Google attribution; sort by rating
            def s2_t03():
                set_interval(page, "2026-12-15", "10:00", "2026-12-15", "12:00", "car")
                page.select_option("#sortSel", "rating_desc")
                scores = page.locator("#resultsList .card .rating-score").all_inner_texts()
                nums = [float(s) for s in scores]
                assert nums == sorted(nums, reverse=True), f"Scores not sorted desc: {nums}"
                # Check ES demo label and no Google attribution on rating row
                rating_es = page.locator("#resultsList .card").first.locator(".rating-row").inner_text().lower()
                assert "demo" in rating_es and "google" not in rating_es, f"Bad ES rating label: {rating_es}"
                # Switch to EN and verify EN demo label & no Google attribution
                page.click('.lang-btn[data-lang="en"]')
                rating_en = page.locator("#resultsList .card").first.locator(".rating-row").inner_text().lower()
                assert "demo" in rating_en and "google" not in rating_en, f"Bad EN rating label: {rating_en}"
                page.click('.lang-btn[data-lang="es"]')
                page.select_option("#sortSel", "cercano")
                return f"sortedDesc={nums[0]}..{nums[-1]}, es='{rating_es}', en='{rating_en}'"

            record("S2-T03", "Demo-labelled ratings in ES & EN without Google attribution + rating sort", s2_t03)

            # S2-T04: validated external directions coordinates, labelled demo, offline list/booking intact
            def s2_t04():
                pm_link = page.locator('.card[data-garage="garage-puerto-madero"] .btn-directions')
                href = pm_link.get_attribute("href")
                link_text = pm_link.inner_text().lower()
                assert href == "https://www.google.com/maps/dir/?api=1&destination=-34.6074%2C-58.361&travelmode=driving", f"Unexpected href: {href}"
                assert "demo" in link_text, f"Missing demo label in directions link: {link_text}"
                # Trigger offline via separated Info/QA menu and verify list + booking still work
                page.click("#statusBtn")
                page.wait_for_selector("#statusModal.show")
                page.check("#offlineSwitch")
                page.click('#statusModal [data-close="statusModal"]')
                assert not page.locator("#mapDown").is_hidden()
                assert page.locator("#resultsList .card").count() == 8
                bid, _ = book_garage(page, "garage-puerto-madero", "S2 004")
                page.click("#offlineBannerBtn")
                return f"hrefValid=True, demoLabel='{link_text}', offlineBooked={bid}"

            record("S2-T04", "Validated Google Maps directions (demo label) + map failure fallback", s2_t04)

            # S2-T05: cap 1 overnight 23:00-01:00 blocks 00:00-00:30, allows 01:00-02:00, cancel releases
            def s2_t05():
                page.click("#statusBtn")
                page.wait_for_selector("#statusModal.show")
                page.click("#enterSandboxBtn")
                page.wait_for_selector("#sandboxBanner:not([hidden])")
                page.click("#sandboxResetBtn")

                set_interval(page, "2026-12-15", "23:00", "2026-12-16", "01:00", "car")
                b1, _ = book_garage(page, "qa-cap1-24h", "S2 501")

                # Overlapping 00:00-00:30 next day blocked
                set_interval(page, "2026-12-16", "00:00", "2026-12-16", "00:30", "car")
                c24 = page.locator('.card[data-garage="qa-cap1-24h"]')
                assert c24.get_attribute("data-eligible") == "false"
                assert c24.get_attribute("data-reason") == "NO_AVAILABILITY"
                assert c24.locator(".btn-reserve").is_disabled()

                # Adjacent 01:00-02:00 next day permitted
                set_interval(page, "2026-12-16", "01:00", "2026-12-16", "02:00", "car")
                b2, _ = book_garage(page, "qa-cap1-24h", "S2 502")

                # Cancel overnight booking b1 -> 00:00-00:30 becomes available and bookable
                page.click("#bookingsBtn")
                page.wait_for_selector("#bookingsModal.show")
                page.click(f'[data-cancel-booking="{b1}"]')
                page.click('#bookingsModal [data-close="bookingsModal"]')
                set_interval(page, "2026-12-16", "00:00", "2026-12-16", "00:30", "car")
                b3, _ = book_garage(page, "qa-cap1-24h", "S2 503")
                return f"overnight={b1}, blocked0000=NO_AVAILABILITY, adjacent0100={b2}, rebookedAfterCancel={b3}"

            record("S2-T05", "Cap 1 overnight 23:00-01:00 overlap/adjacent & cancel release", s2_t05)

            # S2-T06: non-24h rejects overnight closed period; 24h accepts overnight
            def s2_t06():
                page.click("#sandboxExitBtn")
                set_interval(page, "2026-12-15", "21:00", "2026-12-16", "08:00", "car")
                palermo = page.locator('.card[data-garage="garage-palermo-soho"]')
                pm = page.locator('.card[data-garage="garage-puerto-madero"]')
                assert palermo.get_attribute("data-eligible") == "false"
                assert palermo.get_attribute("data-reason") == "OUT_OF_HOURS"
                assert palermo.locator(".btn-reserve").is_disabled()
                assert pm.get_attribute("data-eligible") == "true"
                assert not pm.locator(".btn-reserve").is_disabled()
                return "palermo(07-22)=OUT_OF_HOURS, puertoMadero(24h)=eligible"

            record("S2-T06", "Non-24h rejects overnight closed span; 24h accepts overnight", s2_t06)

            # S2-T07: Friday-to-Saturday weekend multiplier only on Saturday segments + collapsed breakdown + locked quote
            def s2_t07():
                set_interval(page, "2026-12-18", "22:00", "2026-12-19", "02:00", "car")
                page.locator('.card[data-garage="garage-obelisco"] .btn-reserve').click()
                page.wait_for_selector("#reserveModal.show")
                # Breakdown must be collapsed by default
                details = page.locator("#quoteBreakdownDetails")
                assert details.get_attribute("open") is None, "Quote breakdown should be collapsed by default"
                details.locator("summary").click()
                assert details.get_attribute("open") is not None
                rows = page.locator("#reserveModal .quote-table tbody tr")
                assert rows.count() == 4, f"Expected 4 hourly segments Fri 22->Sat 02, got {rows.count()}"
                r0_txt = rows.nth(0).inner_text()
                r1_txt = rows.nth(1).inner_text()
                r2_txt = rows.nth(2).inner_text()
                r3_txt = rows.nth(3).inner_text()
                assert "Finde" not in r0_txt and "Finde" not in r1_txt, f"Friday segments must not apply weekend multiplier: {r0_txt} / {r1_txt}"
                assert "Finde" in r2_txt and "Finde" in r3_txt, f"Saturday segments must apply weekend multiplier: {r2_txt} / {r3_txt}"
                # Obelisco 6000/h * (1 + 1 + 1.1 + 1.1) = 6000 * 4.2 = 25.200
                total_txt = page.locator("#reserveQuoteTotal").inner_text()
                assert "25.200" in total_txt or "25,200" in total_txt, f"Expected ARS 25.200, got {total_txt}"
                page.click("#reserveConfirmBtn")
                page.wait_for_selector("#successModal.show")
                bid = page.locator("#bookingIdText").inner_text().strip()
                locked = page.locator("#successLockedTotal").inner_text().strip()
                page.click("#successDone")
                # Mutate rate & verify stored booking stays locked
                page.evaluate("""() => {
                    const g = window.ParkFinderApp.GARAGES.find(x => x.id === 'garage-obelisco');
                    g.ratePerHour = 12000;
                    window.ParkFinderApp.renderResults(false);
                }""")
                page.click("#bookingsBtn")
                page.wait_for_selector("#bookingsModal.show")
                stored_total = page.locator(f'.booking-row[data-booking-id="{bid}"] .booking-locked-total').inner_text()
                page.click('#bookingsModal [data-close="bookingsModal"]')
                page.evaluate("""() => {
                    const g = window.ParkFinderApp.GARAGES.find(x => x.id === 'garage-obelisco');
                    g.ratePerHour = 6000;
                    window.ParkFinderApp.renderResults(false);
                }""")
                assert stored_total == locked
                return f"collapsedByDefault=True, segs=4(Fri=1.0/Sat=1.1), locked={locked}"

            record("S2-T07", "Fri->Sat proration applies weekend only to Sat + collapsed breakdown + locked quote", s2_t07)

            # S2-T08: invalid dates, equal/reversed, >72h rejected with clear bilingual feedback
            def s2_t08():
                # Equal
                set_interval(page, "2026-12-15", "10:00", "2026-12-15", "10:00", "car")
                assert not page.locator("#intervalError").is_hidden()
                err_eq_es = page.locator("#intervalError").inner_text()
                # Reversed dates
                set_interval(page, "2026-12-16", "10:00", "2026-12-15", "12:00", "car")
                assert not page.locator("#intervalError").is_hidden()
                # >72h duration (4 days = 96h)
                set_interval(page, "2026-12-15", "10:00", "2026-12-19", "10:00", "car")
                assert not page.locator("#intervalError").is_hidden()
                err_max_es = page.locator("#intervalError").inner_text()
                assert "72" in err_max_es
                # Switch to EN and confirm bilingual error message
                page.click('.lang-btn[data-lang="en"]')
                err_max_en = page.locator("#intervalError").inner_text()
                assert "72" in err_max_en and err_max_en != err_max_es
                page.click('.lang-btn[data-lang="es"]')
                set_interval(page, "2026-12-15", "10:00", "2026-12-15", "12:00", "car")
                return f"eqES='{err_eq_es[:35]}...', maxES='{err_max_es[:30]}...', maxEN='{err_max_en[:30]}...'"

            record("S2-T08", "Invalid/equal/reversed/>72h intervals rejected with clear ES/EN feedback", s2_t08)

            # S2-T09: legacy bookings survive reload, QA sandbox isolated, in-app QA runner passes
            def s2_t09():
                page.reload(wait_until="domcontentloaded")
                page.wait_for_selector("#resultsList .card", timeout=5000)
                ids = page.evaluate("window.ParkFinderApp.getBookings().map(b => b.id)")
                assert "PF-2026-LEG1" in ids, f"Legacy V1 booking lost after reload! Got {ids}"
                # Open separated Info/QA modal and run in-app QA suite (S1 + S2)
                page.click("#statusBtn")
                page.wait_for_selector("#statusModal.show")
                page.click("#runQaSuiteBtn")
                qa_rows = page.locator("#statusModal .qa-row")
                fail_rows = page.locator("#statusModal .qa-row.fail")
                assert qa_rows.count() >= 14, f"Expected >=14 QA rows (S1+S2), got {qa_rows.count()}"
                assert fail_rows.count() == 0, f"In-app QA suite had failures: {fail_rows.count()}"
                page.click('#statusModal [data-close="statusModal"]')
                return f"legacySurvived=PF-2026-LEG1, inAppQaRows={qa_rows.count()}(0 fails)"

            record("S2-T09", "Legacy bookings survive reload & in-app QA suite (S1+S2) passes cleanly", s2_t09)

            # S2-T10: Desktop & Mobile responsive check, separated QA menu, zero overflow, zero JS errors
            def s2_t10():
                # Verify QA controls are NOT in primary journey (offlineSwitch & resetDemoBtn only exist inside closed/open statusModal)
                assert page.locator("#offlineSwitch").count() == 0 or not page.locator("#offlineSwitch").is_visible()
                assert page.locator("#resetDemoBtn").count() == 0 or not page.locator("#resetDemoBtn").is_visible()
                desktop_overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
                assert not desktop_overflow, "Desktop 1440px horizontal overflow detected"

                # Mobile 390x844 check
                page.set_viewport_size({"width": 390, "height": 844})
                page.wait_for_timeout(200)
                mobile_overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
                assert not mobile_overflow, "Mobile 390px horizontal overflow detected"
                assert page.locator("#mobileSearchToggle").is_visible()
                assert page.locator("#mobileViewToggle").is_visible()
                # Toggle to map view and back to list view
                page.click("#mobileViewToggle")
                assert page.locator("#marketplaceLayout").get_attribute("data-mobile-view") == "map"
                page.click("#mobileViewToggle")
                assert page.locator("#marketplaceLayout").get_attribute("data-mobile-view") == "list"
                assert len(console_errors) == 0, f"Uncaught JS errors: {console_errors}"
                return "desktopOverflow=False, mobile390Overflow=False, qaSeparated=True, mobileToggle=OK, uncaughtErrors=0"

            record("S2-T10", "Desktop/mobile visual & responsive layout, separated QA menu, 0 JS errors", s2_t10)

            browser.close()

        # Step 2: capture live AFTER screenshots for before/after visual comparison
        live_info = capture_live_after_screenshots(url)
        print(f"[INFO] Live screenshot capture: {live_info}")
    finally:
        httpd.shutdown()

    passed = sum(1 for r in results if r["status"] == "PASS")
    print(f"\nSprint 02 Browser E2E Summary: {passed}/{len(results)} scenarios passed.")
    out_json = SCREENSHOT_DIR / "sprint02_e2e_results.json"
    out_json.write_text(json.dumps({"results": results, "liveScreenshotInfo": live_info}, indent=2, ensure_ascii=False), encoding="utf-8")
    if passed != len(results):
        sys.exit(1)


if __name__ == "__main__":
    run_suite()
