"""
AQUENT showreel composer (Python + FFmpeg).

Needs:  showreel/build/rec/rec.mp4 + marks.json   (from record.py)
        showreel/build/anim/f_*.png               (Blender turntable, assets.py anim)
        app/assets/3d/*.png                       (Blender assets)

Produces:
  showreel/build/scenes/NN_name.mp4        titled scene clips (1920x1080, 30 fps)
  showreel/build/scenes/clean/NN_name.mp4  same scenes without titles (for the CapCut edit)
  showreel/build/music.wav                 synthesized ambient soundtrack
  output/AQUENT_Showreel.mp4               final showreel
"""
import json, math, os, pathlib, shutil, subprocess, sys, wave, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
B = ROOT / "showreel/build"
C = B / "comp"
S = B / "scenes"
A3 = ROOT / "app/assets/3d"
OUTDIR = ROOT / "output"
FONT = str(ROOT / "showreel/fonts/PlusJakartaSans.ttf")
FFMPEG = shutil.which("ffmpeg") or (glob.glob(os.environ.get("LOCALAPPDATA", "").replace("\\", "/") +
    "/Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe") or ["ffmpeg"])[0]
W, H, FPS = 1920, 1080, 30
XF = 0.6  # crossfade length

INK, INK2, BLUE, DEEP, ICE, BG = "#16233F", "#4A5A7A", "#2F7BFF", "#1646D6", "#DDEBFF", "#E9EFF7"

for d in (C, S, S / "clean", OUTDIR):
    d.mkdir(parents=True, exist_ok=True)


def ff(*args):
    cmd = [FFMPEG, "-y", "-loglevel", "error", *map(str, args)]
    r = subprocess.run(cmd)
    if r.returncode:
        sys.exit("ffmpeg failed: " + " ".join(cmd))


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f


def hexc(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# ------------------------------------------------------------------ plates ---
def make_bg():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W * 0.5) / W) ** 2 + ((y - H * 0.42) / H) ** 2)
    k = np.clip(d / 0.75, 0, 1)[..., None]
    c0, c1 = np.array(hexc("#F6F9FD")[:3]), np.array(hexc("#D9E3F0")[:3])
    img = c0 * (1 - k) + c1 * k
    # soft blue glows
    for cx, cy, r, s in ((0.18, 0.2, 0.35, 16), (0.85, 0.85, 0.4, 18)):
        g = np.exp(-(((x / W - cx) ** 2 + (y / H - cy) ** 2) / (r * r)))[..., None]
        img = img * (1 - g * s / 255) + np.array([140, 190, 255]) * (g * s / 255)
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(C / "bg.png")


# phone geometry (px, final 1080p space)
SW, SH = 404, 874          # screen
BZ = 12                    # rim+bezel thickness
PW, PH = SW + 2 * BZ, SH + 2 * BZ
M = 90                     # shadow margin around the body
FW, FH = PW + 2 * M, PH + 2 * M


def rrect(size, box, r, fill, ss=1):
    im = Image.new("L", size, 0)
    ImageDraw.Draw(im).rounded_rectangle(box, r, fill=fill)
    return im


def make_phone():
    s = 2  # supersample
    fw, fh, m, pw, ph, bz = FW * s, FH * s, M * s, PW * s, PH * s, BZ * s
    out = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    body = (m, m, m + pw, m + ph)
    # neumorphic shadows: dark bottom-right, light top-left
    dark = rrect((fw, fh), (m + 26 * s, m + 36 * s, m + pw + 26 * s, m + ph + 36 * s), 66 * s, 150).filter(ImageFilter.GaussianBlur(40 * s))
    out.paste(Image.new("RGBA", (fw, fh), (70, 105, 165, 255)), (0, 0), dark)
    lite = rrect((fw, fh), (m - 20 * s, m - 20 * s, m + pw - 20 * s, m + ph - 20 * s), 66 * s, 230).filter(ImageFilter.GaussianBlur(30 * s))
    out.paste(Image.new("RGBA", (fw, fh), (255, 255, 255, 255)), (0, 0), lite)
    # side buttons
    btn = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    bd = ImageDraw.Draw(btn)
    for y0, y1 in ((190, 250), (270, 330)):
        bd.rounded_rectangle((m - 4 * s, m + y0 * s, m + 6 * s, m + y1 * s), 3 * s, fill=(200, 210, 225, 255))
    bd.rounded_rectangle((m + pw - 6 * s, m + 230 * s, m + pw + 4 * s, m + 330 * s), 3 * s, fill=(200, 210, 225, 255))
    out.alpha_composite(btn)
    # titanium body with vertical gradient
    grad = Image.new("RGBA", (fw, fh))
    ga = np.zeros((fh, fw, 4), np.uint8)
    t = np.linspace(0, 1, fh)[:, None]
    top, bot = np.array([252, 253, 255]), np.array([206, 216, 231])
    ga[..., :3] = (top * (1 - t) + bot * t)[:, None, :].astype(np.uint8)
    ga[..., 3] = 255
    grad = Image.fromarray(ga)
    out.paste(grad, (0, 0), rrect((fw, fh), body, 66 * s, 255))
    # black bezel
    out.paste(Image.new("RGBA", (fw, fh), (10, 14, 24, 255)), (0, 0),
              rrect((fw, fh), (m + 5 * s, m + 5 * s, m + pw - 5 * s, m + ph - 5 * s), 61 * s, 255))
    # screen hole
    hole = rrect((fw, fh), (m + bz, m + bz, m + pw - bz, m + ph - bz), 54 * s, 255)
    a = np.array(out)
    a[..., 3] = np.where(np.array(hole) > 0, 255 - np.array(hole), a[..., 3]).astype(np.uint8)
    out = Image.fromarray(a)
    # glass glare (very subtle) + dynamic island
    yy, xx = np.mgrid[0:fh, 0:fw]
    gl = np.clip(1 - ((xx - m) / pw + (yy - m) / ph * 0.8), 0, 1) ** 3 * 26
    wl = Image.new("RGBA", (fw, fh), (255, 255, 255, 255))
    wl.putalpha(Image.fromarray((gl * (np.array(hole) > 0)).astype(np.uint8)))
    out.alpha_composite(wl)
    isl = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    ImageDraw.Draw(isl).rounded_rectangle((fw // 2 - 60 * s, m + bz + 11 * s, fw // 2 + 60 * s, m + bz + 45 * s), 17 * s, fill=(5, 7, 12, 255))
    out.alpha_composite(isl)
    out.resize((FW, FH), Image.LANCZOS).save(C / "phone.png")
    rrect((SW * s, SH * s), (0, 0, SW * s - 1, SH * s - 1), 54 * s, 255).resize((SW, SH), Image.LANCZOS).save(C / "mask.png")


# ------------------------------------------------------------- text layers ---
def text_w(draw, txt, f, track=0):
    return draw.textlength(txt, font=f) + track * max(0, len(txt) - 1)


def draw_tracked(draw, xy, txt, f, fill, track=0):
    x, y = xy
    for ch in txt:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + track


def layer_chip(path, label):
    f = font(21, "ExtraBold")
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = text_w(tmp, label, f, 3)
    w, h = int(tw + 44), 44
    im = Image.new("RGBA", (w + 4, h + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w, h), 22, fill=hexc(ICE))
    draw_tracked(d, (22, 9), label, f, hexc(DEEP), 3)
    im.save(path)


def layer_title(path, lines, size=78):
    f = font(size, "ExtraBold")
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    w = int(max(text_w(tmp, t, f, -1.5) for t, _ in lines)) + 20
    lh = int(size * 1.12)
    im = Image.new("RGBA", (w, lh * len(lines) + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, (t, c) in enumerate(lines):
        if c == "grad":
            m = Image.new("L", im.size, 0)
            draw_tracked(ImageDraw.Draw(m), (0, i * lh), t, f, 255, -1.5)
            g = np.zeros((im.size[1], im.size[0], 4), np.uint8)
            k = np.linspace(0, 1, im.size[0])[None, :, None]
            g[..., :3] = (np.array(hexc(BLUE)[:3]) * (1 - k) + np.array(hexc(DEEP)[:3]) * k).astype(np.uint8)
            g[..., 3] = np.array(m)
            im.alpha_composite(Image.fromarray(g))
        else:
            draw_tracked(d, (0, i * lh), t, f, hexc(c), -1.5)
    im.save(path)


def wrap(draw, txt, f, maxw):
    out, cur = [], ""
    for word in txt.split():
        nxt = (cur + " " + word).strip()
        if draw.textlength(nxt, font=f) > maxw and cur:
            out.append(cur)
            cur = word
        else:
            cur = nxt
    return out + [cur]


def layer_desc(path, txt, maxw=640):
    f = font(27, "Medium")
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    lines = wrap(tmp, txt, f, maxw)
    im = Image.new("RGBA", (maxw + 20, 42 * len(lines) + 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        d.text((0, i * 42), l, font=f, fill=hexc(INK2))
    im.save(path)


def neu_pill(label, icon, f):
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = int(tmp.textlength(label, font=f))
    w, h, pad = 64 + tw + 26, 62, 28
    im = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    box = (pad, pad, pad + w, pad + h)
    sd = rrect(im.size, (box[0] + 7, box[1] + 9, box[2] + 7, box[3] + 9), 31, 150).filter(ImageFilter.GaussianBlur(10))
    im.paste(Image.new("RGBA", im.size, (150, 170, 200, 255)), (0, 0), sd)
    sl = rrect(im.size, (box[0] - 6, box[1] - 6, box[2] - 6, box[3] - 6), 31, 255).filter(ImageFilter.GaussianBlur(9))
    im.paste(Image.new("RGBA", im.size, (255, 255, 255, 255)), (0, 0), sl)
    im.paste(Image.new("RGBA", im.size, hexc(BG)), (0, 0), rrect(im.size, box, 31, 255))
    ic = Image.open(A3 / f"{icon}.png").convert("RGBA")
    ic.thumbnail((50, 50), Image.LANCZOS)
    im.alpha_composite(ic, (pad + 9 + (50 - ic.width) // 2, pad + 6 + (50 - ic.height) // 2))
    ImageDraw.Draw(im).text((pad + 64, pad + 17), label, font=f, fill=hexc(INK))
    return im, pad


def layer_pills(path, pills, maxw=820):
    f = font(21, "Bold")
    items = [neu_pill(l, i, f) for i, l in pills]
    pad = items[0][1]
    rows, cur, x = [], [], 0
    for im, _ in items:
        w = im.width - 2 * pad
        if cur and x + w > maxw:
            rows.append(cur)
            cur, x = [], 0
        cur.append((im, x))
        x += w + 18
    rows.append(cur)
    rh = items[0][0].height - 2 * pad
    out = Image.new("RGBA", (maxw + 2 * pad, len(rows) * (rh + 18) + 2 * pad), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for im, x in row:
            out.alpha_composite(im, (x, r * (rh + 18)))
    out.save(path)
    return pad


# ------------------------------------------------------------------ scenes ---
SCENES = [
    dict(seg="splash", chip="01 · AQUENT APP", title=[("Mandi cerdas,", INK), ("air kembali bersih.", "grad")],
         desc="Companion app untuk smart shower AIoT: daur ulang greywater, sensor kualitas air & AI Dermatology.",
         pills=[("recycle", "Daur ulang greywater"), ("shield", "Sensor QC"), ("robot", "AI Derma")], icon="drop", deco="a"),
    dict(seg="home", chip="02 · DASHBOARD", title=[("Semua status,", INK), ("dalam satu layar.", "grad")],
         desc="Status shower, skor kualitas air, empat sensor, kesehatan filter dan air yang dihemat — real-time.",
         pills=[("shield", "Skor air 92/100"), ("recycle", "42 L didaur ulang"), ("filter", "Filter 86%")], icon="shield", deco="b"),
    dict(seg="monitor", chip="03 · SMART MONITORING", title=[("Kualitas air,", INK), ("terpantau real-time.", "grad")],
         desc="Empat sensor memverifikasi air hasil daur ulang setiap 2 detik sebelum dipakai kembali.",
         pills=[("ph", "pH · SEN0165"), ("turbidity", "Turbidity · SEN0189"), ("chlorine", "Sisa klorin · ORP"), ("temp", "Suhu · DS18B20")], icon="ph", deco="a"),
    dict(seg="filter", chip="04 · FILTRASI MULTILAYER", title=[("6 lapis filter", INK), ("dari bahan alami.", "grad")],
         desc="Pra-filtrasi (daun bambu, loofah), adsorpsi (zeolit, biochar kulit pisang, kitosan) dan polishing (ampas tebu) — menyaring partikel, logam berat, polutan organik & mikroba.",
         pills=[("filter", "3 tahap · 6 lapis"), ("leaf", "Eco-friendly"), ("recycle", "Material daur ulang")], icon="filter", deco="b"),
    dict(seg="shower", chip="05 · SESI MANDI", title=[("Kontrol mandi", INK), ("yang presisi.", "grad")],
         desc="Atur suhu lewat dial, pilih preset suhu ruang atau hangat, lalu pantau air terpakai vs. air daur ulang.",
         pills=[("temp", "20–40°C"), ("recycle", "Mode Eco"), ("drop", "Hemat air bersih")], icon="unit_iso", deco="a"),
    dict(seg="schedule", chip="06 · JADWAL & STRATEGI", title=[("Jadwal mandi", INK), ("sesuai iklim.", "grad")],
         desc="Tropis: 2–3× sehari dengan air suhu ruang. Subtropis: 1–2× sehari, disesuaikan dengan musim.",
         pills=[("sun", "Tropis"), ("snow", "Subtropis"), ("calendar", "Pengingat otomatis")], icon="calendar", deco="b"),
    dict(seg="derma", chip="07 · AI DERMATOLOGY", title=[("Asisten kulit", INK), ("bertenaga AI.", "grad")],
         desc="Scan kulit, analisis kelembapan & sensitivitas, lalu rekomendasi mandi yang disesuaikan dengan kualitas air.",
         pills=[("robot", "Scan kulit"), ("sparkle", "Rekomendasi personal"), ("shield", "Air aman untuk kulit")], icon="robot", deco="a", maxdur=13.8),
    dict(seg="impact", chip="08 · DAMPAK & SDGs", title=[("Dampak nyata", INK), ("untuk bumi.", "grad")],
         desc="Point-of-use treatment tanpa tangki terpisah: hemat air bersih setiap hari dan mendukung SDGs 3 · 6 · 9 · 12.",
         pills=[("globe", "1.260 L / bulan"), ("leaf", "SDG 3 · 6 · 9 · 12")], icon="globe", deco="b"),
]

def deco_for(kind, text_left):
    """Deco layer with the 3D props faded out behind the title block."""
    path = C / f"deco_{kind}_{'L' if text_left else 'R'}.png"
    if not path.exists():
        a = np.array(Image.open(A3 / f"bg_deco_{kind}.png").convert("RGBA")).astype(np.float32)
        y, x = np.mgrid[0:H, 0:W]
        cx = 560 if text_left else 1400
        m = np.exp(-(((x - cx) / 470) ** 2 + ((y - 540) / 300) ** 2) ** 1.6)
        a[..., 3] *= 1 - 0.9 * m
        Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(path)
    return path


EASE = "(1-pow(1-min(max((t-{st})/{d},0),1),3))"  # easeOutCubic 0→1 starting at st over d


def scene_layout(i):
    phone_right = i % 2 == 0
    pcx = 1330 if phone_right else 590
    tx = 150 if phone_right else 1010
    return phone_right, pcx, tx


def render_scene(i, sc, marks):
    name = f"{i + 1:02d}_{sc['seg']}"
    t0, t1 = marks[sc["seg"]]
    dur = min(t1 - t0, sc.get("maxdur", 99))
    phone_right, pcx, tx = scene_layout(i)
    L = C / name
    L.mkdir(exist_ok=True)
    layer_chip(L / "chip.png", sc["chip"])
    layer_title(L / "title.png", sc["title"])
    layer_desc(L / "desc.png", sc["desc"])
    ppad = layer_pills(L / "pills.png", sc["pills"])
    ic = Image.open(A3 / f"{sc['icon']}.png").convert("RGBA")
    ic.thumbnail((250, 250), Image.LANCZOS)
    ic.save(L / "icon.png")

    fx, fy = pcx - FW // 2, (H - FH) // 2
    sx, sy = fx + M + BZ, fy + M + BZ
    ix = (pcx - PW // 2 - ic.width + 70) if phone_right else (pcx + PW // 2 - 70)
    iy = 120
    # vertical block of text centred on the frame
    ch_h, ti_h, de_h = (Image.open(L / n).height for n in ("chip.png", "title.png", "desc.png"))
    pi_h = Image.open(L / "pills.png").height - 2 * ppad
    block = ch_h + 30 + ti_h + 14 + de_h + 30 + pi_h
    ty0 = (H - block) // 2
    y_chip, y_title = ty0, ty0 + ch_h + 30
    y_desc = y_title + ti_h + 14
    y_pills = y_desc + de_h + 30 - ppad

    E = EASE.format(st=0, d=0.9)
    lp = lambda f: ["-framerate", FPS, "-loop", 1, "-t", f"{dur:.3f}", "-i", f]
    args = [*lp(C / "bg.png"), *lp(deco_for(sc["deco"], phone_right)),
            "-ss", f"{t0:.3f}", "-t", f"{dur:.3f}", "-i", B / "rec/rec.mp4",
            *lp(C / "mask.png"), *lp(C / "phone.png"), *lp(L / "icon.png"),
            *lp(L / "chip.png"), *lp(L / "title.png"), *lp(L / "desc.png"), *lp(L / "pills.png")]
    drift = "x='-24+24*sin(2*PI*t/14)':y='-8+8*cos(2*PI*t/11)'"
    slide = lambda st: f"{tx}-50*(1-{EASE.format(st=st, d=0.8)})"
    fc = (
        f"[1]format=rgba[deco];[0][deco]overlay={drift}[bg];"
        f"[2]fps={FPS},scale={SW}:{SH}:flags=lanczos,format=rgba[s0];[3]format=gray,scale={SW}:{SH}[m];[s0][m]alphamerge,fade=in:st=0:d=0.45:alpha=1[scr];"
        f"[4]format=rgba,fade=in:st=0:d=0.45:alpha=1[fr];"
        f"[bg][scr]overlay=x={sx}:y='{sy}+160*(1-{E})'[v0];"
        f"[v0][fr]overlay=x={fx}:y='{fy}+160*(1-{E})'[v1b];"
        f"[5]format=rgba,fade=in:st=0.45:d=0.6:alpha=1[ic];"
        f"[v1b][ic]overlay=x={ix}:y='{iy}+14*sin(2*PI*(t-0.45)/3.4)+60*(1-{EASE.format(st=0.45, d=0.9)})',format=yuv420p,split[clean][vt];"
        f"[6]format=rgba,fade=in:st=0.30:d=0.5:alpha=1[t1];[7]format=rgba,fade=in:st=0.45:d=0.6:alpha=1[t2];"
        f"[8]format=rgba,fade=in:st=0.70:d=0.6:alpha=1[t3];[9]format=rgba,fade=in:st=0.95:d=0.6:alpha=1[t4];"
        f"[vt][t1]overlay=x='{slide(0.3)}':y={y_chip}[a1];[a1][t2]overlay=x='{slide(0.45)}':y={y_title}[a2];"
        f"[a2][t3]overlay=x='{slide(0.7)}':y={y_desc}[a3];[a3][t4]overlay=x='{slide(0.95)}-{ppad}':y={y_pills},format=yuv420p[titled]"
    )
    enc = ["-r", FPS, "-c:v", "libx264", "-crf", 16, "-preset", "medium", "-pix_fmt", "yuv420p"]
    ff(*args, "-filter_complex", fc, "-map", "[titled]", *enc, S / f"{name}.mp4",
       "-map", "[clean]", *enc, S / "clean" / f"{name}.mp4")
    print("scene", name, f"{dur:.2f}s")
    return S / f"{name}.mp4", dur


def render_intro(dur=5.6):
    L = C / "intro"
    L.mkdir(exist_ok=True)
    logo = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    logo.thumbnail((700, 400), Image.LANCZOS)
    logo.save(L / "word.png")
    layer_chip(L / "chip.png", "AIoT SMART SHOWER")
    layer_desc(L / "desc.png", "Multilayer recycled-material filtration, purified greywater reuse & AI Dermatology Assistant.", 700)
    anim = B / "anim"
    E = EASE.format(st=0, d=1.0)
    lp = lambda f: ["-framerate", FPS, "-loop", 1, "-t", f"{dur:.3f}", "-i", f]
    args = [*lp(C / "bg.png"), *lp(deco_for("b", False)), "-framerate", FPS, "-i", anim / "f_%04d.png",
            *lp(L / "chip.png"), *lp(L / "word.png"), *lp(L / "desc.png")]
    fc = (
        f"[1]format=rgba[deco];[0][deco]overlay=x='-24+24*sin(2*PI*t/14)':y=0[bg];"
        f"[2]format=rgba,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,trim=duration={dur},setpts=PTS-STARTPTS,"
        f"scale=860:860:flags=lanczos,fade=in:st=0:d=0.8:alpha=1[sh];"
        f"[bg][sh]overlay=x=150:y='110+80*(1-{E})'[v0];"
        f"[3]format=rgba,fade=in:st=0.5:d=0.5:alpha=1[c];[4]format=rgba,fade=in:st=0.7:d=0.7:alpha=1[w];[5]format=rgba,fade=in:st=1.1:d=0.7:alpha=1[d];"
        f"[v0][c]overlay=x='1040-50*(1-{EASE.format(st=0.5, d=0.8)})':y=330[v1];"
        f"[v1][w]overlay=x='1030-50*(1-{EASE.format(st=0.7, d=0.9)})':y=395[v2];"
        f"[v2][d]overlay=x='1040-50*(1-{EASE.format(st=1.1, d=0.9)})':y=600,format=yuv420p,split[t][c2]"
    )
    enc = ["-r", FPS, "-c:v", "libx264", "-crf", 16, "-preset", "medium", "-pix_fmt", "yuv420p"]
    ff(*args, "-filter_complex", fc, "-map", "[t]", *enc, S / "00_intro.mp4", "-map", "[c2]", *enc, S / "clean/00_intro.mp4")
    print("scene 00_intro")
    return S / "00_intro.mp4", dur


def grab(t):
    p = C / f"grab_{t}.png"
    ff("-ss", t, "-i", B / "rec/rec.mp4", "-frames:v", 1, p)
    return Image.open(p).convert("RGBA")


def phone_with(screen, scale=1.0):
    fr = Image.open(C / "phone.png").convert("RGBA")
    base = Image.new("RGBA", fr.size, (0, 0, 0, 0))
    scr = screen.resize((SW, SH), Image.LANCZOS)
    scr.putalpha(Image.open(C / "mask.png"))
    base.alpha_composite(scr, (M + BZ, M + BZ))
    base.alpha_composite(fr)
    if scale != 1:
        base = base.resize((int(fr.width * scale), int(fr.height * scale)), Image.LANCZOS)
    return base


def render_outro(marks, dur=6.5):
    L = C / "outro"
    L.mkdir(exist_ok=True)
    cl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shots = [(marks["monitor"][0] + 7.8, 0.82, 1080, 150), (marks["derma"][0] + 5.5, 0.82, 1640, 150), (marks["home"][0] + 1.6, 0.94, 1360, 80)]
    for t, s, cx, y in shots:
        ph = phone_with(grab(round(t, 2)), s)
        cl.alpha_composite(ph, (cx - ph.width // 2, y))
    cl.save(L / "phones.png")
    logo = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    logo.thumbnail((520, 300), Image.LANCZOS)
    logo.save(L / "word.png")
    layer_desc(L / "desc.png", "Air lebih bersih, kulit lebih sehat, bumi lebih lestari.", 560)
    # SDG badges
    fb = font(30, "ExtraBold")
    sdg = Image.new("RGBA", (4 * 86, 90), (0, 0, 0, 0))
    d = ImageDraw.Draw(sdg)
    for i, (n, c) in enumerate((("3", "#4C9F38"), ("6", "#26BDE2"), ("9", "#FD6925"), ("12", "#BF8B2E"))):
        d.rounded_rectangle((i * 86, 10, i * 86 + 70, 80), 20, fill=hexc(c))
        tw = d.textlength(n, font=fb)
        d.text((i * 86 + 35 - tw / 2, 24), n, font=fb, fill=(255, 255, 255, 255))
    sdg.save(L / "sdg.png")
    layer_chip(L / "chip.png", "SDGs 3 · 6 · 9 · 12")
    lp = lambda f: ["-framerate", FPS, "-loop", 1, "-t", f"{dur:.3f}", "-i", f]
    args = [*lp(C / "bg.png"), *lp(deco_for("a", True)), *lp(L / "phones.png"), *lp(L / "word.png"),
            *lp(L / "desc.png"), *lp(L / "sdg.png"), *lp(A3 / "drop.png")]
    E = EASE.format(st=0, d=1.1)
    fc = (
        f"[1]format=rgba[deco];[0][deco]overlay=x='-24+24*sin(2*PI*t/14)':y=0[bg];"
        f"[2]format=rgba,fade=in:st=0:d=0.6:alpha=1[p];[bg][p]overlay=x=0:y='40+120*(1-{E})-8*t'[v0];"
        f"[6]format=rgba,scale=110:-1,fade=in:st=0.4:d=0.5:alpha=1[dr];[v0][dr]overlay=x=150:y='250+10*sin(2*PI*t/3)'[v1];"
        f"[3]format=rgba,fade=in:st=0.6:d=0.7:alpha=1[w];[v1][w]overlay=x='150-50*(1-{EASE.format(st=0.6, d=0.9)})':y=390[v2];"
        f"[4]format=rgba,fade=in:st=0.9:d=0.7:alpha=1[d];[v2][d]overlay=x='156-50*(1-{EASE.format(st=0.9, d=0.9)})':y=560[v3];"
        f"[5]format=rgba,fade=in:st=1.2:d=0.7:alpha=1[s];[v3][s]overlay=x='150-50*(1-{EASE.format(st=1.2, d=0.9)})':y=640,"
        f"fade=out:st={dur - 0.9}:d=0.9:color=0xE9EFF7,format=yuv420p,split[t][c]"
    )
    enc = ["-r", FPS, "-c:v", "libx264", "-crf", 16, "-preset", "medium", "-pix_fmt", "yuv420p"]
    ff(*args, "-filter_complex", fc, "-map", "[t]", *enc, S / "99_outro.mp4", "-map", "[c]", *enc, S / "clean/99_outro.mp4")
    print("scene 99_outro")
    return S / "99_outro.mp4", dur


# ------------------------------------------------------------------- music ---
def synth_music(total, path):
    sr = 44100
    n = int(sr * (total + 1))
    t = np.arange(n) / sr
    bpm = 100
    beat = 60 / bpm
    bar = beat * 4
    note = lambda m: 440 * 2 ** ((m - 69) / 12)
    # Dmaj9 – Bm9 – Gmaj7 – A6/9 (two bars each)
    prog = [[50, 57, 61, 64, 66, 69], [47, 54, 57, 61, 64, 66], [43, 50, 54, 57, 62, 66], [45, 52, 57, 59, 61, 64]]
    out = np.zeros(n)
    chord_len = bar * 2
    # pad
    for ci in range(int(total / chord_len) + 2):
        ch = prog[ci % 4]
        st = ci * chord_len
        a, b = int(max(0, st - 0.6) * sr), min(n, int((st + chord_len + 0.8) * sr))
        if a >= n:
            break
        tt = t[a:b] - st
        env = np.clip((tt + 0.6) / 1.2, 0, 1) * np.clip((chord_len + 0.8 - tt) / 1.4, 0, 1)
        for m in ch[1:]:
            f0 = note(m)
            for det in (-0.12, 0.12):
                ph = 2 * np.pi * f0 * (1 + det / 100) * tt
                out[a:b] += env * (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)) * 0.035
        # sub bass
        out[a:b] += env * np.sin(2 * np.pi * note(ch[0] - 12) * tt) * 0.08
    # arpeggio plucks (8th notes), start after the intro swell
    step = beat / 2
    k = 0
    pattern = [0, 2, 3, 4, 5, 4, 3, 2]
    for i in range(int(total / step)):
        st = i * step
        if st < 2.4:
            continue
        ch = prog[int(st / chord_len) % 4]
        m = ch[1 + pattern[i % 8] % 5] + 12
        a = int(st * sr)
        L = int(sr * 0.9)
        tt = np.arange(min(L, n - a)) / sr
        f0 = note(m)
        vel = 0.9 if i % 2 == 0 else 0.6
        s = (np.sin(2 * np.pi * f0 * tt) + 0.35 * np.sin(4 * np.pi * f0 * tt) * np.exp(-tt * 9)) * np.exp(-tt * 5.5)
        out[a:a + len(tt)] += s * 0.05 * vel
    # soft kick + shaker from the first scene onwards
    for i in range(int(total / beat)):
        st = i * beat
        if st < 5.0 or st > total - 4:
            continue
        a = int(st * sr)
        tt = np.arange(min(int(sr * 0.35), n - a)) / sr
        kick = np.sin(2 * np.pi * (48 + 60 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
        out[a:a + len(tt)] += kick * 0.16
        a2 = int((st + beat / 2) * sr)
        if a2 < n:
            L2 = min(int(sr * 0.08), n - a2)
            nz = np.random.default_rng(i).standard_normal(L2)
            nz = np.diff(np.concatenate([[0], nz]))  # crude high-pass
            out[a2:a2 + L2] += nz * np.exp(-np.arange(L2) / sr * 60) * 0.018
    # master fades
    out *= np.clip(t / 1.5, 0, 1) * np.clip((total - t) / 3.0, 0, 1)
    out = out / (np.abs(out).max() + 1e-9) * 0.8
    stereo = np.stack([out, np.roll(out, int(sr * 0.012))], 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())


# -------------------------------------------------------------------- main ---
def main():
    marks = json.loads((B / "rec/marks.json").read_text())
    make_bg()
    make_phone()
    clips = [render_intro()]
    for i, sc in enumerate(SCENES):
        clips.append(render_scene(i, sc, marks))
    clips.append(render_outro(marks))
    (B / "clips.json").write_text(json.dumps([[str(p), d] for p, d in clips], indent=1))

    total = sum(d for _, d in clips) - XF * (len(clips) - 1)
    synth_music(total, B / "music_raw.wav")
    ff("-i", B / "music_raw.wav", "-af",
       "aecho=0.8:0.6:120|260|410:0.35|0.22|0.12,highpass=f=35,lowpass=f=12000,loudnorm=I=-16:TP=-1.5:LRA=9",
       "-ar", 48000, B / "music.wav")

    # crossfade chain
    ins, fc, off, prev = [], [], 0.0, "0:v"
    for k, (p, d) in enumerate(clips):
        ins += ["-i", p]
    for k in range(1, len(clips)):
        off += clips[k - 1][1] - XF
        trans = "fade" if k not in (1, len(clips) - 1) else "fadewhite"
        lab = f"x{k}"
        fc.append(f"[{prev}][{k}:v]xfade=transition={trans}:duration={XF}:offset={off:.3f}[{lab}]")
        prev = lab
    fc.append(f"[{prev}]format=yuv420p[v]")
    final = OUTDIR / "AQUENT_Showreel.mp4"
    ff(*ins, "-i", B / "music.wav", "-filter_complex", ";".join(fc), "-map", "[v]", "-map", f"{len(clips)}:a",
       "-c:v", "libx264", "-crf", 17, "-preset", "slow", "-pix_fmt", "yuv420p", "-r", FPS,
       "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final)
    print("FINAL", final, f"{total:.1f}s")


if __name__ == "__main__":
    main()
