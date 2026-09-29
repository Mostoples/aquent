"""Draw the water-flow mechanism over the in-use render: glowing arrows along the real pipe paths + numbered steps."""
import json, math, pathlib, sys
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compose import ROOT, font, hexc, INK, INK2  # noqa: E402

C = ROOT / "output/concept"
NAME = "D1_inuse_landscape"

TXT = {
    "en": [("Shower as usual", "Recycled water from AQUENT"),
           ("Greywater drains", "Floor drain collects used water"),
           ("Pumped up to AQUENT", "Return pipe under the floor, up the wall"),
           ("Treated inside AQUENT", "6-layer filter · UV-C · sensors · heater"),
           ("Clean + hot to the mixer", "Two separate lines from AQUENT"),
           ("Back to the shower", "The same water, used again")],
    "id": [("Mandi seperti biasa", "Air daur ulang dari AQUENT"),
           ("Greywater ke lantai", "Saluran lantai menampung air bekas"),
           ("Dipompa naik ke AQUENT", "Pipa balik lewat bawah lantai & dinding"),
           ("Diolah di dalam AQUENT", "Filter 6 lapis · UV-C · sensor · heater"),
           ("Air bersih + panas ke mixer", "Dua pipa terpisah dari AQUENT"),
           ("Kembali ke shower", "Air yang sama, dipakai lagi")],
}
COL = {"ret": "#8A6F4A", "treated": "#2F7BFF", "hot": "#FF4D3A", "supply": "#22B8D8"}


def arrow_path(d, pts, color, width, dashed_until=None):
    """Polyline with arrowheads every ~220px; points before index dashed_until drawn dashed (hidden under floor)."""
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        if dashed_until is not None and i < dashed_until and (i // 3) % 2:
            continue
        d.line([a, b], fill=color, width=width)
    acc = 0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        acc += seg
        if acc > 200 and seg > 1:
            acc = 0
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            s = width * 2.4
            tip = b
            l = (tip[0] - s * math.cos(ang - 0.5), tip[1] - s * math.sin(ang - 0.5))
            r = (tip[0] - s * math.cos(ang + 0.5), tip[1] - s * math.sin(ang + 0.5))
            d.polygon([tip, l, r], fill=color)


def badge(d, xy, n, r=26):
    x, y = xy
    d.ellipse((x - r - 5, y - r - 5, x + r + 5, y + r + 5), fill=(255, 255, 255, 255))
    d.ellipse((x - r, y - r, x + r, y + r), fill=hexc("#1646D6"))
    f = font(int(r * 1.15), "ExtraBold")
    tw = d.textlength(str(n), font=f)
    d.text((x - tw / 2, y - r * 0.72), str(n), font=f, fill=(255, 255, 255, 255))


def main(lang="en"):
    base = Image.open(C / f"{NAME}.png").convert("RGBA")
    W, H = base.size
    P = json.load(open(C / f"{NAME}_paths.json"))
    A = json.load(open(C / f"{NAME}.json"))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lines = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for key, width in (("ret", 11), ("treated", 10), ("hot", 10), ("supply", 10)):
        pts = [tuple(p) for p in P[key]]
        hidden = 3 * 12 if key == "ret" else None      # first segments run under the floor
        for layer, w, c in ((glow, width * 3, hexc(COL[key], 150)), (lines, width, hexc(COL[key]))):
            arrow_path(ImageDraw.Draw(layer), pts, c, w, hidden)
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
    base.alpha_composite(lines)
    d = ImageDraw.Draw(base)
    sh = A["shower"]
    spots = [(sh[0] - 330, sh[1] + 120),                 # 1 person showering
             (A["drain"][0] + 95, A["drain"][1] - 20),    # 2 floor drain
             (P["ret"][-40][0], P["ret"][-40][1]),        # 3 return riser
             (A["aquent"][0] - 90, A["aquent"][1] - 110), # 4 AQUENT box
             (A["mixer"][0] + 150, A["mixer"][1] + 95),   # 5 mixer lines
             (sh[0] + 75, sh[1] - 12)]                    # 6 shower head
    for i, xy in enumerate(spots):
        badge(d, xy, i + 1)
    # step list card on the empty right wall
    cx, cy, cw = 1290, 70, 560
    ch = 90 + 128 * 6
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((cx + 8, cy + 14, cx + cw + 8, cy + ch + 14), 30, fill=(40, 90, 200, 70))
    base.alpha_composite(card.filter(ImageFilter.GaussianBlur(16)))
    d.rounded_rectangle((cx, cy, cx + cw, cy + ch), 30, fill=(250, 252, 255, 240))
    d.text((cx + 34, cy + 26), "HOW IT WORKS" if lang == "en" else "CARA KERJA", font=font(30, "ExtraBold"), fill=hexc("#1646D6"))
    for i, (t, s) in enumerate(TXT[lang]):
        y = cy + 96 + i * 128
        badge(d, (cx + 58, y + 30), i + 1, 22)
        d.text((cx + 100, y + 4), t, font=font(29, "ExtraBold"), fill=hexc(INK))
        d.text((cx + 100, y + 46), s, font=font(21, "Medium"), fill=hexc(INK2))
    # colour legend
    ly = cy + ch + 26
    d.rounded_rectangle((cx, ly, cx + cw, ly + 108), 26, fill=(250, 252, 255, 240))
    items = [("#8A6F4A", "Greywater" if lang == "en" else "Air bekas"), ("#2F7BFF", "Clean" if lang == "en" else "Bersih"),
             ("#FF4D3A", "Hot" if lang == "en" else "Panas"), ("#22B8D8", "Mixed" if lang == "en" else "Campuran")]
    for i, (c, t) in enumerate(items):
        x = cx + 30 + (i % 2) * 265
        y = ly + 20 + (i // 2) * 40
        d.rounded_rectangle((x, y + 8, x + 44, y + 20), 6, fill=hexc(c))
        d.text((x + 58, y), t, font=font(23, "Bold"), fill=hexc(INK))
    out = C / f"D1_inuse_annotated_{lang}.png"
    base = base.crop((0, 0, W - 50, H))
    base.convert("RGB").save(out)
    print("wrote", out)


if __name__ == "__main__":
    for lg in ("en", "id"):
        main(lg)
