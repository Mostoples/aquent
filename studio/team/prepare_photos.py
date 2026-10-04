"""Team appreciation assets for the web page (app/team.html).
   python team/prepare_photos.py
Reads "FOTO TIM AQUENT/" (iPhone HEIC portraits + WhatsApp collaboration photos), crops each portrait
to 4:5 around the detected face and writes WebP files to app/assets/team/."""
import pathlib
import cv2
import numpy as np
import pillow_heif
from PIL import Image, ImageOps

pillow_heif.register_heif_opener()
ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "FOTO TIM AQUENT"
OUT = ROOT / "app/assets/team"
OUT.mkdir(parents=True, exist_ok=True)

# member id -> (folder, formal photo, lab-coat photo)
PORTRAITS = {
    "dhafa": ("DHAFA", "IMG_9922", "IMG_9929"),
    "lais": ("ARSA", "IMG_9909", "IMG_9917"),
    "zharifa": ("ZHIFA", "IMG_9878", "IMG_9937"),
    "joanna": ("JOANNA", "IMG_9901", "IMG_9897"),
    "kinan": ("KINAN", "IMG_9886", "IMG_9951"),
}
# collaboration / journey photos (Aquent Colab), in display order
GALLERY = [
    ("19.48.40 (1)", "product"), ("19.48.41 (2)", "enuma"), ("19.42.06", "sman4"), ("19.41.55", "sman4_meet"),
    ("19.42.15", "sman4_talk"), ("19.42.18", "sman4_green"), ("19.48.27 (1)", "clovers_talk"),
    ("19.48.28 (1)", "clovers"), ("19.48.29 (2)", "clovers_in"), ("19.48.42", "enuma2"),
]
FACE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def load(p):
    return ImageOps.exif_transpose(Image.open(p)).convert("RGB")


def portrait(im, out, w=900):
    g = cv2.cvtColor(np.array(im.resize((im.width // 4, im.height // 4))), cv2.COLOR_RGB2GRAY)
    faces = FACE.detectMultiScale(g, 1.1, 6, minSize=(40, 40))
    if len(faces):
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3]) * 4
        cx, cy, fs = x + fw / 2, y + fh / 2, fh
    else:  # fallback: centre / upper third
        cx, cy, fs = im.width / 2, im.height * 0.33, im.height * 0.08
    ch = min(im.height, fs * 6.2)          # head-to-waist framing
    cw = ch * 0.8
    top = max(0, min(im.height - ch, cy - ch * 0.24))
    left = max(0, min(im.width - cw, cx - cw / 2))
    crop = im.crop((int(left), int(top), int(left + cw), int(top + ch))).resize((w, int(w * 1.25)), Image.LANCZOS)
    crop.save(out, "WEBP", quality=84, method=6)
    return len(faces) > 0


def main():
    for mid, (folder, a, b) in PORTRAITS.items():
        for tag, name in (("formal", a), ("lab", b)):
            ok = portrait(load(SRC / folder / f"{name}.HEIC"), OUT / f"{mid}_{tag}.webp")
            print(mid, tag, "face" if ok else "FALLBACK")
    for stamp, tag in GALLERY:
        p = SRC / "Aquent Colab" / f"WhatsApp Image 2026-09-26 at {stamp}.jpeg"
        im = load(p)
        im.thumbnail((1400, 1400), Image.LANCZOS)
        im.save(OUT / f"journey_{tag}.webp", "WEBP", quality=82, method=6)
        print("journey", tag, im.size)


if __name__ == "__main__":
    main()
