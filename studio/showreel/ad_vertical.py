"""AQUENT vertical ad (1080x1920, 30 fps) with a seamless loop (video + audio).
   python showreel/ad_vertical.py en|id   ->  output/AQUENT_Ad_Vertical_EN.mp4 / _ID.mp4"""
import json, math, pathlib, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compose import ROOT, B, C, A3, FFMPEG, ff, font, hexc, synth_music, INK, INK2, DEEP, BLUE  # noqa: E402

LANG = sys.argv[1] if len(sys.argv) > 1 else "en"
W, H, FPS = 1080, 1920, 30
XF = 0.7            # loop crossfade (s)
SCX = 0.35          # scene crossfade (s)
FILM = B / "film"
FILM_ALT = B / f"film_{LANG}"

TXT = {
    "en": dict(
        s1=("EVERY SINGLE SHOWER", "60–80 L", "of water goes straight down the drain."),
        s2=("AQUENT gives your", "shower water a second life.", "Greywater is collected, cleaned and sent back to your shower."),
        s3=("6 natural filter layers", "+ UV-C sterilisation", "Bamboo leaf · loofah · zeolite · biochar · chitosan · bagasse"),
        s4=("Checked live", "by 4 smart sensors", "pH · turbidity · chlorine · temperature — right in the app"),
        s5=("Clean & warm,", "back to you.", "Built-in water heater. No extra tank."),
        s6=("The same water, used again.", "STARTING AT", "~USD 125", "≈ Rp 2.000.000", "aquent-id.web.app"),
    ),
    "id": dict(
        s1=("SETIAP KALI MANDI", "60–80 L", "air langsung terbuang ke saluran."),
        s2=("AQUENT memberi", "air mandimu kesempatan kedua.", "Greywater ditampung, dibersihkan, lalu kembali ke shower."),
        s3=("6 lapis filter alami", "+ sterilisasi UV-C", "Daun bambu · loofah · zeolit · biochar · kitosan · ampas tebu"),
        s4=("Dicek real-time", "oleh 4 sensor pintar", "pH · turbidity · klorin · suhu — langsung di aplikasi"),
        s5=("Bersih & hangat,", "kembali ke kamu.", "Water heater terintegrasi. Tanpa tangki tambahan."),
        s6=("Air yang sama, dipakai lagi.", "HARGA MULAI", "Rp 2.000.000", "", "aquent-id.web.app"),
    ),
}[LANG]

SCENES = [  # name, duration (s)
    ("s1", 3.2), ("s2", 3.8), ("s3", 3.8), ("s4", 3.6), ("s5", 3.2), ("s6", 3.6),
]
FILM_SEG = {"s2": [(0.8, 9)], "s3": [(25.0, 1.9), (35.2, 9)], "s5": [(49.8, 9)]}   # film pieces (start, length) per scene
D = sum(d for _, d in SCENES)


# ------------------------------------------------------------------ helpers ---
def rrect_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def ease(x):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def text_block(lines, width, align="c"):
    """lines: [(text, font, colour or 'grad')] -> RGBA image."""
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    wrapped = []
    for t, f, c in lines:
        words, cur = t.split(), ""
        for w_ in words:
            nxt = (cur + " " + w_).strip()
            if tmp.textlength(nxt, font=f) > width and cur:
                wrapped.append((cur, f, c)); cur = w_
            else:
                cur = nxt
        wrapped.append((cur, f, c))
    hs = [int(f.size * 1.18) for _, f, _ in wrapped]
    im = Image.new("RGBA", (width, sum(hs) + 10), (0, 0, 0, 0))
    y = 0
    for (t, f, c), h in zip(wrapped, hs):
        tw = tmp.textlength(t, font=f)
        x = (width - tw) / 2 if align == "c" else 0
        if c == "grad":
            m = Image.new("L", im.size, 0)
            ImageDraw.Draw(m).text((x, y), t, font=f, fill=255)
            g = np.zeros((im.size[1], im.size[0], 4), np.uint8)
            k = np.linspace(0, 1, im.size[0])[None, :, None]
            g[..., :3] = (np.array(hexc("#3FA9E8")[:3]) * (1 - k) + np.array(hexc(DEEP)[:3]) * k).astype(np.uint8)
            g[..., 3] = np.array(m)
            im.alpha_composite(Image.fromarray(g))
        else:
            ImageDraw.Draw(im).text((x, y), t, font=f, fill=hexc(c))
        y += h
    return im


def with_alpha(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * a)))
    return im


def card_frame(w, h, r=44):
    """White neumorphic card with blue aura; returns (image, inset)."""
    m = 60
    im = Image.new("RGBA", (w + 2 * m, h + 2 * m), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((m + 6, m + 22, m + w + 6, m + h + 22), r, fill=150)
    im.paste(Image.new("RGBA", im.size, (40, 100, 230, 255)), (0, 0), sh.filter(ImageFilter.GaussianBlur(30)))
    body = Image.new("L", im.size, 0)
    ImageDraw.Draw(body).rounded_rectangle((m - 8, m - 8, m + w + 8, m + h + 8), r + 8, fill=255)
    im.paste(Image.new("RGBA", im.size, (255, 255, 255, 255)), (0, 0), body)
    return im, m


# ------------------------------------------------------------- static layers ---
def make_bg():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    k = np.clip(np.sqrt(((x - W * 0.5) / W) ** 2 + ((y - H * 0.38) / H) ** 2) / 0.8, 0, 1)[..., None]
    img = np.array(hexc("#F7FAFE")[:3]) * (1 - k) + np.array(hexc("#D6E2F2")[:3]) * k
    for cx, cy, r, s, col in ((0.1, 0.12, 0.35, 40, (120, 200, 240)), (0.95, 0.55, 0.4, 36, (110, 150, 255)), (0.2, 0.92, 0.35, 34, (130, 190, 255))):
        g = np.exp(-(((x / W - cx) ** 2 + (y / H - cy) ** 2) / (r * r)))[..., None] * s / 255
        img = img * (1 - g) + np.array(col) * g
    return Image.fromarray(img.clip(0, 255).astype(np.uint8)).convert("RGBA")


DECO = [("deco_sphere", 120, (95, 105), 0.0), ("deco_ring", 150, (985, 120), 1.3), ("deco_drops", 150, (975, 1790), 2.1),
        ("deco_torus", 150, (95, 1800), 0.7), ("deco_bubbles", 130, (1000, 1450), 1.8), ("deco_sphere_white", 90, (70, 1440), 2.6)]


def load_deco():
    out = []
    for n, s, xy, ph in DECO:
        im = Image.open(A3 / f"{n}.png").convert("RGBA")
        im.thumbnail((s, s), Image.LANCZOS)
        out.append((im, xy, ph))
    return out


def logo_badge():
    lg = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    lg.thumbnail((250, 80), Image.LANCZOS)
    im, m = card_frame(lg.width + 56, lg.height + 36, 30)
    im.alpha_composite(lg, (m + 28, m + 18))
    return im


def load_turntable():
    fr = sorted((B / "anim").glob("f_*.png"))
    out = []
    for f in fr:
        im = Image.open(f).convert("RGBA")
        bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        out.append((im, bb))
    l = min(b[0] for _, b in out); t = min(b[1] for _, b in out)
    r = max(b[2] for _, b in out); bt = max(b[3] for _, b in out)
    return [im.crop((l, t, r, bt)) for im, _ in out]


def film_frame(sec, size):
    f = int(round(sec * 24))
    p = FILM_ALT / f"f_{f:04d}.png"
    if not p.exists():
        p = FILM / f"f_{f:04d}.png"
    im = Image.open(p).convert("RGB")
    return im


def app_frames(start, dur, size):
    """Decode a slice of the app recording to RGB frames."""
    w, h = size
    cmd = [FFMPEG, "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(B / "rec/rec.mp4"),
           "-vf", f"fps={FPS},scale={w}:{h}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (w * h * 3)
    return [Image.frombytes("RGB", (w, h), raw[i * w * h * 3:(i + 1) * w * h * 3]) for i in range(n)]


# ------------------------------------------------------------------ scenes ---
class Ad:
    def __init__(self):
        self.bg = make_bg()
        self.deco = load_deco()
        self.logo = logo_badge()
        self.turn = load_turntable()
        self.phone = Image.open(C / "phone.png").convert("RGBA")
        self.mask = Image.open(C / "mask.png").convert("L")
        marks = json.loads((B / "rec/marks.json").read_text())
        self.app = app_frames(marks["monitor"][0] + 0.2, 4.0, self.mask.size)
        self.card_film, self.cm = card_frame(980, 551)
        self.fmask = rrect_mask((980, 551), 36)
        f = lambda s, w="ExtraBold": font(s, w)
        T = TXT
        self.blocks = {
            "s1": (text_block([(T["s1"][0], f(40), BLUE)], 960), text_block([(T["s1"][1], f(210), "grad")], 1000),
                   text_block([(T["s1"][2], f(56), INK)], 900)),
            "s2": text_block([(T["s2"][0], f(62), INK), (T["s2"][1], f(62), "grad")], 960),
            "s3": text_block([(T["s3"][0], f(66), INK), (T["s3"][1], f(66), "grad")], 960),
            "s4": text_block([(T["s4"][0], f(66), INK), (T["s4"][1], f(66), "grad")], 960),
            "s5": text_block([(T["s5"][0], f(72), INK), (T["s5"][1], f(72), "grad")], 960),
        }
        icons = {"en": {"s2": [("drop", "Greywater"), ("recycle", "Filtered"), ("unit_face", "Reused")],
                        "s3": [("filter", "6 layers"), ("sparkle", "UV-C"), ("leaf", "All natural")],
                        "s5": [("temp", "37–40 °C"), ("recycle", "No extra tank"), ("shield", "Skin-safe")]},
                 "id": {"s2": [("drop", "Greywater"), ("recycle", "Disaring"), ("unit_face", "Dipakai lagi")],
                        "s3": [("filter", "6 lapis"), ("sparkle", "UV-C"), ("leaf", "Bahan alami")],
                        "s5": [("temp", "37–40 °C"), ("recycle", "Tanpa tangki"), ("shield", "Aman di kulit")]}}[LANG]
        self.chips = {}
        for k, items in icons.items():
            row = Image.new("RGBA", (960, 330), (0, 0, 0, 0))
            for j, (ic, lab) in enumerate(items):
                cf, m = card_frame(210, 210, 105)
                ico = Image.open(A3 / f"{ic}.png").convert("RGBA"); ico.thumbnail((150, 150), Image.LANCZOS)
                cf.alpha_composite(ico, (m + (210 - ico.width) // 2, m + (210 - ico.height) // 2))
                cf.thumbnail((250, 250), Image.LANCZOS)
                x = 40 + j * 310
                row.alpha_composite(cf, (x, 0))
                tb = text_block([(lab, font(32, "ExtraBold"), DEEP)], 290)
                row.alpha_composite(tb, (x + cf.width // 2 - 145, 250))
            self.chips[k] = row
        self.subs = {k: text_block([(T[k][2], font(36, "SemiBold"), INK2)], 900) for k in ("s2", "s3", "s4", "s5")}
        # closing card with price
        s6 = T["s6"]
        pc, pm = card_frame(820, 470, 50)
        d = ImageDraw.Draw(pc)
        tag = text_block([(s6[0], f(48), INK)], 760)
        pc.alpha_composite(tag, (pm + 30, pm + 40))
        chip_f = font(28, "ExtraBold")
        cw = int(d.textlength(s6[1], font=chip_f)) + 60
        d.rounded_rectangle((pm + 410 - cw // 2, pm + 190, pm + 410 + cw // 2, pm + 240), 25, fill=hexc("#DDEBFF"))
        d.text((pm + 410 - d.textlength(s6[1], font=chip_f) / 2, pm + 198), s6[1], font=chip_f, fill=hexc(DEEP))
        price = text_block([(s6[2], f(108), "grad")], 800)
        pc.alpha_composite(price, (pm + 10, pm + 250))
        if s6[3]:
            sub = text_block([(s6[3], font(30, "SemiBold"), INK2)], 800)
            pc.alpha_composite(sub, (pm + 10, pm + 390))
        self.price = pc
        cta_f = font(34, "ExtraBold")
        cw = int(ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(s6[4], font=cta_f)) + 90
        cta = Image.new("RGBA", (cw, 84), (0, 0, 0, 0))
        g = np.zeros((84, cw, 4), np.uint8)
        k = np.linspace(0, 1, cw)[None, :, None]
        g[..., :3] = (np.array([75, 146, 255]) * (1 - k) + np.array(hexc(DEEP)[:3]) * k).astype(np.uint8)
        g[..., 3] = np.array(rrect_mask((cw, 84), 42))
        cta = Image.fromarray(g)
        ImageDraw.Draw(cta).text((45, 18), s6[4], font=cta_f, fill=(255, 255, 255, 255))
        self.cta = cta

    def base(self, t):
        im = self.bg.copy()
        for d_, (x, y), ph in self.deco:
            dy = 14 * math.sin(2 * math.pi * (t / 4.0) + ph)
            im.alpha_composite(d_, (int(x - d_.width / 2), int(y - d_.height / 2 + dy)))
        return im

    def turntable(self, im, t, size, cy):
        fr = self.turn[int(t * 24) % len(self.turn)].copy()
        fr.thumbnail((size, size), Image.LANCZOS)
        im.alpha_composite(fr, (int((W - fr.width) / 2), int(cy - fr.height / 2)))

    def film_card(self, im, pieces, lt, y):
        acc = 0.0
        for st, ln in pieces:
            if lt < acc + ln:
                break
            acc += ln
        fr = film_frame(st + (lt - acc), None)
        z = 1.0 + 0.05 * (lt / 4.0)
        fw, fh = int(980 * z), int(551 * z)
        fr = fr.resize((fw, fh), Image.LANCZOS).crop(((fw - 980) // 2, (fh - 551) // 2, (fw - 980) // 2 + 980, (fh - 551) // 2 + 551)).convert("RGBA")
        fr.putalpha(self.fmask)
        c = self.card_film.copy()
        c.alpha_composite(fr, (self.cm, self.cm))
        im.alpha_composite(c, (int((W - c.width) / 2), int(y)))

    def slide_in(self, im, layer, lt, y, delay=0.0, dy=40):
        a = ease((lt - delay) / 0.45)
        if a <= 0:
            return
        im.alpha_composite(with_alpha(layer, a), (int((W - layer.width) / 2), int(y + dy * (1 - a))))

    def scene(self, name, lt, t):
        im = self.base(t)
        if name == "s1":
            self.turntable(im, t, 900, 1330)
            k, big, sub = self.blocks["s1"]
            self.slide_in(im, k, lt, 300)
            self.slide_in(im, big, lt, 370, 0.12)
            self.slide_in(im, sub, lt, 640, 0.25)
        elif name in ("s2", "s3", "s5"):
            self.slide_in(im, self.blocks[name], lt, 300)
            self.film_card(im, FILM_SEG[name], lt, 560)
            self.slide_in(im, self.subs[name], lt, 1270, 0.2)
            self.slide_in(im, self.chips[name], lt, 1420, 0.35)
        elif name == "s4":
            self.slide_in(im, self.blocks["s4"], lt, 250)
            ph = self.phone.copy()
            fr = self.app[min(len(self.app) - 1, int(lt * FPS))].convert("RGBA")
            fr.putalpha(self.mask)
            base_ph = Image.new("RGBA", ph.size, (0, 0, 0, 0))
            base_ph.alpha_composite(fr, (90 + 12, 90 + 12))
            base_ph.alpha_composite(ph)
            s = 1.08
            base_ph = base_ph.resize((int(ph.width * s), int(ph.height * s)), Image.LANCZOS)
            a = ease(lt / 0.5)
            im.alpha_composite(with_alpha(base_ph, a), (int((W - base_ph.width) / 2), int(470 + 60 * (1 - a))))
            self.slide_in(im, self.subs["s4"], lt, 1660, 0.2)
        elif name == "s6":
            self.turntable(im, t, 600, 690)
            self.slide_in(im, self.price, lt, 1060, 0.1)
            self.slide_in(im, self.cta, lt, 1640, 0.3)
        # logo badge always on top
        im.alpha_composite(self.logo, (int((W - self.logo.width) / 2), 60))
        return im

    def frame(self, t):
        t = t % D
        acc = 0.0
        for i, (name, d) in enumerate(SCENES):
            if t < acc + d:
                lt = t - acc
                im = self.scene(name, lt, t)
                if lt > d - SCX and i + 1 < len(SCENES):
                    nxt = self.scene(SCENES[i + 1][0], lt - d, t)
                    im = Image.blend(im, nxt, (lt - (d - SCX)) / SCX)
                return im
            acc += d
        return self.scene(SCENES[-1][0], SCENES[-1][1], t)


def main():
    ad = Ad()
    out = ROOT / f"output/AQUENT_Ad_Vertical_{LANG.upper()}.mp4"
    # music: D + XF long, then loop-crossfade the tail onto the head
    synth_music(D + XF + 1.0, B / "ad_music_raw.wav")
    with wave.open(str(B / "ad_music_raw.wav")) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, ch).astype(np.float32)
    nX, nD = int(XF * sr), int(D * sr)
    a = a[: nD + nX]
    outa = a[nX: nD + nX].copy()
    wgt = np.linspace(0, 1, nX)[:, None]
    outa[nD - nX:] = a[nD: nD + nX] * (1 - wgt) + a[0:nX] * wgt
    outa = outa / (np.abs(outa).max() + 1) * 26000
    with wave.open(str(B / f"ad_music_{LANG}.wav"), "wb") as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(outa.astype(np.int16).tobytes())
    enc = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                            "-i", "-", "-i", str(B / f"ad_music_{LANG}.wav"), "-c:v", "libx264", "-crf", "18", "-preset", "slow",
                            "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest",
                            "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    n = int(round(D * FPS))
    nx = int(round(XF * FPS))
    for i in range(n):
        t = i / FPS + XF                    # output starts at XF so the end blends back into it
        if t < D:
            im = ad.frame(t)
        else:                               # tail: fade from end of the ad into its opening
            w_ = (t - D) / XF
            im = Image.blend(ad.frame(min(t, D - 1e-3)), ad.frame(t - D), w_)
        enc.stdin.write(im.convert("RGB").tobytes())
        if i % 60 == 0:
            print("frame", i, "/", n, flush=True)
    enc.stdin.close()
    enc.wait()
    print("WROTE", out, f"{D:.1f}s loop")


if __name__ == "__main__":
    main()
