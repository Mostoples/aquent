"""AQUENT full-process film: Blender frames + step captions + legend + app overlay + outro + music
   -> output/AQUENT_Process_Film.mp4"""
import pathlib, sys
from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compose import ROOT, ff, font, hexc, synth_music, B, INK, INK2  # noqa: E402
from inuse_video import card  # noqa: E402

SEQ = B / "film"
L = B / "film_layers"
L.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "output/AQUENT_Process_Film.mp4"
W, H, FPS = 1920, 1080, 24

STEPS = [  # start, end, badge, title, subtitle
    (0.0, 5.0, "", "Mandi seperti biasa", "AQUENT terpasang di atas; air shower berasal dari hasil daur ulang."),
    (5.0, 10.5, "1", "Greywater masuk ke saluran lantai", "Air bekas mandi ditampung di bawah lantai — tidak dibuang ke got."),
    (10.5, 15.5, "2", "Dipompa naik ke AQUENT", "Pompa greywater mengalirkannya ke atas lewat pipa dinding."),
    (15.5, 20.2, "", "Di dalam AQUENT", "Casing dibuka: begini air dibersihkan tahap demi tahap."),
    (20.2, 23.2, "3", "Saringan sedimen", "Menahan rambut dan kotoran kasar sebelum masuk media filter."),
    (23.2, 29.0, "4", "Kolom filtrasi 1", "Daun bambu kering · loofah · zeolit — saring partikel & ikat logam berat."),
    (29.0, 34.5, "5", "Kolom filtrasi 2", "Biochar kulit pisang · kitosan · ampas tebu — serap polutan & hambat bakteri."),
    (34.5, 38.0, "6", "Sterilisasi UV-C 254 nm", "Sinar UV-C menonaktifkan bakteri dan virus yang tersisa."),
    (38.0, 41.0, "7", "Cek 4 sensor real-time", "pH · turbidity · sisa klorin (ORP) · suhu."),
    (41.0, 46.0, "8", "AI memutuskan & air dipanaskan", "Lolos → dipakai ulang · gagal → dibuang. Water heater di dalam AQUENT menyiapkan air panas."),
    (46.0, 53.0, "9", "Kembali ke shower", "Pipa air bersih & air panas dari AQUENT bertemu di mixer, lalu dipakai mandi lagi."),
]
LEGEND = [("#8C8272", "Greywater (air bekas)"), ("#A8A695", "Setelah kolom 1"), ("#9ACFF8", "Setelah kolom 2"),
          ("#3D95FF", "Air bersih (setelah UV)"), ("#FF5A3C", "Air panas")]


def caption(i, badge, title, sub):
    ft, fs, fb = font(46, "ExtraBold"), font(25, "Medium"), font(26, "ExtraBold")
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = max(d0.textlength(title, font=ft), d0.textlength(sub, font=fs))
    x0 = 104 if badge else 40
    im, m = card(int(tw + x0 + 48), 150)
    d = ImageDraw.Draw(im)
    if badge:
        d.ellipse((m + 36, m + 36, m + 84, m + 84), fill=hexc("#2F7BFF"))
        bw = d.textlength(badge, font=fb)
        d.text((m + 60 - bw / 2, m + 43), badge, font=fb, fill=(255, 255, 255, 255))
    d.text((m + x0, m + 26), title, font=ft, fill=hexc(INK))
    d.text((m + x0, m + 90), sub, font=fs, fill=hexc(INK2))
    im.save(L / f"cap{i}.png")


def legend():
    f = font(21, "Bold")
    im, m = card(330, 40 + 36 * len(LEGEND), 28)
    d = ImageDraw.Draw(im)
    for k, (c, t) in enumerate(LEGEND):
        y = m + 22 + k * 36
        d.ellipse((m + 24, y + 2, m + 46, y + 24), fill=hexc(c))
        d.text((m + 62, y), t, font=f, fill=hexc(INK))
    im.save(L / "legend.png")


def logo_badge():
    lg = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    lg.thumbnail((230, 72), Image.LANCZOS)
    im, m = card(lg.width + 48, lg.height + 32, 24)
    im.alpha_composite(lg, (m + 24, m + 16))
    im.save(L / "logo.png")


def app_overlay():
    import hashlib
    h = hashlib.md5(repr(("monitor", 0, 3)).encode()).hexdigest()[:10]
    ph = Image.open(ROOT / f"deck/build/gen/phone_{h}.png").convert("RGBA")
    ph.thumbnail((360, 640), Image.LANCZOS)
    ph.save(L / "phone.png")


def outro():
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c, m = card(1000, 330, 40)
    lg = Image.open(ROOT / "app/assets/brand/logo_grad.png")
    lg.thumbnail((430, 130), Image.LANCZOS)
    c.alpha_composite(lg, (m + (1000 - lg.width) // 2, m + 40))
    d = ImageDraw.Draw(c)
    for txt, f, y, col in (("Air yang sama, dipakai lagi.", font(50, "ExtraBold"), 190, INK),
                           ("Greywater → filtrasi alami → UV-C → sensor → shower", font(27, "Medium"), 262, INK2)):
        tw = d.textlength(txt, font=f)
        d.text((m + (1000 - tw) / 2, m + y), txt, font=f, fill=hexc(col))
    im.alpha_composite(c, ((W - c.width) // 2, (H - c.height) // 2 + 120))
    im.save(L / "outro.png")


def main():
    n = len(list(SEQ.glob("f_*.png")))
    dur = n / FPS
    for i, (_, _, b, t, s) in enumerate(STEPS):
        caption(i, b, t, s)
    legend(); logo_badge(); app_overlay(); outro()
    synth_music(dur, B / "film_music_raw.wav")
    ff("-i", B / "film_music_raw.wav", "-af", "aecho=0.8:0.6:120|260:0.3|0.18,loudnorm=I=-17:TP=-1.5", "-ar", 48000, B / "film_music.wav")
    loop = lambda p: ["-loop", 1, "-t", f"{dur:.2f}", "-i", p]
    ins = ["-framerate", FPS, "-i", SEQ / "f_%04d.png"]
    fc = [f"[0]scale={W}:{H}:flags=lanczos,setsar=1[b0]"]
    prev, k = "b0", 1
    for i, (a, b, *_r) in enumerate(STEPS):
        ins += loop(L / f"cap{i}.png")
        fin, fout = a + 0.25, min(b, dur) - 0.45
        fc.append(f"[{k}]format=rgba,fade=in:st={fin:.2f}:d=0.4:alpha=1,fade=out:st={fout:.2f}:d=0.4:alpha=1[c{i}]")
        y = f"{H - 250}+30*(1-min(max((t-{fin:.2f})/0.5,0),1))"
        fc.append(f"[{prev}][c{i}]overlay=x=40:y='{y}':enable='between(t,{a:.2f},{b:.2f})'[v{i}]")
        prev, k = f"v{i}", k + 1
    ins += loop(L / "legend.png"); fc.append(f"[{k}]format=rgba,fade=in:st=5:d=0.6:alpha=1,fade=out:st=52.5:d=0.6:alpha=1[lg]")
    fc.append(f"[{prev}][lg]overlay=x=W-w-24:y=H-h-20:enable='between(t,5,53.2)'[vl]"); k += 1
    ins += loop(L / "logo.png"); fc.append(f"[{k}]format=rgba[lo]"); fc.append(f"[vl][lo]overlay=x=W-w-24:y=20[vo]"); k += 1
    ins += loop(L / "phone.png")
    fc.append(f"[{k}]format=rgba,fade=in:st=42.2:d=0.5:alpha=1,fade=out:st=45.4:d=0.5:alpha=1[ph]")
    fc.append(f"[vo][ph]overlay=x='60-80*(1-min(max((t-42.2)/0.6,0),1))':y=40:enable='between(t,42.2,46)'[vp]"); k += 1
    ins += loop(L / "outro.png")
    fc.append(f"[{k}]format=rgba,fade=in:st=54:d=0.8:alpha=1[ou]")
    fc.append(f"[vp][ou]overlay=0:0:enable='gte(t,54)',fade=in:st=0:d=0.8,fade=out:st={dur - 1.0:.2f}:d=1.0,format=yuv420p[v]"); k += 1
    ins += ["-i", B / "film_music.wav"]
    ff(*ins, "-filter_complex", ";".join(fc), "-map", "[v]", "-map", f"{k}:a", "-c:v", "libx264", "-crf", 17,
       "-preset", "slow", "-pix_fmt", "yuv420p", "-r", FPS, "-c:a", "aac", "-b:a", "192k", "-shortest",
       "-movflags", "+faststart", OUT)
    print("WROTE", OUT, f"{dur:.1f}s")


if __name__ == "__main__":
    main()
