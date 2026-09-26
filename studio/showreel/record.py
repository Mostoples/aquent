"""
Record the AQUENT web app as a scripted demo (Chrome DevTools screencast).

Output (showreel/build/rec):
  frames/*.jpg      raw screencast frames
  frames.txt        ffconcat list with real frame durations
  marks.json        segment name -> [start, end] seconds on the recording timeline
  rec.mp4           constant 30 fps recording (780x1688)
"""
import asyncio, base64, glob, json, os, pathlib, shutil, subprocess, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "showreel/build/rec"
FR = OUT / "frames"
URL = (ROOT / "app/index.html").as_uri() + "?mock"
FFMPEG = shutil.which("ffmpeg") or (glob.glob(os.environ.get("LOCALAPPDATA", "").replace("\\", "/") +
    "/Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe") or ["ffmpeg"])[0]

HELPERS = r"""
(() => {
  const st = document.createElement('style');
  st.textContent = `.__tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
    background:rgba(47,123,255,.22);border:2px solid rgba(47,123,255,.55);pointer-events:none;z-index:9999;
    animation:__tapk .65s ease-out forwards}
    @keyframes __tapk{from{transform:scale(.35);opacity:1}to{transform:scale(1.5);opacity:0}}`;
  document.head.appendChild(st);
  window.__tap = (sel) => {
    const el = document.querySelector(sel); const r = el.getBoundingClientRect();
    const d = document.createElement('div'); d.className = '__tap';
    d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 800);
  };
  const cur = () => document.querySelector('.screen.active');
  window.__scroll = (y, dur) => {
    const sc = cur(), y0 = sc.scrollTop, y1 = Math.min(y, sc.scrollHeight - sc.clientHeight), t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / dur); const e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;
      sc.scrollTop = y0 + (y1 - y0) * e; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  window.__scrollTo = (sel, dur, off = 220) => {
    const sc = cur(), r = document.querySelector(sel).getBoundingClientRect();
    window.__scroll(sc.scrollTop + r.top - off, dur);
  };
})();
"""


async def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    FR.mkdir(parents=True)
    frames, marks = [], {}

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        await page.goto(URL)
        await page.wait_for_load_state("networkidle")
        await page.evaluate(HELPERS)
        await page.evaluate("document.fonts.ready")
        cdp = await page.context.new_cdp_session(page)

        async def on_frame(ev):
            ts = ev["metadata"]["timestamp"]
            path = FR / f"{len(frames):05d}.jpg"
            path.write_bytes(base64.b64decode(ev["data"]))
            frames.append((ts, path.name))
            try:
                await cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
            except Exception:
                pass

        cdp.on("Page.screencastFrame", lambda ev: asyncio.ensure_future(on_frame(ev)))

        w = lambda ms: page.wait_for_timeout(ms)
        ev = page.evaluate

        async def tap(sel, pause=160):
            await ev(f"__tap({json.dumps(sel)})")
            await w(pause)
            await page.click(sel)

        def mark(name):
            # use the screencast clock (latest frame) so marks line up exactly with the frames
            marks[name] = frames[-1][0] if frames else time.time()

        await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 93, "everyNthFrame": 1})
        while len(frames) < 20:
            await w(100)

        # 1 · splash -> home
        mark("splash")
        await w(3400)
        await tap(".btn-primary")
        await w(3200)

        # 2 · home dashboard scroll
        mark("home")
        await ev("__scroll(360, 1500)"); await w(2100)
        await ev("__scroll(780, 1500)"); await w(2100)
        await ev("__scroll(0, 1300)"); await w(1500)

        # 3 · smart monitoring
        await tap("#tabbar [data-go=monitor]", 120)
        mark("monitor")
        await w(1900)
        for k in ("turb", "cl", "temp"):
            await tap(f"#sensorTabs [data-tab={k}]"); await w(1500)
        await ev("__scroll(640, 2000)"); await w(2200)

        # 4 · filter
        await ev("AQ.go('filter')")
        mark("filter")
        await w(2200)
        await ev("__scroll(560, 2200)"); await w(2600)

        # 5 · shower session
        await ev("AQ.go('shower')")
        mark("shower")
        await w(1500)
        await tap(".preset[data-temp='24']"); await w(1400)
        await tap(".preset[data-temp='38']"); await w(1200)
        await ev("__scroll(300, 900)"); await w(1100)
        await ev("AQ.speed = 14")
        await tap("#startBtn"); await w(3000)
        await tap("#startBtn"); await w(1800)

        # 6 · schedule & climate strategy
        await ev("AQ.go('schedule')")
        mark("schedule")
        await w(1700)
        await ev("__scroll(430, 1500)"); await w(1500)
        await ev("__scroll(0, 1000)"); await w(1100)
        await tap(".clim[data-climate=subtropis]"); await w(1500)
        await ev("__scrollTo('#seasonSeg', 1500, 260)"); await w(1700)
        await tap("#seasonSeg [data-season=panas]"); await w(1800)

        # 7 · AI dermatology
        await ev("AQ.go('derma')")
        mark("derma")
        await w(1300)
        await tap("#scanBtn"); await w(3900)
        await ev("__scrollTo('#composer', 1200, 520)"); await w(1300)
        await ev("AQ.ask('Kulitku terasa kering setelah mandi, sebaiknya bagaimana?')")
        await w(7600)

        # 8 · impact & SDGs
        await ev("AQ.go('impact')")
        mark("impact")
        await w(2600)
        await ev("__scroll(560, 2200)"); await w(2600)
        mark("end")

        await cdp.send("Page.stopScreencast")
        await w(300)
        await browser.close()

    # ---- build CFR video from the variable-rate screencast ----
    frames.sort()
    t0 = frames[0][0]
    lines = ["ffconcat version 1.0"]
    for i, (ts, name) in enumerate(frames):
        dur = (frames[i + 1][0] - ts) if i + 1 < len(frames) else 0.04
        lines += [f"file 'frames/{name}'", f"duration {dur:.4f}"]
    lines.append(f"file 'frames/{frames[-1][1]}'")
    (OUT / "frames.txt").write_text("\n".join(lines))
    names = list(marks)
    seg = {n: [round(marks[n] - t0, 3), round(marks[names[i + 1]] - t0, 3)] for i, n in enumerate(names[:-1])}
    (OUT / "marks.json").write_text(json.dumps(seg, indent=2))
    span = frames[-1][0] - t0
    print(f"{len(frames)} frames over {span:.1f}s  (~{len(frames) / span:.1f} fps)")
    print(json.dumps(seg, indent=2))
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt",
                    "-vf", "fps=30,scale=780:1688:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "14",
                    "-preset", "slow", "rec.mp4"], cwd=OUT, check=True)
    print("wrote", OUT / "rec.mp4")


asyncio.run(main())
