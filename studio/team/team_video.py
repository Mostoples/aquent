"""AQUENT team & product intro video ("Meet AQUENT") — 1920x1080, 30 fps.
   python team/team_video.py                                  -> output/AQUENT_Team_Intro.mp4 (English, + web copy)
   python team/team_video.py --export team/build/text_en.json  -> every on-screen string (for translation)
   python team/team_video.py --lang id --text <text_id.json> --out <file.mp4>   -> translated version
Needs: intro/build/frames_A (logo intro), team/transcripts.json (team/transcribe.py), output/AQUENT_Process_Film_EN.mp4,
showreel/build/anim (turntable), app/assets/team (team/prepare_photos.py). Storyboard: team/SKENARIO.md"""
import argparse, json, math, pathlib, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "showreel"))
from compose import FFMPEG, ff, font, hexc, synth_music, layer_chip, layer_title, layer_desc, INK, INK2, BLUE, DEEP  # noqa: E402
from inuse_video import card  # noqa: E402

W, H, FPS = 1920, 1080, 30
B = ROOT / "team/build"
L = B / "layers"
L.mkdir(parents=True, exist_ok=True)
V = ROOT / "FOTO TIM AQUENT/VIDEO"
TEAMIMG = ROOT / "app/assets/team"
TR = json.loads((ROOT / "team/transcripts.json").read_text(encoding="utf-8"))
BGC = "0xE9EFF7"
ap = argparse.ArgumentParser()
ap.add_argument("--lang", default="en")
ap.add_argument("--text", help="translated text table (same schema as --export)")
ap.add_argument("--out")
ap.add_argument("--export")
ARGS = ap.parse_known_args()[0] if __name__ == "__main__" else ap.parse_args([])
LANG = ARGS.lang
OUT = pathlib.Path(ARGS.out) if ARGS.out else ROOT / "output/AQUENT_Team_Intro.mp4"
WEB = TEAMIMG / "AQUENT_Team_Intro.mp4" if LANG == "en" and not ARGS.out else None
if LANG != "en":
    B = B / LANG
    L = B / "layers"
    L.mkdir(parents=True, exist_ok=True)
ENC = ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", str(FPS),
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

KINAN = "28339c9805bd41b391a27bdd25fddb5e.mov"
TEAM = [  # clip, photo id, name, role
    ("IMG_0130.MOV", "dhafa", "Dhafa Krisna Bagus Harjanto", "CEO · Chief Executive Officer"),
    ("IMG_0138.MOV", "lais", "Lais Arsalan Farzana Hartanto", "CTO · Chief Technology Officer"),
    ("IMG_0129.MOV", "zharifa", "Zharifa Laduna Faiza", "COO · Chief Operating Officer"),
    ("IMG_0116.MOV", "joanna", "Joanna Dharmarina Saputra", "CPO · Chief Product Officer"),
    (KINAN, "kinan", "Kinan Hayu Prima Andini", "CMO · Chief Marketing Officer"),
]
PROBLEM = ["IMG_0172.MOV", "IMG_0175.MOV", "IMG_0179.MOV", "IMG_0198.MOV"]
# transcript fixes: (word index, words replaced, expected first word, new text) — see SKENARIO.md "Teks yang perlu dicek"
FIXES = {
    "IMG_0116.MOV": [(3, 2, "Yurodalmarina", " Joanna Dharmarina Saputra.")],
    KINAN: [(14, 10, "I", " I manage"), (27, 1, "executing", " execute")],
    "IMG_0172.MOV": [(44, 2, "billion", " billion people,")],
    "IMG_0198.MOV": [(12, 1, "effort", " average"), (19, 5, "obtained", " used for a single bath."), (39, 1, "until", " to")],
}
# data callouts: (trigger word, source, big value, caption)
CALLOUTS = {
    "IMG_0172.MOV": [("UNESCO", "UNESCO · 2024", "Rising", "global water scarcity, year after year"),
                     ("billion", "UNESCO · 2024", "3.6 B", "people (46%) lack safely managed sanitation"),
                     ("Health", "WORLD HEALTH ORGANIZATION", "≈ 10%", "of global health problems come from unsafe water")],
    "IMG_0175.MOV": [("2025", "DRY SEASON", "2025", "one of the longest dry seasons in two decades"),
                     ("2050", "PROJECTION · 2050", "× 3", "river basins facing clean-water scarcity — 3 B people affected")],
    "IMG_0179.MOV": [("Groundwater", "GROUNDWATER", "At risk", "of drying out from prolonged droughts")],
    "IMG_0198.MOV": [("60", "ONE BATH", "60–80 L", "of water used for a single bath"),
                     ("20", "SHOWER SAVINGS", "20–50%", "water saved by bathing with a shower")],
}
TX = {
    "intro_tag": "Smart shower AIoT  ·  greywater reuse  ·  AI Dermatology",
    "title": {"chip": "INNOPA · INDONESIA INVENTORS DAY 2026 · JAKARTA", "lines": ["Meet", "AQUENT."],
              "desc": "The smart shower that gives used water a second life."},
    "team_card": {"chip": "01 · MEET THE TEAM", "lines": ["Five students,", "one mission."]},
    "problem_card": {"chip": "02 · THE PROBLEM", "lines": ["Clean water is running out,", "and bathing uses the most."]},
    "flash": "the smart shower we created",
    "solution": {"chip": "03 · THE SOLUTION", "lines": ["Introducing", "AQUENT."],
                 "desc": "Greywater in, clean water out — filtered by six natural layers, sterilised by UV-C and checked by four sensors."},
    "prototype_cap": "The working prototype, built in the lab",
    "app": {"chip": "AQUENT APP", "lines": ["Every drop,", "monitored live."],
            "desc": "Water-quality score, four sensors, shower control, schedules and AI Dermatology in one app."},
    "journey": {"chip": "04 · THE JOURNEY", "lines": ["Road to", "INNOPA IID Jakarta 2026"]},
    "outro": {"title": "Thank you.", "chip": "AQUENT-ID.WEB.APP  ·  INNOPA IID 2026"},
}


def lines(ls_):
    return [(t, INK) for t in ls_[:-1]] + [(ls_[-1], "grad")]


FILM_CUTS = [(5.2, 10.2), (11.0, 14.6), (23.4, 27.6), (29.2, 33.0), (34.6, 37.8), (38.2, 40.8), (41.2, 45.6), (46.4, 51.6)]
JOURNEY = [("enuma", "With CV. Enuma Technology"), ("sman4", "Visit · SMA Negeri 4 Surakarta"), ("sman4_meet", "Discussion with the school"),
           ("clovers_talk", "Discussion with partners"), ("clovers", "With Clovers"), ("product", "The AQUENT prototype team")]


# ------------------------------------------------------------------ layers ---
def save(im, name):
    p = L / name
    im.save(p)
    return p


def bg():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W * 0.5) / W) ** 2 + ((y - H * 0.42) / H) ** 2)
    k = np.clip(d / 0.75, 0, 1)[..., None]
    img = np.array(hexc("#F6F9FD")[:3]) * (1 - k) + np.array(hexc("#D9E3F0")[:3]) * k
    for cx, cy, r, s in ((0.15, 0.2, 0.32, 30), (0.88, 0.82, 0.38, 34)):
        g = np.exp(-(((x / W - cx) ** 2 + (y / H - cy) ** 2) / (r * r)))[..., None]
        img = img * (1 - g * s / 255) + np.array([120, 175, 255]) * (g * s / 255)
    return save(Image.fromarray(img.clip(0, 255).astype(np.uint8)), "bg.png")


def text_size(txt, f):
    d = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    b = d.textbbox((0, 0), txt, font=f)
    return b[2] - b[0], b[3] - b[1]


def wrap(txt, f, maxw):
    out, cur = [], ""
    for w_ in txt.split():
        t = (cur + " " + w_).strip()
        if text_size(t, f)[0] > maxw and cur:
            out.append(cur)
            cur = w_
        else:
            cur = t
    return out + [cur] if cur else out


def round_photo(path, d):
    im = ImageOps.fit(Image.open(path).convert("RGB"), (d, int(d * 1.25)), Image.LANCZOS, centering=(0.5, 0.0)).crop((0, 0, d, d))
    m = Image.new("L", (d * 4, d * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
    out = Image.new("RGBA", (d, d))
    out.paste(im, (0, 0), m.resize((d, d), Image.LANCZOS))
    return out


def lower_third(pid, name, role, i):
    fn, fr = font(42, "ExtraBold"), font(23, "Bold")
    tw = max(text_size(name, fn)[0], text_size(role, fr)[0] + 40)
    im, m = card(int(tw + 190), 150, 40)
    ph = round_photo(TEAMIMG / f"{pid}_lab.webp", 110)
    ring = Image.new("RGBA", (122, 122))
    ImageDraw.Draw(ring).ellipse((0, 0, 121, 121), fill=hexc(BLUE))
    im.alpha_composite(ring, (m + 18, m + 14))
    im.alpha_composite(ph, (m + 24, m + 20))
    d = ImageDraw.Draw(im)
    d.text((m + 160, m + 24), name, font=fn, fill=hexc(INK))
    rw = text_size(role, fr)[0] + 32
    d.rounded_rectangle((m + 160, m + 86, m + 160 + rw, m + 126), 20, fill=hexc(BLUE))
    d.text((m + 176, m + 92), role, font=fr, fill=(255, 255, 255, 255))
    return save(im, f"lt_{i}.png")


def subtitle(txt, key):
    f = font(40, "SemiBold")
    lines = wrap(txt, f, 1380)
    lh = 54
    tw = max(text_size(l, f)[0] for l in lines)
    w, h = tw + 64, lh * len(lines) + 30
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 22, fill=(15, 28, 58, 196))
    for k, l in enumerate(lines):
        d.text(((w - text_size(l, f)[0]) / 2, 12 + k * lh), l, font=f, fill=(255, 255, 255, 255))
    return save(im, f"sub_{key}.png")


def callout(src, big, cap, key):
    fs, fb, fc = font(19, "ExtraBold"), font(84, "ExtraBold"), font(27, "SemiBold")
    lines = wrap(cap, fc, 440)
    h = 92 + 100 + 38 * len(lines) + 20
    im, m = card(520, h, 36)
    d = ImageDraw.Draw(im)
    cw = text_size(src, fs)[0] + 30
    d.rounded_rectangle((m + 34, m + 30, m + 34 + cw, m + 66), 18, fill=hexc("#DDEBFF"))
    d.text((m + 49, m + 37), src, font=fs, fill=hexc(DEEP))
    # gradient value
    bw, bh = text_size(big, fb)
    mk = Image.new("L", im.size, 0)
    ImageDraw.Draw(mk).text((m + 32, m + 78), big, font=fb, fill=255)
    g = np.zeros((im.size[1], im.size[0], 4), np.uint8)
    t = np.linspace(0, 1, im.size[0])[None, :, None]
    g[..., :3] = (np.array(hexc(BLUE)[:3]) * (1 - t) + np.array(hexc(DEEP)[:3]) * t).astype(np.uint8)
    g[..., 3] = np.array(mk)
    im.alpha_composite(Image.fromarray(g))
    for k, l in enumerate(lines):
        d.text((m + 36, m + 192 + k * 38), l, font=fc, fill=hexc(INK2))
    return save(im, f"co_{key}.png")


def product_flash():
    im, m = card(520, 470, 36)
    u = Image.open(ROOT / "app/assets/3d/unit_hero.png").convert("RGBA")
    u.thumbnail((400, 330), Image.LANCZOS)
    im.alpha_composite(u, (m + (520 - u.width) // 2, m + 20))
    lg = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    lg.thumbnail((230, 60), Image.LANCZOS)
    im.alpha_composite(lg, (m + (520 - lg.width) // 2, m + 370))
    d = ImageDraw.Draw(im)
    t = TX["flash"]
    f = font(24, "Bold")
    d.text((m + (520 - text_size(t, f)[0]) / 2, m + 432), t, font=f, fill=hexc(INK2))
    return save(im, "flash.png")


def act_layers(key, chip, lines, desc, size=96):
    layer_chip(L / f"{key}_chip.png", chip)
    layer_title(L / f"{key}_title.png", lines, size)
    if desc:
        layer_desc(L / f"{key}_desc.png", desc, 900)
    return [L / f"{key}_chip.png", L / f"{key}_title.png"] + ([L / f"{key}_desc.png"] if desc else [])


# --------------------------------------------------------------- subtitles ---
def words_fixed(clip):
    ws = [list(w) for s in TR[clip] for w in s["words"]]
    for idx, n, expect, new in sorted(FIXES.get(clip, []), reverse=True):
        assert expect.lower() in ws[idx][2].lower(), (clip, idx, ws[idx][2], expect)
        ws[idx:idx + n] = [[ws[idx][0], ws[idx + n - 1][1], new]]
    return ws


def chunks(ws):
    out, cur = [], []
    for w_ in ws:
        cur.append(w_)
        txt = "".join(x[2] for x in cur).strip()
        end = w_[2].strip()[-1:] if w_[2].strip() else ""
        if (end in ".?!" and len(txt) > 12) or (end == "," and len(txt) >= 26) or len(txt) >= 44:
            out.append([cur[0][0], cur[-1][1], txt])
            cur = []
    if cur:
        out.append([cur[0][0], cur[-1][1], "".join(x[2] for x in cur).strip()])
    for a, b in zip(out, out[1:]):
        a[1] = min(a[1] + 0.25, b[0])
    if out:
        out[-1][1] += 0.4
    return out


def word_time(ws, key):
    for w_ in ws:
        if key.lower() in w_[2].lower():
            return w_[0]
    raise KeyError(key)


# ------------------------------------------------------------------ segments ---
def silent(dur):
    return ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]


def still(p, dur):
    return ["-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(p)]


def overlay_chain(fc, base, layers, k0):
    """layers: (png, x, y, t0, t1, slide). Returns final label."""
    prev, k = base, k0
    for i, (p, x, y, t0, t1, slide) in enumerate(layers):
        fc.append(f"[{k}]format=rgba,fade=in:st={t0:.2f}:d=0.35:alpha=1,fade=out:st={max(t0, t1 - 0.35):.2f}:d=0.35:alpha=1[l{k}]")
        yy = f"{y}+{slide}*(1-min(max((t-{t0:.2f})/0.5,0),1))" if slide else str(y)
        fc.append(f"[{prev}][l{k}]overlay=x={x}:y='{yy}':enable='between(t,{t0:.2f},{t1:.2f})'[o{k}]")
        prev, k = f"o{k}", k + 1
    return prev, k


def encode(ins, fc, vlab, alab, dur, out):
    ff(*ins, "-filter_complex", ";".join(fc), "-map", f"[{vlab}]", "-map", alab, *ENC, "-t", f"{dur:.3f}", out)
    return out


def seg_card(key, chip, lines, desc, dur, extras=(), size=96):
    """Act / title card on the brand background. extras: (png, x, y, t0)."""
    lay = act_layers(key, chip, lines, desc, size)
    ims = [Image.open(p) for p in lay]
    gap = [0, 18, 10]
    total = sum(im.height for im in ims) + sum(gap[1:len(ims)])
    ytop = (H - total) // 2 - (120 if extras else 0)
    layers, y = [], ytop
    for i, (p, im) in enumerate(zip(lay, ims)):
        y += gap[i]
        layers.append((p, 160, y, 0.15 + 0.12 * i, dur, 26))
        y += im.height
    for p, x, yy, t0 in extras:
        layers.append((p, x, yy, t0, dur, 30))
    ins = still(L / "bg.png", dur)
    for p, *_ in layers:
        ins += still(p, dur)
    ins += silent(dur)
    fc = []
    last, k = overlay_chain(fc, "0", layers, 1)
    fc.append(f"[{last}]fade=out:st={dur - 0.3:.2f}:d=0.3:color={BGC},format=yuv420p[v]")
    return encode(ins, fc, "v", f"{k}:a", dur, B / f"seg_{key}.mp4")


def seg_talk(key, clip, extra_layers_fn=None, rot=False):
    ws = words_fixed(clip)
    ss = max(0.0, ws[0][0] - 0.45)
    to = ws[-1][1] + 0.7
    dur = to - ss
    layers = []
    for i, ((a, b, _en), txt) in enumerate(zip(chunks(ws), TX["subs"][clip])):
        p = subtitle(txt, f"{key}_{i}")
        w_ = Image.open(p).width
        layers.append((p, (W - w_) // 2, H - 60 - Image.open(p).height, a - ss, min(b - ss, dur - 0.1), 0))
    if extra_layers_fn:
        layers += extra_layers_fn(ws, ss, dur)
    ins = ["-ss", f"{ss:.3f}", "-t", f"{dur:.3f}", "-i", str(V / clip)]
    for p, *_ in layers:
        ins += still(p, dur)
    vf = "transpose=2," if rot else ""
    fc = [f"[0:v]{vf}scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1,"
          f"eq=saturation=1.06:contrast=1.03,fade=in:st=0:d=0.3:color={BGC},fade=out:st={dur - 0.3:.2f}:d=0.3:color={BGC}[b0]"]
    last, k = overlay_chain(fc, "b0", layers, 1)
    fc.append(f"[{last}]format=yuv420p[v]")
    fc.append(f"[0:a:0]highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,"
              f"afade=t=in:d=0.15,afade=t=out:st={dur - 0.3:.2f}:d=0.3[a]")
    return encode(ins, fc, "v", "[a]", dur, B / f"seg_{key}.mp4")


def team_extras(pid, name, role, i):
    def fn(ws, ss, dur):
        p = lower_third(pid, name, role, i)
        return [(p, 60, H - 420, 0.35, min(6.0, dur - 0.4), 24)]
    return fn


def problem_extras(clip):
    def fn(ws, ss, dur):
        items = CALLOUTS.get(clip, [])
        times = [word_time(ws, k) - ss - 0.2 for k, *_ in items]
        out = []
        for j, ((k, *_x), (src, big, cap), t0) in enumerate(zip(items, TX["callouts"][clip], times)):
            t1 = min(t0 + 7.5, (times[j + 1] - 0.3) if j + 1 < len(times) else dur - 0.4)
            p = callout(src, big, cap, f"{clip}_{j}")
            out.append((p, W - Image.open(p).width - 50, 70, max(0.2, t0), t1, 28))
        if clip == "IMG_0179.MOV":
            t0 = word_time(ws, "created") - ss
            p = product_flash()
            out.append((p, W - Image.open(p).width - 50, 70, t0, min(t0 + 7, dur - 0.4), 28))
            out[0] = out[0][:4] + (min(out[0][4], t0 - 0.2),) + out[0][5:]
        return out
    return fn


def seg_intro():
    frames = sorted((ROOT / "intro/build/frames_A").glob("f_*.png"))
    dur = len(frames) / FPS
    f = font(34, "SemiBold")
    t = TX["intro_tag"]
    im = Image.new("RGBA", (text_size(t, f)[0] + 20, 60))
    ImageDraw.Draw(im).text((10, 6), t, font=f, fill=hexc(INK2))
    p = save(im, "intro_tag.png")
    sfx = B / "intro_sfx.wav"
    sr = 48000
    n = int(sr * dur)
    tt = np.arange(n) / sr
    a = np.zeros(n)
    def add(t0, sig):
        i = int(t0 * sr)
        a[i:i + len(sig)] += sig[: n - i]
    k = np.arange(int(sr * 0.35)) / sr
    add(1.08, np.sin(2 * np.pi * (1400 * np.exp(-k * 18) + 380) * k) * np.exp(-k * 14) * 0.6)      # drop "plip"
    k2 = np.arange(int(sr * 1.6)) / sr
    nz = np.random.default_rng(3).standard_normal(len(k2))
    add(1.12, np.convolve(nz, np.ones(40) / 40, "same") * np.exp(-k2 * 3) * 0.25)                    # ripple wash
    k3 = np.arange(int(sr * 2.2)) / sr
    add(2.5, sum(np.sin(2 * np.pi * f0 * k3) for f0 in (880, 1318.5, 1760)) * np.exp(-k3 * 2.2) * np.clip(k3 / 0.05, 0, 1) * 0.08)  # shimmer
    a = a / (np.abs(a).max() + 1e-9) * 0.7
    with wave.open(str(sfx), "wb") as w_:
        w_.setnchannels(2); w_.setsampwidth(2); w_.setframerate(sr)
        w_.writeframes((np.stack([a, a], 1) * 32767).astype(np.int16).tobytes())
    ins = ["-framerate", str(FPS), "-i", str(frames[0].parent / "f_%04d.png")] + still(p, dur) + ["-i", str(sfx)]
    fc = [f"[0:v]scale={W}:{H},setsar=1[b0]"]
    last, k = overlay_chain(fc, "b0", [(p, f"{(W - im.width) // 2}", int(H * 0.87), 3.3, dur, 20)], 1)
    fc.append(f"[{last}]fade=out:st={dur - 0.35:.2f}:d=0.35:color={BGC},format=yuv420p[v]")
    return encode(ins, fc, "v", "2:a", dur, B / "seg_00_intro.mp4")


def kenburns(img, dur, out, caption=None, header=None, zoom_in=True):
    im0 = ImageOps.exif_transpose(Image.open(img)).convert("RGB")
    if im0.width / im0.height < 1.3:  # portrait: blurred fill + the whole photo as a rounded card
        src = ImageOps.fit(im0, (2400, 1350), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        src = Image.blend(src, Image.new("RGB", src.size, (233, 239, 247)), 0.35)
        ph = ImageOps.contain(im0, (2000, 1180), Image.LANCZOS)
        mk = Image.new("L", ph.size, 0)
        ImageDraw.Draw(mk).rounded_rectangle((0, 0, ph.width - 1, ph.height - 1), 48, fill=255)
        sh = Image.new("L", src.size, 0)
        x0, y0 = (2400 - ph.width) // 2, (1350 - ph.height) // 2
        ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 30, x0 + ph.width, y0 + ph.height + 30), 48, fill=150)
        src.paste(Image.new("RGB", src.size, (30, 70, 170)), (0, 0), sh.filter(ImageFilter.GaussianBlur(40)))
        src.paste(ph, (x0, y0), mk)
    else:
        src = ImageOps.fit(im0, (2400, 1350), Image.LANCZOS)
    sp = save(src, out.stem + "_src.jpg")
    n = int(dur * FPS)
    z = f"1+0.07*on/{n}" if zoom_in else f"1.07-0.07*on/{n}"
    ins = ["-i", str(sp)]
    fc = [f"[0:v]zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},setsar=1[b0]"]
    layers = []
    if header:
        layers.append((header, 60, 50, 0.0, dur, 0))
    if caption:
        f = font(30, "Bold")
        im, m = card(text_size(caption, f)[0] + 50, 70, 30)
        ImageDraw.Draw(im).text((m + 25, m + 15), caption, font=f, fill=hexc(INK))
        layers.append((save(im, out.stem + "_cap.png"), 50, H - 70 - im.height, 0.3, dur, 18))
    for p, *_ in layers:
        ins += still(p, dur)
    ins += silent(dur)
    last, k = overlay_chain(fc, "b0", layers, 1)
    fc.append(f"[{last}]format=yuv420p[v]")
    return encode(ins, fc, "v", f"{k}:a", dur, out)


def seg_solution():
    # a) act card over the turntable
    dur = 4.6
    lay = act_layers("sol", TX["solution"]["chip"], lines(TX["solution"]["lines"]), TX["solution"]["desc"], 96)
    ins = still(L / "bg.png", dur) + ["-framerate", str(FPS), "-stream_loop", "1", "-i", str(ROOT / "showreel/build/anim/f_%04d.png")]
    for p in lay:
        ins += still(p, dur)
    ins += silent(dur)
    fc = [f"[1:v]scale=900:900[tt]", f"[0][tt]overlay=x={W - 980}:y=110[b0]"]
    ys, layers = 300, []
    for i, p in enumerate(lay):
        layers.append((p, 110, ys, 0.2 + 0.12 * i, dur, 26))
        ys += Image.open(p).height + 18
    last, k = overlay_chain(fc, "b0", layers, 2)
    fc.append(f"[{last}]fade=in:st=0:d=0.3:color={BGC},format=yuv420p[v]")
    a = encode(ins, fc, "v", f"{k}:a", dur, B / "seg_sol_a.mp4")
    # b) process film cuts (English captions are baked into the film)
    film = ROOT / ("output/AQUENT_Process_Film_EN.mp4" if LANG == "en" else "output/AQUENT_Process_Film.mp4")  # captions baked in
    fc, parts = [], []
    for i, (s, e) in enumerate(FILM_CUTS):
        fc.append(f"[0:v]trim=start={s}:end={e},setpts=PTS-STARTPTS,fps={FPS},scale={W}:{H},setsar=1[c{i}]")
        parts.append(f"[c{i}]")
    dur_b = sum(e - s for s, e in FILM_CUTS)
    fc.append("".join(parts) + f"concat=n={len(parts)}:v=1:a=0,format=yuv420p[v]")
    b = encode(["-i", str(film)] + silent(dur_b), fc, "v", "1:a", dur_b, B / "seg_sol_b.mp4")
    # c) the real prototype
    c = kenburns(sorted((ROOT / "galeri").glob("*.jpeg"))[2], 4.0, B / "seg_sol_c.mp4", caption=TX["prototype_cap"])
    # d) the app
    dur = 5.0
    lay = act_layers("app", TX["app"]["chip"], lines(TX["app"]["lines"]), TX["app"]["desc"], 84)
    phones = []
    for nm in ("phone_home", "phone_xai"):
        im = Image.open(ROOT / f"poster/{nm}.png").convert("RGBA")
        im.thumbnail((440, 820), Image.LANCZOS)
        phones.append(save(im, nm + ".png"))
    layers, ys = [], 330
    for i, p in enumerate(lay):
        layers.append((p, 110, ys, 0.2 + 0.12 * i, dur, 26))
        ys += Image.open(p).height + 18
    layers += [(phones[0], W - 980, 150, 0.3, dur, 40), (phones[1], W - 560, 220, 0.5, dur, 40)]
    ins = still(L / "bg.png", dur)
    for p, *_ in layers:
        ins += still(p, dur)
    ins += silent(dur)
    fc = []
    last, k = overlay_chain(fc, "0", layers, 1)
    fc.append(f"[{last}]fade=out:st={dur - 0.3:.2f}:d=0.3:color={BGC},format=yuv420p[v]")
    d = encode(ins, fc, "v", f"{k}:a", dur, B / "seg_sol_d.mp4")
    return [a, b, c, d]


def seg_journey():
    layer_chip(L / "jr_chip.png", TX["journey"]["chip"])
    layer_title(L / "jr_title.png", lines(TX["journey"]["lines"]), 54)
    c, t = Image.open(L / "jr_chip.png"), Image.open(L / "jr_title.png")
    hdr, m = card(max(c.width, t.width) + 60, c.height + t.height + 60, 34)
    hdr.alpha_composite(c, (m + 30, m + 26))
    hdr.alpha_composite(t, (m + 30, m + 36 + c.height))
    hp = save(hdr, "jr_header.png")
    per, xf = 2.8, 0.5
    clips = [kenburns(TEAMIMG / f"journey_{k}.webp", per, B / f"jr_{i}.mp4", caption=cap, header=hp, zoom_in=i % 2 == 0)
             for i, (k, cap) in enumerate(zip([j[0] for j in JOURNEY], TX["journey"]["captions"]))]
    ins, fc = [], []
    for p in clips:
        ins += ["-i", str(p)]
    prev, off = "0:v", 0.0
    for i in range(1, len(clips)):
        off += per - xf
        fc.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={xf}:offset={off:.2f}[x{i}]")
        prev = f"x{i}"
    dur = per * len(clips) - xf * (len(clips) - 1)
    fc.append(f"[{prev}]fade=in:st=0:d=0.3:color={BGC},fade=out:st={dur - 0.35:.2f}:d=0.35:color={BGC},format=yuv420p[v]")
    return encode(ins + silent(dur), fc, "v", f"{len(clips)}:a", dur, B / "seg_journey.mp4")


def seg_outro():
    dur = 7.5
    lg = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    lg.thumbnail((620, 160), Image.LANCZOS)
    lgp = save(lg, "out_logo.png")
    layer_title(L / "out_title.png", [(TX["outro"]["title"], INK)], 84)
    f = font(30, "Bold")
    names = "Dhafa  ·  Lais  ·  Zharifa  ·  Joanna  ·  Kinan"
    im = Image.new("RGBA", (text_size(names, f)[0] + 20, 50))
    ImageDraw.Draw(im).text((10, 4), names, font=f, fill=hexc(INK2))
    np_ = save(im, "out_names.png")
    layer_chip(L / "out_chip.png", TX["outro"]["chip"])
    items = [(lgp, 0.2), (L / "out_title.png", 0.6), (np_, 1.0), (L / "out_chip.png", 1.4)]
    layers, y = [], 250
    for p, t0 in items:
        w_, h_ = Image.open(p).size
        layers.append((p, (W - w_) // 2, y, t0, dur, 26))
        y += h_ + 34
    ins = still(L / "bg.png", dur)
    for p, *_ in layers:
        ins += still(p, dur)
    ins += silent(dur)
    fc = []
    last, k = overlay_chain(fc, "0", layers, 1)
    fc.append(f"[{last}]fade=in:st=0:d=0.3:color={BGC},fade=out:st={dur - 1.2:.2f}:d=1.2:color={BGC},format=yuv420p[v]")
    return encode(ins, fc, "v", f"{k}:a", dur, B / "seg_outro.mp4")


def build_tx():
    TX["journey"]["captions"] = [c for _, c in JOURNEY]
    TX["callouts"] = {c: [[s_, b_, t_] for _, s_, b_, t_ in v] for c, v in CALLOUTS.items()}
    TX["subs"] = {c: [t for *_, t in chunks(words_fixed(c))] for c in [t[0] for t in TEAM] + PROBLEM}
    if ARGS.text:
        tr = json.loads(pathlib.Path(ARGS.text).read_text(encoding="utf-8"))
        for k, v in tr.items():
            if k in TX and isinstance(v, dict) and isinstance(TX[k], dict) and k not in ("callouts", "subs"):
                TX[k].update(v)
            elif k in TX:
                TX[k] = v
        for c, en in list(TX["subs"].items()):
            assert len(TX["subs"][c]) == len(chunks(words_fixed(c))), f"subtitle count mismatch for {c}"
    if ARGS.export:
        pathlib.Path(ARGS.export).write_text(json.dumps(TX, ensure_ascii=False, indent=1), encoding="utf-8")
        print("exported", ARGS.export)
        sys.exit(0)


def duration(p):
    r = subprocess.run([FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    return float(r.stdout)


def main():
    build_tx()
    bg()
    segs = [seg_intro()]
    segs.append(seg_card("title", TX["title"]["chip"], lines(TX["title"]["lines"]), TX["title"]["desc"], 3.8, size=130))
    strip = []
    for j, (_, pid, *_r) in enumerate(TEAM):
        ph = ImageOps.fit(Image.open(TEAMIMG / f"{pid}_lab.webp").convert("RGBA"), (230, 288), Image.LANCZOS)
        im, m = card(230, 288, 30)
        mk = Image.new("L", (230, 288), 0)
        ImageDraw.Draw(mk).rounded_rectangle((0, 0, 229, 287), 30, fill=255)
        im.paste(ph, (m, m), mk)
        strip.append((save(im, f"strip_{j}.png"), 160 - 40 + j * 270, 590, 0.5 + 0.1 * j))
    segs.append(seg_card("team", TX["team_card"]["chip"], lines(TX["team_card"]["lines"]), None, 3.8, strip, size=92))
    for i, (clip, pid, name, role) in enumerate(TEAM):
        segs.append(seg_talk(f"t{i}", clip, team_extras(pid, name, role, i), rot=clip == KINAN))
    segs.append(seg_card("problem", TX["problem_card"]["chip"], lines(TX["problem_card"]["lines"]), None, 3.4, size=80))
    for i, clip in enumerate(PROBLEM):
        segs.append(seg_talk(f"p{i}", clip, problem_extras(clip)))
    segs += seg_solution()
    segs.append(seg_journey())
    segs.append(seg_outro())

    lst = B / "segments.txt"
    lst.write_text("\n".join(f"file '{p.as_posix()}'" for p in segs))
    total = sum(duration(p) for p in segs)
    intro = duration(segs[0])
    music = B / "music.wav"
    synth_music(total - intro + 1, music)
    ff("-f", "concat", "-safe", 0, "-i", lst, "-i", music, "-filter_complex",
       f"[0:a]aresample=48000,asplit[s1][s2];[1:a]aresample=48000,volume=0.5,adelay={int(intro * 1000)}|{int(intro * 1000)}[m];"
       "[m][s1]sidechaincompress=threshold=0.02:ratio=12:attack=20:release=600:makeup=1[md];"
       "[s2][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]",
       "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT)
    if WEB:
        ff("-i", OUT, "-vf", "scale=1280:-2", "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-c:a", "aac", "-b:a", "128k",
           "-movflags", "+faststart", WEB)
        ff("-ss", "20", "-i", OUT, "-frames:v", "1", "-vf", "scale=1280:-2", "-c:v", "libwebp", "-quality", "80", TEAMIMG / "video_poster.webp")
    print(f"WROTE {OUT}  {total:.1f}s")


if __name__ == "__main__":
    main()
