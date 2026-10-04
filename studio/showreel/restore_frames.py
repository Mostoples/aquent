"""Restore the Blender film frames from the archive videos (visually lossless, >50 dB PSNR).
   python showreel/restore_frames.py      ->  showreel/build/film/f_0000..1487.png + film_en/f_0487..1087.png
Needed before film_video.py / ad_vertical.py / compose.py (film highlight) can run again."""
import pathlib, subprocess, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compose import FFMPEG, B  # noqa: E402

for name, start in (("film_frames_0000-1487", 0), ("film_en_frames_0487-1087", 487)):
    out = B / ("film" if start == 0 else "film_en")
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(B / "archive" / f"{name}.mkv"), "-start_number", str(start),
                    str(out / "f_%04d.png")], check=True)
    print("restored", out, len(list(out.glob("f_*.png"))), "frames")
