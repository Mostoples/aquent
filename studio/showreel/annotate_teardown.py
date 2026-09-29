"""Number every component on the AQUENT teardown render and add a legend card."""
import json, pathlib, sys
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compose import ROOT, font, hexc, INK, INK2  # noqa: E402
from annotate_inuse import badge  # noqa: E402

C = ROOT / "output/concept"
ITEMS = {  # key, badge offset, en title, en sub, id title, id sub
    "inlet": ((58, 22), "Greywater inlet", "from the floor drain pump", "Masuk greywater", "dari pompa saluran lantai"),
    "basket": ((75, 14), "Sediment screen", "traps hair & coarse solids", "Saringan sedimen", "menahan rambut & kotoran kasar"),
    "col1": ((78, 0), "Filter column 1", "bamboo leaf · loofah · zeolite", "Kolom filter 1", "daun bambu · loofah · zeolit"),
    "pump": ((78, -8), "Transfer pump", "moves water to column 2", "Pompa transfer", "alirkan air ke kolom 2"),
    "col2": ((-78, 0), "Filter column 2", "biochar · chitosan · bagasse", "Kolom filter 2", "biochar · kitosan · ampas tebu"),
    "uv": ((-120, -40), "UV-C chamber", "254 nm, inactivates microbes", "Ruang UV-C", "254 nm, nonaktifkan mikroba"),
    "sensors": ((10, -80), "Sensor chamber", "pH · turbidity · ORP · temp", "Ruang sensor", "pH · turbidity · ORP · suhu"),
    "valve": ((-86, 30), "3-way valve", "reuse, or divert to drain", "Katup 3-arah", "pakai ulang / buang ke drain"),
    "heater": ((-135, 40), "Built-in water heater", "coil tank, holds 37–40 °C", "Water heater terintegrasi", "tangki koil, jaga 37–40 °C"),
    "esp": ((10, -85), "ESP32 + WiFi", "live data to the app", "ESP32 + WiFi", "data real-time ke app"),
    "outlet": ((-95, 40), "Outlets to mixer", "clean & hot, separate lines", "Keluaran ke mixer", "pipa bersih & panas terpisah"),
}


def main(lang="en"):
    im = Image.open(C / "E1_teardown.png").convert("RGBA")
    W, H = im.size
    A = json.load(open(C / "E1_teardown.json"))
    d = ImageDraw.Draw(im)
    for i, (k, (off, *_t)) in enumerate(ITEMS.items()):
        ax, ay = A[k]
        bx, by = ax + off[0], ay + off[1]
        d.line([(ax, ay), (bx, by)], fill=(255, 255, 255, 255), width=5)
        d.line([(ax, ay), (bx, by)], fill=hexc("#1646D6"), width=2)
        d.ellipse((ax - 6, ay - 6, ax + 6, ay + 6), fill=hexc("#1646D6"), outline=(255, 255, 255, 255), width=2)
        badge(d, (bx, by), i + 1, 21)
    cx, cy, cw = 26, 26, 470
    ch = 84 + 96 * len(ITEMS)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((cx + 8, cy + 12, cx + cw + 8, cy + ch + 12), 28, fill=(40, 90, 200, 70))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    d.rounded_rectangle((cx, cy, cx + cw, cy + ch), 28, fill=(250, 252, 255, 242))
    d.text((cx + 28, cy + 22), "INSIDE AQUENT" if lang == "en" else "DI DALAM AQUENT", font=font(28, "ExtraBold"), fill=hexc("#1646D6"))
    for i, (k, (off, et, es, it, is_)) in enumerate(ITEMS.items()):
        t, s = (et, es) if lang == "en" else (it, is_)
        y = cy + 78 + i * 96
        badge(d, (cx + 46, y + 26), i + 1, 19)
        d.text((cx + 80, y + 4), t, font=font(25, "ExtraBold"), fill=hexc(INK))
        d.text((cx + 80, y + 40), s, font=font(19, "Medium"), fill=hexc(INK2))
    out = C / f"E1_teardown_annotated_{lang}.png"
    im.convert("RGB").save(out)
    print("wrote", out)


if __name__ == "__main__":
    for lg in ("en", "id"):
        main(lg)
