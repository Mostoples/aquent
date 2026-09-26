"""
Build an editable CapCut project for the AQUENT showreel with capcut-cli.

Uses the clean scene clips (no burned-in titles) from compose.py, adds the titles as
native CapCut text layers, dissolve transitions and the soundtrack, then stages all
media inside the draft folder so the project is self-contained.
"""
import json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
B = ROOT / "showreel/build"
NAME = "AQUENT Neumorph Showreel"
CAPCUT = shutil.which("capcut") or shutil.which("capcut.cmd") or "capcut"
sys.path.insert(0, str(ROOT / "showreel"))
from compose import FFMPEG, SCENES  # noqa: E402

TITLES = [("AQUENT", "AIoT Smart Shower", 0)] + [
    (sc["chip"], " ".join(t for t, _ in sc["title"]), i + 1) for i, sc in enumerate(SCENES)
] + [("AQUENT", "Air lebih bersih, kulit lebih sehat, bumi lebih lestari.", None)]


def run(*args):
    r = subprocess.run([CAPCUT, *map(str, args)], capture_output=True, text=True, shell=CAPCUT.endswith(".cmd"))
    if r.returncode not in (0, 1):
        sys.exit(f"capcut {args[0]} failed:\n{r.stdout}\n{r.stderr}")
    return r.stdout


def main():
    clips = json.loads((B / "clips.json").read_text())
    video, text, ops, t = [], [], [], 0.0
    for k, (path, dur) in enumerate(clips):
        p = pathlib.Path(path)
        clean = p.parent / "clean" / p.name
        ref = f"clip{k}"
        video.append({"path": str(clean), "start": round(t, 3), "duration": round(dur, 3), "ref": ref})
        if k < len(clips) - 1:
            ops.append({"op": "transition", "target": ref, "slug": "mix", "duration": 0.5})
        chip, title, idx = TITLES[k]
        # scenes alternate: phone right -> text left (x<0), phone left -> text right (x>0)
        x = -0.42 if (idx is None or idx == 0 or (idx - 1) % 2 == 0) else 0.44
        if k == 0:
            x = 0.3
        label = f"{chip}\n{title}" if 0 < k < len(clips) - 1 else title
        text.append({"text": label, "start": round(t + 0.45, 3), "duration": round(dur - 0.75, 3),
                     "fontSize": 10 if 0 < k < len(clips) - 1 else 13, "color": "#16233F", "x": x, "y": 0.12})
        t += dur
    spec = {
        "name": NAME, "width": 1920, "height": 1080, "fps": 30, "ratio": "16:9",
        "tracks": [
            {"type": "video", "items": video},
            {"type": "text", "items": text},
            {"type": "audio", "items": [{"path": str(B / "music.wav"), "start": 0, "duration": round(t, 3), "volume": 0.9}]},
        ],
        "operations": ops,
    }
    spec_path = B / "capcut_spec.json"
    spec_path.write_text(json.dumps(spec, indent=1))
    old = pathlib.Path.home() / "AppData/Local/CapCut/User Data/Projects/com.lveditor.draft" / NAME
    if old.exists():  # rebuild our own draft from scratch
        shutil.rmtree(old)
    out = json.loads(run("compile", spec_path))
    draft = out.get("draft_path") or out.get("draft") or out.get("path")
    print("draft:", draft)
    print(run("lint", draft, "--fix", "--max-cue-secs", 30, "--max-chars", 80))
    print(run("info", draft, "-H"))
    run("render", draft, "--out", B / "capcut_preview.mp4", "--scale", 0.5, "--ffmpeg-cmd", FFMPEG)
    print("preview:", B / "capcut_preview.mp4")


if __name__ == "__main__":
    main()
