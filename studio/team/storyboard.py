"""Visual storyboard for the team intro video -> team/storyboard.jpg (for client approval)."""
import io, pathlib, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "showreel"))
from compose import FFMPEG  # noqa: E402

FT = str(ROOT / "showreel/fonts/PlusJakartaSans.ttf")
f = lambda s, w="Bold": (lambda F: (F.set_variation_by_name(w), F)[1])(ImageFont.truetype(FT, s))
V = ROOT / "FOTO TIM AQUENT/VIDEO"
T = ROOT / "app/assets/team"


def grab(path, t, rot=False):
    vf = "transpose=2," if rot else ""
    b = subprocess.run([FFMPEG, "-v", "error", "-ss", str(t), "-i", str(path), "-frames:v", "1", "-vf", vf + "scale=480:-2",
                        "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True).stdout
    return Image.open(io.BytesIO(b)).convert("RGB")


def fit(im, w, h):
    return ImageOps.fit(im, (w, h), Image.LANCZOS)


SCENES = [
    ("0", "0:00", "Logo intro 3D", "intro/concept/A3_tetes_t4.2.png", None),
    ("1-2", "0:05", "Title · Meet AQUENT → 01 Meet the Team", "team_collage", None),
    ("3", "0:13", "CEO Dhafa (+ CTO, COO, CPO, CMO)", V / "IMG_0130.MOV", 7),
    ("3", "", "CMO Kinan — rotated upright", V / "28339c9805bd41b391a27bdd25fddb5e.mov", 5),
    ("5", "1:19", "Problem · water crisis + data callouts", V / "IMG_0172.MOV", 18),
    ("6", "1:51", "Problem · climate change", V / "IMG_0175.MOV", 8),
    ("7", "2:14", "Groundwater → 'we created a shower'", V / "IMG_0179.MOV", 14),
    ("8", "2:36", "Lais · 60–80 L per bath, save 20–50%", V / "IMG_0198.MOV", 6),
    ("9", "2:54", "03 The Solution · 3D process film", "app/assets/3d/proto_inuse.png", None),
    ("9", "", "Prototype + app", "galeri", None),
    ("10", "3:32", "04 The Journey · Road to IID Jakarta", T / "journey_enuma.webp", None),
    ("11", "3:46", "Outro · Thank you + names", "app/assets/brand/logo_grad.png", None),
]
W, H, CW, CH = 4, 3, 480, 270
sheet = Image.new("RGB", (W * (CW + 30) + 30, 120 + H * (CH + 110)), (233, 239, 247))
d = ImageDraw.Draw(sheet)
d.text((30, 30), "MEET AQUENT — storyboard video perkenalan tim & produk (±3:54)", font=f(34, "ExtraBold"), fill=(22, 35, 63))
for i, (no, t, cap, src, sec) in enumerate(SCENES):
    x, y = 30 + (i % W) * (CW + 30), 110 + (i // W) * (CH + 110)
    if isinstance(src, pathlib.Path) and src.suffix.lower() in (".mov", ".mp4"):
        im = grab(src, sec, rot=src.suffix == ".mov" and src.stem.startswith("2833"))
    elif src == "team_collage":
        im = Image.new("RGB", (CW, CH), (233, 239, 247))
        for k, m in enumerate(["dhafa", "lais", "zharifa", "joanna", "kinan"]):
            im.paste(fit(Image.open(T / f"{m}_lab.webp").convert("RGB"), 92, 115), (8 + k * 94, 120))
        ImageDraw.Draw(im).text((90, 40), "01 · Meet the Team", font=f(36, "ExtraBold"), fill=(47, 123, 255))
    elif src == "galeri":
        im = Image.open(sorted((ROOT / "galeri").glob("*.jpeg"))[1]).convert("RGB")
    else:
        im = Image.open(ROOT / src if isinstance(src, str) else src).convert("RGBA")
        bg = Image.new("RGBA", im.size, (233, 239, 247, 255))
        bg.alpha_composite(im)
        im = bg.convert("RGB")
        if "logo" in str(src):
            im = ImageOps.pad(im, (CW, CH), color=(233, 239, 247))
    sheet.paste(fit(im, CW, CH), (x, y))
    d.rounded_rectangle((x + 10, y + 10, x + 70, y + 46), 18, fill=(47, 123, 255))
    d.text((x + 22, y + 14), no, font=f(22, "ExtraBold"), fill="white")
    d.text((x, y + CH + 12), (t + "  ·  " if t else "") + cap, font=f(21, "Bold"), fill=(22, 35, 63))
sheet.save(ROOT / "team/storyboard.jpg", quality=88)
print("saved team/storyboard.jpg")
