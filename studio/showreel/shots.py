"""Quick visual QA: screenshot every screen of the app (mockup viewport)."""
import sys, os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "showreel/build/shots")
OUT.mkdir(parents=True, exist_ok=True)
url = (ROOT / "app/index.html").as_uri() + "?mock"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "00_splash.png"))
    for i, s in enumerate(["home", "monitor", "shower", "schedule", "derma", "filter", "impact"], 1):
        pg.evaluate(f"AQ.go('{s}')"); pg.wait_for_timeout(1900)
        pg.screenshot(path=str(OUT / f"{i:02d}_{s}.png"))
        h = pg.evaluate(f"document.getElementById('{s}').scrollHeight")
        if h > 900:
            pg.evaluate(f"document.getElementById('{s}').scrollTop = 99999"); pg.wait_for_timeout(700)
            pg.screenshot(path=str(OUT / f"{i:02d}_{s}_b.png"))
    print("errors:", errs)
    b.close()
