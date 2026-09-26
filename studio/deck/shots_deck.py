"""High-res app screenshots (3x) in presentation-ready states for the deck mockups."""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "deck/build/screens"
OUT.mkdir(parents=True, exist_ok=True)
URL = (ROOT / "app/index.html").as_uri() + "?mock"

STATES = [
    ("splash", "", 0),
    ("home", "AQ.go('home')", 0),
    ("monitor", "AQ.go('monitor')", 0),
    ("flow", "AQ.go('monitor')", 700),
    ("shower", "AQ.go('shower'); AQ.speed = 60; setTimeout(() => AQ.toggleShower(), 900)", 180),
    ("schedule", "AQ.go('schedule')", 0),
    ("derma", "AQ.go('derma'); setTimeout(() => AQ.scan(), 600)", 0),
    ("xai", "AQ.go('derma'); setTimeout(() => AQ.scan(), 300)", 470),
    ("filter", "AQ.go('filter')", 0),
    ("impact", "AQ.go('impact')", 0),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, js, scroll in STATES:
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
        pg.goto(URL)
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(600)
        if js:
            pg.evaluate(js)
        pg.wait_for_timeout(4200)
        if scroll:
            pg.evaluate(f"document.querySelector('.screen.active').scrollTop = {scroll}")
            pg.wait_for_timeout(1600)
        pg.screenshot(path=str(OUT / f"{name}.png"))
        pg.close()
        print("shot", name)
    b.close()
