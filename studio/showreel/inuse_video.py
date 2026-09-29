"""AQUENT 'in use' explainer video: Blender frames + captions + legend + music -> output/AQUENT_InUse.mp4"""
import pathlib, sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compose import ROOT, FFMPEG, ff, font, hexc, synth_music, B, INK, INK2, DEEP, ICE  # noqa: E402

SEQ = B / "inuse"
L = B / "inuse_layers"
L.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "output/AQUENT_InUse.mp4"
W, H, FPS = 1920, 1080, 30

STEPS = [  # (start, end, badge, title, subtitle)
    (0.0, 3.3, "", "Mandi seperti biasa", "Shower mengalirkan air hasil daur ulang AQUENT."),
    (3.3, 6.8, "1", "Air bekas mandi masuk ke lantai", "Greywater turun lewat saluran lantai dan mengalir di bawahnya."),
    (6.8, 9.3, "2", "Naik ke AQUENT", "Pipa balik membawa greywater ke atas, ke unit AQUENT."),
    (9.3, 12.0, "3", "Disaring di pipa filtrasi", "6 lapis material alami + cek pH, turbidity, klorin & suhu."),
    (12.0, 16.0, "4", "Kembali ke shower", "Air bersih bertemu air panas di mixer, lalu dipakai mandi lagi."),
]


def card(w, h, r=34):
    m = 40
    im = Image.new("RGBA", (w + 2 * m, h + 2 * m), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((m + 4, m + 12, m + w + 4, m + h + 12), r, fill=120)
    im.paste(Image.new("RGBA", im.size, (40, 90, 200, 255)), (0, 0), sh.filter(ImageFilter.GaussianBlur(22)))
    body = Image.new("L", im.size, 0)
    ImageDraw.Draw(body).rounded_rectangle((m, m, m + w, m + h), r, fill=255)
    im.paste(Image.new("RGBA", im.size, (248, 251, 255, 240)), (0, 0), body)
    return im, m


def caption(i, badge, title, sub):
    ft, fs, fb = font(46, "ExtraBold"), font(25, "Medium"), font(26, "ExtraBold")
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = max(d0.textlength(title, font=ft), d0.textlength(sub, font=fs))
    x0 = 104 if badge else 40
    w, h = int(tw + x0 + 48), 150
    im, m = card(w, h)
    d = ImageDraw.Draw(im)
    if badge:
        d.ellipse((m + 36, m + 36, m + 84, m + 84), fill=hexc("#2F7BFF"))
        bw = d.textlength(badge, font=fb)
        d.text((m + 60 - bw / 2, m + 43), badge, font=fb, fill=(255, 255, 255, 255))
    d.text((m + x0, m + 26), title, font=ft, fill=hexc(INK))
    d.text((m + x0, m + 90), sub, font=fs, fill=hexc(INK2))
    im.save(L / f"cap{i}.png")


def legend():
    f = font(22, "Bold")
    items = [("#8C8272", "Air bekas mandi"), ("#2F8CFF", "Air tersaring"), ("#FF5A3C", "Air panas")]
    im, m = card(300, 150, 28)
    d = ImageDraw.Draw(im)
    for k, (c, t) in enumerate(items):
        y = m + 26 + k * 38
        d.ellipse((m + 26, y + 2, m + 50, y + 26), fill=hexc(c))
        d.text((m + 66, y), t, font=f, fill=hexc(INK))
    im.save(L / "legend.png")


def logo():
    lg = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    lg.thumbnail((250, 80), Image.LANCZOS)
    im, m = card(lg.width + 50, lg.height + 36, 26)
    im.alpha_composite(lg, (m + 25, m + 18))
    im.save(L / "logo.png")


def main():
    n = len(list(SEQ.glob("f_*.png")))
    dur = n / FPS
    for i, (_, _, b, t, s) in enumerate(STEPS):
        caption(i, b, t, s)
    legend()
    logo()
    synth_music(dur, B / "inuse_music_raw.wav")
    ff("-i", B / "inuse_music_raw.wav", "-af", "aecho=0.8:0.6:120|260:0.3|0.18,loudnorm=I=-17:TP=-1.5", "-ar", 48000, B / "inuse_music.wav")
    ins = ["-framerate", FPS, "-i", SEQ / "f_%04d.png"]
    fc, prev = [], "0:v"
    k = 1
    for i, (a, b, *_rest) in enumerate(STEPS):
        ins += ["-loop", 1, "-t", f"{dur:.2f}", "-i", L / f"cap{i}.png"]
        fin, fout = a + 0.25, min(b, dur) - 0.45
        fc.append(f"[{k}]format=rgba,fade=in:st={fin:.2f}:d=0.4:alpha=1,fade=out:st={fout:.2f}:d=0.4:alpha=1[c{i}]")
        y = f"{H - 250}+30*(1-min(max((t-{fin:.2f})/0.5,0),1))"
        fc.append(f"[{prev}][c{i}]overlay=x=40:y='{y}':enable='between(t,{a:.2f},{b:.2f})'[v{i}]")
        prev, k = f"v{i}", k + 1
    ins += ["-loop", 1, "-t", f"{dur:.2f}", "-i", L / "legend.png", "-loop", 1, "-t", f"{dur:.2f}", "-i", L / "logo.png"]
    fc.append(f"[{k}]format=rgba,fade=in:st=0.6:d=0.6:alpha=1[lg]")
    fc.append(f"[{prev}][lg]overlay=x=W-w-24:y=H-h-20[vl]")
    fc.append(f"[{k + 1}]format=rgba[lo]")
    fc.append(f"[vl][lo]overlay=x=W-w-24:y=20,fade=in:st=0:d=0.6,fade=out:st={dur - 0.7:.2f}:d=0.7,format=yuv420p[v]")
    ins += ["-i", B / "inuse_music.wav"]
    ff(*ins, "-filter_complex", ";".join(fc), "-map", "[v]", "-map", f"{k + 2}:a", "-c:v", "libx264", "-crf", 17,
       "-preset", "slow", "-pix_fmt", "yuv420p", "-r", FPS, "-c:a", "aac", "-b:a", "192k", "-shortest",
       "-movflags", "+faststart", OUT)
    print("WROTE", OUT, f"{dur:.1f}s")


if __name__ == "__main__":
    main()
