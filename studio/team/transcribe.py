"""Word-level transcripts of the team footage (faster-whisper, CPU int8) -> team/transcripts.json
   python team/transcribe.py"""
import json, pathlib
from faster_whisper import WhisperModel

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "FOTO TIM AQUENT/VIDEO"
PROMPT = ("AQUENT smart shower. Team: Dhafa Krisna Bagus Harjanto (CEO), Lais Arsalan Farzana Hartanto (CTO), "
          "Zharifa Laduna Faiza (COO), Joanna Dharmarina Saputra (CPO), Kinan Hayu Prima Andini (CMO). "
          "UNESCO, World Health Organization, water crisis, groundwater, bathing.")
m = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
res = {}
for v in sorted(SRC.iterdir()):
    segs, info = m.transcribe(str(v), language="en", vad_filter=True, word_timestamps=True, beam_size=5, initial_prompt=PROMPT)
    out = []
    for s in segs:
        out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                    "words": [(round(w.start, 2), round(w.end, 2), w.word) for w in s.words]})
        print(f"{v.name} [{s.start:6.2f}-{s.end:6.2f}] {s.text.strip()}", flush=True)
    res[v.name] = out
(ROOT / "team/transcripts.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
