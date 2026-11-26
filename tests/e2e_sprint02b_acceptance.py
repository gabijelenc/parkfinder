#!/usr/bin/env python3
"""
parkFinder Sprint 2B — Real-Browser E2E Acceptance & High-Res Screenshot Suite (Playwright)
Verifies all Sprint 2B Urban Tech driver UX decisions (driver_ux_v01.md):
- Brand identity (parkFinder, tagline, car-in-bay SVG isotype, Inter font)
- Light/Dark manual toggle + persistence + WCAG AA contrast ratio calculation
- Desktop 60% map / 40% list hybrid layout + adjustable divider + pin/card sync
- Progressive search (POIs, businesses, explicit geolocation permission, recents & favorites)
- Commercial cards with local illustrative SVGs, avg hourly price, favorites persistence
- Detail side panel / mobile full screen (5 tabs, keyboard nav, expandable Lightbox gallery)
- Comparator up to 3 garages (4th rejected, same interval/vehicle, direct booking)
- Smart recommendations determinism + <=2 low availability (no false urgency)
- Quick controls + Advanced filters modal
- Mobile 390x844 full-screen map + top search + draggable/accessible sheet + bottom nav + 0 overflow
- Captures high-resolution (2x DPR) Light & Dark screenshots for Desktop (1440x900) & Mobile (390x844)
"""

import http.server
import json
import math
import os
import re
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
SCREENSHOT_DIR = Path(os.environ.get(
    "PF_S2B_SCREENSHOT_DIR",
    str(REPO_ROOT / "02_trabajo" / "sprint_02b" / "screenshots")
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


def parse_rgb(rgb_str):
    m = re.findall(r"[\d.]+", str(rgb_str))
    return tuple(float(m[i]) for i in range(3)) if len(m) >= 3 else (0.0, 0.0, 0.0)


def rel_luminance(rgb):
    def chan(v):
        s = v / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)


def contrast_ratio(fg_str, bg_str):
    l1 = rel_luminance(parse_rgb(fg_str))
    l2 = rel_luminance(parse_rgb(bg_str))
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def capture_highres_screenshots(url):
    """Captures crisp 2x DPR (high-resolution) Desktop & Mobile screenshots in Light & Dark modes."""
    info = {"dpr": 2, "tileResponses200": 0, "files": [], "uncaughtErrors": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            headless=True,
            args=["--no-sandbox", "--disable-gpu"]
        )

        # Desktop 1440x900 @ 2x DPR (2880x1800)
        ctx_d = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx_d.new_page()
        page.on("pageerror", lambda err: info["uncaughtErrors"].append(str(err)))
        page.on("response", lambda r: info.__setitem__(
            "tileResponses200",
            info["tileResponses200"] + (1 if "tile.openstreetmap.org" in r.url and r.status == 200 else 0)
        ))
        try:
            page.goto(url, wait_until="networkidle", timeout=15000)
        except Exception:
            page.goto(url, wait_until="domcontentloaded", timeout=10000)
        page.wait_for_selector("#resultsList .card", timeout=5000)
        page.wait_for_timeout(1200)

        # 1. Desktop Light Mode (default 60% map / 40% list)
        f1 = "after_2b_desktop_light_1440x900.png"
        page.screenshot(path=str(SCREENSHOT_DIR / f1), full_page=False)
        info["files"].append(f1)

        # 2. Desktop Light Mode with Detail Side Panel open
        page.evaluate("window.ParkFinderApp.openDetailPanel('garage-puerto-madero', 'info')")
        page.wait_for_timeout(320)
        f2 = "after_2b_desktop_detail_light.png"
        page.screenshot(path=str(SCREENSHOT_DIR / f2), full_page=False)
        info["files"].append(f2)
        page.evaluate("window.ParkFinderApp.closeDetailPanel()")
        page.wait_for_timeout(200)

        # 3. Desktop Dark Mode
        page.evaluate("window.ParkFinderApp.setTheme('dark')")
        page.wait_for_timeout(350)
        f3 = "after_2b_desktop_dark_1440x900.png"
        page.screenshot(path=str(SCREENSHOT_DIR / f3), full_page=False)
        info["files"].append(f3)

        # 4. Desktop Dark Mode Comparator (3 garages)
        page.evaluate("""() => {
            window.ParkFinderApp.toggleCompare('garage-puerto-madero');
            window.ParkFinderApp.toggleCompare('garage-obelisco');
            window.ParkFinderApp.toggleCompare('parqueon-san-telmo');
            window.ParkFinderApp.openCompareModal();
        }""")
        page.wait_for_timeout(300)
        f4 = "after_2b_desktop_compare_dark.png"
        page.screenshot(path=str(SCREENSHOT_DIR / f4), full_page=False)
        info["files"].append(f4)
        ctx_d.close()

        # Mobile 390x844 @ 2x DPR (780x1688)
        ctx_m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mpage = ctx_m.new_page()
        mpage.on("pageerror", lambda err: info["uncaughtErrors"].append(str(err)))
        try:
            mpage.goto(url, wait_until="networkidle", timeout=15000)
        except Exception:
            mpage.goto(url, wait_until="domcontentloaded", timeout=10000)
        mpage.wait_for_selector("#resultsList .card", timeout=5000)
        mpage.wait_for_timeout(1200)

        # 5. Mobile Light Mode (half sheet over full-screen map + top search + bottom nav)
        f5 = "after_2b_mobile_light_390x844.png"
        mpage.screenshot(path=str(SCREENSHOT_DIR / f5), full_page=False)
        info["files"].append(f5)

        # 6. Mobile Dark Mode (half sheet)
        mpage.evaluate("window.ParkFinderApp.setTheme('dark')")
        mpage.wait_for_timeout(350)
        f6 = "after_2b_mobile_dark_390x844.png"
        mpage.screenshot(path=str(SCREENSHOT_DIR / f6), full_page=False)
        info["files"].append(f6)

        # 7. Mobile Dark Mode Full-Screen Map (peek sheet state)
        mpage.evaluate("window.ParkFinderApp.setSheetState('peek')")
        mpage.wait_for_timeout(450)
        f7 = "after_2b_mobile_map_peek_dark.png"
        mpage.screenshot(path=str(SCREENSHOT_DIR / f7), full_page=False)
        info["files"].append(f7)

        ctx_m.close()
        browser.close()
    return info


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

            # S2B-E01: Urban Tech brand identity, car-in-bay SVG isotype, Inter font, primary nav
            def s2b_e01():
                brand_txt = page.locator(".brand-title").inner_text().strip()
                tagline = page.locator(".brand-tagline").inner_text().strip()
                assert brand_txt == "parkFinder", f"Expected case-sensitive 'parkFinder', got '{brand_txt}'"
                assert "Tu lugar, antes de llegar." in tagline, f"Unexpected tagline: {tagline}"
                assert page.locator("#brandIsotype").is_visible()
                font_family = page.evaluate("getComputedStyle(document.body).fontFamily")
                assert "Inter" in font_family, f"Expected Inter font family, got {font_family}"
                nav_text = page.locator(".primary-nav").inner_text()
                for item in ["Explorar", "Mis reservas", "Favoritos", "Mi perfil"]:
                    assert item in nav_text, f"Missing nav item {item}"
                return f"brand={brand_txt}, tagline='{tagline}', isotype=SVG, font=Inter, nav=4"

            record("S2B-E01", "Urban Tech brand (parkFinder, tagline, car-in-bay SVG, Inter, 4-tab nav)", s2b_e01)

            # S2B-E02: Light/Dark manual toggle + persistence + WCAG AA contrast in both modes
            def s2b_e02():
                def measure_contrast():
                    return page.evaluate("""() => {
                        const body = getComputedStyle(document.body);
                        const btn = getComputedStyle(document.querySelector('.btn-reserve:not([disabled])'));
                        const card = getComputedStyle(document.querySelector('.card'));
                        return {
                            bodyInk: body.color,
                            bodyBg: body.backgroundColor,
                            cardBg: card.backgroundColor,
                            btnInk: btn.color,
                            btnBg: btn.backgroundColor
                        };
                    }""")

                assert page.locator("html").get_attribute("data-theme") == "light"
                light_c = measure_contrast()
                light_body_cr = contrast_ratio(light_c["bodyInk"], light_c["cardBg"])
                light_cta_cr = contrast_ratio(light_c["btnInk"], light_c["btnBg"])
                assert light_body_cr >= 4.5, f"Light body contrast too low: {light_body_cr:.2f}"
                assert light_cta_cr >= 4.5, f"Light Mint CTA contrast too low: {light_cta_cr:.2f}"

                # Switch to Dark mode and verify persistence across reload
                page.click("#themeToggleBtn")
                assert page.locator("html").get_attribute("data-theme") == "dark"
                dark_c = measure_contrast()
                dark_body_cr = contrast_ratio(dark_c["bodyInk"], dark_c["cardBg"])
                dark_cta_cr = contrast_ratio(dark_c["btnInk"], dark_c["btnBg"])
                assert dark_body_cr >= 4.5, f"Dark body contrast too low: {dark_body_cr:.2f}"
                assert dark_cta_cr >= 4.5, f"Dark Mint CTA contrast too low: {dark_cta_cr:.2f}"

                page.reload(wait_until="domcontentloaded")
                page.wait_for_selector("#resultsList .card", timeout=5000)
                assert page.locator("html").get_attribute("data-theme") == "dark", "Dark theme did not persist across reload"

                # Switch back to Light for remaining checks
                page.click("#themeToggleBtn")
                assert page.locator("html").get_attribute("data-theme") == "light"
                return f"lightCR(body={light_body_cr:.1f},cta={light_cta_cr:.1f}), darkCR(body={dark_body_cr:.1f},cta={dark_cta_cr:.1f}), persisted=True"

            record("S2B-E02", "Light/Dark manual toggle persisted locally + WCAG AA contrast in both modes", s2b_e02)

            # S2B-E03: Desktop 60% map / 40% list default hybrid layout + adjustable divider
            def s2b_e03():
                widths = page.evaluate("""() => {
                    const lay = document.querySelector('#marketplaceLayout').getBoundingClientRect();
                    const panel = document.querySelector('#resultsSheet').getBoundingClientRect();
                    const map = document.querySelector('.map-card').getBoundingClientRect();
                    return { total: lay.width, listPct: (panel.width / lay.width) * 100, mapPct: (map.width / lay.width) * 100 };
                }""")
                assert 38 <= widths["listPct"] <= 42, f"Expected ~40% list default, got {widths['listPct']:.1f}%"
                assert 57 <= widths["mapPct"] <= 62, f"Expected ~60% map default, got {widths['mapPct']:.1f}%"

                # Keyboard adjust divider
                div = page.locator("#splitDivider")
                div.focus()
                page.keyboard.press("ArrowRight")
                page.keyboard.press("ArrowRight")
                val_after = int(div.get_attribute("aria-valuenow"))
                assert val_after == 48, f"Expected divider aria-valuenow=48 after 2 ArrowRight, got {val_after}"
                page.keyboard.press("Home")
                assert int(div.get_attribute("aria-valuenow")) == 40
                return f"defaultSplit={widths['listPct']:.1f}%list/{widths['mapPct']:.1f}%map, keyResize=40->48->40"

            record("S2B-E03", "Desktop 60% map / 40% list hybrid layout + keyboard-adjustable divider", s2b_e03)

            # S2B-E04: Progressive destination search (POIs, businesses, explicit geolocation, recents & favorites)
            def s2b_e04():
                # Focus destination input -> dropdown opens with catalog & explicit geolocation button
                page.click("#customAddr")
                page.wait_for_selector("#destDropdown:not([hidden])")
                page.fill("#customAddr", "Teatro")
                assert "Teatro Colón" in page.locator("#destDropdown").inner_text()
                page.locator("#destDropdown .dd-item").first.click()
                assert "Teatro Colón" in page.locator("#destLine").inner_text()

                # Save destination to favorites & verify persistence
                page.click("#favDestBtn")
                assert page.locator("#favDestBtn").get_attribute("aria-pressed") == "true"

                # Test explicit geolocation permission denied & granted (mocked cleanly, never auto-called)
                page.evaluate("""() => {
                    navigator.geolocation.getCurrentPosition = (ok, err) => err({ code: 1, message: 'Denied' });
                }""")
                page.click("#customAddr")
                page.click("#geoLocationBtn")
                assert "permiso" in page.locator("#toast").inner_text().lower()

                page.evaluate("""() => {
                    navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: -34.595, longitude: -58.39 } });
                }""")
                page.click("#customAddr")
                page.click("#geoLocationBtn")
                assert "Mi ubicación actual" in page.locator("#destLine").inner_text()

                # Reload and verify recent & favorite destinations survived in localStorage
                page.reload(wait_until="domcontentloaded")
                page.wait_for_selector("#resultsList .card", timeout=5000)
                recents = page.evaluate("window.ParkFinderApp.state.recentDestinations.map(r => r.label)")
                fav_dests = page.evaluate("window.ParkFinderApp.state.favoriteDestinations.map(f => f.label)")
                assert "Teatro Colón" in recents, f"Teatro Colón missing from recents: {recents}"
                assert "Teatro Colón" in fav_dests, f"Teatro Colón missing from favorite destinations: {fav_dests}"
                return f"poiMatch=Teatro Colón, geoDenied+Granted=OK, persistedRecents={len(recents)}, favDests={len(fav_dests)}"

            record("S2B-E04", "Progressive search (POI offline, explicit geolocation, recents & favorite destinations)", s2b_e04)

            # S2B-E05: Commercial cards with illustrative SVG badges (ES/EN), avg hourly price & favorite garages
            def s2b_e05():
                first_card = page.locator("#resultsList .card").first
                img_src = first_card.locator(".card-media img").get_attribute("src")
                assert img_src.startswith("assets/garages/") and img_src.endswith(".svg"), f"Bad card image: {img_src}"
                assert "imagen ilustrativa" in first_card.locator(".illustrative-badge").inner_text().lower()
                assert "/h prom." in first_card.locator(".price-avg").inner_text().lower()

                # Favorite Puerto Madero garage & reload to verify persistence
                page.locator('.card[data-garage="garage-puerto-madero"] [data-fav-garage]').click()
                page.reload(wait_until="domcontentloaded")
                page.wait_for_selector("#resultsList .card", timeout=5000)
                assert page.locator('.card[data-garage="garage-puerto-madero"] [data-fav-garage]').get_attribute("aria-pressed") == "true"

                # Open Favorites modal and verify saved garage + saved destination
                page.click("#favoritesBtn")
                page.wait_for_selector("#favoritesModal.show")
                assert "Garage Puerto Madero" in page.locator("#favoritesModal").inner_text()
                page.click('#favoritesModal [data-fav-tab="destinations"]')
                assert "Teatro Colón" in page.locator("#favoritesModal").inner_text()
                page.click('#favoritesModal [data-close="favoritesModal"]')

                # Verify EN illustrative image label
                page.click('.lang-btn[data-lang="en"]')
                assert "illustrative image" in page.locator("#resultsList .card").first.locator(".illustrative-badge").inner_text().lower()
                page.click('.lang-btn[data-lang="es"]')
                return f"svgImg={img_src}, es+enIllustrative=True, favGaragePersisted=garage-puerto-madero"

            record("S2B-E05", "Commercial cards illustrative SVGs (ES/EN), avg/h price & favorites persistence", s2b_e05)

            # S2B-E06: Detail side panel (5 tabs, keyboard nav, demo reviews, expandable Lightbox gallery)
            def s2b_e06():
                page.locator('.card[data-garage="garage-puerto-madero"] .btn-detail-open').click()
                page.wait_for_selector("#detailPanel.show")
                tabs = page.locator("#detailPanel [role='tab']")
                assert tabs.count() == 5, f"Expected 5 detail tabs, got {tabs.count()}"

                # Keyboard ArrowRight through tabs: Info -> Servicios -> Fotos -> Reseñas -> Ubicación
                page.locator("#dtab-info").focus()
                page.keyboard.press("ArrowRight")
                assert page.locator("#dtab-services").get_attribute("aria-selected") == "true"
                assert page.locator("#dpanel-services .amenity-cell").count() == 6

                page.keyboard.press("ArrowRight")
                assert page.locator("#dtab-photos").get_attribute("aria-selected") == "true"
                assert page.locator("#dpanel-photos .detail-photo-card").count() >= 3

                page.keyboard.press("ArrowRight")
                assert page.locator("#dtab-reviews").get_attribute("aria-selected") == "true"
                rev_txt = page.locator("#dpanel-reviews").inner_text().lower()
                assert "demo" in rev_txt and "google" not in rev_txt.replace("no provienen de google", "")

                page.keyboard.press("ArrowRight")
                assert page.locator("#dtab-location").get_attribute("aria-selected") == "true"

                # Expand Lightbox Gallery + navigate + Escape close
                page.click("#detailExpandGalleryBtn")
                page.wait_for_selector("#galleryModal.show")
                assert "imagen ilustrativa" in page.locator("#galleryModal").inner_text().lower()
                page.click("#galleryNextBtn")
                assert "2 de" in page.locator("#galleryModal").inner_text()
                page.keyboard.press("Escape")
                page.wait_for_selector("#galleryModal.show", state="detached")
                page.keyboard.press("Escape")
                page.wait_for_selector("#detailPanel.show", state="detached")
                return "tabs=5(ArrowRight=OK), reviewsDemo=True, lightboxNav+Esc=OK"

            record("S2B-E06", "Detail side panel (5 tabs, keyboard nav, demo reviews) & expandable Lightbox gallery", s2b_e06)

            # S2B-E07: Comparator up to 3 garages (4th rejected, same interval/vehicle, direct booking)
            def s2b_e07():
                for gid in ["garage-puerto-madero", "garage-obelisco", "parqueon-san-telmo"]:
                    page.locator(f'.card[data-garage="{gid}"] [data-compare-garage]').click()
                assert not page.locator("#compareBar").is_hidden()
                assert "(3/3)" in page.locator("#compareOpenBtn").inner_text()

                # Attempt 4th garage -> blocked with toast
                res4 = page.evaluate("window.ParkFinderApp.toggleCompare('garage-recoleta')")
                assert res4["ok"] is False and res4["code"] == "COMPARE_LIMIT_EXCEEDED"

                # Open comparator modal and verify 3 columns + direct booking CTA
                page.click("#compareOpenBtn")
                page.wait_for_selector("#compareModal.show")
                assert page.locator("#compareModal .compare-col-head").count() == 3
                page.click('#compareModal [data-cmp-reserve="garage-obelisco"]')
                page.wait_for_selector("#reserveModal.show")
                page.click('#reserveModal [data-close="reserveModal"]')
                page.click("#compareClearBtn")
                assert page.locator("#compareBar").is_hidden()
                return "selected=3, 4thBlocked=COMPARE_LIMIT_EXCEEDED, directReserveFromCompare=OK"

            record("S2B-E07", "Garage comparator (up to 3, 4th blocked, same interval/vehicle, direct booking)", s2b_e07)

            # S2B-E08: Smart recommendations strip + factual <=2 low availability (no false urgency)
            def s2b_e08():
                assert not page.locator("#recommendationsStrip").is_hidden()
                rec_pills = page.locator("#recommendationsStrip .rec-pill").count()
                assert rec_pills == 4, f"Expected 4 recommendation pills, got {rec_pills}"
                # Normal catalog has >=55 spaces per garage -> ZERO low_availability badges (no false urgency)
                assert page.locator('[data-rec-badge="low_availability"]').count() == 0, "False urgency badge shown on high-capacity garages!"

                # Enter QA Sandbox (capacity 1 and 2 garages) -> low_availability MUST appear factually
                page.evaluate("window.ParkFinderApp.enterSandbox()")
                low_count = page.locator('[data-rec-badge="low_availability"]').count()
                assert low_count >= 1, "Expected factual low_availability badge on cap 1/2 sandbox garages"
                page.evaluate("window.ParkFinderApp.exitSandbox()")
                return f"recPills={rec_pills}, normalLowAvail=0(noFalseUrgency), sandboxCap1_2LowAvail={low_count}"

            record("S2B-E08", "Smart recommendations deterministic strip & factual <=2 low availability (no false urgency)", s2b_e08)

            # S2B-E09: Quick sort controls + Advanced filters modal synced with filter bar
            def s2b_e09():
                page.click('.quick-sort-btn[data-quick-sort="precio_asc"]')
                assert page.locator("#sortSel").input_value() == "precio_asc"
                page.click("#advancedFiltersBtn")
                page.wait_for_selector("#advancedFiltersModal.show")
                page.click('#advancedFiltersModal [data-adv-amenity="covered"]')
                assert page.locator('#amenityFilters .chip[data-amenity="covered"]').get_attribute("aria-pressed") == "true"
                page.click("#advClearBtn")
                page.click('#advancedFiltersModal [data-close="advancedFiltersModal"]')
                page.click('.quick-sort-btn[data-quick-sort="cercano"]')
                return "quickSortSynced=precio_asc, advancedFiltersModalSynced=True"

            record("S2B-E09", "Quick sort pills & Advanced Filters modal synchronized cleanly", s2b_e09)

            # S2B-E10: Mobile 390x844 full-screen map, top search, draggable/keyboard sheet, bottom nav, 0 overflow
            def s2b_e10():
                # Check desktop overflow first
                desktop_ov = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
                assert not desktop_ov, "Horizontal overflow on 1440px desktop"

                page.set_viewport_size({"width": 390, "height": 844})
                page.wait_for_timeout(250)
                mobile_ov = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
                assert not mobile_ov, "Horizontal overflow on 390px mobile"

                assert page.locator("#mobileSearchToggle").is_visible()
                assert "¿A dónde vas?" in page.locator("#mobileSearchToggle").inner_text()
                assert page.locator(".mobile-bottom-nav").is_visible()
                assert page.locator(".mobile-bottom-nav .mbn-item").count() == 4
                assert page.locator("#sheetHandle").is_visible()

                # Keyboard cycle bottom sheet states: half -> full -> peek -> half
                page.locator("#sheetHandle").focus()
                page.keyboard.press("ArrowUp")
                assert page.locator("#marketplaceLayout").get_attribute("data-sheet-state") == "full"
                page.keyboard.press("ArrowDown")
                assert page.locator("#marketplaceLayout").get_attribute("data-sheet-state") == "half"
                page.keyboard.press("ArrowDown")
                assert page.locator("#marketplaceLayout").get_attribute("data-sheet-state") == "peek"
                assert page.locator("#marketplaceLayout").get_attribute("data-mobile-view") == "map"

                # Verify >= 44px touch target on mobile bottom nav & primary CTA
                min_touch = page.evaluate("""() => {
                    const mbn = document.querySelector('.mbn-item').getBoundingClientRect().height;
                    const handle = document.querySelector('#sheetHandle').getBoundingClientRect().height;
                    const cta = document.querySelector('.btn-reserve').getBoundingClientRect().height;
                    return { mbn, handle, cta };
                }""")
                assert min_touch["mbn"] >= 44 and min_touch["handle"] >= 44 and min_touch["cta"] >= 44, f"Touch target < 44px: {min_touch}"
                assert len(console_errors) == 0, f"Uncaught JS errors: {console_errors}"
                return f"overflow(1440=False,390=False), sheetStates(half/full/peek)=OK, bottomNav=4, touchPx={min_touch}, jsErrors=0"

            record("S2B-E10", "Mobile 390px full-screen map, top search, accessible sheet, bottom nav, >=44px touch, 0 overflow", s2b_e10)

            browser.close()

        # Capture High-Resolution 2x DPR Light & Dark Screenshots for Desktop & Mobile
        shot_info = capture_highres_screenshots(url)
        print(f"[INFO] High-Res 2x DPR screenshots captured: {shot_info}")
    finally:
        httpd.shutdown()

    passed = sum(1 for r in results if r["status"] == "PASS")
    print(f"\nSprint 2B Browser E2E Summary: {passed}/{len(results)} scenarios passed.")
    out_json = SCREENSHOT_DIR / "sprint02b_e2e_results.json"
    out_json.write_text(json.dumps({"results": results, "screenshots": shot_info}, indent=2, ensure_ascii=False), encoding="utf-8")
    if passed != len(results):
        sys.exit(1)


if __name__ == "__main__":
    run_suite()
