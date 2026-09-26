"""
AQUENT pitch deck — rebuilt in the app's neumorphism style (white · clean · blue)
and the Aquent logo palette (aqua -> blue).

Visual layers (cards, wells, phones, backgrounds) are rendered with PIL; all text is
native, editable PowerPoint text. Content follows the original "PPT AQUENT.pptx".
"""
import pathlib, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION
from pptx.oxml.ns import qn

ROOT = pathlib.Path(__file__).resolve().parent.parent
A3 = ROOT / "app/assets/3d"
BR = ROOT / "app/assets/brand"
MED = ROOT / "deck/src/media"
SCR = ROOT / "deck/build/screens"
GEN = ROOT / "deck/build/gen"
GEN.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "output/AQUENT_Deck_Neumorph.pptx"

SW_IN, SH_IN = 13.333, 7.5
PX = 150  # px per inch for generated art

INK, INK2, MUTED = "16233F", "4A5A7A", "7A8AA8"
BLUE, DEEP, AQUA, ICE = "2F7BFF", "1646D6", "2A9FCB", "DDEBFF"
OK, WARN = "13A06B", "E0703F"
CARD = (237, 242, 249)
FONT = "Segoe UI"
FONT_B = "Segoe UI Semibold"
FONT_H = "Segoe UI Black"

TOTAL = 25
GAL = ROOT / "galeri"
FX_START = {}  # slide_id -> index of first animated shape


def rgb(h):
    return RGBColor.from_string(h)


def cache(name, key):
    return GEN / f"{name}_{hashlib.md5(repr(key).encode()).hexdigest()[:10]}.png"


# ---------------------------------------------------------------- art gen ---
def bg_light():
    p = GEN / "bg_light.png"
    if p.exists():
        return p
    W, H = int(SW_IN * 120), int(SH_IN * 120)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W * 0.55) / W) ** 2 + ((y - H * 0.35) / H) ** 2)
    k = np.clip(d / 0.8, 0, 1)[..., None]
    img = np.array([246, 249, 253]) * (1 - k) + np.array([218, 227, 240]) * k
    for cx, cy, r, s, col in ((0.05, 0.1, 0.3, 26, (120, 205, 235)), (0.95, 0.95, 0.35, 24, (130, 170, 255))):
        g = np.exp(-(((x / W - cx) ** 2 + (y / H - cy) ** 2) / (r * r)))[..., None] * s / 255
        img = img * (1 - g) + np.array(col) * g
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(p)
    return p


def bg_brand():
    p = GEN / "bg_brand.png"
    if p.exists():
        return p
    W, H = int(SW_IN * 120), int(SH_IN * 120)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    t = np.clip((x / W) * 0.7 + (y / H) * 0.3, 0, 1)[..., None]
    img = np.array([73, 186, 222]) * (1 - t) + np.array([28, 86, 222]) * t
    for cx, cy, r, s in ((0.2, 0.15, 0.35, 60), (0.85, 0.9, 0.4, 40)):
        g = np.exp(-(((x / W - cx) ** 2 + (y / H - cy) ** 2) / (r * r)))[..., None] * s / 255
        img = img * (1 - g) + 255 * g
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(p)
    return p


def _rr(size, box, r, fill=255):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, r, fill=fill)
    return m


M_IN = 0.34  # shadow margin around every card image


def card_img(w, h, r=0.26, kind="raise", fill=CARD, dist=0.09, blur=0.13):
    p = cache("card", (w, h, r, kind, fill, dist, blur))
    if p.exists():
        return p
    m = int(M_IN * PX)
    W, H = int(w * PX) + 2 * m, int(h * PX) + 2 * m
    box = (m, m, m + int(w * PX), m + int(h * PX))
    R, D, B = int(r * PX), int(dist * PX), int(blur * PX)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    def layer(mask, color, alpha):
        lay = Image.new("RGBA", (W, H), color + (0,))
        lay.putalpha(Image.fromarray((np.array(mask).astype(np.float32) * alpha).astype(np.uint8)))
        im.alpha_composite(lay)

    if kind == "raise":
        # soft blue aura below-right + white lift top-left (no grey shadow)
        dk = _rr((W, H), (box[0] + D // 2, box[1] + D, box[2] + D // 2, box[3] + D), R).filter(ImageFilter.GaussianBlur(B * 1.3))
        layer(dk, (92, 140, 255), 0.30)
        lt = _rr((W, H), (box[0] - D, box[1] - D, box[2] - D, box[3] - D), R).filter(ImageFilter.GaussianBlur(B))
        layer(lt, (255, 255, 255), 1.0)
        ga = np.zeros((H, W, 4), np.uint8)
        t = np.linspace(0, 1, H)[:, None, None]
        c0, c1 = np.array([246, 249, 254]), np.array(fill)
        ga[..., :3] = (c0 * (1 - t) + c1 * t).astype(np.uint8)
        ga[..., 3] = 255
        im.paste(Image.fromarray(ga), (0, 0), _rr((W, H), box, R))
    else:  # "aura": glowing ice base with a blue halo instead of an inner shadow
        halo = _rr((W, H), box, R).filter(ImageFilter.GaussianBlur(B * 1.1))
        layer(halo, (70, 150, 255), 0.55)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        cx, cy = box[0] + (box[2] - box[0]) * 0.35, box[1] + (box[3] - box[1]) * 0.28
        dd = np.sqrt(((xx - cx) / (box[2] - box[0])) ** 2 + ((yy - cy) / (box[3] - box[1])) ** 2)
        k = np.clip(dd / 0.95, 0, 1)[..., None]
        ga = np.zeros((H, W, 4), np.uint8)
        ga[..., :3] = (np.array([255, 255, 255]) * (1 - k) + np.array([214, 230, 255]) * k).astype(np.uint8)
        ga[..., 3] = 255
        im.paste(Image.fromarray(ga), (0, 0), _rr((W, H), box, R))
        rim = Image.new("L", (W, H), 0)
        ImageDraw.Draw(rim).rounded_rectangle(box, R, outline=255, width=max(2, int(PX * 0.012)))
        layer(rim, (255, 255, 255), 0.9)
    im.save(p)
    return p


def circle_img(d, kind="inset", fill=CARD):
    p = cache("circ", (d, kind, fill))
    if p.exists():
        return p
    q = card_img(d, d, d / 2, kind, fill)
    Image.open(q).save(p)
    return p


def pill_img(w, h, color0, color1):
    p = cache("pill", (w, h, color0, color1))
    if p.exists():
        return p
    W, H = int(w * PX), int(h * PX)
    ga = np.zeros((H, W, 4), np.uint8)
    t = np.linspace(0, 1, W)[None, :, None]
    ga[..., :3] = (np.array(color0) * (1 - t) + np.array(color1) * t).astype(np.uint8)
    ga[..., 3] = np.array(_rr((W, H), (0, 0, W - 1, H - 1), H // 2))
    Image.fromarray(ga).save(p)
    return p


def phone_img(screen_name, crop_top=0):
    """Phone mockup (light titanium frame, black bezel, dynamic island) around an app screenshot."""
    p = cache("phone", (screen_name, crop_top, 3))
    if p.exists():
        return p
    scr = Image.open(SCR / f"{screen_name}.png").convert("RGBA")
    k = 0.5
    sw, sh = int(scr.width * k), int(scr.height * k)          # 585 x 1266
    scr = scr.resize((sw, sh), Image.LANCZOS)
    bz, rad = int(sw * 12 / 404), int(sw * 54 / 404)
    pw, ph = sw + 2 * bz, sh + 2 * bz
    m = int(pw * 0.16)
    W, H = pw + 2 * m, ph + 2 * m
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    body = (m, m, m + pw, m + ph)
    R = rad + bz
    dk = _rr((W, H), (m + 14, m + 34, m + pw + 14, m + ph + 34), R, 120).filter(ImageFilter.GaussianBlur(46))
    im.paste(Image.new("RGBA", (W, H), (70, 120, 235, 255)), (0, 0), dk)
    ga = np.zeros((H, W, 4), np.uint8)
    t = np.linspace(0, 1, H)[:, None, None]
    ga[..., :3] = (np.array([252, 253, 255]) * (1 - t) + np.array([204, 214, 230]) * t).astype(np.uint8)
    ga[..., 3] = 255
    im.paste(Image.fromarray(ga), (0, 0), _rr((W, H), body, R))
    im.paste(Image.new("RGBA", (W, H), (10, 14, 24, 255)), (0, 0), _rr((W, H), (m + 5, m + 5, m + pw - 5, m + ph - 5), R - 5))
    mask = _rr((sw, sh), (0, 0, sw - 1, sh - 1), rad)
    scr.putalpha(mask)
    im.alpha_composite(scr, (m + bz, m + bz))
    ImageDraw.Draw(im).rounded_rectangle((W // 2 - int(sw * 0.15), m + bz + int(sw * 0.028), W // 2 + int(sw * 0.15),
                                          m + bz + int(sw * 0.11)), int(sw * 0.042), fill=(5, 7, 12, 255))
    im.save(p)
    return p


def photo_round(path, w, h, r=0.22):
    """Cover-crop a photo to w:h and round its corners."""
    p = cache("photo", (str(path), w, h, r))
    if p.exists():
        return p
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (236, 243, 252, 255))  # cut-out photos sit on the card colour
    flat.alpha_composite(im)
    im = flat
    W, H = int(w * PX), int(h * PX)
    s = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((l, t, l + W, t + H))
    im.putalpha(_rr((W, H), (0, 0, W - 1, H - 1), int(r * PX)))
    im.save(p)
    return p


# ------------------------------------------------------------ pptx utils ---
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(SW_IN), Inches(SH_IN)
BLANK = prs.slide_layouts[6]


def pic(slide, path, x, y, w=None, h=None):
    kw = {}
    if w is not None:
        kw["width"] = Inches(w)
    if h is not None:
        kw["height"] = Inches(h)
    return slide.shapes.add_picture(str(path), Inches(x), Inches(y), **kw)


def card(slide, x, y, w, h, r=0.26, kind="raise", **kw):
    p = card_img(w, h, r, kind, **kw)
    return pic(slide, p, x - M_IN, y - M_IN, w + 2 * M_IN, h + 2 * M_IN)


def well(slide, icon, x, y, d, scale=0.74, kind="inset"):
    pic(slide, circle_img(d, kind), x - M_IN, y - M_IN, d + 2 * M_IN, d + 2 * M_IN)
    s = d * scale
    return pic(slide, A3 / f"{icon}.png", x + (d - s) / 2, y + (d - s) / 2, s, s)


def text(slide, x, y, w, h, content, size=14, color=INK2, bold=False, font=FONT, align="l", anchor="t",
         spacing=None, space_after=0, italic=False, charsp=None):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    paras = content if isinstance(content, list) else [content]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        if spacing:
            p.line_spacing = spacing
        if space_after:
            p.space_after = Pt(space_after)
        runs = para if isinstance(para, list) else [(para, {})] if isinstance(para, str) else [para]
        for run in runs:
            t, o = (run, {}) if isinstance(run, str) else run
            r = p.add_run()
            r.text = t
            f = r.font
            f.name = o.get("font", font)
            f.size = Pt(o.get("size", size))
            f.bold = o.get("bold", bold)
            f.italic = o.get("italic", italic)
            f.color.rgb = rgb(o.get("color", color))
            cs = o.get("charsp", charsp)
            if cs:
                r._r.get_or_add_rPr().set("spc", str(cs))
    return tb


def glow(shape, color=BLUE, rad_pt=7, alpha=38):
    """Native PowerPoint glow = soft blue aura around a shape."""
    spPr = shape._element.spPr
    eff = spPr.find(qn("a:effectLst"))
    if eff is None:
        eff = spPr.makeelement(qn("a:effectLst"), {})
        spPr.append(eff)
    g = eff.makeelement(qn("a:glow"), {"rad": str(int(rad_pt * 12700))})
    c = g.makeelement(qn("a:srgbClr"), {"val": color})
    c.append(c.makeelement(qn("a:alpha"), {"val": str(alpha * 1000)}))
    g.append(c)
    eff.insert(0, g)


def orb_img(color=(70, 150, 255)):
    p = cache("orb", color)
    if p.exists():
        return p
    N = 600
    y, x = np.mgrid[0:N, 0:N].astype(np.float32)
    d = np.sqrt((x - N / 2) ** 2 + (y - N / 2) ** 2) / (N / 2)
    a = np.clip(1 - d, 0, 1) ** 2.2 * 190
    im = np.zeros((N, N, 4), np.uint8)
    im[..., :3] = color
    im[..., 3] = a.astype(np.uint8)
    Image.fromarray(im).save(p)
    return p


def aura_orb(slide, cx, cy, d, color=(70, 150, 255)):
    sh = pic(slide, orb_img(color), cx - d / 2, cy - d / 2, d, d)
    sh.name = "FX_PULSE orb"
    return sh


def photo_aura(path, w, h, r=0.24):
    """Real photo, cover-cropped and rounded, with a baked blue aura + white rim."""
    p = cache("paura", (str(path), w, h, r, 2))
    if p.exists():
        return p
    from PIL import ImageOps
    src = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    W, H, m = int(w * PX), int(h * PX), int(M_IN * PX)
    s_ = max(W / src.width, H / src.height)
    src = src.resize((int(src.width * s_) + 1, int(src.height * s_) + 1), Image.LANCZOS)
    l, t = (src.width - W) // 2, (src.height - H) // 2
    src = src.crop((l, t, l + W, t + H))
    R = int(r * PX)
    out = Image.new("RGBA", (W + 2 * m, H + 2 * m), (0, 0, 0, 0))
    box = (m, m, m + W, m + H)
    halo = _rr(out.size, (box[0] - 4, box[1] + 6, box[2] + 4, box[3] + 10), R).filter(ImageFilter.GaussianBlur(int(0.16 * PX)))
    lay = Image.new("RGBA", out.size, (60, 140, 255, 0))
    lay.putalpha(Image.fromarray((np.array(halo) * 0.62).astype(np.uint8)))
    out.alpha_composite(lay)
    rim = _rr(out.size, (box[0] - 5, box[1] - 5, box[2] + 5, box[3] + 5), R + 5)
    out.paste(Image.new("RGBA", out.size, (255, 255, 255, 235)), (0, 0), rim)
    src.putalpha(_rr((W, H), (0, 0, W - 1, H - 1), R))
    out.alpha_composite(src, (m, m))
    out.save(p)
    return p


def photo(slide, path, x, y, w, h, r=0.24):
    return pic(slide, photo_aura(path, w, h, r), x - M_IN, y - M_IN, w + 2 * M_IN, h + 2 * M_IN)


def chip(slide, x, y, label, fill=ICE, color=DEEP, size=9.5):
    w = 0.4 + len(label) * 0.098 * size / 9.5
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.3))
    s.adjustments[0] = 0.5
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(fill)
    s.line.fill.background()
    s.shadow.inherit = False
    tf = s.text_frame
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = label
    r.font.size, r.font.bold, r.font.name = Pt(size), True, FONT
    r.font.color.rgb = rgb(color)
    r._r.get_or_add_rPr().set("spc", "120")
    glow(s, BLUE, 5, 22)
    return w


def badge(slide, x, y, d, label, fill=BLUE, size=12):
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(fill)
    s.line.fill.background()
    s.shadow.inherit = False
    tf = s.text_frame
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = label
    r.font.size, r.font.bold, r.font.name = Pt(size), True, FONT
    r.font.color.rgb = rgb("FFFFFF")
    glow(s, fill, 8, 45)


def arrow(slide, x, y, w=0.34, h=0.3, color=BLUE):
    s = slide.shapes.add_shape(MSO_SHAPE.CHEVRON, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(color)
    s.line.fill.background()
    s.shadow.inherit = False
    glow(s, color, 6, 40)


def new_slide(num, section, title, sub=None, bg="light", logo=True):
    s = prs.slides.add_slide(BLANK)
    pic(s, bg_light() if bg == "light" else bg_brand(), 0, 0, SW_IN, SH_IN)
    if section:
        chip(s, 0.6, 0.45, section)
    if title:
        parts = title if isinstance(title, list) else [(title, INK)]
        text(s, 0.6, 0.86, 9.6, 0.7, [[(t, {"color": c}) for t, c in parts]], size=32, bold=True, font=FONT)
    if sub:
        text(s, 0.6, 1.5, 9.6, 0.4, sub, size=13.5, color=INK2)
    if logo:
        pic(s, BR / "logo_grad.png", SW_IN - 0.6 - 1.35, 0.5, 1.35)
    if num:
        text(s, SW_IN - 1.4, SH_IN - 0.42, 0.8, 0.25, f"{len(prs.slides):02d} / {TOTAL}", size=9, color=MUTED, align="r")
    FX_START[s.slide_id] = len(s.shapes)
    return s


def deco(slide, items):
    for name, x, y, w in items:
        pic(slide, A3 / f"{name}.png", x, y, w).name = "FX_FLOAT " + name


def notes(slide, t):
    slide.notes_slide.notes_text_frame.text = t


# ================================================================ SLIDES ===
# 1 · Cover ------------------------------------------------------------------
s = prs.slides.add_slide(BLANK)
pic(s, bg_light(), 0, 0, SW_IN, SH_IN)
FX_START[s.slide_id] = 1
deco(s, [("deco_ring", 11.9, 5.7, 1.2), ("deco_sphere", 6.1, 0.35, 0.55), ("deco_bubbles", 12.1, 2.6, 1.0)])
pic(s, MED / "image24.png", 0.6, 0.3, 0.98)           # Indonesia Inventors Day 2026
pic(s, MED / "image11.png", 1.75, 0.55, 1.45)          # INNOPA
chip(s, 0.6, 1.5, "AIoT SMART SHOWER")
pic(s, BR / "logo_grad.png", 0.55, 1.95, 4.9)
text(s, 0.6, 3.3, 6.2, 1.0, "An AIoT-based smart shower with multilayer recycled-material filtration and purified "
     "greywater reuse system integrated with AI dermatology assistant", size=15, bold=True, color=INK, spacing=1.08)
text(s, 0.6, 4.42, 6.0, 0.25, "TEAM AQUENT", size=9.5, bold=True, color=AQUA, charsp=150)
text(s, 0.6, 4.68, 6.2, 0.55, "Dhafa Krisna Bagus Harjanto · Lais Arsalan Farzana Hartanto · Zharifa Laduna Faiza · "
     "Kinan Hayu Prima Andini · Joanna Dharmarina Saputra", size=11, color=INK2)
x = 0.6
for tag in ("GREYWATER REUSE", "POINT-OF-USE TREATMENT", "EXPLAINABLE AI"):
    x += chip(s, x, 5.38, tag, fill="FFFFFF", color=BLUE) + 0.14
card(s, 0.6, 6.0, 6.4, 1.05, r=0.24)
text(s, 0.82, 6.08, 2, 0.22, "IN COLLABORATION WITH", size=8, bold=True, color=MUTED, charsp=120)
lx = 0.82
for img, w in (("image22", 0.72), ("image21", 0.8), ("image23", 0.95), ("image25", 0.38), ("image20", 0.36),
               ("image19", 0.5), ("image26", 0.48), ("image28", 0.36)):
    im = Image.open(MED / f"{img}.png")
    h = w * im.height / im.width
    if h > 0.5:
        w, h = 0.5 * im.width / im.height, 0.5
    if img == "image23":  # white wordmark needs a dark plate
        plate = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(lx - 0.06), Inches(6.36 + (0.5 - h) / 2 - 0.05), Inches(w + 0.12), Inches(h + 0.1))
        plate.fill.solid(); plate.fill.fore_color.rgb = rgb(INK); plate.line.fill.background(); plate.shadow.inherit = False
    pic(s, MED / f"{img}.png", lx, 6.36 + (0.5 - h) / 2, w)
    lx += w + 0.2
# hero: product on a neumorphic stage
aura_orb(s, 10.0, 3.6, 7.2)
pic(s, circle_img(5.1, "raise"), 7.45 - M_IN, 1.05 - M_IN, 5.1 + 2 * M_IN, 5.1 + 2 * M_IN)
pic(s, circle_img(4.3, "inset"), 7.85 - M_IN, 1.45 - M_IN, 4.3 + 2 * M_IN, 4.3 + 2 * M_IN)
pic(s, A3 / "unit_hero.png", 7.2, 0.75, 5.6)
card(s, 10.35, 6.05, 2.35, 0.85, r=0.2)
text(s, 10.5, 6.12, 2.1, 0.3, "360 × 360 × 149 mm", size=13, bold=True, color=DEEP)
text(s, 10.5, 6.48, 2.1, 0.3, "ceiling-mounted unit", size=10, color=INK2)
for i, sdg in enumerate(("image16", "image15", "image27", "image17")):
    pic(s, MED / f"{sdg}.png", 7.55 + i * 0.66, 6.12, 0.56)
notes(s, "AQUENT — AIoT smart shower that recycles greywater at the point of use, verified by four sensors, with an explainable AI dermatology assistant.")

# 2 · Agenda -----------------------------------------------------------------
s = new_slide(2, "AGENDA", [("What we will ", INK), ("cover", BLUE)], "Five chapters, from the global water problem to evidence and next steps.")
pic(s, circle_img(3.6, "raise"), 1.0 - M_IN, 2.55 - M_IN, 3.6 + 2 * M_IN, 3.6 + 2 * M_IN)
pic(s, A3 / "unit_iso.png", 0.75, 2.25, 4.1)
deco(s, [("deco_drops", 3.9, 5.4, 1.2)])
rows = [("globe", "The water problem", "Global scarcity, health burden, and where a household can act."),
        ("recycle", "The AQUENT system", "Closed-loop shower, six-layer bio-filter, four-sensor gate."),
        ("unit_face", "Product & installation", "360 × 360 × 149 mm ceiling unit in a normal bathroom."),
        ("robot", "Software & AI", "Live dashboard, explainable recommendations, skin assistant."),
        ("chart", "Evidence & openness", "Literature base, open-source code, next steps.")]
for i, (ic, t, d) in enumerate(rows):
    y = 2.1 + i * 1.02
    card(s, 5.5, y, 7.2, 0.8, r=0.24)
    well(s, ic, 5.62, y + 0.08, 0.64)
    text(s, 6.45, y + 0.12, 0.6, 0.55, f"0{i + 1}", size=20, bold=True, color=AQUA, font=FONT_H, anchor="m")
    text(s, 7.1, y + 0.1, 5.4, 0.3, t, size=15, bold=True, color=INK)
    text(s, 7.1, y + 0.42, 5.4, 0.3, d, size=11, color=INK2)

# 3 · Background -------------------------------------------------------------
s = new_slide(3, "01 · THE WATER PROBLEM", [("Background", INK)], "Water scarcity and unsafe water are a global — and growing — crisis.")
stats = [("globe", "1.4 Million", "people die every year", "Due to poor access to sanitation, water and hygiene — mainly in low- and middle-income countries."),
         ("drop", "4 Billion", "people · two-thirds of the world", "Face water scarcity; 500 million people are affected year-round, mainly in India and China."),
         ("deco_drops", "3 Billion", "people affected by 2050", "Severe water-scarce river basins may triple due to pollution."),
         ("chart", "30% → 40%", "scarcity with the water-quality factor", "When water quality is counted, scarcity rises from 30% to 40% — and 55% of the world faces severe scarcity.")]
for i, (ic, big, lab, d) in enumerate(stats):
    x, y = 0.6 + (i % 2) * 6.15, 2.2 + (i // 2) * 2.5
    card(s, x, y, 5.9, 2.2)
    well(s, ic, x + 0.25, y + 0.3, 1.1)
    text(s, x + 1.6, y + 0.22, 4.1, 0.7, big, size=34, bold=True, color=DEEP, font=FONT_H)
    text(s, x + 1.6, y + 0.92, 4.1, 0.3, lab, size=12.5, bold=True, color=INK)
    text(s, x + 1.6, y + 1.26, 4.1, 0.8, d, size=11, color=INK2, spacing=1.1)

# 4 · Water quality & the skin -------------------------------------------------
s = new_slide(4, "01 · THE WATER PROBLEM", [("Water quality ", INK), ("and the skin", BLUE)],
              "Unsafe water is not only a supply problem — it is a dermatological one.")
rows = [("≈10%", "of the global disease burden in low-resource areas is attributed to unsafe water and sanitation.", "WHO, cited in Outreach International 2025"),
        ("+87%", "higher eczema risk reported for households on hard water.", "Jabbar-Lopez et al., 2021"),
        ("95%", "of residual chlorine can be removed by carbon-based filtration.", "Parra et al., 2020")]
for i, (big, d, src) in enumerate(rows):
    y = 2.2 + i * 1.6
    card(s, 0.6, y, 6.9, 1.32)
    card(s, 0.8, y + 0.2, 1.75, 0.92, kind="inset", r=0.22)
    text(s, 0.8, y + 0.2, 1.75, 0.92, big, size=26, bold=True, color=DEEP, font=FONT_H, align="c", anchor="m")
    text(s, 2.8, y + 0.2, 4.5, 0.62, d, size=12.5, color=INK, spacing=1.08)
    text(s, 2.8, y + 0.86, 4.5, 0.25, src, size=9, color=MUTED, italic=True)
card(s, 7.9, 2.2, 4.83, 4.52)
well(s, "shield", 8.15, 2.45, 0.95)
text(s, 9.3, 2.55, 3.3, 0.3, "FIELD EVIDENCE", size=9.5, bold=True, color=AQUA, charsp=150)
text(s, 9.3, 2.85, 3.3, 0.4, "Indonesia", size=18, bold=True, color=INK)
text(s, 8.15, 3.65, 4.35, 3.0, [
    "Safitri dkk. (2021) reported that at Pondok Pesantren Hidayatul Muhsinin, Kubu Raya, limited clean-water availability correlated with a high incidence of scabies and dermatitis alongside diarrhoea.",
    "Bathing water that fails quality standards is therefore a dermatological risk factor — which is why AQUENT treats measurement as part of the product, not an optional extra."],
    size=11.5, color=INK2, spacing=1.12, space_after=8)

# 5 · Problem & challenges ----------------------------------------------------
s = new_slide(5, "01 · THE WATER PROBLEM", [("Problem ", INK), ("& challenges", BLUE)])
cols = [("HOUSEHOLD PROBLEMS", [("drop", "60–80 L", "used for a single bath — then discarded."),
                                ("sun", "Groundwater drying out", "Prolonged droughts deplete the household's fallback source."),
                                ("turbidity", "Unknown water quality", "Users cannot tell whether bathing water is safe for their skin.")]),
        ("OUR CHALLENGES", [("recycle", "Sanitizing greywater on site", "Clean enough to bathe in again, without industrial equipment."),
                            ("shield", "Proving the water is safe", "Quality must be measured continuously, not assumed."),
                            ("leaf", "Affordable, local materials", "Filter media sourced from agricultural and household waste.")])]
for c, (head, items) in enumerate(cols):
    x = 0.6 + c * 6.15
    text(s, x, 1.7, 5.9, 0.3, head, size=10, bold=True, color=AQUA if c else WARN, charsp=150)
    for i, (ic, t, d) in enumerate(items):
        y = 2.15 + i * 1.62
        card(s, x, y, 5.9, 1.36)
        well(s, ic, x + 0.22, y + 0.2, 0.96)
        text(s, x + 1.4, y + 0.24, 4.3, 0.4, t, size=17 if i or c else 24, bold=True, color=INK if (i or c) else DEEP,
             font=FONT if (i or c) else FONT_H)
        text(s, x + 1.4, y + (0.7 if (i or c) else 0.78), 4.3, 0.55, d, size=11.5, color=INK2)

# 6 · Research questions -----------------------------------------------------
s = new_slide(6, "01 · THE WATER PROBLEM", [("Research ", INK), ("questions", BLUE)], "What the project set out to answer.")
qs = [("tank", "How far can shower-water recycling cut excess clean-water consumption?", "Measured as litres saved per person per day against a conventional shower."),
      ("calendar", "How is water-resource efficiency optimised as real conservation?", "Scheduling and volume control tied to climate and actual usage, not to a fixed timer."),
      ("shield", "Can an automatic sensor system guarantee consistent quality in recycled water?", "Four parameters continuously gated against thresholds before any water is reused."),
      ("filter", "Which filtration formulation removes contaminants without hazardous waste?", "Organic and recycled media whose spent form can be disposed of or composted safely.")]
for i, (ic, q, d) in enumerate(qs):
    x, y = 0.6 + (i % 2) * 6.15, 2.2 + (i // 2) * 2.45
    card(s, x, y, 5.9, 2.15)
    badge(s, x + 0.25, y + 0.25, 0.46, str(i + 1))
    text(s, x + 0.9, y + 0.22, 3.55, 0.95, q, size=14, bold=True, color=INK, spacing=1.05)
    text(s, x + 0.9, y + 1.3, 3.55, 0.7, d, size=11, color=INK2)
    pic(s, A3 / f"{ic}.png", x + 4.45, y + 0.45, 1.25)

# 7 · The solution -----------------------------------------------------------
s = new_slide(7, "02 · THE AQUENT SYSTEM", [("The ", INK), ("solution", BLUE)])
card(s, 0.6, 1.75, 4.3, 5.0)
pic(s, A3 / "unit_hero.png", 1.2, 1.6, 3.1)
text(s, 0.85, 4.75, 3.8, 0.3, "INNOVATION", size=9.5, bold=True, color=AQUA, charsp=150)
text(s, 0.85, 5.05, 3.85, 1.6, "Aquent is an AIoT smart shower that sanitizes greywater through natural multilayer filtration and "
     "returns it to the shower head — monitored in real time by four sensors and paired with an AI dermatology assistant.",
     size=11, color=INK2, spacing=1.1)
card(s, 5.2, 1.75, 3.55, 5.0)
text(s, 5.45, 1.95, 3, 0.3, "OUR GOALS", size=9.5, bold=True, color=AQUA, charsp=150)
for i, g in enumerate(("Cut household water use without cutting shower quality.",
                       "Make water quality visible and verifiable at home.",
                       "Build the filter from local agricultural and recycled waste.")):
    y = 2.45 + i * 1.4
    badge(s, 5.45, y, 0.44, str(i + 1), fill=AQUA)
    text(s, 6.05, y - 0.02, 2.5, 1.2, g, size=13, bold=True, color=INK, spacing=1.05)
card(s, 9.05, 1.75, 3.68, 5.0)
text(s, 9.3, 1.95, 3, 0.3, "SDG CONTRIBUTION", size=9.5, bold=True, color=AQUA, charsp=150)
sdgs = [("image16", "SDG 3", "Health & well-being through monitored, skin-safe water."),
        ("image15", "SDG 6", "Clean water & sanitation through greywater reuse."),
        ("image27", "SDG 9", "Innovation: AI, IoT & smart sensors for water management."),
        ("image17", "SDG 12", "Responsible consumption using recycled filter media.")]
for i, (im, t, d) in enumerate(sdgs):
    y = 2.4 + i * 1.07
    pic(s, MED / f"{im}.png", 9.3, y, 0.78)
    text(s, 10.25, y - 0.02, 2.35, 0.25, t, size=11.5, bold=True, color=INK)
    text(s, 10.25, y + 0.24, 2.35, 0.6, d, size=9.5, color=INK2)

# 8 · Our novelty ------------------------------------------------------------
s = new_slide(8, "02 · THE AQUENT SYSTEM", [("Our ", INK), ("novelty", BLUE)], "Three things no conventional shower does together.")
nov = [("AI Dermatology Assistant", "Reads and analyses your skin condition from the data, explains the causes and recommends skincare and shower routines."),
       ("Natural multilayered filtration", "Six layers of natural, organic-based media — each with its own specific function — filter the water to the maximum."),
       ("Smart application", "All smart features in one app: water-quality monitoring, temperature control, skin-linked recommendations.")]
for i, (t, d) in enumerate(nov):
    x = 0.6 + i * 4.1
    card(s, x, 2.15, 3.85, 4.6)
    if i == 0:
        pic(s, phone_img("xai"), x + 1.12, 2.2, 1.6)
    elif i == 1:
        pic(s, A3 / "filter_stack.png", x + 1.12, 2.3, 1.6)
    else:
        pic(s, phone_img("home"), x + 1.12, 2.2, 1.6)
    text(s, x + 0.3, 5.3, 3.25, 0.35, t, size=14.5, bold=True, color=INK, align="c")
    text(s, x + 0.3, 5.7, 3.25, 1.0, d, size=10.3, color=INK2, align="c", spacing=1.06)

# 9 · Closing the loop -------------------------------------------------------
s = new_slide(9, "02 · THE AQUENT SYSTEM", [("How AQUENT ", INK), ("closes the loop", BLUE)],
              "Point-of-use treatment: the water never leaves the fixture unless it fails.")
steps = [("drop", "Greywater intake", "60–80 L per shower captured at the floor gully."),
         ("deco_bubbles", "Sedimentation", "Hair and coarse solids trapped before the media bed."),
         ("filter", "Six-layer bio-filter", "Zeolite · biochar · chitosan · loofah · bamboo · bagasse."),
         ("shield", "Sensor verification", "pH · turbidity · ORP · temperature, every cycle."),
         ("robot", "AI decision", "Reuse if every threshold holds; divert to drain if not.")]
for i, (ic, t, d) in enumerate(steps):
    x = 0.6 + i * 2.5
    card(s, x, 2.2, 2.15, 2.85)
    well(s, ic, x + 0.5, 2.4, 1.15)
    badge(s, x + 0.18, 2.35, 0.38, str(i + 1), fill=AQUA if i != 4 else BLUE, size=11)
    text(s, x + 0.15, 3.72, 1.85, 0.35, t, size=13, bold=True, color=INK, align="c")
    text(s, x + 0.15, 4.1, 1.85, 0.9, d, size=10, color=INK2, align="c", spacing=1.05)
    if i < 4:
        arrow(s, x + 2.22, 3.4, 0.22, 0.3)
card(s, 0.6, 5.4, 12.13, 1.35)
pic(s, A3 / "recycle.png", 0.85, 5.55, 1.05)
text(s, 2.1, 5.55, 10.4, 0.3, "Water that clears every threshold returns to the next shower cycle", size=14, bold=True, color=INK)
text(s, 2.1, 5.9, 10.4, 0.8, "Nothing is stored in a separate tank and no plumbing rework is required: the cartridge, pump and sensor board "
     "all sit inside the 149 mm-deep housing. Only water that fails a threshold is sent to the drain, so the loop degrades safely rather than silently.",
     size=11, color=INK2, spacing=1.08)

# 10 · Meet our product ------------------------------------------------------
s = new_slide(10, "03 · PRODUCT & INSTALLATION", [("Meet our ", INK), ("product", BLUE)],
              "An AIoT smart shower that sanitizes and recycles greywater inside the system.")
feats = [("recycle", "Closed water loop", "Used shower water passes through multilayer filtration and returns to the shower head instead of the drain."),
         ("shield", "Four sensors, real time", None),
         ("unit_face", "Built for a normal bathroom", "Shower body, pipes, faucet and water heater — with the filter cartridge serviced by hand.")]
for i, (ic, t, d) in enumerate(feats):
    y = 2.15 + i * 1.6
    card(s, 0.6, y, 6.4, 1.35)
    well(s, ic, 0.8, y + 0.2, 0.95)
    text(s, 1.95, y + 0.18, 4.9, 0.35, t, size=15, bold=True, color=INK)
    if d:
        text(s, 1.95, y + 0.55, 4.9, 0.7, d, size=11, color=INK2, spacing=1.05)
    else:
        for k, (sic, lab) in enumerate((("ph", "pH"), ("turbidity", "Turbidity"), ("chlorine", "Chlorine"), ("temp", "Temperature"))):
            xx = 1.95 + [0, 0.8, 2.05, 3.3][k]
            pic(s, A3 / f"{sic}.png", xx, y + 0.63, 0.42)
            text(s, xx + 0.42, y + 0.72, 1.5, 0.3, lab, size=10.5, bold=True, color=DEEP)
aura_orb(s, 10.05, 4.35, 6.6)
pic(s, circle_img(4.9, "raise"), 7.6 - M_IN, 1.9 - M_IN, 4.9 + 2 * M_IN, 4.9 + 2 * M_IN)
pic(s, MED / "image47.png", 7.45, 2.95, 5.2)
chip(s, 8.1, 6.62, "360 × 360 × 149 mm  ·  CEILING-MOUNTED", fill="FFFFFF", color=DEEP)

# 10b · Working prototype (real photos) -------------------------------------
gp = {k: GAL / f"WhatsApp Image 2026-09-26 at {k}.jpeg" for k in ("07.37.47", "07.53.28", "07.53.29 (1)", "07.53.29", "07.53.30 (1)", "07.53.30", "07.53.31")}
s = new_slide(11, "03 · PRODUCT & INSTALLATION", [("Working ", INK), ("prototype", BLUE)], "The first physical build of AQUENT, photographed in the lab.")
aura_orb(s, 3.15, 4.4, 6.0)
photo(s, gp["07.53.29 (1)"], 0.75, 2.05, 4.8, 4.75, 0.3)
chip(s, 0.95, 6.28, "REAL PHOTO · PROTOTYPE V1", fill="FFFFFF", color=DEEP)
calls = [("filter", "Twin transparent columns", "Two clear columns rise from the housing, keeping the water path visible."),
         ("shield", "Blue status light", "A glowing indicator on top of the unit shows the system is running."),
         ("drop", "Handheld shower & hose", "A chrome shower head on a flexible steel hose for everyday use."),
         ("unit_iso", "Compact white housing", "The branded AQUENT body holds the system in one bench-top unit.")]
for i, (ic, t, d) in enumerate(calls):
    y = 2.05 + i * 1.2
    card(s, 6.1, y, 6.63, 1.0, r=0.24)
    well(s, ic, 6.25, y + 0.1, 0.8)
    text(s, 7.25, y + 0.12, 5.3, 0.32, t, size=14, bold=True, color=INK)
    text(s, 7.25, y + 0.47, 5.3, 0.5, d, size=10.5, color=INK2, spacing=1.04)

# 10c · Prototype gallery ------------------------------------------------------
s = new_slide(12, "03 · PRODUCT & INSTALLATION", [("Prototype ", INK), ("gallery", BLUE)], "Every angle of the first AQUENT build.")
aura_orb(s, 2.55, 4.45, 5.0)
photo(s, gp["07.37.47"], 0.75, 2.05, 3.6, 4.75, 0.28)
shots = [("07.53.28", "Side profile"), ("07.53.30 (1)", "Three-quarter view"), ("07.53.30", "Top & status light"),
         ("07.53.29", "Label & shower head"), ("07.53.31", "Front elevation"), ("07.53.29 (1)", "Front view")]
for i, (k, cap) in enumerate(shots):
    x, y = 4.85 + (i % 3) * 2.68, 2.05 + (i // 3) * 2.45
    photo(s, gp[k], x, y, 2.38, 1.92, 0.2)
    text(s, x, y + 2.0, 2.38, 0.25, cap, size=10, bold=True, color=INK2, align="c")

# 11 · Product anatomy -------------------------------------------------------
s = new_slide(11, "03 · PRODUCT & INSTALLATION", [("Product ", INK), ("anatomy", BLUE)], "Three views of the 360 × 360 × 149 mm housing.")
views = [("image48", "Nozzle band & panel", "104 chrome nozzles ring the backlit diffuser aperture on the face plate."),
         ("image49", "Top & inlet", "G1/2 inlet, status LED strip and the side filter-cartridge hatch."),
         ("image50", "Elevation", "149 mm deep — the full loop fits between the face plate and the ceiling.")]
for i, (im, t, d) in enumerate(views):
    x = 0.6 + i * 4.1
    card(s, x, 2.15, 3.85, 4.6)
    card(s, x + 0.22, 2.37, 3.41, 2.35, kind="inset", r=0.22)
    pic(s, photo_round(MED / f"{im}.png", 3.21, 2.15, 0.18), x + 0.32, 2.47, 3.21)
    text(s, x + 0.3, 4.95, 3.25, 0.35, t, size=15, bold=True, color=INK, align="c")
    text(s, x + 0.3, 5.38, 3.25, 1.0, d, size=11, color=INK2, align="c", spacing=1.08)

# 12 · In use ----------------------------------------------------------------
s = new_slide(12, None, None, logo=True)
pic(s, photo_round(MED / "image51.png", 5.6, 6.5, 0.3), 0.5, 0.5, 5.6)
chip(s, 6.6, 0.45, "03 · PRODUCT & INSTALLATION")
text(s, 6.6, 0.86, 6.2, 0.7, [[("In ", {"color": INK}), ("use", {"color": BLUE})]], size=32, bold=True)
text(s, 6.6, 1.5, 6.2, 0.4, "Installed like any ceiling rain shower.", size=13.5, color=INK2)
uses = ["Water leaves the perimeter nozzle band while the centre panel glows as a soft light source.",
        "The floor gully returns greywater to the cartridge inside the unit.",
        "Filtered water re-enters the head for the next cycle; only water that fails a threshold goes to drain.",
        "No separate tank and no plumbing rework in the bathroom."]
for i, u in enumerate(uses):
    y = 2.2 + i * 1.12
    card(s, 6.6, y, 6.13, 0.9)
    badge(s, 6.82, y + 0.22, 0.46, str(i + 1), fill=AQUA)
    text(s, 7.5, y + 0.12, 5.0, 0.7, u, size=12, color=INK, anchor="m", spacing=1.05)
text(s, SW_IN - 1.4, SH_IN - 0.42, 0.8, 0.25, f"{len(prs.slides):02d} / {TOTAL}", size=9, color=MUTED, align="r")
FX_START[s.slide_id] = 1

# 13 · Filtration system ------------------------------------------------------
s = new_slide(13, "02 · THE AQUENT SYSTEM", [("Filtration ", INK), ("system", BLUE)], "Six layers of natural, recycled media — top to bottom.")
card(s, 0.6, 2.1, 3.9, 4.65)
pic(s, A3 / "filter_stack.png", 1.1, 2.0, 2.9 * 900 / 1300 * 1.35)
layers = [("9FB06A", "Dried bamboo leaf", "Coarse filtration; flavonoids, phenolic acids and silica add an antioxidant finish."),
          ("E3CF98", "Loofah", "Natural fibrous medium that captures suspended particles."),
          ("D5D9DE", "Zeolite", "Ion exchange binds Pb, Cd and Ni; broad antibacterial and antifungal activity."),
          ("3A3A3F", "Banana-peel biochar", "Adsorbs dyes, endocrine disruptors (BPA), pharmaceuticals and oils."),
          ("F1E6CF", "Chitosan", "Inhibits E. coli, S. aureus and coliforms; adsorbs Cd and Fe."),
          ("D9B479", "Sugarcane bagasse", "Polishing medium; phenolics documented as exfoliant and moisturiser.")]
for i, (c, t, d) in enumerate(layers):
    y = 2.1 + i * 0.79
    card(s, 4.85, y, 7.88, 0.62, r=0.2)
    sw = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(5.02), Inches(y + 0.11), Inches(0.4), Inches(0.4))
    sw.adjustments[0] = 0.3
    sw.fill.solid(); sw.fill.fore_color.rgb = rgb(c); sw.line.color.rgb = rgb("FFFFFF"); sw.line.width = Pt(2)
    text(s, 5.6, y + 0.06, 0.4, 0.5, str(i + 1), size=13, bold=True, color=AQUA, anchor="m")
    text(s, 5.95, y + 0.06, 2.2, 0.5, t, size=12.5, bold=True, color=INK, anchor="m")
    text(s, 8.2, y + 0.06, 4.4, 0.5, d, size=10, color=INK2, anchor="m")

# 14 · Three-stage filtration -------------------------------------------------
s = new_slide(14, "02 · THE AQUENT SYSTEM", [("Three-stage ", INK), ("filtration", BLUE)], "The same cartridge, read as three functional stages.")
stages = [("STAGE 1", "Pre-filtration", "Dried bamboo leaf and loofah hold back fibres, hair and coarse solids so the adsorption bed is not blinded.", (111, 170, 90), (150, 200, 110), "leaf"),
          ("STAGE 2", "Adsorption", "Zeolite, banana-peel biochar and chitosan bind heavy metals, organic pollutants and microbial load.", (22, 70, 214), (47, 123, 255), "chlorine"),
          ("STAGE 3", "Polishing", "Sugarcane bagasse clears residual turbidity and leaves the water skin-safe for the next cycle.", (214, 160, 60), (240, 196, 90), "drop")]
for i, (st, t, d, c0, c1, ic) in enumerate(stages):
    x = 0.6 + i * 4.1
    card(s, x, 2.15, 3.8, 4.6)
    pic(s, pill_img(1.25, 0.34, c0, c1), x + 0.3, 2.45, 1.25)
    text(s, x + 0.3, 2.45, 1.25, 0.34, st, size=10, bold=True, color="FFFFFF", align="c", anchor="m", charsp=120)
    well(s, ic, x + 1.15, 3.05, 1.5)
    text(s, x + 0.3, 4.8, 3.2, 0.4, t, size=18, bold=True, color=INK, align="c")
    text(s, x + 0.3, 5.3, 3.2, 1.3, d, size=11, color=INK2, align="c", spacing=1.08)
    if i < 2:
        arrow(s, x + 3.86, 4.2, 0.2, 0.3)

# 15 · What the media remove ---------------------------------------------------
s = new_slide(15, "02 · THE AQUENT SYSTEM", [("What the media ", INK), ("remove", BLUE)], "Contaminant classes documented for the recycled media in the stack.")
rem = [("chlorine", "Heavy metals", "Pb²⁺ · Cd²⁺ · Cu²⁺ · Hg²⁺ · Zn²⁺ · Mn²⁺ · Fe²⁺ · Ni", "Zeolite ion exchange, banana-peel biochar, chitosan"),
       ("sparkle", "Dyes & endocrine disruptors", "Malachite green · BPA · Reactive Black 5 · Congo red · methylene blue · progesterone", "Banana-peel biochar"),
       ("ph", "Pharmaceuticals & oils", "Ibuprofen · doxycycline · diesel oil", "Banana-peel biochar"),
       ("shield", "Microbial load", "E. coli · S. aureus · coliform bacteria", "Chitosan, zeolite"),
       ("globe", "Toxic ions & gases", "Cyanide (CN⁻) · ammonia", "Banana-peel biochar"),
       ("turbidity", "Turbidity & sebum", "Suspended particles, excess sebum, surface pollutants", "Loofah, bamboo leaf, bagasse, zeolite")]
for i, (ic, t, d, by) in enumerate(rem):
    x, y = 0.6 + (i % 3) * 4.1, 2.15 + (i // 3) * 2.35
    card(s, x, y, 3.85, 2.1)
    well(s, ic, x + 0.22, y + 0.22, 0.85)
    text(s, x + 1.25, y + 0.28, 2.45, 0.7, t, size=14, bold=True, color=INK, anchor="m", spacing=1.0)
    text(s, x + 0.25, y + 1.2, 3.4, 0.55, d, size=10.5, color=DEEP, bold=True, spacing=1.05)
    text(s, x + 0.25, y + 1.72, 3.4, 0.3, by, size=9, color=MUTED, italic=True)

# 16 · Sensor array -----------------------------------------------------------
s = new_slide(16, "02 · THE AQUENT SYSTEM", [("Sensor ", INK), ("array", BLUE)], "Reuse stays conditional on measurement, never on assumption.")
sens = [("ph", "pH", "SEN0165", "Acidity across 0–14. Keeps reused water inside the skin-safe band; below 7 acidic, above 7 alkaline."),
        ("turbidity", "Turbidity", "SEN0189", "Suspended solids by light scattering — the direct read on how well the media bed is performing."),
        ("chlorine", "Residual chlorine", "ORP sensor", "Oxidation-reduction potential as an indirect proxy for the disinfectant reserve still in the water."),
        ("temp", "Temperature", "DS18B20", "Digital reading that corrects pH and ORP and holds the bathing comfort set-point.")]
for i, (ic, t, model, d) in enumerate(sens):
    x = 0.6 + i * 3.08
    card(s, x, 2.1, 2.83, 2.85)
    pic(s, A3 / f"{ic}.png", x + 0.22, 2.2, 1.05)
    chip(s, x + 1.35, 2.32, model, fill="FFFFFF", size=8.5)
    text(s, x + 0.25, 3.3, 2.4, 0.35, t, size=14.5, bold=True, color=INK)
    text(s, x + 0.25, 3.68, 2.4, 1.2, d, size=9.8, color=INK2, spacing=1.05)
card(s, 0.6, 5.3, 12.13, 1.45)
text(s, 0.85, 5.42, 5, 0.3, "CLIMATE-ADAPTIVE SCHEDULING", size=9.5, bold=True, color=AQUA, charsp=150)
pic(s, A3 / "sun.png", 0.85, 5.75, 0.8)
text(s, 1.75, 5.75, 4.7, 0.95, [[("Tropical ", {"bold": True, "color": INK}), ("(above 18 °C year-round, typically 20–30 °C): two to three showers a day at room temperature 20–25 °C, or 37–40 °C when warm water is wanted.", {})]], size=10.3, spacing=1.05)
pic(s, A3 / "snow.png", 6.75, 5.75, 0.8)
text(s, 7.65, 5.75, 4.9, 0.95, [[("Subtropical ", {"bold": True, "color": INK}), ("(sub-zero to 35 °C, annual mean 10–20 °C): one to two showers a day, 37–40 °C in cold months and room temperature in summer.", {})]], size=10.3, spacing=1.05)

# 17 · Smart application -------------------------------------------------------
s = new_slide(17, "04 · SOFTWARE & AI", [("Smart ", INK), ("application", BLUE)], "The dashboard that ships with the shower — neumorphic, real-time, explainable.")
pic(s, phone_img("monitor"), 0.35, 1.95, 2.55)
pic(s, phone_img("home"), 2.35, 1.75, 2.8)
pic(s, phone_img("shower"), 4.6, 1.95, 2.55)
feat = [("shield", "Live water quality", "pH, turbidity, residual chlorine and temperature streamed in real time, each with its own threshold."),
        ("sparkle", "Skin score & XAI", "One skin score with per-factor attribution — the app names the water parameters behind every recommendation."),
        ("calendar", "Smart scheduling", "Bathing habits and local climate data tune shower frequency and the water budget per session."),
        ("temp", "Temperature control", "Set and hold the bathing temperature from the phone before stepping in.")]
for i, (ic, t, d) in enumerate(feat):
    y = 2.0 + i * 1.2
    card(s, 7.45, y, 5.28, 1.0, r=0.22)
    well(s, ic, 7.6, y + 0.12, 0.76)
    text(s, 8.55, y + 0.1, 4.0, 0.3, t, size=13.5, bold=True, color=INK)
    text(s, 8.55, y + 0.42, 4.0, 0.55, d, size=9.8, color=INK2, spacing=1.03)

# 18 · AI dermatology assistant ------------------------------------------------
s = new_slide(18, "04 · SOFTWARE & AI", [("AI dermatology ", INK), ("assistant", BLUE)],
              "Water quality and skin health, read together — so every shower supports the user's skin.")
rer = [("robot", "Read", "Skin condition data from the user, water data from the sensors."),
       ("chart", "Explain", "Which water parameters are affecting dryness, irritation or oiliness."),
       ("sparkle", "Recommend", "A personalised skincare and shower routine, updated as data changes.")]
for i, (ic, t, d) in enumerate(rer):
    x = 0.6 + i * 2.95
    card(s, x, 2.15, 2.7, 2.55)
    well(s, ic, x + 0.8, 2.35, 1.1)
    text(s, x + 0.2, 3.55, 2.3, 0.35, t, size=17, bold=True, color=DEEP, align="c")
    text(s, x + 0.2, 3.95, 2.3, 0.7, d, size=10, color=INK2, align="c", spacing=1.05)
    if i < 2:
        arrow(s, x + 2.74, 3.3, 0.18, 0.28)
card(s, 0.6, 5.05, 8.6, 1.7)
text(s, 0.85, 5.2, 8.1, 0.3, "WHY EXPLAINABILITY IS PART OF THE PRODUCT", size=9.5, bold=True, color=AQUA, charsp=150)
text(s, 0.85, 5.52, 8.1, 1.2, "A recommendation the user cannot interrogate is one they will not follow. AQUENT ships attribution bars and a "
     "confidence score with every output — the design decision that raised adoption by 34% (Coutts et al., 2023) and adherence "
     "by 41% with conversational AI (Peng et al., 2023).", size=11, color=INK2, spacing=1.08)
pic(s, phone_img("xai"), 9.55, 1.55, 3.05)

# 19 · Evidence base ----------------------------------------------------------
s = new_slide(19, "05 · EVIDENCE & OPENNESS", [("Evidence ", INK), ("base", BLUE)], "Screened from 847 records down to 21 Q1-indexed articles.")
card(s, 0.6, 2.1, 7.1, 4.65)
text(s, 0.85, 2.3, 6.6, 0.3, "KEY FIGURES FROM THE LITERATURE (%)", size=9.5, bold=True, color=AQUA, charsp=150)
cd = CategoryChartData()
cd.categories = ["Adherence gain from AI chat", "Adoption gain from XAI", "Chlorine removed by carbon filter", "Eczema risk on hard water"]
cd.add_series("Percent", (41, 34, 95, 87))
gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.8), Inches(2.65), Inches(6.7), Inches(3.95), cd)
ch = gf.chart
ch.has_legend = False
ch.has_title = False
plot = ch.plots[0]
plot.gap_width = 70
plot.has_data_labels = True
dl = plot.data_labels
dl.number_format, dl.number_format_is_linked = '0"%"', False
dl.position = XL_LABEL_POSITION.OUTSIDE_END
dl.font.size, dl.font.bold, dl.font.color.rgb = Pt(12), True, rgb(DEEP)
ser = plot.series[0]
ser.format.fill.solid()
ser.format.fill.fore_color.rgb = rgb(BLUE)
for idx, col in ((2, AQUA), (3, AQUA)):
    pt = ser.points[idx]
    pt.format.fill.solid()
    pt.format.fill.fore_color.rgb = rgb(col)
va = ch.value_axis
va.maximum_scale, va.minimum_scale = 110, 0
va.has_major_gridlines = True
va.major_gridlines.format.line.color.rgb = rgb("D5DEEA")
va.tick_labels.font.size, va.tick_labels.font.color.rgb = Pt(9), rgb(MUTED)
va.format.line.fill.background()
ca = ch.category_axis
ca.tick_labels.font.size, ca.tick_labels.font.color.rgb = Pt(10.5), rgb(INK)
ca.format.line.color.rgb = rgb("C9D4E4")
card(s, 8.0, 2.1, 4.73, 4.65)
text(s, 8.25, 2.3, 4.2, 0.3, "HOW THE BASE WAS BUILT", size=9.5, bold=True, color=AQUA, charsp=150)
for i, (n, lab) in enumerate((("847", "records screened"), ("21", "final Q1-indexed articles"))):
    card(s, 8.25 + i * 2.2, 2.75, 2.0, 1.15, kind="inset", r=0.22)
    text(s, 8.25 + i * 2.2, 2.8, 2.0, 0.6, n, size=28, bold=True, color=DEEP, font=FONT_H, align="c")
    text(s, 8.25 + i * 2.2, 3.4, 2.0, 0.45, lab, size=9, color=INK2, align="c")
arrow(s, 10.25, 3.18, 0.16, 0.28, AQUA)
text(s, 8.25, 4.15, 4.25, 2.5, ["Duplicates and off-topic work removed, following PRISMA 2020 reporting.",
     "Sources span water-quality standards (WHO guidelines), dermatology (hard water and eczema), filtration chemistry "
     "(activated carbon, zeolite, chitosan, biochar) and human factors (explainable AI, adherence)."],
     size=10.8, color=INK2, spacing=1.08, space_after=6)

# 20 · Next steps -------------------------------------------------------------
s = new_slide(20, "05 · EVIDENCE & OPENNESS", [("Next ", INK), ("steps", BLUE)], "What turns the prototype into a validated product.")
nxt = [("turbidity", "Laboratory validation", "Removal efficiency measured per layer against bathing-water standards."),
       ("filter", "Cartridge service life", "How long each media bed lasts, plus a safe disposal or composting route for spent media."),
       ("unit_face", "Household field trial", "Litres actually saved per person per day, measured in real bathrooms across both climates."),
       ("robot", "Dermatological testing", "The AI assistant evaluated with a clinical partner before any health claim is made.")]
for i, (ic, t, d) in enumerate(nxt):
    x = 0.6 + i * 3.08
    card(s, x, 2.3, 2.83, 4.3)
    text(s, x + 0.25, 2.45, 1.2, 0.8, f"0{i + 1}", size=34, bold=True, color="C9D6EA", font=FONT_H)
    well(s, ic, x + 0.72, 3.2, 1.4)
    text(s, x + 0.2, 4.85, 2.43, 0.4, t, size=14, bold=True, color=INK, align="c")
    text(s, x + 0.2, 5.28, 2.43, 1.2, d, size=10.3, color=INK2, align="c", spacing=1.06)

# 21 · Partnership ------------------------------------------------------------
s = new_slide(21, "PARTNERS", [("Our ", INK), ("partnership", BLUE)], "Collaborators supporting research, validation and testing.")
parts = [("image61", "image25"), ("image63", "image20"), ("image63", "image21"), ("image62", "image26"), ("image64", "image19")]
for i, (ph, lg) in enumerate(parts):
    x = 0.6 + i * 2.46
    card(s, x, 2.1, 2.23, 4.65)
    pic(s, photo_round(MED / f"{ph}.png", 1.93, 2.75, 0.2), x + 0.15, 2.25, 1.93)
    im = Image.open(MED / f"{lg}.png")
    w = min(1.7, 0.95 * im.width / im.height)
    h = w * im.height / im.width
    pic(s, MED / f"{lg}.png", x + (2.23 - w) / 2, 5.35 + (0.95 - h) / 2, w)

# 22 · Conclusion & copyright --------------------------------------------------
s = new_slide(22, "CONCLUSION", [("Conclusion ", INK), ("and copyright", BLUE)])
conc = [("recycle", "Water saved at the source", "Greywater is treated at the point of use and returned to the shower — no tank, no plumbing rework."),
        ("shield", "Quality proven, not assumed", "pH, turbidity, ORP and temperature gate every litre before it is reused."),
        ("leaf", "Circular, local filter media", "Six layers from agricultural and household waste that can be disposed of or composted safely."),
        ("robot", "Skin-aware and explainable", "An AI dermatology assistant that shows which water parameters drive every recommendation.")]
for i, (ic, t, d) in enumerate(conc):
    y = 1.75 + i * 1.27
    card(s, 0.6, y, 7.0, 1.05, r=0.22)
    well(s, ic, 0.76, y + 0.13, 0.8)
    text(s, 1.8, y + 0.12, 5.6, 0.32, t, size=14, bold=True, color=INK)
    text(s, 1.8, y + 0.45, 5.6, 0.55, d, size=10.5, color=INK2, spacing=1.04)
card(s, 8.0, 1.75, 4.73, 5.0)
text(s, 8.25, 1.95, 4.2, 0.3, "COPYRIGHT & IP", size=9.5, bold=True, color=AQUA, charsp=150)
card(s, 8.25, 2.35, 4.23, 4.15, kind="inset", r=0.22)
pic(s, BR / "logo_grad.png", 9.35, 3.95, 2.05)
text(s, 8.45, 4.55, 3.83, 0.6, "© 2026 Team AQUENT", size=11, color=INK2, align="c")

# 23 · Thank you --------------------------------------------------------------
s = prs.slides.add_slide(BLANK)
pic(s, bg_brand(), 0, 0, SW_IN, SH_IN)
FX_START[s.slide_id] = 1
aura_orb(s, 9.8, 3.7, 7.5, (255, 255, 255))
deco(s, [("deco_sphere_white", 12.1, 0.3, 0.9), ("deco_ring", 0.25, 6.0, 1.1), ("deco_drops", 5.7, 5.9, 1.3)])
pic(s, BR / "logo_white.png", 0.8, 1.2, 4.6)
text(s, 0.8, 2.6, 6.2, 1.0, "Thank you", size=54, bold=True, color="FFFFFF", font=FONT_H)
text(s, 0.8, 3.65, 5.8, 0.9, "Cleaner water, healthier skin, a more sustainable planet — one shower at a time.", size=15, color="EAF4FF", spacing=1.1)
text(s, 0.8, 4.75, 5.8, 0.3, "TEAM AQUENT", size=10, bold=True, color="FFFFFF", charsp=150)
text(s, 0.8, 5.05, 5.8, 0.8, "Dhafa Krisna Bagus Harjanto · Lais Arsalan Farzana Hartanto · Zharifa Laduna Faiza · Kinan Hayu Prima Andini · "
     "Joanna Dharmarina Saputra", size=11, color="EAF4FF", spacing=1.1)
pic(s, card_img(5.6, 4.3, 0.35, fill=(236, 243, 252)), 7.0 - M_IN, 1.55 - M_IN, 5.6 + 2 * M_IN, 4.3 + 2 * M_IN)
pic(s, photo_round(MED / "image12.png", 5.2, 2.9, 0.25), 7.2, 1.75, 5.2)
pic(s, A3 / "unit_hero.png", 11.0, 4.55, 1.3)
for i, sdg in enumerate(("image16", "image15", "image27", "image17")):
    pic(s, MED / f"{sdg}.png", 7.25 + i * 0.72, 4.95, 0.6)


# =========================================================== FUTURISTIC FX ===
# Morph transitions, staggered "rise" entrances, looping float on 3D props and
# a breathing pulse on the blue aura orbs. All written as native PowerPoint XML.
from lxml import etree

NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
TRANS = (
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
    '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" '
    'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p159">'
    '<p:transition xmlns:p="%s" spd="slow" p14:dur="1400"><p159:morph option="byObject"/></p:transition>'
    '</mc:Choice><mc:Fallback><p:transition xmlns:p="%s" spd="slow"><p:fade/></p:transition></mc:Fallback>'
    '</mc:AlternateContent>' % (NS_P, NS_P))


class Ids:
    def __init__(self):
        self.n = 2

    def __call__(self):
        self.n += 1
        return self.n


def _target(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def fx_entrance(nid, spid, delay, dur=650):
    return (f'<p:par><p:cTn id="{nid()}" presetID="42" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="withEffect">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
            f'<p:set><p:cBhvr><p:cTn id="{nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>{_target(spid)}'
            f'<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
            f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{nid()}" dur="{dur}"/>{_target(spid)}</p:cBhvr></p:animEffect>'
            f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{nid()}" dur="{dur}" decel="100000" fill="hold"/>{_target(spid)}'
            f'<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>'
            f'<p:tav tm="0"><p:val><p:strVal val="#ppt_y+0.04"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>'
            f'</p:tavLst></p:anim></p:childTnLst></p:cTn></p:par>')


def fx_float(nid, spid, delay, amp=0.012, dur=2600):
    return (f'<p:par><p:cTn id="{nid()}" presetID="0" presetClass="path" presetSubtype="0" repeatCount="indefinite" accel="50000" decel="50000" autoRev="1" fill="hold" grpId="1" nodeType="withEffect">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
            f'<p:animMotion origin="layout" path="M 0 0 L 0 -{amp} E" pathEditMode="relative" ptsTypes="AA"><p:cBhvr>'
            f'<p:cTn id="{nid()}" dur="{dur}" fill="hold"/>{_target(spid)}<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst>'
            f'</p:cBhvr><p:rCtr x="0" y="0"/></p:animMotion></p:childTnLst></p:cTn></p:par>')


def fx_pulse(nid, spid, delay, dur=3200):
    return (f'<p:par><p:cTn id="{nid()}" presetID="6" presetClass="emph" presetSubtype="0" repeatCount="indefinite" accel="50000" decel="50000" autoRev="1" fill="hold" grpId="1" nodeType="withEffect">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
            f'<p:animScale><p:cBhvr><p:cTn id="{nid()}" dur="{dur}" fill="hold"/>{_target(spid)}</p:cBhvr><p:by x="112000" y="112000"/></p:animScale>'
            f'</p:childTnLst></p:cTn></p:par>')


def apply_fx(slide, start):
    nid = Ids()
    pars, blds = [], []
    step, delay = 55, 150
    for sh in list(slide.shapes)[start:]:
        spid = sh.shape_id
        if sh.name.startswith("FX_PULSE"):
            pars.append(fx_pulse(nid, spid, 0))
            continue
        pars.append(fx_entrance(nid, spid, min(delay, 2200)))
        if sh.name.startswith("FX_FLOAT"):
            pars.append(fx_float(nid, spid, min(delay, 2200) + 700))
        if sh.shape_type != 13:  # text boxes / autoshapes need a build entry
            blds.append(f'<p:bldP spid="{spid}" grpId="0" animBg="1"/>')
        delay += step
    sld = slide._element
    anchor = sld.find(qn("p:clrMapOvr"))
    if anchor is None:
        anchor = sld.find(qn("p:cSld"))
    t = etree.fromstring(TRANS)
    anchor.addnext(t)
    if not pars:
        return
    xml = (f'<p:timing xmlns:p="{NS_P}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
           f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
           f'<p:par><p:cTn id="{nid()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
           f'<p:par><p:cTn id="{nid()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
           + "".join(pars) +
           '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
           '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
           '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
           '</p:childTnLst></p:cTn></p:par></p:tnLst>'
           + (f'<p:bldLst>{"".join(blds)}</p:bldLst>' if blds else '') + '</p:timing>')
    t.addnext(etree.fromstring(xml))


for sl in prs.slides:
    apply_fx(sl, FX_START.get(sl.slide_id, len(sl.shapes)))

prs.save(OUT)
print("saved", OUT, len(prs.slides), "slides")
