"""Pack Blender icon frames into animated WebP (app) and GIF (PowerPoint).

  python blender/pack_anim.py            # all icons in blender/build/anim_icons
  python blender/pack_anim.py drop robot  # only these
"""
import pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "blender/build/anim_icons"
WEBP = ROOT / "app/assets/anim"
GIF = ROOT / "deck/build/anim_gif"
FPS = 24
MATTE = (241, 246, 253)          # card / well colour of the deck
CROP = {"unit_hero", "unit_iso", "unit_face"}
WEBP_MAX = {"unit_hero": 640, "unit_iso": 420, "filter_stack": 420}
GIF_MAX = {"unit_hero": 520, "unit_iso": 360, "filter_stack": 360}

WEBP.mkdir(parents=True, exist_ok=True)
GIF.mkdir(parents=True, exist_ok=True)


def fit(im, m):
    im = im.copy()
    im.thumbnail((m, m), Image.LANCZOS)
    return im


def pack(name):
    frames = sorted((SRC / name).glob("f_*.png"))
    if not frames:
        return None
    ims = [Image.open(f).convert("RGBA") for f in frames]
    if name in CROP:  # tight square crop around the union of all frames (keeps the loop steady)
        boxes = [i.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox() for i in ims]
        boxes = [b for b in boxes if b]
        l, t = min(b[0] for b in boxes), min(b[1] for b in boxes)
        r, bt = max(b[2] for b in boxes), max(b[3] for b in boxes)
        side = int(max(r - l, bt - t) * 1.06)
        cx, cy = (l + r) // 2, (t + bt) // 2
        box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
        ims = [i.crop(box) for i in ims]
    wm, gm = WEBP_MAX.get(name, 256), GIF_MAX.get(name, 200)
    web = [fit(i, wm) for i in ims]
    web[0].save(WEBP / f"{name}.webp", save_all=True, append_images=web[1:], duration=int(1000 / FPS), loop=0,
                quality=80, method=6, lossless=False, alpha_quality=90)
    gif = []
    for i in ims:
        g = fit(i, gm)
        bg = Image.new("RGBA", g.size, MATTE + (255,))
        bg.alpha_composite(g)
        q = bg.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = (q.getpalette() + [0] * 765)[:765]
        q.putpalette(pal + list(MATTE))                 # index 255 = transparent key
        a = g.getchannel("A").point(lambda v: 255 if v < 14 else 0)
        q.paste(255, (0, 0), a)                         # fully transparent pixels -> key
        gif.append(q)
    gif[0].save(GIF / f"{name}.gif", save_all=True, append_images=gif[1:], duration=int(1000 / FPS), loop=0,
                transparency=255, disposal=2, optimize=False)
    return len(ims), (WEBP / f"{name}.webp").stat().st_size, (GIF / f"{name}.gif").stat().st_size


if __name__ == "__main__":
    names = sys.argv[1:] or sorted(p.name for p in SRC.iterdir() if p.is_dir())
    tw = tg = 0
    for n in names:
        r = pack(n)
        if r:
            tw += r[1]; tg += r[2]
            print(f"{n:18s} {r[0]:3d} frames  webp {r[1] // 1024:4d} KB  gif {r[2] // 1024:4d} KB")
    print(f"total webp {tw // 1024} KB, gif {tg // 1024} KB")
